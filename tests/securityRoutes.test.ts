import express from 'express';
import cookieParser from 'cookie-parser';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { initDatabase } from '../server/db.ts';
import { createSession, SESSION_COOKIE_NAME } from '../server/auth.ts';
import casesRouter from '../server/routes/cases.ts';
import documentsRouter from '../server/routes/documents.ts';
import evidenceRouter from '../server/routes/evidence.ts';

describe('protected API routes', () => {
  let server: Server;
  let baseUrl: string;
  let ioCookie: string;

  beforeAll(async () => {
    await initDatabase();

    const ioSession = await createSession('usr_io_ananya');
    ioCookie = `${SESSION_COOKIE_NAME}=${ioSession}`;

    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/cases', casesRouter);
    app.use('/api/documents', documentsRouter);
    app.use('/api/evidence', evidenceRouter);

    server = app.listen(0);
    await new Promise<void>((resolve) => {
      server.once('listening', resolve);
    });

    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  });

  const authenticatedFetch = (path: string, init: RequestInit = {}) =>
    fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Cookie: ioCookie,
        ...init.headers,
      },
    });

  it('rejects an unauthenticated direct API request', async () => {
    const response = await fetch(`${baseUrl}/api/cases`);
    expect(response.status).toBe(401);
  });

  it('rejects the former predictable demonstration session token', async () => {
    const response = await fetch(`${baseUrl}/api/cases`, {
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=sims_demo_session_ananya`,
      },
    });

    expect(response.status).toBe(401);
  });

  it('allows an assigned IO to read their case', async () => {
    const response = await authenticatedFetch('/api/cases/case_2026_047');
    expect(response.status).toBe(200);
  });

  it('denies an IO a supervisory case disposition request', async () => {
    const response = await authenticatedFetch(
      '/api/cases/case_2026_047/disposition',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CLOSED' }),
      },
    );

    expect(response.status).toBe(403);
  });

  it('denies an IO direct evidence access to an unassigned secret case', async () => {
    const response = await authenticatedFetch(
      '/api/evidence?caseId=case_2026_094',
    );

    expect(response.status).toBe(403);
  });

  it('denies an IO document-list access for an unassigned case', async () => {
    const response = await authenticatedFetch(
      '/api/documents?caseId=case_2026_094',
    );

    expect(response.status).toBe(403);
  });
});
