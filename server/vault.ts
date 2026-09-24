import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// =========================================================
// PRIVATE VAULT STORAGE
// =========================================================

const VAULT_BASE_DIR = path.resolve(
  process.cwd(),
  'storage',
  'vault',
);

const DOCUMENTS_VAULT = path.join(
  VAULT_BASE_DIR,
  'documents',
);

const EVIDENCE_VAULT = path.join(
  VAULT_BASE_DIR,
  'evidence',
);

// Ensure private vault directories exist.
fs.mkdirSync(DOCUMENTS_VAULT, { recursive: true });
fs.mkdirSync(EVIDENCE_VAULT, { recursive: true });

// =========================================================
// AES-256-GCM ENCRYPTION
// =========================================================

const VAULT_ENCRYPTION_ALGORITHM = 'aes-256-gcm';

// 12 bytes is the recommended IV size for AES-GCM.
const VAULT_IV_LENGTH = 12;

// AES-GCM authentication tag.
const VAULT_AUTH_TAG_LENGTH = 16;

// Binary envelope marker + version.
// Encrypted vault files begin with this marker.
const VAULT_MAGIC = Buffer.from('SIMSVAULT1', 'utf8');

function getVaultEncryptionKey(): Buffer {
  const rawKey = process.env.SIMS_VAULT_ENCRYPTION_KEY;

  if (!rawKey) {
    throw new Error(
      'SIMS_VAULT_ENCRYPTION_KEY is not configured. ' +
      'The secure vault cannot start without its encryption key.',
    );
  }

  const normalizedKey = rawKey.trim();

  // 64 hexadecimal characters = 32 bytes = AES-256 key.
  if (
    normalizedKey.length !== 64 ||
    !/^[0-9a-fA-F]{64}$/.test(normalizedKey)
  ) {
    throw new Error(
      'SIMS_VAULT_ENCRYPTION_KEY must be exactly 64 hexadecimal characters ' +
      '(32 bytes / 256 bits).',
    );
  }

  return Buffer.from(normalizedKey, 'hex');
}

/**
 * Encrypts the original plaintext file using AES-256-GCM.
 *
 * Stored binary format:
 *
 * [MAGIC][IV][AUTH TAG][CIPHERTEXT]
 *
 * The authentication tag allows us to detect unauthorized
 * modification of the encrypted vault object.
 */
function encryptVaultBuffer(buffer: Buffer): Buffer {
  const key = getVaultEncryptionKey();

  const iv = crypto.randomBytes(VAULT_IV_LENGTH);

  const cipher = crypto.createCipheriv(
    VAULT_ENCRYPTION_ALGORITHM,
    key,
    iv,
    {
      authTagLength: VAULT_AUTH_TAG_LENGTH,
    },
  );

  const ciphertext = Buffer.concat([
    cipher.update(buffer),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return Buffer.concat([
    VAULT_MAGIC,
    iv,
    authTag,
    ciphertext,
  ]);
}

/**
 * Decrypts a vault object.
 *
 * Authentication is performed by AES-GCM before the
 * plaintext is returned. Any modified ciphertext, IV,
 * authentication tag, or key results in failure.
 */
function decryptVaultBuffer(encryptedBuffer: Buffer): Buffer {
  const minimumLength =
    VAULT_MAGIC.length +
    VAULT_IV_LENGTH +
    VAULT_AUTH_TAG_LENGTH;

  if (encryptedBuffer.length < minimumLength) {
    throw new Error(
      'Invalid secure vault object: encrypted payload is incomplete.',
    );
  }

  const magic = encryptedBuffer.subarray(
    0,
    VAULT_MAGIC.length,
  );

  if (!magic.equals(VAULT_MAGIC)) {
    throw new Error(
      'Invalid secure vault object: unsupported vault format.',
    );
  }

  const ivStart = VAULT_MAGIC.length;

  const ivEnd =
    ivStart + VAULT_IV_LENGTH;

  const tagStart = ivEnd;

  const tagEnd =
    tagStart + VAULT_AUTH_TAG_LENGTH;

  const iv = encryptedBuffer.subarray(
    ivStart,
    ivEnd,
  );

  const authTag = encryptedBuffer.subarray(
    tagStart,
    tagEnd,
  );

  const ciphertext = encryptedBuffer.subarray(
    tagEnd,
  );

  const key = getVaultEncryptionKey();

  const decipher = crypto.createDecipheriv(
    VAULT_ENCRYPTION_ALGORITHM,
    key,
    iv,
    {
      authTagLength: VAULT_AUTH_TAG_LENGTH,
    },
  );

  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
}

// =========================================================
// ALLOWED FILE TYPES
// =========================================================

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',

  'application/msword',

  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',

  'image/jpeg',
  'image/png',
  'image/webp',
  'image/tiff',

  'audio/mpeg',
  'audio/wav',

  'video/mp4',

  'application/zip',
  'application/x-zip-compressed',

  // Generic binary payloads are required for forensic material.
  'application/octet-stream',
]);

