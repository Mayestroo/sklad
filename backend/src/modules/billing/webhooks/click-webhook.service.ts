import { createHash } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma';
import {
  PROVIDER_STATE,
  cancelSubscriptionPayment,
  performSubscriptionPayment,
  safeEqual,
} from './subscription-payment-transitions';

/** Click SHOP-API error codes. */
const CLICK_ERROR = {
  SUCCESS: 0,
  SIGN_CHECK_FAILED: -1,
  INCORRECT_AMOUNT: -2,
  ACTION_NOT_FOUND: -3,
  ALREADY_PAID: -4,
  ORDER_NOT_FOUND: -5,
  TRANSACTION_NOT_FOUND: -6,
  UPDATE_FAILED: -7,
  TRANSACTION_CANCELLED: -9,
} as const;

const CLICK_NOTE: Record<number, string> = {
  [CLICK_ERROR.SUCCESS]: 'Success',
  [CLICK_ERROR.SIGN_CHECK_FAILED]: 'SIGN CHECK FAILED!',
  [CLICK_ERROR.INCORRECT_AMOUNT]: 'Incorrect parameter amount',
  [CLICK_ERROR.ACTION_NOT_FOUND]: 'Action not found',
  [CLICK_ERROR.ALREADY_PAID]: 'Already paid',
  [CLICK_ERROR.ORDER_NOT_FOUND]: 'Order does not exist',
  [CLICK_ERROR.TRANSACTION_NOT_FOUND]: 'Transaction does not exist',
  [CLICK_ERROR.UPDATE_FAILED]: 'Failed to update order',
  [CLICK_ERROR.TRANSACTION_CANCELLED]: 'Transaction cancelled',
};

const FIELDS = [
  'click_trans_id',
  'service_id',
  'merchant_trans_id',
  'merchant_prepare_id',
  'amount',
  'action',
  'error',
  'sign_time',
  'sign_string',
] as const;
type ClickFields = Record<(typeof FIELDS)[number], string>;

export interface ClickResponse {
  click_trans_id: number | string;
  merchant_trans_id: string;
  merchant_prepare_id?: number;
  merchant_confirm_id?: number;
  error: number;
  error_note: string;
}

const ACTION_PREPARE = '0';
const ACTION_COMPLETE = '1';

/** The callback was refused because its signature did not check out. */
export const isClickAuthFailure = (response: ClickResponse): boolean =>
  response.error === CLICK_ERROR.SIGN_CHECK_FAILED;

/**
 * Click SHOP-API callbacks (Prepare, action=0; Complete, action=1).
 * Every request is authenticated by its MD5 `sign_string` before any row is
 * read; without CLICK_SECRET_KEY / CLICK_SERVICE_ID every request is refused.
 */
