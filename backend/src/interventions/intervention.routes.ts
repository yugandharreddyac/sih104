import { Router } from 'express';
import { authenticate, requirePermission } from '../auth/rbac';
import { Permission } from '../auth/types';
import { InterventionController } from './intervention.controller';

const router = Router();

router.get('/', authenticate, requirePermission(Permission.CALLS_READ), InterventionController.list);
router.post('/recommend', authenticate, requirePermission(Permission.CALLS_INTERVENE), InterventionController.create);
router.post('/decision', authenticate, requirePermission(Permission.CALLS_INTERVENE), InterventionController.recordDecision);

export default router;