const DANGEROUS_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.com',
  '.msi',
  '.scr',

  '.vbs',
  '.vbe',

  '.js',
  '.jse',

  '.ws',
  '.wsf',
  '.wsc',
  '.wsh',

  '.ps1',
  '.ps1xml',
  '.ps2',
  '.psc1',
  '.psc2',

  '.sh',
  '.bash',
  '.csh',
  '.ksh',

  '.py',
  '.php',
  '.pl',
  '.cgi',

  '.dll',
  '.so',
]);

const SAFE_EXTENSIONS = new Set([
  '.pdf',
  '.doc',
  '.docx',
  '.txt',
  '.csv',
  '.json',
  '.md',

  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.tiff',

  '.mp3',
  '.wav',
  '.mp4',

  '.zip',
  '.tar',
  '.gz',

  '.dat',
  '.raw',
  '.bin',
  '.img',
  '.dd',
  '.e01',
]);

// =========================================================
// TYPES
// =========================================================

export interface VaultFileMetadata {
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  sha256Hash: string;
}

export interface VaultIntegrityResult {
  verified: boolean;
  calculatedHash: string;
  /** Present only after AES-GCM authentication and a successful hash match. */
  plaintext?: Buffer;
  /** Operational failures are deliberately distinct from integrity mismatches. */
  failure?: 'FILE_NOT_FOUND' | 'VAULT_READ_OR_DECRYPTION_FAILED';
}

// =========================================================
// FILE TYPE VALIDATION
// =========================================================

export function validateFileType(
  originalName: string,
  buffer: Buffer,
  mimeType?: string,
): {
  valid: boolean;
  reason?: string;
} {
  const ext = path
    .extname(originalName)
    .toLowerCase();

  // -------------------------------------------------------
  // 1. Explicitly reject dangerous executable/script
  //    extensions.
  // -------------------------------------------------------

  if (DANGEROUS_EXTENSIONS.has(ext)) {
    return {
      valid: false,
      reason:
        `Security Violation: Executable and script extension '${ext}' ` +
        `is strictly prohibited in institutional evidence storage.`,
    };
  }

  // -------------------------------------------------------
  // 2. Reject empty payloads.
  // -------------------------------------------------------

  if (!buffer || buffer.length === 0) {
    return {
      valid: false,
      reason:
        'Security Violation: The uploaded file contains no data.',
    };
  }

  // -------------------------------------------------------
  // 3. Magic-byte inspection.
  //
  //    This catches executables renamed as PDFs/images/etc.
  // -------------------------------------------------------

  if (buffer.length >= 4) {
    const isMZ =
      buffer[0] === 0x4d &&
      buffer[1] === 0x5a;

    const isELF =
      buffer[0] === 0x7f &&
      buffer[1] === 0x45 &&
      buffer[2] === 0x4c &&
      buffer[3] === 0x46;

    if (isMZ || isELF) {
      return {
        valid: false,
        reason:
          'Security Violation: File is an executable, regardless of extension.',
      };
    }
  }

  // -------------------------------------------------------
  // 4. PDF signature validation.
  //
  //    A file named .pdf must actually begin with %PDF.
  // -------------------------------------------------------

  if (ext === '.pdf') {
    const isPDF =
      buffer.length >= 4 &&
      buffer[0] === 0x25 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x44 &&
      buffer[3] === 0x46;

    if (!isPDF) {
      return {
        valid: false,
        reason:
          'Security Violation: File is not a valid PDF document.',
      };
    }
  }

  // -------------------------------------------------------
  // 5. MIME validation.
  //
  //    If the browser/server reports an unsupported MIME,
  //    only recognizable forensic/document extensions are
  //    accepted.
  // -------------------------------------------------------

  if (
    mimeType &&
    !ALLOWED_MIME_TYPES.has(mimeType)
  ) {
    if (!SAFE_EXTENSIONS.has(ext)) {
      return {
        valid: false,
        reason:
          `Unsupported file type '${mimeType || ext}'. ` +
          'Allowed types: PDF, Word (DOC/DOCX), Text, CSV, JSON, ' +
          'Images, Audio/Video, Archives, and Forensic Disks.',
      };
    }
  }

  return {
    valid: true,
  };
}

