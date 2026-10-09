import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { AuditService } from '../../audit/audit.service';
import { JournalService } from '../../accounting/journal/journal.service';
import { CreatePaymentDto } from '../dto';
import { SalesOrdersService } from '../orders/sales-orders.service';
import { CounterpartySettlementSide, SettlementAllocationTarget } from '@prisma/client';
import { CounterpartySettlementService } from '../../settlements/counterparty-settlement.service';
import { SettlementAllocationService } from '../../settlements/settlement-allocation.service';
import {
  isCashAccountCompatibleWithSalesPayment,
  requiredAccountTypeForSalesPayment,
} from '../../../../../shared/types/cash-account-policy';
import { requireExchangeRateForCurrency } from '../../../common/utils/transaction-exchange-rate';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly journalService: JournalService,
    private readonly salesOrdersService: SalesOrdersService,
    private readonly settlementService: CounterpartySettlementService,
    private readonly settlementAllocationService: SettlementAllocationService,
  ) {}

  async registerPayment(
    tenantId: string,
    dto: CreatePaymentDto,
    userId: string,
  ) {
    const counterparty = await this.prisma.counterparty.findFirst({
      where: { id: dto.counterpartyId, tenantId },
    });

    if (!counterparty) {
      throw new NotFoundException('Mijoz topilmadi');
    }
    if (Boolean(dto.invoiceId) === Boolean(dto.orderId)) {
      throw new BadRequestException("To'lov aynan bitta hujjatga: invoice yoki buyurtmaga biriktirilishi kerak");
    }

    if (dto.invoiceId) {
      const invoice = await this.prisma.salesInvoice.findFirst({
        where: { id: dto.invoiceId, tenantId, counterpartyId: dto.counterpartyId, status: 'POSTED' },
      });
      if (!invoice || invoice.currency !== dto.currency) {
        throw new BadRequestException("Sotuv hujjati topilmadi yoki to'lov valyutasi mos emas");
      }
      if (Number(invoice.paidAmount) + Number(dto.amount) > Number(invoice.totalAmount)) {
        throw new BadRequestException("To'lov sotuv hujjatining qolgan qarzidan oshishi mumkin emas");
      }
    }
    if (dto.orderId) {
      const order = await this.prisma.salesOrder.findFirst({
        where: { id: dto.orderId, tenantId, counterpartyId: dto.counterpartyId },
      });
      if (!order || order.currency !== dto.currency) {
        throw new BadRequestException("Buyurtma topilmadi yoki to'lov valyutasi mos emas");
      }
      if (Number(order.paidAmount) + Number(dto.amount) > Number(order.totalAmount)) {
        throw new BadRequestException("To'lov buyurtmaning qolgan summasidan oshishi mumkin emas");
      }
    }

    const exchangeRate = requireExchangeRateForCurrency(
      dto.currency,
      dto.exchangeRate,
    );

    const paymentNumber = await this.generatePaymentNumber(tenantId);

    // Resolve target CashAccount (Dollar kassa, Naqd kassa, Hisobraqam)
    const cashAccountId = dto.cashAccountId;
    const cashAccount = await this.prisma.cashAccount.findFirst({
      where: { id: cashAccountId, tenantId, isActive: true },
    });
    if (
      !cashAccount ||
      !isCashAccountCompatibleWithSalesPayment(
        cashAccount,
        dto.method,
        dto.currency,
      )
    ) {
      const requiredType = requiredAccountTypeForSalesPayment(
        dto.method,
        dto.currency,
      );
      throw new BadRequestException(
        `To‘lov usuli (${dto.method}) uchun ${dto.currency} valyutasidagi ${requiredType} hisobini tanlang`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create Payment record
      const payment = await tx.payment.create({
        data: {
          tenantId,
          counterpartyId: dto.counterpartyId,
          invoiceId: dto.invoiceId || null,
          orderId: dto.orderId || null,
          cashAccountId,
          paymentNumber,
          method: dto.method,
          amount: dto.amount,
          comment: dto.comment,
        },
        include: {
          counterparty: true,
          invoice: true,
          salesOrder: true,
          cashAccount: true,
        },
      });

      // 2. Record cash and the customer-side settlement movement once.
      await tx.cashAccount.update({
        where: { id: cashAccountId },
        data: { balance: { increment: dto.amount } },
      });

      const financeTransaction = await tx.financeTransaction.create({
        data: {
          tenantId,
          direction: 'INCOME',
          accountId: cashAccountId,
          counterpartyId: dto.counterpartyId,
          settlementSide: CounterpartySettlementSide.CUSTOMER,
          amount: dto.amount,
          currency: dto.currency,
          exchangeRate,
          comment: dto.comment || `To'lov ${paymentNumber} qabul qilindi`,
          docNumber: paymentNumber,
          sourceDocType: 'PAYMENT',
          sourceDocId: payment.id,
          createdById: userId,
        },
      });
      await this.settlementService.recordMovement(tx, {
        tenantId,
        counterpartyId: dto.counterpartyId,
        currency: dto.currency,
        side: CounterpartySettlementSide.CUSTOMER,
        amount: -Number(dto.amount),
        entryType: 'FINANCE_SETTLEMENT',
        effectiveAt: new Date(),
        sourceDocType: 'FinanceTransaction',
        sourceDocId: financeTransaction.id,
        idempotencyKey: `FinanceTransaction:${financeTransaction.id}:SETTLEMENT`,
      });

      // 4. If linked to an invoice, update invoice paid amount and status
      if (dto.invoiceId) {
        await this.settlementAllocationService.recordAllocation(tx, {
          tenantId,
          counterpartyId: dto.counterpartyId,
          financeTransactionId: financeTransaction.id,
          targetType: SettlementAllocationTarget.SALES_INVOICE,
          targetId: dto.invoiceId,
          amount: Number(dto.amount),
          idempotencyKey: `FinanceTransaction:${financeTransaction.id}:SalesInvoice:${dto.invoiceId}`,
        });
        const invoice = await tx.salesInvoice.findFirst({
          where: { id: dto.invoiceId, tenantId, counterpartyId: dto.counterpartyId },
        });

        if (invoice) {
          const newPaidAmount = Number(invoice.paidAmount) + dto.amount;
          const totalAmount = Number(invoice.totalAmount);
          const newPaymentStatus =
            newPaidAmount >= totalAmount ? 'PAID' : 'PARTIALLY_PAID';

          await tx.salesInvoice.update({
            where: { id: dto.invoiceId },
            data: {
              paidAmount: newPaidAmount,
              paymentStatus: newPaymentStatus as any,
            },
          });
        }
      } else if (dto.orderId) {
        await tx.salesOrder.update({
          where: { id: dto.orderId },
          data: { paidAmount: { increment: dto.amount } },
        });
      }

      return payment;
    });

    // 5. If linked to a Sales Order, trigger dispatch gate evaluation
    if (dto.orderId) {
      try {
        await this.salesOrdersService.onPaymentRegistered(tenantId, userId, dto.orderId);
      } catch (err) {
        console.error('Failed to evaluate order payment gate:', err);
      }
    }

    // 6. Module 4 Integration: Auto-post Payment NAS double-entry journal (Dt 5110/5010 / Kt 4010)
    try {
      await this.journalService.autoPostPayment(tenantId, {
        ...result,
        currency: dto.currency,
        exchangeRate,
      });
    } catch (err) {
      console.error('Failed to auto-post journal entry for payment:', err);
    }

    // Audit Log
    await this.auditService.logAction({
      tenantId,
      userId,
      entityType: 'Payment',
      entityId: result.id,
      action: 'CREATE',
      newValue: {
        paymentNumber,
        amount: dto.amount,
        method: dto.method,
        orderId: dto.orderId,
        cashAccountId,
      },
    });

    return result;
  }

  async findAllByTenant(tenantId: string) {
    return this.prisma.payment.findMany({
      where: { tenantId },
      include: {
        counterparty: true,
        invoice: true,
        salesOrder: true,
        cashAccount: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async generatePaymentNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.payment.count({ where: { tenantId } });
    const nextSeq = (count + 1).toString().padStart(6, '0');
    return `PAY-${nextSeq}`;
  }
}
