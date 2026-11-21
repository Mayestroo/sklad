'use client';

import { isSellable, productTypeLabel, semiFinishedLabel } from '@/lib/product-types';
import { QuantityInput } from '@/components/ui/QuantityInput';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { useState, useEffect, useMemo, useRef } from 'react';
import { readRemembered, remember, usePersistentState } from '@/lib/usePersistentState';
import { useDocumentShortcuts } from '@/lib/useDocumentShortcuts';
import { DocChecklist, linesKeyDown } from '@/components/ui/DocChecklist';
import { ActionsMenu } from '@/components/production/ActionsMenu';
import { useTranslations } from 'next-intl';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch, listOf, type ListResponse } from '@/lib/api';
import { useRouter } from '@/i18n/navigation';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { DatePicker } from '@/components/ui/DatePicker';
import { Select, SelectOption } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, formatPercent, CURRENCY_OPTIONS, errorMessage } from '@/lib/utils';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  RotateCcw,
  Printer,
  CreditCard,
  Barcode,
  Search,
  AlertCircle,
  AlertTriangle,
  Pencil,
  TrendingUp,
} from 'lucide-react';
import { SalesInvoice } from '@shared/types';
import { PaySalesInvoiceModal } from './PaySalesInvoiceModal';
import { CreateSalesReturnModal } from './CreateSalesReturnModal';
import { CreateCounterpartyDrawer } from '@/components/counterparties/CreateCounterpartyDrawer';
import { CreateWarehouseDrawer } from '@/components/warehouses/CreateWarehouseDrawer';
import { CreateProductDrawer } from '@/components/products/CreateProductDrawer';
import { useConfirm } from '@/context/ConfirmContext';
import { toast } from '@/context/ToastContext';
import { useSalesDefaultCurrency } from '@/hooks/useSalesDefaultCurrency';
import { initialDocumentCurrency } from '@/lib/sales-currency';
import { convertSalePriceToDocumentCurrency } from '@/lib/sales-pricing';
import { convertCostPriceToDocumentCurrency } from '@/lib/inventory-cost';
import { unitLabel } from '@/lib/units';
import { stockLabel } from '@/lib/stock-label';
import { localIsoDate } from '@/lib/date-range';

interface CounterpartyOption {
  id: string;
  name: string;
  type?: string;
  balancesByCurrency?: Array<{ currency: string; customerDebt: number; supplierDebt: number; netBalance: number }>;
  phone?: string;
  inn?: string;
  discountPercent?: number;
}

interface WarehouseOption {
  id: string;
  name: string | Record<string, string>;
}

interface ProductOption {
  id: string;
  name: string | Record<string, string>;
  sku: string;
  barcode?: string;
  salePrice: number;
  salePriceCurrency?: 'USD' | 'UZS' | null;
  costPrice: number;
  costPriceCurrency: 'USD' | 'UZS' | null;
  costPriceExchangeRate: number;
  vatRate?: number;
  unitOfMeasure?: string;
  stockQty?: number;
  currency?: string;
  type?: string | null;
  isSemiFinished?: boolean | null;
}

/** A product row as GET /inventory/products returns it. */
interface ProductApiRow {
  id: string;
  name: string | Record<string, string>;
  sku: string;
  barcode?: string;
  salePrice?: number | string | null;
  salePriceCurrency?: 'USD' | 'UZS' | null;
  costPrice?: number | string | null;
  costPriceCurrency?: 'USD' | 'UZS' | null;
  costPriceExchangeRate?: number | string | null;
  vatRate?: number | string | null;
  unitOfMeasure?: string | null;
  totalStock?: number | null;
  stockQuantity?: number | null;
  quantity?: number | null;
  stockLevels?: StockLevelRow[];
  type?: string | null;
  isSemiFinished?: boolean | null;
}

/** A stock level row (per product and warehouse). */
interface StockLevelRow {
  productId: string;
  quantity?: number | string | null;
  reservedQuantity?: number | string | null;
}

interface ItemRow {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  vatRate: number | string;
}

interface SalesInvoiceFormProps {
  initialData?: SalesInvoice | null;
  mode: 'create' | 'edit';
}

