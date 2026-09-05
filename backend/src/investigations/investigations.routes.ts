import { Router } from 'express';
import { InvestigationsController } from './investigations.controller';
import { authenticate, requirePermission } from '../auth/rbac';
import { Permission } from '../auth/types';

const router = Router();

router.use(authenticate);

router.get('/:callId', requirePermission(Permission.CALLS_READ), InvestigationsController.getInvestigation);

export const investigationRoutes = router;
export default router;
