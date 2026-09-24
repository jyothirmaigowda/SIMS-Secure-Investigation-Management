import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import { evaluateAccessPolicy, AuthUser } from '../server/accessControl.ts';
import { initDatabase } from '../server/db.ts';
import { verifyAuditChain, logAuditEvent } from '../server/audit.ts';

describe('SIMS Access Policy Engine (RBAC + DAC)', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  const ioAnanya: AuthUser = {
    id: 'usr_io_ananya',
    username: 'io.ananya',
    email: 'ananya.gowda@demo.sims.local',
    full_name: 'PSI Ananya Gowda',
    role: 'IO',
    jurisdiction: 'RAMANAGARA',
    badge_number: 'DEMO-IO-2601',
  };

  const supMahesh: AuthUser = {
    id: 'usr_sup_mahesh',
    username: 'sup.mahesh',
    email: 'mahesh.kumar@demo.sims.local',
    full_name: 'PI Mahesh Kumar',
    role: 'SUPERVISOR',
    jurisdiction: 'RAMANAGARA',
    badge_number: 'DEMO-SUP-2601',
  };

  const legalNandini: AuthUser = {
    id: 'usr_legal_nandini',
    username: 'legal.nandini',
    email: 'nandini.rao@demo.sims.local',
    full_name: 'Adv. Nandini Rao',
    role: 'LEGAL',
    jurisdiction: 'RAMANAGARA',
    badge_number: 'DEMO-LEG-2601',
  };

  const foreignIo: AuthUser = {
    ...ioAnanya,
    id: 'usr_io_foreign',
    jurisdiction: 'METRO-CENTRAL',
  };

  it('allows assigned lead IO Ananya Gowda to view case_2026_047', async () => {
    const decision = await evaluateAccessPolicy(ioAnanya, 'CASE_READ', 'case_2026_047');
    expect(decision.allowed).toBe(true);
    expect(decision.policyDetails.assignmentVerified).toBe(true);
  });

  it('denies IO from reviewing case disposition (Supervisor/Legal privilege)', async () => {
    const decision = await evaluateAccessPolicy(ioAnanya, 'REVIEW_SUBMIT', 'case_2026_047');
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('Supervisory or Legal');
  });

  it('allows Supervisor Ramirez to review case within their jurisdiction', async () => {
    const decision = await evaluateAccessPolicy(supMahesh, 'REVIEW_SUBMIT', 'case_2026_047');
    expect(decision.allowed).toBe(true);
  });

  it('allows Legal Chen to view and sign prosecution documents', async () => {
    const decision = await evaluateAccessPolicy(legalNandini, 'DOCUMENT_SIGN', 'case_2026_047');
    expect(decision.allowed).toBe(true);
  });

  it('allows IO to add evidence to assigned case', async () => {
    const decision = await evaluateAccessPolicy(ioAnanya, 'EVIDENCE_ADD', 'case_2026_047');
    expect(decision.allowed).toBe(true);
  });

  it('denies a foreign-jurisdiction IO access to a Ramanagara case', async () => {
    const decision = await evaluateAccessPolicy(foreignIo, 'CASE_READ', 'case_2026_047');
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('Jurisdiction mismatch');
  });
});

describe('Cryptographic Audit Hash Chain', () => {
  it('successfully verifies tamper-evident audit ledger from genesis block', async () => {
    const auditStatus = await verifyAuditChain();
    expect(auditStatus.verified).toBe(true);
    expect(auditStatus.totalRecords).toBeGreaterThan(0);
    expect(auditStatus.latestHash).toHaveLength(64);
  });

  it('appends a new block and maintains contiguous hash chain linkage', async () => {
    const result = await logAuditEvent({
      userId: 'usr_io_ananya',
      action: 'UNIT_TEST_SEAL',
      targetType: 'SYSTEM_TEST',
      targetId: 'tst_001',
      details: { testRun: true, timestamp: Date.now() },
      status: 'SUCCESS',
    });

    expect(result.currentHash).toHaveLength(64);
    expect(result.prevHash).toBeDefined();

    // Verify unbroken chain after new insertion
    const recheck = await verifyAuditChain();
    expect(recheck.verified).toBe(true);
  });

  it('produces distinct SHA-256 digests when payload differs', () => {
    const payloadA = 'prev_hash|user_1|CASE_READ|SUCCESS|2026-09-03';
    const payloadB = 'prev_hash|user_1|CASE_READ|DENIED|2026-09-03';

    const hashA = crypto.createHash('sha256').update(payloadA).digest('hex');
    const hashB = crypto.createHash('sha256').update(payloadB).digest('hex');

    expect(hashA).not.toBe(hashB);
    expect(hashA).toHaveLength(64);
    expect(hashB).toHaveLength(64);
  });
});
