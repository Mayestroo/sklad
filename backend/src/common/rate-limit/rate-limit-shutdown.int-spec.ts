/**
 * Integration test (real Redis, REDIS_URL_TEST, e.g. redis://127.0.0.1:6379/15).
 * With REDIS_URL set, closing the Nest app must close the rate-limit Redis
 * connection: the storage used to be built inside the ThrottlerModule options,
 * not as a provider, so Nest never ran its shutdown hook and the open socket
 * kept the e2e Jest process alive (round 4). Skipped without REDIS_URL_TEST.
 */
import { Test } from '@nestjs/testing';
import { getStorageToken } from '@nestjs/throttler';
import { RateLimitModule } from './rate-limit';

const url = process.env.REDIS_URL_TEST;
const describeRedis = url ? describe : describe.skip;

describeRedis('RateLimitModule shutdown (integration)', () => {
  const previous = process.env.REDIS_URL;

  afterAll(() => {
    if (previous === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previous;
  });

  it('closes the Redis connection when the app closes', async () => {
    process.env.REDIS_URL = url;
    const moduleRef = await Test.createTestingModule({
      imports: [RateLimitModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const storage = app.get(getStorageToken());
    const redis = (
      storage as {
        redis: { status: string; once(event: 'ready', fn: () => void): void };
      }
    ).redis;
    if (redis.status !== 'ready') {
      await new Promise<void>((resolve) => redis.once('ready', resolve));
    }
    expect(redis.status).toBe('ready');

    await app.close();

    expect(redis.status).toBe('end');
  });
});
