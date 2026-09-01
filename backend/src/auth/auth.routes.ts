import { Router } from 'express';
import { AuthController } from './auth.controller';
import { authenticate, requireRole } from './rbac';
import { RoleName } from './types';
import { authRateLimiter } from '../security/rate_limiter';

const router = Router();

router.post('/login', authRateLimiter, AuthController.login);
router.post('/register', authenticate, requireRole([RoleName.ADMIN]), AuthController.register);
router.get('/me', authenticate, AuthController.getProfile);

export const authRoutes = router;
