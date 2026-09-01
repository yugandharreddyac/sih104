import { Router } from 'express';
import { SpeakerController } from './speaker.controller';
import { authenticate, requirePermission } from '../auth/rbac';
import { Permission } from '../auth/types';

const router = Router();

// Viewing profiles requires CALLS_READ
router.get('/', authenticate, requirePermission(Permission.CALLS_READ), SpeakerController.list);
router.get('/:id', authenticate, requirePermission(Permission.CALLS_READ), SpeakerController.getById);

// Biometric enrollment requires VERIFICATION_TRIGGER (OPERATOR/SUPERVISOR/ADMIN), deletion requires USER_MANAGE (ADMIN)
router.post('/enroll', authenticate, requirePermission(Permission.VERIFICATION_TRIGGER), SpeakerController.enroll);
router.delete('/:id', authenticate, requirePermission(Permission.USER_MANAGE), SpeakerController.delete);

export default router;
