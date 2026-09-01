import { Router } from 'express';
import { IncidentsController } from './incidents.controller';
import { authenticate, requirePermission } from '../auth/rbac';
import { Permission } from '../auth/types';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission(Permission.INCIDENTS_READ), IncidentsController.list);
router.get('/:id', requirePermission(Permission.INCIDENTS_READ), IncidentsController.getById);
router.post('/', requirePermission(Permission.INCIDENTS_WRITE), IncidentsController.create);
router.patch('/:id/status', requirePermission(Permission.INCIDENTS_RESOLVE), IncidentsController.updateStatus);

export const incidentRoutes = router;
