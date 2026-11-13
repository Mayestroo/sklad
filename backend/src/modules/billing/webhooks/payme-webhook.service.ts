import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SubscriptionPayment } from '@prisma/client';
import { PrismaService } from '../../../common/prisma';
import {
  PROVIDER_STATE,
  cancelSubscriptionPayment,
  performSubscriptionPayment,
  safeEqual,
} from './subscription-payment-transitions';

/** Payme Merchant API error codes used here. */
const PAYME_ERROR = {
  INSUFFICIENT_PRIVILEGES: -32504,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  SYSTEM_ERROR: -32400,
  INVALID_AMOUNT: -31001,
  TRANSACTION_NOT_FOUND: -31003,
  CANNOT_PERFORM: -31008,
  ORDER_NOT_FOUND: -31050,
  ORDER_BUSY: -31051,
} as const;

const PAYME_MESSAGE: Record<number, { uz: string; ru: string; en: string }> = {
  [PAYME_ERROR.INSUFFICIENT_PRIVILEGES]: {
    uz: 'Ruxsat yetarli emas',
    ru: 'Недостаточно привилегий',
    en: 'Insufficient privileges',
  },
  [PAYME_ERROR.INVALID_REQUEST]: {
    uz: "So'rov noto'g'ri",
    ru: 'Неверный запрос',
    en: 'Invalid request',
  },
  [PAYME_ERROR.METHOD_NOT_FOUND]: {
    uz: 'Metod topilmadi',
    ru: 'Метод не найден',
    en: 'Method not found',
  },
  [PAYME_ERROR.SYSTEM_ERROR]: {
    uz: 'Tizim xatosi',
    ru: 'Системная ошибка',
    en: 'System error',
  },
  [PAYME_ERROR.INVALID_AMOUNT]: {
    uz: "Summa noto'g'ri",
    ru: 'Неверная сумма',
    en: 'Invalid amount',
  },
  [PAYME_ERROR.TRANSACTION_NOT_FOUND]: {
    uz: 'Tranzaksiya topilmadi',
    ru: 'Транзакция не найдена',
    en: 'Transaction not found',
  },
  [PAYME_ERROR.CANNOT_PERFORM]: {
    uz: "Amalni bajarib bo'lmaydi",
    ru: 'Невозможно выполнить операцию',
    en: 'Unable to perform operation',
  },
  [PAYME_ERROR.ORDER_NOT_FOUND]: {
    uz: "To'lov topilmadi",
    ru: 'Платёж не найден',
    en: 'Payment not found',
  },
  [PAYME_ERROR.ORDER_BUSY]: {
    uz: "To'lov allaqachon to'langan yoki jarayonda",
    ru: 'Платёж уже оплачен или в процессе оплаты',
    en: 'Payment is already paid or in progress',
  },
};

/** Payme cancels a created transaction that was not performed within 12 hours. */
const TRANSACTION_TIMEOUT_MS = 12 * 60 * 60 * 1000;
const CANCEL_REASON_TIMEOUT = 4;

export interface PaymeResponse {
  jsonrpc: '2.0';
  id: unknown;
  result?: Record<string, unknown>;
  error?: {
    code: number;
    message: { uz: string; ru: string; en: string };
    data?: string;
  };
}

type Params = Record<string, unknown>;

class PaymeError extends Error {
  constructor(
    readonly code: number,
    readonly data?: string,
  ) {
    super(PAYME_MESSAGE[code]?.en ?? String(code));
  }
}

/** The request was refused because its Basic auth did not check out. */
export const isPaymeAuthFailure = (response: PaymeResponse): boolean =>
  response.error?.code === PAYME_ERROR.INSUFFICIENT_PRIVILEGES;

/**
 * Payme Merchant API (JSON-RPC 2.0). Every request is authenticated by the
 * `Authorization: Basic base64("Paycom:<PAYME_SECRET_KEY>")` header before any
 * row is read; without PAYME_SECRET_KEY every request is refused.
 */
