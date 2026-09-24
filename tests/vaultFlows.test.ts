import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import cookieParser from 'cookie-parser';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db, initDatabase } from '../server/db.ts';
import { createSession, SESSION_COOKIE_NAME } from '../server/auth.ts';
import documentsRouter from '../server/routes/documents.ts';
import evidenceRouter from '../server/routes/evidence.ts';
import { readFromVault, verifyVaultFileIntegrity } from '../server/vault.ts';
import { verifyIntegrityLedger } from '../server/blockchain.ts';

describe('document and evidence vault flows', () => {
  let server: Server;
  let baseUrl: string;
  let cookie: string;

  const documentBytes = Buffer.from('%PDF-1.4\nSIMS document vault flow\n%%EOF');
  const evidenceBytes = Buffer.from('%PDF-1.4\nSIMS evidence vault flow\n%%EOF');

  beforeAll(async () => {
    await initDatabase();
    const session = await createSession('usr_io_ananya');
    cookie = `${SESSION_COOKIE_NAME}=${session}`;

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/documents', documentsRouter);
    app.use('/api/evidence', evidenceRouter);

    server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  const request = (path: string, init: RequestInit) =>
    fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { Cookie: cookie, ...init.headers },
    });

  it('stores, verifies, audits, and releases a document using its original bytes', async () => {
    const form = new FormData();
    form.set('case_id', 'case_2026_047');
    form.set('title', 'Vault flow document');
    form.set('doc_type', 'FORENSIC_REPORT');
    form.set('sensitivity', 'CONFIDENTIAL');
    form.set('file', new Blob([documentBytes], { type: 'application/pdf' }), 'flow-document.pdf');

    const created = await request('/api/documents', { method: 'POST', body: form });
    expect(created.status).toBe(201);
    const { documentId, sha256Hash } = await created.json() as { documentId: string; sha256Hash: string };
    expect(sha256Hash).toBe(crypto.createHash('sha256').update(documentBytes).digest('hex'));

    const metadata = await db.query('SELECT * FROM case_documents WHERE id = $1', [documentId]);
    const document = metadata.rows[0] as any;
    expect(document.file_size).toBe(documentBytes.length);
    expect(document.sha256_hash).toBe(sha256Hash);
    expect(await fs.readFile(document.file_path)).not.toEqual(documentBytes);
    expect(await readFromVault(document.file_path)).toEqual(documentBytes);

    const integrity = await verifyVaultFileIntegrity(document.file_path, sha256Hash);
    expect(integrity.failure).toBeUndefined();
    expect(integrity.verified).toBe(true);
    expect(integrity.plaintext).toEqual(documentBytes);

    const missingIntegrity = await verifyVaultFileIntegrity(
      `${document.file_path}.missing`,
      sha256Hash,
    );
    expect(missingIntegrity.verified).toBe(false);
    expect(missingIntegrity.failure).toBe('FILE_NOT_FOUND');

    const download = await request(`/api/documents/${documentId}/download`, { method: 'GET' });
    expect(download.status).toBe(200);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(documentBytes);

    const versions = await db.query('SELECT id FROM document_versions WHERE document_id = $1', [documentId]);
    const audit = await db.query('SELECT action FROM audit_logs WHERE target_id = $1', [documentId]);
    expect(versions.rows).toHaveLength(1);

    const versionResponse = await request(`/api/documents/${documentId}/versions`, { method: 'GET' });
    expect(versionResponse.status).toBe(200);
    expect((await versionResponse.json()).versions).toHaveLength(1);
    expect(audit.rows.map((row: any) => row.action)).toContain('DOCUMENT_AUTHORED');
  });

  it('stores, verifies, audits, preserves custody, and releases evidence using its original bytes', async () => {
    const form = new FormData();
    form.set('case_id', 'case_2026_047');
    form.set('title', 'Vault flow evidence');
    form.set('description', 'Digital evidence used to verify the protected vault flow.');
    form.set('category', 'DIGITAL');
    form.set('storage_location', 'Secure Locker V-01');
    form.set('condition_notes', 'Sealed for integration verification.');
    form.set('file', new Blob([evidenceBytes], { type: 'application/pdf' }), 'flow-evidence.pdf');

    const created = await request('/api/evidence', { method: 'POST', body: form });
    expect(created.status).toBe(201);
    const { evidenceId, sha256Hash } = await created.json() as { evidenceId: string; sha256Hash: string };
    expect(sha256Hash).toBe(crypto.createHash('sha256').update(evidenceBytes).digest('hex'));

    const metadata = await db.query('SELECT * FROM evidence_items WHERE id = $1', [evidenceId]);
    const evidence = metadata.rows[0] as any;
    expect(evidence.file_size).toBe(evidenceBytes.length);
    expect(evidence.sha256_hash).toBe(sha256Hash);
    expect(await fs.readFile(evidence.file_path)).not.toEqual(evidenceBytes);
    expect(await readFromVault(evidence.file_path)).toEqual(evidenceBytes);

    const verifyResponse = await request(`/api/evidence/${evidenceId}/verify-hash`, { method: 'POST' });
    expect(verifyResponse.status).toBe(200);
    expect((await verifyResponse.json()).verified).toBe(true);

    const download = await request(`/api/evidence/${evidenceId}/download`, { method: 'GET' });
    expect(download.status).toBe(200);
    expect(Buffer.from(await download.arrayBuffer())).toEqual(evidenceBytes);

    const custody = await db.query('SELECT * FROM chain_of_custody WHERE evidence_id = $1', [evidenceId]);
    const audit = await db.query('SELECT action FROM audit_logs WHERE target_id = $1', [evidenceId]);
    expect(custody.rows).toHaveLength(1);
    expect((custody.rows[0] as any).signature_hash).toHaveLength(64);
    expect(audit.rows.map((row: any) => row.action)).toContain('EVIDENCE_SEIZED_INTAKE');
    expect(audit.rows.map((row: any) => row.action)).toContain('EVIDENCE_HASH_VERIFICATION');

    const ledger = await verifyIntegrityLedger('case_2026_047');
    expect(ledger.verified).toBe(true);
    expect(ledger.confirmedCount).toBeGreaterThanOrEqual(2);
    expect(ledger.records.some((record: any) => record.entity_id === evidenceId)).toBe(true);
  });

  it('rejects executable content before evidence storage', async () => {
    const form = new FormData();
    form.set('case_id', 'case_2026_047');
    form.set('title', 'Rejected executable');
    form.set('description', 'An executable payload must never enter the secure vault.');
    form.set('category', 'DIGITAL');
    form.set('storage_location', 'Secure Locker V-01');
    form.set('file', new Blob([Buffer.from('MZ executable payload')], { type: 'application/octet-stream' }), 'payload.pdf');

    const response = await request('/api/evidence', { method: 'POST', body: form });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('INVALID_FILE_TYPE');
  });
});