@Injectable()
export class ClickWebhookService {
  private readonly logger = new Logger(ClickWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async handle(body: Record<string, unknown>): Promise<ClickResponse> {
    const f = readFields(body);
    const reply = (
      error: number,
      extra: Partial<ClickResponse> = {},
    ): ClickResponse => ({
      click_trans_id: /^\d+$/.test(f.click_trans_id)
        ? Number(f.click_trans_id)
        : f.click_trans_id,
      merchant_trans_id: f.merchant_trans_id,
      ...extra,
      error,
      error_note: CLICK_NOTE[error],
    });

    const secret = this.config.get<string>('CLICK_SECRET_KEY');
    const serviceId = this.config.get<string>('CLICK_SERVICE_ID');
    if (
      !secret ||
      !serviceId ||
      f.service_id !== serviceId ||
      !safeEqual(f.sign_string.toLowerCase(), expectedSignature(f, secret))
    ) {
      return reply(CLICK_ERROR.SIGN_CHECK_FAILED);
    }

    try {
      if (f.action === ACTION_PREPARE) return await this.prepare(f, reply);
      if (f.action === ACTION_COMPLETE) return await this.complete(f, reply);
      return reply(CLICK_ERROR.ACTION_NOT_FOUND);
    } catch (err) {
      this.logger.error(`Click ${f.action} failed`, err as Error);
      return reply(CLICK_ERROR.UPDATE_FAILED);
    }
  }

  private async prepare(f: ClickFields, reply: Reply): Promise<ClickResponse> {
    const payment = await this.findPayment(f.merchant_trans_id);
    if (!payment) return reply(CLICK_ERROR.ORDER_NOT_FOUND);
    if (!amountMatches(f.amount, payment.amount))
      return reply(CLICK_ERROR.INCORRECT_AMOUNT);
    if (payment.providerState === PROVIDER_STATE.PERFORMED)
      return reply(CLICK_ERROR.ALREADY_PAID);
    if (payment.providerState !== null && payment.providerState < 0)
      return reply(CLICK_ERROR.TRANSACTION_CANCELLED);

    if (
      payment.providerState === PROVIDER_STATE.CREATED &&
      payment.transactionId === f.click_trans_id &&
      payment.providerCreatedAt
    ) {
      // Replayed prepare: same answer as the first time.
      return reply(CLICK_ERROR.SUCCESS, {
        merchant_prepare_id: prepareIdOf(payment.providerCreatedAt),
      });
    }

    // A new Click transaction replaces an abandoned prepare (if any); the old
    // one can no longer complete because its click_trans_id won't match.
    const now = new Date();
    const moved = await this.prisma.subscriptionPayment.updateMany({
      where: {
        id: payment.id,
        providerState: payment.providerState,
        transactionId: payment.transactionId,
      },
      data: {
        providerState: PROVIDER_STATE.CREATED,
        transactionId: f.click_trans_id,
        providerCreatedAt: now,
      },
    });
    if (moved.count !== 1) return reply(CLICK_ERROR.UPDATE_FAILED);
    return reply(CLICK_ERROR.SUCCESS, {
      merchant_prepare_id: prepareIdOf(now),
    });
  }

  private async complete(f: ClickFields, reply: Reply): Promise<ClickResponse> {
    const payment = await this.findPayment(f.merchant_trans_id);
    if (!payment) return reply(CLICK_ERROR.ORDER_NOT_FOUND);
    if (
      payment.transactionId !== f.click_trans_id ||
      !payment.providerCreatedAt ||
      String(prepareIdOf(payment.providerCreatedAt)) !== f.merchant_prepare_id
    ) {
      return reply(CLICK_ERROR.TRANSACTION_NOT_FOUND);
    }
    if (!amountMatches(f.amount, payment.amount))
      return reply(CLICK_ERROR.INCORRECT_AMOUNT);

    const confirm = {
      merchant_confirm_id: prepareIdOf(payment.providerCreatedAt),
    };
    if (payment.providerState === PROVIDER_STATE.PERFORMED) {
      // Replayed complete: idempotent success, nothing is activated again.
      return reply(CLICK_ERROR.SUCCESS, confirm);
    }
    if (payment.providerState !== PROVIDER_STATE.CREATED)
      return reply(CLICK_ERROR.TRANSACTION_CANCELLED);

    const now = new Date();
    if (Number(f.error) < 0) {
      // Click reports the payment failed on its side.
      await this.prisma.$transaction((tx) =>
        cancelSubscriptionPayment(
          tx,
          payment,
          PROVIDER_STATE.CREATED,
          Number(f.error),
          now,
        ),
      );
      return reply(CLICK_ERROR.TRANSACTION_CANCELLED);
    }

    const performed = await this.prisma.$transaction((tx) =>
      performSubscriptionPayment(tx, payment, now),
    );
    return performed
      ? reply(CLICK_ERROR.SUCCESS, confirm)
      : reply(CLICK_ERROR.UPDATE_FAILED);
  }

  private findPayment(id: string) {
    return this.prisma.subscriptionPayment.findFirst({
      where: { id, method: 'CLICK' },
    });
  }
}

type Reply = (error: number, extra?: Partial<ClickResponse>) => ClickResponse;

function readFields(body: Record<string, unknown>): ClickFields {
  const out = {} as ClickFields;
  for (const key of FIELDS) {
    const v = body?.[key];
    out[key] = typeof v === 'string' || typeof v === 'number' ? String(v) : '';
  }
  return out;
}

function expectedSignature(f: ClickFields, secret: string): string {
  const prepareId = f.action === ACTION_COMPLETE ? f.merchant_prepare_id : '';
  return createHash('md5')
    .update(
      f.click_trans_id +
        f.service_id +
        secret +
        f.merchant_trans_id +
        prepareId +
        f.amount +
        f.action +
        f.sign_time,
    )
    .digest('hex');
}

function amountMatches(sent: string, expected: unknown): boolean {
  const value = Number(sent);
  return (
    sent !== '' &&
    Number.isFinite(value) &&
    Math.round(value * 100) === Math.round(Number(expected) * 100)
  );
}

/** Click wants an integer prepare id; the prepare time in seconds is stored already. */
function prepareIdOf(createdAt: Date): number {
  return Math.floor(createdAt.getTime() / 1000);
}
