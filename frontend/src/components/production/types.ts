import type { MaterialCard } from '@/lib/production-recipe';
import type { RecipeProduct } from './RecipeFormModal';

export type Locale = 'uz' | 'ru';
export type ProductionStatus = 'DRAFT' | 'PLANNED' | 'IN_PROGRESS' | 'READY' | 'COMPLETED' | 'CANCELLED';
export type CostType = 'SALARY' | 'ENERGY' | 'DEPRECIATION' | 'OTHER';

export interface Named {
  id: string;
  name: unknown;
}
export interface StaffOption {
  id: string;
  firstName: string;
  lastName: string;
}

export interface RecipeItem {
  id?: string;
  productId: string;
  quantity: number | string;
  unit?: string | null;
  unitFactor?: number | string;
  lossPercent?: number | string;
  product?: MaterialCard;
}

export interface Recipe {
  id: string;
  productId: string;
  outputQuantity: number | string;
  note?: string | null;
  isActive: boolean;
  isArchived: boolean;
  updatedAt: string;
  usedInDocuments?: number;
  product: RecipeProduct;
  items: RecipeItem[];
  estimate: {
    normTotal: number;
    perUnit: number | null;
    missingPrice: boolean;
    lines: Array<{ entryUnitCost: number; total: number | null }>;
  };
}

export interface ExtraCost {
  id?: string;
  costType: CostType;
  amount: number | string;
  comment?: string | null;
}

export interface ProductionMaterial {
  id: string;
  productId: string;
  plannedQuantity: number | string;
  actualQuantity: number | string | null;
  unitCost: number | string;
  totalCost: number | string;
  unitOfMeasure?: string | null;
  lossPercent?: number | string;
  product: RecipeProduct;
  batchConsumptions?: Array<{ quantity: number | string }>;
}

export interface ProductionDocument {
  id: string;
  docNumber: string;
  docDate: string;
  status: ProductionStatus;
  recipeId: string;
  plannedQuantity: number | string;
  producedQuantity: number | string | null;
  plannedMaterialCost: number | string;
  actualMaterialCost: number | string;
  extraCost: number | string;
  totalCost: number | string;
  unitCost: number | string;
  displayCost: number;
  productUnit?: string | null;
  plannedStartDate?: string | null;
  plannedEndDate?: string | null;
  cancelReason?: string | null;
  product: RecipeProduct;
  warehouse: Named;
  warehouseId: string;
  outputWarehouseId?: string | null;
  outputWarehouse?: Named | null;
  responsibleId?: string | null;
  responsible?: StaffOption | null;
  materials?: ProductionMaterial[];
  extraCosts?: ExtraCost[];
  outputBatch?: { id: string; landedCost: number | string } | null;
  note?: string | null;
}

export interface DocumentsResponse {
  items: ProductionDocument[];
  total: number;
  page: number;
  pageSize: number;
  stats: { draft: number; inProgress: number; completed: number; cancelled: number; completedCost: number };
}

/** TZ 5.2: Qoralama · Jarayonda · Yakunlangan · Bekor qilingan (PLANNED/READY are older documents). Texts: messages production.status*. */
export const STATUS_VARIANTS: Record<ProductionStatus, 'neutral' | 'info' | 'warning' | 'success' | 'error'> = {
  DRAFT: 'neutral',
  PLANNED: 'neutral',
  IN_PROGRESS: 'warning',
  READY: 'warning',
  COMPLETED: 'success',
  CANCELLED: 'error',
};

/** Filter values: one choice per TZ status (old statuses are included). */
export const STATUS_FILTERS: Array<{ value: string; key: string }> = [
  { value: 'DRAFT,PLANNED', key: 'filterDraft' },
  { value: 'IN_PROGRESS,READY', key: 'filterRunning' },
  { value: 'COMPLETED', key: 'filterCompleted' },
  { value: 'CANCELLED', key: 'filterCancelled' },
];

export const COST_TYPES: CostType[] = ['SALARY', 'ENERGY', 'DEPRECIATION', 'OTHER'];

export const isOpenStatus = (status: ProductionStatus) => status === 'DRAFT' || status === 'PLANNED';
export const isRunningStatus = (status: ProductionStatus) => status === 'IN_PROGRESS' || status === 'READY';

export function localName(value: unknown, locale: Locale): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const localized = value as Record<string, unknown>;
  return String(localized[locale] ?? localized.uz ?? localized.ru ?? '');
}

export const personName = (person?: StaffOption | null) => (person ? `${person.firstName} ${person.lastName}`.trim() : '');
