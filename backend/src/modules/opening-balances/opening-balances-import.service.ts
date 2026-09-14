import { Injectable, BadRequestException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OpeningBalanceCategory } from '@prisma/client';
export interface ImportErrorItem {
  sheetName: string;
  rowNumber: number;
  fieldName?: string;
  invalidValue?: string;
  errorMessage: string;
}

export interface ImportValidationResult {
  fileName: string;
  totalRows: number;
  validRows: number;
  errorCount: number;
  errors: ImportErrorItem[];
  previewLines?: any[];
}

@Injectable()
export class OpeningBalancesImportService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Generate Standardized Excel Template ───────────────────────

  async generateTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Sklad ERP';
    workbook.created = new Date();

    const headerStyle: Partial<ExcelJS.Style> = {
      font: { bold: true, color: { argb: 'FFFFFFFF' } },
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E3A8A' }, // Deep slate blue
      },
      alignment: { vertical: 'middle', horizontal: 'center' },
    };

    // 1. Pul (Cash & Bank)
    const sheetPul = workbook.addWorksheet('1_Pul');
    sheetPul.columns = [
      { header: 'Kassa / Hisobraqam nomi', key: 'account', width: 30 },
      { header: 'Valyuta (UZS/USD)', key: 'currency', width: 18 },
      { header: 'Qoldiq summasi', key: 'amount', width: 22 },
      { header: 'Izoh', key: 'notes', width: 35 },
    ];
    sheetPul.getRow(1).eachCell((cell) => Object.assign(cell, headerStyle));
    sheetPul.addRow({
      account: 'Naqd kassa',
      currency: 'UZS',
      amount: 25000000,
      notes: 'Boshlang‘ich naqd so‘m qoldig‘i',
    });
    sheetPul.addRow({
      account: 'Dollar kassa',
      currency: 'USD',
      amount: 3500,
      notes: 'Boshlang‘ich naqd dollar qoldig‘i',
    });
    sheetPul.addRow({
      account: 'Asosiy hisobraqam',
      currency: 'UZS',
      amount: 100000000,
      notes: 'Bankdagi so‘m hisobvarag‘i',
    });

    // 2. Tovar (Inventory)
    const sheetTovar = workbook.addWorksheet('2_Tovar');
    sheetTovar.columns = [
      { header: 'SKU (Artikul)', key: 'sku', width: 20 },
      { header: 'Mahsulot nomi', key: 'productName', width: 32 },
      { header: 'Ombor nomi', key: 'warehouse', width: 25 },
      { header: 'Miqdor', key: 'quantity', width: 16 },
      { header: 'Birlik tannarxi', key: 'unitCost', width: 20 },
      { header: 'Partiya raqami', key: 'batchNumber', width: 22 },
      { header: 'Izoh', key: 'notes', width: 30 },
    ];
    sheetTovar.getRow(1).eachCell((cell) => Object.assign(cell, headerStyle));
    sheetTovar.addRow({
      sku: 'LED-36W-01',
      productName: 'LED Panel 36W',
      warehouse: 'Asosiy Ombor',
      quantity: 500,
      unitCost: 85000,
      batchNumber: 'INIT-BATCH-001',
      notes: 'Boshlang‘ich ombor qoldig‘i',
    });

    // 3. Mijozlar (Customer Debts)
    const sheetMijoz = workbook.addWorksheet('3_Mijozlar');
    sheetMijoz.columns = [
      { header: 'Mijoz nomi yoki INN/PINFL', key: 'customer', width: 32 },
      { header: 'Shartnoma raqami', key: 'contract', width: 22 },
      { header: 'Qarzdorlik summasi', key: 'amount', width: 24 },
      { header: 'Valyuta', key: 'currency', width: 16 },
      { header: 'Izoh', key: 'notes', width: 30 },
    ];
    sheetMijoz.getRow(1).eachCell((cell) => Object.assign(cell, headerStyle));
    sheetMijoz.addRow({
      customer: 'ABC MCHJ',
      contract: 'SH-2026-01',
      amount: 35000000,
      currency: 'UZS',
      notes: 'O‘tgan davrdan qolgan qarz',
    });

    // 4. Yetkazib beruvchilar (Supplier Debts)
    const sheetTaminot = workbook.addWorksheet('4_Yetkazib_beruvchilar');
    sheetTaminot.columns = [
      { header: 'Yetkazib beruvchi nomi yoki INN', key: 'supplier', width: 32 },
      { header: 'Shartnoma raqami', key: 'contract', width: 22 },
      { header: 'Qarzdorlik summasi', key: 'amount', width: 24 },
      { header: 'Valyuta', key: 'currency', width: 16 },
      { header: 'Izoh', key: 'notes', width: 30 },
    ];
    sheetTaminot.getRow(1).eachCell((cell) => Object.assign(cell, headerStyle));
    sheetTaminot.addRow({
      supplier: 'XYZ Trading',
      contract: 'T-2026-05',
      amount: 90000000,
      currency: 'UZS',
      notes: 'Yetkazib beruvchiga qarzimiz',
    });

    // 5. Avanslar (Advances)
    const sheetAvans = workbook.addWorksheet('5_Avanslar');
    sheetAvans.columns = [
      { header: 'Kontragent nomi yoki INN', key: 'counterparty', width: 32 },
      { header: 'Avans turi (MIJOZ_AVANSI / TAMINOTCHI_AVANSI)', key: 'type', width: 38 },
      { header: 'Avans summasi', key: 'amount', width: 22 },
      { header: 'Valyuta', key: 'currency', width: 16 },
      { header: 'Izoh', key: 'notes', width: 30 },
    ];
    sheetAvans.getRow(1).eachCell((cell) => Object.assign(cell, headerStyle));
    sheetAvans.addRow({
      counterparty: 'ABC MCHJ',
      type: 'MIJOZ_AVANSI',
      amount: 20000000,
      currency: 'UZS',
      notes: 'Mijozdan oldindan olingan avans',
    });

    // 6. Asosiy vositalar (Fixed Assets)
    const sheetAsosiy = workbook.addWorksheet('6_Asosiy_vositalar');
    sheetAsosiy.columns = [
      { header: 'Asosiy vosita nomi', key: 'name', width: 30 },
      { header: 'Inventar raqami', key: 'invNumber', width: 20 },
      { header: 'Aktiv turi', key: 'type', width: 20 },
      { header: 'Boshlang‘ich qiymati', key: 'initialCost', width: 24 },
      { header: 'Jamg‘arilgan amortizatsiya', key: 'depreciation', width: 26 },
      { header: 'Foydali xizmat muddati (oy)', key: 'usefulLife', width: 26 },
      { header: 'Izoh', key: 'notes', width: 30 },
    ];
    sheetAsosiy.getRow(1).eachCell((cell) => Object.assign(cell, headerStyle));
    sheetAsosiy.addRow({
      name: 'Frezerlash stanogi',
      invNumber: 'ST-0012',
      type: 'EQUIPMENT',
      initialCost: 300000000,
      depreciation: 50000000,
      usefulLife: 60,
      notes: 'Ishlab chiqarish sexi stanogi',
    });

    // 7. Boshqa qoldiqlar (Other Items & Equity)
    const sheetBoshqa = workbook.addWorksheet('7_Boshqa_qoldiqlar');
    sheetBoshqa.columns = [
      { header: 'Qoldiq turi (BOSHQACHA_AKTIV / BOSHQACHA_MAJBURIYAT / KAPITAL)', key: 'type', width: 44 },
      { header: 'Nomlanishi / Shaxs / Hisob', key: 'title', width: 32 },
      { header: 'Summa', key: 'amount', width: 22 },
      { header: 'Valyuta', key: 'currency', width: 16 },
      { header: 'Izoh', key: 'notes', width: 30 },
    ];
    sheetBoshqa.getRow(1).eachCell((cell) => Object.assign(cell, headerStyle));
    sheetBoshqa.addRow({
      type: 'KAPITAL',
      title: 'Ustav kapitali',
      amount: 500000000,
      currency: 'UZS',
      notes: 'Boshlang‘ich ta’sis kapitali',
    });

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // ─── Validate & Parse Uploaded Excel File ────────────────────────

  async validateAndParse(
    tenantId: string,
    fileBuffer: Buffer,
    fileName: string,
  ): Promise<ImportValidationResult> {
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(fileBuffer as any);
    } catch (e: any) {
      throw new BadRequestException('Faylni ochib bo‘lmadi. Iltimos, haqiqiy .xlsx fayl yuklang');
    }

    // 1. Preload Tenant Lookups
    const [accounts, products, warehouses, counterparties] = await Promise.all([
      this.prisma.cashAccount.findMany({ where: { tenantId } }),
      this.prisma.product.findMany({ where: { tenantId } }),
      this.prisma.warehouse.findMany({ where: { tenantId } }),
      this.prisma.counterparty.findMany({ where: { tenantId } }),
    ]);

    const errors: ImportErrorItem[] = [];
    const previewLines: any[] = [];
    let totalRows = 0;
    let validRows = 0;

    // ─── Sheet 1: Pul (Cash & Bank) ───
    const sheetPul = workbook.getWorksheet('1_Pul') || workbook.worksheets[0];
    if (sheetPul) {
      sheetPul.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header
        const accountName = String(row.getCell(1).value || '').trim();
        const currency = String(row.getCell(2).value || 'UZS').trim().toUpperCase();
        const rawAmount = row.getCell(3).value;
        const notes = String(row.getCell(4).value || '').trim();

        if (!accountName && !rawAmount) return; // Skip empty row
        totalRows++;

        const amount = Number(rawAmount);
        if (isNaN(amount) || amount <= 0) {
          errors.push({
            sheetName: '1_Pul',
            rowNumber,
            fieldName: 'Qoldiq summasi',
            invalidValue: String(rawAmount),
            errorMessage: 'Summa musbat son bo‘lishi shart',
          });
          return;
        }

        // Match account by name or currency
        const matchedAccount = accounts.find((a) => {
          const nameObj = typeof a.name === 'object' && a.name !== null ? a.name as any : {};
          return (
            nameObj.uz?.toLowerCase() === accountName.toLowerCase() ||
            nameObj.ru?.toLowerCase() === accountName.toLowerCase() ||
            a.currency === currency
          );
        }) || accounts[0];

        if (!matchedAccount) {
          errors.push({
            sheetName: '1_Pul',
            rowNumber,
            fieldName: 'Kassa/Hisobraqam',
            invalidValue: accountName,
            errorMessage: 'Tizimda mos kassa yoki hisobraqam topilmadi',
          });
          return;
        }

        validRows++;
        previewLines.push({
          category: matchedAccount.accountType === 'BANK' ? OpeningBalanceCategory.BANK : OpeningBalanceCategory.CASH,
          accountId: matchedAccount.id,
          amount,
          currency: matchedAccount.currency || currency,
          notes,
        });
      });
    }

    // ─── Sheet 2: Tovar (Inventory) ───
    const sheetTovar = workbook.getWorksheet('2_Tovar') || workbook.worksheets[1];
    if (sheetTovar) {
      sheetTovar.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const sku = String(row.getCell(1).value || '').trim();
        const productName = String(row.getCell(2).value || '').trim();
        const warehouseName = String(row.getCell(3).value || '').trim();
        const rawQty = row.getCell(4).value;
        const rawCost = row.getCell(5).value;
        const batchNumber = String(row.getCell(6).value || '').trim();
        const notes = String(row.getCell(7).value || '').trim();

        if (!sku && !rawQty) return;
        totalRows++;

        const qty = Number(rawQty);
        const cost = Number(rawCost);

        if (isNaN(qty) || qty <= 0) {
          errors.push({
            sheetName: '2_Tovar',
            rowNumber,
            fieldName: 'Miqdor',
            invalidValue: String(rawQty),
            errorMessage: 'Miqdor musbat son bo‘lishi kerak',
          });
          return;
        }
        if (isNaN(cost) || cost < 0) {
          errors.push({
            sheetName: '2_Tovar',
            rowNumber,
            fieldName: 'Birlik tannarxi',
            invalidValue: String(rawCost),
            errorMessage: 'Tannarx manfiy bo‘lishi mumkin emas',
          });
          return;
        }

        // Match product by SKU or name
        const product = products.find(
          (p) =>
            p.sku.toLowerCase() === sku.toLowerCase() ||
            (p.name && (p.name as any).uz?.toLowerCase() === productName.toLowerCase()),
        );
        if (!product) {
          errors.push({
            sheetName: '2_Tovar',
            rowNumber,
            fieldName: 'SKU / Mahsulot',
            invalidValue: sku || productName,
            errorMessage: `Mahsulot tizimda topilmadi: '${sku || productName}'`,
          });
          return;
        }

        // Match warehouse
        const warehouse = warehouses.find((w) => {
          const nameObj = typeof w.name === 'object' && w.name !== null ? (w.name as any) : {};
          return (
            nameObj.uz?.toLowerCase() === warehouseName.toLowerCase() ||
            nameObj.ru?.toLowerCase() === warehouseName.toLowerCase()
          );
        }) || warehouses[0];

        if (!warehouse) {
          errors.push({
            sheetName: '2_Tovar',
            rowNumber,
            fieldName: 'Ombor',
            invalidValue: warehouseName,
            errorMessage: `Ombor topilmadi: '${warehouseName}'`,
          });
          return;
        }

        validRows++;
        previewLines.push({
          category: OpeningBalanceCategory.INVENTORY,
          productId: product.id,
          warehouseId: warehouse.id,
          quantity: qty,
          unitCost: cost,
          amount: Math.round(qty * cost * 100) / 100,
          batchNumber: batchNumber || null,
          notes,
        });
      });
    }

    // ─── Sheet 3: Mijozlar (Customer Debts) ───
    const sheetMijoz = workbook.getWorksheet('3_Mijozlar') || workbook.worksheets[2];
    if (sheetMijoz) {
      sheetMijoz.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const customerIdent = String(row.getCell(1).value || '').trim();
        const contract = String(row.getCell(2).value || '').trim();
        const rawAmount = row.getCell(3).value;
        const currency = String(row.getCell(4).value || 'UZS').trim();
        const notes = String(row.getCell(5).value || '').trim();

        if (!customerIdent && !rawAmount) return;
        totalRows++;

        const amount = Number(rawAmount);
        if (isNaN(amount) || amount <= 0) {
          errors.push({
            sheetName: '3_Mijozlar',
            rowNumber,
            fieldName: 'Qarzdorlik summasi',
            invalidValue: String(rawAmount),
            errorMessage: 'Summa musbat son bo‘lishi kerak',
          });
          return;
        }

        const cp = counterparties.find(
          (c) =>
            c.name.toLowerCase() === customerIdent.toLowerCase() ||
            (c.inn && c.inn === customerIdent),
        );
        if (!cp) {
          errors.push({
            sheetName: '3_Mijozlar',
            rowNumber,
            fieldName: 'Mijoz',
            invalidValue: customerIdent,
            errorMessage: `Mijoz tizimda topilmadi: '${customerIdent}'`,
          });
          return;
        }

        validRows++;
        previewLines.push({
          category: OpeningBalanceCategory.CUSTOMER_DEBT,
          counterpartyId: cp.id,
          contractNumber: contract || null,
          amount,
          currency,
          notes,
        });
      });
    }

    // ─── Sheet 4: Yetkazib beruvchilar (Supplier Debts) ───
    const sheetTaminot = workbook.getWorksheet('4_Yetkazib_beruvchilar') || workbook.worksheets[3];
    if (sheetTaminot) {
      sheetTaminot.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const suppIdent = String(row.getCell(1).value || '').trim();
        const contract = String(row.getCell(2).value || '').trim();
        const rawAmount = row.getCell(3).value;
        const currency = String(row.getCell(4).value || 'UZS').trim();
        const notes = String(row.getCell(5).value || '').trim();

        if (!suppIdent && !rawAmount) return;
        totalRows++;

        const amount = Number(rawAmount);
        if (isNaN(amount) || amount <= 0) {
          errors.push({
            sheetName: '4_Yetkazib_beruvchilar',
            rowNumber,
            fieldName: 'Qarzdorlik summasi',
            invalidValue: String(rawAmount),
            errorMessage: 'Summa musbat bo‘lishi kerak',
          });
          return;
        }

        const cp = counterparties.find(
          (c) =>
            c.name.toLowerCase() === suppIdent.toLowerCase() ||
            (c.inn && c.inn === suppIdent),
        );
        if (!cp) {
          errors.push({
            sheetName: '4_Yetkazib_beruvchilar',
            rowNumber,
            fieldName: 'Yetkazib beruvchi',
            invalidValue: suppIdent,
            errorMessage: `Yetkazib beruvchi topilmadi: '${suppIdent}'`,
          });
          return;
        }

        validRows++;
        previewLines.push({
          category: OpeningBalanceCategory.SUPPLIER_DEBT,
          counterpartyId: cp.id,
          contractNumber: contract || null,
          amount,
          currency,
          notes,
        });
      });
    }

    // ─── Sheet 5: Avanslar (Advances) ───
    const sheetAvans = workbook.getWorksheet('5_Avanslar') || workbook.worksheets[4];
    if (sheetAvans) {
      sheetAvans.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const cpIdent = String(row.getCell(1).value || '').trim();
        const typeStr = String(row.getCell(2).value || 'MIJOZ_AVANSI').trim().toUpperCase();
        const rawAmount = row.getCell(3).value;
        const currency = String(row.getCell(4).value || 'UZS').trim();
        const notes = String(row.getCell(5).value || '').trim();

        if (!cpIdent && !rawAmount) return;
        totalRows++;

        const amount = Number(rawAmount);
        if (isNaN(amount) || amount <= 0) {
          errors.push({
            sheetName: '5_Avanslar',
            rowNumber,
            fieldName: 'Avans summasi',
            invalidValue: String(rawAmount),
            errorMessage: 'Summa musbat bo‘lishi kerak',
          });
          return;
        }

        const cp = counterparties.find(
          (c) =>
            c.name.toLowerCase() === cpIdent.toLowerCase() ||
            (c.inn && c.inn === cpIdent),
        );
        if (!cp) {
          errors.push({
            sheetName: '5_Avanslar',
            rowNumber,
            fieldName: 'Kontragent',
            invalidValue: cpIdent,
            errorMessage: `Kontragent topilmadi: '${cpIdent}'`,
          });
          return;
        }

        validRows++;
        previewLines.push({
          category:
            typeStr.includes('TAMINOTCHI') || typeStr.includes('SUPPLIER')
              ? OpeningBalanceCategory.SUPPLIER_ADVANCE
              : OpeningBalanceCategory.CUSTOMER_ADVANCE,
          counterpartyId: cp.id,
          amount,
          currency,
          notes,
        });
      });
    }

    // ─── Sheet 6: Asosiy vositalar (Fixed Assets) ───
    const sheetAsosiy = workbook.getWorksheet('6_Asosiy_vositalar') || workbook.worksheets[5];
    if (sheetAsosiy) {
      sheetAsosiy.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const name = String(row.getCell(1).value || '').trim();
        const invNumber = String(row.getCell(2).value || '').trim();
        const assetType = String(row.getCell(3).value || 'EQUIPMENT').trim();
        const rawCost = row.getCell(4).value;
        const rawDep = row.getCell(5).value || 0;
        const usefulLife = Number(row.getCell(6).value || 60);
        const notes = String(row.getCell(7).value || '').trim();

        if (!name && !rawCost) return;
        totalRows++;

        const cost = Number(rawCost);
        const dep = Number(rawDep);

        if (isNaN(cost) || cost <= 0) {
          errors.push({
            sheetName: '6_Asosiy_vositalar',
            rowNumber,
            fieldName: 'Boshlang‘ich qiymat',
            invalidValue: String(rawCost),
            errorMessage: 'Qiymat musbat son bo‘lishi kerak',
          });
          return;
        }
        if (isNaN(dep) || dep < 0 || dep > cost) {
          errors.push({
            sheetName: '6_Asosiy_vositalar',
            rowNumber,
            fieldName: 'Amortizatsiya',
            invalidValue: String(rawDep),
            errorMessage: 'Amortizatsiya 0 dan katta va boshlang‘ich qiymatdan oshmasligi kerak',
          });
          return;
        }

        validRows++;
        previewLines.push({
          category: OpeningBalanceCategory.FIXED_ASSET,
          amount: cost,
          accumulatedDepreciation: dep,
          netAmount: Math.max(0, cost - dep),
          contractNumber: invNumber || null,
          notes: name ? `${name} (Inv: ${invNumber}) ${notes}`.trim() : notes,
        });
      });
    }

    // ─── Sheet 7: Boshqa qoldiqlar (Other Items & Equity) ───
    const sheetBoshqa = workbook.getWorksheet('7_Boshqa_qoldiqlar') || workbook.worksheets[6];
    if (sheetBoshqa) {
      sheetBoshqa.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const typeStr = String(row.getCell(1).value || 'KAPITAL').trim().toUpperCase();
        const title = String(row.getCell(2).value || '').trim();
        const rawAmount = row.getCell(3).value;
        const currency = String(row.getCell(4).value || 'UZS').trim();
        const notes = String(row.getCell(5).value || '').trim();

        if (!rawAmount) return;
        totalRows++;

        const amount = Number(rawAmount);
        if (isNaN(amount) || amount <= 0) {
          errors.push({
            sheetName: '7_Boshqa_qoldiqlar',
            rowNumber,
            fieldName: 'Summa',
            invalidValue: String(rawAmount),
            errorMessage: 'Summa musbat bo‘lishi kerak',
          });
          return;
        }

        let category: OpeningBalanceCategory = OpeningBalanceCategory.EQUITY;
        if (typeStr.includes('AKTIV') || typeStr.includes('ASSET')) {
          category = OpeningBalanceCategory.OTHER_ASSET;
        } else if (typeStr.includes('MAJBURIYAT') || typeStr.includes('LIABILITY')) {
          category = OpeningBalanceCategory.OTHER_LIABILITY;
        }

        validRows++;
        previewLines.push({
          category,
          amount,
          currency,
          notes: title ? `${title}: ${notes}`.trim() : notes,
        });
      });
    }

    return {
      fileName,
      totalRows,
      validRows,
      errorCount: errors.length,
      errors,
      previewLines,
    };
  }
}