// =========================================================
// SECURE VAULT STORAGE
// =========================================================

/**
 * Stores a file buffer in the private encrypted vault.
 *
 * Security flow:
 *
 * ORIGINAL BYTES
 *      ↓
 * SHA-256 fingerprint
 *      ↓
 * AES-256-GCM encryption
 *      ↓
 * ENCRYPTED BYTES ON DISK
 *
 * The SHA-256 hash is always calculated from the ORIGINAL
 * plaintext bytes, not the encrypted representation.
 */
export async function storeInVault(
  type: 'documents' | 'evidence',
  buffer: Buffer,
  originalName: string,
  mimeType: string = 'application/octet-stream',
): Promise<VaultFileMetadata> {
  const targetDir =
    type === 'documents'
      ? DOCUMENTS_VAULT
      : EVIDENCE_VAULT;

  if (!buffer || buffer.length === 0) {
    throw new Error(
      'Cannot store an empty file in the secure vault.',
    );
  }

  // -------------------------------------------------------
  // Calculate REAL SHA-256 from the ORIGINAL bytes.
  // -------------------------------------------------------

  const sha256Hash = crypto
    .createHash('sha256')
    .update(buffer)
    .digest('hex');

  // -------------------------------------------------------
  // Encrypt the original bytes before writing them to disk.
  // -------------------------------------------------------

  const encryptedBytes =
    encryptVaultBuffer(buffer);

  // -------------------------------------------------------
  // Sanitize original filename.
  // -------------------------------------------------------

  const safeBaseName = path
    .basename(originalName)
    .replace(
      /[^a-zA-Z0-9._-]/g,
      '_',
    );

  // -------------------------------------------------------
  // Generate private vault filename.
  // -------------------------------------------------------

  const storedFileName =
    `${sha256Hash.slice(0, 16)}_` +
    `${Date.now()}_` +
    `${safeBaseName}`;

  const targetFilePath = path.join(
    targetDir,
    storedFileName,
  );

  // -------------------------------------------------------
  // Final containment check before writing.
  // -------------------------------------------------------

  if (
    !isPathInsideVault(targetFilePath)
  ) {
    throw new Error(
      'Security violation: attempted vault path escaped the secure storage boundary.',
    );
  }

  // -------------------------------------------------------
  // Write ONLY encrypted bytes to private storage.
  // -------------------------------------------------------

  await fs.promises.writeFile(
    targetFilePath,
    encryptedBytes,
  );

  return {
    // Preserve the original filename for download/display.
    fileName: originalName,

    filePath: targetFilePath,

    // Report original plaintext size, not encrypted envelope size.
    fileSize: buffer.length,

    mimeType:
      mimeType || 'application/octet-stream',

    // Hash corresponds to the original plaintext bytes.
    sha256Hash,
  };
}

// =========================================================
// VAULT PATH SECURITY
// =========================================================

/**
 * Strictly determines whether a path is inside the private
 * vault directory.
 *
 * path.relative() prevents prefix-boundary attacks such as:
 *
 * /storage/vault
 *
 * matching:
 *
 * /storage/vault-attacker
 */
function isPathInsideVault(
  candidatePath: string,
): boolean {
  const base = path.resolve(
    VAULT_BASE_DIR,
  );

  const resolved = path.resolve(
    candidatePath,
  );

  const relative = path.relative(
    base,
    resolved,
  );

  if (
    relative === '' ||
    relative.startsWith('..') ||
    path.isAbsolute(relative)
  ) {
    return false;
  }

  return true;
}

// =========================================================
// SECURE FILE LOOKUP
// =========================================================

/**
 * Resolves a stored vault path only if:
 *
 * 1. It remains inside the private vault.
 * 2. It exists.
 * 3. It is a regular file.
 */
