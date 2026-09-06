import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { redisDb } from '../../database/redis';

const ALLOWED_PROVIDERS = ['GENERIC_TELEPHONY'];

// Bounded in-memory replay cache: Map<signature, expiryTimestamp>
// Used ONLY as a fallback if Redis is unavailable.
const replayCache = new Map<string, number>();
const MAX_CACHE_SIZE = 10000;

async function checkAndCacheSignature(signature: string, timestampMs: number): Promise<boolean> {
  const now = Date.now();
  // Keep in cache for 6 minutes (5 mins age + 1 min clock drift)
  const ttlSeconds = 6 * 60;
  
  // Try Redis first for distributed atomic replay protection
  const redisResult = await redisDb.setNX(`webhook_replay:${signature}`, now.toString(), ttlSeconds);
  
  if (redisResult === false) {
    return false; // Replayed (Redis correctly identified it as a duplicate)
  }
  
  if (redisResult === true) {
    return true; // Successfully cached in Redis
  }

  // If redisResult is null, Redis is offline. Fallback to degraded local memory protection.
  logger.warn('Redis unavailable. Webhook auth using degraded local memory replay protection.');
  
  // Bounded memory protection and cleanup
  if (replayCache.size > MAX_CACHE_SIZE) {
    for (const [sig, expiry] of replayCache.entries()) {
      if (now > expiry) {
        replayCache.delete(sig);
      }
    }
    if (replayCache.size > MAX_CACHE_SIZE) {
      replayCache.clear(); // Safe fallback to prevent OOM
    }
  }

  if (replayCache.has(signature)) {
    return false; // Replayed locally
  }

  replayCache.set(signature, timestampMs + (ttlSeconds * 1000));
  return true;
}

/**
 * Generic provider-agnostic webhook authentication middleware.
 * Verifies deterministic HMAC-SHA256 signatures, timestamps, provider identity, and prevents replays.
 */
export async function requireWebhookSignature(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const provider = req.header('X-Webhook-Provider');
    const signature = req.header('X-Webhook-Signature');
    const timestampStr = req.header('X-Webhook-Timestamp');

    if (!provider || !ALLOWED_PROVIDERS.includes(provider)) {
      res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Missing or unsupported webhook provider identity' });
      return;
    }

    if (!signature || !timestampStr) {
      res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Missing required webhook signatures' });
      return;
    }

    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) {
      res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid timestamp format' });
      return;
    }

    // Replay Protection: Reject requests older than 5 minutes
    const now = Date.now();
    const ageMs = now - timestamp;
    if (ageMs > 5 * 60 * 1000 || ageMs < -60000) { // Also allow 1 minute clock drift ahead
      res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Webhook timestamp expired or replayed' });
      return;
    }

    // STRICT RAW BODY: Signatures must be calculated over the exact received bytes.
    if (!(req as any).rawBody) {
      res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Webhook request missing raw body' });
      return;
    }
    
    const rawBodyStr = (req as any).rawBody.toString('utf8');
    const payloadToSign = `${timestampStr}.${rawBodyStr}`;

    const expectedSignature = crypto
      .createHmac('sha256', env.WEBHOOK_SECRET)
      .update(payloadToSign)
      .digest('hex');
      
    // Use timingSafeEqual to prevent timing attacks, buffer lengths must match
    const expectedBuffer = Buffer.from(expectedSignature);
    const signatureBuffer = Buffer.from(signature);
    
    if (expectedBuffer.length === signatureBuffer.length && crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) {
      // Signature matches. Now check replay cache.
      const isUnique = await checkAndCacheSignature(signature, timestamp);
      if (!isUnique) {
         res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Webhook payload already processed (replay detected)' });
         return;
      }
      
      next();
    } else {
      res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Invalid webhook signature' });
    }
  } catch (err) {
    // Fail safely without logging secrets or raw payloads
    logger.error('Webhook signature validation failed with an unexpected error.');
    res.status(500).json({ success: false, error: 'INTERNAL_SERVER_ERROR' });
  }
}
