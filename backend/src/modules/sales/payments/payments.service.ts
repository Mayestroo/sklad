import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { AuditService } from '../../audit/audit.service';
import { JournalService } from '../../accounting/journal/journal.service';
import { CreatePaymentDto } from '../dto';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly journalService: JournalService,
  ) {}

  async registerPayment(tenantId: string, dto: CreatePaymentDto, userId: string) {
    const counterparty = await this.prisma.counterparty.findFirst({
      where: { id: dto.counterpartyId, tenantId },
    });

    if (!counterparty) {
      throw new NotFoundException('Counterparty not found');
    }

    const paymentNumber = await this.generatePaymentNumber(tenantId);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create Payment record
      const payment = await tx.payment.create({
        data: {
          tenantId,
          counterpartyId: dto.counterpartyId,
          invoiceId: dto.invoiceId || null,
          paymentNumber,
          method: dto.method,
          amount: dto.amount,
          comment: dto.comment,
        },
        include: {
          counterparty: true,
          invoice: true,
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

      // 3. If linked to an invoice, update invoice paid amount and status
      if (dto.invoiceId) {
        const invoice = await tx.salesInvoice.findUnique({
          where: { id: dto.invoiceId },
        });

        if (invoice) {
          const newPaidAmount = Number(invoice.paidAmount) + dto.amount;
          const totalAmount = Number(invoice.totalAmount);
          const newPaymentStatus = newPaidAmount >= totalAmount ? 'PAID' : 'PARTIALLY_PAID';

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

    // 4. Module 4 Integration: Auto-post Payment NAS double-entry journal (Dt 5110/5010 / Kt 4010)
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
      newValue: { paymentNumber, amount: dto.amount, method: dto.method },
    });

    return result;
  }

  async findAllByTenant(tenantId: string) {
    return this.prisma.payment.findMany({
      where: { tenantId },
      include: {
        counterparty: true,
        invoice: true,
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
