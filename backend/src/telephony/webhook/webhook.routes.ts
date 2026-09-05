import { Router } from 'express';
import { TelephonyWebhookController } from './webhook.controller';
import { authenticate, requirePermission } from '../../auth/rbac';
import { Permission } from '../../auth/types';
import { requireWebhookSignature } from './webhook_auth';

const router = Router();

// Provider-agnostic signature validation
router.use(requireWebhookSignature);

// Preserve robust internal RBAC logic for tenant isolation and authorization
router.use(authenticate);

router.post('/start', requirePermission(Permission.CALLS_INTERVENE), TelephonyWebhookController.onCallStart);
router.post('/stop', requirePermission(Permission.CALLS_INTERVENE), TelephonyWebhookController.onCallEnd);

export const telephonyWebhookRoutes = router;
