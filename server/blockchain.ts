import crypto from 'crypto';
import { db } from './db.ts';

export type IntegrityEntityType =
  | 'EVIDENCE'
  | 'DOCUMENT_VERSION'
  | 'CUSTODY_EVENT'
  | 'TIMELINE_EVENT';

export interface BlockchainProvider {
  readonly name: string;
  createIntegrityAnchor(input: IntegrityAnchorInput): Promise<IntegrityAnchorResult>;
}

export interface IntegrityAnchorInput {
  caseId: string;
  entityType: IntegrityEntityType;
  entityId: string;
  eventType: string;
  sha256Hash: string;
  actorId: string;
  metadata?: Record<string, unknown>;
}

export interface IntegrityAnchorResult {
  id: string;
  provider: string;
  transactionReference: string;
  status: 'CONFIRMED' | 'BLOCKCHAIN_PENDING';
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/**
 * A real append-only, hash-linked development ledger. It stores no evidence
 * bytes or confidential narrative—only integrity and provenance metadata.
 */
export class LocalPermissionedProvider implements BlockchainProvider {
  readonly name = 'LOCAL_PERMISSIONED_LEDGER';

  async createIntegrityAnchor(input: IntegrityAnchorInput): Promise<IntegrityAnchorResult> {
    const id = `bca_${crypto.randomUUID().replace(/-/g, '')}`;
    const transactionReference = `LPL-${crypto.randomUUID().replace(/-/g, '').slice(0, 20).toUpperCase()}`;
    const metadataHash = digest(canonicalJson(input.metadata || {}));
    const previous = await db.query(
      `SELECT current_hash
       FROM blockchain_anchors
       WHERE provider = $1 AND status = 'CONFIRMED'
       ORDER BY sequence_num DESC
       LIMIT 1`,
      [this.name],
    );
    const previousRecordHash = previous.rows.length
      ? String((previous.rows[0] as any).current_hash)
      : '0'.repeat(64);
    const timestamp = new Date().toISOString();
    const currentRecordHash = digest([
      previousRecordHash,
      input.caseId,
      input.entityType,
      input.entityId,
      input.eventType,
      input.sha256Hash,
      input.actorId,
      metadataHash,
      timestamp,
      transactionReference,
    ].join('|'));

    await db.query(
      `INSERT INTO blockchain_anchors (
        id, case_id, entity_type, entity_id, event_type, sha256_hash,
        actor_id, metadata_hash, provider, transaction_reference, status,
        previous_record_hash, current_hash, timestamp
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'CONFIRMED',$11,$12,$13)`,
      [id, input.caseId, input.entityType, input.entityId, input.eventType,
        input.sha256Hash, input.actorId, metadataHash, this.name,
        transactionReference, previousRecordHash, currentRecordHash, timestamp],
    );

    return { id, provider: this.name, transactionReference, status: 'CONFIRMED' };
  }
}

class PendingProvider implements BlockchainProvider {
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  async createIntegrityAnchor(input: IntegrityAnchorInput): Promise<IntegrityAnchorResult> {
    const id = `bca_${crypto.randomUUID().replace(/-/g, '')}`;
    const transactionReference = `PENDING-${id.slice(-12).toUpperCase()}`;
    await db.query(
      `INSERT INTO blockchain_anchors (
        id, case_id, entity_type, entity_id, event_type, sha256_hash,
        actor_id, metadata_hash, provider, transaction_reference, status,
        previous_record_hash, current_hash
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'BLOCKCHAIN_PENDING',$11,$12)`,
      [id, input.caseId, input.entityType, input.entityId, input.eventType,
        input.sha256Hash, input.actorId, digest(canonicalJson(input.metadata || {})),
        this.name, transactionReference, '0'.repeat(64), ''],
    );
    return { id, provider: this.name, transactionReference, status: 'BLOCKCHAIN_PENDING' };
  }
}

function provider(): BlockchainProvider {
  if (process.env.BLOCKCHAIN_ENABLED === 'false') return new PendingProvider('DISABLED');
  if ((process.env.BLOCKCHAIN_PROVIDER || 'local').toLowerCase() === 'vishvasya') {
    // No endpoint is guessed. A Vishvasya adapter is enabled only when its
    // documented API contract and credentials are available.
    return new PendingProvider('VISHVASYA_UNCONFIGURED');
  }
  return new LocalPermissionedProvider();
}

export async function createIntegrityAnchor(input: IntegrityAnchorInput) {
  return provider().createIntegrityAnchor(input);
}

export async function verifyIntegrityLedger(caseId: string) {
  const records = (await db.query(
    `SELECT * FROM blockchain_anchors WHERE case_id = $1 ORDER BY sequence_num ASC`,
    [caseId],
  )).rows as any[];
  const confirmed = records.filter((record) => record.status === 'CONFIRMED');
  let previous = '0'.repeat(64);
  let verified = true;
  let reason = 'Local permissioned ledger is intact.';

  for (const record of confirmed) {
    const expected = digest([
      previous, record.case_id, record.entity_type, record.entity_id,
      record.event_type, record.sha256_hash, record.actor_id,
      record.metadata_hash, new Date(record.timestamp).toISOString(),
      record.transaction_reference,
    ].join('|'));
    if (record.previous_record_hash !== previous || record.current_hash !== expected) {
      verified = false;
      reason = `Ledger chain verification failed at ${record.transaction_reference}.`;
      break;
    }
    previous = record.current_hash;
  }

  return {
    verified,
    records,
    confirmedCount: confirmed.length,
    pendingCount: records.filter((record) => record.status === 'BLOCKCHAIN_PENDING').length,
    reason,
    provider: confirmed[0]?.provider || records[0]?.provider || 'LOCAL_PERMISSIONED_LEDGER',
  };
}
