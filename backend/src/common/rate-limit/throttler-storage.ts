import { Logger, OnApplicationShutdown } from '@nestjs/common';
import { ThrottlerStorage, ThrottlerStorageService } from '@nestjs/throttler';
import Redis from 'ioredis';

/**
 * Rate-limit counter storage (D5).
 *
 * With `REDIS_URL` set the counters live in Redis, shared by every API
 * process and kept across restarts. Without it they stay in process memory
 * (fine for one instance; logged as a warning in production).
 */

/** What RedisThrottlerStorage needs from a Redis client (ioredis fits). */
export interface RedisEvalClient {
  eval(
    script: string,
    numKeys: number,
    ...args: Array<string | number>
  ): Promise<unknown>;
  quit?(): Promise<unknown>;
  disconnect?(): void;
  /** ioredis' socket; destroyed on shutdown if a failed QUIT left it open. */
  stream?: { destroyed?: boolean; destroy(): void } | null;
  /** ioredis' connection state ('end' once fully closed). */
  status?: string;
  once?(event: 'end', listener: () => void): unknown;
}

/**
 * One atomic step per request, same semantics as the in-memory storage:
 * while a key is blocked nothing is counted; going over the limit blocks
 * for `blockDuration` and starts a fresh count once the block ends.
 * Fixed window: the window starts with the first hit.
 *
 * KEYS[1] hit counter, KEYS[2] block marker.
 * ARGV ttl ms, limit, block duration ms.
 * Returns { hits, hitsTtlMs, blocked (0/1), blockTtlMs }.
 */
export const RATE_LIMIT_SCRIPT = `
local hitsKey = KEYS[1]
local blockKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local blockDuration = tonumber(ARGV[3])

local blockTtl = redis.call('PTTL', blockKey)
if blockTtl > 0 then
  local blockedHits = tonumber(redis.call('GET', blockKey) or '0')
  return { blockedHits, blockTtl, 1, blockTtl }
end

local hits = redis.call('INCR', hitsKey)
local hitsTtl = redis.call('PTTL', hitsKey)
if hitsTtl < 0 then
  redis.call('PEXPIRE', hitsKey, ttl)
  hitsTtl = ttl
end

if hits > limit then
  redis.call('SET', blockKey, hits, 'PX', blockDuration)
  redis.call('DEL', hitsKey)
  return { hits, blockDuration, 1, blockDuration }
end
return { hits, hitsTtl, 0, 0 }
`;

type ThrottlerStorageRecord = Awaited<
  ReturnType<ThrottlerStorage['increment']>
>;

const seconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000));

