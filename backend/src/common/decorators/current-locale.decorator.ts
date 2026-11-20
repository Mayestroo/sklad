import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AppRequest } from '../auth/request-context';

export type AppLocale = 'uz' | 'ru';

/**
 * The request language set by `I18nMiddleware` ('uz' default, or 'ru'), for
 * services that write their own user-facing messages.
 * Usage: @CurrentLocale() locale: AppLocale
 */
export const CurrentLocale = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AppLocale => {
    const request = ctx.switchToHttp().getRequest<AppRequest>();
    return request.locale === 'ru' ? 'ru' : 'uz';
  },
);