export function getVaultFilePath(
  storedPath: string,
): string | null {
  if (!storedPath) {
    return null;
  }

  const resolved = path.resolve(
    storedPath,
  );

  // -------------------------------------------------------
  // Prevent path traversal / vault escape.
  // -------------------------------------------------------

  if (
    !isPathInsideVault(resolved)
  ) {
    return null;
  }

  // -------------------------------------------------------
  // File must exist.
  // -------------------------------------------------------

  if (!fs.existsSync(resolved)) {
    return null;
  }

  // -------------------------------------------------------
  // Do not allow directories to be treated as files.
  // -------------------------------------------------------

  try {
    const stats =
      fs.statSync(resolved);

    if (!stats.isFile()) {
      return null;
    }
  } catch {
    return null;
  }

  return resolved;
}

// =========================================================
// SECURE VAULT READ / DECRYPTION
// =========================================================

/**
 * Reads an encrypted vault object and returns the original
 * plaintext bytes.
 *
 * This is the function that download routes should use.
 *
 * IMPORTANT:
 * The encrypted bytes on disk are never returned directly
 * to the client.
 */
export async function readFromVault(
  storedPath: string,
): Promise<Buffer> {
  const actualPath =
    getVaultFilePath(storedPath);

  if (!actualPath) {
    throw new Error(
      'Secure vault file was not found.',
    );
  }

  const encryptedBytes =
    await fs.promises.readFile(
      actualPath,
    );

  return decryptVaultBuffer(
    encryptedBytes,
  );
}

// =========================================================
// REAL SHA-256 INTEGRITY VERIFICATION
// =========================================================

/**
 * Reads the encrypted vault file, decrypts it, and calculates
 * SHA-256 from the ORIGINAL plaintext bytes.
 *
 * This provides the integrity verification mechanism:
 *
 * ENCRYPTED FILE ON DISK
 *        ↓
 * AES-GCM AUTHENTICATION
 *        ↓
 * ORIGINAL PLAINTEXT
 *        ↓
 * SHA-256
 *        ↓
 * COMPARE WITH REGISTERED HASH
 */
export async function verifyVaultFileIntegrity(
  storedPath: string,
  expectedHash: string,
): Promise<VaultIntegrityResult> {
  const actualPath =
    getVaultFilePath(storedPath);

  // -------------------------------------------------------
  // File missing or path invalid.
  // -------------------------------------------------------

  if (!actualPath) {
    return {
      verified: false,
      calculatedHash: '',
      failure: 'FILE_NOT_FOUND',
    };
  }

  try {
    // -----------------------------------------------------
    // Read encrypted bytes from disk.
    // -----------------------------------------------------

    const encryptedBytes =
      await fs.promises.readFile(
        actualPath,
      );

    // -----------------------------------------------------
    // Decrypt and authenticate.
    //
    // AES-GCM throws if the encrypted object has been
    // modified or the authentication tag is invalid.
    // -----------------------------------------------------

    const fileBytes =
      decryptVaultBuffer(
        encryptedBytes,
      );

    // -----------------------------------------------------
    // Calculate SHA-256 from ORIGINAL plaintext.
    // -----------------------------------------------------

    const calculatedHash =
      crypto
        .createHash('sha256')
        .update(fileBytes)
        .digest('hex');

    const normalizedExpected =
      String(expectedHash || '')
        .trim()
        .toLowerCase();

    const normalizedCalculated =
      calculatedHash
        .trim()
        .toLowerCase();

    // -----------------------------------------------------
    // Constant-time comparison where lengths match.
    // -----------------------------------------------------

    let verified = false;

    const expectedBuffer =
      Buffer.from(
        normalizedExpected,
        'utf8',
      );

    const calculatedBuffer =
      Buffer.from(
        normalizedCalculated,
        'utf8',
      );

    if (
      expectedBuffer.length ===
      calculatedBuffer.length
    ) {
      verified = crypto.timingSafeEqual(
        expectedBuffer,
        calculatedBuffer,
      );
    }

    return {
      verified,
      calculatedHash,
      ...(verified ? { plaintext: fileBytes } : {}),
    };
  } catch (error) {
    console.error(
      '[VAULT] Integrity verification failed:',
      error,
    );

    return {
      verified: false,
      calculatedHash: '',
      failure: 'VAULT_READ_OR_DECRYPTION_FAILED',
    };
  }
}
