import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { AccountsService } from '../accounts/accounts.service';

@Injectable()
export class AccountingReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accountsService: AccountsService,
  ) {}

  /**
   * Calculate Trial Balance (Oborotno-Saldovaya Vedomost - OSV)
   */
  async getTrialBalance(tenantId: string) {
    await this.accountsService.ensureDefaultAccounts(tenantId);

    const accounts = await this.prisma.account.findMany({
      where: { tenantId },
      orderBy: { code: 'asc' },
    });

    const journalLines = await this.prisma.journalLine.findMany({
      where: { entry: { tenantId } },
    });

    let totalDebitTurnover = 0;
    let totalCreditTurnover = 0;

    const items = accounts.map((acc) => {
      let debitTurnover = 0;
      let creditTurnover = 0;

      journalLines.forEach((line) => {
        if (line.debitAccountId === acc.id) {
          debitTurnover += Number(line.amount);
        }
        if (line.creditAccountId === acc.id) {
          creditTurnover += Number(line.amount);
        }
      });

      totalDebitTurnover += debitTurnover;
      totalCreditTurnover += creditTurnover;

      // Closing balance computation based on NAS Account Type
      let closingBalance = 0;
      if (acc.type === 'ASSET' || acc.type === 'EXPENSE') {
        closingBalance = debitTurnover - creditTurnover;
      } else {
        closingBalance = creditTurnover - debitTurnover;
      }

      return {
        accountId: acc.id,
        accountCode: acc.code,
        accountName: acc.name,
        accountType: acc.type,
        debitTurnover,
        creditTurnover,
        closingBalance,
      };
    });

    return {
      periodStart: new Date(new Date().getFullYear(), 0, 1).toISOString(),
      periodEnd: new Date().toISOString(),
      items,
      totalDebitTurnover,
      totalCreditTurnover,
    };
  }

  /**
   * Calculate Form 1 Balance Sheet & Form 2 Profit & Loss
   */
  async getFinancialStatements(tenantId: string) {
    const osv = await this.getTrialBalance(tenantId);

    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalRevenue = 0;
    let totalCogs = 0;

    osv.items.forEach((item) => {
      if (item.accountType === 'ASSET') {
        totalAssets += item.closingBalance;
      } else if (item.accountType === 'LIABILITY') {
        totalLiabilities += item.closingBalance;
      } else if (item.accountType === 'REVENUE') {
        totalRevenue += item.creditTurnover;
      } else if (item.accountType === 'EXPENSE') {
        totalCogs += item.debitTurnover;
      }
    });

    const grossProfit = totalRevenue - totalCogs;
    const netProfit = grossProfit; // Simplification before operating expenses

    return {
      balanceSheet: {
        totalAssets,
        totalLiabilities,
        totalEquity: netProfit,
        isBalanced: Math.abs(totalAssets - (totalLiabilities + netProfit)) < 0.01,
      },
      profitLoss: {
        totalRevenue,
        totalCogs,
        grossProfit,
        netProfit,
      },
    };
  }
}
