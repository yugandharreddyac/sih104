import { createClient, RedisClientType } from 'redis';
import { env } from '../config/env';
import crypto from 'crypto';

export const INSTANCE_ID = crypto.randomUUID();
export const REDIS_CHANNEL = 'voxshield_ws_events';

export type PubSubCallback = (message: any, publisherId: string) => void;

class RedisPubSub {
  private pubClient: RedisClientType | null = null;
  private subClient: RedisClientType | null = null;
  private isConnected = false;
  private isClosed = false;
  private initPromise: Promise<void> | null = null;
  private callbacks: PubSubCallback[] = [];

  public async initialize(): Promise<void> {
    if (this.isConnected) return;
    if (this.initPromise) return this.initPromise;

    this.isClosed = false;
    this.initPromise = (async () => {
      try {
        const redisConfig = {
          url: env.REDIS_URL,
          socket: {
            connectTimeout: 500,
            reconnectStrategy: (retries: number) => {
              if (this.isClosed || retries > 3) return new Error('Redis connection failed');
              return Math.min(retries * 50, 500);
            }
          }
        };

        const pub = createClient(redisConfig);
        const sub = createClient(redisConfig);
        this.pubClient = pub as any;
        this.subClient = sub as any;

        pub.on('error', (err) => {
          if (!this.isClosed && process.env.NODE_ENV !== 'test') {
            console.warn(`⚠️ Redis Pub Client Error: ${err.message}`);
          }
        });
        sub.on('error', (err) => {
          if (!this.isClosed && process.env.NODE_ENV !== 'test') {
            console.warn(`⚠️ Redis Sub Client Error: ${err.message}`);
          }
        });

        await pub.connect();
        await sub.connect();

        if (this.isClosed) {
          await pub.disconnect().catch(() => {});
          await sub.disconnect().catch(() => {});
          return;
        }

        this.isConnected = true;
        if (process.env.NODE_ENV !== 'test') {
          console.info(`📡 Redis Pub/Sub initialized. Cross-instance scaling active. Instance ID: ${INSTANCE_ID}`);
        }

        await sub.subscribe(REDIS_CHANNEL, (messageStr) => {
          try {
            const parsed = JSON.parse(messageStr);
            if (parsed.publisherId === INSTANCE_ID) return;

            for (const cb of this.callbacks) {
              cb(parsed.payload, parsed.publisherId);
            }
          } catch (e) {
            // ignore
          }
        });
      } catch (err: any) {
        this.isConnected = false;
        if (!this.isClosed && process.env.NODE_ENV !== 'test') {
          console.warn(`⚠️ Redis Pub/Sub initialization failed. Degraded mode active (Local WebSocket broadcasting only). Error: ${err.message}`);
        }
      } finally {
        this.initPromise = null;
      }
    })();

    return this.initPromise;
  }

  public subscribe(callback: PubSubCallback): void {
    this.callbacks.push(callback);
  }

  public async publish(payload: any): Promise<void> {
    if (!this.isConnected || !this.pubClient || this.isClosed) {
      return; // Safe degraded mode: do nothing
    }
    try {
      const message = JSON.stringify({
        publisherId: INSTANCE_ID,
        payload,
      });
      await this.pubClient.publish(REDIS_CHANNEL, message);
    } catch (err: any) {
      if (!this.isClosed && process.env.NODE_ENV !== 'test') {
        console.warn(`⚠️ Redis publish failed: ${err.message}`);
      }
    }
  }

  public async close(): Promise<void> {
    this.isClosed = true;
    try {
      if (this.subClient) {
        if (this.subClient.isOpen) {
          await this.subClient.unsubscribe(REDIS_CHANNEL).catch(() => {});
        }
        await this.subClient.disconnect().catch(() => {});
        this.subClient = null;
      }
      if (this.pubClient) {
        await this.pubClient.disconnect().catch(() => {});
        this.pubClient = null;
      }
    } catch (err) {
      // ignore
    }
    this.isConnected = false;
    this.initPromise = null;
  }
}

export const RedisPubSubService = new RedisPubSub();
