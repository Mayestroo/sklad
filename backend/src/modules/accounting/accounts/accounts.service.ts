import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { CreateAccountDto } from '../dto';

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
    code: '5110',
    name: { uz: 'Hisob-kitob raqami (Bank)', ru: 'Расчётный счёт (Банк)' },
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
];

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Seed default Uzbekistan NAS Chart of Accounts for a tenant if not present
   */
  async ensureDefaultAccounts(tenantId: string) {
    const existingCount = await this.prisma.account.count({
      where: { tenantId },
    });

    if (existingCount < DEFAULT_NAS_ACCOUNTS.length) {
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
              isActive: true,
            },
          });
        }
      }
    }
  }

  async findAll(tenantId: string) {
    await this.ensureDefaultAccounts(tenantId);
    return this.prisma.account.findMany({
      where: { tenantId },
      orderBy: { code: 'asc' },
    });
  }

  async create(tenantId: string, dto: CreateAccountDto) {
    return this.prisma.account.create({
      data: {
        tenantId,
        code: dto.code,
        name: dto.name,
        type: dto.type,
        isSystem: false,
        isActive: true,
      },
    });
  }

  async findByCode(tenantId: string, code: string) {
    await this.ensureDefaultAccounts(tenantId);
    return this.prisma.account.findFirst({
      where: { tenantId, code },
    });
  }
}
