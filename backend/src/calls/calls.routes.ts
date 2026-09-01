import { Router } from 'express';
import { CallsController } from './calls.controller';
import { authenticate, requirePermission } from '../auth/rbac';
import { Permission } from '../auth/types';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission(Permission.CALLS_READ), CallsController.listCalls);
router.get('/:id', requirePermission(Permission.CALLS_READ), CallsController.getCall);
router.post('/', requirePermission(Permission.CALLS_READ), CallsController.createCall);
router.patch('/:id/status', requirePermission(Permission.CALLS_INTERVENE), CallsController.updateStatus);

export const callRoutes = router;
