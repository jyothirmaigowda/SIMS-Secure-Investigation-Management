import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import { initDatabase } from './server/db.ts';

import authRouter from './server/routes/auth.ts';
import casesRouter from './server/routes/cases.ts';
import evidenceRouter from './server/routes/evidence.ts';
import documentsRouter from './server/routes/documents.ts';
import timelineRouter from './server/routes/timeline.ts';
import reviewsRouter from './server/routes/reviews.ts';
import auditRouter from './server/routes/audit.ts';
import statsRouter from './server/routes/stats.ts';
import investigationRouter from './server/routes/investigation.ts';
import reportsRouter from './server/routes/reports.ts';
import readinessRouter from './server/routes/readiness.ts';
import integrityRouter from './server/routes/integrity.ts';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Fail closed: do not bind HTTP routes until PostgreSQL is connected,
  // migrated, and seeded. There is intentionally no memory fallback.
  await initDatabase();
  console.log('[DATABASE] PostgreSQL database ready for queries.');

  // Core middlewares
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));
  app.use(cookieParser());

  // Security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // Health is exposed only after a successful PostgreSQL initialization.
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'operational',
      system: 'SIMS — Secure Investigation Management System',
      engine: 'PostgreSQL Relational Engine',
      environment: 'Institutional Sandbox (Fictional Law Enforcement Workflows)',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/cases', casesRouter);
  app.use('/api/evidence', evidenceRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/timeline', timelineRouter);
  app.use('/api/reviews', reviewsRouter);
  app.use('/api/audit', auditRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/investigation', investigationRouter);
  app.use('/api/reports', reportsRouter);
  app.use('/api/cases-ext', readinessRouter);
  app.use('/api/integrity', integrityRouter);
  app.use('/api', statsRouter); // Mount search, notifications, users at /api root

  // Vite development middleware or production static files
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[SIMS] Secure Investigation Management System running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[SIMS_CRITICAL] Failed to start server:', err);
  process.exit(1);
});
