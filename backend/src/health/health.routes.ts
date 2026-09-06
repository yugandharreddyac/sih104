import { Router } from 'express';
import { HealthController } from './health.controller';
import { ReadinessController } from './readiness.controller';

const router = Router();

router.get('/', HealthController.check);
router.get('/ready', ReadinessController.check);
router.get('/live', (req, res) => res.status(200).json({ status: 'ALIVE' }));

export const healthRoutes = router;
