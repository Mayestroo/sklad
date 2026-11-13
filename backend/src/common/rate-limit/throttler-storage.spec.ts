import { ThrottlerStorage } from '@nestjs/throttler';
import {
  createThrottlerStorage,
  RATE_LIMIT_SCRIPT,
  RedisEvalClient,
  RedisThrottlerStorage,
} from './throttler-storage';

/**
 * A fake Redis that executes RATE_LIMIT_SCRIPT's logic in JS over an
 * in-memory key space with a controllable clock. The Lua itself runs
 * against a real Redis in throttler-storage.int-spec.ts.
 */
class FakeRedis implements RedisEvalClient {
  now = 0;
  private readonly data = new Map<
    string,
    { value: number; expiresAt: number | null }
  >();
  calls: Array<Array<string | number>> = [];
  quit = jest.fn(() => Promise.resolve('OK'));

  private live(key: string) {
    const entry = this.data.get(key);
    if (entry && entry.expiresAt !== null && entry.expiresAt <= this.now) {
      this.data.delete(key);
      return undefined;
    }
    return entry;
  }

  private pttl(key: string) {
    const entry = this.live(key);
    if (!entry) return -2;
    return entry.expiresAt === null ? -1 : entry.expiresAt - this.now;
  }

  eval(script: string, numKeys: number, ...args: Array<string | number>) {
    expect(script).toBe(RATE_LIMIT_SCRIPT);
    expect(numKeys).toBe(2);
    this.calls.push(args);
    const [hitsKey, blockKey, ttl, limit, blockDuration] = args as [
      string,
      string,
      number,
      number,
      number,
    ];
    const blockTtl = this.pttl(blockKey);
    if (blockTtl > 0) {
      return Promise.resolve([
        this.live(blockKey)!.value,
        blockTtl,
        1,
        blockTtl,
      ]);
    }
    const entry = this.live(hitsKey) ?? { value: 0, expiresAt: null };
    entry.value += 1;
    this.data.set(hitsKey, entry);
    let hitsTtl = this.pttl(hitsKey);
    if (hitsTtl < 0) {
      entry.expiresAt = this.now + ttl;
      hitsTtl = ttl;
    }
    if (entry.value > limit) {
      this.data.set(blockKey, {
        value: entry.value,
        expiresAt: this.now + blockDuration,
      });
      this.data.delete(hitsKey);
      return Promise.resolve([entry.value, blockDuration, 1, blockDuration]);
    }
    return Promise.resolve([entry.value, hitsTtl, 0, 0]);
  }
}

describe('RedisThrottlerStorage', () => {
  const hit = (storage: RedisThrottlerStorage, key = 'ip-1') =>
    storage.increment(key, 60_000, 2, 30_000, 'default');

  it('counts hits, blocks past the limit, and does not count while blocked', async () => {
    const redis = new FakeRedis();
    const storage = new RedisThrottlerStorage(redis);

    expect(await hit(storage)).toEqual({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
    expect((await hit(storage)).isBlocked).toBe(false);

    const third = await hit(storage);
    expect(third).toEqual({
      totalHits: 3,
      timeToExpire: 30,
      isBlocked: true,
      timeToBlockExpire: 30,
    });

    redis.now += 10_000;
    const whileBlocked = await hit(storage);
    expect(whileBlocked.isBlocked).toBe(true);
    expect(whileBlocked.totalHits).toBe(3);
    expect(whileBlocked.timeToBlockExpire).toBe(20);
  });

  it('starts a fresh count once the block ends (like the in-memory storage)', async () => {
    const redis = new FakeRedis();
    const storage = new RedisThrottlerStorage(redis);
    await hit(storage);
    await hit(storage);
    await hit(storage); // blocked
    redis.now += 30_001;
    expect(await hit(storage)).toMatchObject({
      totalHits: 1,
      isBlocked: false,
    });
  });

  it('keeps keys of different clients and throttlers apart', async () => {
    const redis = new FakeRedis();
    const storage = new RedisThrottlerStorage(redis);
    await hit(storage, 'ip-1');
    await hit(storage, 'ip-1');
    expect((await hit(storage, 'ip-2')).totalHits).toBe(1);
    await storage.increment('ip-1', 60_000, 2, 30_000, 'login');
    expect(redis.calls.map((c) => c[0])).toEqual([
      'sklad:throttle:default:ip-1:hits',
      'sklad:throttle:default:ip-1:hits',
      'sklad:throttle:default:ip-2:hits',
      'sklad:throttle:login:ip-1:hits',
    ]);
  });

  it('counts in memory when Redis fails, instead of failing the request', async () => {
    const redis: RedisEvalClient = {
      eval: jest.fn(() => Promise.reject(new Error('ECONNREFUSED'))),
    };
    const record = {
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    };
    const increment = jest.fn(() => Promise.resolve(record));
    const fallback: ThrottlerStorage = { increment };
    const storage = new RedisThrottlerStorage(redis, fallback);
    jest.spyOn(storage['logger'], 'error').mockImplementation(() => undefined);

    await expect(hit(storage)).resolves.toBe(record);
    expect(increment).toHaveBeenCalledWith(
      'ip-1',
      60_000,
      2,
      30_000,
      'default',
    );
  });

  it('closes the Redis connection on shutdown', async () => {
    const redis = new FakeRedis();
    await new RedisThrottlerStorage(redis).onApplicationShutdown();
    expect(redis.quit).toHaveBeenCalled();
  });
});

describe('createThrottlerStorage (startup choice)', () => {
  const logger = () => ({ warn: jest.fn(), log: jest.fn(), error: jest.fn() });

  it('uses Redis when REDIS_URL is set', () => {
    const log = logger();
    const createRedis = jest.fn(() => new FakeRedis());
    const storage = createThrottlerStorage(
      { REDIS_URL: ' redis://cache:6379/0 ', NODE_ENV: 'production' },
      { logger: log, createRedis },
    );
    expect(storage).toBeInstanceOf(RedisThrottlerStorage);
    expect(createRedis).toHaveBeenCalledWith('redis://cache:6379/0');
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('keeps the in-memory storage and warns in production without REDIS_URL', () => {
    const log = logger();
    const createRedis = jest.fn();
    expect(
      createThrottlerStorage(
        { NODE_ENV: 'production' },
        { logger: log, createRedis },
      ),
    ).toBeUndefined();
    expect(createRedis).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('REDIS_URL is not set'),
    );
  });

  it('stays quiet outside production without REDIS_URL', () => {
    const log = logger();
    expect(
      createThrottlerStorage(
        { NODE_ENV: 'development', REDIS_URL: '  ' },
        { logger: log },
      ),
    ).toBeUndefined();
    expect(log.warn).not.toHaveBeenCalled();
  });
});
