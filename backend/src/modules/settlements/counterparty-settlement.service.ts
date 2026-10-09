import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CounterpartySettlementSide, Prisma } from '@prisma/client';
import { SUPPORTED_CURRENCIES } from '../../common/validators/currency.validator';

export interface RecordSettlementMovementInput {
  tenantId: string;
  counterpartyId: string;
  currency: string;
  side: CounterpartySettlementSide;
  amount: number;
  entryType: string;
  effectiveAt: Date;
  sourceDocType: string;
  sourceDocId: string;
  sourceLineId?: string;
  idempotencyKey: string;
  reversesEntryId?: string;
}

@Injectable()
export class CounterpartySettlementService {
  async recordMovement(
    tx: Prisma.TransactionClient,
    input: RecordSettlementMovementInput,
  ) {
    this.validateInput(input);

    const counterparty = await tx.counterparty.findFirst({
      where: { id: input.counterpartyId, tenantId: input.tenantId },
      select: { id: true },
    });
    if (!counterparty) {
      throw new NotFoundException('Settlement counterparty not found');
    }

    const amount = Number(input.amount);
    const createResult = await tx.counterpartySettlementEntry.createMany({
      data: [
        {
          tenantId: input.tenantId,
          counterpartyId: input.counterpartyId,
          currency: input.currency,
          side: input.side,
          amount,
          entryType: input.entryType,
          effectiveAt: input.effectiveAt,
          sourceDocType: input.sourceDocType,
          sourceDocId: input.sourceDocId,
          sourceLineId: input.sourceLineId,
          idempotencyKey: input.idempotencyKey,
          reversesEntryId: input.reversesEntryId,
        },
      ],
      skipDuplicates: true,
    });

    const entry = await tx.counterpartySettlementEntry.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (!entry) {
      throw new ConflictException('Settlement entry was not created');
    }

    if (createResult.count === 0) {
      this.assertSameMovement(entry, input);
      const balance = await tx.counterpartyBalance.findUnique({
        where: {
          counterpartyId_currency: {
            counterpartyId: input.counterpartyId,
            currency: input.currency,
          },
        },
      });
      return { entry, balance, created: false };
    }

    const balanceField = input.side === CounterpartySettlementSide.CUSTOMER
      ? 'customerDebt'
      : 'supplierDebt';
    const otherBalanceField = balanceField === 'customerDebt'
      ? 'supplierDebt'
      : 'customerDebt';
    const balance = await tx.counterpartyBalance.upsert({
      where: {
        counterpartyId_currency: {
          counterpartyId: input.counterpartyId,
          currency: input.currency,
        },
      },
      create: {
        tenantId: input.tenantId,
        counterpartyId: input.counterpartyId,
        currency: input.currency,
        [balanceField]: amount,
        [otherBalanceField]: 0,
      },
      update: {
        [balanceField]: { increment: amount },
      },
    });

    return { entry, balance, created: true };
  }

  async rebuildBalances(tx: Prisma.TransactionClient, tenantId: string) {
    if (!tenantId?.trim()) {
      throw new BadRequestException('Tenant is required to rebuild counterparty balances');
    }

    const entries = await tx.counterpartySettlementEntry.findMany({
      where: { tenantId },
      select: {
        counterpartyId: true,
        currency: true,
        side: true,
        amount: true,
      },
    });

    const grouped = new Map<string, {
      counterpartyId: string;
      currency: string;
      customerDebt: Prisma.Decimal;
      supplierDebt: Prisma.Decimal;
    }>();

    for (const entry of entries) {
      const key = `${entry.counterpartyId}\u0000${entry.currency}`;
      const current = grouped.get(key) ?? {
        counterpartyId: entry.counterpartyId,
        currency: entry.currency,
        customerDebt: new Prisma.Decimal(0),
        supplierDebt: new Prisma.Decimal(0),
      };
      if (entry.side === CounterpartySettlementSide.CUSTOMER) {
        current.customerDebt = current.customerDebt.plus(entry.amount);
      } else {
        current.supplierDebt = current.supplierDebt.plus(entry.amount);
      }
      grouped.set(key, current);
    }

    await tx.counterpartyBalance.deleteMany({ where: { tenantId } });
    const now = new Date();
    const balances = Array.from(grouped.values()).map((balance) => ({
      tenantId,
      counterpartyId: balance.counterpartyId,
      currency: balance.currency,
      customerDebt: balance.customerDebt,
      supplierDebt: balance.supplierDebt,
      createdAt: now,
      updatedAt: now,
    }));
    if (balances.length > 0) {
      await tx.counterpartyBalance.createMany({ data: balances });
    }
    return balances;
  }

  private validateInput(input: RecordSettlementMovementInput) {
    if (!input.tenantId?.trim() || !input.counterpartyId?.trim()) {
      throw new BadRequestException('Tenant and counterparty are required for a settlement movement');
    }
    if (!SUPPORTED_CURRENCIES.includes(input.currency as (typeof SUPPORTED_CURRENCIES)[number])) {
      throw new BadRequestException(
        `Settlement currency must be one of: ${SUPPORTED_CURRENCIES.join(', ')}`,
      );
    }
    if (!Object.values(CounterpartySettlementSide).includes(input.side)) {
      throw new BadRequestException('Settlement side must be CUSTOMER or SUPPLIER');
    }
    if (!Number.isFinite(Number(input.amount)) || Number(input.amount) === 0) {
      throw new BadRequestException('Settlement amount must be a finite, non-zero number');
    }
    if (!(input.effectiveAt instanceof Date) || !Number.isFinite(input.effectiveAt.getTime())) {
      throw new BadRequestException('Settlement effective date must be valid');
    }
    if (
      !input.entryType?.trim() ||
      !input.sourceDocType?.trim() ||
      !input.sourceDocId?.trim() ||
      !input.idempotencyKey?.trim()
    ) {
      throw new BadRequestException('Settlement source and idempotency key are required');
    }
  }

  private assertSameMovement(
    entry: {
      tenantId: string;
      counterpartyId: string;
      currency: string;
      side: CounterpartySettlementSide;
      amount: Prisma.Decimal;
      entryType: string;
      effectiveAt: Date;
      sourceDocType: string;
      sourceDocId: string;
      sourceLineId: string | null;
      reversesEntryId: string | null;
    },
    input: RecordSettlementMovementInput,
  ) {
    const matches =
      entry.tenantId === input.tenantId &&
      entry.counterpartyId === input.counterpartyId &&
      entry.currency === input.currency &&
      entry.side === input.side &&
      Number(entry.amount) === Number(input.amount) &&
      entry.entryType === input.entryType &&
      entry.effectiveAt.getTime() === input.effectiveAt.getTime() &&
      entry.sourceDocType === input.sourceDocType &&
      entry.sourceDocId === input.sourceDocId &&
      entry.sourceLineId === (input.sourceLineId ?? null) &&
      entry.reversesEntryId === (input.reversesEntryId ?? null);

    if (!matches) {
      throw new ConflictException('Settlement idempotency key already describes a different movement');
    }
  }
}
