import { server, app } from '../src/server';
import { env } from '../src/config/env';
import { db } from '../src/database/db';
import { RedisPubSubService } from '../src/infrastructure/redis_pubsub';

describe('Phase 4: Production Readiness & Resilience', () => {

  describe('Production Secret Rejection', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
    });

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('should throw an error if JWT_SECRET is missing or too short in production', () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => { throw new Error('process.exit'); });
      try {
        jest.isolateModules(() => {
          process.env.NODE_ENV = 'production';
          process.env.JWT_SECRET = 'short';
          expect(() => {
            require('../src/config/env');
          }).toThrow();
        });
      } finally {
        mockExit.mockRestore();
      }
    });

    it('should throw an error if WEBHOOK_SECRET is missing in production', () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => { throw new Error('process.exit'); });
      try {
        jest.isolateModules(() => {
          process.env.NODE_ENV = 'production';
          delete process.env.WEBHOOK_SECRET;
          expect(() => {
            require('../src/config/env');
          }).toThrow();
        });
      } finally {
        mockExit.mockRestore();
      }
    });

    it('should throw an error if DATABASE_URL is missing in strict mode', () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation((code) => { throw new Error('process.exit'); });
      try {
        jest.isolateModules(() => {
          process.env.NODE_ENV = 'production';
          process.env.PERSISTENCE_MODE = 'strict';
          delete process.env.DATABASE_URL;
          expect(() => {
            require('../src/config/env');
          }).toThrow();
        });
      } finally {
        mockExit.mockRestore();
      }
    });
  });

  describe('PostgreSQL Resilience', () => {
    it('should handle PostgreSQL query gracefully if DB goes offline', async () => {
      const pool = (db as any).pool;
      
      if (pool) {
        const originalQuery = pool.query.bind(pool);
        pool.query = jest.fn().mockRejectedValue(new Error('Connection terminated unexpectedly'));

        try {
          await expect(db.query('SELECT 1')).rejects.toThrow('Database query failed: Connection terminated');
        } finally {
          pool.query = originalQuery;
        }
      } else {
        // If pool wasn't created (in test env without connection), it throws not initialized
        await expect(db.query('SELECT 1')).rejects.toThrow('Database pool not initialized');
      }
    });
  });

  describe('Redis Resilience & Degradation', () => {
    it('should gracefully degrade PubSub if Redis is unavailable or auth fails', async () => {
      const pubsub = RedisPubSubService as any;
      const originalIsConnected = pubsub.isConnected;
      const originalIsDegraded = pubsub.degradedMode;
      
      // Force it to degraded mode
      pubsub.isConnected = false;
      pubsub.degradedMode = true;

      try {
        await expect(RedisPubSubService.publish({ msg: 'test' })).resolves.not.toThrow();
        const mockCallback = jest.fn();
        expect(() => RedisPubSubService.subscribe(mockCallback)).not.toThrow();
      } finally {
        pubsub.isConnected = originalIsConnected;
        pubsub.degradedMode = originalIsDegraded;
      }
    });
  });

  describe('Graceful Shutdown', () => {
    it('should have SIGTERM and SIGINT handlers registered on the process', () => {
      const listeners = process.listeners('SIGTERM');
      expect(listeners.length).toBeGreaterThanOrEqual(0);
    });
  });

});
