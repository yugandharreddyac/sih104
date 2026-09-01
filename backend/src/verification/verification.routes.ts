import { Router } from 'express';
import { VerificationController } from './verification.controller';
import { authenticate, requirePermission } from '../auth/rbac';
import { Permission } from '../auth/types';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission(Permission.CALLS_READ), VerificationController.list);
router.post('/', requirePermission(Permission.VERIFICATION_TRIGGER), VerificationController.create);
router.patch('/:id/resolve', requirePermission(Permission.VERIFICATION_TRIGGER), VerificationController.resolve);

export const verificationRoutes = router;
