import { Injectable, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  InjectThrottlerStorage,
  ThrottlerException,
  ThrottlerGuard,
  ThrottlerModule,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { createThrottlerStorage } from './throttler-storage';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * Limits are counted per client IP and per route (the throttler key is
 * controller + handler + IP), so heavy use of one screen never blocks another
 * route. The default is generous because an office of operators often shares
 * one public IP.
 */
export const DEFAULT_RATE_LIMIT = { ttl: MINUTE, limit: 300 };

/** Stricter limits for routes that are brute-force or abuse targets. */
export const STRICT_RATE_LIMITS = {
  login: { ttl: MINUTE, limit: 5 },
  register: { ttl: HOUR, limit: 5 },
  /** The emailed sign-up link (one-time, 256-bit token). */
  registerConfirm: { ttl: MINUTE, limit: 10 },
  /**
   * Webhook requests that fail the provider's signature / Basic-auth check.
   * Authenticated callbacks (including the providers' idempotent retries)
   * are never counted or limited.
   */
  webhookAuthFailure: { ttl: 15 * MINUTE, limit: 10 },
} as const;

/** `@Throttle()` argument for a strict route. */
export const strictThrottle = (
  name: keyof Omit<typeof STRICT_RATE_LIMITS, 'webhookAuthFailure'>,
) => ({ default: STRICT_RATE_LIMITS[name] });

/**
 * Counts webhook authentication failures per provider and IP; past the limit
 * the caller gets 429 until the window ends.
 */
@Injectable()
export class WebhookAuthFailureLimiter {
  constructor(
    @InjectThrottlerStorage() private readonly storage: ThrottlerStorage,
  ) {}

  async recordFailure(
    provider: 'click' | 'payme',
    ip: string | undefined,
  ): Promise<void> {
    const { ttl, limit } = STRICT_RATE_LIMITS.webhookAuthFailure;
    const { isBlocked } = await this.storage.increment(
      `webhook-auth-failure:${provider}:${ip ?? 'unknown'}`,
      ttl,
      limit,
      ttl,
      'webhook-auth-failure',
    );
    if (isBlocked) throw new ThrottlerException();
  }
}

/** Registers the throttler globally (every route, before auth guards). */
@Module({
  imports: [
    // Storage chosen once at startup: Redis with REDIS_URL, else in memory
    // (warned in production). See throttler-storage.ts.
    ThrottlerModule.forRootAsync({
      useFactory: () => ({
        throttlers: [{ name: 'default', ...DEFAULT_RATE_LIMIT }],
        storage: createThrottlerStorage(process.env),
      }),
    }),
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    WebhookAuthFailureLimiter,
  ],
  exports: [WebhookAuthFailureLimiter],
})
export class RateLimitModule {}

/**
 * Behind a reverse proxy every request arrives from the proxy's address, so
 * all clients would share one limit. `TRUST_PROXY` tells Express how many
 * proxy hops to trust (e.g. `1`) or which proxy addresses (e.g. `loopback`,
 * a CIDR list), so `req.ip` is the real client. Unset: trust nothing.
 * `true` is refused: it lets any client choose its IP via X-Forwarded-For.
 */
export function configureTrustProxy(
  app: NestExpressApplication,
  value: string | undefined,
): void {
  const setting = value?.trim();
  if (!setting) return;
  if (setting.toLowerCase() === 'true') {
    throw new Error(
      'TRUST_PROXY=true would let clients spoof their IP and bypass rate limits; set the number of proxy hops (e.g. 1) or the proxy addresses instead',
    );
  }
  app.set('trust proxy', /^\d+$/.test(setting) ? Number(setting) : setting);
}
