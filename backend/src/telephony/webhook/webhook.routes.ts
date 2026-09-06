import { Router } from 'express';
import { TelephonyWebhookController } from './webhook.controller';
import { authenticate, requirePermission } from '../../auth/rbac';
import { Permission } from '../../auth/types';
import { requireWebhookSignature } from './webhook_auth';

const router = Router();

// Provider-agnostic signature validation
router.use(requireWebhookSignature);

// Webhooks should NOT require internal JWT authentication as they come from external telephony providers.
// They are protected by requireWebhookSignature and the Redis replay cache.
// router.use(authenticate);

router.post('/start', TelephonyWebhookController.onCallStart);
router.post('/stop', TelephonyWebhookController.onCallEnd);

export const telephonyWebhookRoutes = router;
