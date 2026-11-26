import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma';
import { AuditService } from '../../audit/audit.service';
import { asJson } from '../../../common/utils/json-column';
import { CreateAccountDto, UpdateAccountDto } from '../dto';
import {
  DEFAULT_ACCOUNT_ALIASES,
  TECHNICAL_ACCOUNT_CODES,
} from '../../../../../shared/types/accounting';

export const DEFAULT_NAS_ACCOUNTS = [
  {
    code: '1010',
    name: { uz: 'Materiallar', ru: 'Материалы' },
    type: 'ASSET' as const,
    isSystem: true,
  },
  {
    code: '2810',
    name: { uz: 'Tayyor mahsulotlar', ru: 'Готовая продукция' },
    type: 'ASSET' as const,
    isSystem: true,
  },
  {
    code: '2910',
    name: { uz: 'Ombordagi tovarlar', ru: 'Товары на складе' },
    type: 'ASSET' as const,
    isSystem: true,
  },
  {
    code: '2920',
    name: {
      uz: "Yo'ldagi tovarlar (In-Transit)",
      ru: 'Товары в пути (In-Transit)',
    },
    type: 'ASSET' as const,
    isSystem: true,
  },
  {
    code: '4010',
    name: {
      uz: 'Xaridorlar va buyurtmachilar qarzdorligi',
      ru: 'Задолженность покупателей и заказчиков',
    },
    type: 'ASSET' as const,
    isSystem: true,
  },
  {
    code: '4410',
    name: {
      uz: 'Hisobga olinadigan kiruvchi QQS',
      ru: 'Входящий НДС к зачёту',
    },
    type: 'ASSET' as const,
    isSystem: true,
  },
  {
    code: '5010',
    name: { uz: 'Milliy valyutadagi kassa', ru: 'Касса в национальной валюте' },
    type: 'ASSET' as const,
    isSystem: true,
  },
  {
    code: '5020',
    name: {
      uz: 'Chet el valyutasidagi kassa',
      ru: 'Касса в иностранной валюте',
    },
    type: 'ASSET' as const,
    isSystem: true,
  },
  {
    code: '5110',
    name: { uz: 'Hisob-kitob raqami (Bank)', ru: 'Расчётный счёт (Банк)' },
    type: 'ASSET' as const,
    isSystem: true,
  },
  {
    code: '5210',
    name: {
      uz: 'Chet el valyutasidagi bank hisobi',
      ru: 'Валютный банковский счёт',
    },
    type: 'ASSET' as const,
    isSystem: true,
  },
  {
    code: '6010',
    name: {
      uz: 'Mol etkazib beruvchilarga qarzlar',
      ru: 'Задолженность поставщикам',
    },
    type: 'LIABILITY' as const,
    isSystem: true,
  },
  {
    code: '6410',
    name: {
      uz: "Byudjetga to'lovlar (QQS 12%)",
      ru: 'Задолженность по НДС (12%)',
    },
    type: 'LIABILITY' as const,
    isSystem: true,
  },
  {
    code: '9010',
    name: {
      uz: 'Mahsulot / Tovar sotishdan daromadlar',
      ru: 'Доходы от реализации товаров',
    },
    type: 'REVENUE' as const,
    isSystem: true,
  },
  {
    code: '9110',
    name: {
      uz: 'Sotilgan tovarlar tannarxi (COGS)',
      ru: 'Себестоимость реализованных товаров',
    },
    type: 'EXPENSE' as const,
    isSystem: true,
  },
  {
    code: '9030',
    name: {
      uz: "Xizmatlar ko'rsatishdan daromadlar",
      ru: 'Доходы от оказания услуг',
    },
    type: 'REVENUE' as const,
    isSystem: true,
  },
  {
    code: '9420',
    name: {
      uz: "Ma'muriy xarajatlar",
      ru: 'Административные расходы',
    },
    type: 'EXPENSE' as const,
    isSystem: true,
  },
  {
    // Counter-account for a Finance expense booked without a counterparty.
    code: '9430',
    name: {
      uz: 'Boshqa operatsion xarajatlar',
      ru: 'Прочие операционные расходы',
    },
    type: 'EXPENSE' as const,
    isSystem: true,
  },
  {
    // Counter-account for a Finance income booked without a counterparty.
    code: '9390',
    name: {
      uz: 'Boshqa operatsion daromadlar',
      ru: 'Прочие операционные доходы',
    },
    type: 'REVENUE' as const,
    isSystem: true,
  },
  {
    code: '9540',
    name: {
      uz: 'Valyuta kursi farqidan daromad',
      ru: 'Доход от курсовой разницы',
    },
    type: 'REVENUE' as const,
    isSystem: true,
  },
  {
    code: '9620',
    name: {
      uz: 'Valyuta kursi farqidan zarar',
      ru: 'Расход от курсовой разницы',
    },
    type: 'EXPENSE' as const,
    isSystem: true,
  },
  // Opening balances (OpeningBalancesService.post): every category posts to
  // its own account, and the balancing figure goes to 8710 through the
  // auxiliary account 00, which nets to zero.
  {
    code: '00',
    name: {
      uz: 'Boshlang‘ich qoldiqlar yordamchi hisobvarag‘i',
      ru: 'Вспомогательный счёт ввода остатков',
    },
    type: 'EQUITY' as const,
    isSystem: true,
  },
  {
    code: '0100',
    name: { uz: 'Asosiy vositalar', ru: 'Основные средства' },
    type: 'ASSET' as const,
    isSystem: true,
  },
  {
    // Contra-asset: credited with accumulated depreciation.
    code: '0200',
    name: {
      uz: 'Asosiy vositalarning eskirishi',
      ru: 'Износ основных средств',
    },
    type: 'ASSET' as const,
    isSystem: true,
  },
  {
    code: '4890',
    name: {
      uz: 'Boshqa debitorlik qarzlari',
      ru: 'Прочая дебиторская задолженность',
    },
    type: 'ASSET' as const,
    isSystem: true,
  },
  {
    code: '6990',
    name: { uz: 'Boshqa majburiyatlar', ru: 'Прочие обязательства' },
    type: 'LIABILITY' as const,
    isSystem: true,
  },
  {
    code: '8330',
    name: {
      uz: 'Ustav kapitali (pay va ulushlar)',
      ru: 'Уставный капитал (паи и доли)',
    },
    type: 'EQUITY' as const,
    isSystem: true,
  },
  {
    code: '8710',
    name: {
      uz: 'Taqsimlanmagan foyda (qoplanmagan zarar)',
      ru: 'Нераспределённая прибыль (непокрытый убыток)',
    },
    type: 'EQUITY' as const,
    isSystem: true,
  },
];

