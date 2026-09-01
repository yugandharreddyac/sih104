import { Router } from 'express';
import { AcousticController } from './acoustic.controller';
import { authenticate, requirePermission } from '../auth/rbac';
import { Permission } from '../auth/types';

const router = Router();

// Telemetry & analysis access requires CALLS_READ / CALLS_STREAM
router.post('/analyze', authenticate, requirePermission(Permission.CALLS_STREAM), AcousticController.analyze);
router.get('/status', authenticate, requirePermission(Permission.CALLS_READ), AcousticController.getStatus);

export default router;
