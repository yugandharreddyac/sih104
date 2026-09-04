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
  private callbacks: PubSubCallback[] = [];

  public async initialize(): Promise<void> {
    try {
      const redisConfig = {
        url: env.REDIS_URL,
        socket: {
          connectTimeout: 500,
          reconnectStrategy: (retries: number) => {
            if (retries > 3) return new Error('Redis connection failed');
            return Math.min(retries * 50, 500);
          }
        }
      };
      
      this.pubClient = createClient(redisConfig);
      this.subClient = createClient(redisConfig);

      this.pubClient.on('error', (err) => console.warn(`⚠️ Redis Pub Client Error: ${err.message}`));
      this.subClient.on('error', (err) => console.warn(`⚠️ Redis Sub Client Error: ${err.message}`));

      await this.pubClient.connect();
      await this.subClient.connect();

      this.isConnected = true;
      console.info(`📡 Redis Pub/Sub initialized. Cross-instance scaling active. Instance ID: ${INSTANCE_ID}`);

      await this.subClient.subscribe(REDIS_CHANNEL, (messageStr) => {
        try {
          const parsed = JSON.parse(messageStr);
          // Prevent duplicate processing of our own messages
          if (parsed.publisherId === INSTANCE_ID) return;

          for (const cb of this.callbacks) {
            cb(parsed.payload, parsed.publisherId);
          }
        } catch (e) {
          console.error('Failed to parse Redis message', e);
        }
      });
    } catch (err: any) {
      this.isConnected = false;
      console.warn(`⚠️ Redis Pub/Sub initialization failed. Degraded mode active (Local WebSocket broadcasting only). Error: ${err.message}`);
    }
  }

  public subscribe(callback: PubSubCallback): void {
    this.callbacks.push(callback);
  }

  public async publish(payload: any): Promise<void> {
    if (!this.isConnected || !this.pubClient) {
      return; // Safe degraded mode: do nothing
    }
    try {
      const message = JSON.stringify({
        publisherId: INSTANCE_ID,
        payload,
      });
      await this.pubClient.publish(REDIS_CHANNEL, message);
    } catch (err: any) {
      console.warn(`⚠️ Redis publish failed: ${err.message}`);
    }
  }

  public async close(): Promise<void> {
    try {
      if (this.subClient && this.subClient.isOpen) {
        await this.subClient.unsubscribe(REDIS_CHANNEL).catch(() => {});
        await this.subClient.disconnect();
      }
      if (this.pubClient && this.pubClient.isOpen) {
        await this.pubClient.disconnect();
      }
    } catch (err) {
      // ignore
    }
    this.isConnected = false;
  }
}

export const RedisPubSubService = new RedisPubSub();
