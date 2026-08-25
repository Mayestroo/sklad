import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { AuditService } from '../../audit/audit.service';
import { JournalService } from '../../accounting/journal/journal.service';
import { CreatePaymentDto } from '../dto';
import { SalesOrdersService } from '../orders/sales-orders.service';
import { CashAccountType } from '@prisma/client';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly journalService: JournalService,
    private readonly salesOrdersService: SalesOrdersService,
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

    const paymentNumber = await this.generatePaymentNumber(tenantId);

    // Resolve target CashAccount (Dollar kassa, Naqd kassa, Hisobraqam)
    let cashAccountId = dto.cashAccountId;
    if (!cashAccountId) {
      let targetType: CashAccountType = CashAccountType.BANK;
      if (dto.method === 'CASH') {
        targetType = CashAccountType.UZS_CASH;
      }
      const defaultAccount = await this.prisma.cashAccount.findFirst({
        where: { tenantId, accountType: targetType },
      });
      if (defaultAccount) {
        cashAccountId = defaultAccount.id;
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create Payment record
      const payment = await tx.payment.create({
        data: {
          tenantId,
          counterpartyId: dto.counterpartyId,
          invoiceId: dto.invoiceId || null,
          orderId: dto.orderId || null,
          cashAccountId: cashAccountId || null,
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

      // 2. Reduce Counterparty debt balance
      await tx.counterparty.update({
        where: { id: dto.counterpartyId },
        data: {
          debtBalance: {
            decrement: dto.amount,
          },
        },
      });

      // 3. Update CashAccount balance & create FinanceTransaction
      if (cashAccountId) {
        await tx.cashAccount.update({
          where: { id: cashAccountId },
          data: {
            balance: {
              increment: dto.amount,
            },
          },
        });

        await tx.financeTransaction.create({
          data: {
            tenantId,
            direction: 'INCOME',
            accountId: cashAccountId,
            counterpartyId: dto.counterpartyId,
            amount: dto.amount,
            currency: 'UZS',
            comment: dto.comment || `To'lov ${paymentNumber} qabul qilindi`,
            docNumber: paymentNumber,
            sourceDocType: 'PAYMENT',
            sourceDocId: payment.id,
            createdById: userId,
          },
        });
      }

      // 4. If linked to an invoice, update invoice paid amount and status
      if (dto.invoiceId) {
        const invoice = await tx.salesInvoice.findUnique({
          where: { id: dto.invoiceId },
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
      await this.journalService.autoPostPayment(tenantId, result);
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
