import type { ImportValidationResult, OpeningBalanceCategory } from '@shared/types/opening-balances';

/** Routes of OpeningBalancesController used by the Excel import. */
export function openingBalanceImportPaths(documentId: string) {
  const id = encodeURIComponent(documentId);
  return {
    template: '/opening-balances/template',
    preview: `/opening-balances/${id}/import-preview`,
    commit: `/opening-balances/${id}/import-commit`,
  };
}

export interface ImportPreviewSummary {
  /** Only a file with no row errors and at least one line may be committed. */
  canCommit: boolean;
  lineCount: number;
  byCategory: Array<{ category: OpeningBalanceCategory; count: number }>;
}

export function summarizeImportPreview(result: ImportValidationResult): ImportPreviewSummary {
  const lines = result.previewLines ?? [];
  const counts = new Map<OpeningBalanceCategory, number>();
  for (const line of lines) {
    if (line.category) counts.set(line.category, (counts.get(line.category) ?? 0) + 1);
  }
  return {
    canCommit: result.errors.length === 0 && lines.length > 0,
    lineCount: lines.length,
    byCategory: [...counts].map(([category, count]) => ({ category, count })),
  };
}

export const IMPORT_CATEGORY_LABELS: Record<OpeningBalanceCategory, { uz: string; ru: string }> = {
  CASH: { uz: 'Kassa', ru: 'Касса' },
  BANK: { uz: 'Bank', ru: 'Банк' },
  INVENTORY: { uz: 'Tovarlar', ru: 'Товары' },
  CUSTOMER_DEBT: { uz: 'Mijozlar qarzi', ru: 'Долги клиентов' },
  SUPPLIER_DEBT: { uz: 'Yetkazib beruvchilarga qarz', ru: 'Долги поставщикам' },
  CUSTOMER_ADVANCE: { uz: 'Mijozlar avansi', ru: 'Авансы клиентов' },
  SUPPLIER_ADVANCE: { uz: 'Yetkazib beruvchilarga avans', ru: 'Авансы поставщикам' },
  FIXED_ASSET: { uz: 'Asosiy vositalar', ru: 'Основные средства' },
  OTHER_ASSET: { uz: 'Boshqa aktivlar', ru: 'Прочие активы' },
  OTHER_LIABILITY: { uz: 'Boshqa majburiyatlar', ru: 'Прочие обязательства' },
  EQUITY: { uz: 'Kapital', ru: 'Капитал' },
};
