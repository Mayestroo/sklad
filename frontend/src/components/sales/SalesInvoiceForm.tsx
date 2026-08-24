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
  UserPlus,
  PackagePlus,
  Building2,
  TrendingUp,
} from 'lucide-react';
import { SalesInvoice } from '@shared/types';
import { PaySalesInvoiceModal } from './PaySalesInvoiceModal';
import { CreateSalesReturnModal } from './CreateSalesReturnModal';
import { QuickAddCustomerModal } from './QuickAddCustomerModal';
import { QuickAddProductModal } from '@/components/purchases/QuickAddProductModal';
import { CustomerProfileDrawer } from './CustomerProfileDrawer';

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

  // Modals state
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [isCustomerDrawerOpen, setIsCustomerDrawerOpen] = useState(false);
  const [currentInvoiceData, setCurrentInvoiceData] = useState<SalesInvoice | null>(initialData || null);

  const isReadOnly = docStatus === 'POSTED' || docStatus === 'CANCELLED';

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
        apiFetch<any>('/counterparties', { token, tenantId: company.id, locale }),
        apiFetch<any>('/inventory/warehouses', { token, tenantId: company.id, locale }),
        apiFetch<any>('/inventory/products', { token, tenantId: company.id, locale }),
      ]);

      const cpList = cpRes?.data || cpRes || [];
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

  // Selected counterparty
  const selectedCounterparty = counterparties.find((c) => c.id === counterpartyId);

  // Totals calculation
  const calculations = useMemo(() => {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalVat = 0;
    let totalCost = 0;
    let belowCostCount = 0;

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
    };
  }, [items, products, currentInvoiceData]);

  // Handle item change
  const handleItemChange = (index: number, field: keyof ItemRow, val: any) => {
    setIsDirty(true);
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: val };

      // When product is selected, autofill sale price
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
    setIsDirty(true);
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
    setIsDirty(true);
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
      setIsProductModalOpen(true);
    }
  };

  // Save / Post Document
  const handleSave = async (postImmediately = false) => {
    setError(null);

    if (!counterpartyId) {
      setError(isRu ? 'Выберите клиента' : 'Mijozni tanlang');
      return;
    }
    if (!warehouseId) {
      setError(isRu ? 'Выберите склад' : 'Omborni tanlang');
      return;
    }

    const validItems = items.filter((i) => i.productId && i.quantity > 0);
    if (validItems.length === 0) {
      setError(isRu ? 'Добавьте хотя бы один товар с количеством > 0' : 'Kamida bitta tovar va miqdorni kiriting');
      return;
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

      if (mode === 'create' || !invoiceId) {
        const created = await apiFetch<SalesInvoice>('/sales/invoices', {
          method: 'POST',
          token: token || undefined,
          tenantId: company?.id,
          locale,
          body: JSON.stringify(payload),
        });

        if (created && created.id) {
          setInvoiceId(created.id);
          setDocNumber(created.invoiceNumber || (created as any).docNumber);
          setDocStatus(created.status);
          setPaymentStatus(created.paymentStatus || 'UNPAID');
          setCurrentInvoiceData(created);
          setIsDirty(false);
          router.push(`/sales/${created.id}`);
        }
      } else {
        // If posting an existing draft
        if (postImmediately) {
          const posted = await apiFetch<SalesInvoice>(`/sales/invoices/${invoiceId}/post`, {
            method: 'POST',
            token: token || undefined,
            tenantId: company?.id,
            locale,
          });
          if (posted) {
            setDocStatus('POSTED');
            setCurrentInvoiceData(posted);
            setIsDirty(false);
          }
        }
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || (isRu ? 'Ошибка при сохранении документа' : 'Hujjatni saqlashda xatolik yuz berdi'));
    } finally {
      setLoading(false);
    }
  };

  // Unpost
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
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || (isRu ? 'Не удалось отменить проведение' : 'Hujjat o‘tkazmasini bekor qilib bo‘lmadi'));
    } finally {
      setLoading(false);
    }
  };

  // Delete
  const handleDelete = async () => {
    if (!invoiceId) return;
    if (!confirm(isRu ? 'Вы уверены, что хотите удалить этот документ?' : 'Haqiqatan ham bu hujjatni o‘chirmoqchimisiz?')) return;

    setLoading(true);
    try {
      await apiFetch(`/sales/invoices/${invoiceId}`, {
        method: 'DELETE',
        token: token || undefined,
        tenantId: company?.id,
        locale,
      });
      router.push('/sales');
    } catch (err: any) {
      console.error(err);
      setError(err.message || (isRu ? 'Не удалось удалить документ' : 'Hujjatni o‘chirib bo‘lmadi'));
      setLoading(false);
    }
  };

  const counterpartyOptions: SelectOption[] = counterparties.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  const warehouseOptions: SelectOption[] = warehouses.map((w) => ({
    value: w.id,
    label: getLocalizedName(w.name),
  }));

  const productSelectOptions: SelectOption[] = [
    { value: '', label: isRu ? '— Выберите товар —' : '— Tovarni tanlang —' },
    ...products.map((p) => ({
      value: p.id,
      label: `${getLocalizedName(p.name)} (${p.sku}) — ${formatCurrency(p.salePrice, locale, currency)}`,
    })),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', paddingBottom: 'var(--space-10)' }}>
      {/* Top Breadcrumb & Actions Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Button
            variant="secondary"
            onClick={() => router.push('/sales')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px', padding: '0 12px' }}
          >
            <ArrowLeft size={16} />
            {isRu ? 'К списку' : 'Ro‘yxatga'}
          </Button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
                {mode === 'create'
                  ? (isRu ? 'Новая накладная продажи' : 'Yangi Sotuv Fakturasi')
                  : `${isRu ? 'Накладная продажи' : 'Sotuv Fakturasi'} № ${docNumber}`}
              </h1>
              <Badge variant={docStatus === 'POSTED' ? 'success' : docStatus === 'CANCELLED' ? 'error' : 'warning'}>
                {docStatus === 'POSTED' ? (isRu ? 'Проведён' : 'Tasdiqlangan') : docStatus === 'CANCELLED' ? (isRu ? 'Отменён' : 'Bekor qilingan') : (isRu ? 'Черновик' : 'Qoralama')}
              </Badge>
              {docStatus === 'POSTED' && (
                <Badge variant={paymentStatus === 'PAID' ? 'success' : paymentStatus === 'PARTIALLY_PAID' ? 'warning' : 'error'}>
                  {paymentStatus === 'PAID' ? (isRu ? 'Оплачен' : 'To‘liq to‘langan') : paymentStatus === 'PARTIALLY_PAID' ? (isRu ? 'Частично оплачен' : 'Qisman to‘langan') : (isRu ? 'Не оплачен' : 'To‘lanmagan')}
                </Badge>
              )}
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              {isRu ? 'Оформление отгрузки покупателю, списание остатков по FIFO и расчет валовой прибыли' : 'Xaridorga tovar sotish, FIFO bo‘yicha hisobdan chiqarish va yalpi foyda hisobi'}
            </p>
          </div>
        </div>

        {/* Actions Button Group */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {docStatus === 'POSTED' ? (
            <>
              <Button
                variant="secondary"
                onClick={() => setIsPayOpen(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px', borderColor: '#10b981', color: '#10b981' }}
              >
                <CreditCard size={16} />
                {isRu ? 'Принять оплату' : 'To‘lov olish'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setIsReturnOpen(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px' }}
              >
                <RotateCcw size={16} />
                {isRu ? 'Возврат товара' : 'Qaytaruv'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => window.print()}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px' }}
              >
                <Printer size={16} />
                {isRu ? 'Печать' : 'Chop etish'}
              </Button>
              <Button
                variant="secondary"
                onClick={handleUnpost}
                disabled={loading}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px', color: '#ef4444' }}
              >
                {isRu ? 'Отменить проведение' : 'Tasdiqni bekor qilish'}
              </Button>
            </>
          ) : (
            <>
              {mode === 'edit' && (
                <Button
                  variant="secondary"
                  onClick={handleDelete}
                  disabled={loading}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px', color: '#ef4444' }}
                >
                  <Trash2 size={16} />
                  {isRu ? 'Удалить' : 'O‘chirish'}
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => handleSave(false)}
                disabled={loading || isReadOnly}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px' }}
              >
                <Save size={16} />
                {isRu ? 'Сохранить черновик' : 'Qoralama saqlash'}
              </Button>
              <Button
                onClick={() => handleSave(true)}
                disabled={loading || isReadOnly}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px' }}
              >
                <CheckCircle2 size={16} />
                {isRu ? 'Провести документ' : 'Tasdiqlash (O‘tkazish)'}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)',
            color: '#ef4444',
            fontSize: 'var(--text-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Below-cost alert */}
      {calculations.belowCostCount > 0 && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: 'var(--radius-md)',
            color: '#d97706',
            fontSize: 'var(--text-sm)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <AlertTriangle size={18} />
          <span>
            {isRu
              ? `Внимание! ${calculations.belowCostCount} поз. продаются ниже себестоимости (Below-Cost Guardrail).`
              : `Diqqat! ${calculations.belowCostCount} ta tovar tannarxidan arzon sotilmoqda (Below-Cost Guardrail).`}
          </span>
        </div>
      )}

      {/* Main Grid: Left Form (8 cols) + Right Summary (4 cols) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: 'var(--space-6)', alignItems: 'start' }}>
        {/* Left Column: Requisites & Items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Document Header Requisites Card */}
          <Card style={{ padding: 'var(--space-5)' }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 'var(--space-4)' }}>
              {isRu ? 'Основные реквизиты' : 'Asosiy rekvizitlar'}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
              {/* Customer Select with Quick Add */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                    {isRu ? 'Клиент (Покупатель) *' : 'Mijoz (Xaridor) *'}
                  </label>
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => setIsCustomerModalOpen(true)}
                      style={{
                        fontSize: '11px',
                        color: 'var(--color-primary-600)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '2px',
                        fontWeight: 600,
                      }}
                    >
                      <UserPlus size={12} /> {isRu ? '+ Клиент' : '+ Mijoz'}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <div style={{ flex: 1 }}>
                    <Select
                      options={counterpartyOptions}
                      value={counterpartyId}
                      onChange={(val) => {
                        setIsDirty(true);
                        setCounterpartyId(val);
                      }}
                      disabled={isReadOnly}
                    />
                  </div>
                  {counterpartyId && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => setIsCustomerDrawerOpen(true)}
                      title={isRu ? 'Профиль клиента' : 'Mijoz profili'}
                      style={{ padding: '0 10px', height: '38px' }}
                    >
                      <Building2 size={16} />
                    </Button>
                  )}
                </div>
              </div>

              {/* Warehouse Select */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  {isRu ? 'Склад списания *' : 'Chiqim ombori *'}
                </label>
                <Select
                  options={warehouseOptions}
                  value={warehouseId}
                  onChange={(val) => {
                    setIsDirty(true);
                    setWarehouseId(val);
                  }}
                  disabled={isReadOnly}
                />
              </div>

              {/* Document Date */}
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  {isRu ? 'Дата накладной' : 'Hujjat sanasi'}
                </label>
                <DatePicker
                  value={docDate}
                  onChange={(val) => {
                    setIsDirty(true);
                    setDocDate(val);
                  }}
                  disabled={isReadOnly}
                />
              </div>

              {/* Currency & Rate */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                    {isRu ? 'Валюта' : 'Valyuta'}
                  </label>
                  <Select
                    options={CURRENCY_OPTIONS}
                    value={currency}
                    onChange={(val) => {
                      setIsDirty(true);
                      setCurrency(val);
                      if (val === 'UZS') setExchangeRate(1);
                    }}
                    disabled={isReadOnly}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                    {isRu ? 'Курс' : 'Valyuta kursi'}
                  </label>
                  <Input
                    type="number"
                    step="any"
                    value={exchangeRate}
                    onChange={(e) => {
                      setIsDirty(true);
                      setExchangeRate(parseFloat(e.target.value) || 1);
                    }}
                    disabled={isReadOnly || currency === 'UZS'}
                  />
                </div>
              </div>
            </div>

            {/* Optional contract & comment row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)', marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-border-light)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  {isRu ? 'Договор №' : 'Shartnoma №'}
                </label>
                <Input
                  placeholder={isRu ? 'Напр: № 12/2026' : 'Masalan: № 12/2026'}
                  value={contractNumber}
                  onChange={(e) => {
                    setIsDirty(true);
                    setContractNumber(e.target.value);
                  }}
                  disabled={isReadOnly}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  {isRu ? 'Условия оплаты' : 'To‘lov shartlari'}
                </label>
                <Input
                  placeholder={isRu ? 'Напр: 100% предоплата, отсрочка 10 дней' : 'Masalan: 100% oldindan, 10 kun muddat'}
                  value={paymentTerms}
                  onChange={(e) => {
                    setIsDirty(true);
                    setPaymentTerms(e.target.value);
                  }}
                  disabled={isReadOnly}
                />
              </div>

              <div style={{ gridColumn: 'span 2' }}>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  {isRu ? 'Примечание / Комментарий' : 'Izoh / Qayd'}
                </label>
                <Input
                  placeholder={isRu ? 'Дополнительные сведения...' : 'Qo‘shimcha ma’lumotlar...'}
                  value={comment}
                  onChange={(e) => {
                    setIsDirty(true);
                    setComment(e.target.value);
                  }}
                  disabled={isReadOnly}
                />
              </div>
            </div>
          </Card>

          {/* Line Items Table Card */}
          <Card style={{ padding: 'var(--space-5)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              <div>
                <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {isRu ? 'Товары к отгрузке' : 'Chiqim qilinadigan tovarlar'}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                  {items.filter((i) => i.productId).length} {isRu ? 'позиций' : 'ta pozitsiya'}
                </div>
              </div>

              {/* Barcode scanner & quick add */}
              {!isReadOnly && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <form onSubmit={handleBarcodeSubmit} style={{ position: 'relative', width: '220px' }}>
                    <Barcode size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
                    <input
                      placeholder={isRu ? 'Штрихкод / SKU...' : 'Shtrixkod / SKU...'}
                      value={barcodeSearch}
                      onChange={(e) => setBarcodeSearch(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '6px 10px 6px 32px',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        fontSize: 'var(--text-xs)',
                        background: 'var(--color-bg-input)',
                        color: 'var(--color-text-primary)',
                      }}
                    />
                  </form>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setIsProductModalOpen(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', height: '32px', padding: '0 10px', fontSize: 'var(--text-xs)' }}
                  >
                    <PackagePlus size={14} />
                    {isRu ? '+ Товар' : '+ Yangi tovar'}
                  </Button>
                </div>
              )}
            </div>

            {/* Table */}
            <div style={{ overflowX: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-subtle)' }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', width: '35%' }}>
                      {isRu ? 'ТОВАР / УСЛУГА' : 'TOVAR / XIZMAT'}
                    </th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', width: '15%' }}>
                      {isRu ? 'КОЛ-ВО' : 'MIQDOR'}
                    </th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', width: '18%' }}>
                      {isRu ? 'ЦЕНА ПРОДАЖИ' : 'SOTISH NARXI'}
                    </th>
                    <th style={{ padding: '8px 12px', textAlign: 'center', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', width: '12%' }}>
                      {isRu ? 'СКИДКА %' : 'SKIDKA %'}
                    </th>
                    <th style={{ padding: '8px 12px', textAlign: 'right', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', width: '15%' }}>
                      {isRu ? 'СУММА' : 'SUMMA'}
                    </th>
                    {!isReadOnly && (
                      <th style={{ padding: '8px 12px', textAlign: 'center', width: '5%' }}></th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => {
                    const prd = products.find((p) => p.id === item.productId);
                    const lineRaw = item.quantity * item.unitPrice;
                    const discountVal = (lineRaw * item.discount) / 100;
                    const lineTotal = lineRaw - discountVal;
                    const isBelowCost = prd && item.unitPrice > 0 && item.unitPrice < prd.costPrice;

                    return (
                      <tr key={index} style={{ borderBottom: '1px solid var(--color-border-light)', backgroundColor: isBelowCost ? 'rgba(239, 68, 68, 0.04)' : 'transparent' }}>
                        {/* Product Select */}
                        <td style={{ padding: '6px 8px' }}>
                          <Select
                            options={productSelectOptions}
                            value={item.productId}
                            onChange={(val) => handleItemChange(index, 'productId', val)}
                            disabled={isReadOnly}
                          />
                          {prd && (
                            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: 2, display: 'flex', gap: '8px' }}>
                              <span>Tannarx: {formatCurrency(prd.costPrice, locale, currency)}</span>
                              <span>•</span>
                              <span>Birlik: {prd.unitOfMeasure || 'dona'}</span>
                            </div>
                          )}
                        </td>

                        {/* Quantity */}
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                          <Input
                            type="number"
                            min={0.001}
                            step="any"
                            value={item.quantity || ''}
                            onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value) || 0)}
                            disabled={isReadOnly}
                            style={{ textAlign: 'right', height: '36px' }}
                          />
                        </td>

                        {/* Unit Price */}
                        <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            value={item.unitPrice || ''}
                            onChange={(e) => handleItemChange(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                            disabled={isReadOnly}
                            style={{
                              textAlign: 'right',
                              height: '36px',
                              borderColor: isBelowCost ? '#ef4444' : undefined,
                              color: isBelowCost ? '#ef4444' : undefined,
                            }}
                          />
                        </td>

                        {/* Discount */}
                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step="any"
                            value={item.discount || ''}
                            onChange={(e) => handleItemChange(index, 'discount', parseFloat(e.target.value) || 0)}
                            disabled={isReadOnly}
                            style={{ textAlign: 'center', height: '36px' }}
                          />
                        </td>

                        {/* Line Total */}
                        <td style={{ padding: '6px 12px', textAlign: 'right', fontWeight: 600 }} className="tabular-nums">
                          {formatCurrency(lineTotal, locale, currency)}
                        </td>

                        {/* Delete Row */}
                        {!isReadOnly && (
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => removeItemRow(index)}
                              style={{ background: 'none', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', padding: 4 }}
                              title={isRu ? 'Удалить строку' : 'Qatorni o‘chirish'}
                            >
                              <Trash2 size={16} />
                            </button>
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
              <div style={{ marginTop: 'var(--space-3)' }}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => addItemRow()}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '36px', fontSize: 'var(--text-xs)' }}
                >
                  <Plus size={14} />
                  {isRu ? 'Добавить строку' : 'Qator qo‘shish'}
                </Button>
              </div>
            )}
          </Card>
        </div>

        {/* Right Column: Financial Summary & Actions Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', position: 'sticky', top: 'var(--space-6)' }}>
          <Card style={{ padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-primary)', borderBottom: '1px solid var(--color-border-light)', paddingBottom: 'var(--space-3)' }}>
              {isRu ? 'Финансовый итог' : 'Hisob-kitob xulosasi'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', fontSize: 'var(--text-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-text-secondary)' }}>
                <span>{isRu ? 'Подитог без скидки:' : 'Jami (chegirmasiz):'}</span>
                <span className="tabular-nums">{formatCurrency(calculations.subtotal, locale, currency)}</span>
              </div>

              {calculations.totalDiscount > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10b981' }}>
                  <span>{isRu ? 'Скидка:' : 'Chegirma:'}</span>
                  <span className="tabular-nums">- {formatCurrency(calculations.totalDiscount, locale, currency)}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 'var(--text-base)', color: 'var(--color-text-primary)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-2)' }}>
                <span>{isRu ? 'ИТОГО К ОПЛАТЕ:' : 'JAMI TO‘LOV:'}</span>
                <span className="tabular-nums" style={{ color: 'var(--color-primary-600)' }}>
                  {formatCurrency(calculations.grandTotal, locale, currency)}
                </span>
              </div>

              {docStatus === 'POSTED' && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#10b981', marginTop: 'var(--space-2)' }}>
                    <span>{isRu ? 'Оплачено:' : 'To‘langan:'}</span>
                    <span className="tabular-nums">{formatCurrency(calculations.paidAmount, locale, currency)}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', color: calculations.remainingDebt > 0 ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                    <span>{isRu ? 'Остаток долга:' : 'Qoldiq qarz:'}</span>
                    <span className="tabular-nums">{formatCurrency(calculations.remainingDebt, locale, currency)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Profitability widget */}
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

            {/* Sticky submit buttons in sidebar */}
            {!isReadOnly && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                <Button
                  onClick={() => handleSave(true)}
                  disabled={loading}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '42px' }}
                >
                  <CheckCircle2 size={18} />
                  {loading ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : (isRu ? 'Провести накладную' : 'Tasdiqlash (O‘tkazish)')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleSave(false)}
                  disabled={loading}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', height: '38px' }}
                >
                  <Save size={16} />
                  {isRu ? 'Сохранить черновик' : 'Qoralama saqlash'}
                </Button>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Auxiliary Modals */}
      <QuickAddCustomerModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        onSuccess={(newCp) => {
          setCounterparties((prev) => [newCp, ...prev]);
          setCounterpartyId(newCp.id);
        }}
      />

      <QuickAddProductModal
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
        onSuccess={(newPrd) => {
          const formatted = {
            id: newPrd.id,
            name: newPrd.name,
            sku: newPrd.sku,
            barcode: newPrd.barcode,
            salePrice: Number(newPrd.salePrice) || 0,
            costPrice: Number(newPrd.costPrice) || 0,
            unitOfMeasure: newPrd.unitOfMeasure || 'dona',
            stockQty: 0,
          };
          setProducts((prev) => [formatted, ...prev]);
          addItemRow(newPrd.id);
        }}
      />

      {counterpartyId && (
        <CustomerProfileDrawer
          isOpen={isCustomerDrawerOpen}
          onClose={() => setIsCustomerDrawerOpen(false)}
          customerId={counterpartyId}
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