type AccountRow = Prisma.AccountGetPayload<object>;

/** Bilingual name JSON → { uz, ru } when both are non-empty strings. */
function asNamePair(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { uz, ru } = value as Record<string, unknown>;
  return typeof uz === 'string' &&
    typeof ru === 'string' &&
    uz.trim() &&
    ru.trim()
    ? { uz: uz.trim(), ru: ru.trim() }
    : null;
}

/**
 * The account as the API shows it: the plain-language alias is the tenant's
 * own when set, else the default one for the code (TZ 8).
 */
export function presentAccount(account: AccountRow, isUsed?: boolean) {
  const custom = asNamePair(account.alias);
  return {
    ...account,
    alias: custom ?? DEFAULT_ACCOUNT_ALIASES[account.code] ?? null,
    aliasCustom: Boolean(custom),
    ...(isUsed === undefined ? {} : { isUsed }),
  };
}

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    // Optional so scripts and specs can build the service with Prisma alone.
    @Optional() private readonly audit?: AuditService,
  ) {}

  /**
   * Seed default Uzbekistan NAS Chart of Accounts for a tenant if not present
   */
  async ensureDefaultAccounts(tenantId: string) {
    const existingDefaultCount = await this.prisma.account.count({
      where: {
        tenantId,
        code: { in: DEFAULT_NAS_ACCOUNTS.map((account) => account.code) },
      },
    });

    if (existingDefaultCount < DEFAULT_NAS_ACCOUNTS.length) {
      for (const acc of DEFAULT_NAS_ACCOUNTS) {
        const existing = await this.prisma.account.findFirst({
          where: { tenantId, code: acc.code },
        });

        if (!existing) {
          await this.prisma.account.create({
            data: {
              tenantId,
              code: acc.code,
              name: acc.name,
              type: acc.type,
              isSystem: acc.isSystem,
              isTechnical: TECHNICAL_ACCOUNT_CODES.includes(acc.code),
              isActive: true,
            },
          });
        }
      }
    }
  }

  async findAll(tenantId: string) {
    await this.ensureDefaultAccounts(tenantId);
    const [accounts, used] = await Promise.all([
      this.prisma.account.findMany({
        where: { tenantId },
        orderBy: { code: 'asc' },
      }),
      this.usedAccountIds(tenantId),
    ]);
    return accounts.map((account) =>
      presentAccount(account, used.has(account.id)),
    );
  }

  /** Ids of accounts that any journal line of the tenant touches. */
  async usedAccountIds(tenantId: string): Promise<Set<string>> {
    const where = { entry: { tenantId } };
    const [debit, credit] = await Promise.all([
      this.prisma.journalLine.groupBy({ by: ['debitAccountId'], where }),
      this.prisma.journalLine.groupBy({ by: ['creditAccountId'], where }),
    ]);
    return new Set([
      ...debit.map((row) => row.debitAccountId),
      ...credit.map((row) => row.creditAccountId),
    ]);
  }

  async create(tenantId: string, dto: CreateAccountDto, userId?: string) {
    const code = dto.code.trim();
    const duplicate = await this.prisma.account.findFirst({
      where: { tenantId, code },
      select: { id: true },
    });
    if (duplicate) {
      throw new BadRequestException(
        `${code} kodli hisob allaqachon bor / Счёт с кодом ${code} уже существует`,
      );
    }
    const account = await this.prisma.account.create({
      data: {
        tenantId,
        code,
        name: asJson(dto.name),
        alias: dto.alias ? asJson(dto.alias) : Prisma.DbNull,
        type: dto.type,
        isSystem: false,
        isTechnical: false,
        isActive: true,
      },
    });
    await this.audit?.logAction({
      tenantId,
      userId,
      entityType: 'Account',
      entityId: account.id,
      action: 'CREATE',
      newValue: {
        code,
        name: dto.name,
        type: dto.type,
        alias: dto.alias ?? null,
      },
    });
    return presentAccount(account, false);
  }

  /**
   * Plain-language alias and active flag (TZ 8). The code, official name and
   * type never change; an account is deactivated, never deleted.
   */
  async update(
    tenantId: string,
    id: string,
    dto: UpdateAccountDto,
    userId?: string,
  ) {
    const account = await this.prisma.account.findFirst({
      where: { id, tenantId },
    });
    if (!account) {
      throw new NotFoundException('Hisob topilmadi / Счёт не найден');
    }
    const data: Prisma.AccountUpdateInput = {};
    if (dto.alias !== undefined) {
      data.alias = dto.alias === null ? Prisma.DbNull : asJson(dto.alias);
    }
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    const updated = await this.prisma.account.update({
      where: { id: account.id, tenantId },
      data,
    });
    await this.audit?.logAction({
      tenantId,
      userId,
      entityType: 'Account',
      entityId: account.id,
      action: 'UPDATE',
      oldValue: { alias: account.alias, isActive: account.isActive },
      newValue: { alias: updated.alias, isActive: updated.isActive },
    });
    return presentAccount(updated);
  }

  async findByCode(tenantId: string, code: string) {
    await this.ensureDefaultAccounts(tenantId);
    return this.prisma.account.findFirst({
      where: { tenantId, code },
    });
  }
}
