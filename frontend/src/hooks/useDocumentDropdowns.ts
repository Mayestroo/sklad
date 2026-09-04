'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api';
import { getApiCache, setApiCache } from '@/lib/cache';

export interface CounterpartyDropdownItem {
  id: string;
  name: string;
  phone?: string;
  debtBalance?: number;
  type?: string;
  priceListId?: string | null;
  discountPercent?: number;
}

export interface ProductDropdownItem {
  id: string;
  name: string | Record<string, string>;
  sku: string;
  barcode?: string;
  salePrice: number;
  costPrice: number;
  unitOfMeasure?: string;
  currency?: string;
  stockQty?: number;
}

export interface UserDropdownItem {
  id: string;
  firstName: string;
  lastName: string;
}

export interface WarehouseDropdownItem {
  id: string;
  name: string | Record<string, string>;
}

export interface PriceListDropdownItem {
  id: string;
  name: string | Record<string, string>;
  currency?: string;
  isDefault?: boolean;
}

interface UseDocumentDropdownsParams {
  token?: string | null;
  tenantId?: string | null;
  locale?: string;
}

const CACHE_TTL_MS = 60 * 1000; // 1 minute fresh cache

export function useDocumentDropdowns({ token, tenantId, locale = 'uz' }: UseDocumentDropdownsParams) {
  const [counterparties, setCounterparties] = useState<CounterpartyDropdownItem[]>([]);
  const [products, setProducts] = useState<ProductDropdownItem[]>([]);
  const [sellers, setSellers] = useState<UserDropdownItem[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseDropdownItem[]>([]);
  const [priceLists, setPriceLists] = useState<PriceListDropdownItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDropdowns = useCallback(async (forceRefresh = false) => {
    if (!token || !tenantId) return;

    setIsLoading(true);
    setError(null);

    const now = Date.now();
    const cacheKey = `dropdowns_${tenantId}_${locale}`;
    const cached = getApiCache<{
      counterparties: CounterpartyDropdownItem[];
      products: ProductDropdownItem[];
      sellers: UserDropdownItem[];
      warehouses: WarehouseDropdownItem[];
      priceLists: PriceListDropdownItem[];
    }>(cacheKey);

    if (!forceRefresh && cached && now - cached.timestamp < CACHE_TTL_MS) {
      setCounterparties(cached.data.counterparties);
      setProducts(cached.data.products);
      setSellers(cached.data.sellers);
      setWarehouses(cached.data.warehouses);
      setPriceLists(cached.data.priceLists);
      setIsLoading(false);
      return;
    }

    try {
      const [cpRes, prdRes, usrRes, whRes, plRes] = await Promise.all([
        apiFetch<any>('/sales/counterparties', { token, tenantId, locale }).catch((err) => {
          console.error('Failed to load counterparties:', err);
          return null;
        }),
        apiFetch<any>('/inventory/products', { token, tenantId, locale }).catch((err) => {
          console.error('Failed to load products:', err);
          return null;
        }),
        apiFetch<any>('/users', { token, tenantId, locale }).catch(() => null),
        apiFetch<any>('/tenants/warehouses', { token, tenantId, locale }).catch((err) => {
          console.error('Failed to load warehouses:', err);
          return null;
        }),
        apiFetch<any>('/sales/price-lists', { token, tenantId, locale }).catch((err) => {
          console.error('Failed to load price lists:', err);
          return null;
        }),
      ]);

      const cpList: CounterpartyDropdownItem[] = cpRes?.data || (Array.isArray(cpRes) ? cpRes : []);
      const prdList: ProductDropdownItem[] = prdRes?.data || (Array.isArray(prdRes) ? prdRes : []);
      const usrList: UserDropdownItem[] = usrRes?.data || (Array.isArray(usrRes) ? usrRes : []);
      const whList: WarehouseDropdownItem[] = whRes?.data || (Array.isArray(whRes) ? whRes : []);
      const plList: PriceListDropdownItem[] = plRes?.data || (Array.isArray(plRes) ? plRes : []);

      setCounterparties(cpList);
      setProducts(prdList);
      setSellers(usrList);
      setWarehouses(whList);
      setPriceLists(plList);

      setApiCache(cacheKey, {
        counterparties: cpList,
        products: prdList,
        sellers: usrList,
        warehouses: whList,
        priceLists: plList,
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to load options');
    } finally {
      setIsLoading(false);
    }
  }, [token, tenantId, locale]);

  useEffect(() => {
    fetchDropdowns();
  }, [fetchDropdowns]);

  return {
    counterparties,
    products,
    sellers,
    warehouses,
    priceLists,
    isLoading,
    error,
    refresh: () => fetchDropdowns(true),
  };
}