export function SalesInvoiceForm({ initialData, mode }: SalesInvoiceFormProps) {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company, hasPermission } = useAuth();
  // New documents start in the tenant sales default, or blank (never a guessed USD).
  const salesDefault = useSalesDefaultCurrency();
  const defaultCurrency = initialDocumentCurrency(undefined, salesDefault);
  const router = useRouter();
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const isEditRequested = searchParams?.get('edit') === 'true';
  const tf = useTranslations('rd.docForm');
  const [showDiscVatPref, setShowDiscVatPref] = usePersistentState<boolean>('docForm.showDiscVat', false);

  const isPriceOverrideAllowed =
    hasPermission('sales:override_price') ||
    company?.settings?.sales?.allowSellerPriceOverride !== false;

  // Dropdowns state
  const [counterparties, setCounterparties] = useState<CounterpartyOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  // Document Form State
  const [invoiceId, setInvoiceId] = useState<string | null>(initialData?.id || null);
  const [docNumber, setDocNumber] = useState<string>(initialData?.invoiceNumber || (initialData as { docNumber?: string } | null | undefined)?.docNumber || '');
  const [docStatus, setDocStatus] = useState<string>(initialData?.status || 'DRAFT');
  const [paymentStatus, setPaymentStatus] = useState<string>(initialData?.paymentStatus || 'UNPAID');

  const [counterpartyId, setCounterpartyId] = useState(initialData?.counterpartyId || '');
  const [warehouseId, setWarehouseId] = useState(initialData?.warehouseId || '');
  const [docDate, setDocDate] = useState(
    initialData?.invoiceDate ? initialData.invoiceDate.slice(0, 10) : (initialData?.createdAt ? initialData.createdAt.slice(0, 10) : localIsoDate(new Date()))
  );
  const [currency, setCurrency] = useState(initialDocumentCurrency(initialData?.currency, salesDefault));
  const [exchangeRate, setExchangeRate] = useState<number | string>(
    initialData?.exchangeRate !== undefined
      ? Number(initialData.exchangeRate)
      : initialDocumentCurrency(initialData?.currency, salesDefault) === 'UZS' ? 1 : '',
  );
  const [additionalChargeAmount, setAdditionalChargeAmount] = useState<number | string>(Number(initialData?.additionalChargeAmount || 0));
  const [additionalChargeVatRate, setAdditionalChargeVatRate] = useState<number | string>(Number(initialData?.additionalChargeVatRate ?? 12));
  const [contractNumber, setContractNumber] = useState(initialData?.contractNumber || '');
  const [contractDate, setContractDate] = useState(
    initialData?.contractDate ? initialData.contractDate.slice(0, 10) : ''
  );
  const [paymentTerms, setPaymentTerms] = useState(initialData?.paymentTerms || '');
  const [comment, setComment] = useState(initialData?.comment || '');

  // Line items
  const [items, setItems] = useState<ItemRow[]>(
    initialData?.items && initialData.items.length > 0
      ? initialData.items.map((i) => ({
          productId: i.productId,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          discount: Number(i.discount) || 0,
          vatRate: Number(i.vatRate) || 0,
        }))
      : [{ productId: '', quantity: 1, unitPrice: 0, discount: 0, vatRate: 0 }]
  );

  // Barcode / Search input
  const [barcodeSearch, setBarcodeSearch] = useState('');

  // Execution states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (mode === 'create' && !isDirty) {
      setCurrency(defaultCurrency);
      setExchangeRate(defaultCurrency === 'UZS' ? 1 : '');
    }
  }, [defaultCurrency, mode, isDirty]);

  // Quick Add Drawers
  const [isQuickCustomerOpen, setIsQuickCustomerOpen] = useState(false);
  const [isQuickWarehouseOpen, setIsQuickWarehouseOpen] = useState(false);
  // Row whose product is being created from the product dropdown (muammolar B9).
  const [quickProductRow, setQuickProductRow] = useState<number | null>(null);

  // Modals state
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [currentInvoiceData, setCurrentInvoiceData] = useState<SalesInvoice | null>(initialData || null);
  const [warehouseStockMap, setWarehouseStockMap] = useState<Record<string, { physical: number; reserved: number; free: number }>>({});

  const isReadOnly = docStatus === 'POSTED' || docStatus === 'CANCELLED';
  /** Set on the first save/post attempt: missing required fields are then marked next to the field. */
  const [attempted, setAttempted] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  // Bring a new error into view: the save buttons are in the sticky header, the message may be off-screen.
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [error]);

  const markDirty = () => {
    if (!isDirty) setIsDirty(true);
  };

  // Helper name resolver
  const getLocalizedName = (name: string | Record<string, string> | null | undefined) => {
    if (!name) return '—';
    if (typeof name === 'string') return name;
    return name[locale] || name.ru || name.uz || Object.values(name)[0] || '—';
  };

  // Fetch dropdowns
  const fetchDropdowns = async () => {
    if (!token || !company) return;

    try {
      const [cpRes, whRes, prdRes] = await Promise.all([
        apiFetch<ListResponse<CounterpartyOption>>('/sales/counterparties', { token: token || undefined, tenantId: company.id, locale }).catch((err) => {
          console.error('Failed to load counterparties:', err);
          return null;
        }),
        apiFetch<ListResponse<WarehouseOption>>('/tenants/warehouses', { token: token || undefined, tenantId: company.id, locale }).catch((err) => {
          console.error('Failed to load warehouses:', err);
          return null;
        }),
        apiFetch<ListResponse<ProductApiRow>>('/inventory/products', { token: token || undefined, tenantId: company.id, locale }).catch((err) => {
          console.error('Failed to load products:', err);
          return null;
        }),
      ]);

      const cpList = listOf(cpRes);
      setCounterparties(cpList);
      // The customer is always chosen by the user: a silent default puts the debt on the wrong client.

      const whList = listOf(whRes);
      setWarehouses(whList);
      if (!warehouseId && whList.length > 0 && mode === 'create') {
        // Last warehouse used for a sale on this browser, else the first one.
        const last = readRemembered<string>('sales.warehouseId', '');
        setWarehouseId(whList.some((w) => w.id === last) ? last : whList[0].id);
      }

      // TZ "Ishlab chiqarish" 4.6: a semi-finished product is sold only with a sale price.
      const rawProducts = listOf(prdRes).filter(isSellable);
      const prdList: ProductOption[] = rawProducts.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        salePrice: Number(p.salePrice) || 0,
          salePriceCurrency: p.salePriceCurrency || null,
          costPrice: Number(p.costPrice) || 0,
          costPriceCurrency: p.costPriceCurrency ?? null,
          costPriceExchangeRate: Number(p.costPriceExchangeRate),
          vatRate: Number(p.vatRate ?? 0),
          unitOfMeasure: p.unitOfMeasure || 'dona',
        stockQty: Number(p.totalStock ?? p.stockQuantity ?? p.quantity ?? 0),
        type: p.type ?? null,
        isSemiFinished: p.isSemiFinished ?? null,
      }));
      setProducts(prdList);

      // Pre-populate stock map if stockLevels exist on product objects
      const initialStockMap: Record<string, { physical: number; reserved: number; free: number }> = {};
      rawProducts.forEach((p) => {
        if (p.stockLevels && Array.isArray(p.stockLevels)) {
          const physical = p.stockLevels.reduce((acc: number, sl) => acc + Number(sl.quantity || 0), 0);
          const reserved = p.stockLevels.reduce((acc: number, sl) => acc + Number(sl.reservedQuantity || 0), 0);
          initialStockMap[p.id] = {
            physical,
            reserved,
            free: Math.max(0, physical - reserved),
          };
        }
      });
      if (Object.keys(initialStockMap).length > 0) {
        setWarehouseStockMap(initialStockMap);
      }
    } catch (err) {
      console.error('fetchDropdowns error:', err);
    }
  };

  useEffect(() => {
    fetchDropdowns();
  }, [token, company, locale]);

  // Fetch live free stock when warehouseId changes
  useEffect(() => {
    if (!token || !company || !warehouseId) return;

    apiFetch<ListResponse<StockLevelRow>>(`/inventory/products/stock-levels?warehouseId=${warehouseId}`, {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => {
        const list = listOf(res);
        const map: Record<string, { physical: number; reserved: number; free: number }> = {};
        list.forEach((sl) => {
          const physical = Number(sl.quantity || 0);
          const reserved = Number(sl.reservedQuantity || 0);
          map[sl.productId] = {
            physical,
            reserved,
            free: Math.max(0, physical - reserved),
          };
        });
        setWarehouseStockMap(map);
      })
      .catch((err) => console.error('Failed to load warehouse stock levels:', err));
  }, [token, company, warehouseId, locale]);

  // Quick addition handlers
  const handleCustomerAdded = (newCustomer: { id: string; name: string; type: string; balancesByCurrency?: CounterpartyOption['balancesByCurrency'] }) => {
    markDirty();
    setCounterparties((prev) => [newCustomer, ...prev]);
    setCounterpartyId(newCustomer.id);
  };

  const handleWarehouseAdded = (newWarehouse: { id: string; name: string | Record<string, string> }) => {
    markDirty();
    setWarehouses((prev) => [newWarehouse, ...prev]);
    setWarehouseId(newWarehouse.id);
  };

  /** A product created from a row's dropdown is loaded and put on that row. */
  const handleProductAdded = async (newProduct: { id: string }) => {
    const row = quickProductRow;
    setQuickProductRow(null);
    await fetchDropdowns();
    if (row === null) return;
    markDirty();
    setItems((prev) => prev.map((item, i) => (i === row ? { ...item, productId: newProduct.id } : item)));
  };

  // Calculations
  const calculations = useMemo(() => {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalVat = 0;
    let totalCost = 0;
    let belowCostCount = 0;
    let insufficientStockCount = 0;

    items.forEach((item) => {
      if (!item.productId) return;
      const prd = products.find((p) => p.id === item.productId);
      // Card cost in UZS in the card's own currency/rate; unknown → no estimate.
      const cost = prd ? productCostUzs(prd) : null;
      const lineRaw = item.quantity * item.unitPrice;
      const discountVal = (lineRaw * item.discount) / 100;
      const afterDiscount = lineRaw - discountVal;
      const vatVal = (afterDiscount * Number(item.vatRate || 0)) / 100;

      subtotal += lineRaw;
      totalDiscount += discountVal;
      totalVat += vatVal;
      if (cost !== null) totalCost += item.quantity * cost;

      const itemNetUnitPriceUzs = item.unitPrice * (1 - item.discount / 100) * (currency === 'USD' ? Number(exchangeRate) : 1);
      if (cost !== null && item.unitPrice > 0 && itemNetUnitPriceUzs < cost) {
        belowCostCount++;
      }

      const stockInfo = warehouseStockMap[item.productId];
      const available = Number(stockInfo !== undefined ? stockInfo.free : (prd ? prd.stockQty : 0)) || 0;
      if (!isReadOnly && item.quantity > available) {
        insufficientStockCount++;
      }
    });

    const additionalCharge = Number(additionalChargeAmount || 0);
    const additionalChargeVat = (additionalCharge * Number(additionalChargeVatRate || 0)) / 100;
    totalVat += additionalChargeVat;
    const netRevenueAmount = subtotal - totalDiscount + additionalCharge;
    const revenueUzs = netRevenueAmount * (currency === 'USD' ? Number(exchangeRate) : 1);
    const grandTotal = netRevenueAmount + totalVat;
    const paidAmount = Number(currentInvoiceData?.paidAmount || 0);
    const remainingDebt = Math.max(0, grandTotal - paidAmount);
    const estimatedProfit = revenueUzs - totalCost;
    const marginPercent = revenueUzs > 0 ? (estimatedProfit / revenueUzs) * 100 : 0;

    return {
      subtotal,
      totalDiscount,
      totalVat,
      additionalCharge,
      additionalChargeVat,
      netRevenueUzs: revenueUzs,
      grandTotal,
      paidAmount,
      remainingDebt,
      estimatedProfit,
      marginPercent,
      belowCostCount,
      insufficientStockCount,
    };
  }, [items, products, currentInvoiceData, warehouseStockMap, isReadOnly, additionalChargeAmount, additionalChargeVatRate, currency, exchangeRate]);

  const getProductPriceInDocumentCurrency = (
    pId: string,
    overrideRate?: number | string,
    overrideCurrency?: string,
  ): number | null => {
    const prd = products.find((p) => p.id === pId);
    if (!prd) return null;
    const docCurrency = overrideCurrency || currency;
    const rate = Number(overrideRate !== undefined ? overrideRate : exchangeRate);
    return convertSalePriceToDocumentCurrency(
      Number(prd.salePrice) || 0,
      prd.salePriceCurrency,
      docCurrency,
      rate,
    );
  };

  const handleCurrencyChange = (newCurr: string) => {
    markDirty();
    setCurrency(newCurr);
    const newRate = newCurr === 'UZS' ? 1 : currency === 'UZS' ? '' : exchangeRate;
    setExchangeRate(newRate);
    setItems((prev) =>
      prev.map((row) => {
        if (!row.productId) return row;
        const unitPrice = getProductPriceInDocumentCurrency(row.productId, newRate, newCurr);
        return { ...row, unitPrice: unitPrice ?? 0 };
      })
    );
  };

  const handleExchangeRateChange = (newRate: number | string) => {
    markDirty();
    setExchangeRate(newRate);
    setItems((prev) =>
      prev.map((row) => {
        if (!row.productId) return row;
        const unitPrice = getProductPriceInDocumentCurrency(row.productId, newRate, currency);
        return { ...row, unitPrice: unitPrice ?? 0 };
      })
    );
  };

  const handleCounterpartySelect = (cpId: string) => {
    markDirty();
    setCounterpartyId(cpId);
    const cp = counterparties.find((c) => c.id === cpId);
    if (cp) {
      const custDiscount = Number(cp.discountPercent || 0);

      // Recalculate existing rows
      setItems((prev) =>
        prev.map((row) => {
          if (!row.productId) return row;
          const unitPrice = getProductPriceInDocumentCurrency(row.productId);
          return {
            ...row,
            unitPrice: unitPrice ?? 0,
            discount: custDiscount > 0 ? custDiscount : row.discount,
          };
        })
      );
    }
  };

  const handleItemChange = (index: number, field: keyof ItemRow, val: ItemRow[keyof ItemRow]) => {
    markDirty();
    if (field === 'productId') {
      const selected = products.find((product) => product.id === val);
      setError(selected && Number(selected.salePrice) > 0 && !selected.salePriceCurrency
        ? (isRu ? 'У выбранного товара не указана валюта цены продажи. Укажите цену вручную или исправьте карточку товара.' : 'Tanlangan tovar sotuv narxi valyutasi belgilanmagan. Narxni qo‘lda kiriting yoki tovar kartasini tuzating.')
        : null);
    } else if (field === 'unitPrice') {
      setError(null);
    }
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: val };
      if (field === 'productId') {
        const selectedProduct = products.find((product) => product.id === val);
        const unitPrice = getProductPriceInDocumentCurrency(String(val));
        const cp = counterparties.find((c) => c.id === counterpartyId);
        const custDiscount = Number(cp?.discountPercent || 0);
        updated[index].unitPrice = unitPrice ?? 0;
        updated[index].vatRate = Number(selectedProduct?.vatRate ?? 0);
        if (custDiscount > 0 && (!updated[index].discount || updated[index].discount === 0)) {
          updated[index].discount = custDiscount;
        }
      }
      return updated;
    });
  };

  const addItemRow = (productId = '') => {
    markDirty();
    const unitPrice = productId ? getProductPriceInDocumentCurrency(productId) ?? 0 : 0;
    const cp = counterparties.find((c) => c.id === counterpartyId);
    const custDiscount = Number(cp?.discountPercent || 0);
    setItems((prev) => [
      ...prev,
      {
        productId,
        quantity: 1,
        unitPrice,
        discount: custDiscount > 0 ? custDiscount : 0,
        vatRate: Number(products.find((product) => product.id === productId)?.vatRate ?? 0),
      },
    ]);
  };

  const removeItemRow = (index: number) => {
    markDirty();
    if (items.length <= 1) {
      setItems([{ productId: '', quantity: 1, unitPrice: 0, discount: 0, vatRate: 0 }]);
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Barcode scanner
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeSearch.trim()) return;

    const term = barcodeSearch.trim().toLowerCase();
    const found = products.find(
      (p) => (p.barcode && p.barcode.toLowerCase() === term) || p.sku.toLowerCase() === term
    );

    if (found) {
      const existingIdx = items.findIndex((i) => i.productId === found.id);
      if (existingIdx >= 0) {
        handleItemChange(existingIdx, 'quantity', items[existingIdx].quantity + 1);
      } else {
        const emptyIdx = items.findIndex((i) => !i.productId);
        if (emptyIdx >= 0) {
          handleItemChange(emptyIdx, 'productId', found.id);
        } else {
          addItemRow(found.id);
        }
      }
      setBarcodeSearch('');
    } else {
      setError(isRu ? `Товар со штрих-кодом/SKU "${barcodeSearch.trim()}" не найден в каталоге` : `"${barcodeSearch.trim()}" shtrix-kod/SKU ga ega tovar katalogda topilmadi`);
    }
  };

  // Save Document
  const saveDocument = async (postImmediately = false): Promise<SalesInvoice | null> => {
    setError(null);
    setAttempted(true);
    if (!counterpartyId) {
      setError(isRu ? 'Выберите клиента' : 'Mijozni tanlang');
      return null;
    }
    if (!warehouseId) {
      setError(isRu ? 'Выберите склад' : 'Omborni tanlang');
      return null;
    }

    if (!currency) {
      setError(isRu ? 'Выберите валюту' : 'Valyutani tanlang');
      return null;
    }
    if (currency !== 'UZS') {
      const rateNum = Number(exchangeRate);
      if (exchangeRate === '' || !Number.isFinite(rateNum) || rateNum <= 0) {
        setError(isRu ? 'Курс валюты должен быть больше 0' : 'Valyuta kursi 0 dan katta bo‘lishi shart');
        return null;
      }
    }

    const validItems = items.filter((i) => i.productId && Number(i.quantity) > 0);
    if (validItems.length === 0) {
      setError(isRu ? 'Добавьте хотя бы один товар с количеством > 0' : 'Kamida bitta tovar va miqdorni kiriting');
      return null;
    }

    const unresolvedPrice = validItems.find((item) => {
      const product = products.find((candidate) => candidate.id === item.productId);
      return product && Number(product.salePrice) > 0 && !product.salePriceCurrency && Number(item.unitPrice) === 0;
    });
    if (unresolvedPrice) {
      setError(isRu
        ? 'У выбранного товара не указана валюта цены продажи. Введите цену вручную или исправьте карточку товара.'
        : 'Tanlangan tovar sotuv narxi valyutasi belgilanmagan. Narxni qo‘lda kiriting yoki tovar kartasini tuzating.');
      return null;
    }

    for (const i of validItems) {
      if (isNaN(Number(i.quantity)) || Number(i.quantity) <= 0) {
        setError(isRu ? 'Количество товара должно быть больше 0' : 'Tovar miqdori 0 dan katta bo‘lishi shart');
        return null;
      }
      if (isNaN(Number(i.unitPrice)) || Number(i.unitPrice) < 0) {
        setError(isRu ? 'Цена товара не может быть отрицательной' : 'Tovar narxi manfiy bo‘lishi mumkin emas');
        return null;
      }
      if (Number(i.vatRate || 0) < 0 || Number(i.vatRate || 0) > 100) {
        setError(isRu ? 'Ставка НДС должна быть от 0 до 100' : 'QQS stavkasi 0 dan 100 gacha bo‘lishi kerak');
        return null;
      }
    }

    if (Number(additionalChargeAmount || 0) < 0 || Number(additionalChargeVatRate || 0) < 0 || Number(additionalChargeVatRate || 0) > 100) {
      setError(isRu ? 'Проверьте сумму и ставку НДС дополнительной оплаты' : 'Qo‘shimcha summa va QQS stavkasini tekshiring');
      return null;
    }

    setLoading(true);

    try {
      const payload = {
        counterpartyId,
        warehouseId,
        invoiceDate: docDate,
        currency,
        exchangeRate: currency === 'UZS' ? 1 : Number(exchangeRate),
        contractNumber: contractNumber.trim() || undefined,
        contractDate: contractDate || undefined,
        paymentTerms: paymentTerms.trim() || undefined,
        comment: comment.trim() || undefined,
        additionalChargeAmount: Number(additionalChargeAmount || 0),
        additionalChargeVatRate: Number(additionalChargeVatRate || 0),
        postImmediately,
        items: validItems.map((i) => ({
          productId: i.productId,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          discount: Number(i.discount) || 0,
          vatRate: Number(i.vatRate || 0),
        })),
      };

      let saved: SalesInvoice;
      if (invoiceId) {
        // Update existing draft / invoice
        saved = await apiFetch<SalesInvoice>(`/sales/invoices/${invoiceId}`, {
          method: 'PATCH',
          token: token || undefined,
          tenantId: company?.id,
          locale,
          body: JSON.stringify(payload),
        });
      } else {
        // Create new invoice
        saved = await apiFetch<SalesInvoice>('/sales/invoices', {
          method: 'POST',
          token: token || undefined,
          tenantId: company?.id,
          locale,
          body: JSON.stringify(payload),
        });
      }

      if (saved && saved.id) {
        setInvoiceId(saved.id);
        setDocNumber(saved.invoiceNumber || (saved as { docNumber?: string }).docNumber || '');
        setDocStatus(saved.status);
        setPaymentStatus(saved.paymentStatus || 'UNPAID');
        setCurrentInvoiceData(saved);
        setIsDirty(false);
      }
      return saved;
    } catch (err) {
      console.error(err);
      setError(errorMessage(err) || (isRu ? 'Ошибка сохранения документа' : 'Hujjatni saqlashda xatolik yuz berdi'));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    const saved = await saveDocument(false);
    if (saved && mode === 'create') {
      router.push(`/sales/${saved.id}`);
    }
  };

  const handlePost = async () => {
    const saved = await saveDocument(false);
    if (!saved) return;

    setLoading(true);
    setError(null);
    try {
      const posted = await apiFetch<SalesInvoice>(`/sales/invoices/${saved.id}/post`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
      });

      setDocStatus('POSTED');
      if (posted) setCurrentInvoiceData(posted);
      setIsDirty(false);
      toast.success(isRu ? `Продажа ${posted?.invoiceNumber ?? ''} проведена: товар списан, долг клиента обновлён` : `Sotuv ${posted?.invoiceNumber ?? ''} tasdiqlandi: tovar chiqarildi, mijoz qarzi yangilandi`);

      router.push('/sales');
    } catch (err) {
      console.error(err);
      setError(errorMessage(err) || (isRu ? 'Ошибка проведения документа' : 'Hujjatni tasdiqlashda xatolik yuz berdi'));
    } finally {
      setLoading(false);
    }
  };

  const handleUnpost = async () => {
    if (!invoiceId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<SalesInvoice>(`/sales/invoices/${invoiceId}/unpost`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
      });
      if (res) {
        setDocStatus('DRAFT');
        setCurrentInvoiceData(res);
        setIsDirty(false);
      }
    } catch (err) {
      console.error(err);
      setError(errorMessage(err) || (isRu ? 'Не удалось отменить проведение' : 'Hujjat o‘tkazmasini bekor qilib bo‘lmadi'));
    } finally {
      setLoading(false);
    }
  };

  const handleUnpostToEdit = async () => {
    if (!invoiceId) return;
    const confirmed = await confirm({
      title: isRu ? 'Отмена проведения' : 'Tasdiqni bekor qilish',
      description: isRu
        ? 'Для редактирования проведение документа будет отменено (перевод в черновик). После внесения изменений вы сможете провести его снова. Продолжить?'
        : 'Hujjatni tahrirlash uchun uning tasdiqlanishi bekor qilinadi (qoralamaga qaytadi). O‘zgartirishlarni kiritgach, qayta tasdiqlashingiz mumkin. Davom etasizmi?',
      variant: 'warning',
      confirmText: isRu ? 'Продолжить' : 'Davom etish',
      cancelText: isRu ? 'Отмена' : 'Bekor qilish',
    });
    if (!confirmed) return;

    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<SalesInvoice>(`/sales/invoices/${invoiceId}/unpost`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id,
        locale,
      });
      if (res) {
        setDocStatus('DRAFT');
        setCurrentInvoiceData(res);
        setIsDirty(true);
      }
      toast.success(isRu ? 'Накладная переведена в черновик' : 'Sotuv hujjati qoralamaga qaytarildi');
    } catch (err) {
      console.error(err);
      const msg = errorMessage(err) || (isRu ? 'Не удалось отменить проведение' : 'Hujjat o‘tkazmasini bekor qilib bo‘lmadi');
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteInvoice = async () => {
    if (!invoiceId || mode !== 'edit') return;
    const confirmed = await confirm({
      title: isRu ? 'Удаление накладной' : 'Hujjatni o‘chirish',
      description:
        docStatus === 'POSTED'
          ? isRu
            ? 'Накладная продажи уже проведена. Удаление автоматически вернёт товары на склад, отменит проводки и задолженность клиента, после чего удалит документ. Вы уверены?'
            : 'Sotuv hujjati tasdiqlangan (o‘tkazilgan). O‘chirish tovarlarni omborga qaytaradi, buxgalteriya o‘tkazmasi va mijoz qarzini avtomatik bekor qilib, hujjatni o‘chiradi. Davom etasizmi?'
          : isRu
          ? 'Вы уверены, что хотите удалить этот документ?'
          : 'Ushbu hujjatni o‘chirishga ishonchingiz komilmi?',
      variant: 'danger',
      confirmText: isRu ? 'Удалить' : 'O‘chirish',
      cancelText: isRu ? 'Отмена' : 'Bekor qilish',
    });
    if (!confirmed) return;

    setLoading(true);
    try {
      if (docStatus === 'POSTED') {
        await apiFetch(`/sales/invoices/${invoiceId}/unpost`, {
          method: 'POST',
          token: token || undefined,
          tenantId: company?.id,
          locale,
        });
      }
      await apiFetch(`/sales/invoices/${invoiceId}`, {
        method: 'DELETE',
        token: token || undefined,
        tenantId: company?.id,
        locale,
      });
      setIsDirty(false);
      toast.success(isRu ? 'Накладная успешно удалена' : 'Sotuv hujjati o‘chirildi');
      router.push('/sales');
    } catch (err) {
      console.error(err);
      const msg = errorMessage(err) || (isRu ? 'Не удалось удалить документ' : 'Hujjatni o‘chirib bo‘lmadi');
      setError(msg);
      toast.error(msg);
      setLoading(false);
    }
  };

  // Auto prompt unpost when edit parameter is present
  useEffect(() => {
    if (isEditRequested && docStatus === 'POSTED' && invoiceId && !loading) {
      handleUnpostToEdit();
    }
  }, [isEditRequested]);

  const handleBackNavigation = async () => {
    if (isDirty) {
      const confirmed = await confirm({
        title: isRu ? 'Несохраненные изменения' : 'Saqlanmagan o‘zgarishlar',
        description: isRu
          ? 'У вас есть несохраненные изменения. Вы уверены, что хотите выйти?'
          : 'Sizda saqlanmagan o‘zgarishlar bor. Haqiqatan ham chiqib ketmoqchimisiz?',
        variant: 'warning',
        confirmText: isRu ? 'Выйти' : 'Chiqish',
        cancelText: isRu ? 'Остаться' : 'Qolish',
      });
      if (!confirmed) return;
    }
    setIsDirty(false);
    router.push('/sales');
  };

  // Intercept internal link clicks when isDirty to show custom modal instead of losing changes
  useEffect(() => {
    if (!isDirty) return;

    const handleAnchorClick = (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('a');
      if (target && target.href && !target.href.startsWith('javascript:')) {
        try {
          const url = new URL(target.href, window.location.origin);
          if (url.origin === window.location.origin && url.pathname !== window.location.pathname) {
            e.preventDefault();
            e.stopPropagation();
            confirm({
              title: isRu ? 'Несохраненные изменения' : 'Saqlanmagan o‘zgarishlar',
              description: isRu
                ? 'У вас есть несохраненные изменения. Вы уверены, что хотите выйти?'
                : 'Sizda saqlanmagan o‘zgarishlar bor. Haqiqatan ham chiqib ketmoqchimisiz?',
              variant: 'warning',
              confirmText: isRu ? 'Выйти' : 'Chiqish',
              cancelText: isRu ? 'Остаться' : 'Qolish',
            }).then((confirmed) => {
              if (confirmed) {
                setIsDirty(false);
                router.push(url.pathname + url.search);
              }
            });
          }
        } catch {
          // ignore invalid URLs
        }
      }
    };

    document.addEventListener('click', handleAnchorClick, true);
    return () => document.removeEventListener('click', handleAnchorClick, true);
  }, [isDirty, isRu, confirm, router]);

  const customerOptions: SelectOption[] = counterparties.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  const warehouseOptions: SelectOption[] = warehouses.map((w) => ({
    value: w.id,
    label: getLocalizedName(w.name),
  }));

  const productOptions: SelectOption[] = products.map((p) => {
    // Free stock in the document's warehouse; a product without a row there has none.
    const freeStock = warehouseId ? warehouseStockMap[p.id]?.free ?? 0 : p.stockQty;
    return {
      value: p.id,
      label: `${getLocalizedName(p.name)} ${p.sku ? `(${p.sku})` : ''} · ${stockLabel(freeStock, p.stockQty, locale)}`,
      // TZ "Ishlab chiqarish" 3.1: the type is shown and searchable ("Tayyor mahsulot").
      description: `${productTypeLabel(p.type, locale)}${p.isSemiFinished ? ` · ${semiFinishedLabel(locale)}` : ''}`,
    };
  });

  const getDocStatusBadge = (st: string) => {
    switch (st) {
      case 'DRAFT':
        return <Badge variant="warning">{isRu ? 'Черновик' : 'Qoralama'}</Badge>;
      case 'POSTED':
        return <Badge variant="success">{isRu ? 'Проведён' : 'Tasdiqlangan'}</Badge>;
      case 'CANCELLED':
        return <Badge variant="error">{isRu ? 'Отменён' : 'Bekor qilingan'}</Badge>;
      default:
        return <Badge variant="neutral">{st}</Badge>;
    }
  };

  const getPaymentBadge = (pst: string) => {
    switch (pst) {
      case 'UNPAID':
        return <Badge variant="error">{isRu ? 'Не оплачен' : 'To‘lanmagan'}</Badge>;
      case 'PARTIALLY_PAID':
        return <Badge variant="warning">{isRu ? 'Частично оплачен' : 'Qisman to‘langan'}</Badge>;
      case 'PAID':
        return <Badge variant="success">{isRu ? 'Оплачен' : 'To‘liq to‘langan'}</Badge>;
      default:
        return null;
    }
  };

  const showDiscVat = showDiscVatPref || items.some((i) => Number(i.discount) > 0);
  const checklist = [
    { label: tf('ckCustomer'), done: Boolean(counterpartyId) },
    { label: tf('ckWarehouse'), done: Boolean(warehouseId) },
    { label: currency && currency !== 'UZS' ? tf('ckCurrencyRate') : tf('ckCurrency'), done: Boolean(currency) && (currency === 'UZS' || Number(exchangeRate) > 0) },
    { label: tf('ckLines'), done: items.some((i) => i.productId) },
    { label: tf('ckQty'), done: items.filter((i) => i.productId).length > 0 && items.filter((i) => i.productId).every((i) => Number(i.quantity) > 0) },
    { label: tf('ckPrice'), done: items.filter((i) => i.productId).length > 0 && items.filter((i) => i.productId).every((i) => Number(i.unitPrice) > 0) },
  ];

  // Ctrl+S saves the draft, Ctrl+Enter posts (only while the document is editable).
  useDocumentShortcuts({ enabled: !isReadOnly && !loading, onSave: handleSaveDraft, onPost: handlePost });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', paddingBottom: 'var(--space-12)' }}>
      {/* Sticky Top Header & Toolbar (Exact Purchases Match) */}
      <div
        style={{
          position: 'sticky',
          top: 'var(--header-height)',
          zIndex: 15,
          backgroundColor: 'var(--color-bg-primary)',
          padding: 'var(--space-4) 0',
          borderBottom: '1px solid var(--color-border-light)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap', minWidth: 0 }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackNavigation}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowLeft size={18} /> {isRu ? 'К списку продаж' : 'Sotuvlar ro‘yxatiga'}
          </Button>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2) var(--space-3)', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
                {mode === 'create' && !docNumber
                  ? isRu
                    ? 'Новая накладная продажи'
                    : 'Yangi sotuv hujjati'
                  : `${isRu ? 'Накладная продажи' : 'Sotuv hujjati'} ${docNumber}`}
              </h1>
              {getDocStatusBadge(docStatus)}
              {getPaymentBadge(paymentStatus)}
            </div>
            {currency && calculations.grandTotal > 0 && (
              <div className="doc-live-total" aria-live="polite">
                {isRu ? 'Итого' : 'Jami'}: <strong className="tabular-nums">{formatCurrency(calculations.grandTotal, locale, currency)}</strong>
              </div>
            )}
          </div>
        </div>

        {/* Action Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {!isReadOnly && (
            <>
              {mode === 'edit' && invoiceId && (
                <Button
                  variant="ghost"
                  onClick={handleDeleteInvoice}
                  disabled={loading}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-error-700)' }}
                >
                  <Trash2 size={16} aria-hidden /> {isRu ? 'Удалить черновик' : 'Qoralamani o‘chirish'}
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={handleSaveDraft}
                loading={loading}
                title="Ctrl+S"
                aria-keyshortcuts="Control+S"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {!loading && <Save size={16} aria-hidden />} {isRu ? 'Сохранить черновик' : 'Qoralama saqlash'}
              </Button>
              <Button
                onClick={handlePost}
                loading={loading}
                loadingText={isRu ? 'Сохранение…' : 'Saqlanmoqda…'}
                title="Ctrl+Enter"
                aria-keyshortcuts="Control+Enter"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--color-success-600)' }}
              >
                {!loading && <CheckCircle2 size={16} aria-hidden />} {isRu ? 'Провести и закрыть' : 'Tasdiqlash va yopish'}
              </Button>
            </>
          )}

          {docStatus === 'CANCELLED' && mode === 'edit' && invoiceId && (
            <Button
              variant="danger"
              onClick={handleDeleteInvoice}
              disabled={loading}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Trash2 size={16} /> {isRu ? 'Удалить документ' : 'Hujjatni o‘chirish'}
            </Button>
          )}

          {docStatus === 'POSTED' && (
            <>
              {/* Rare and risky actions behind one menu; the everyday ones stay visible. */}
              <ActionsMenu
                label={isRu ? 'Другие действия' : 'Boshqa amallar'}
                actions={[
                  { label: isRu ? 'Редактировать' : 'Tahrirlash', onSelect: handleUnpostToEdit },
                  { label: isRu ? 'Отменить проведение' : 'Tasdiqni bekor qilish', onSelect: handleUnpost },
                  { label: isRu ? 'Удалить' : 'O‘chirish', onSelect: handleDeleteInvoice, danger: true },
                ]}
              />
              {paymentStatus !== 'PAID' && (
                <Button onClick={() => setIsPayOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CreditCard size={16} aria-hidden /> {isRu ? 'Принять оплату' : 'To‘lov qabul qilish'}
                </Button>
              )}

              <Button
                variant="secondary"
                onClick={() => setIsReturnOpen(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <RotateCcw size={16} /> {isRu ? 'Возврат' : 'Qaytarish'}
              </Button>

            </>
          )}

          <Button
            variant="ghost"
            onClick={() => window.print()}
            className="app-header-hide-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Printer size={16} /> {isRu ? 'Печать' : 'Chop etish'}
          </Button>
        </div>
      </div>

      {/* Posted Document Locked Banner */}
      {docStatus === 'POSTED' && (
        <Card style={{ padding: 'var(--space-3) var(--space-4)', backgroundColor: 'rgba(245, 158, 11, 0.08)', borderColor: 'var(--color-warning-500)', color: 'var(--color-warning-700)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertTriangle size={20} color="var(--color-warning-700)" />
            <div>
              <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                {isRu ? 'Накладная проведена и заблокирована от изменений' : 'Sotuv hujjati tasdiqlangan va o‘zgarishlardan qulflangan'}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                {isRu
                  ? 'Чтобы изменить товары, количество, цены или покупателя, переведите документ в режим редактирования.'
                  : 'Tovar, miqdor, narx yoki xaridorni o‘zgartirish uchun hujjatni tahrirlash rejimiga o‘tkazing.'}
              </div>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleUnpostToEdit}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--color-warning-600)', color: 'var(--color-text-inverse)', fontWeight: 600 }}
          >
            <Pencil size={14} /> {isRu ? 'Разрешить редактирование' : 'Tahrirlashga ruxsat berish'}
          </Button>
        </Card>
      )}

      {/* Error notification banner */}
      {error && (
        <div ref={errorRef} role="alert" tabIndex={-1} className="doc-banner is-error">
          <AlertCircle size={20} aria-hidden />
          <span>{error}</span>
        </div>
      )}

      {/* Insufficient free stock alert */}
      {!isReadOnly && calculations.insufficientStockCount > 0 && (
        <div role="status" className="doc-banner is-error">
          <AlertCircle size={20} aria-hidden />
          <span>
            {isRu
              ? `Внимание! В ${calculations.insufficientStockCount} поз. указанное количество превышает свободный остаток на складе.`
              : `Diqqat! ${calculations.insufficientStockCount} ta tovar bo‘yicha kiritilgan miqdor ombordagi erkin qoldiqdan ko‘p.`}
          </span>
        </div>
      )}

      {/* Below-cost alert */}
      {calculations.belowCostCount > 0 && (
        <div role="status" className="doc-banner is-warning">
          <AlertTriangle size={20} aria-hidden />
          <span>
            {isRu
              ? `Внимание! ${calculations.belowCostCount} поз. продаются ниже себестоимости — проверьте цену или скидку.`
              : `Diqqat! ${calculations.belowCostCount} ta tovar tannarxidan arzon sotilmoqda — narx yoki chegirmani tekshiring.`}
          </span>
        </div>
      )}

      <div className="doc-layout">
      <div className="doc-main">
      {/* Document Primary Metadata Form Card */}
      <Card style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}>
          {isRu ? 'Основная информация' : 'Asosiy ma’lumotlar'}
        </h3>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
          {/* Customer / Counterparty */}
          <div style={{ minWidth: '200px', flex: '2 1 220px' }}>
            <Select
              label={isRu ? 'Клиент (Покупатель) *' : 'Mijoz (Xaridor) *'}
              options={customerOptions}
              value={counterpartyId}
              onChange={handleCounterpartySelect}
              placeholder={isRu ? 'Выберите клиента' : 'Mijozni tanlang'}
              error={attempted && !counterpartyId ? (isRu ? 'Выберите клиента — на него запишется долг' : 'Mijozni tanlang — qarz shu mijozga yoziladi') : undefined}
              disabled={isReadOnly}
              onCreateNew={!isReadOnly ? () => setIsQuickCustomerOpen(true) : undefined}
              createNewLabel={isRu ? 'Добавить клиента' : 'Yangi mijoz qo‘shish'}
            />
            {(() => {
              const selectedCustomer = counterparties.find((c) => c.id === counterpartyId);
              if (!selectedCustomer) return null;
              const debt = Number(selectedCustomer.balancesByCurrency?.find((balance) => balance.currency === currency)?.customerDebt || 0);
              return (
                <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)' }}>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>
                    {isRu ? 'Баланс долга:' : 'Qarz balansi:'}
                  </span>
                  <span
                    style={{
                      fontWeight: 600,
                      color: debt > 0 ? 'var(--color-error-700)' : debt < 0 ? 'var(--color-success-700)' : 'var(--color-text-secondary)',
                    }}
                  >
                    {currency ? formatCurrency(debt, locale, currency) : '—'}
                  </span>
                </div>
              );
            })()}
          </div>

          {/* Warehouse */}
          <div style={{ minWidth: '150px', flex: '1.5 1 170px' }}>
            <Select
              label={isRu ? 'Склад списания *' : 'Chiqim ombori *'}
              options={warehouseOptions}
              value={warehouseId}
              onChange={(val) => { markDirty(); setWarehouseId(val); remember('sales.warehouseId', val); }}
              placeholder={isRu ? 'Выберите склад' : 'Omborni tanlang'}
              error={attempted && !warehouseId ? (isRu ? 'Выберите склад' : 'Omborni tanlang') : undefined}
              disabled={isReadOnly}
              onCreateNew={!isReadOnly ? () => setIsQuickWarehouseOpen(true) : undefined}
              createNewLabel={isRu ? 'Создать новый склад' : 'Yangi ombor qo‘shish'}
            />
          </div>

          {/* Document Date */}
          <div style={{ minWidth: '140px', flex: '1 1 150px' }}>
            <DatePicker
              label={isRu ? 'Дата документа *' : 'Hujjat Sanasi *'}
              value={docDate}
              onChange={(val) => { markDirty(); setDocDate(val); }}
              disabled={isReadOnly}
            />
          </div>

          {/* Currency */}
          <div style={{ minWidth: '90px', flex: '0.8 1 100px' }}>
            <Select
              label={isRu ? 'Валюта *' : 'Valyuta *'}
              options={CURRENCY_OPTIONS}
              value={currency}
              placeholder={isRu ? 'Валюта' : 'Valyuta'}
              error={attempted && !currency ? (isRu ? 'Выберите валюту' : 'Valyutani tanlang') : undefined}
              onChange={handleCurrencyChange}
              disabled={isReadOnly}
            />
          </div>

          {/* Exchange Rate */}
          {currency && currency !== 'UZS' && (
            <div style={{ minWidth: '100px', flex: '0.8 1 110px' }}>
              <MoneyInput
                label={isRu ? 'Курс валюты' : 'Valyuta kursi'}
                value={exchangeRate}
                onValueChange={(value) => handleExchangeRateChange(value)}
                decimals={4}
                placeholder="12,800"
                disabled={isReadOnly}
              />
            </div>
          )}

          {/* Rare fields: folded unless one is filled */}
          <details className="doc-more" open={Boolean(contractNumber || contractDate || paymentTerms || comment || Number(additionalChargeAmount) > 0) || undefined}>
            <summary>{tf('moreOptions')}</summary>
            <div className="doc-more-body">
          {/* Contract Number */}
          <div style={{ minWidth: '110px', flex: '1 1 120px' }}>
            <Input
              label={isRu ? '№ Договора' : 'Shartnoma №'}
              value={contractNumber}
              onChange={(e) => { markDirty(); setContractNumber(e.target.value); }}
              placeholder="№ 12-A"
              disabled={isReadOnly}
            />
          </div>

          {/* Contract Date */}
          <div style={{ minWidth: '140px', flex: '1 1 150px' }}>
            <DatePicker
              label={isRu ? 'Дата договора' : 'Shartnoma sanasi'}
              value={contractDate}
              onChange={(val) => { markDirty(); setContractDate(val); }}
              disabled={isReadOnly}
            />
          </div>

          {/* Payment Terms */}
          <div style={{ minWidth: '180px', flex: '1.5 1 200px' }}>
            <Input
              label={isRu ? 'Условия оплаты' : 'To‘lov shartlari'}
              value={paymentTerms}
              onChange={(e) => { markDirty(); setPaymentTerms(e.target.value); }}
              placeholder={isRu ? '100% предоплата, отсрочка 10 дней...' : '100% oldindan, 10 kun muddat...'}
              disabled={isReadOnly}
            />
          </div>

          {/* Comment */}
          <div style={{ minWidth: '220px', flex: '2 1 250px' }}>
            <Input
              label={isRu ? 'Примечание / Комментарий' : 'Izoh / Qayd'}
              value={comment}
              onChange={(e) => { markDirty(); setComment(e.target.value); }}
              placeholder={isRu ? 'Дополнительные сведения...' : 'Qo‘shimcha ma’lumotlar...'}
              disabled={isReadOnly}
            />
          </div>
              {!isReadOnly && (
                <div style={{ flexBasis: '100%' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 'var(--space-4)', alignItems: 'end' }}>
            <MoneyInput
              label={isRu ? `Дополнительная сумма покупателю${currency ? ` (${currency})` : ''}` : `Mijozga qo‘shimcha summa${currency ? ` (${currency})` : ''}`}
              value={additionalChargeAmount}
              onValueChange={(value) => {
                markDirty();
                setAdditionalChargeAmount(Number(value));
              }}
            />
            <Input
              label={isRu ? 'НДС на доплату, %' : 'Qo‘shimcha QQS, %'}
              type="text"
              inputMode="decimal"
              value={additionalChargeVatRate}
              onChange={(event) => {
                markDirty();
                setAdditionalChargeVatRate(event.target.value);
              }}
            />
          </div>
                </div>
              )}
            </div>
          </details>
        </div>
      </Card>

      {/* Items Table Card */}
      <Card style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}>
            {isRu ? 'Товары в документе' : 'Hujjatdagi tovarlar'} ({items.length})
          </h3>

          {!isReadOnly && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap', flex: '1 1 280px', justifyContent: 'flex-end', minWidth: 0 }}>
              <form onSubmit={handleBarcodeSubmit} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flex: '1 1 240px', maxWidth: 360, minWidth: 0 }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                  <Input
                    value={barcodeSearch}
                    onChange={(e) => setBarcodeSearch(e.target.value)}
                    placeholder={isRu ? 'Штрих-код или SKU...' : 'Shtrix-kod yoki SKU...'}
                    aria-label={isRu ? 'Штрих-код или SKU — Enter добавит товар' : 'Shtrix-kod yoki SKU — Enter tovarni qo‘shadi'}
                    autoComplete="off"
                    enterKeyHint="search"
                    style={{ paddingLeft: '32px' }}
                  />
                  <Barcode size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
                </div>
                <Button type="submit" variant="secondary" size="sm">
                  <Search size={14} /> {isRu ? 'Найти' : 'Qidirish'}
                </Button>
              </form>
            </div>
          )}
        </div>

        {/* Table container */}
        <div role="region" tabIndex={0} aria-label={isRu ? 'Строки документа' : 'Hujjat qatorlari'} style={{ overflowX: 'auto', minHeight: '220px', paddingBottom: '40px' }}>
          <table className="doc-lines" style={{ width: '100%', minWidth: showDiscVat ? '900px' : '680px', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th scope="col" style={{ padding: '10px 12px', textAlign: 'left', width: '40px' }}>#</th>
                <th scope="col" style={{ padding: '10px 12px', textAlign: 'left', minWidth: '240px' }}>
                  {isRu ? 'Товар / Номенклатура' : 'Tovar / Mahsulot'}
                </th>
                <th scope="col" style={{ padding: '10px 12px', textAlign: 'right', width: '130px', whiteSpace: 'nowrap' }}>
                  {isRu ? 'Количество' : 'Miqdor'}
                </th>
                <th scope="col" style={{ padding: '10px 12px', textAlign: 'right', width: '150px', whiteSpace: 'nowrap' }}>
                  {isRu ? `Цена продажи${currency ? ` (${currency})` : ''}` : `Sotish narxi${currency ? ` (${currency})` : ''}`}
                </th>
                {showDiscVat && (
                  <>
                    <th scope="col" style={{ padding: '10px 12px', textAlign: 'right', width: '100px', whiteSpace: 'nowrap' }}>
                      {isRu ? 'Скидка %' : 'Chegirma %'}
                    </th>
                    <th scope="col" style={{ padding: '10px 12px', textAlign: 'right', width: '80px', whiteSpace: 'nowrap' }}>
                      {isRu ? 'НДС %' : 'QQS %'}
                    </th>
                  </>
                )}
                <th scope="col" style={{ padding: '10px 12px', textAlign: 'right', width: '180px', whiteSpace: 'nowrap' }}>
                  {isRu ? `Итого${currency ? ` (${currency})` : ''}` : `Jami summa${currency ? ` (${currency})` : ''}`}
                </th>
                {!isReadOnly && <th scope="col" style={{ padding: '10px 12px', textAlign: 'center', width: '44px' }}><span className="sr-only">{isRu ? 'Действия' : 'Amallar'}</span></th>}
              </tr>
            </thead>
            <tbody onKeyDown={linesKeyDown({ rowCount: items.length, addRow: () => addItemRow(), disabled: isReadOnly })}>
              {items.map((item, idx) => {
                const prd = products.find((p) => p.id === item.productId);
                const qty = Number(item.quantity) || 0;
                const price = Number(item.unitPrice) || 0;
                const disc = Number(item.discount) || 0;
                const vatR = Number(item.vatRate) || 0;

                const lineSubtotal = qty * price;
                const lineAfterDiscount = Math.max(0, lineSubtotal - (lineSubtotal * disc) / 100);
                const lineVat = (lineAfterDiscount * vatR) / 100;
                const lineTotal = lineAfterDiscount + lineVat;
                const costInUzs = prd ? productCostUzs(prd) : null;
                const salePriceInUzs = price * (1 - Number(item.discount || 0) / 100) * (currency === 'USD' ? Number(exchangeRate) : 1);
                const isBelowCost = costInUzs !== null && price > 0 && salePriceInUzs < costInUzs;

                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-light)', backgroundColor: isBelowCost ? 'rgba(239, 68, 68, 0.04)' : 'transparent' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--color-text-tertiary)' }}>{idx + 1}</td>

                    {/* Product select */}
                    <td style={{ padding: '10px 12px' }}>
                      <Select
                        options={productOptions}
                        value={item.productId}
                        onChange={(val) => handleItemChange(idx, 'productId', val)}
                        placeholder={isRu ? 'Выберите товар...' : 'Tovarni tanlang...'}
                        disabled={isReadOnly}
                        onCreateNew={!isReadOnly ? () => setQuickProductRow(idx) : undefined}
                        createNewLabel={isRu ? 'Новый товар' : 'Yangi tovar qo‘shish'}
                      />
                      {prd && (
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          <span>{isRu ? 'Себестоимость' : 'Tannarx'}: {(() => {
                            const costInDocument = currency && costInUzs !== null ? convertSalePriceToDocumentCurrency(costInUzs, 'UZS', currency, Number(exchangeRate)) : null;
                            return costInDocument !== null && currency ? formatCurrency(costInDocument, locale, currency) : '—';
                          })()}</span>
                          <span>•</span>
                          <span>{isRu ? 'Ед.' : 'Birlik'}: {unitLabel(prd.unitOfMeasure, locale)}</span>
                          {!showDiscVat && (
                            <>
                              <span>•</span>
                              <span>{isRu ? 'НДС' : 'QQS'}: {Number(item.vatRate) || 0}%</span>
                              {Number(item.discount) > 0 && (
                                <>
                                  <span>•</span>
                                  <span>{isRu ? 'Скидка' : 'Chegirma'}: {Number(item.discount)}%</span>
                                </>
                              )}
                            </>
                          )}
                          {warehouseStockMap[item.productId] !== undefined && (
                            <>
                              <span>•</span>
                              <span
                                style={{
                                  fontWeight: 600,
                                  color: warehouseStockMap[item.productId].free >= qty ? 'var(--color-success-700)' : 'var(--color-error-700)',
                                }}
                              >
                                {isRu ? 'Свободный остаток' : 'Erkin qoldiq'}: {warehouseStockMap[item.productId].free}
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Quantity */}
                    <td style={{ padding: '10px 12px' }}>
                      <QuantityInput
                        unit={prd?.unitOfMeasure}
                        value={item.quantity}
                        onValueChange={(value) => handleItemChange(idx, 'quantity', Number(value) || 0)}
                        disabled={isReadOnly}
                        aria-label={`${isRu ? 'Количество для строки' : 'Miqdor'} ${idx + 1}`}
                        invalid={!isReadOnly && warehouseStockMap[item.productId] !== undefined && qty > warehouseStockMap[item.productId].free}
                      />
                      {!isReadOnly &&
                        warehouseStockMap[item.productId] !== undefined &&
                        qty > warehouseStockMap[item.productId].free && (
                          <div style={{ fontSize: '10px', color: 'var(--color-error-700)', marginTop: 2, textAlign: 'right', fontWeight: 600 }}>
                            {isRu ? 'Недостаточно!' : 'Yetarli emas!'}
                          </div>
                        )}
                    </td>

                    {/* Unit Price */}
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <CurrencyInput
                        value={item.unitPrice}
                        onChange={(val) => handleItemChange(idx, 'unitPrice', val)}
                        disabled={isReadOnly || !isPriceOverrideAllowed}
                        title={!isPriceOverrideAllowed ? (isRu ? 'Ручное изменение цены запрещено настройками' : 'Narxni qo‘lda o‘zgartirish taqiqlangan') : undefined}
                        aria-label={`${isRu ? 'Цена продажи для строки' : 'Sotish narxi'} ${idx + 1}`}
                        style={{
                          borderColor: isBelowCost ? 'var(--color-error-500)' : undefined,
                          color: isBelowCost ? 'var(--color-error-700)' : undefined,
                          ...(!isPriceOverrideAllowed ? { backgroundColor: 'var(--color-bg-secondary)', cursor: 'not-allowed' } : {}),
                        }}
                      />
                    </td>

                    {showDiscVat && (<>
                    {/* Discount */}
                    <td style={{ padding: '10px 12px' }}>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        value={item.discount}
                        onChange={(e) => handleItemChange(idx, 'discount', parseFloat(e.target.value) || 0)}
                        disabled={isReadOnly}
                        aria-label={`${isRu ? 'Скидка для строки' : 'Chegirma %'} ${idx + 1}`}
                        style={{ textAlign: 'right' }}
                      />
                    </td>

                    {/* VAT Rate */}
                    <td style={{ padding: '10px 12px' }}>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={item.vatRate}
                        onChange={(e) => handleItemChange(idx, 'vatRate', e.target.value)}
                        disabled={isReadOnly}
                        aria-label={`${isRu ? 'НДС для строки' : 'QQS %'} ${idx + 1}`}
                        style={{ textAlign: 'right' }}
                      />
                    </td>

                    </>)}
                    {/* Line Total */}
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap' }} className="tabular-nums">
                      {currency ? formatCurrency(lineTotal, locale, currency) : '—'}
                    </td>

                    {/* Actions (Delete Row) */}
                    {!isReadOnly && (
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeItemRow(idx)}
                          style={{ color: 'var(--color-text-tertiary)', padding: '4px' }}
                          title={isRu ? 'Удалить строку' : 'Qatorni o‘chirish'}
                          aria-label={`${isRu ? 'Удалить строку' : 'Qatorni o‘chirish'} ${idx + 1}`}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Add Row Button */}
        {!isReadOnly && (
          <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => addItemRow()}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              aria-label={isRu ? 'Добавить новую позицию' : 'Yangi qator qo‘shish'}
            >
              <Plus size={16} /> {isRu ? 'Добавить позицию' : 'Qator qo‘shish'}
            </Button>
            <label className="auth-check" style={{ marginLeft: 'auto' }}>
              <input type="checkbox" checked={showDiscVat} onChange={(e) => setShowDiscVatPref(e.target.checked)} />
              {tf('showDiscVat')}
            </label>
          </div>
        )}
      </Card>

      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
        * {isRu ? 'поля, обязательные для заполнения' : 'bilan belgilangan maydonlar to‘ldirilishi majburiy'}
      </div>
      </div>

      {/* Side panel: live totals, what is still missing, the next step */}
      <aside className="doc-aside" aria-label={tf('sidePanel')}>
        <Card style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }} aria-live="polite">
          <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)', borderBottom: '1px solid var(--color-border-light)', paddingBottom: 'var(--space-2)' }}>
            {isRu ? 'Финансовый итог' : 'Hisob-kitob'}
          </h3>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            <span>{isRu ? 'Подитог без скидки:' : 'Jami (chegirmasiz):'}</span>
            <span className="tabular-nums font-medium">{currency ? formatCurrency(calculations.subtotal, locale, currency) : '—'}</span>
          </div>

          {calculations.totalDiscount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-success-700)' }}>
              <span>{isRu ? 'Сумма скидки:' : 'Chegirma summasi:'}</span>
              <span className="tabular-nums font-medium">- {currency ? formatCurrency(calculations.totalDiscount, locale, currency) : '—'}</span>
            </div>
          )}

          {calculations.additionalCharge > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              <span>{isRu ? 'Дополнительная сумма:' : 'Qo‘shimcha summa:'}</span>
              <span className="tabular-nums font-medium">{currency ? formatCurrency(calculations.additionalCharge, locale, currency) : '—'}</span>
            </div>
          )}

          {calculations.totalVat > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              <span>{isRu ? 'Сумма НДС:' : 'QQS summasi:'}</span>
              <span className="tabular-nums font-medium">{currency ? formatCurrency(calculations.totalVat, locale, currency) : '—'}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-3)', marginTop: 'var(--space-1)' }}>
            <span>{isRu ? 'Итого к оплате:' : 'Jami to‘lov:'}</span>
            <span className="tabular-nums" style={{ color: 'var(--color-primary-700)' }}>
              {currency ? formatCurrency(calculations.grandTotal, locale, currency) : '—'}
            </span>
          </div>

          {/* Profitability insight */}
          <div style={{ padding: '12px', backgroundColor: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginTop: 'var(--space-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              <TrendingUp size={14} color="var(--color-success-700)" />
              <span>{isRu ? 'Ожидаемая маржинальность' : 'Kutilayotgan marja'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Валовая прибыль:' : 'Yalpi foyda:'}</span>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: calculations.estimatedProfit >= 0 ? 'var(--color-success-700)' : 'var(--color-error-700)' }} className="tabular-nums">
                 {formatCurrency(calculations.estimatedProfit, locale, 'UZS')}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2 }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Маржа (%):' : 'Marja (%):'}</span>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: calculations.marginPercent >= 0 ? 'var(--color-success-700)' : 'var(--color-error-700)' }} className="tabular-nums">
                {formatPercent(calculations.marginPercent)}
              </span>
            </div>
          </div>
        </Card>
        {!isReadOnly ? (
          <Card style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <DocChecklist items={checklist} />
            <Button onClick={handlePost} loading={loading} loadingText={isRu ? 'Сохранение…' : 'Saqlanmoqda…'} style={{ width: '100%', backgroundColor: 'var(--color-success-600)' }}>
              {!loading && <CheckCircle2 size={16} aria-hidden />} {isRu ? 'Провести и закрыть' : 'Tasdiqlash va yopish'}
            </Button>
            <Button variant="secondary" onClick={handleSaveDraft} loading={loading} style={{ width: '100%' }}>
              {!loading && <Save size={16} aria-hidden />} {isRu ? 'Сохранить черновик' : 'Qoralama saqlash'}
            </Button>
            <p className="doc-aside-hint">{tf('shortcutsHint')}</p>
          </Card>
        ) : docStatus === 'POSTED' ? (
          <Card style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' }}>{tf('paymentTitle')}</h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
              <span>{isRu ? 'Оплачено' : 'To‘langan'}</span>
              <span className="tabular-nums">{currency ? formatCurrency(Number(currentInvoiceData?.paidAmount || 0), locale, currency) : '—'}</span>
            </div>
            {currency && calculations.grandTotal - Number(currentInvoiceData?.paidAmount || 0) > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-error-700)' }}>
                <span>{tf('debtLeft')}</span>
                <span className="tabular-nums">{formatCurrency(calculations.grandTotal - Number(currentInvoiceData?.paidAmount || 0), locale, currency)}</span>
              </div>
            )}
            {paymentStatus !== 'PAID' && (
              <Button onClick={() => setIsPayOpen(true)} style={{ width: '100%' }}>
                <CreditCard size={16} aria-hidden /> {isRu ? 'Принять оплату' : 'To‘lov qabul qilish'}
              </Button>
            )}
          </Card>
        ) : null}
      </aside>
      </div>

      {/* Drawers & Modals (Standardized with Purchases) */}
      <CreateCounterpartyDrawer
        isOpen={isQuickCustomerOpen}
        onClose={() => setIsQuickCustomerOpen(false)}
        onSuccess={handleCustomerAdded}
        defaultType="CUSTOMER"
      />

      <CreateWarehouseDrawer
        isOpen={isQuickWarehouseOpen}
        onClose={() => setIsQuickWarehouseOpen(false)}
        onSuccess={handleWarehouseAdded}
      />

      {quickProductRow !== null && (
        <CreateProductDrawer
          isOpen={quickProductRow !== null}
          onClose={() => setQuickProductRow(null)}
          onSuccess={(created) => {
            void handleProductAdded(created);
          }}
        />
      )}

      {currentInvoiceData && (
        <>
          <PaySalesInvoiceModal
            isOpen={isPayOpen}
            onClose={() => setIsPayOpen(false)}
            invoice={currentInvoiceData}
            onSuccess={() => {
              if (invoiceId) {
                apiFetch<SalesInvoice>(`/sales/invoices/${invoiceId}`, { token: token || undefined, tenantId: company?.id, locale }).then((res) => {
                  if (res) setCurrentInvoiceData(res);
                });
              }
            }}
          />
          <CreateSalesReturnModal
            isOpen={isReturnOpen}
            onClose={() => setIsReturnOpen(false)}
            invoice={currentInvoiceData}
            onSuccess={() => {
              if (invoiceId) {
                apiFetch<SalesInvoice>(`/sales/invoices/${invoiceId}`, { token: token || undefined, tenantId: company?.id, locale }).then((res) => {
                  if (res) setCurrentInvoiceData(res);
                });
              }
            }}
          />
        </>
      )}
    </div>
  );
}

/** The product card cost of one unit in UZS, or null when its currency/rate is unknown. */
function productCostUzs(product: Pick<ProductOption, 'costPrice' | 'costPriceCurrency' | 'costPriceExchangeRate'>): number | null {
  if (!(Number(product.costPrice) > 0)) return null;
  return convertCostPriceToDocumentCurrency(
    Number(product.costPrice),
    product.costPriceCurrency,
    Number(product.costPriceExchangeRate),
    'UZS',
    1,
  );
}
