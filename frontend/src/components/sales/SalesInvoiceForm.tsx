'use client';

import { useState, useEffect, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { DatePicker } from '@/components/ui/DatePicker';
import { Select, SelectOption } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency, CURRENCY_OPTIONS } from '@/lib/utils';
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
  PackagePlus,
  TrendingUp,
} from 'lucide-react';
import { SalesInvoice } from '@shared/types';
import { PaySalesInvoiceModal } from './PaySalesInvoiceModal';
import { CreateSalesReturnModal } from './CreateSalesReturnModal';
import { CreateCounterpartyDrawer } from '@/components/counterparties/CreateCounterpartyDrawer';
import { CreateWarehouseDrawer } from '@/components/warehouses/CreateWarehouseDrawer';

interface CounterpartyOption {
  id: string;
  name: string;
  type?: string;
  debtBalance?: number;
  phone?: string;
  inn?: string;
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
  costPrice: number;
  unitOfMeasure?: string;
  stockQty?: number;
}

interface ItemRow {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  vatRate: number;
}

interface SalesInvoiceFormProps {
  initialData?: SalesInvoice | null;
  mode: 'create' | 'edit';
}

export function SalesInvoiceForm({ initialData, mode }: SalesInvoiceFormProps) {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();
  const router = useRouter();

  // Dropdowns state
  const [counterparties, setCounterparties] = useState<CounterpartyOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  // Document Form State
  const [invoiceId, setInvoiceId] = useState<string | null>(initialData?.id || null);
  const [docNumber, setDocNumber] = useState<string>(initialData?.invoiceNumber || (initialData as any)?.docNumber || '');
  const [docStatus, setDocStatus] = useState<string>(initialData?.status || 'DRAFT');
  const [paymentStatus, setPaymentStatus] = useState<string>(initialData?.paymentStatus || 'UNPAID');

  const [counterpartyId, setCounterpartyId] = useState(initialData?.counterpartyId || '');
  const [warehouseId, setWarehouseId] = useState(initialData?.warehouseId || '');
  const [docDate, setDocDate] = useState(
    initialData?.invoiceDate ? initialData.invoiceDate.slice(0, 10) : (initialData?.createdAt ? initialData.createdAt.slice(0, 10) : new Date().toISOString().slice(0, 10))
  );
  const [currency, setCurrency] = useState(initialData?.currency || 'UZS');
  const [exchangeRate, setExchangeRate] = useState(Number(initialData?.exchangeRate) || 1);
  const [contractNumber, setContractNumber] = useState(initialData?.contractNumber || '');
  const [contractDate, setContractDate] = useState(
    initialData?.contractDate ? initialData.contractDate.slice(0, 10) : ''
  );
  const [paymentTerms, setPaymentTerms] = useState(initialData?.paymentTerms || '');
  const [comment, setComment] = useState(initialData?.comment || '');

  // Line items
  const [items, setItems] = useState<ItemRow[]>(
    initialData?.items && initialData.items.length > 0
      ? initialData.items.map((i: any) => ({
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

  // Quick Add Drawers
  const [isQuickCustomerOpen, setIsQuickCustomerOpen] = useState(false);
  const [isQuickWarehouseOpen, setIsQuickWarehouseOpen] = useState(false);

  // Modals state
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [currentInvoiceData, setCurrentInvoiceData] = useState<SalesInvoice | null>(initialData || null);
  const [warehouseStockMap, setWarehouseStockMap] = useState<Record<string, { physical: number; reserved: number; free: number }>>({});

  const isReadOnly = docStatus === 'POSTED' || docStatus === 'CANCELLED';

  const markDirty = () => {
    if (!isDirty) setIsDirty(true);
  };

  // Helper name resolver
  const getLocalizedName = (name: any) => {
    if (!name) return '—';
    if (typeof name === 'string') return name;
    return name[locale] || name.ru || name.uz || Object.values(name)[0] || '—';
  };

  // Fetch dropdowns
  const fetchDropdowns = async () => {
    if (!token || !company) return;

    try {
      const [cpRes, whRes, prdRes] = await Promise.all([
        apiFetch<any>('/sales/counterparties', { token: token || undefined, tenantId: company.id, locale }),
        apiFetch<any>('/inventory/warehouses', { token: token || undefined, tenantId: company.id, locale }),
        apiFetch<any>('/inventory/products', { token: token || undefined, tenantId: company.id, locale }),
      ]);

      const cpList = cpRes?.data || (Array.isArray(cpRes) ? cpRes : []);
      setCounterparties(cpList);
      if (!counterpartyId && cpList.length > 0 && mode === 'create') {
        setCounterpartyId(cpList[0].id);
      }

      const whList = whRes?.data || whRes || [];
      setWarehouses(whList);
      if (!warehouseId && whList.length > 0 && mode === 'create') {
        setWarehouseId(whList[0].id);
      }

      const prdList = (prdRes?.data || prdRes || []).map((p: any) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        barcode: p.barcode,
        salePrice: Number(p.salePrice) || 0,
        costPrice: Number(p.costPrice) || 0,
        unitOfMeasure: p.unitOfMeasure || 'dona',
        stockQty: Number(p.stockQuantity || p.quantity || 0),
      }));
      setProducts(prdList);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchDropdowns();
  }, [token, company, locale]);

  // Fetch live free stock when warehouseId changes
  useEffect(() => {
    if (!token || !company || !warehouseId) return;

    apiFetch<any>(`/inventory/stock-levels?warehouseId=${warehouseId}`, {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => {
        const list = Array.isArray(res) ? res : res?.data || [];
        const map: Record<string, { physical: number; reserved: number; free: number }> = {};
        list.forEach((sl: any) => {
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
  const handleCustomerAdded = (newCustomer: { id: string; name: string; type: string; debtBalance?: number }) => {
    markDirty();
    setCounterparties((prev) => [newCustomer, ...prev]);
    setCounterpartyId(newCustomer.id);
  };

  const handleWarehouseAdded = (newWarehouse: { id: string; name: string | Record<string, string> }) => {
    markDirty();
    setWarehouses((prev) => [newWarehouse, ...prev]);
    setWarehouseId(newWarehouse.id);
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
      const cost = prd ? prd.costPrice : 0;
      const lineRaw = item.quantity * item.unitPrice;
      const discountVal = (lineRaw * item.discount) / 100;
      const afterDiscount = lineRaw - discountVal;
      const vatVal = (afterDiscount * item.vatRate) / 100;

      subtotal += lineRaw;
      totalDiscount += discountVal;
      totalVat += vatVal;
      totalCost += item.quantity * cost;

      if (prd && item.unitPrice > 0 && item.unitPrice < cost) {
        belowCostCount++;
      }

      const stockInfo = warehouseStockMap[item.productId];
      const available = Number(stockInfo !== undefined ? stockInfo.free : (prd ? prd.stockQty : 0)) || 0;
      if (!isReadOnly && item.quantity > available) {
        insufficientStockCount++;
      }
    });

    const grandTotal = subtotal - totalDiscount + totalVat;
    const paidAmount = Number(currentInvoiceData?.paidAmount || 0);
    const remainingDebt = Math.max(0, grandTotal - paidAmount);
    const estimatedProfit = grandTotal - totalCost;
    const marginPercent = grandTotal > 0 ? (estimatedProfit / grandTotal) * 100 : 0;

    return {
      subtotal,
      totalDiscount,
      totalVat,
      grandTotal,
      paidAmount,
      remainingDebt,
      estimatedProfit,
      marginPercent,
      belowCostCount,
      insufficientStockCount,
    };
  }, [items, products, currentInvoiceData, warehouseStockMap, isReadOnly]);

  const handleItemChange = (index: number, field: keyof ItemRow, val: any) => {
    markDirty();
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: val };
      if (field === 'productId') {
        const prd = products.find((p) => p.id === val);
        if (prd) {
          updated[index].unitPrice = prd.salePrice || 0;
        }
      }
      return updated;
    });
  };

  const addItemRow = (productId = '') => {
    markDirty();
    const prd = products.find((p) => p.id === productId);
    setItems((prev) => [
      ...prev,
      {
        productId,
        quantity: 1,
        unitPrice: prd ? prd.salePrice || 0 : 0,
        discount: 0,
        vatRate: 0,
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
    if (!counterpartyId) {
      setError(isRu ? 'Выберите клиента' : 'Mijozni tanlang');
      return null;
    }
    if (!warehouseId) {
      setError(isRu ? 'Выберите склад' : 'Omborni tanlang');
      return null;
    }

    const validItems = items.filter((i) => i.productId && i.quantity > 0);
    if (validItems.length === 0) {
      setError(isRu ? 'Добавьте хотя бы один товар с количеством > 0' : 'Kamida bitta tovar va miqdorni kiriting');
      return null;
    }

    setLoading(true);

    try {
      const payload = {
        counterpartyId,
        warehouseId,
        invoiceDate: docDate,
        currency,
        exchangeRate: Number(exchangeRate) || 1,
        contractNumber: contractNumber.trim() || undefined,
        contractDate: contractDate || undefined,
        paymentTerms: paymentTerms.trim() || undefined,
        comment: comment.trim() || undefined,
        postImmediately,
        items: validItems.map((i) => ({
          productId: i.productId,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          discount: Number(i.discount) || 0,
          vatRate: Number(i.vatRate) || 0,
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
        setDocNumber(saved.invoiceNumber || (saved as any).docNumber);
        setDocStatus(saved.status);
        setPaymentStatus(saved.paymentStatus || 'UNPAID');
        setCurrentInvoiceData(saved);
        setIsDirty(false);
      }
      return saved;
    } catch (err: any) {
      console.error(err);
      setError(err.message || (isRu ? 'Ошибка сохранения документа' : 'Hujjatni saqlashda xatolik yuz berdi'));
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

  const handlePost = async (andClose: boolean) => {
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

      if (andClose) {
        router.push('/sales');
      } else {
        router.push(`/sales/${saved.id}`);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || (isRu ? 'Ошибка проведения документа' : 'Hujjatni tasdiqlashda xatolik yuz berdi'));
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
    } catch (err: any) {
      console.error(err);
      setError(err.message || (isRu ? 'Не удалось отменить проведение' : 'Hujjat o‘tkazmasini bekor qilib bo‘lmadi'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDraft = async () => {
    if (!invoiceId || mode !== 'edit' || docStatus !== 'DRAFT') return;
    if (!confirm(isRu ? 'Вы уверены, что хотите удалить этот черновик?' : 'Ushbu qoralama hujjatni o‘chirishga ishonchingiz komilmi?')) return;

    setLoading(true);
    try {
      await apiFetch(`/sales/invoices/${invoiceId}`, {
        method: 'DELETE',
        token: token || undefined,
        tenantId: company?.id,
        locale,
      });
      setIsDirty(false);
      router.push('/sales');
    } catch (err: any) {
      console.error(err);
      setError(err.message || (isRu ? 'Не удалось удалить черновик' : 'Qoralama hujjatni o‘chirib bo‘lmadi'));
      setLoading(false);
    }
  };

  const handleBackNavigation = () => {
    if (isDirty) {
      const confirmed = window.confirm(
        isRu
          ? 'У вас есть несохраненные изменения. Вы уверены, что хотите выйти?'
          : 'Sizda saqlanmagan o‘zgarishlar bor. Haqiqatan ham chiqib ketmoqchimisiz?'
      );
      if (!confirmed) return;
    }
    setIsDirty(false);
    router.push('/sales');
  };

  const customerOptions: SelectOption[] = counterparties.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  const warehouseOptions: SelectOption[] = warehouses.map((w) => ({
    value: w.id,
    label: getLocalizedName(w.name),
  }));

  const productOptions: SelectOption[] = products.map((p) => {
    const stockInfo = warehouseStockMap[p.id];
    const freeStock = stockInfo !== undefined ? stockInfo.free : p.stockQty;
    return {
      value: p.id,
      label: `${getLocalizedName(p.name)} ${p.sku ? `(${p.sku})` : ''} · ${isRu ? 'Остаток' : 'Qoldiq'}: ${freeStock}`,
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackNavigation}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowLeft size={18} /> {isRu ? 'К списку продаж' : 'Sotuvlar ro‘yxatiga'}
          </Button>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
                {mode === 'create' && !docNumber
                  ? isRu
                    ? 'Новая накладная продажи'
                    : 'Yangi Sotuv Hujjati'
                  : `${isRu ? 'Накладная продажи' : 'Sotuv hujjati'} ${docNumber}`}
              </h1>
              {getDocStatusBadge(docStatus)}
              {getPaymentBadge(paymentStatus)}
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          {!isReadOnly && (
            <>
              <Button
                variant="secondary"
                onClick={handleSaveDraft}
                disabled={loading}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Save size={16} /> {isRu ? 'Сохранить черновик' : 'Qoralama saqlash'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => handlePost(false)}
                disabled={loading}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <CheckCircle2 size={16} /> {isRu ? 'Провести' : 'Tasdiqlash'}
              </Button>
              <Button
                onClick={() => handlePost(true)}
                disabled={loading}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: 'var(--color-success-600)' }}
              >
                <CheckCircle2 size={16} /> {isRu ? 'Провести и закрыть' : 'Tasdiqlash va yopish'}
              </Button>

              {mode === 'edit' && invoiceId && (
                <Button
                  variant="danger"
                  onClick={handleDeleteDraft}
                  disabled={loading}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Trash2 size={16} /> {isRu ? 'Удалить черновик' : 'Qoralamani o‘chirish'}
                </Button>
              )}
            </>
          )}

          {docStatus === 'POSTED' && (
            <>
              <Button
                variant="secondary"
                onClick={handleUnpost}
                disabled={loading}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <RotateCcw size={16} /> {isRu ? 'Отменить проведение' : 'Tasdiqni bekor qilish'}
              </Button>

              <Button
                variant="secondary"
                onClick={() => setIsPayOpen(true)}
                style={{
                  backgroundColor: 'var(--color-success-50)',
                  color: 'var(--color-success-600)',
                  border: '1px solid var(--color-success-200)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <CreditCard size={16} /> {isRu ? 'Оплатить' : 'To‘lash'}
              </Button>

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
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Printer size={16} /> {isRu ? 'Печать' : 'Chop etish'}
          </Button>
        </div>
      </div>

      {/* Error notification banner */}
      {error && (
        <Card style={{ padding: 'var(--space-3) var(--space-4)', backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: '#ef4444', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertCircle size={20} />
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{error}</span>
        </Card>
      )}

      {/* Insufficient free stock alert */}
      {!isReadOnly && calculations.insufficientStockCount > 0 && (
        <Card style={{ padding: 'var(--space-3) var(--space-4)', backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: '#ef4444', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertCircle size={20} />
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
            {isRu
              ? `Внимание! В ${calculations.insufficientStockCount} поз. указанное количество превышает свободный остаток на складе.`
              : `Diqqat! ${calculations.insufficientStockCount} ta tovar bo'yicha kiritilgan miqdor ombordagi erkin qoldiqdan ko'p.`}
          </span>
        </Card>
      )}

      {/* Below-cost alert */}
      {calculations.belowCostCount > 0 && (
        <Card style={{ padding: 'var(--space-3) var(--space-4)', backgroundColor: 'rgba(245, 158, 11, 0.08)', borderColor: '#f59e0b', color: '#d97706', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertTriangle size={20} />
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>
            {isRu
              ? `Внимание! ${calculations.belowCostCount} поз. продаются ниже себестоимости (Below-Cost Guardrail).`
              : `Diqqat! ${calculations.belowCostCount} ta tovar tannarxidan arzon sotilmoqda (Below-Cost Guardrail).`}
          </span>
        </Card>
      )}

      {/* Document Primary Metadata Form Card */}
      <Card style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}>
          {isRu ? 'Основная информация' : 'Asosiy Hujjat Ma’lumotlari'}
        </h3>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'flex-start' }}>
          {/* Customer / Counterparty */}
          <div style={{ minWidth: '200px', flex: '2 1 220px' }}>
            <Select
              label={isRu ? 'Клиент (Покупатель) *' : 'Mijoz (Xaridor) *'}
              options={customerOptions}
              value={counterpartyId}
              onChange={(val) => { markDirty(); setCounterpartyId(val); }}
              placeholder={isRu ? 'Выберите клиента' : 'Mijozni tanlang'}
              disabled={isReadOnly}
              onCreateNew={!isReadOnly ? () => setIsQuickCustomerOpen(true) : undefined}
              createNewLabel={isRu ? 'Добавить клиента' : 'Yangi mijoz qo‘shish'}
            />
            {(() => {
              const selectedCustomer = counterparties.find((c) => c.id === counterpartyId);
              if (!selectedCustomer) return null;
              const debt = Number(selectedCustomer.debtBalance || 0);
              return (
                <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)' }}>
                  <span style={{ color: 'var(--color-text-tertiary)' }}>
                    {isRu ? 'Баланс долга:' : 'Qarz balansi:'}
                  </span>
                  <span
                    style={{
                      fontWeight: 600,
                      color: debt > 0 ? '#ef4444' : debt < 0 ? '#10b981' : 'var(--color-text-secondary)',
                    }}
                  >
                    {formatCurrency(debt, locale)}
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
              onChange={(val) => { markDirty(); setWarehouseId(val); }}
              placeholder={isRu ? 'Выберите склад' : 'Omborni tanlang'}
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

          {/* Currency */}
          <div style={{ minWidth: '90px', flex: '0.8 1 100px' }}>
            <Select
              label={isRu ? 'Валюта' : 'Valyuta'}
              options={CURRENCY_OPTIONS}
              value={currency}
              onChange={(val) => {
                markDirty();
                setCurrency(val);
                if (val === 'UZS') setExchangeRate(1);
              }}
              disabled={isReadOnly}
            />
          </div>

          {/* Exchange Rate */}
          {currency !== 'UZS' && (
            <div style={{ minWidth: '100px', flex: '0.8 1 110px' }}>
              <Input
                label={isRu ? 'Курс валюты' : 'Valyuta kursi'}
                type="number"
                step="any"
                value={exchangeRate}
                onChange={(e) => { markDirty(); setExchangeRate(parseFloat(e.target.value) || 1); }}
                disabled={isReadOnly}
              />
            </div>
          )}

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
        </div>
      </Card>

      {/* Items Table Card */}
      <Card style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}>
            {isRu ? 'Товары в документе' : 'Hujjatdagi Tovarlar'} ({items.length})
          </h3>

          {!isReadOnly && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <form onSubmit={handleBarcodeSubmit} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <div style={{ position: 'relative', width: '240px' }}>
                  <Input
                    value={barcodeSearch}
                    onChange={(e) => setBarcodeSearch(e.target.value)}
                    placeholder={isRu ? 'Штрих-код или SKU...' : 'Shtrix-kod yoki SKU...'}
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
        <div style={{ overflowX: 'auto', minHeight: '320px', paddingBottom: '40px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-light)', backgroundColor: 'var(--color-bg-subtle)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'left', width: '40px' }}>#</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', minWidth: '240px' }}>
                  {isRu ? 'Товар / Номенклатура' : 'Tovar / Mahsulot'}
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'right', width: '110px' }}>
                  {isRu ? 'Количество' : 'Miqdor'}
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'right', width: '140px' }}>
                  {isRu ? 'Цена продажи' : 'Sotish narxi'}
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'right', width: '110px' }}>
                  {isRu ? 'Скидка %' : 'Skidka %'}
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'right', width: '90px' }}>
                  {isRu ? 'НДС %' : 'QQS %'}
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'right', width: '150px' }}>
                  {isRu ? 'Итого' : 'Jami Summa'}
                </th>
                {!isReadOnly && <th style={{ padding: '10px 12px', textAlign: 'center', width: '50px' }}></th>}
              </tr>
            </thead>
            <tbody>
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
                const isBelowCost = prd && price > 0 && price < prd.costPrice;

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
                      />
                      {prd && (
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: 2, display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          <span>Tannarx: {formatCurrency(prd.costPrice, locale, currency)}</span>
                          <span>•</span>
                          <span>Birlik: {prd.unitOfMeasure || 'dona'}</span>
                          {warehouseStockMap[item.productId] !== undefined && (
                            <>
                              <span>•</span>
                              <span
                                style={{
                                  fontWeight: 600,
                                  color: warehouseStockMap[item.productId].free >= qty ? '#10b981' : '#ef4444',
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
                      <Input
                        type="number"
                        min="0.001"
                        step="any"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                        disabled={isReadOnly}
                        style={{
                          textAlign: 'right',
                          borderColor:
                            !isReadOnly &&
                            warehouseStockMap[item.productId] !== undefined &&
                            qty > warehouseStockMap[item.productId].free
                              ? '#ef4444'
                              : undefined,
                        }}
                      />
                      {!isReadOnly &&
                        warehouseStockMap[item.productId] !== undefined &&
                        qty > warehouseStockMap[item.productId].free && (
                          <div style={{ fontSize: '10px', color: '#ef4444', marginTop: 2, textAlign: 'right', fontWeight: 600 }}>
                            {isRu ? 'Недостаточно!' : 'Yetarli emas!'}
                          </div>
                        )}
                    </td>

                    {/* Unit Price */}
                    <td style={{ padding: '10px 12px' }}>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={item.unitPrice}
                        onChange={(e) => handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                        disabled={isReadOnly}
                        style={{
                          textAlign: 'right',
                          borderColor: isBelowCost ? '#ef4444' : undefined,
                          color: isBelowCost ? '#ef4444' : undefined,
                        }}
                      />
                    </td>

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
                        style={{ textAlign: 'right' }}
                      />
                    </td>

                    {/* VAT Rate */}
                    <td style={{ padding: '10px 12px' }}>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        value={item.vatRate}
                        onChange={(e) => handleItemChange(idx, 'vatRate', parseFloat(e.target.value) || 0)}
                        disabled={isReadOnly}
                        style={{ textAlign: 'right' }}
                      />
                    </td>

                    {/* Line Total */}
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }} className="tabular-nums">
                      {formatCurrency(lineTotal, locale, currency)}
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
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => addItemRow()}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Plus size={16} /> {isRu ? 'Добавить позицию' : 'Qator qo‘shish'}
            </Button>
          </div>
        )}
      </Card>

      {/* Summary Footer Panel (Purchases Style) */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Card style={{ padding: 'var(--space-6)', width: '100%', maxWidth: '480px', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)', borderBottom: '1px solid var(--color-border-light)', paddingBottom: 'var(--space-2)' }}>
            {isRu ? 'Финансовый итог' : 'Hisob-kitob Xulosasi'}
          </h3>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            <span>{isRu ? 'Подитог без скидки:' : 'Jami (chegirmasiz):'}</span>
            <span className="tabular-nums font-medium">{formatCurrency(calculations.subtotal, locale, currency)}</span>
          </div>

          {calculations.totalDiscount > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: '#10b981' }}>
              <span>{isRu ? 'Сумма скидки:' : 'Chegirma summasi:'}</span>
              <span className="tabular-nums font-medium">- {formatCurrency(calculations.totalDiscount, locale, currency)}</span>
            </div>
          )}

          {calculations.totalVat > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              <span>{isRu ? 'Сумма НДС:' : 'QQS summasi:'}</span>
              <span className="tabular-nums font-medium">{formatCurrency(calculations.totalVat, locale, currency)}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-3)', marginTop: 'var(--space-1)' }}>
            <span>{isRu ? 'ИТОГО К ОПЛАТЕ:' : 'JAMI TO‘LOV:'}</span>
            <span className="tabular-nums" style={{ color: 'var(--color-primary-600)' }}>
              {formatCurrency(calculations.grandTotal, locale, currency)}
            </span>
          </div>

          {/* Profitability insight */}
          <div style={{ padding: '12px', backgroundColor: 'var(--color-bg-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', marginTop: 'var(--space-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              <TrendingUp size={14} color="#10b981" />
              <span>{isRu ? 'Ожидаемая маржинальность' : 'Kutilayotgan marja'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Валовая прибыль:' : 'Yalpi foyda:'}</span>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: calculations.estimatedProfit >= 0 ? '#10b981' : '#ef4444' }} className="tabular-nums">
                {formatCurrency(calculations.estimatedProfit, locale, currency)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 2 }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Маржа (%):' : 'Marja (%):'}</span>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: calculations.marginPercent >= 0 ? '#10b981' : '#ef4444' }} className="tabular-nums">
                {calculations.marginPercent.toFixed(1)}%
              </span>
            </div>
          </div>
        </Card>
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
