import request from 'supertest';
import { app } from '../src/server';
import { redisDb } from '../src/database/redis';
import { db } from '../src/database/db';
import { env } from '../src/config/env';

describe('Observability & Health', () => {
  let originalEnv: string | undefined;

  beforeAll(() => {
    originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
  });

  afterAll(async () => {
    process.env.NODE_ENV = originalEnv;
    await redisDb.close();
    await db.close();
  });

  it('GET /api/health/live should return ALIVE', async () => {
    const res = await request(app).get('/api/health/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ALIVE');
  });

  it('GET /api/health/ready should return 200', async () => {
    const res = await request(app).get('/api/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.ready).toBeDefined();
  });

  it('GET /api/health should return health components', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBeDefined();
    expect(res.body.components).toBeDefined();
    expect(res.body.components.database).toBeDefined();
    expect(res.body.components.redis).toBeDefined();
  });

  it('GET /metrics should expose Prometheus metrics', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.text).toContain('redis_errors_total');
    expect(res.text).toContain('rate_limit_events_total');
    expect(res.text).toContain('active_ws_connections');
  });
});