@Injectable()
export class PaymeWebhookService {
  private readonly logger = new Logger(PaymeWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async handle(
    authorization: string | undefined,
    body: unknown,
  ): Promise<PaymeResponse> {
    const request = isObject(body) ? body : {};
    const id = request.id ?? null;
    const fail = (e: PaymeError): PaymeResponse => ({
      jsonrpc: '2.0',
      id,
      error: { code: e.code, message: PAYME_MESSAGE[e.code], data: e.data },
    });

    if (!this.authorized(authorization)) {
      return fail(new PaymeError(PAYME_ERROR.INSUFFICIENT_PRIVILEGES));
    }
    const { method, params } = request;
    if (typeof method !== 'string' || !isObject(params)) {
      return fail(new PaymeError(PAYME_ERROR.INVALID_REQUEST));
    }

    try {
      const result = await this.dispatch(method, params);
      return { jsonrpc: '2.0', id, result };
    } catch (err) {
      if (err instanceof PaymeError) return fail(err);
      this.logger.error(`Payme ${method} failed`, err as Error);
      return fail(new PaymeError(PAYME_ERROR.SYSTEM_ERROR));
    }
  }

  private authorized(header: string | undefined): boolean {
    const key = this.config.get<string>('PAYME_SECRET_KEY');
    if (!key || !header?.startsWith('Basic ')) return false;
    const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString(
      'utf8',
    );
    return safeEqual(decoded, `Paycom:${key}`);
  }

  private dispatch(method: string, params: Params) {
    switch (method) {
      case 'CheckPerformTransaction':
        return this.checkPerform(params);
      case 'CreateTransaction':
        return this.create(params);
      case 'PerformTransaction':
        return this.perform(params);
      case 'CancelTransaction':
        return this.cancel(params);
      case 'CheckTransaction':
        return this.check(params);
      case 'GetStatement':
        return this.statement(params);
      default:
        throw new PaymeError(PAYME_ERROR.METHOD_NOT_FOUND, method);
    }
  }

  /** The payment named by `account.payment_id`, checked to be payable for `amount` tiyin. */
  private async payableOrder(params: Params) {
    const account = isObject(params.account) ? params.account : {};
    const paymentId =
      typeof account.payment_id === 'string' ? account.payment_id : null;
    const payment = paymentId
      ? await this.prisma.subscriptionPayment.findFirst({
          where: { id: paymentId, method: 'PAYME' },
        })
      : null;
    if (!payment)
      throw new PaymeError(PAYME_ERROR.ORDER_NOT_FOUND, 'payment_id');
    if (params.amount !== toTiyin(payment.amount))
      throw new PaymeError(PAYME_ERROR.INVALID_AMOUNT);
    if (payment.providerState !== null)
      throw new PaymeError(PAYME_ERROR.ORDER_BUSY, 'payment_id');
    return payment;
  }

  private async checkPerform(params: Params) {
    await this.payableOrder(params);
    return { allow: true };
  }

  private async create(params: Params) {
    const providerId = requireString(params.id);
    const existing = await this.findTransaction(providerId);
    if (existing) {
      if (existing.providerState !== PROVIDER_STATE.CREATED)
        throw new PaymeError(PAYME_ERROR.CANNOT_PERFORM);
      await this.cancelIfExpired(existing);
      return {
        create_time: ms(existing.providerCreatedAt),
        transaction: existing.id,
        state: PROVIDER_STATE.CREATED,
      };
    }

    const payment = await this.payableOrder(params);
    const now = new Date();
    const moved = await this.prisma.subscriptionPayment.updateMany({
      where: { id: payment.id, providerState: null },
      data: {
        providerState: PROVIDER_STATE.CREATED,
        transactionId: providerId,
        providerCreatedAt: now,
      },
    });
    if (moved.count !== 1)
      throw new PaymeError(PAYME_ERROR.ORDER_BUSY, 'payment_id');
    return {
      create_time: now.getTime(),
      transaction: payment.id,
      state: PROVIDER_STATE.CREATED,
    };
  }

  private async perform(params: Params) {
    const t = await this.requireTransaction(params);
    if (t.providerState === PROVIDER_STATE.CREATED) {
      await this.cancelIfExpired(t);
      const now = new Date();
      const performed = await this.prisma.$transaction((tx) =>
        performSubscriptionPayment(tx, t, now),
      );
      if (!performed) throw new PaymeError(PAYME_ERROR.CANNOT_PERFORM);
      return {
        transaction: t.id,
        perform_time: now.getTime(),
        state: PROVIDER_STATE.PERFORMED,
      };
    }
    if (t.providerState === PROVIDER_STATE.PERFORMED) {
      // Replayed perform: same answer, nothing is activated again.
      return {
        transaction: t.id,
        perform_time: ms(t.providerPerformedAt),
        state: PROVIDER_STATE.PERFORMED,
      };
    }
    throw new PaymeError(PAYME_ERROR.CANNOT_PERFORM);
  }

  private async cancel(params: Params) {
    const t = await this.requireTransaction(params);
    const reason = typeof params.reason === 'number' ? params.reason : null;
    if (
      t.providerState === PROVIDER_STATE.CREATED ||
      t.providerState === PROVIDER_STATE.PERFORMED
    ) {
      const fromState = t.providerState;
      const now = new Date();
      const cancelled = await this.prisma.$transaction((tx) =>
        cancelSubscriptionPayment(tx, t, fromState, reason, now),
      );
      if (!cancelled) throw new PaymeError(PAYME_ERROR.CANNOT_PERFORM);
      return {
        transaction: t.id,
        cancel_time: now.getTime(),
        state: -fromState,
      };
    }
    // Replayed cancel.
    return {
      transaction: t.id,
      cancel_time: ms(t.providerCancelledAt),
      state: t.providerState,
    };
  }

  private async check(params: Params) {
    return describe(await this.requireTransaction(params));
  }

  private async statement(params: Params) {
    const from = Number(params.from);
    const to = Number(params.to);
    if (!Number.isFinite(from) || !Number.isFinite(to))
      throw new PaymeError(PAYME_ERROR.INVALID_REQUEST);
    const rows = await this.prisma.subscriptionPayment.findMany({
      where: {
        method: 'PAYME',
        providerCreatedAt: { gte: new Date(from), lte: new Date(to) },
      },
      orderBy: { providerCreatedAt: 'asc' },
    });
    return {
      transactions: rows.map((t) => ({
        id: t.transactionId,
        time: ms(t.providerCreatedAt),
        amount: toTiyin(t.amount),
        account: { payment_id: t.id },
        ...describe(t),
      })),
    };
  }

  private findTransaction(providerId: string) {
    return this.prisma.subscriptionPayment.findFirst({
      where: { method: 'PAYME', transactionId: providerId },
    });
  }

  private async requireTransaction(params: Params) {
    const t = await this.findTransaction(requireString(params.id));
    if (!t) throw new PaymeError(PAYME_ERROR.TRANSACTION_NOT_FOUND);
    return t;
  }

  private async cancelIfExpired(t: SubscriptionPayment) {
    const createdAt = t.providerCreatedAt?.getTime() ?? 0;
    if (Date.now() - createdAt <= TRANSACTION_TIMEOUT_MS) return;
    await this.prisma.$transaction((tx) =>
      cancelSubscriptionPayment(
        tx,
        t,
        PROVIDER_STATE.CREATED,
        CANCEL_REASON_TIMEOUT,
        new Date(),
      ),
    );
    throw new PaymeError(PAYME_ERROR.CANNOT_PERFORM);
  }
}

function describe(t: SubscriptionPayment) {
  return {
    create_time: ms(t.providerCreatedAt),
    perform_time: ms(t.providerPerformedAt),
    cancel_time: ms(t.providerCancelledAt),
    transaction: t.id,
    state: t.providerState,
    reason: t.providerCancelReason,
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function requireString(v: unknown): string {
  if (typeof v !== 'string' || v === '')
    throw new PaymeError(PAYME_ERROR.INVALID_REQUEST);
  return v;
}

function toTiyin(amount: unknown): number {
  return Math.round(Number(amount) * 100);
}

function ms(d: Date | null): number {
  return d ? d.getTime() : 0;
}
