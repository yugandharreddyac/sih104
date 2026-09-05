import { Router } from 'express';
import { TelephonyWebhookController } from './webhook.controller';
import { authenticate, requirePermission } from '../../auth/rbac';
import { Permission } from '../../auth/types';

const router = Router();

// In a real carrier setup (e.g. Twilio), you might use a signature-validation middleware.
// For now, we reuse the robust internal RBAC logic.
router.use(authenticate);

router.post('/start', requirePermission(Permission.CALLS_INTERVENE), TelephonyWebhookController.onCallStart);
router.post('/stop', requirePermission(Permission.CALLS_INTERVENE), TelephonyWebhookController.onCallEnd);

export const telephonyWebhookRoutes = router;
