import { Router } from 'express';
import { ConversationController } from './conversation.controller';
import { authenticate, requirePermission } from '../auth/rbac';
import { Permission } from '../auth/types';

const router = Router();

// Viewing live conversation context and signals requires CALLS_READ / CALLS_STREAM
router.post('/analyze-turn', authenticate, requirePermission(Permission.CALLS_STREAM), ConversationController.analyzeTurn);
router.get('/:callId/summary', authenticate, requirePermission(Permission.CALLS_READ), ConversationController.getSummary);
router.delete('/:callId', authenticate, requirePermission(Permission.CALLS_STREAM), ConversationController.clearMemory);

export default router;
