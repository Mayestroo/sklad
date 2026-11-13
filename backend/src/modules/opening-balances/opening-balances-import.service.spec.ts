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

  it('reads formula, rich-text and hyperlink cells as the value the user sees', async () => {
    const prisma = {
      cashAccount: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'cash-uzs',
            accountType: 'UZS_CASH',
            currency: 'UZS',
            name: { uz: 'Naqd kassa', ru: 'Наличная касса' },
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
    cashSheet.addRow(['Nomi', 'Valyuta', 'Summa', 'Kurs', 'Izoh']);
    const row = cashSheet.addRow([]);
    row.getCell(1).value = {
      richText: [{ text: 'Naqd ' }, { font: { bold: true }, text: 'kassa' }],
    };
    row.getCell(2).value = { formula: '"UZ"&"S"', result: 'UZS' };
    row.getCell(3).value = { formula: '50000*2', result: 100000 };
    row.getCell(4).value = 1;
    row.getCell(5).value = {
      text: 'opening note',
      hyperlink: 'https://example.com/note',
    };
    const file = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await service.validateAndParse(
      'tenant-1',
      file,
      'opening.xlsx',
    );

    expect(result.errors).toEqual([]);
    expect(result.previewLines).toEqual([
      expect.objectContaining({
        accountId: 'cash-uzs',
        currency: 'UZS',
        amount: 100000,
        notes: 'opening note',
      }),
    ]);
  });

  it('rejects a row with a blank currency instead of assuming UZS (ADR 0022)', async () => {
    const prisma = {
      cashAccount: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'cash-usd',
            accountType: 'USD_CASH',
            currency: 'USD',
            name: { uz: 'Dollar kassa', ru: 'Долларовая касса' },
          },
          {
            id: 'cash-uzs',
            accountType: 'UZS_CASH',
            currency: 'UZS',
            name: { uz: 'Naqd kassa', ru: 'Наличная касса' },
          },
        ]),
      },
      product: { findMany: jest.fn().mockResolvedValue([]) },
      warehouse: { findMany: jest.fn().mockResolvedValue([]) },
      counterparty: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'cp-1', name: 'Mijoz', inn: null }]),
      },
    };
    const service = new OpeningBalancesImportService(
      prisma as unknown as PrismaService,
    );
    const workbook = new ExcelJS.Workbook();
    const cashSheet = workbook.addWorksheet('1_Pul');
    cashSheet.addRow(['Nomi', 'Valyuta', 'Summa', 'Kurs', 'Izoh']);
    // A dollar balance typed without its currency must not become 500 UZS.
    cashSheet.addRow(['Dollar kassa', '', 500, 12600, '']);
    workbook.addWorksheet('2_Tovar').addRow(['Header only']);
    const receivables = workbook.addWorksheet('3_Mijozlar');
    receivables.addRow(['Mijoz', 'Shartnoma', 'Summa', 'Valyuta', 'Kurs']);
    receivables.addRow(['Mijoz', '', 500, '', 12600]);
    const file = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await service.validateAndParse(
      'tenant-1',
      file,
      'opening.xlsx',
    );

    expect(result.previewLines).toEqual([]);
    expect(result.errors).toEqual([
      expect.objectContaining({
        sheetName: '1_Pul',
        fieldName: 'Valyuta',
        invalidValue: '',
      }),
      expect.objectContaining({
        sheetName: '3_Mijozlar',
        fieldName: 'Valyuta',
        invalidValue: '',
      }),
    ]);
  });

  it('rejects an inventory row whose warehouse is blank or unknown instead of using the first warehouse', async () => {
    const prisma = {
      cashAccount: { findMany: jest.fn().mockResolvedValue([]) },
      product: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { id: 'prod-1', sku: 'SKU-1', name: { uz: 'Un', ru: 'Мука' } },
          ]),
      },
      warehouse: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'wh-main', name: { uz: 'Asosiy ombor', ru: 'Основной склад' } },
          { id: 'wh-2', name: { uz: 'Filial', ru: 'Филиал' } },
        ]),
      },
      counterparty: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new OpeningBalancesImportService(
      prisma as unknown as PrismaService,
    );
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('1_Pul').addRow(['Header only']);
    const stock = workbook.addWorksheet('2_Tovar');
    stock.addRow(['SKU', 'Nomi', 'Ombor', 'Miqdor', 'Tannarx', 'Partiya']);
    stock.addRow(['SKU-1', 'Un', 'Yo‘q ombor', 10, 5000, '']); // typo
    stock.addRow(['SKU-1', 'Un', '', 10, 5000, '']); // blank
    stock.addRow(['SKU-1', 'Un', 'филиал', 3, 5000, '']); // ru, any case
    const file = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await service.validateAndParse(
      'tenant-1',
      file,
      'opening.xlsx',
    );

    expect(result.errors).toEqual([
      expect.objectContaining({
        sheetName: '2_Tovar',
        rowNumber: 2,
        fieldName: 'Ombor',
        invalidValue: 'Yo‘q ombor',
      }),
      expect.objectContaining({
        sheetName: '2_Tovar',
        rowNumber: 3,
        fieldName: 'Ombor',
        invalidValue: '',
      }),
    ]);
    expect(result.previewLines).toEqual([
      expect.objectContaining({ warehouseId: 'wh-2', quantity: 3 }),
    ]);
    expect(prisma.warehouse.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1' },
    });
  });

  describe('fixed assets sheet', () => {
    const emptyPrisma = () =>
      ({
        cashAccount: { findMany: jest.fn().mockResolvedValue([]) },
        product: { findMany: jest.fn().mockResolvedValue([]) },
        warehouse: { findMany: jest.fn().mockResolvedValue([]) },
        counterparty: { findMany: jest.fn().mockResolvedValue([]) },
      }) as unknown as PrismaService;

    it('the template offers only the columns the import honours (no asset type or useful life)', async () => {
      const service = new OpeningBalancesImportService(emptyPrisma());
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(
        (await service.generateTemplate()) as unknown as ExcelJS.Buffer,
      );
      const headers = (
        workbook.getWorksheet('6_Asosiy_vositalar')!.getRow(1)
          .values as unknown[]
      ).filter(Boolean);
      expect(headers).toEqual([
        'Asosiy vosita nomi',
        'Inventar raqami',
        'Boshlang‘ich qiymati',
        'Jamg‘arilgan amortizatsiya',
        'Izoh',
      ]);
    });

    const parseAssets = async (header: string[], row: unknown[]) => {
      const service = new OpeningBalancesImportService(emptyPrisma());
      const workbook = new ExcelJS.Workbook();
      // Earlier sheets present but empty, as in a real template.
      for (const name of [
        '1_Pul',
        '2_Tovar',
        '3_Mijozlar',
        '4_Yetkazib_beruvchilar',
        '5_Avanslar',
      ]) {
        workbook.addWorksheet(name).addRow(['header']);
      }
      const sheet = workbook.addWorksheet('6_Asosiy_vositalar');
      sheet.addRow(header);
      sheet.addRow(row);
      return service.validateAndParse(
        'tenant-1',
        Buffer.from(await workbook.xlsx.writeBuffer()),
        'opening.xlsx',
      );
    };

    it('reads the current template by header', async () => {
      const result = await parseAssets(
        [
          'Asosiy vosita nomi',
          'Inventar raqami',
          'Boshlang‘ich qiymati',
          'Jamg‘arilgan amortizatsiya',
          'Izoh',
        ],
        ['Stanok', 'ST-1', 3000, 500, 'sex'],
      );
      expect(result.errors).toEqual([]);
      expect(result.previewLines).toEqual([
        expect.objectContaining({
          category: 'FIXED_ASSET',
          amount: 3000,
          accumulatedDepreciation: 500,
          netAmount: 2500,
          contractNumber: 'ST-1',
          notes: 'Stanok (Inv: ST-1) sex',
        }),
      ]);
    });

    it('still reads a template downloaded before the columns were removed', async () => {
      const result = await parseAssets(
        [
          'Asosiy vosita nomi',
          'Inventar raqami',
          'Aktiv turi',
          'Boshlang‘ich qiymati',
          'Jamg‘arilgan amortizatsiya',
          'Foydali xizmat muddati (oy)',
          'Izoh',
        ],
        ['Stanok', 'ST-1', 'EQUIPMENT', 3000, 500, 60, 'sex'],
      );
      expect(result.errors).toEqual([]);
      expect(result.previewLines).toEqual([
        expect.objectContaining({ amount: 3000, accumulatedDepreciation: 500 }),
      ]);
    });
  });
});
