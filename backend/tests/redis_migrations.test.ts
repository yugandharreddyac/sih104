import { redisDb } from '../src/database/redis';
import { VerificationService } from '../src/verification/verification.service';
import { requireWebhookSignature } from '../src/telephony/webhook/webhook_auth';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../src/config/env';

describe('Redis Migrations', () => {
  beforeAll(async () => {
    await redisDb.initialize();
  });

  afterAll(async () => {
    await redisDb.close();
  });

  describe('VerificationService', () => {
    it('should create and retrieve verification request using Redis', async () => {
      const req = await VerificationService.createVerificationRequest({
        callId: 'test-call',
        organizationId: 'org-1',
        mechanism: 'AUTHENTICATOR_PUSH',
        targetIdentity: 'testuser',
      });

      expect(req).toBeDefined();
      expect(req.id).toBeDefined();

      const retrieved = await VerificationService.getRequestById(req.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(req.id);
      expect(retrieved?.callId).toBe('test-call');
    });

    it('should list requests and resolve them', async () => {
      const req = await VerificationService.createVerificationRequest({
        callId: 'test-call-2',
        organizationId: 'org-2',
        mechanism: 'AUTHENTICATOR_PUSH',
        targetIdentity: 'testuser2',
      });

      const list = await VerificationService.listRequests('org-2');
      expect(list.length).toBeGreaterThan(0);
      expect(list.find(r => r.id === req.id)).toBeDefined();

      const resolved = await VerificationService.resolveRequest(req.id, 'APPROVED', 'actor-1');
      expect(resolved.status).toBe('APPROVED');

      const retrieved = await VerificationService.getRequestById(req.id);
      expect(retrieved?.status).toBe('APPROVED');
    });
  });

  describe('Webhook Auth (Replay Cache)', () => {
    const generateValidWebhookReq = () => {
      const timestamp = Date.now().toString();
      const rawBody = Buffer.from(JSON.stringify({ test: true }), 'utf8');
      
      const signature = crypto
        .createHmac('sha256', env.WEBHOOK_SECRET)
        .update(`${timestamp}.${rawBody.toString('utf8')}`)
        .digest('hex');

      return {
        header: (name: string) => {
          if (name === 'X-Webhook-Provider') return 'GENERIC_TELEPHONY';
          if (name === 'X-Webhook-Signature') return signature;
          if (name === 'X-Webhook-Timestamp') return timestamp;
          return null;
        },
        rawBody,
      } as unknown as Request;
    };

    it('should allow valid new webhook', async () => {
      const req = generateValidWebhookReq();
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;
      const next = jest.fn();

      await requireWebhookSignature(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should block replayed webhook', async () => {
      const req = generateValidWebhookReq();
      const res1 = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;
      const next1 = jest.fn();

      // First request passes
      await requireWebhookSignature(req, res1, next1);
      expect(next1).toHaveBeenCalled();

      const res2 = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as unknown as Response;
      const next2 = jest.fn();

      // Second identical request blocked by replay cache
      await requireWebhookSignature(req, res2, next2);
      expect(next2).not.toHaveBeenCalled();
      expect(res2.status).toHaveBeenCalledWith(401);
      expect(res2.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('replay detected') }));
    });
  });
});
