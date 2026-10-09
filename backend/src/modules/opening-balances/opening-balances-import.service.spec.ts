import * as ExcelJS from 'exceljs';
import { OpeningBalancesImportService } from './opening-balances-import.service';
import { PrismaService } from '../../common/prisma/prisma.service';

describe('OpeningBalancesImportService', () => {
  it('does not assign an unnamed cash balance to an arbitrary same-currency account', async () => {
    const prisma = {
      cashAccount: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'cash-uzs',
            accountType: 'UZS_CASH',
            currency: 'UZS',
            name: { uz: 'Naqd kassa', ru: 'Наличная касса' },
          },
          {
            id: 'bank-uzs',
            accountType: 'BANK',
            currency: 'UZS',
            name: { uz: 'Hisobraqam', ru: 'Расчетный счет' },
          },
          {
            id: 'cash-usd',
            accountType: 'USD_CASH',
            currency: 'USD',
            name: { uz: 'Dollar kassa', ru: 'Долларовая касса' },
          },
        ]),
      },
      product: { findMany: jest.fn().mockResolvedValue([]) },
      warehouse: { findMany: jest.fn().mockResolvedValue([]) },
      counterparty: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new OpeningBalancesImportService(
      prisma as unknown as PrismaService,
    );
    const workbook = new ExcelJS.Workbook();
    const cashSheet = workbook.addWorksheet('1_Pul');
    cashSheet.addRow([
      'Kassa / Hisobraqam nomi',
      'Valyuta',
      'Qoldiq summasi',
      'UZS kursi',
      'Izoh',
    ]);
    cashSheet.addRow(['', 'UZS', 100000, 1, '']);
    const file = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await service.validateAndParse(
      'tenant-1',
      file,
      'opening.xlsx',
    );

    expect(result.validRows).toBe(0);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sheetName: '1_Pul',
          fieldName: 'Kassa/Hisobraqam',
          errorMessage: 'Tizimda mos kassa yoki hisobraqam topilmadi',
        }),
      ]),
    );
  });
});
