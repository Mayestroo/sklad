import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

export type SupportedLocale = 'uz' | 'ru';

const SUPPORTED_LOCALES: SupportedLocale[] = ['uz', 'ru'];
const DEFAULT_LOCALE: SupportedLocale = 'uz';

/**
 * Parses the Accept-Language header and sets req.locale to 'uz' or 'ru'.
 * Falls back to 'uz' if the header is missing or not recognized.
 */
@Injectable()
export class I18nMiddleware implements NestMiddleware {
  use(
    req: Request & { locale?: SupportedLocale },
    _res: Response,
    next: NextFunction,
  ) {
    const acceptLang = req.headers['accept-language'] || '';
    const requestedLocale = acceptLang
      .split(',')[0]
      ?.split('-')[0]
      ?.toLowerCase();

    req.locale = SUPPORTED_LOCALES.includes(requestedLocale as SupportedLocale)
      ? (requestedLocale as SupportedLocale)
      : DEFAULT_LOCALE;

    next();
  }
}
