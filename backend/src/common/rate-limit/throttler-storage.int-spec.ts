/**
 * Integration test for the Redis rate-limit storage (D5): runs
 * RATE_LIMIT_SCRIPT on a real Redis. Needs REDIS_URL_TEST, e.g.
 *   docker-compose up -d redis
 *   REDIS_URL_TEST=redis://127.0.0.1:6379/15 npm run test:integration
 * Skipped (reported as skipped, not passed) when REDIS_URL_TEST is unset.
 */
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { RedisThrottlerStorage } from './throttler-storage';

const url = process.env.REDIS_URL_TEST;
const describeRedis = url ? describe : describe.skip;

describeRedis('RedisThrottlerStorage on a real Redis (integration)', () => {
  let redis: Redis;
  let storage: RedisThrottlerStorage;
  let prefix: string;

  beforeAll(() => {
    redis = new Redis(url!, { maxRetriesPerRequest: 1 });
    prefix = `sklad:throttle-test:${randomUUID()}`;
    storage = new RedisThrottlerStorage(redis, undefined, prefix);
  });

  afterAll(async () => {
    const keys = await redis.keys(`${prefix}:*`);
    if (keys.length) await redis.del(...keys);
    await redis.quit();
  });

  it('counts, blocks past the limit, stops counting while blocked, then resets', async () => {
    const hit = () => storage.increment('ip-1', 60_000, 2, 1_000, 'default');

    expect(await hit()).toMatchObject({
      totalHits: 1,
      isBlocked: false,
      timeToExpire: 60,
    });
    expect(await hit()).toMatchObject({ totalHits: 2, isBlocked: false });
    expect(await hit()).toMatchObject({
      totalHits: 3,
      isBlocked: true,
      timeToBlockExpire: 1,
    });
    expect(await hit()).toMatchObject({ totalHits: 3, isBlocked: true });

    // the hit window keeps its TTL, the block key has one too (no leaks)
    expect(await redis.pttl(`${prefix}:default:ip-1:block`)).toBeGreaterThan(0);

    await new Promise((resolve) => setTimeout(resolve, 1_100));
    expect(await hit()).toMatchObject({ totalHits: 1, isBlocked: false });
  });

  it('shares counters between two storage instances (two API processes)', async () => {
    const second = new RedisThrottlerStorage(redis, undefined, prefix);
    await storage.increment('ip-2', 60_000, 10, 1_000, 'default');
    expect(
      (await second.increment('ip-2', 60_000, 10, 1_000, 'default')).totalHits,
    ).toBe(2);
  });

  it('expires the hit counter after the window', async () => {
    await storage.increment('ip-3', 200, 10, 1_000, 'default');
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(
      (await storage.increment('ip-3', 200, 10, 1_000, 'default')).totalHits,
    ).toBe(1);
  });
});
