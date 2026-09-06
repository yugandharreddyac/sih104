import rateLimit, { MemoryStore, Store, Options } from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redisDb } from '../database/redis';
import { rateLimitEventsTotal } from '../health/metrics.controller';

// A proxy store that seamlessly falls back to MemoryStore if Redis is unavailable.
class DegradableStore implements Store {
  private redisStore: RedisStore;
  private memoryStore: MemoryStore;

  constructor() {
    this.memoryStore = new MemoryStore();
    this.redisStore = new RedisStore({
      sendCommand: async (...args: string[]) => {
        const client = redisDb.getClient();
        if (!client) {
          return 'fake-sha' as any; // Prevent unhandled promise rejections during init()
        }
        return client.sendCommand(args);
      },
    });
  }

  public init(options: Options): void {
    if (this.memoryStore.init) this.memoryStore.init(options);
    if (this.redisStore.init) {
      try {
        this.redisStore.init(options);
      } catch (err) {
        // Fallback silently if Redis is offline during init
      }
    }
  }

  public async increment(key: string) {
    if (redisDb.isAvailable()) {
      try {
        return await this.redisStore.increment(key);
      } catch (err) {
        // Fallback on error
        return this.memoryStore.increment(key);
      }
    }
    return this.memoryStore.increment(key);
  }

  public async decrement(key: string) {
    if (redisDb.isAvailable()) {
      try {
        await this.redisStore.decrement(key);
        return;
      } catch (err) {
        // Fallback on error
      }
    }
    await this.memoryStore.decrement(key);
  }

  public async resetKey(key: string) {
    if (redisDb.isAvailable()) {
      try {
        await this.redisStore.resetKey(key);
        return;
      } catch (err) {
        // Fallback on error
      }
    }
    await this.memoryStore.resetKey(key);
  }
}

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  store: new DegradableStore(),
  handler: (req, res, next, options) => {
    rateLimitEventsTotal.inc({ type: 'api_global' });
    res.status(options.statusCode).send(options.message);
  },
  message: {
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests from this IP, please try again later.',
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: new DegradableStore(),
  handler: (req, res, next, options) => {
    rateLimitEventsTotal.inc({ type: 'auth' });
    res.status(options.statusCode).send(options.message);
  },
  message: {
    success: false,
    error: 'AUTH_RATE_LIMIT_EXCEEDED',
    message: 'Too many login attempts, please try again after 15 minutes.',
  },
});
