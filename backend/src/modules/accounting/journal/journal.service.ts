import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { AccountsService } from '../accounts/accounts.service';
import { CreateJournalEntryDto, JournalLineDto } from '../dto';
import { ledgerAccountCodeForCashAccount } from '../../../../../shared/types/cash-account-policy';
import { CashAccountType, PaymentMethod, Prisma } from '@prisma/client';
import {
  convertAmountToUzs,
  requireExchangeRateForCurrency,
} from '../../../common/utils/transaction-exchange-rate';
import { nextDocumentNumber } from '../../../common/sequences/document-sequence';

interface CashPaymentForJournal {
  id: string;
  paymentNumber: string;
  method: PaymentMethod;
  amount: number | string | Prisma.Decimal;
  currency: string;
  exchangeRate: number;
  cashAccount: { accountType: CashAccountType; currency: string } | null;
  invoice?: {
    currency: string;
    exchangeRate: number | string | Prisma.Decimal;
  } | null;
  salesOrder?: {
    currency: string;
    exchangeRate: number | string | Prisma.Decimal;
  } | null;
}

type Numeric = number | string | Prisma.Decimal;

interface InboundDocForJournal {
  id: string;
  docNumber: string;
  totalAmount: Numeric;
}

interface TransferForJournal {
  id: string;
  transferNumber: string;
}

interface ServiceActForJournal {
  id: string;
  actNumber: string;
  type: string;
  currency: string;
  exchangeRate: Numeric | null;
  subtotal: Numeric;
  vatAmount: Numeric;
}

/**
 * Where journal entries are written. Callers that post as part of a business
 * document pass their Prisma transaction client so the entry commits or rolls
 * back together with the document (ADR 0006).
 */
export type JournalWriter = Pick<
  Prisma.TransactionClient,
  'journalEntry' | '$queryRaw'
>;

/**
 * A journal entry to post. `entryDate` is the business document's date; it
 * dates the entry and selects the yearly number series (JE-YYYY-NNNNN).
 */
export type JournalEntryInput = CreateJournalEntryDto & { entryDate?: Date };

