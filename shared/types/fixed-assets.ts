export type FixedAssetStatus = 'ACTIVE' | 'IN_REPAIR' | 'DISPOSED' | 'WRITTEN_OFF';

export interface FixedAsset {
  id: string;
  tenantId: string;
  name: string;
  inventoryNumber: string;
  assetType: string;
  acquisitionDate: string;
  initialCost: number;
  accumulatedDepreciation: number;
  netBookValue: number;
  usefulLifeMonths: number;
  depreciationMethod: string;
  custodianUserId?: string | null;
  status: FixedAssetStatus;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  custodian?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}