export class RedisThrottlerStorage
  implements ThrottlerStorage, OnApplicationShutdown
{
  private readonly logger = new Logger('RateLimit');
  private lastErrorLog = 0;
  private shutdown?: Promise<void>;

  constructor(
    private readonly redis: RedisEvalClient,
    /** Used while Redis is unreachable, so the API keeps answering. */
    private readonly fallback: ThrottlerStorage = new ThrottlerStorageService(),
    private readonly prefix = 'sklad:throttle',
    /** How long shutdown waits for a graceful QUIT before dropping the socket. */
    private readonly quitTimeoutMs = 1_000,
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const base = `${this.prefix}:${throttlerName}:${key}`;
    try {
      const reply = await this.redis.eval(
        RATE_LIMIT_SCRIPT,
        2,
        `${base}:hits`,
        `${base}:block`,
        ttl,
        limit,
        blockDuration,
      );
      if (!Array.isArray(reply) || reply.length !== 4) {
        throw new Error(`unexpected Redis reply: ${JSON.stringify(reply)}`);
      }
      const [hits, hitsTtlMs, blocked, blockTtlMs] = reply.map(Number);
      return {
        totalHits: hits,
        timeToExpire: seconds(hitsTtlMs),
        isBlocked: blocked === 1,
        timeToBlockExpire: seconds(blockTtlMs),
      };
    } catch (error) {
      // Degrade to per-process counting rather than failing every request
      // (fail-open would drop the limits, fail-closed would take the API
      // down with Redis). Logged at most once a minute.
      const now = Date.now();
      if (now - this.lastErrorLog > 60_000) {
        this.lastErrorLog = now;
        this.logger.error(
          `Redis rate-limit storage failed, counting in memory until it recovers: ${(error as Error).message}`,
        );
      }
      return this.fallback.increment(
        key,
        ttl,
        limit,
        blockDuration,
        throttlerName,
      );
    }
  }

  /**
   * Shutdown must never depend on Redis: QUIT waits for a connection that an
   * unreachable server never gives, so after `quitTimeoutMs` the socket is
   * dropped instead (seen as a hanging app.close() in the e2e suite).
   */
  onApplicationShutdown(): Promise<void> {
    // The instance is registered under two tokens (the storage provider and
    // ThrottlerModule's storage), so Nest calls this hook twice: close once.
    this.shutdown ??= this.close();
    return this.shutdown;
  }

  private async close(): Promise<void> {
    // The in-memory fallback is not a Nest provider either: its per-hit
    // expiry timers (1 h for sign-up) would keep the process alive.
    (this.fallback as Partial<OnApplicationShutdown>).onApplicationShutdown?.();
    if (!this.redis.quit) {
      this.dropConnection();
      return;
    }
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), this.quitTimeoutMs);
    });
    // QUIT's reply comes before the socket closes: wait for 'end' too, all
    // within quitTimeoutMs, so app.close() returns with the socket gone.
    const quitAndEnd = this.redis.quit().then(
      async () => {
        const redis = this.redis;
        if (redis.status !== 'end' && redis.once) {
          await new Promise<void>((resolve) => {
            redis.once?.('end', resolve);
          });
        }
        return 'quit' as const;
      },
      () => 'failed' as const,
    );
    const outcome = await Promise.race([quitAndEnd, timedOut]);
    clearTimeout(timer);
    if (outcome !== 'quit') this.dropConnection();
  }

  /**
   * disconnect() only half-closes the socket (end()); a peer that accepted
   * the TCP connection but never answers (seen with localhost -> ::1 under
   * Docker Desktop) never completes the close, and the open socket keeps
   * the process alive. Destroy it.
   */
  private dropConnection(): void {
    this.redis.disconnect?.();
    const stream = this.redis.stream;
    if (stream && !stream.destroyed) stream.destroy();
  }
}

export interface ThrottlerStorageEnv {
  REDIS_URL?: string;
  NODE_ENV?: string;
}

export interface ThrottlerStorageDeps {
  logger?: Pick<Logger, 'warn' | 'log' | 'error'>;
  createRedis?: (url: string) => RedisEvalClient;
}

function createIoRedis(url: string): RedisEvalClient {
  const logger = new Logger('RateLimit');
  let lastLog = 0;
  const client = new Redis(url, {
    // Fail fast while disconnected: the storage then counts in memory.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });
  client.on('error', (error: Error) => {
    const now = Date.now();
    if (now - lastLog > 60_000) {
      lastLog = now;
      logger.error(`Redis connection error: ${error.message}`);
    }
  });
  return client;
}

/**
 * The storage for ThrottlerModule: Redis when `REDIS_URL` is set, otherwise
 * `undefined` (the module's default in-memory storage).
 */
export function createThrottlerStorage(
  env: ThrottlerStorageEnv,
  deps: ThrottlerStorageDeps = {},
): ThrottlerStorage | undefined {
  const logger = deps.logger ?? new Logger('RateLimit');
  const url = env.REDIS_URL?.trim();
  if (url) {
    logger.log('Rate-limit counters are stored in Redis (REDIS_URL).');
    return new RedisThrottlerStorage((deps.createRedis ?? createIoRedis)(url));
  }
  if (env.NODE_ENV === 'production') {
    logger.warn(
      'REDIS_URL is not set: rate-limit counters are kept in process memory. ' +
        'Each API instance counts separately and counters reset on restart. ' +
        'Set REDIS_URL before running more than one instance.',
    );
  }
  return undefined;
}
