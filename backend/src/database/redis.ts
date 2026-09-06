import { createClient, RedisClientType } from 'redis';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { redisErrorsTotal } from '../health/metrics.controller';

export class RedisService {
  private client: RedisClientType | null = null;
  private isConnected = false;
  private isClosed = false;
  private initPromise: Promise<void> | null = null;

  public async initialize(): Promise<void> {
    if (this.isConnected) return;
    if (this.initPromise) return this.initPromise;

    this.isClosed = false;
    this.initPromise = (async () => {
      try {
        const client = createClient({
          url: env.REDIS_URL,
          socket: {
            connectTimeout: 2000, // 2 seconds timeout for initial connection
            reconnectStrategy: (retries: number) => {
              redisErrorsTotal.inc();
              if (this.isClosed) return new Error('Redis connection closed');
              if (process.env.NODE_ENV === 'test' && retries > 1) return new Error('Max retries in test');
              if (retries > 10) return new Error('Max Redis reconnects reached');
              // Exponential backoff, capped at 3 seconds
              return Math.min(retries * 200, 3000);
            }
          }
        });

        client.on('error', (err) => {
          redisErrorsTotal.inc();
          if (!this.isClosed && process.env.NODE_ENV !== 'test') {
            logger.warn(`⚠️ Redis Client Error: ${err.message}`);
          }
          this.isConnected = false;
        });

        client.on('ready', () => {
          this.isConnected = true;
          if (process.env.NODE_ENV !== 'test') {
            logger.info('✅ Redis Client Ready.');
          }
        });

        this.client = client as any;
        await this.client!.connect();

        if (this.isClosed) {
          await this.client!.disconnect().catch(() => {});
          return;
        }

        this.isConnected = true;
      } catch (err: any) {
        redisErrorsTotal.inc();
        this.isConnected = false;
        if (!this.isClosed && process.env.NODE_ENV !== 'test') {
          logger.warn(`⚠️ Redis initialization failed. Running in gracefully degraded mode. Error: ${err.message}`);
        }
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  public getClient(): RedisClientType | null {
    if (!this.isConnected || this.isClosed || !this.client) {
      return null;
    }
    return this.client;
  }

  public isAvailable(): boolean {
    return this.isConnected && !this.isClosed && this.client !== null;
  }

  public async get(key: string): Promise<string | null> {
    if (!this.isAvailable()) return null;
    try {
      return await this.client!.get(key);
    } catch (err: any) {
      redisErrorsTotal.inc();
      logger.warn(`Redis GET failed for ${key}: ${err.message}`);
      return null; // degrade safely
    }
  }

  public async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      if (ttlSeconds) {
        await this.client!.set(key, value, { EX: ttlSeconds });
      } else {
        await this.client!.set(key, value);
      }
    } catch (err: any) {
      redisErrorsTotal.inc();
      logger.warn(`Redis SET failed for ${key}: ${err.message}`);
      // Do not throw to support degraded mode
    }
  }

  public async setNX(key: string, value: string, ttlSeconds: number): Promise<boolean | null> {
    if (!this.isAvailable()) return null; // Null indicates unknown (fallback)
    try {
      const result = await this.client!.set(key, value, { EX: ttlSeconds, NX: true });
      return result === 'OK';
    } catch (err: any) {
      redisErrorsTotal.inc();
      logger.warn(`Redis SETNX failed for ${key}: ${err.message}`);
      return null;
    }
  }

  public async del(key: string): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      await this.client!.del(key);
    } catch (err: any) {
      redisErrorsTotal.inc();
      logger.warn(`Redis DEL failed for ${key}: ${err.message}`);
    }
  }

  public async checkHealth(): Promise<{ status: 'HEALTHY' | 'DISCONNECTED'; latencyMs: number }> {
    if (!this.isAvailable()) {
      return { status: 'DISCONNECTED', latencyMs: 0 };
    }
    try {
      const start = Date.now();
      await this.client!.ping();
      return { status: 'HEALTHY', latencyMs: Date.now() - start };
    } catch {
      return { status: 'DISCONNECTED', latencyMs: 0 };
    }
  }

  public async close(): Promise<void> {
    this.isClosed = true;
    try {
      if (this.client) {
        await this.client.quit().catch(() => this.client?.disconnect().catch(() => {}));
        this.client = null;
      }
    } catch (err) {
      // ignore
    }
    this.isConnected = false;
    this.initPromise = null;
  }
}

export const redisDb = new RedisService();
