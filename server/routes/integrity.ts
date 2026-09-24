import { Router, Response } from 'express';
import { requireAuth, requireSecurityCheck, AuthenticatedRequest } from '../auth.ts';
import { verifyIntegrityLedger } from '../blockchain.ts';

const router = Router();

router.get('/:caseId', requireAuth, requireSecurityCheck('CASE_READ'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await verifyIntegrityLedger(req.params.caseId);
    return res.json({
      ...result,
      label: 'LOCAL PERMISSIONED LEDGER — DEVELOPMENT / PROTOTYPE',
    });
  } catch {
    return res.status(500).json({
      error: 'INTEGRITY_LEDGER_UNAVAILABLE',
      message: 'The integrity ledger could not be verified.',
    });
  }
});

export default router;
