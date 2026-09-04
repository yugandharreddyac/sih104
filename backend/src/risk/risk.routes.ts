import { Router } from 'express';
import { authenticate, requirePermission } from '../auth/rbac';
import { Permission } from '../auth/types';
import { RiskController } from './risk.controller';

const router = Router();

router.post('/evaluate', authenticate, requirePermission(Permission.CALLS_STREAM), RiskController.evaluateRisk);
router.post('/transaction-context', authenticate, requirePermission(Permission.CALLS_STREAM), RiskController.submitTransactionContext);
router.get('/:callId', authenticate, requirePermission(Permission.CALLS_READ), RiskController.getAssessment);
router.get('/:callId/timeline', authenticate, requirePermission(Permission.CALLS_READ), RiskController.getTimeline);
router.get('/:callId/evidence', authenticate, requirePermission(Permission.CALLS_READ), RiskController.getEvidence);

export const riskRoutes = router;
export default router;