@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
  ) {}

  /**
   * Post a balanced double-entry Journal Entry (Provodka).
   * The only writer of journal entries: business documents pass their
   * transaction client so the entry commits or rolls back with the document.
   */
  async createJournalEntry(
    tenantId: string,
    dto: JournalEntryInput,
    db: JournalWriter = this.prisma,
  ) {
    if (!dto.lines || dto.lines.length === 0) {
      throw new BadRequestException(
        'Journal entry must contain at least one line',
      );
    }

    const entryDate = dto.entryDate ?? new Date();
    const entryNumber = await nextDocumentNumber(
      db,
      tenantId,
      'JOURNAL_ENTRY',
      entryDate,
    );

    return db.journalEntry.create({
      data: {
        tenantId,
        entryNumber,
        entryDate,
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
   * Auto-post Journal Entries when a Payment is received
   * Dt 5110 (Bank) or Dt 5010 (Cash) / Kt 4010 (Customer)
   */
  async autoPostPayment(
    tenantId: string,
    payment: CashPaymentForJournal,
    db: JournalWriter = this.prisma,
  ) {
    await this.accountsService.ensureDefaultAccounts(tenantId);
    const exchangeRate = requireExchangeRateForCurrency(
      payment.currency,
      payment.exchangeRate,
    );

    const cashLedgerAccountCode = payment.cashAccount
      ? ledgerAccountCodeForCashAccount(payment.cashAccount)
      : null;
    if (!cashLedgerAccountCode) {
      throw new BadRequestException(
        'Payment must reference a valid, currency-specific cash or bank account',
      );
    }
    const accBank = await this.accountsService.findByCode(
      tenantId,
      cashLedgerAccountCode,
    );
    const acc4010 = await this.accountsService.findByCode(tenantId, '4010');

    if (!accBank || !acc4010) return;

    const linkedDocument = payment.invoice ?? payment.salesOrder;
    if (!linkedDocument || linkedDocument.currency !== payment.currency) {
      throw new BadRequestException(
        'Payment must link to a sales document in the same currency',
      );
    }
    const documentExchangeRate = requireExchangeRateForCurrency(
      linkedDocument.currency,
      Number(linkedDocument.exchangeRate),
    );
    const cashAmountInUzs = convertAmountToUzs(
      Number(payment.amount),
      payment.currency,
      exchangeRate,
    );
    const receivableReductionInUzs = convertAmountToUzs(
      Number(payment.amount),
      linkedDocument.currency,
      documentExchangeRate,
    );
    const exchangeDifference =
      Math.round((cashAmountInUzs - receivableReductionInUzs) * 100) / 100;
    const exchangeNote =
      payment.currency === 'USD'
        ? ` (to'lov kursi: 1 USD = ${exchangeRate} UZS, hujjat kursi: 1 USD = ${documentExchangeRate} UZS)`
        : '';
    const journalLines = [
      {
        debitAccountId: accBank.id,
        creditAccountId: acc4010.id,
        amount: Math.min(cashAmountInUzs, receivableReductionInUzs),
        description: `Mijozdan to'lov (${payment.method})`,
      },
    ];

    if (exchangeDifference > 0) {
      const exchangeGainAccount = await this.accountsService.findByCode(
        tenantId,
        '9540',
      );
      if (!exchangeGainAccount)
        throw new BadRequestException(
          'Valyuta kursi daromad hisobi (9540) topilmadi',
        );
      journalLines.push({
        debitAccountId: accBank.id,
        creditAccountId: exchangeGainAccount.id,
        amount: exchangeDifference,
        description: `To'lov bo'yicha valyuta kursi daromadi${exchangeNote}`,
      });
    } else if (exchangeDifference < 0) {
      const exchangeLossAccount = await this.accountsService.findByCode(
        tenantId,
        '9620',
      );
      if (!exchangeLossAccount)
        throw new BadRequestException(
          'Valyuta kursi zarar hisobi (9620) topilmadi',
        );
      journalLines.push({
        debitAccountId: exchangeLossAccount.id,
        creditAccountId: acc4010.id,
        amount: Math.abs(exchangeDifference),
        description: `To'lov bo'yicha valyuta kursi zarari${exchangeNote}`,
      });
    }

    await this.createJournalEntry(
      tenantId,
      {
        description: `Avtomatik provodka: To'lov kelib tushishi № ${payment.paymentNumber}${exchangeNote}`,
        sourceDocType: 'Payment',
        sourceDocId: payment.id,
        lines: journalLines,
      },
      db,
    );
  }

  /**
   * Auto-post Journal Entries when goods are received from supplier (Inbound Receiving)
   * Dt 2910 (Warehouse Goods) / Kt 6010 (Accounts Payable)
   */
  async autoPostInboundDoc(
    tenantId: string,
    doc: InboundDocForJournal,
    db: JournalWriter = this.prisma,
  ) {
    await this.accountsService.ensureDefaultAccounts(tenantId);

    const acc2910 = await this.accountsService.findByCode(tenantId, '2910');
    const acc6010 = await this.accountsService.findByCode(tenantId, '6010');

    if (!acc2910 || !acc6010) return;

    const total = Number(doc.totalAmount);
    if (total > 0) {
      await this.createJournalEntry(
        tenantId,
        {
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
        },
        db,
      );
    }
  }

  /**
   * Step 1: Auto-post Journal Entry when Stock Transfer is Shipped (Jo'natildi)
   * Dt 2920 (Yo'ldagi tovarlar / In-Transit) / Kt 2910 (Chiquvchi Ombor)
   */
  async autoPostShipTransfer(
    tenantId: string,
    transfer: TransferForJournal,
    totalCostValue: number,

    db: JournalWriter = this.prisma,
  ) {
    await this.accountsService.ensureDefaultAccounts(tenantId);

    const acc2920 = await this.accountsService.findByCode(tenantId, '2920');
    const acc2910 = await this.accountsService.findByCode(tenantId, '2910');

    if (!acc2920 || !acc2910 || totalCostValue <= 0) return;

    await this.createJournalEntry(
      tenantId,
      {
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
      },
      db,
    );
  }

  /**
   * Step 2: Auto-post Journal Entry when Stock Transfer is Received at Target Warehouse (Qabul qilindi)
   * Dt 2910 (Kiruvchi Ombor) / Kt 2920 (Yo'ldagi tovarlar / In-Transit)
   */
  async autoPostReceiveTransfer(
    tenantId: string,
    transfer: TransferForJournal,
    totalCostValue: number,

    db: JournalWriter = this.prisma,
  ) {
    await this.accountsService.ensureDefaultAccounts(tenantId);

    const acc2910 = await this.accountsService.findByCode(tenantId, '2910');
    const acc2920 = await this.accountsService.findByCode(tenantId, '2920');

    if (!acc2910 || !acc2920 || totalCostValue <= 0) return;

    await this.createJournalEntry(
      tenantId,
      {
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
      },
      db,
    );
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
  async autoPostServiceAct(
    tenantId: string,
    act: ServiceActForJournal,
    db: JournalWriter = this.prisma,
  ) {
    await this.accountsService.ensureDefaultAccounts(tenantId);

    const lines: JournalLineDto[] = [];
    const exchangeRate = requireExchangeRateForCurrency(
      act.currency,
      Number(act.exchangeRate),
    );
    const subtotal = convertAmountToUzs(
      Number(act.subtotal),
      act.currency,
      exchangeRate,
    );
    const vat = convertAmountToUzs(
      Number(act.vatAmount),
      act.currency,
      exchangeRate,
    );

    if (act.type === 'PROVIDED') {
      const acc4010 = await this.accountsService.findByCode(tenantId, '4010');
      let acc9030 = await this.accountsService.findByCode(tenantId, '9030');
      if (!acc9030)
        acc9030 = await this.accountsService.findByCode(tenantId, '9010');
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
      await this.createJournalEntry(
        tenantId,
        {
          description: `Avtomatik provodka: Xizmatlar dalolatnomasi № ${act.actNumber}`,
          sourceDocType: 'ServiceAct',
          sourceDocId: act.id,
          lines,
        },
        db,
      );
    }
  }
}
