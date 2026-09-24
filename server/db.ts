import 'dotenv/config';
import { Pool } from 'pg';
import { PGlite } from '@electric-sql/pglite';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { storeInVault } from './vault';
import { serializeAuditDetails } from './auditHash.ts';

// ================================================================
// SECURE DEMONSTRATION VAULT
// Must match server/vault.ts
// ================================================================

const VAULT_BASE_DIR = path.resolve(
  process.cwd(),
  'storage',
  'vault',
);

const EVIDENCE_VAULT_DIR = path.join(
  VAULT_BASE_DIR,
  'evidence',
);

const DOCUMENT_VAULT_DIR = path.join(
  VAULT_BASE_DIR,
  'documents',
);

if (!fs.existsSync(EVIDENCE_VAULT_DIR)) {
  fs.mkdirSync(EVIDENCE_VAULT_DIR, {
    recursive: true,
  });
}

if (!fs.existsSync(DOCUMENT_VAULT_DIR)) {
  fs.mkdirSync(DOCUMENT_VAULT_DIR, {
    recursive: true,
  });
}

// Demo seed files are stored in the same secure evidence
// vault that server/vault.ts validates and serves.
const UPLOAD_DIR = EVIDENCE_VAULT_DIR;

export {
  UPLOAD_DIR,
  EVIDENCE_VAULT_DIR,
  DOCUMENT_VAULT_DIR,
};

// ================================================================
// DATABASE ADAPTER
// ================================================================

type QueryableDatabase = {
  query: (text: string, values?: unknown[]) => Promise<any>;
  exec: (text: string) => Promise<void>;
};

const isTestDatabase = process.env.NODE_ENV === 'test';

class PostgreSqlDatabase implements QueryableDatabase {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({
      connectionString: databaseUrl,
      max: Number.parseInt(process.env.DATABASE_POOL_MAX || '10', 10),
      ssl: process.env.DATABASE_SSL === 'true'
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }

  query(text: string, values: unknown[] = []) {
    return this.pool.query(text, values);
  }

  async exec(text: string) {
    await this.pool.query(text);
  }
}

/*
 * PGlite is deliberately limited to NODE_ENV=test so automated tests remain
 * isolated. The running SIMS application has no in-memory fallback: a real
 * DATABASE_URL is required and connection failure is surfaced at startup.
 */
export const db: QueryableDatabase = isTestDatabase
  ? new PGlite() as unknown as QueryableDatabase
  : new PostgreSqlDatabase(process.env.DATABASE_URL || 'postgresql://invalid');

export async function initDatabase() {
  if (!isTestDatabase && !process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not configured. SIMS requires a PostgreSQL connection; no in-memory fallback is available.',
    );
  }

  console.log(`[DATABASE] Initializing ${isTestDatabase ? 'isolated test database' : 'PostgreSQL'} schema...`);

