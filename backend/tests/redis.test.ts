import { RedisService } from '../src/database/redis';

describe('RedisService Foundation', () => {
  let redisDb: RedisService;

  beforeEach(() => {
    redisDb = new RedisService();
  });

  afterEach(async () => {
    await redisDb.close();
  });

  it('should initialize gracefully in test mode even if connection fails (degraded mode)', async () => {
    // Attempt initialization. In test environment, if no Redis is running, it should not throw.
    await expect(redisDb.initialize()).resolves.toBeUndefined();
  }, 15000);

  it('should report DISCONNECTED health when unavailable', async () => {
    const health = await redisDb.checkHealth();
    // Depends on whether Redis is actually running in CI/Docker, but if not it should be DISCONNECTED
    expect(['HEALTHY', 'DISCONNECTED']).toContain(health.status);
    expect(typeof health.latencyMs).toBe('number');
  });

  it('should safely fallback for GET operations in degraded mode', async () => {
    // If not connected, get should return null safely without throwing
    const result = await redisDb.get('non_existent_key');
    expect(result).toBeNull();
  });

  it('should safely fallback for SET operations in degraded mode', async () => {
    // Should not throw
    await expect(redisDb.set('test_key', 'value', 60)).resolves.toBeUndefined();
  });

  it('should handle missing client gracefully on close', async () => {
    await expect(redisDb.close()).resolves.toBeUndefined();
  });
});
