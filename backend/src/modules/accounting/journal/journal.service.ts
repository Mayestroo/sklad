import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { AccountsService } from '../accounts/accounts.service';
import { CreateJournalEntryDto } from '../dto';

@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
  ) {}

  /**
   * Post a balanced double-entry Journal Entry (Provodka)
   */
  async createJournalEntry(tenantId: string, dto: CreateJournalEntryDto) {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException(
        'Journal entry must contain at least one line',
      );
    }

    const entryNumber = await this.generateEntryNumber(tenantId);

    return this.prisma.journalEntry.create({
      data: {
        tenantId,
        entryNumber,
        description: dto.description,
        sourceDocType: dto.sourceDocType || null,
        sourceDocId: dto.sourceDocId || null,
        lines: {
          create: dto.lines.map((line) => ({
            debitAccountId: line.debitAccountId,
            creditAccountId: line.creditAccountId,
            amount: line.amount,
            description: line.description || null,
          })),
        },
      },
      include: {
        lines: {
          include: {
            debitAccount: true,
            creditAccount: true,
          },
        },
      },
    });
  }

  /**
   * Auto-post Journal Entries when a Sales Invoice is posted
   * 1. Dt 4010 (Customer) / Kt 9010 (Revenue) — Subtotal
   * 2. Dt 4010 (Customer) / Kt 6410 (VAT 12%) — VAT
   * 3. Dt 9110 (COGS) / Kt 2910 (Warehouse Goods) — Cost Price
   */
  async autoPostSalesInvoice(tenantId: string, invoice: any) {
    await this.accountsService.ensureDefaultAccounts(tenantId);

    const acc4010 = await this.accountsService.findByCode(tenantId, '4010');
    const acc9010 = await this.accountsService.findByCode(tenantId, '9010');
    const acc6410 = await this.accountsService.findByCode(tenantId, '6410');
    const acc9110 = await this.accountsService.findByCode(tenantId, '9110');
    const acc2910 = await this.accountsService.findByCode(tenantId, '2910');

    if (!acc4010 || !acc9010 || !acc6410 || !acc9110 || !acc2910) {
      return;
    }

    const lines: any[] = [];

    // 1. Revenue Posting (Subtotal)
    const subtotal = Number(invoice.subtotalAmount);
    if (subtotal > 0) {
      lines.push({
        debitAccountId: acc4010.id,
        creditAccountId: acc9010.id,
        amount: subtotal,
        description: `Sotuvdan daromad (Faktura № ${invoice.invoiceNumber})`,
      });
    }

    // 2. VAT 12% Posting
    const vat = Number(invoice.vatAmount);
    if (vat > 0) {
      lines.push({
        debitAccountId: acc4010.id,
        creditAccountId: acc6410.id,
        amount: vat,
        description: `Byudjetga QQS 12% (Faktura № ${invoice.invoiceNumber})`,
      });
    }

    // 3. COGS & Stock Deduction Posting
    let cogsTotal = 0;
    if (invoice.items && Array.isArray(invoice.items)) {
      for (const item of invoice.items) {
        const costPrice = Number(item.product?.costPrice) || 0;
        cogsTotal += Number(item.quantity) * costPrice;
      }
    }

    if (cogsTotal > 0) {
      lines.push({
        debitAccountId: acc9110.id,
        creditAccountId: acc2910.id,
        amount: cogsTotal,
        description: `Sotilgan tovarlar tannarxi (COGS - Faktura № ${invoice.invoiceNumber})`,
      });
    }

    if (lines.length > 0) {
      await this.createJournalEntry(tenantId, {
        description: `Avtomatik provodka: Sotuv Hisob-Fakturasi № ${invoice.invoiceNumber}`,
        sourceDocType: 'SalesInvoice',
        sourceDocId: invoice.id,
        lines,
      });
    }
  }

  /**
   * Auto-post Journal Entries when a Payment is received
   * Dt 5110 (Bank) or Dt 5010 (Cash) / Kt 4010 (Customer)
   */
  async autoPostPayment(tenantId: string, payment: any) {
    await this.accountsService.ensureDefaultAccounts(tenantId);

    const bankAccountCode = payment.method === 'CASH' ? '5010' : '5110';
    const accBank = await this.accountsService.findByCode(
      tenantId,
      bankAccountCode,
    );
    const acc4010 = await this.accountsService.findByCode(tenantId, '4010');

    if (!accBank || !acc4010) return;

    await this.createJournalEntry(tenantId, {
      description: `Avtomatik provodka: To'lov kelib tushishi № ${payment.paymentNumber}`,
      sourceDocType: 'Payment',
      sourceDocId: payment.id,
      lines: [
        {
          debitAccountId: accBank.id,
          creditAccountId: acc4010.id,
          amount: Number(payment.amount),
          description: `Mijozdan to'lov (${payment.method})`,
        },
      ],
    });
  }

  /**
   * Auto-post Journal Entries when goods are received from supplier (Inbound Receiving)
   * Dt 2910 (Warehouse Goods) / Kt 6010 (Accounts Payable)
   */
  async autoPostInboundDoc(tenantId: string, doc: any) {
    await this.accountsService.ensureDefaultAccounts(tenantId);

    const acc2910 = await this.accountsService.findByCode(tenantId, '2910');
    const acc6010 = await this.accountsService.findByCode(tenantId, '6010');

    if (!acc2910 || !acc6010) return;

    const total = Number(doc.totalAmount);
    if (total > 0) {
      await this.createJournalEntry(tenantId, {
        description: `Avtomatik provodka: Omborga tovar kirim qilish № ${doc.docNumber}`,
        sourceDocType: 'InventoryDocument',
        sourceDocId: doc.id,
        lines: [
          {
            debitAccountId: acc2910.id,
            creditAccountId: acc6010.id,
            amount: total,
            description: `Omborga tovar kelib tushishi (Kirim № ${doc.docNumber})`,
          },
        ],
      });
    }
  }

  /**
   * Step 1: Auto-post Journal Entry when Stock Transfer is Shipped (Jo'natildi)
   * Dt 2920 (Yo'ldagi tovarlar / In-Transit) / Kt 2910 (Chiquvchi Ombor)
   */
  async autoPostShipTransfer(
    tenantId: string,
    transfer: any,
    totalCostValue: number,
  ) {
    await this.accountsService.ensureDefaultAccounts(tenantId);

    const acc2920 = await this.accountsService.findByCode(tenantId, '2920');
    const acc2910 = await this.accountsService.findByCode(tenantId, '2910');

    if (!acc2920 || !acc2910 || totalCostValue <= 0) return;

    await this.createJournalEntry(tenantId, {
      description: `Avtomatik provodka: Omborlararo tovar jo'natish № ${transfer.transferNumber}`,
      sourceDocType: 'StockTransfer',
      sourceDocId: transfer.id,
      lines: [
        {
          debitAccountId: acc2920.id,
          creditAccountId: acc2910.id,
          amount: totalCostValue,
          description: `Yo'ldagi tovarlar bo'yicha kirim (Transfer № ${transfer.transferNumber})`,
        },
      ],
    });
  }

  /**
   * Step 2: Auto-post Journal Entry when Stock Transfer is Received at Target Warehouse (Qabul qilindi)
   * Dt 2910 (Kiruvchi Ombor) / Kt 2920 (Yo'ldagi tovarlar / In-Transit)
   */
  async autoPostReceiveTransfer(
    tenantId: string,
    transfer: any,
    totalCostValue: number,
  ) {
    await this.accountsService.ensureDefaultAccounts(tenantId);

    const acc2910 = await this.accountsService.findByCode(tenantId, '2910');
    const acc2920 = await this.accountsService.findByCode(tenantId, '2920');

    if (!acc2910 || !acc2920 || totalCostValue <= 0) return;

    await this.createJournalEntry(tenantId, {
      description: `Avtomatik provodka: Omborlararo tovar qabul qilish № ${transfer.transferNumber}`,
      sourceDocType: 'StockTransfer',
      sourceDocId: transfer.id,
      lines: [
        {
          debitAccountId: acc2910.id,
          creditAccountId: acc2920.id,
          amount: totalCostValue,
          description: `Mo'ljallangan omborga tovar yetib kelishi (Transfer № ${transfer.transferNumber})`,
        },
      ],
    });
  }

  async findAllByTenant(tenantId: string) {
    return this.prisma.journalEntry.findMany({
      where: { tenantId },
      include: {
        lines: {
          include: {
            debitAccount: true,
            creditAccount: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Auto-post Journal Entries when a Service Act is posted
   * PROVIDED:
   * 1. Dt 4010 (Customer Receivables) / Kt 9030 (Service Revenue) — Subtotal
   * 2. Dt 4010 (Customer Receivables) / Kt 6410 (VAT Payable) — VAT Amount (if > 0)
   * RECEIVED:
   * 1. Dt 9420 (Admin Expenses) / Kt 6010 (Supplier Payables) — Subtotal
   * 2. Dt 4410 (Input VAT) / Kt 6010 (Supplier Payables) — VAT Amount (if > 0)
   */
  async autoPostServiceAct(tenantId: string, act: any) {
    await this.accountsService.ensureDefaultAccounts(tenantId);

    const lines: any[] = [];
    const subtotal = Number(act.subtotal) || 0;
    const vat = Number(act.vatAmount) || 0;

    if (act.type === 'PROVIDED') {
      const acc4010 = await this.accountsService.findByCode(tenantId, '4010');
      let acc9030 = await this.accountsService.findByCode(tenantId, '9030');
      if (!acc9030) acc9030 = await this.accountsService.findByCode(tenantId, '9010');
      const acc6410 = await this.accountsService.findByCode(tenantId, '6410');

      if (!acc4010 || !acc9030) return;

      if (subtotal > 0) {
        lines.push({
          debitAccountId: acc4010.id,
          creditAccountId: acc9030.id,
          amount: subtotal,
          description: `Ko'rsatilgan xizmatdan daromad (Akt № ${act.actNumber})`,
        });
      }

      if (vat > 0 && acc6410) {
        lines.push({
          debitAccountId: acc4010.id,
          creditAccountId: acc6410.id,
          amount: vat,
          description: `Ko'rsatilgan xizmat bo'yicha QQS (Akt № ${act.actNumber})`,
        });
      }
    } else if (act.type === 'RECEIVED') {
      const acc6010 = await this.accountsService.findByCode(tenantId, '6010');
      const acc9420 = await this.accountsService.findByCode(tenantId, '9420');
      const acc4410 = await this.accountsService.findByCode(tenantId, '4410');

      if (!acc6010 || !acc9420) return;

      if (subtotal > 0) {
        lines.push({
          debitAccountId: acc9420.id,
          creditAccountId: acc6010.id,
          amount: subtotal,
          description: `Olingan xizmat xarajati (Akt № ${act.actNumber})`,
        });
      }

      if (vat > 0 && acc4410) {
        lines.push({
          debitAccountId: acc4410.id,
          creditAccountId: acc6010.id,
          amount: vat,
          description: `Olingan xizmat bo'yicha kiruvchi QQS (Akt № ${act.actNumber})`,
        });
      }
    }

    if (lines.length > 0) {
      await this.createJournalEntry(tenantId, {
        description: `Avtomatik provodka: Xizmatlar dalolatnomasi № ${act.actNumber}`,
        sourceDocType: 'ServiceAct',
        sourceDocId: act.id,
        lines,
      });
    }
  }

  private async generateEntryNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.journalEntry.count({ where: { tenantId } });
    const nextSeq = (count + 1).toString().padStart(6, '0');
    return `JE-${nextSeq}`;
  }
}
