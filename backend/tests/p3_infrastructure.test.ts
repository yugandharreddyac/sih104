import request from 'supertest';
import http from 'http';
import { WebSocket } from 'ws';
import { app, server } from '../src/server';
import { env } from '../src/config/env';
import { RedisPubSubService } from '../src/infrastructure/redis_pubsub';
import { WebSocketGateway } from '../src/websocket/ws_server';
import { createClient } from 'redis';
import { fork, ChildProcess } from 'child_process';
import path from 'path';
import { TokenService } from '../src/auth/jwt';
import { RoleName } from '../src/auth/types';
describe('Phase 3 Infrastructure (Prometheus & Redis)', () => {
  beforeAll(async () => {
    // Start the local instance (Instance A) for testing metrics and WebSocket on port 4001
    await new Promise<void>((resolve) => server.listen(4001, () => resolve()));
    await WebSocketGateway.initialize(server);
  });

  afterAll(async () => {
    await WebSocketGateway.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  describe('Prometheus Metrics', () => {
    it('GET /metrics should return 200 and Prometheus plain-text formatted metrics', async () => {
      await request(app).get('/api/health'); // Send dummy request to populate http_requests_total

      const res = await request(app).get('/metrics');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/plain');
      expect(res.text).toContain('http_requests_total');
      expect(res.text).toContain('active_ws_connections');
      expect(res.text).toContain('http_request_duration_ms');
    });
  });

  describe('Redis Pub/Sub Horizontal Scaling (Real Multi-Process Verification)', () => {
    let hasRedis = false;
    let instanceB: ChildProcess;
    let wsA: WebSocket; // Tenant 1 on Instance A
    let wsB: WebSocket; // Tenant 1 on Instance B
    let wsC: WebSocket; // Tenant 2 on Instance B

    beforeAll(async () => {
      try {
        const client = createClient({ url: env.REDIS_URL });
        await client.connect();
        await client.ping();
        await client.quit();
        hasRedis = true;
      } catch (err) {
        console.warn('Redis unavailable, skipping real cross-instance scaling test.');
        hasRedis = false;
      }

      if (hasRedis) {
        // Start Instance B on port 4002 using a child process
        const serverPath = path.join(__dirname, '../src/server.ts');
        instanceB = fork(path.join(__dirname, '../node_modules/tsx/dist/cli.mjs'), [serverPath], {
          env: { ...process.env, PORT: '4002', NODE_ENV: 'development' },
          stdio: 'pipe'
        });
        instanceB.stderr?.on('data', (d) => console.error('B_ERR:', d.toString()));
        instanceB.stdout?.on('data', (d) => console.log('B_OUT:', d.toString()));

        // Wait for Instance B to become healthy
        await new Promise<void>((resolve) => {
          const checkReady = async () => {
            try {
              const res = await fetch('http://localhost:4002/api/health');
              if (res.ok) resolve();
              else setTimeout(checkReady, 500);
            } catch {
              setTimeout(checkReady, 500);
            }
          };
          setTimeout(checkReady, 1000);
        });
      }
    }, 30000);

    afterAll(async () => {
      if (wsA) wsA.close();
      if (wsB) wsB.close();
      if (wsC) wsC.close();
      if (instanceB) {
        instanceB.kill();
      }
    });

    it('should properly distribute WS messages and enforce tenant isolation across instances via Redis', async () => {
      if (!hasRedis) {
        expect(true).toBe(true);
        return;
      }

      wsA = new WebSocket('ws://localhost:4001/ws');
      wsB = new WebSocket('ws://localhost:4002/ws');
      wsC = new WebSocket('ws://localhost:4002/ws');

      await Promise.all([
        new Promise<void>((resolve) => wsA.on('open', resolve)),
        new Promise<void>((resolve) => wsB.on('open', resolve)),
        new Promise<void>((resolve) => wsC.on('open', resolve)),
      ]);

      // Generate tokens for Tenant 1 and Tenant 2
      const tenant1Token = TokenService.generateToken({
        userId: 'u1',
        email: 't1@example.com',
        role: RoleName.ADMIN,
        organizationId: 'tenant-1'
      });

      const tenant2Token = TokenService.generateToken({
        userId: 'u2',
        email: 't2@example.com',
        role: RoleName.ADMIN,
        organizationId: 'tenant-2'
      });

      // Authenticate clients
      const authPromises = [
        new Promise<void>((resolve, reject) => {
          const handler = (data: any) => {
            console.log('wsA rx:', data.toString());
            const msg = JSON.parse(data.toString());
            if (msg.type === 'AUTHENTICATED') {
              wsA.off('message', handler);
              resolve();
            } else if (msg.type === 'ERROR') {
              reject(new Error(msg.message));
            }
          };
          wsA.on('message', handler);
          wsA.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: tenant1Token } }));
        }),
        new Promise<void>((resolve, reject) => {
          const handler = (data: any) => {
            console.log('wsB rx:', data.toString());
            const msg = JSON.parse(data.toString());
            if (msg.type === 'AUTHENTICATED') {
              wsB.off('message', handler);
              resolve();
            } else if (msg.type === 'ERROR') {
              reject(new Error(msg.message));
            }
          };
          wsB.on('message', handler);
          wsB.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: tenant1Token } }));
        }),
        new Promise<void>((resolve, reject) => {
          const handler = (data: any) => {
            console.log('wsC rx:', data.toString());
            const msg = JSON.parse(data.toString());
            if (msg.type === 'AUTHENTICATED') {
              wsC.off('message', handler);
              resolve();
            } else if (msg.type === 'ERROR') {
              reject(new Error(msg.message));
            }
          };
          wsC.on('message', handler);
          wsC.send(JSON.stringify({ type: 'AUTHENTICATE', payload: { token: tenant2Token } }));
        })
      ];

      await Promise.all(authPromises);

      let aReceivedCount = 0;
      let bReceivedCount = 0;
      let cReceivedCount = 0;

      wsA.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'SOC_ALERT' && msg.payload.message === 'TEST_CROSS_INSTANCE') {
          aReceivedCount++;
        }
      });
      wsB.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'SOC_ALERT' && msg.payload.message === 'TEST_CROSS_INSTANCE') {
          bReceivedCount++;
        }
      });
      wsC.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'SOC_ALERT' && msg.payload.message === 'TEST_CROSS_INSTANCE') {
          cReceivedCount++;
        }
      });

      // Trigger broadcast on Instance A for Tenant 1
      WebSocketGateway.broadcastAlert({
        callId: 'test-123',
        severity: 'CRITICAL',
        message: 'TEST_CROSS_INSTANCE',
        action: 'BLOCK',
        organizationId: 'tenant-1' // Target Tenant 1 explicitly
      });

      // Wait a moment for Redis propagation
      await new Promise((r) => setTimeout(r, 1000));

      // Assertions
      expect(aReceivedCount).toBe(1); // Exactly 1 local delivery, no duplicate from Redis
      expect(bReceivedCount).toBe(1); // Exactly 1 cross-instance delivery
      expect(cReceivedCount).toBe(0); // Tenant isolation enforced (tenant-2 should not receive)
    }, 15000);
  });
});
