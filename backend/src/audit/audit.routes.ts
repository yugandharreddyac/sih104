import { Router } from 'express';
import { AuditController } from './audit.controller';
import { authenticate, requirePermission } from '../auth/rbac';
import { Permission } from '../auth/types';

const router = Router();

router.use(authenticate);
router.get('/', requirePermission(Permission.AUDIT_READ), AuditController.list);

export const auditRoutes = router;