  // Tracks this idempotent baseline schema as an operational migration.
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.exec(`
    -- ============================================================
    -- USERS
    -- ============================================================

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (
        role IN ('IO', 'SUPERVISOR', 'LEGAL', 'ADMIN')
      ),
      jurisdiction TEXT NOT NULL,
      badge_number TEXT NOT NULL,
      is_active BOOLEAN DEFAULT TRUE,
      failed_attempts INTEGER DEFAULT 0,
      locked_until TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- ============================================================
    -- SESSIONS
    -- ============================================================

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ip_address TEXT,
      user_agent TEXT,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- ============================================================
    -- CASES
    -- ============================================================

    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      case_number TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      status TEXT NOT NULL CHECK (
        status IN (
          'DRAFT',
          'UNDER_INVESTIGATION',
          'SUPERVISOR_REVIEW',
          'LEGAL_REVIEW',
          'INDICTMENT_READY',
          'CLOSED',
          'ARCHIVED'
        )
      ),
      priority TEXT NOT NULL CHECK (
        priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')
      ),
      sensitivity TEXT NOT NULL CHECK (
        sensitivity IN (
          'STANDARD',
          'CONFIDENTIAL',
          'SECRET',
          'RESTRICTED'
        )
      ),
      jurisdiction TEXT NOT NULL,
      incident_date TIMESTAMP WITH TIME ZONE,
      location TEXT,
      statute_violation TEXT,
      lead_io_id TEXT NOT NULL REFERENCES users(id),
      created_by_id TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- ============================================================
    -- CASE ASSIGNMENTS
    -- ============================================================

    CREATE TABLE IF NOT EXISTS case_assignments (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_role TEXT NOT NULL CHECK (
        assigned_role IN (
          'LEAD_IO',
          'ASSISTANT_IO',
          'SUPERVISOR',
          'LEGAL_COUNSEL',
          'FORENSIC_SPECIALIST'
        )
      ),
      can_read BOOLEAN DEFAULT TRUE,
      can_write BOOLEAN DEFAULT TRUE,
      can_review BOOLEAN DEFAULT FALSE,
      can_export BOOLEAN DEFAULT FALSE,
      assigned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (case_id, user_id)
    );

    -- ============================================================
    -- EVIDENCE
    -- ============================================================

    CREATE TABLE IF NOT EXISTS evidence_items (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      tracking_number TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL CHECK (
        category IN (
          'DIGITAL',
          'PHYSICAL',
          'FORENSIC',
          'DOCUMENTARY',
          'BIOLOGICAL',
          'SURVEILLANCE'
        )
      ),
      storage_location TEXT NOT NULL,
      condition_notes TEXT,
      file_name TEXT,
      file_size INTEGER,
      sha256_hash TEXT NOT NULL,
      mime_type TEXT,
      current_custody_holder_id TEXT NOT NULL REFERENCES users(id),
      collected_by_id TEXT NOT NULL REFERENCES users(id),
      collected_at TIMESTAMP WITH TIME ZONE NOT NULL,
      is_tampered BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- ============================================================
    -- CHAIN OF CUSTODY
    -- ============================================================

    CREATE TABLE IF NOT EXISTS chain_of_custody (
      id TEXT PRIMARY KEY,
      evidence_id TEXT NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      transferred_from_id TEXT NOT NULL REFERENCES users(id),
      transferred_to_id TEXT NOT NULL REFERENCES users(id),
      action_type TEXT NOT NULL CHECK (
        action_type IN (
          'INITIAL_COLLECTION',
          'TRANSFER',
          'FORENSIC_ANALYSIS',
          'COURT_EVIDENCE_ROOM',
          'SAFE_DEPOSITORY',
          'AUTHORIZED_INSPECTION'
        )
      ),
      reason TEXT NOT NULL,
      location TEXT NOT NULL,
      signature_hash TEXT NOT NULL,
      recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- ============================================================
    -- CASE DOCUMENTS
    -- ============================================================

    CREATE TABLE IF NOT EXISTS case_documents (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      document_number TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      doc_type TEXT NOT NULL CHECK (
        doc_type IN (
          'SEARCH_WARRANT',
          'AFFIDAVIT',
          'INTERROGATION_TRANSCRIPT',
          'FORENSIC_REPORT',
          'WITNESS_DEPOSITION',
          'SUBPOENA_RETURN',
          'LEGAL_INDICTMENT_MEMO'
        )
      ),
      sensitivity TEXT NOT NULL CHECK (
        sensitivity IN (
          'STANDARD',
          'CONFIDENTIAL',
          'SECRET',
          'RESTRICTED'
        )
      ),
      version INTEGER DEFAULT 1,
      content_text TEXT NOT NULL,
      file_name TEXT,
      file_path TEXT,
      mime_type TEXT,
      file_size INTEGER,
      sha256_hash TEXT NOT NULL,
      author_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK (
        status IN (
          'DRAFT',
          'SUBMITTED',
          'APPROVED',
          'REJECTED'
        )
      ),
      signed_by_id TEXT REFERENCES users(id),
      signed_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- ============================================================
    -- IMMUTABLE DOCUMENT VERSIONS
    -- ============================================================

    CREATE TABLE IF NOT EXISTS document_versions (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES case_documents(id) ON DELETE CASCADE,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      version_number INTEGER NOT NULL,
      title TEXT NOT NULL,
      content_text TEXT NOT NULL,
      file_name TEXT,
      file_path TEXT,
      mime_type TEXT,
      file_size INTEGER,
      sha256_hash TEXT NOT NULL,
      author_id TEXT NOT NULL REFERENCES users(id),
      change_summary TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (document_id, version_number)
    );

    -- ============================================================
    -- TIMELINE EVENTS
    -- ============================================================

    CREATE TABLE IF NOT EXISTS timeline_events (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      source_type TEXT NOT NULL CHECK (
        source_type IN (
          'CCTV_FOOTAGE',
          'WITNESS_STATEMENT',
          'CAD_DISPATCH',
          'FORENSIC_LAB',
          'PHONE_RECORDS',
          'FINANCIAL_LEDGER',
          'ARREST_REPORT'
        )
      ),
      corroboration_level TEXT NOT NULL CHECK (
        corroboration_level IN (
          'UNVERIFIED',
          'CORROBORATED',
          'DEFINITIVE_RECORD'
        )
      ),
      verified_by_id TEXT REFERENCES users(id),
      is_verified BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- ============================================================
    -- CASE REVIEWS
    -- ============================================================

    CREATE TABLE IF NOT EXISTS case_reviews (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      reviewer_id TEXT NOT NULL REFERENCES users(id),
      review_type TEXT NOT NULL CHECK (
        review_type IN (
          'SUPERVISORY',
          'LEGAL_COMPLIANCE',
          'PROBABLE_CAUSE_AUDIT',
          'INDICTMENT_REVIEW'
        )
      ),
      decision TEXT NOT NULL CHECK (
        decision IN (
          'APPROVED',
          'CHANGES_REQUIRED',
          'REJECTED',
          'FLAGGED_DEFICIENCY'
        )
      ),
      comments TEXT NOT NULL,
      statutory_notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- ============================================================
    -- READINESS
    -- ============================================================

    CREATE TABLE IF NOT EXISTS readiness_items (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      item_name TEXT NOT NULL,
      is_compliant BOOLEAN DEFAULT FALSE,
      notes TEXT,
      verified_by_id TEXT REFERENCES users(id),
      verified_at TIMESTAMP WITH TIME ZONE
    );

    -- ============================================================
    -- AUDIT LOG
    -- ============================================================

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      sequence_num BIGSERIAL,
      timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      user_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      case_id TEXT,
      ip_address TEXT,
      details JSONB NOT NULL,
      status TEXT NOT NULL CHECK (
        status IN (
          'SUCCESS',
          'DENIED',
          'SECURITY_ALERT'
        )
      ),
      prev_hash TEXT NOT NULL,
      current_hash TEXT NOT NULL
    );

    -- ============================================================
    -- BLOCKCHAIN INTEGRITY / PROVENANCE ANCHORS
    -- Confidential payloads remain in the encrypted vault. This table stores
    -- cryptographic proofs and provider references only.
    -- ============================================================

    CREATE TABLE IF NOT EXISTS blockchain_anchors (
      id TEXT PRIMARY KEY,
      sequence_num BIGSERIAL,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      sha256_hash TEXT NOT NULL,
      actor_id TEXT NOT NULL REFERENCES users(id),
      metadata_hash TEXT NOT NULL,
      provider TEXT NOT NULL,
      transaction_reference TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL CHECK (status IN ('CONFIRMED', 'BLOCKCHAIN_PENDING')),
      previous_record_hash TEXT NOT NULL,
      current_hash TEXT NOT NULL,
      timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_evidence_case_id ON evidence_items(case_id);
    CREATE INDEX IF NOT EXISTS idx_documents_case_id ON case_documents(case_id);
    CREATE INDEX IF NOT EXISTS idx_custody_evidence_id ON chain_of_custody(evidence_id);
    CREATE INDEX IF NOT EXISTS idx_custody_case_id ON chain_of_custody(case_id);
    CREATE INDEX IF NOT EXISTS idx_audit_case_timestamp ON audit_logs(case_id, timestamp);
    CREATE INDEX IF NOT EXISTS idx_anchors_case_id ON blockchain_anchors(case_id);
    CREATE INDEX IF NOT EXISTS idx_anchors_entity ON blockchain_anchors(entity_type, entity_id);

    -- ============================================================
    -- NOTIFICATIONS
    -- ============================================================

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      case_id TEXT,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      severity TEXT NOT NULL CHECK (
        severity IN (
          'INFO',
          'WARNING',
          'ALERT',
          'CRITICAL'
        )
      ),
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- ============================================================
    -- INVESTIGATION DIARY
    -- ============================================================

    CREATE TABLE IF NOT EXISTS investigation_diary (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- ============================================================
    -- CASE REPORTS
    -- ============================================================

    CREATE TABLE IF NOT EXISTS case_reports (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      report_type TEXT NOT NULL CHECK (
        report_type IN (
          'INITIAL',
          'SUPPLEMENTAL',
          'CLOSING'
        )
      ),
      content TEXT NOT NULL,
      status TEXT NOT NULL CHECK (
        status IN (
          'DRAFT',
          'SUBMITTED',
          'APPROVED',
          'REJECTED'
        )
      ),
      author_id TEXT NOT NULL REFERENCES users(id),
      supervisor_id TEXT REFERENCES users(id),
      rejection_reason TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- ============================================================
    -- REPORT VERSIONS
    -- ============================================================

    CREATE TABLE IF NOT EXISTS report_versions (
      id TEXT PRIMARY KEY,
      report_id TEXT NOT NULL REFERENCES case_reports(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      author_id TEXT NOT NULL REFERENCES users(id),
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- ============================================================
    -- ELECTRONIC RECORD CERTIFICATES
    -- ============================================================

    CREATE TABLE IF NOT EXISTS certificates (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES users(id),
      certifier_name TEXT NOT NULL,
      certifier_title TEXT NOT NULL,
      certification_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      statement TEXT NOT NULL,
      system_version TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- ============================================================
    -- RATE LIMITING
    -- ============================================================

    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER DEFAULT 1,
      expires_at TIMESTAMP WITH TIME ZONE NOT NULL
    );
  `);

  await db.query(
    `INSERT INTO schema_migrations (id)
     VALUES ($1)
     ON CONFLICT (id) DO NOTHING`,
    ['001_initial_sims_schema'],
  );

  // ------------------------------------------------------------
  // BACKWARD-COMPATIBILITY COLUMNS
  // ------------------------------------------------------------

