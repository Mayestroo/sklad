'use client';

import { useState, useEffect, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  RotateCcw,
  Printer,
  CreditCard,
  Receipt,
  ChevronDown,
  ChevronUp,
  Barcode,
  Search,
  AlertCircle,
  UserPlus,
  PackagePlus,
  Sparkles,
} from 'lucide-react';
import { PurchaseReceipt } from '@shared/types';
import { PayPurchaseModal } from './PayPurchaseModal';
import { AllocateExpenseModal } from './AllocateExpenseModal';
import { CreateReturnModal } from './CreateReturnModal';
import { CreateCounterpartyDrawer } from '@/components/counterparties/CreateCounterpartyDrawer';
import { CreateProductDrawer } from '@/components/products/CreateProductDrawer';
import { CreateWarehouseDrawer } from '@/components/warehouses/CreateWarehouseDrawer';

interface CounterpartyOption {
  id: string;
  name: string;
  type: string;
  debtBalance?: number;
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
  costPrice: number;
  unitOfMeasure?: string;
}

interface ItemRow {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  vatRate: number;
}

interface PurchaseDocumentFormProps {
  initialData?: PurchaseReceipt | null;
  mode: 'create' | 'edit';
}

export function PurchaseDocumentForm({ initialData, mode }: PurchaseDocumentFormProps) {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();
  const router = useRouter();

  // Dropdowns state
  const [counterparties, setCounterparties] = useState<CounterpartyOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);

  // Document Form State
  const [receiptId, setReceiptId] = useState<string | null>(initialData?.id || null);
  const [docNumber, setDocNumber] = useState<string>(initialData?.docNumber || '');
  const [docStatus, setDocStatus] = useState<string>(initialData?.status || 'DRAFT');
  const [paymentStatus, setPaymentStatus] = useState<string>(initialData?.paymentStatus || 'UNPAID');

  const [counterpartyId, setCounterpartyId] = useState(initialData?.counterpartyId || '');
  const [warehouseId, setWarehouseId] = useState(initialData?.warehouseId || '');
  const [docDate, setDocDate] = useState(
    initialData?.docDate ? initialData.docDate.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [currency, setCurrency] = useState(initialData?.currency || 'UZS');
  const [exchangeRate, setExchangeRate] = useState(Number(initialData?.exchangeRate) || 1);
  const [contractNumber, setContractNumber] = useState(initialData?.contractNumber || '');
  const [contractDate, setContractDate] = useState(
    initialData?.contractDate ? initialData.contractDate.slice(0, 10) : ''
  );
  const [comment, setComment] = useState(initialData?.comment || '');

  // GTD fields
  const [showGtd, setShowGtd] = useState(
    Boolean(initialData?.gtdNumber || initialData?.customsPost || initialData?.gtdDate)
  );
  const [gtdNumber, setGtdNumber] = useState(initialData?.gtdNumber || '');
  const [gtdDate, setGtdDate] = useState(initialData?.gtdDate ? initialData.gtdDate.slice(0, 10) : '');
  const [customsPost, setCustomsPost] = useState(initialData?.customsPost || '');

  // Items
  const [items, setItems] = useState<ItemRow[]>(
    initialData?.items && initialData.items.length > 0
      ? initialData.items.map((i) => ({
          productId: i.productId,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
          discount: Number(i.discount) || 0,
          vatRate: Number(i.vatRate) || 0,
        }))
      : [{ productId: '', quantity: 1, unitPrice: 0, discount: 0, vatRate: 12 }]
  );

  // Barcode input
  const [barcodeSearch, setBarcodeSearch] = useState('');

  // Execution states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Action Modals (for POSTED docs)
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [isExpenseOpen, setIsExpenseOpen] = useState(false);
  const [isReturnOpen, setIsReturnOpen] = useState(false);
  const [currentReceiptData, setCurrentReceiptData] = useState<PurchaseReceipt | null>(initialData || null);

  // Quick Add Drawers (for DRAFT creation)
  const [isQuickSupplierOpen, setIsQuickSupplierOpen] = useState(false);
  const [isQuickWarehouseOpen, setIsQuickWarehouseOpen] = useState(false);
  const [isQuickProductOpen, setIsQuickProductOpen] = useState(false);
  const [quickProductSearch, setQuickProductSearch] = useState('');
  const [activeRowIndexForNewProduct, setActiveRowIndexForNewProduct] = useState<number | null>(null);

  const isReadOnly = docStatus === 'POSTED' || docStatus === 'CANCELLED';

  // Mark form as dirty on modification
  const markDirty = () => {
    if (!isDirty) setIsDirty(true);
  };

  const handleSupplierAdded = (newSupplier: { id: string; name: string; type: string; debtBalance?: number }) => {
    markDirty();
    setCounterparties((prev) => [newSupplier, ...prev]);
    setCounterpartyId(newSupplier.id);
  };

  const handleWarehouseAdded = (newWarehouse: { id: string; name: string | Record<string, string> }) => {
    markDirty();
    setWarehouses((prev) => [newWarehouse, ...prev]);
    setWarehouseId(newWarehouse.id);
  };

  const handleProductAdded = (newProduct: {
    id: string;
    name: Record<string, string> | string;
    sku: string;
    barcode?: string;
    costPrice: number;
    salePrice?: number;
    unitOfMeasure?: string;
  }) => {
    markDirty();
    setProducts((prev) => [newProduct, ...prev]);

    if (activeRowIndexForNewProduct !== null && items[activeRowIndexForNewProduct]) {
      const targetIdx = activeRowIndexForNewProduct;
      handleItemChange(targetIdx, 'productId', newProduct.id);
      if (newProduct.costPrice) {
        handleItemChange(targetIdx, 'unitPrice', Number(newProduct.costPrice));
      }
      setActiveRowIndexForNewProduct(null);
    } else {
      const emptyIndex = items.findIndex((i) => !i.productId);
      if (emptyIndex !== -1) {
        handleItemChange(emptyIndex, 'productId', newProduct.id);
        if (newProduct.costPrice) {
          handleItemChange(emptyIndex, 'unitPrice', Number(newProduct.costPrice));
        }
      } else {
        setItems((prev) => [
          ...prev,
          {
            productId: newProduct.id,
            quantity: 1,
            unitPrice: Number(newProduct.costPrice) || 0,
            discount: 0,
            vatRate: 12,
          },
        ]);
      }
    }
    setQuickProductSearch('');
  };

  // Fetch reference lists (Suppliers, Warehouses, Products)
  useEffect(() => {
    if (!token || !company) return;

    Promise.all([
      apiFetch<CounterpartyOption[]>('/sales/counterparties', { token: token || undefined, tenantId: company.id, locale }),
      apiFetch<WarehouseOption[]>('/tenants/warehouses', { token: token || undefined, tenantId: company.id, locale }),
      apiFetch<ProductOption[]>('/inventory/products', { token: token || undefined, tenantId: company.id, locale }),
    ])
      .then(([suppliersRes, warehousesRes, productsRes]) => {
        const suppliers = (suppliersRes || []).filter((c) => c.type === 'SUPPLIER' || c.type === 'BOTH');
        setCounterparties(suppliers);
        if (suppliers.length > 0 && !counterpartyId && !initialData) {
          setCounterpartyId(suppliers[0].id);
        }

        setWarehouses(warehousesRes || []);
        if (warehousesRes && warehousesRes.length > 0 && !warehouseId && !initialData) {
          setWarehouseId(warehousesRes[0].id);
        }

        setProducts(productsRes || []);
      })
      .catch((err) => console.error('Data load error:', err));
  }, [token, company, locale, counterpartyId, warehouseId, initialData]);

  // Unsaved changes window listener
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const getProductName = (name: Record<string, string> | string | null | undefined) => {
    if (!name) return '—';
    if (typeof name === 'string') return name;
    return name[locale] || name.ru || name.uz || Object.values(name)[0] || '—';
  };

  // Add Item Row
  const handleAddItem = () => {
    markDirty();
    setItems((prev) => [
      ...prev,
      { productId: products.length > 0 ? products[0].id : '', quantity: 1, unitPrice: 0, discount: 0, vatRate: 12 },
    ]);
  };

  // Remove Item Row
  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    markDirty();
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Item field change
  const handleItemChange = (index: number, field: keyof ItemRow, value: string | number) => {
    markDirty();
    setItems((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };

      if (field === 'productId') {
        const p = products.find((prod) => prod.id === value);
        if (p) {
          next[index].unitPrice = Number(p.costPrice) || 0;
        }
      }
      return next;
    });
  };

  // Barcode / SKU Add Product with auto-increment and quick-add fallback
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeSearch.trim()) return;

    const term = barcodeSearch.trim().toLowerCase();
    const matched = products.find(
      (p) =>
        (p.sku && p.sku.toLowerCase() === term) ||
        (p.barcode && p.barcode.toLowerCase() === term) ||
        getProductName(p.name).toLowerCase().includes(term)
    );

    if (matched) {
      markDirty();
      // Check if product already exists in item list to increment quantity
      const existingIdx = items.findIndex((i) => i.productId === matched.id);
      if (existingIdx !== -1) {
        handleItemChange(existingIdx, 'quantity', items[existingIdx].quantity + 1);
      } else {
        const emptyIndex = items.findIndex((i) => !i.productId);
        if (emptyIndex !== -1) {
          handleItemChange(emptyIndex, 'productId', matched.id);
        } else {
          setItems((prev) => [
            ...prev,
            { productId: matched.id, quantity: 1, unitPrice: Number(matched.costPrice) || 0, discount: 0, vatRate: 12 },
          ]);
        }
      }
      setBarcodeSearch('');
    } else {
      setQuickProductSearch(barcodeSearch.trim());
      setIsQuickProductOpen(true);
    }
  };

  // Calculations
  const totals = useMemo(() => {
    let subtotal = 0;
    let discountTotal = 0;
    let vatTotal = 0;

    items.forEach((item) => {
      const qty = Number(item.quantity) || 0;
      const price = Number(item.unitPrice) || 0;
      const disc = Number(item.discount) || 0;
      const vatR = Number(item.vatRate) || 0;

      const lineSubtotal = qty * price;
      const lineAfterDiscount = Math.max(0, lineSubtotal - disc);
      const lineVat = (lineAfterDiscount * vatR) / 100;

      subtotal += lineSubtotal;
      discountTotal += disc;
      vatTotal += lineVat;
    });

    const grandTotal = Math.max(0, subtotal - discountTotal) + vatTotal;
    return { subtotal, discount: discountTotal, vat: vatTotal, grandTotal };
  }, [items]);

  // Save Document API call
  const saveDocument = async (): Promise<PurchaseReceipt | null> => {
    if (!token || !company) return null;
    if (!counterpartyId) {
      setError(isRu ? 'Выберите поставщика' : 'Yetkazib beruvchini tanlang');
      return null;
    }
    if (!warehouseId) {
      setError(isRu ? 'Выберите склад' : 'Omborni tanlang');
      return null;
    }
    if (items.some((i) => !i.productId || i.quantity <= 0)) {
      setError(
        isRu
          ? 'Выберите товар и укажите правильное количество во всех строках'
          : 'Barcha qatorlarda tovar tanlanishi va miqdor kiritilishi shart'
      );
      return null;
    }

    setLoading(true);
    setError(null);

    const payload = {
      counterpartyId,
      warehouseId,
      docDate,
      currency,
      exchangeRate,
      contractNumber: contractNumber || undefined,
      contractDate: contractDate || undefined,
      comment: comment || undefined,
      gtdNumber: gtdNumber || undefined,
      gtdDate: gtdDate || undefined,
      customsPost: customsPost || undefined,
      items: items.map((i) => ({
        productId: i.productId,
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        discount: Number(i.discount) || 0,
        vatRate: Number(i.vatRate) || 0,
      })),
    };

    try {
      let saved: PurchaseReceipt;
      if (receiptId) {
        // Update existing receipt
        saved = await apiFetch<PurchaseReceipt>(`/purchases/receipts/${receiptId}`, {
          method: 'PUT',
          token: token || undefined,
          tenantId: company.id,
          locale,
          body: JSON.stringify(payload),
        });
      } else {
        // Create new receipt
        saved = await apiFetch<PurchaseReceipt>('/purchases/receipts', {
          method: 'POST',
          token: token || undefined,
          tenantId: company.id,
          locale,
          body: JSON.stringify(payload),
        });
      }

      if (saved && saved.id) {
        setReceiptId(saved.id);
        setDocNumber(saved.docNumber);
        setCurrentReceiptData(saved);
        setIsDirty(false);
      }
      return saved;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : undefined;
      setError(errMsg || (isRu ? 'Ошибка сохранения документа' : 'Hujjatni saqlashda xatolik yuz berdi'));
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Action Handler: Save Draft
  const handleSaveDraft = async () => {
    const saved = await saveDocument();
    if (saved && mode === 'create') {
      router.push(`/purchases/${saved.id}`);
    }
  };

  // Action Handler: Post Document
  const handlePost = async (andClose: boolean) => {
    const saved = await saveDocument();
    if (!saved) return;

    setLoading(true);
    setError(null);
    try {
      const posted = await apiFetch<PurchaseReceipt>(`/purchases/receipts/${saved.id}/post`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company?.id ? company.id : undefined,
        locale,
      });

      setDocStatus('POSTED');
      if (posted) setCurrentReceiptData(posted);
      setIsDirty(false);

      if (andClose) {
        router.push('/purchases');
      } else {
        router.push(`/purchases/${saved.id}`);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : undefined;
      setError(errMsg || (isRu ? 'Ошибка проведения документа' : 'Hujjatni tasdiqlashda xatolik yuz berdi'));
    } finally {
      setLoading(false);
    }
  };

  // Action Handler: Unpost Document
  const handleUnpost = async () => {
    if (!receiptId || !token || !company) return;

    setLoading(true);
    setError(null);
    try {
      const unposted = await apiFetch<PurchaseReceipt>(`/purchases/receipts/${receiptId}/unpost`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company.id,
        locale,
      });

      setDocStatus('DRAFT');
      if (unposted) setCurrentReceiptData(unposted);
      setIsDirty(false);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : undefined;
      setError(errMsg || (isRu ? 'Ошибка отмены проведения' : 'Tasdiqni bekor qilishda xatolik yuz berdi'));
    } finally {
      setLoading(false);
    }
  };

  // Action Handler: Delete Draft
  const handleDeleteDraft = async () => {
    if (!receiptId || !token || !company || mode !== 'edit' || docStatus !== 'DRAFT') return;
    const confirmed = window.confirm(
      isRu
        ? 'Вы уверены, что хотите удалить этот черновик?'
        : 'Ushbu qoralama hujjatni o‘chirishga ishonchingiz komilmi?'
    );
    if (!confirmed) return;

    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/purchases/receipts/${receiptId}`, {
        method: 'DELETE',
        token: token || undefined,
        tenantId: company.id,
        locale,
      });
      setIsDirty(false);
      router.push('/purchases');
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : undefined;
      setError(
        errMsg ||
          (isRu ? 'Ошибка при удалении черновика' : 'Qoralama hujjatni o‘chirishda xatolik')
      );
    } finally {
      setLoading(false);
    }
  };

  // Back navigation guard
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
    router.push('/purchases');
  };

  const supplierOptions: SelectOption[] = counterparties.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  const warehouseOptions: SelectOption[] = warehouses.map((w) => ({
    value: w.id,
    label: getProductName(w.name),
  }));



  const productOptions: SelectOption[] = products.map((p) => ({
    value: p.id,
    label: `${getProductName(p.name)} ${p.sku ? `(${p.sku})` : ''}`,
  }));

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
      {/* Sticky Top Header & Toolbar */}
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
            <ArrowLeft size={18} /> {isRu ? 'К списку закупок' : 'Xaridlar ro‘yxatiga'}
          </Button>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
                {mode === 'create' && !docNumber
                  ? isRu
                    ? 'Новый приходный документ'
                    : 'Yangi Xarid Hujjati'
                  : `${isRu ? 'Приходный документ' : 'Xarid hujjati'} ${docNumber}`}
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

              {mode === 'edit' && receiptId && (
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
                onClick={() => setIsExpenseOpen(true)}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Receipt size={16} /> {isRu ? 'Доп. расходы' : 'Qo‘shimcha xarajat'}
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

      {/* Document Primary Metadata Form Card */}
      <Card style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}>
          {isRu ? 'Основная информация' : 'Asosiy Hujjat Ma’lumotlari'}
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
          {/* Supplier */}
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Поставщик *' : 'Yetkazib beruvchi *'}
            </label>
            <Select
              options={supplierOptions}
              value={counterpartyId}
              onChange={(val) => { markDirty(); setCounterpartyId(val); }}
              placeholder={isRu ? 'Выберите поставщика' : 'Yetkazib beruvchini tanlang'}
              disabled={isReadOnly}
              onCreateNew={!isReadOnly ? () => setIsQuickSupplierOpen(true) : undefined}
              createNewLabel={isRu ? 'Создать поставщика' : 'Yangi yetkazib beruvchi'}
            />
            {(() => {
              const selectedSupplier = counterparties.find((c) => c.id === counterpartyId);
              if (!selectedSupplier) return null;
              const debt = Number(selectedSupplier.debtBalance || 0);
              return (
                <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: 'var(--text-xs)' }}>
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
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Склад *' : 'Ombor *'}
            </label>
            <Select
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
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Дата документа *' : 'Hujjat Sanasi *'}
            </label>
            <Input
              type="date"
              value={docDate}
              onChange={(e) => { markDirty(); setDocDate(e.target.value); }}
              disabled={isReadOnly}
            />
          </div>

          {/* Contract Number & Date */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                {isRu ? '№ Договора' : 'Shartnoma №'}
              </label>
              <Input
                value={contractNumber}
                onChange={(e) => { markDirty(); setContractNumber(e.target.value); }}
                placeholder="№ 12-A"
                disabled={isReadOnly}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                {isRu ? 'Дата договора' : 'Shartnoma sanasi'}
              </label>
              <Input
                type="date"
                value={contractDate}
                onChange={(e) => { markDirty(); setContractDate(e.target.value); }}
                disabled={isReadOnly}
              />
            </div>
          </div>

          {/* Currency & Exchange Rate */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                {isRu ? 'Валюта' : 'Valyuta'}
              </label>
              <Select
                options={[
                  { value: 'UZS', label: 'UZS (So‘m)' },
                  { value: 'USD', label: 'USD ($)' },
                  { value: 'EUR', label: 'EUR (€)' },
                  { value: 'RUB', label: 'RUB (₽)' },
                ]}
                value={currency}
                onChange={(val) => { markDirty(); setCurrency(val); }}
                disabled={isReadOnly}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                {isRu ? 'Курс валюты' : 'Valyuta kursi'}
              </label>
              <Input
                type="number"
                value={exchangeRate}
                onChange={(e) => { markDirty(); setExchangeRate(Number(e.target.value)); }}
                disabled={isReadOnly}
              />
            </div>
          </div>

          {/* Comment */}
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Комментарий / Примечание' : 'Izoh / Qayd'}
            </label>
            <Input
              value={comment}
              onChange={(e) => { markDirty(); setComment(e.target.value); }}
              placeholder={isRu ? 'Примечание к документу...' : 'Hujjat uchun izoh...'}
              disabled={isReadOnly}
            />
          </div>
        </div>

        {/* Collapsible GTD (Customs) Section */}
        <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 'var(--space-3)' }}>
          <button
            type="button"
            onClick={() => setShowGtd((prev) => !prev)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--color-primary-600)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              padding: 0,
            }}
          >
            {showGtd ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {isRu ? 'Данные ГТД (Таможня)' : 'Bojxona deklaratsiyasi (GTD) ma’lumotlari'}
          </button>

          {showGtd && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  {isRu ? '№ ГТД' : 'GTD №'}
                </label>
                <Input
                  value={gtdNumber}
                  onChange={(e) => { markDirty(); setGtdNumber(e.target.value); }}
                  placeholder="10001010/120826/0012345"
                  disabled={isReadOnly}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  {isRu ? 'Дата ГТД' : 'GTD sanasi'}
                </label>
                <Input
                  type="date"
                  value={gtdDate}
                  onChange={(e) => { markDirty(); setGtdDate(e.target.value); }}
                  disabled={isReadOnly}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                  {isRu ? 'Таможенный пост' : 'Bojxona posti'}
                </label>
                <Input
                  value={customsPost}
                  onChange={(e) => { markDirty(); setCustomsPost(e.target.value); }}
                  placeholder="Toshkent-Avto"
                  disabled={isReadOnly}
                />
              </div>
            </div>
          )}
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

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  setQuickProductSearch('');
                  setIsQuickProductOpen(true);
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <PackagePlus size={14} /> {isRu ? 'Новый товар' : 'Yangi tovar'}
              </Button>
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
                  {isRu ? 'Цена за ед.' : 'Birlik narxi'}
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'right', width: '120px' }}>
                  {isRu ? 'Скидка' : 'Chegirma'}
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'right', width: '90px' }}>
                  {isRu ? 'НДС %' : 'QQS %'}
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'right', width: '120px' }}>
                  {isRu ? 'Сумма НДС' : 'QQS summasi'}
                </th>
                <th style={{ padding: '10px 12px', textAlign: 'right', width: '150px' }}>
                  {isRu ? 'Итого' : 'Jami Summa'}
                </th>
                {!isReadOnly && <th style={{ padding: '10px 12px', textAlign: 'center', width: '50px' }}></th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const qty = Number(item.quantity) || 0;
                const price = Number(item.unitPrice) || 0;
                const disc = Number(item.discount) || 0;
                const vatR = Number(item.vatRate) || 0;

                const lineSubtotal = qty * price;
                const lineAfterDiscount = Math.max(0, lineSubtotal - disc);
                const lineVat = (lineAfterDiscount * vatR) / 100;
                const lineTotal = lineAfterDiscount + lineVat;

                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '10px 12px', color: 'var(--color-text-tertiary)' }}>{idx + 1}</td>
                    
                    {/* Product select */}
                    <td style={{ padding: '10px 12px' }}>
                      <Select
                        options={productOptions}
                        value={item.productId}
                        onChange={(val) => handleItemChange(idx, 'productId', val)}
                        placeholder={isRu ? 'Выберите товар...' : 'Tovarni tanlang...'}
                        disabled={isReadOnly}
                        onCreateNew={
                          !isReadOnly
                            ? (searchQuery) => {
                                setActiveRowIndexForNewProduct(idx);
                                setQuickProductSearch(searchQuery || '');
                                setIsQuickProductOpen(true);
                              }
                            : undefined
                        }
                        createNewLabel={isRu ? 'Создать новый товар' : 'Yangi tovar qo‘shish'}
                      />
                    </td>

                    {/* Quantity */}
                    <td style={{ padding: '10px 12px' }}>
                      <Input
                        type="number"
                        min="0.001"
                        step="any"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(idx, 'quantity', Number(e.target.value))}
                        style={{ textAlign: 'right' }}
                        disabled={isReadOnly}
                      />
                    </td>

                    {/* Unit Price */}
                    <td style={{ padding: '10px 12px' }}>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={item.unitPrice}
                        onChange={(e) => handleItemChange(idx, 'unitPrice', Number(e.target.value))}
                        style={{ textAlign: 'right' }}
                        disabled={isReadOnly}
                      />
                    </td>

                    {/* Discount */}
                    <td style={{ padding: '10px 12px' }}>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={item.discount}
                        onChange={(e) => handleItemChange(idx, 'discount', Number(e.target.value))}
                        style={{ textAlign: 'right' }}
                        disabled={isReadOnly}
                      />
                    </td>

                    {/* VAT Rate */}
                    <td style={{ padding: '10px 12px' }}>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={item.vatRate}
                        onChange={(e) => handleItemChange(idx, 'vatRate', Number(e.target.value))}
                        style={{ textAlign: 'right' }}
                        disabled={isReadOnly}
                      />
                    </td>

                    {/* VAT Amount */}
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 500 }} className="tabular-nums">
                      {formatCurrency(lineVat, locale)}
                    </td>

                    {/* Line Total */}
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600 }} className="tabular-nums">
                      {formatCurrency(lineTotal, locale)}
                    </td>

                    {/* Remove button */}
                    {!isReadOnly && (
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          disabled={items.length <= 1}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: items.length <= 1 ? 'not-allowed' : 'pointer',
                            color: items.length <= 1 ? 'var(--color-text-tertiary)' : '#ef4444',
                            padding: '4px',
                          }}
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

        {!isReadOnly && (
          <Button
            variant="secondary"
            onClick={handleAddItem}
            style={{ width: 'fit-content', display: 'flex', alignItems: 'center', gap: '6px', marginTop: 'var(--space-2)' }}
          >
            <Plus size={16} /> {isRu ? 'Добавить строку' : 'Qator qo‘shish'}
          </Button>
        )}
      </Card>

      {/* Totals Summary Footer Card */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Card style={{ padding: 'var(--space-6)', width: '100%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            <span>{isRu ? 'Сумма товаров:' : 'Tovarlar summasi:'}</span>
            <span className="tabular-nums" style={{ fontWeight: 500 }}>{formatCurrency(totals.subtotal, locale)}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            <span>{isRu ? 'Общая скидка:' : 'Umumiy chegirma:'}</span>
            <span className="tabular-nums" style={{ fontWeight: 500 }}>{formatCurrency(totals.discount, locale)}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            <span>{isRu ? 'НДС total:' : 'QQS total:'}</span>
            <span className="tabular-nums" style={{ fontWeight: 500 }}>{formatCurrency(totals.vat, locale)}</span>
          </div>

          <div style={{ borderTop: '2px solid var(--color-border-light)', paddingTop: 'var(--space-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
              {isRu ? 'ИТОГО К ОПЛАТЕ:' : 'JAMI TO‘LANISHI KERAK:'}
            </span>
            <span style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-primary-600)' }} className="tabular-nums">
              {formatCurrency(totals.grandTotal, locale, currency)}
            </span>
          </div>
        </Card>
      </div>

      {/* Modals for Quick Actions on POSTED receipt */}
      {isPayOpen && currentReceiptData && (
        <PayPurchaseModal
          isOpen={isPayOpen}
          onClose={() => setIsPayOpen(false)}
          receipt={currentReceiptData}
          onSuccess={() => {
            setIsPayOpen(false);
            if (receiptId) {
              apiFetch<PurchaseReceipt>(`/purchases/receipts/${receiptId}`, { token: token || undefined, tenantId: company?.id, locale })
                .then((res) => {
                  if (res) {
                    setPaymentStatus(res.paymentStatus);
                    setCurrentReceiptData(res);
                  }
                })
                .catch((err) => console.error(err));
            }
          }}
        />
      )}

      {isExpenseOpen && currentReceiptData && (
        <AllocateExpenseModal
          isOpen={isExpenseOpen}
          onClose={() => setIsExpenseOpen(false)}
          receipt={currentReceiptData}
          onSuccess={() => {
            setIsExpenseOpen(false);
          }}
        />
      )}

      {isReturnOpen && currentReceiptData && (
        <CreateReturnModal
          isOpen={isReturnOpen}
          onClose={() => setIsReturnOpen(false)}
          receipt={currentReceiptData}
          onSuccess={() => {
            setIsReturnOpen(false);
          }}
        />
      )}

      {/* In-Flight Quick Add Drawers */}
      {isQuickSupplierOpen && (
        <CreateCounterpartyDrawer
          isOpen={isQuickSupplierOpen}
          onClose={() => setIsQuickSupplierOpen(false)}
          defaultType="SUPPLIER"
          onSuccess={handleSupplierAdded}
        />
      )}

      {isQuickWarehouseOpen && (
        <CreateWarehouseDrawer
          isOpen={isQuickWarehouseOpen}
          onClose={() => setIsQuickWarehouseOpen(false)}
          onSuccess={handleWarehouseAdded}
        />
      )}

      {isQuickProductOpen && (
        <CreateProductDrawer
          isOpen={isQuickProductOpen}
          onClose={() => setIsQuickProductOpen(false)}
          initialSkuOrBarcode={quickProductSearch}
          onSuccess={handleProductAdded}
        />
      )}
    </div>
  );
}
