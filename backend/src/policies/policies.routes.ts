import { Router } from 'express';
import { PoliciesController } from './policies.controller';
import { authenticate, requirePermission } from '../auth/rbac';
import { Permission } from '../auth/types';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission(Permission.POLICIES_READ), PoliciesController.listPolicies);
router.get('/:id', requirePermission(Permission.POLICIES_READ), PoliciesController.getPolicy);
router.post('/evaluate', requirePermission(Permission.POLICIES_READ), PoliciesController.evaluate);

export const policyRoutes = router;