  try {
    await db.query(
      `ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS file_name TEXT;`,
    );

    await db.query(
      `ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS file_path TEXT;`,
    );

    await db.query(
      `ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS mime_type TEXT;`,
    );

    await db.query(
      `ALTER TABLE case_documents ADD COLUMN IF NOT EXISTS file_size INTEGER;`,
    );

    await db.query(
      `ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS file_path TEXT;`,
    );

    await db.query(
      `ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'VAULT_SECURED';`,
    );
  } catch (alterErr) {
    console.warn(
      '[DATABASE] Compatibility column migration warning:',
      alterErr,
    );
  }

  console.log(
    '[DATABASE] Schema verified. Checking seed data...',
  );

  await seedDemoData();
}

// ================================================================
// DEMO SEED
// ================================================================

async function seedDemoData() {
  const checkUsers = await db.query(
    'SELECT COUNT(*) as count FROM users',
  );

  const count = parseInt(
    (checkUsers.rows[0] as any).count,
    10,
  );

  if (count > 0) {
    console.log(
      '[DATABASE] Seed data already present. Skipping seed.',
    );
    return;
  }

  console.log(
    '[DATABASE] Seeding fictional Ramanagara Karnataka demonstration data...',
  );

  /*
   * ==============================================================
   * IMPORTANT
   * ==============================================================
   *
   * Everything below is FICTIONAL DEMONSTRATION DATA.
   *
   * The people, FIR numbers, evidence, incidents and documents
   * are not real police records.
   *
   * Demo password for all users:
   *
   * SimsSecure2026!
   *
   * ==============================================================
   */

  const passwordHash =
    '$2b$10$8F2Icmeh0RxeGgcit98n8.fvsuqa67CX52HLM8lUBbgZ4dk8vCMlS';

  const DEMO_JURISDICTION = 'RAMANAGARA';

  // ==============================================================
  // 1. DEMO USERS
  // ==============================================================

  const users = [
    {
      id: 'usr_io_ananya',
      username: 'io.ananya',
      email: 'ananya.gowda@demo.sims.local',
      password_hash: passwordHash,
      full_name: 'PSI Ananya Gowda',
      role: 'IO',
      jurisdiction: DEMO_JURISDICTION,
      badge_number: 'DEMO-IO-2601',
    },
    {
      id: 'usr_sup_mahesh',
      username: 'sup.mahesh',
      email: 'mahesh.kumar@demo.sims.local',
      password_hash: passwordHash,
      full_name: 'PI Mahesh Kumar',
      role: 'SUPERVISOR',
      jurisdiction: DEMO_JURISDICTION,
      badge_number: 'DEMO-SUP-2601',
    },
    {
      id: 'usr_legal_nandini',
      username: 'legal.nandini',
      email: 'nandini.rao@demo.sims.local',
      password_hash: passwordHash,
      full_name: 'Adv. Nandini Rao',
      role: 'LEGAL',
      jurisdiction: DEMO_JURISDICTION,
      badge_number: 'DEMO-LEG-2601',
    },
    {
      id: 'usr_admin_srinivas',
      username: 'admin.srinivas',
      email: 'srinivas.admin@demo.sims.local',
      password_hash: passwordHash,
      full_name: 'K. Srinivas',
      role: 'ADMIN',
      jurisdiction: DEMO_JURISDICTION,
      badge_number: 'DEMO-ADM-2601',
    },
    {
      id: 'usr_io_rohan',
      username: 'io.rohan',
      email: 'rohan.shetty@demo.sims.local',
      password_hash: passwordHash,
      full_name: 'PSI Rohan Shetty',
      role: 'IO',
      jurisdiction: DEMO_JURISDICTION,
      badge_number: 'DEMO-IO-2602',
    },
  ];

  for (const u of users) {
    await db.query(
      `INSERT INTO users
       (
         id,
         username,
         email,
         password_hash,
         full_name,
         role,
         jurisdiction,
         badge_number
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        u.id,
        u.username,
        u.email,
        u.password_hash,
        u.full_name,
        u.role,
        u.jurisdiction,
        u.badge_number,
      ],
    );
  }

  // ==============================================================
  // 2. FICTIONAL CASES
  // ==============================================================

  const cases = [
    {
      id: 'case_2026_047',
      case_number: 'FIR-047/2026',
      title: 'UPI Investment Fraud — Ramanagara Town',
      summary:
        'Fictional investigation into a cyber-enabled investment fraud in which multiple complainants were induced to transfer money through UPI after being promised high returns from a fabricated investment platform.',
      status: 'UNDER_INVESTIGATION',
      priority: 'HIGH',
      sensitivity: 'CONFIDENTIAL',
      jurisdiction: DEMO_JURISDICTION,
      incident_date: '2026-06-18T10:30:00Z',
      location: 'Ramanagara Town, Karnataka',
      statute_violation:
        'BNS provisions relating to cheating and criminal breach of trust; applicable Information Technology Act provisions subject to legal review',
      lead_io_id: 'usr_io_ananya',
      created_by_id: 'usr_io_ananya',
    },
    {
      id: 'case_2026_062',
      case_number: 'FIR-062/2026',
      title: 'Housebreaking & Electronic Device Theft — Channapatna',
      summary:
        'Fictional investigation concerning a night-time housebreaking incident involving theft of laptops, mobile devices and other electronic equipment from a residence in Channapatna.',
      status: 'SUPERVISOR_REVIEW',
      priority: 'MEDIUM',
      sensitivity: 'STANDARD',
      jurisdiction: DEMO_JURISDICTION,
      incident_date: '2026-07-03T02:15:00Z',
      location: 'Channapatna Town, Karnataka',
      statute_violation:
        'BNS provisions relating to house-breaking, theft and related offences',
      lead_io_id: 'usr_io_rohan',
      created_by_id: 'usr_io_rohan',
    },
    {
      id: 'case_2026_081',
      case_number: 'FIR-081/2026',
      title: 'Vehicle Theft & Document Tampering — Kanakapura',
      summary:
        'Fictional investigation into the theft of a commercial vehicle followed by suspected alteration of digital and physical vehicle documentation.',
      status: 'LEGAL_REVIEW',
      priority: 'HIGH',
      sensitivity: 'CONFIDENTIAL',
      jurisdiction: DEMO_JURISDICTION,
      incident_date: '2026-07-21T21:40:00Z',
      location: 'Kanakapura Rural, Karnataka',
      statute_violation:
        'BNS provisions relating to theft, forgery and use of forged electronic or physical records',
      lead_io_id: 'usr_io_ananya',
      created_by_id: 'usr_io_ananya',
    },
    {
      id: 'case_2026_094',
      case_number: 'FIR-094/2026',
      title: 'Cyber-Enabled Financial Fraud — Harohalli',
      summary:
        'Fictional cybercrime investigation involving fraudulent account-access messages and unauthorized transfers from several victim accounts.',
      status: 'UNDER_INVESTIGATION',
      priority: 'CRITICAL',
      sensitivity: 'SECRET',
      jurisdiction: DEMO_JURISDICTION,
      incident_date: '2026-08-04T06:20:00Z',
      location: 'Harohalli, Ramanagara, Karnataka',
      statute_violation:
        'BNS provisions relating to cheating and identity-related offences; Information Technology Act provisions subject to legal review',
      lead_io_id: 'usr_io_rohan',
      created_by_id: 'usr_io_rohan',
    },
    {
      id: 'case_2026_113',
      case_number: 'FIR-113/2026',
      title: 'Electronic Record Forgery — Magadi',
      summary:
        'Fictional investigation into suspected creation and circulation of altered property-related electronic records in connection with a disputed transaction.',
      status: 'DRAFT',
      priority: 'MEDIUM',
      sensitivity: 'CONFIDENTIAL',
      jurisdiction: DEMO_JURISDICTION,
      incident_date: '2026-08-19T14:10:00Z',
      location: 'Magadi, Karnataka',
      statute_violation:
        'BNS provisions relating to forgery, use of forged documents and cheating',
      lead_io_id: 'usr_io_ananya',
      created_by_id: 'usr_io_ananya',
    },
  ];

  for (const c of cases) {
    await db.query(
      `INSERT INTO cases
       (
         id,
         case_number,
         title,
         summary,
         status,
         priority,
         sensitivity,
         jurisdiction,
         incident_date,
         location,
         statute_violation,
         lead_io_id,
         created_by_id
       )
       VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        c.id,
        c.case_number,
        c.title,
        c.summary,
        c.status,
        c.priority,
        c.sensitivity,
        c.jurisdiction,
        c.incident_date,
        c.location,
        c.statute_violation,
        c.lead_io_id,
        c.created_by_id,
      ],
    );
  }

  // ==============================================================
  // 3. CASE ASSIGNMENTS
  // ==============================================================

  const assignments = [
    {
      id: 'asgn_047_io',
      case_id: 'case_2026_047',
      user_id: 'usr_io_ananya',
      assigned_role: 'LEAD_IO',
      can_read: true,
      can_write: true,
      can_review: false,
      can_export: true,
    },
    {
      id: 'asgn_047_sup',
      case_id: 'case_2026_047',
      user_id: 'usr_sup_mahesh',
      assigned_role: 'SUPERVISOR',
      can_read: true,
      can_write: true,
      can_review: true,
      can_export: true,
    },
    {
      id: 'asgn_047_legal',
      case_id: 'case_2026_047',
      user_id: 'usr_legal_nandini',
      assigned_role: 'LEGAL_COUNSEL',
      can_read: true,
      can_write: false,
      can_review: true,
      can_export: true,
    },
    {
      id: 'asgn_062_io',
      case_id: 'case_2026_062',
      user_id: 'usr_io_rohan',
      assigned_role: 'LEAD_IO',
      can_read: true,
      can_write: true,
      can_review: false,
      can_export: true,
    },
    {
      id: 'asgn_062_sup',
      case_id: 'case_2026_062',
      user_id: 'usr_sup_mahesh',
      assigned_role: 'SUPERVISOR',
      can_read: true,
      can_write: true,
      can_review: true,
      can_export: true,
    },
    {
      id: 'asgn_081_io',
      case_id: 'case_2026_081',
      user_id: 'usr_io_ananya',
      assigned_role: 'LEAD_IO',
      can_read: true,
      can_write: true,
      can_review: false,
      can_export: true,
    },
    {
      id: 'asgn_081_legal',
      case_id: 'case_2026_081',
      user_id: 'usr_legal_nandini',
      assigned_role: 'LEGAL_COUNSEL',
      can_read: true,
      can_write: false,
      can_review: true,
      can_export: true,
    },
    {
      id: 'asgn_094_io',
      case_id: 'case_2026_094',
      user_id: 'usr_io_rohan',
      assigned_role: 'LEAD_IO',
      can_read: true,
      can_write: true,
      can_review: false,
      can_export: false,
    },
    {
      id: 'asgn_094_sup',
      case_id: 'case_2026_094',
      user_id: 'usr_sup_mahesh',
      assigned_role: 'SUPERVISOR',
      can_read: true,
      can_write: true,
      can_review: true,
      can_export: false,
    },
  ];

  for (const a of assignments) {
    await db.query(
      `INSERT INTO case_assignments
       (
         id,
         case_id,
         user_id,
         assigned_role,
         can_read,
         can_write,
         can_review,
         can_export
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        a.id,
        a.case_id,
        a.user_id,
        a.assigned_role,
        a.can_read,
        a.can_write,
        a.can_review,
        a.can_export,
      ],
    );
  }

  // ==============================================================
  // 4. CREATE ACTUAL DEMONSTRATION FILES
  // ==============================================================
  //
  // IMPORTANT:
  // Seed files MUST use the exact same encrypted vault pipeline
  // as normal application uploads.
  //
  // ORIGINAL PLAINTEXT
  //       ↓
  // SHA-256
  //       ↓
  // AES-256-GCM
  //       ↓
  // ENCRYPTED VAULT OBJECT
  //
  // This prevents seeded evidence from bypassing the secure vault.

  const demoFiles = [
    {
      fileName: 'FIR-047-2026-complaint-summary.pdf',
      mimeType: 'application/pdf',
      content: Buffer.from(
        `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 190 >>
stream
BT
/F1 16 Tf
72 760 Td
(RAMANAGARA SIMS) Tj
0 -32 Td
(FICTIONAL DEMONSTRATION DOCUMENT) Tj
0 -32 Td
(FIR-047/2026 - Complaint Summary) Tj
0 -32 Td
(SYNTHETIC DATA - NOT AN OFFICIAL RECORD) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f
trailer
<< /Size 5 /Root 1 0 R >>
startxref
0
%%EOF`,
        'utf8',
      ),
    },
    {
      fileName: 'EVD-047-001-seized-mobile-photo.jpg',
      mimeType: 'image/jpeg',
      content: Buffer.from(
        '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/AP/EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAQUCcf/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8BJ//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8BJ//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEABj8Cf//Z',
        'base64',
      ),
    },
    {
      fileName: 'EVD-062-001-seized-laptop-photo.jpg',
      mimeType: 'image/jpeg',
      content: Buffer.from(
        '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/AP/EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAQUCcf/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8BJ//EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8BJ//EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEABj8Cf//Z',
        'base64',
      ),
    },
    {
      fileName: 'EVD-094-001-transaction-ledger.pdf',
      mimeType: 'application/pdf',
      content: Buffer.from(
        `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 205 >>
stream
BT
/F1 15 Tf
72 760 Td
(RAMANAGARA SIMS) Tj
0 -32 Td
(FICTIONAL DIGITAL EVIDENCE) Tj
0 -32 Td
(FIR-094/2026 - Transaction Ledger Extract) Tj
0 -32 Td
(SYNTHETIC DEMONSTRATION DATA - NOT OFFICIAL) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f
trailer
<< /Size 5 /Root 1 0 R >>
startxref
0
%%EOF`,
        'utf8',
      ),
    },
  ];

  const storedFiles: Record<
    string,
    {
      fileName: string;
      filePath: string;
      fileSize: number;
      sha256: string;
      mimeType: string;
    }
  > = {};

  // --------------------------------------------------------------
  // Remove old plaintext demo files created by previous versions.
  // --------------------------------------------------------------

  try {
    const existingVaultFiles =
      fs.readdirSync(UPLOAD_DIR);

    for (const existingFile of existingVaultFiles) {
      if (existingFile.startsWith('demo_')) {
        try {
          fs.unlinkSync(
            path.join(
              UPLOAD_DIR,
              existingFile,
            ),
          );
        } catch {
          // Ignore cleanup races.
        }
      }
    }
  } catch {
    // Defensive only. Directory is created above.
  }

  // --------------------------------------------------------------
  // Store every seed file through the SAME secure vault used by
  // normal uploads.
  // --------------------------------------------------------------

  for (const file of demoFiles) {
    const stored = await storeInVault(
      'evidence',
      file.content,
      file.fileName,
      file.mimeType,
    );

    storedFiles[file.fileName] = {
      fileName: stored.fileName,
      filePath: stored.filePath,
      fileSize: stored.fileSize,
      sha256: stored.sha256Hash,
      mimeType: stored.mimeType,
    };
  }

  // ==============================================================
  // 5. EVIDENCE ITEMS
  // ==============================================================

  const evidence = [
    {
      id: 'evd_047_001',
      case_id: 'case_2026_047',
      tracking_number: 'EVD-RMG-047-001',
      title: 'Seized Mobile Device — Demonstration Image',
      description:
        'Synthetic JPEG photograph representing a seized mobile device associated with the fictional FIR-047/2026 investigation.',
      category: 'DIGITAL',
      storage_location:
        'SIMS Evidence Vault / Ramanagara / Locker R-04',
      condition_notes:
        'Demonstration record. Device photograph stored as immutable evidence attachment. Hash calculated from stored file.',
      file: storedFiles[
        'EVD-047-001-seized-mobile-photo.jpg'
      ],
      current_custody_holder_id: 'usr_io_ananya',
      collected_by_id: 'usr_io_ananya',
      collected_at: '2026-06-19T11:20:00Z',
    },
    {
      id: 'evd_047_002',
      case_id: 'case_2026_047',
      tracking_number: 'EVD-RMG-047-002',
      title: 'Complaint Summary — PDF',
      description:
        'Synthetic PDF demonstrating secure storage of an investigation-related documentary evidence file.',
      category: 'DOCUMENTARY',
      storage_location:
        'SIMS Evidence Vault / Ramanagara / Digital Locker R-07',
      condition_notes:
        'Synthetic demonstration PDF. Integrity verified against SHA-256 hash.',
      file: storedFiles[
        'FIR-047-2026-complaint-summary.pdf'
      ],
      current_custody_holder_id: 'usr_io_ananya',
      collected_by_id: 'usr_io_ananya',
      collected_at: '2026-06-19T12:05:00Z',
    },
    {
      id: 'evd_062_001',
      case_id: 'case_2026_062',
      tracking_number: 'EVD-RMG-062-001',
      title: 'Seized Laptop — Demonstration Photograph',
      description:
        'Synthetic JPEG photograph representing a laptop recovered during the fictional Channapatna investigation.',
      category: 'DIGITAL',
      storage_location:
        'SIMS Evidence Vault / Channapatna / Locker C-12',
      condition_notes:
        'Demonstration evidence. Photograph retained with original upload hash.',
      file: storedFiles[
        'EVD-062-001-seized-laptop-photo.jpg'
      ],
      current_custody_holder_id: 'usr_io_rohan',
      collected_by_id: 'usr_io_rohan',
      collected_at: '2026-07-04T09:15:00Z',
    },
    {
      id: 'evd_094_001',
      case_id: 'case_2026_094',
      tracking_number: 'EVD-RMG-094-001',
      title: 'Transaction Ledger Extract — PDF',
      description:
        'Synthetic financial transaction extract used to demonstrate controlled digital evidence storage.',
      category: 'DOCUMENTARY',
      storage_location:
        'SIMS Evidence Vault / Harohalli / Restricted Digital Locker H-02',
      condition_notes:
        'SECRET-sensitivity demonstration evidence. Hash calculated from the exact stored PDF bytes.',
      file: storedFiles[
        'EVD-094-001-transaction-ledger.pdf'
      ],
      current_custody_holder_id: 'usr_io_rohan',
      collected_by_id: 'usr_io_rohan',
      collected_at: '2026-08-05T08:40:00Z',
    },
  ];

  for (const e of evidence) {
    await db.query(
      `INSERT INTO evidence_items
       (
         id,
         case_id,
         tracking_number,
         title,
         description,
         category,
         storage_location,
         condition_notes,
         file_name,
         file_size,
         sha256_hash,
         mime_type,
         current_custody_holder_id,
         collected_by_id,
         collected_at,
         file_path,
         status
       )
       VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17)`,
      [
        e.id,
        e.case_id,
        e.tracking_number,
        e.title,
        e.description,
        e.category,
        e.storage_location,
        e.condition_notes,
        e.file.fileName,
        e.file.fileSize,
        e.file.sha256,
        e.file.mimeType,
        e.current_custody_holder_id,
        e.collected_by_id,
        e.collected_at,
        e.file.filePath,
        'VAULT_SECURED',
      ],
    );
  }

  // ==============================================================
  // 6. CHAIN OF CUSTODY
  // ==============================================================

  const custodyEntries = [
    {
      id: 'cust_047_001',
      evidence_id: 'evd_047_001',
      case_id: 'case_2026_047',
      transferred_from_id: 'usr_io_ananya',
      transferred_to_id: 'usr_io_ananya',
      action_type: 'INITIAL_COLLECTION',
      reason:
        'Initial collection and secure registration of fictional digital evidence.',
      location:
        'Ramanagara Town — Demonstration Evidence Intake',
    },
    {
      id: 'cust_047_002',
      evidence_id: 'evd_047_002',
      case_id: 'case_2026_047',
      transferred_from_id: 'usr_io_ananya',
      transferred_to_id: 'usr_sup_mahesh',
      action_type: 'SAFE_DEPOSITORY',
      reason:
        'Transfer to supervisory custody for controlled review.',
      location:
        'Ramanagara — SIMS Demonstration Evidence Vault',
    },
    {
      id: 'cust_062_001',
      evidence_id: 'evd_062_001',
      case_id: 'case_2026_062',
      transferred_from_id: 'usr_io_rohan',
      transferred_to_id: 'usr_sup_mahesh',
      action_type: 'SAFE_DEPOSITORY',
      reason:
        'Temporary controlled storage pending forensic examination.',
      location:
        'Channapatna — SIMS Demonstration Evidence Vault',
    },
    {
      id: 'cust_094_001',
      evidence_id: 'evd_094_001',
      case_id: 'case_2026_094',
      transferred_from_id: 'usr_io_rohan',
      transferred_to_id: 'usr_io_rohan',
      action_type: 'INITIAL_COLLECTION',
      reason:
        'Initial secure registration of synthetic transaction record.',
      location:
        'Harohalli — Digital Evidence Intake',
    },
  ];

  for (const c of custodyEntries) {
    const signatureHash = crypto
      .createHash('sha256')
      .update(
        [
          c.evidence_id,
          c.case_id,
          c.transferred_from_id,
          c.transferred_to_id,
          c.action_type,
          c.reason,
          c.location,
        ].join('|'),
      )
      .digest('hex');

    await db.query(
      `INSERT INTO chain_of_custody
       (
         id,
         evidence_id,
         case_id,
         transferred_from_id,
         transferred_to_id,
         action_type,
         reason,
         location,
         signature_hash
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        c.id,
        c.evidence_id,
        c.case_id,
        c.transferred_from_id,
        c.transferred_to_id,
        c.action_type,
        c.reason,
        c.location,
        signatureHash,
      ],
    );
  }

  // ==============================================================
  // 7. CASE DOCUMENTS
  // ==============================================================

  const documentContents = {
    doc_047_fir: `FICTIONAL DEMONSTRATION RECORD

FIR-047/2026
Ramanagara Town Police Station
Jurisdiction: Ramanagara, Karnataka

Subject:
Fictional cyber-enabled investment fraud investigation.

This document is synthetic demonstration data created for the SIMS prototype.
It is NOT an official FIR, police document, court filing or government record.

Investigation Officer:
PSI Ananya Gowda
Demo Badge: DEMO-IO-2601

Initial investigation note:
Multiple fictional complainants reported transfers made through UPI after receiving investment-related messages from a fabricated platform.`,

    doc_047_statement: `FICTIONAL DEMONSTRATION WITNESS STATEMENT

FIR-047/2026
Location: Ramanagara Town, Karnataka

The following is synthetic demonstration content.
No real witness identity or statement is represented.

The fictional witness describes receiving an investment message and subsequently making a UPI transfer after being promised a high return.`,

    doc_081_legal: `FICTIONAL DEMONSTRATION LEGAL REVIEW MEMORANDUM

FIR-081/2026
Vehicle Theft & Document Tampering — Kanakapura

Prepared for demonstration of SIMS legal-review workflow.

The legal reviewer should verify the applicable BNS provisions, electronic-record requirements and evidentiary foundation before any real-world filing.

This document does not constitute legal advice or a statutory filing.`,

    doc_094_forensic: `FICTIONAL DEMONSTRATION FORENSIC REPORT

FIR-094/2026
Cyber-Enabled Financial Fraud — Harohalli

Scope:
Demonstration analysis of a synthetic transaction ledger.

Integrity:
The associated PDF evidence file is stored in the SIMS vault and assigned a SHA-256 digest.

Conclusion:
The demonstration file was readable and its stored digest matched the digest calculated at intake.

This is synthetic data and has no real evidentiary value.`,
  };

  const documents = [
    {
      id: 'doc_047_fir',
      case_id: 'case_2026_047',
      document_number: 'SIMS-DOC-047-001',
      title: 'FIR Investigation Intake Record',
      doc_type: 'AFFIDAVIT',
      sensitivity: 'CONFIDENTIAL',
      content_text: documentContents.doc_047_fir,
      file: storedFiles[
        'FIR-047-2026-complaint-summary.pdf'
      ],
      author_id: 'usr_io_ananya',
      status: 'SUBMITTED',
    },
    {
      id: 'doc_047_statement',
      case_id: 'case_2026_047',
      document_number: 'SIMS-DOC-047-002',
      title: 'Witness Statement — Demonstration Record',
      doc_type: 'WITNESS_DEPOSITION',
      sensitivity: 'CONFIDENTIAL',
      content_text: documentContents.doc_047_statement,
      file: null,
      author_id: 'usr_io_ananya',
      status: 'DRAFT',
    },
    {
      id: 'doc_081_legal',
      case_id: 'case_2026_081',
      document_number: 'SIMS-DOC-081-001',
      title: 'Legal Compliance Review — Vehicle Case',
      doc_type: 'LEGAL_INDICTMENT_MEMO',
      sensitivity: 'RESTRICTED',
      content_text: documentContents.doc_081_legal,
      file: null,
      author_id: 'usr_legal_nandini',
      status: 'APPROVED',
    },
    {
      id: 'doc_094_forensic',
      case_id: 'case_2026_094',
      document_number: 'SIMS-DOC-094-001',
      title: 'Digital Forensic Examination Report',
      doc_type: 'FORENSIC_REPORT',
      sensitivity: 'SECRET',
      content_text: documentContents.doc_094_forensic,
      file: storedFiles[
        'EVD-094-001-transaction-ledger.pdf'
      ],
      author_id: 'usr_io_rohan',
      status: 'SUBMITTED',
    },
  ];

  for (const d of documents) {
    const documentHash = crypto
      .createHash('sha256')
      .update(d.content_text)
      .digest('hex');

    await db.query(
      `INSERT INTO case_documents
       (
         id,
         case_id,
         document_number,
         title,
         doc_type,
         sensitivity,
         version,
         content_text,
         file_name,
         file_path,
         mime_type,
         file_size,
         sha256_hash,
         author_id,
         status
       )
       VALUES
       ($1, $2, $3, $4, $5, $6, 1, $7, $8, $9,
        $10, $11, $12, $13, $14)`,
      [
        d.id,
        d.case_id,
        d.document_number,
        d.title,
        d.doc_type,
        d.sensitivity,
        d.content_text,
        d.file?.fileName ?? null,
        d.file?.filePath ?? null,
        d.file?.mimeType ?? null,
        d.file?.fileSize ?? null,
        documentHash,
        d.author_id,
        d.status,
      ],
    );

    await db.query(
      `INSERT INTO document_versions
       (
         id,
         document_id,
         case_id,
         version_number,
         title,
         content_text,
         file_name,
         file_path,
         mime_type,
         file_size,
         sha256_hash,
         author_id,
         change_summary
       )
       VALUES
       ($1, $2, $3, 1, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        `${d.id}_v1`,
        d.id,
        d.case_id,
        d.title,
        d.content_text,
        d.file?.fileName ?? null,
        d.file?.filePath ?? null,
        d.file?.mimeType ?? null,
        d.file?.fileSize ?? null,
        documentHash,
        d.author_id,
        'Initial immutable demonstration version',
      ],
    );
  }

  // ==============================================================
  // 8. TIMELINE
  // ==============================================================

  const events = [
    {
      id: 'tm_047_001',
      case_id: 'case_2026_047',
      event_timestamp: '2026-06-18T10:30:00Z',
      title: 'Fictional Complaint Received',
      description:
        'Demonstration complaint recorded regarding suspected UPI investment fraud.',
      source_type: 'FINANCIAL_LEDGER',
      corroboration_level: 'CORROBORATED',
      verified_by_id: 'usr_io_ananya',
      is_verified: true,
    },
    {
      id: 'tm_047_002',
      case_id: 'case_2026_047',
      event_timestamp: '2026-06-19T11:20:00Z',
      title: 'Digital Evidence Registered',
      description:
        'Synthetic mobile-device photograph registered in the evidence vault and assigned tracking number EVD-RMG-047-001.',
      source_type: 'PHONE_RECORDS',
      corroboration_level: 'DEFINITIVE_RECORD',
      verified_by_id: 'usr_io_ananya',
      is_verified: true,
    },
    {
      id: 'tm_062_001',
      case_id: 'case_2026_062',
      event_timestamp: '2026-07-03T02:15:00Z',
      title: 'Housebreaking Incident Reported',
      description:
        'Fictional incident recorded in the Channapatna demonstration case.',
      source_type: 'CAD_DISPATCH',
      corroboration_level: 'CORROBORATED',
      verified_by_id: 'usr_io_rohan',
      is_verified: true,
    },
    {
      id: 'tm_094_001',
      case_id: 'case_2026_094',
      event_timestamp: '2026-08-05T08:40:00Z',
      title: 'Synthetic Transaction Record Secured',
      description:
        'Synthetic transaction ledger PDF registered in the restricted digital evidence vault.',
      source_type: 'FINANCIAL_LEDGER',
      corroboration_level: 'DEFINITIVE_RECORD',
      verified_by_id: 'usr_io_rohan',
      is_verified: true,
    },
  ];

  for (const ev of events) {
    await db.query(
      `INSERT INTO timeline_events
       (
         id,
         case_id,
         event_timestamp,
         title,
         description,
         source_type,
         corroboration_level,
         verified_by_id,
         is_verified
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        ev.id,
        ev.case_id,
        ev.event_timestamp,
        ev.title,
        ev.description,
        ev.source_type,
        ev.corroboration_level,
        ev.verified_by_id,
        ev.is_verified,
      ],
    );
  }

  // ==============================================================
  // 9. INVESTIGATION DIARY
  // ==============================================================

  const diaryEntries = [
    {
      id: 'diary_047_001',
      case_id: 'case_2026_047',
      author_id: 'usr_io_ananya',
      content:
        'Demonstration entry: complaint intake reviewed and initial digital evidence registration completed. Further verification of transaction records required.',
    },
    {
      id: 'diary_047_002',
      case_id: 'case_2026_047',
      author_id: 'usr_io_ananya',
      content:
        'Demonstration entry: synthetic evidence attachment was uploaded to the secure vault. SHA-256 integrity value recorded.',
    },
    {
      id: 'diary_062_001',
      case_id: 'case_2026_062',
      author_id: 'usr_io_rohan',
      content:
        'Demonstration entry: recovered laptop photograph registered. Forensic examination workflow remains pending.',
    },
    {
      id: 'diary_094_001',
      case_id: 'case_2026_094',
      author_id: 'usr_io_rohan',
      content:
        'Demonstration entry: transaction ledger imported into restricted evidence storage. Legal review required before any external use.',
    },
  ];

  for (const d of diaryEntries) {
    await db.query(
      `INSERT INTO investigation_diary
       (
         id,
         case_id,
         author_id,
         content
       )
       VALUES ($1, $2, $3, $4)`,
      [
        d.id,
        d.case_id,
        d.author_id,
        d.content,
      ],
    );
  }

  // ==============================================================
  // 10. REVIEWS
  // ==============================================================

  const reviews = [
    {
      id: 'review_047_sup',
      case_id: 'case_2026_047',
      reviewer_id: 'usr_sup_mahesh',
      review_type: 'SUPERVISORY',
      decision: 'CHANGES_REQUIRED',
      comments:
        'Demonstration review: verify the complete transaction trail and document all evidence handling steps before final supervisory approval.',
      statutory_notes:
        'Applicable legal provisions should be confirmed against the facts before any real filing.',
    },
    {
      id: 'review_081_legal',
      case_id: 'case_2026_081',
      reviewer_id: 'usr_legal_nandini',
      review_type: 'LEGAL_COMPLIANCE',
      decision: 'APPROVED',
      comments:
        'Demonstration legal review completed. Case may proceed to the next internal workflow stage after factual verification.',
      statutory_notes:
        'Electronic-record requirements and applicable BNS provisions require case-specific verification.',
    },
    {
      id: 'review_094_sup',
      case_id: 'case_2026_094',
      reviewer_id: 'usr_sup_mahesh',
      review_type: 'PROBABLE_CAUSE_AUDIT',
      decision: 'FLAGGED_DEFICIENCY',
      comments:
        'Demonstration deficiency: additional corroboration is required before readiness can be marked complete.',
      statutory_notes:
        'No conclusion regarding admissibility or statutory compliance is represented by this demo record.',
    },
  ];

  for (const r of reviews) {
    await db.query(
      `INSERT INTO case_reviews
       (
         id,
         case_id,
         reviewer_id,
         review_type,
         decision,
         comments,
         statutory_notes
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        r.id,
        r.case_id,
        r.reviewer_id,
        r.review_type,
        r.decision,
        r.comments,
        r.statutory_notes,
      ],
    );
  }

  // ==============================================================
  // 11. REPORTS
  // ==============================================================

  const reports = [
    {
      id: 'report_047',
      case_id: 'case_2026_047',
      title: 'Initial Investigation Report — FIR-047/2026',
      report_type: 'INITIAL',
      content:
        'Fictional demonstration report summarising complaint intake, evidence registration, preliminary timeline and pending investigative actions.',
      status: 'SUBMITTED',
      author_id: 'usr_io_ananya',
      supervisor_id: 'usr_sup_mahesh',
      rejection_reason: null,
    },
    {
      id: 'report_081',
      case_id: 'case_2026_081',
      title: 'Supplemental Investigation Report — FIR-081/2026',
      report_type: 'SUPPLEMENTAL',
      content:
        'Fictional demonstration supplemental report covering vehicle evidence, document verification and legal review requirements.',
      status: 'APPROVED',
      author_id: 'usr_io_ananya',
      supervisor_id: 'usr_sup_mahesh',
      rejection_reason: null,
    },
    {
      id: 'report_094',
      case_id: 'case_2026_094',
      title: 'Initial Cyber Investigation Report — FIR-094/2026',
      report_type: 'INITIAL',
      content:
        'Fictional demonstration report for the Harohalli cyber-enabled financial fraud investigation.',
      status: 'REJECTED',
      author_id: 'usr_io_rohan',
      supervisor_id: 'usr_sup_mahesh',
      rejection_reason:
        'Demonstration rejection: additional corroboration and evidence documentation required.',
    },
  ];

  for (const r of reports) {
    await db.query(
      `INSERT INTO case_reports
       (
         id,
         case_id,
         title,
         report_type,
         content,
         status,
         author_id,
         supervisor_id,
         rejection_reason
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        r.id,
        r.case_id,
        r.title,
        r.report_type,
        r.content,
        r.status,
        r.author_id,
        r.supervisor_id,
        r.rejection_reason,
      ],
    );

    await db.query(
      `INSERT INTO report_versions
       (
         id,
         report_id,
         content,
         author_id
       )
       VALUES ($1, $2, $3, $4)`,
      [
        `${r.id}_v1`,
        r.id,
        r.content,
        r.author_id,
      ],
    );
  }

  // ==============================================================
  // 12. READINESS
  // ==============================================================

  const checklist = [
    {
      id: 'rd_047_01',
      case_id: 'case_2026_047',
      category: 'CASE_DOCUMENTATION',
      item_name:
        'FIR and complaint intake documentation recorded',
      is_compliant: true,
      notes:
        'Synthetic demonstration record present.',
      verified_by_id: 'usr_io_ananya',
    },
    {
      id: 'rd_047_02',
      case_id: 'case_2026_047',
      category: 'DIGITAL_FORENSICS',
      item_name:
        'SHA-256 hash recorded for digital evidence',
      is_compliant: true,
      notes:
        'Hash calculated from the actual stored demonstration file.',
      verified_by_id: 'usr_io_ananya',
    },
    {
      id: 'rd_047_03',
      case_id: 'case_2026_047',
      category: 'CHAIN_OF_CUSTODY',
      item_name:
        'Evidence custody history recorded',
      is_compliant: true,
      notes:
        'Demonstration custody events present.',
      verified_by_id: 'usr_sup_mahesh',
    },
    {
      id: 'rd_047_04',
      case_id: 'case_2026_047',
      category: 'LEGAL_REVIEW',
      item_name:
        'Legal review completed',
      is_compliant: false,
      notes:
        'Pending legal review.',
      verified_by_id: null,
    },
    {
      id: 'rd_094_01',
      case_id: 'case_2026_094',
      category: 'DIGITAL_FORENSICS',
      item_name:
        'Restricted evidence integrity verified',
      is_compliant: true,
      notes:
        'Synthetic transaction ledger hash recorded.',
      verified_by_id: 'usr_io_rohan',
    },
    {
      id: 'rd_094_02',
      case_id: 'case_2026_094',
      category: 'CORROBORATION',
      item_name:
        'Independent corroboration completed',
      is_compliant: false,
      notes:
        'Additional corroboration required.',
      verified_by_id: null,
    },
  ];

  for (const item of checklist) {
    await db.query(
      `INSERT INTO readiness_items
       (
         id,
         case_id,
         category,
         item_name,
         is_compliant,
         notes,
         verified_by_id,
         verified_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        item.id,
        item.case_id,
        item.category,
        item.item_name,
        item.is_compliant,
        item.notes,
        item.verified_by_id,
        item.is_compliant
          ? '2026-08-25T10:00:00Z'
          : null,
      ],
    );
  }

  // ==============================================================
  // 13. ELECTRONIC RECORD CERTIFICATE DEMO
  // ==============================================================

  await db.query(
    `INSERT INTO certificates
     (
       id,
       case_id,
       author_id,
       certifier_name,
       certifier_title,
       certification_date,
       statement,
       system_version
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      'cert_047_01',
      'case_2026_047',
      'usr_io_ananya',
      'PSI Ananya Gowda',
      'Investigating Officer — Demonstration Persona',
      '2026-08-25T10:30:00Z',
      'FICTIONAL DEMONSTRATION CERTIFICATE: This record illustrates capture of electronic-record certificate metadata. It is not a statutory certificate, government certification, or legal filing.',
      'SIMS Demo Build 2026.08',
    ],
  );

  // ==============================================================
  // 14. APPEND-ONLY AUDIT HASH CHAIN
  // ==============================================================

  let prevHash =
    '0000000000000000000000000000000000000000000000000000000000000000';

  const initialLogs = [
    {
      id: 'aud_rmg_001',
      user_id: 'usr_admin_srinivas',
      action: 'SYSTEM_BOOTSTRAP',
      target_type: 'SYSTEM',
      target_id: 'SIMS_CORE',
      case_id: null,
      ip_address: '127.0.0.1',
      details: {
        message:
          'SIMS initialized with fictional Ramanagara Karnataka demonstration dataset.',
      },
      status: 'SUCCESS',
    },
    {
      id: 'aud_rmg_002',
      user_id: 'usr_io_ananya',
      action: 'CASE_CREATED',
      target_type: 'CASE',
      target_id: 'case_2026_047',
      case_id: 'case_2026_047',
      ip_address: '127.0.0.1',
      details: {
        case_number: 'FIR-047/2026',
        jurisdiction: 'RAMANAGARA',
        location: 'Ramanagara Town',
      },
      status: 'SUCCESS',
    },
    {
      id: 'aud_rmg_003',
      user_id: 'usr_io_ananya',
      action: 'EVIDENCE_SECURED',
      target_type: 'EVIDENCE',
      target_id: 'evd_047_001',
      case_id: 'case_2026_047',
      ip_address: '127.0.0.1',
      details: {
        tracking_number: 'EVD-RMG-047-001',
        message:
          'Synthetic JPEG stored in secure evidence vault.',
      },
      status: 'SUCCESS',
    },
    {
      id: 'aud_rmg_004',
      user_id: 'usr_io_rohan',
      action: 'EVIDENCE_SECURED',
      target_type: 'EVIDENCE',
      target_id: 'evd_094_001',
      case_id: 'case_2026_094',
      ip_address: '127.0.0.1',
      details: {
        tracking_number: 'EVD-RMG-094-001',
        message:
          'Synthetic PDF stored in restricted evidence vault.',
      },
      status: 'SUCCESS',
    },
    {
      id: 'aud_rmg_005',
      user_id: 'usr_legal_nandini',
      action: 'DOCUMENT_REVIEWED',
      target_type: 'DOCUMENT',
      target_id: 'doc_081_legal',
      case_id: 'case_2026_081',
      ip_address: '127.0.0.1',
      details: {
        decision: 'APPROVED',
        message:
          'Demonstration legal review completed.',
      },
      status: 'SUCCESS',
    },
  ];

  for (const [index, log] of initialLogs.entries()) {
    // Seed records use deterministic timestamps so their hashes can be
    // independently recomputed by the audit-chain verifier.
    const timestamp = new Date(
      Date.UTC(2026, 7, 25, 9, 0, index),
    ).toISOString();

    const rawPayload = [
      prevHash,
      log.user_id,
      log.action,
      log.target_type,
      log.target_id,
      serializeAuditDetails(log.details),
      log.status,
      timestamp,
    ].join('|');

    const currentHash = crypto
      .createHash('sha256')
      .update(rawPayload)
      .digest('hex');

    await db.query(
      `INSERT INTO audit_logs
       (
         id,
         timestamp,
         user_id,
         action,
         target_type,
         target_id,
         case_id,
         ip_address,
         details,
         status,
         prev_hash,
         current_hash
       )
       VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        log.id,
        timestamp,
        log.user_id,
        log.action,
        log.target_type,
        log.target_id,
        log.case_id,
        log.ip_address,
        serializeAuditDetails(log.details),
        log.status,
        prevHash,
        currentHash,
      ],
    );

    prevHash = currentHash;
  }

  // ==============================================================
  // 15. NOTIFICATIONS
  // ==============================================================

  const notifications = [
    {
      id: 'notif_rmg_01',
      user_id: 'usr_sup_mahesh',
      case_id: 'case_2026_047',
      title: 'Supervisor Review Required',
      message:
        'FIR-047/2026 is awaiting supervisory review. Demonstration case contains pending readiness items.',
      severity: 'WARNING',
    },
    {
      id: 'notif_rmg_02',
      user_id: 'usr_legal_nandini',
      case_id: 'case_2026_081',
      title: 'Legal Review Available',
      message:
        'FIR-081/2026 has been assigned for legal compliance review.',
      severity: 'INFO',
    },
    {
      id: 'notif_rmg_03',
      user_id: 'usr_io_rohan',
      case_id: 'case_2026_094',
      title: 'Additional Corroboration Required',
      message:
        'Readiness review identified a pending corroboration requirement for FIR-094/2026.',
      severity: 'ALERT',
    },
    {
      id: 'notif_rmg_04',
      user_id: 'usr_admin_srinivas',
      case_id: null,
      title: 'Secure Vault Online',
      message:
        'SIMS demonstration evidence vault is available for controlled document and evidence storage.',
      severity: 'INFO',
    },
  ];

  for (const n of notifications) {
    await db.query(
      `INSERT INTO notifications
       (
         id,
         user_id,
         case_id,
         title,
         message,
         severity
       )
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        n.id,
        n.user_id,
        n.case_id,
        n.title,
        n.message,
        n.severity,
      ],
    );
  }

  console.log(
    '[DATABASE] Ramanagara fictional demonstration seed loaded successfully.',
  );

  console.log(
    '[DATABASE] Demonstration files stored using AES-256-GCM secure vault with SHA-256 plaintext hashes.',
  );
}
