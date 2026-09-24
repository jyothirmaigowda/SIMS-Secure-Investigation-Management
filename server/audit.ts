import crypto from 'crypto';
import { db } from './db.ts';
import { serializeAuditDetails } from './auditHash.ts';

export interface AuditEntryOptions {
  userId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  caseId?: string | null;
  ipAddress?: string | null;
  details: Record<string, any>;
  status?: 'SUCCESS' | 'DENIED' | 'SECURITY_ALERT';
}

/**
 * Append-only Cryptographic Audit Logger
 * Every log entry is chained to the previous record's SHA-256 hash.
 */
export async function logAuditEvent(options: AuditEntryOptions) {
  try {
    const id = 'aud_' + crypto.randomUUID().replace(/-/g, '');
    const status = options.status || 'SUCCESS';
    const ip = options.ipAddress || '127.0.0.1';
    const detailsJson = serializeAuditDetails(options.details);

    // Fetch the latest current_hash from the audit log
    const lastLog = await db.query(
      'SELECT current_hash FROM audit_logs ORDER BY sequence_num DESC LIMIT 1'
    );
    const prevHash = lastLog.rows.length > 0
      ? (lastLog.rows[0] as any).current_hash
      : '0000000000000000000000000000000000000000000000000000000000000000';

    const timestamp = new Date().toISOString();
    const rawPayload = `${prevHash}|${options.userId || 'SYSTEM'}|${options.action}|${options.targetType}|${options.targetId || ''}|${detailsJson}|${status}|${timestamp}`;
    const currentHash = crypto.createHash('sha256').update(rawPayload).digest('hex');

    await db.query(
      `INSERT INTO audit_logs (id, timestamp, user_id, action, target_type, target_id, case_id, ip_address, details, status, prev_hash, current_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id,
        timestamp,
        options.userId || null,
        options.action,
        options.targetType,
        options.targetId || null,
        options.caseId || null,
        ip,
        detailsJson,
        status,
        prevHash,
        currentHash
      ]
    );

    return { id, currentHash, prevHash };
  } catch (err) {
    console.error('[AUDIT_ERROR] Failed to record audit log:', err);
    // Even if logging fails, do not silently swallow in high-security systems
    throw err;
  }
}

/**
 * Validates the cryptographic integrity of the entire audit chain.
 * Detects any tampering, altered rows, or inserted/deleted records.
 */
export async function verifyAuditChain() {
  const result = await db.query(
    'SELECT * FROM audit_logs ORDER BY sequence_num ASC'
  );
  const logs = result.rows as any[];

  let verified = true;
  let brokenIndex = -1;
  let reason = '';

  for (let i = 0; i < logs.length; i++) {
    const current = logs[i];
    if (i === 0) {
      // Genesis block
      if (current.prev_hash !== '0000000000000000000000000000000000000000000000000000000000000000') {
        verified = false;
        brokenIndex = i;
        reason = 'Genesis block previous hash is invalid.';
        break;
      }
    } else {
      const previous = logs[i - 1];
      if (current.prev_hash !== previous.current_hash) {
        verified = false;
        brokenIndex = i;
        reason = `Hash mismatch at sequence ${current.sequence_num}: prev_hash does not match previous row current_hash.`;
        break;
      }
    }

    const timestampIso = new Date(current.timestamp).toISOString();
    // PostgreSQL drivers may deserialize JSONB as either a JSON string or
    // an object. Recreate the exact JSON representation used when hashing.
    const detailsJson = serializeAuditDetails(current.details);
    // Recompute hash
    const rawPayload = `${current.prev_hash}|${current.user_id || 'SYSTEM'}|${current.action}|${current.target_type}|${current.target_id || ''}|${detailsJson}|${current.status}|${timestampIso}`;
    const calculatedHash = crypto.createHash('sha256').update(rawPayload).digest('hex');

    if (calculatedHash !== current.current_hash) {
      verified = false;
      brokenIndex = i;
      reason = `Cryptographic failure at sequence ${current.sequence_num}: Recomputed payload hash does not match stored current_hash.`;
      break;
    }
  }

  return {
    verified,
    totalRecords: logs.length,
    brokenIndex,
    reason: verified ? 'Cryptographic hash chain is intact and tamper-free.' : reason,
    latestHash: logs.length > 0 ? logs[logs.length - 1].current_hash : null,
  };
}
