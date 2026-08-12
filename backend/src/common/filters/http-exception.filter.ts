import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

const ERROR_MESSAGES: Record<string, Record<string, string>> = {
  UNAUTHORIZED: {
    uz: 'Avtorizatsiya talab qilinadi',
    ru: 'Требуется авторизация',
  },
  FORBIDDEN: {
    uz: 'Ruxsat berilmagan',
    ru: 'Доступ запрещён',
  },
  NOT_FOUND: {
    uz: 'Topilmadi',
    ru: 'Не найдено',
  },
  INTERNAL_SERVER_ERROR: {
    uz: 'Ichki server xatosi',
    ru: 'Внутренняя ошибка сервера',
  },
  BAD_REQUEST: {
    uz: "Noto'g'ri so'rov",
    ru: 'Неверный запрос',
  },
  VALIDATION_ERROR: {
    uz: "Ma'lumotlar tekshiruvi xatosi",
    ru: 'Ошибка валидации данных',
  },
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { locale?: string }>();

    const locale = (request as any).locale || 'uz';

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    if (status === 500) {
      console.error('🔥 [500 ERROR IN HANDLER]', request.method, request.url, exception);
    }

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    let message: string;
    let details: any = null;

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const resp = exceptionResponse as any;
      // Handle class-validator errors
      if (Array.isArray(resp.message)) {
        message = resp.message.join('; ');
        details = resp.message;
      } else {
        message = resp.message || this.getLocalizedMessage(status, locale);
      }
    } else if (typeof exceptionResponse === 'string') {
      message = exceptionResponse;
    } else {
      message = this.getLocalizedMessage(status, locale);
    }

    response.status(status).json({
      statusCode: status,
      message,
      details,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private getLocalizedMessage(status: number, locale: string): string {
    const key = HttpStatus[status] || 'INTERNAL_SERVER_ERROR';
    const localized = ERROR_MESSAGES[key] || ERROR_MESSAGES['INTERNAL_SERVER_ERROR'];
    return localized?.[locale] || 'An error occurred';
  }
}
