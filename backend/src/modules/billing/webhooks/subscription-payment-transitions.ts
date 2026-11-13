import { timingSafeEqual } from 'crypto';
import type { Prisma } from '@prisma/client';

/**
 * Provider transaction states, shared by Click and Payme (Payme's numbering).
 * A payment with `providerState = null` has not been touched by a provider.
 */
export const PROVIDER_STATE = {
  CREATED: 1,
  PERFORMED: 2,
  CANCELLED: -1,
  CANCELLED_AFTER_PERFORM: -2,
} as const;

export interface PayableSubscriptionPayment {
  id: string;
  tenantId: string;
  subscriptionId: string | null;
}

/**
 * Moves a created provider transaction to performed and activates the
 * subscription and the company, in the caller's transaction. The state check
 * is part of the UPDATE, so a replayed or concurrent call activates nothing
 * and gets `false`.
 */
export async function performSubscriptionPayment(
  tx: Prisma.TransactionClient,
  payment: PayableSubscriptionPayment,
  now: Date,
): Promise<boolean> {
  const moved = await tx.subscriptionPayment.updateMany({
    where: { id: payment.id, providerState: PROVIDER_STATE.CREATED },
    data: {
      providerState: PROVIDER_STATE.PERFORMED,
      providerPerformedAt: now,
      status: 'PAID',
      paidAt: now,
    },
  });
  if (moved.count !== 1) return false;

  if (payment.subscriptionId) {
    await tx.subscription.update({
      where: { id: payment.subscriptionId },
      data: { status: 'ACTIVE' },
    });
  }
  await tx.company.update({
    where: { id: payment.tenantId },
    data: { status: 'ACTIVE' },
  });
  return true;
}

/**
 * Cancels a provider transaction. Cancelling a performed one (a refund) also
 * cancels its subscription. Returns `false` when the payment was no longer in
 * `fromState`.
 */
export async function cancelSubscriptionPayment(
  tx: Prisma.TransactionClient,
  payment: PayableSubscriptionPayment,
  fromState: typeof PROVIDER_STATE.CREATED | typeof PROVIDER_STATE.PERFORMED,
  reason: number | null,
  now: Date,
): Promise<boolean> {
  const moved = await tx.subscriptionPayment.updateMany({
    where: { id: payment.id, providerState: fromState },
    data: {
      providerState:
        fromState === PROVIDER_STATE.CREATED
          ? PROVIDER_STATE.CANCELLED
          : PROVIDER_STATE.CANCELLED_AFTER_PERFORM,
      providerCancelledAt: now,
      providerCancelReason: reason,
      status: 'CANCELLED',
    },
  });
  if (moved.count !== 1) return false;

  if (fromState === PROVIDER_STATE.PERFORMED && payment.subscriptionId) {
    await tx.subscription.update({
      where: { id: payment.subscriptionId },
      data: { status: 'CANCELLED' },
    });
  }
  return true;
}

/** Constant-time string comparison (false on length mismatch). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}
