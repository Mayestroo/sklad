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
import { formatCurrency, formatDate, CURRENCY_OPTIONS } from '@/lib/utils';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  RotateCcw,
  Printer,
  Search,
  AlertCircle,
  FileText,
  Building2,
  Warehouse as WarehouseIcon,
  HelpCircle,
  XCircle,
} from 'lucide-react';
import { PurchaseReceipt, PurchaseReturn } from '@shared/types';
import { ReturnActModal } from './ReturnActModal';

interface CounterpartyOption {
  id: string;
  name: string;
  type: string;
  debtBalance?: number;
}

interface WarehouseOption {
  id: string;
  name: string | Record<string, string>;
}

interface ProductOption {
  id: string;
  name: string | Record<string, string>;
  sku: string;
  costPrice: number;
  type?: string;
}

interface ItemRow {
  productId: string;
  productName: string;
  productType: string;
  sku: string;
  quantity: number;
  maxQty?: number;
  unitPrice: number;
  vatRate: number;
  vatAmount: number;
  totalPrice: number;
}

interface PurchaseReturnDocumentFormProps {
  initialData?: PurchaseReturn | null;
  mode: 'create' | 'view';
}

export function PurchaseReturnDocumentForm({ initialData, mode }: PurchaseReturnDocumentFormProps) {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const router = useRouter();
  const { token, company } = useAuth();

  const isReadOnly = mode === 'view';

  // Form State
  const [returnNumber, setReturnNumber] = useState(initialData?.returnNumber || '');
  const [returnDate, setReturnDate] = useState(
    initialData?.returnDate
      ? new Date(initialData.returnDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
  );
  const [counterpartyId, setCounterpartyId] = useState(initialData?.counterpartyId || '');
  const [warehouseId, setWarehouseId] = useState(initialData?.warehouseId || '');
  const [receiptId, setReceiptId] = useState<string>(initialData?.receiptId || '');
  const [currency, setCurrency] = useState(initialData?.currency || 'UZS');
  const [actNumber, setActNumber] = useState(initialData?.actNumber || '');
  const [reason, setReason] = useState(initialData?.reason || '');
  const [comment, setComment] = useState(initialData?.comment || '');
  const [status, setStatus] = useState<string>(initialData?.status || 'DRAFT');

  // Items table
  const [items, setItems] = useState<ItemRow[]>(() => {
    if (initialData?.items && initialData.items.length > 0) {
      return initialData.items.map((i) => ({
        productId: i.productId,
        productName:
          typeof i.product?.name === 'string'
            ? i.product.name
            : i.product?.name?.[locale] || Object.values(i.product?.name || {})[0] || '—',
        productType: i.product?.type || 'PRODUCT',
        sku: i.product?.sku || '',
        quantity: Number(i.quantity),
        unitPrice: Number(i.unitPrice),
        vatRate: Number(i.vatRate || 0),
        vatAmount: Number(i.vatAmount || 0),
        totalPrice: Number(i.totalPrice),
      }));
    }
    return [];
  });

  // Reference Catalogs
  const [counterparties, setCounterparties] = useState<CounterpartyOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [availableReceipts, setAvailableReceipts] = useState<PurchaseReceipt[]>([]);
  const [selectedReceipt, setSelectedReceipt] = useState<PurchaseReceipt | null>(null);

  // Modals & loading
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [isActModalOpen, setIsActModalOpen] = useState(false);

  const getProductName = (name: any) => {
    if (!name) return '—';
    if (typeof name === 'string') return name;
    return name[locale] || name.ru || name.uz || Object.values(name)[0] || '—';
  };

  const REASON_PRESETS = isRu
    ? [
        'Брак / дефект товара',
        'Нарушение условий договора',
        'Излишек при поставке',
        'Несоответствие номенклатуры / пересорт',
        'Повреждение при транспортировке',
        'Другая причина',
      ]
    : [
        'Brak / nuqsonli tovar',
        'Shartnoma shartlari buzilgan',
        'Yetkazib berishdagi ortiqcha kirim',
        'Noto‘g‘ri tovar / sort adashuvi',
        'Tashishda yetkazilgan zarar',
        'Boshqa sabab',
      ];

  // Fetch Counterparties, Warehouses, Products
  useEffect(() => {
    if (!token || !company) return;

    // Counterparties
    apiFetch<CounterpartyOption[]>('/counterparties', { token, tenantId: company.id, locale })
      .then((res) => {
        const suppliers = (res || []).filter(
          (c: any) => c.type === 'SUPPLIER' || c.type === 'BOTH',
        );
        setCounterparties(suppliers);
      })
      .catch((err) => console.error(err));

    // Warehouses
    apiFetch<WarehouseOption[]>('/inventory/warehouses', { token, tenantId: company.id, locale })
      .then((res) => setWarehouses(res || []))
      .catch((err) => console.error(err));

    // Products (Filter only PRODUCT and RAW_MATERIAL)
    apiFetch<any>('/inventory/products', { token, tenantId: company.id, locale })
      .then((res) => {
        const list = Array.isArray(res) ? res : res?.data || res?.items || [];
        const eligible = list.filter(
          (p: any) => p.type === 'PRODUCT' || p.type === 'RAW_MATERIAL' || !p.type,
        );
        setProducts(eligible);
      })
      .catch((err) => console.error(err));
  }, [token, company, locale]);

  // Fetch receipts for supplier & warehouse
  useEffect(() => {
    if (!token || !company || !counterpartyId) return;

    apiFetch<any>('/purchases/receipts', {
      token,
      tenantId: company.id,
      locale,
    })
      .then((res) => {
        const allReceipts: PurchaseReceipt[] = Array.isArray(res)
          ? res
          : res?.data || res?.items || [];
        const filtered = allReceipts.filter(
          (r) =>
            r.counterpartyId === counterpartyId &&
            r.status === 'POSTED' &&
            (!warehouseId || r.warehouseId === warehouseId),
        );
        setAvailableReceipts(filtered);
      })
      .catch((err) => console.error(err));
  }, [token, company, counterpartyId, warehouseId, locale]);

  // Handle Receipt selection
  const handleSelectReceipt = (chosenReceiptId: string) => {
    setReceiptId(chosenReceiptId);
    if (!chosenReceiptId) {
      setSelectedReceipt(null);
      return;
    }

    const found = availableReceipts.find((r) => r.id === chosenReceiptId);
    if (found) {
      setSelectedReceipt(found);
      if (found.warehouseId) setWarehouseId(found.warehouseId);
      if (found.currency) setCurrency(found.currency);

      // Pre-fill items from receipt
      if (found.items && found.items.length > 0) {
        const prefilled: ItemRow[] = found.items
          .filter((i: any) => i.product?.type !== 'SERVICE' && i.product?.type !== 'BUNDLE')
          .map((i: any) => {
            const unreturned = Math.max(
              0,
              Number(i.quantity) - Number(i.returnedQuantity || 0),
            );
            const unitPrice = Number(i.unitPrice);
            const vatRate = Number(i.vatRate || 0);
            const vatAmount = Number(
              ((unreturned * unitPrice * vatRate) / 100).toFixed(2),
            );
            const totalPrice = Number((unreturned * unitPrice + vatAmount).toFixed(2));

            return {
              productId: i.productId,
              productName: getProductName(i.product?.name),
              productType: i.product?.type || 'PRODUCT',
              sku: i.product?.sku || '',
              quantity: unreturned,
              maxQty: unreturned,
              unitPrice,
              vatRate,
              vatAmount,
              totalPrice,
            };
          })
          .filter((row) => (row.maxQty ?? 1) > 0);

        setItems(prefilled);
      }
    }
  };

  // Add Item Row
  const handleAddItem = (productId: string) => {
    const prod = products.find((p) => p.id === productId);
    if (!prod) return;

    // Check if already in table
    const exists = items.find((i) => i.productId === productId);
    if (exists) {
      setError(
        isRu
          ? 'Этот товар уже добавлен в таблицу'
          : 'Ushbu mahsulot allaqachon jadvalga qo‘shilgan',
      );
      return;
    }

    setError('');
    const unitPrice = Number(prod.costPrice || 0);
    const quantity = 1;
    const vatRate = 0;
    const vatAmount = 0;
    const totalPrice = unitPrice * quantity;

    setItems((prev) => [
      ...prev,
      {
        productId,
        productName: getProductName(prod.name),
        productType: prod.type || 'PRODUCT',
        sku: prod.sku,
        quantity,
        unitPrice,
        vatRate,
        vatAmount,
        totalPrice,
      },
    ]);
  };

  const handleUpdateItem = (
    index: number,
    field: 'quantity' | 'unitPrice' | 'vatRate',
    val: number,
  ) => {
    setItems((prev) => {
      const updated = [...prev];
      const row = { ...updated[index] };

      if (field === 'quantity') {
        const q = Math.max(0.001, val);
        if (row.maxQty !== undefined && q > row.maxQty) {
          setError(
            isRu
              ? `Количество возврата (${q}) превышает остаток по накладной (${row.maxQty})`
              : `Qaytarish miqdori (${q}) xariddan qolgan miqdordan (${row.maxQty}) oshishi mumkin emas`,
          );
          row.quantity = row.maxQty;
        } else {
          setError('');
          row.quantity = q;
        }
      } else if (field === 'unitPrice') {
        row.unitPrice = Math.max(0, val);
      } else if (field === 'vatRate') {
        row.vatRate = Math.max(0, val);
      }

      // Recalculate
      const baseTotal = row.quantity * row.unitPrice;
      row.vatAmount = Number(((baseTotal * row.vatRate) / 100).toFixed(2));
      row.totalPrice = Number((baseTotal + row.vatAmount).toFixed(2));

      updated[index] = row;
      return updated;
    });
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Calculations
  const subtotal = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0),
    [items],
  );
  const totalVat = useMemo(
    () => items.reduce((sum, i) => sum + i.vatAmount, 0),
    [items],
  );
  const totalAmount = useMemo(
    () => Number((subtotal + totalVat).toFixed(2)),
    [subtotal, totalVat],
  );

  const selectedSupplier = counterparties.find((c) => c.id === counterpartyId);
  const currentSupplierDebt = Number(selectedSupplier?.debtBalance || 0);
  const projectedSupplierDebt = currentSupplierDebt - totalAmount;

  // Submit Handler
  const handleSave = async (targetStatus: 'DRAFT' | 'POSTED') => {
    setError('');

    if (!counterpartyId) {
      setError(isRu ? 'Выберите поставщика' : 'Yetkazib beruvchini tanlang');
      return;
    }
    if (!warehouseId) {
      setError(isRu ? 'Выберите склад' : 'Omborni tanlang');
      return;
    }
    if (items.length === 0) {
      setError(
        isRu
          ? 'Добавьте хотя бы один товар для возврата'
          : 'Kamida bitta tovar qo‘shing',
      );
      return;
    }

    setSaving(true);
    try {
      const payload = {
        receiptId: receiptId || undefined,
        counterpartyId,
        warehouseId,
        returnDate,
        currency,
        actNumber: actNumber || undefined,
        reason: reason || undefined,
        comment: comment || undefined,
        status: targetStatus,
        items: items.map((i) => ({
          productId: i.productId,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          vatRate: i.vatRate,
          vatAmount: i.vatAmount,
        })),
      };

      const result = await apiFetch<PurchaseReturn>('/purchases/returns', {
        token: token || undefined,
        tenantId: company?.id || undefined,
        locale,
        method: 'POST',
        body: JSON.stringify(payload),
      });

      router.push('/purchases/returns');
    } catch (err: any) {
      setError(err?.message || (isRu ? 'Ошибка при сохранении возврата' : 'Qaytarishni saqlashda xatolik'));
    } finally {
      setSaving(false);
    }
  };

  // Approve Draft Return (in view mode)
  const handleApprove = async () => {
    if (!initialData?.id) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/purchases/returns/${initialData.id}/approve`, {
        token: token || undefined,
        tenantId: company?.id || undefined,
        locale,
        method: 'POST',
      });
      setStatus('POSTED');
      router.push('/purchases/returns');
    } catch (err: any) {
      setError(err?.message || (isRu ? 'Ошибка при утверждении' : 'Tasdiqlashda xatolik'));
    } finally {
      setSaving(false);
    }
  };

  // Cancel Return (in view mode)
  const handleCancel = async () => {
    if (!initialData?.id) return;
    if (
      !window.confirm(
        isRu
          ? 'Вы действительно хотите отменить этот возврат?'
          : 'Ushbu qaytarish hujjatini bekor qilishni tasdiqlaysizmi?',
      )
    ) {
      return;
    }

    setSaving(true);
    setError('');
    try {
      await apiFetch(`/purchases/returns/${initialData.id}/cancel`, {
        token: token || undefined,
        tenantId: company?.id || undefined,
        locale,
        method: 'POST',
      });
      setStatus('CANCELLED');
      router.push('/purchases/returns');
    } catch (err: any) {
      setError(err?.message || (isRu ? 'Ошибка при отмене' : 'Bekor qilishda xatolik'));
    } finally {
      setSaving(false);
    }
  };

  const supplierSelectOptions: SelectOption[] = counterparties.map((c) => ({
    value: c.id,
    label: `${c.name} (${formatCurrency(Number(c.debtBalance || 0), locale, currency)})`,
  }));

  const warehouseSelectOptions: SelectOption[] = warehouses.map((w) => ({
    value: w.id,
    label: getProductName(w.name),
  }));

  const receiptSelectOptions: SelectOption[] = [
    { value: '', label: isRu ? '— Без накладной (С нуля) —' : '— Xaridsiz (Noldan mustaqil) —' },
    ...availableReceipts.map((r) => ({
      value: r.id,
      label: `№ ${r.docNumber} (${formatDate(r.docDate, locale)}) — ${formatCurrency(Number(r.totalAmount), locale, r.currency)}`,
    })),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', paddingBottom: '80px' }}>
      {/* Top Navigation & Status Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Button
            variant="ghost"
            onClick={() => router.push('/purchases/returns')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowLeft size={16} /> {isRu ? 'Назад к возвратам' : 'Qaytarishlar ro‘yxatiga'}
          </Button>
          <div>
            <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, margin: 0 }}>
              {isReadOnly
                ? `${isRu ? 'Документ возврата №' : 'Qaytarish hujjati №'} ${returnNumber}`
                : isRu
                ? 'Новый возврат поставщику'
                : 'Yetkazib beruvchiga yangi qaytarish'}
            </h1>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              {isRu
                ? 'Оформление возврата ТМЦ, списание со склада и взаиморасчеты с контрагентом'
                : 'Tovarlarni qaytarish, ombordan hisobdan chiqarish va kontragent balansi qayta hisobi'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {status === 'DRAFT' && <Badge variant="neutral">{isRu ? 'Черновик' : 'Qoralama'}</Badge>}
          {status === 'POSTED' && <Badge variant="success">{isRu ? 'Проведён' : 'Tasdiqlangan'}</Badge>}
          {status === 'CANCELLED' && <Badge variant="error">{isRu ? 'Отменён' : 'Bekor qilingan'}</Badge>}

          {isReadOnly && (
            <Button
              variant="secondary"
              onClick={() => setIsActModalOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Printer size={16} /> {isRu ? 'Печать акта' : 'Aktni chop etish'}
            </Button>
          )}

          {isReadOnly && status === 'DRAFT' && (
            <Button
              variant="primary"
              onClick={handleApprove}
              disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <CheckCircle2 size={16} /> {isRu ? 'Провести возврат' : 'Tasdiqlash'}
            </Button>
          )}

          {isReadOnly && status !== 'CANCELLED' && (
            <Button
              variant="danger"
              onClick={handleCancel}
              disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <XCircle size={16} /> {isRu ? 'Отменить' : 'Bekor qilish'}
            </Button>
          )}
        </div>
      </div>

      {/* Error notification */}
      {error && (
        <Card style={{ padding: 'var(--space-4)', backgroundColor: 'rgba(239, 68, 68, 0.08)', borderColor: '#ef4444', color: '#ef4444', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertCircle size={20} />
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 500 }}>{error}</span>
        </Card>
      )}

      {/* Primary Metadata Form */}
      <Card style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {isRu ? 'Основные реквизиты' : 'Asosiy rekvizitlar'}
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
          {/* Supplier */}
          <div>
            <Select
              label={isRu ? 'Поставщик *' : 'Yetkazib beruvchi *'}
              options={supplierSelectOptions}
              value={counterpartyId}
              onChange={(val) => setCounterpartyId(val)}
              disabled={isReadOnly}
              placeholder={isRu ? 'Выберите поставщика' : 'Yetkazib beruvchini tanlang'}
            />
            {selectedSupplier && (
              <div style={{ fontSize: 'var(--text-xs)', marginTop: '4px', color: currentSupplierDebt > 0 ? 'var(--color-danger-600)' : 'var(--color-success-600)' }}>
                {isRu ? 'Текущий долг: ' : 'Joriy qarzdorlik: '}
                <strong>{formatCurrency(currentSupplierDebt, locale, currency)}</strong>
              </div>
            )}
          </div>

          {/* Warehouse */}
          <div>
            <Select
              label={isRu ? 'Склад списания *' : 'Chiqim ombori *'}
              options={warehouseSelectOptions}
              value={warehouseId}
              onChange={(val) => setWarehouseId(val)}
              disabled={isReadOnly}
              placeholder={isRu ? 'Выберите склад' : 'Omborni tanlang'}
            />
          </div>

          {/* Source Purchase Receipt (Optional) */}
          <div>
            <Select
              label={isRu ? 'Основание (Документ закупки)' : 'Asos (Xarid hujjati)'}
              options={receiptSelectOptions}
              value={receiptId}
              onChange={handleSelectReceipt}
              disabled={isReadOnly || !counterpartyId}
              placeholder={isRu ? 'Выберите накладную или оставьте пустым' : 'Xaridni tanlang yoki bo‘sh qoldiring'}
            />
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
              {receiptId
                ? isRu
                  ? 'Товары и цены автозаполнены из закупки'
                  : 'Tovarlar va narxlar xarid hujjatidan yuklandi'
                : isRu
                ? 'Возврат без привязки к конкретной накладной'
                : 'Noldan mustaqil qaytarish tartibi'}
            </div>
          </div>

          {/* Return Date */}
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Дата возврата *' : 'Qaytarish sanasi *'}
            </label>
            <DatePicker
              value={returnDate}
              onChange={(val) => setReturnDate(val)}
              disabled={isReadOnly}
            />
          </div>
        </div>

        {/* Second Row: Reason, Act Number, Currency */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)', marginTop: '8px' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
              {isRu ? 'Причина возврата' : 'Qaytarish sababi'}
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={isReadOnly}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-light)',
                  backgroundColor: 'var(--color-bg-primary)',
                  color: 'var(--color-text-primary)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                <option value="">{isRu ? '— Выберите причину —' : '— Sababni tanlang —'}</option>
                {REASON_PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Input
              label={isRu ? 'Номер акта возврата / претензии' : 'Qaytarish akti / da’vo raqami'}
              value={actNumber}
              onChange={(e) => setActNumber(e.target.value)}
              disabled={isReadOnly}
              placeholder={isRu ? 'Напр: АКТ-042' : 'Masalan: AKT-042'}
            />
          </div>

          <div>
            <Select
              label={isRu ? 'Валюта' : 'Valyuta'}
              options={CURRENCY_OPTIONS}
              value={currency}
              onChange={(val) => setCurrency(val)}
              disabled={isReadOnly}
            />
          </div>
        </div>

        <div>
          <Input
            label={isRu ? 'Дополнительные примечания / Изъяны' : 'Qo‘shimcha izoh / Kamchiliklar'}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={isReadOnly}
            placeholder={isRu ? 'Опишите характер брака или дефекта...' : 'Brak yoki nuqson tafsilotlarini yozing...'}
          />
        </div>
      </Card>

      {/* Items Table Card */}
      <Card style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0 }}>
              {isRu ? 'Номенклатура к возврату' : 'Qaytarilayotgan nomenklatura'}
            </h3>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
              {isRu
                ? 'Разрешены только товары [Товар] и сырье [Сырье]. Услуги исключены.'
                : 'Faqat moddiy tovarlar [Tovar] va xomashyo [Xomashyo] qaytariladi.'}
            </div>
          </div>

          {!isReadOnly && !receiptId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '300px' }}>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleAddItem(e.target.value);
                    e.target.value = '';
                  }
                }}
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border-light)',
                  backgroundColor: 'var(--color-bg-primary)',
                  color: 'var(--color-text-primary)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                <option value="">{isRu ? '+ Добавить позицию...' : '+ Tovar yoki xomashyo qo‘shish...'}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.type === 'RAW_MATERIAL' ? (isRu ? 'Сырье' : 'Xomashyo') : (isRu ? 'Tovar' : 'Tovar')}] {getProductName(p.name)} {p.sku ? `(${p.sku})` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-light)', backgroundColor: 'var(--color-bg-subtle)' }}>
                <th style={{ padding: '10px 12px', textAlign: 'center', width: '40px' }}>№</th>
                <th style={{ padding: '10px 12px', textAlign: 'left' }}>{isRu ? 'Наименование' : 'Nomi'}</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', width: '100px' }}>{isRu ? 'Тип' : 'Turi'}</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', width: '120px' }}>{isRu ? 'Кол-во' : 'Miqdor'}</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', width: '140px' }}>{isRu ? 'Цена возврата' : 'Qaytarish narxi'}</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', width: '90px' }}>{isRu ? 'НДС %' : 'QQS %'}</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', width: '130px' }}>{isRu ? 'Сумма НДС' : 'QQS summasi'}</th>
                <th style={{ padding: '10px 12px', textAlign: 'right', width: '150px' }}>{isRu ? 'Итого' : 'Jami'}</th>
                {!isReadOnly && <th style={{ padding: '10px 12px', textAlign: 'center', width: '50px' }} />}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={isReadOnly ? 8 : 9} style={{ padding: '32px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                    {isRu
                      ? 'Нет добавленных позиций для возврата'
                      : 'Hozircha qaytariladigan pozitsiyalar qo‘shilmadi'}
                  </td>
                </tr>
              ) : (
                items.map((row, idx) => (
                  <tr key={row.productId} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '10px 12px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 600 }}>{row.productName}</div>
                      {row.sku && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', fontFamily: 'monospace' }}>
                          SKU: {row.sku}
                        </div>
                      )}
                      {row.maxQty !== undefined && (
                        <div style={{ fontSize: '11px', color: 'var(--color-primary-600)', marginTop: '2px' }}>
                          {isRu ? `Доступно по накладной: ${row.maxQty}` : `Xarid bo‘yicha qoldiq: ${row.maxQty}`}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '4px',
                          backgroundColor:
                            row.productType === 'RAW_MATERIAL'
                              ? 'var(--color-success-50)'
                              : 'var(--color-primary-50)',
                          color:
                            row.productType === 'RAW_MATERIAL'
                              ? 'var(--color-success-600)'
                              : 'var(--color-primary-600)',
                        }}
                      >
                        {row.productType === 'RAW_MATERIAL'
                          ? isRu
                            ? 'Сырье'
                            : 'Xomashyo'
                          : isRu
                          ? 'Товар'
                          : 'Tovar'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      {isReadOnly ? (
                        <span style={{ fontWeight: 700 }}>{row.quantity}</span>
                      ) : (
                        <input
                          type="number"
                          step="any"
                          min="0.001"
                          max={row.maxQty}
                          value={row.quantity}
                          onChange={(e) => handleUpdateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                          style={{
                            width: '90px',
                            padding: '6px 8px',
                            textAlign: 'right',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--color-border-light)',
                            backgroundColor: 'var(--color-bg-primary)',
                            color: 'var(--color-text-primary)',
                            fontWeight: 700,
                          }}
                        />
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      {isReadOnly ? (
                        formatCurrency(row.unitPrice, locale, currency)
                      ) : (
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={row.unitPrice}
                          onChange={(e) => handleUpdateItem(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                          style={{
                            width: '110px',
                            padding: '6px 8px',
                            textAlign: 'right',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--color-border-light)',
                            backgroundColor: 'var(--color-bg-primary)',
                            color: 'var(--color-text-primary)',
                          }}
                        />
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      {isReadOnly ? (
                        `${row.vatRate}%`
                      ) : (
                        <select
                          value={row.vatRate}
                          onChange={(e) => handleUpdateItem(idx, 'vatRate', parseFloat(e.target.value) || 0)}
                          style={{
                            padding: '6px 4px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--color-border-light)',
                            backgroundColor: 'var(--color-bg-primary)',
                            color: 'var(--color-text-primary)',
                            fontSize: 'var(--text-xs)',
                          }}
                        >
                          <option value="0">0%</option>
                          <option value="12">12%</option>
                        </select>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                      {formatCurrency(row.vatAmount, locale, currency)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>
                      {formatCurrency(row.totalPrice, locale, currency)}
                    </td>
                    {!isReadOnly && (
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveItem(idx)}
                          style={{ color: 'var(--color-danger-500)', padding: '4px' }}
                        >
                          <Trash2 size={16} />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Summary Totals and Actions Footer */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-6)' }}>
        {/* Counterparty Settlement Impact Card */}
        <Card style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <h4 style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            {isRu ? 'Взаиморасчеты с контрагентом' : 'Kontragent hisob-kitobi'}
          </h4>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
            <span>{isRu ? 'Текущий долг перед поставщиком:' : 'Yetkazib beruvchiga joriy qarz:'}</span>
            <span style={{ fontWeight: 600 }}>{formatCurrency(currentSupplierDebt, locale, currency)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', color: 'var(--color-danger-600)' }}>
            <span>{isRu ? 'Сумма возврата (уменьшение долга):' : 'Qaytarish summasi (qarz kamayishi):'}</span>
            <span style={{ fontWeight: 600 }}>- {formatCurrency(totalAmount, locale, currency)}</span>
          </div>
          <div style={{ height: '1px', backgroundColor: 'var(--color-border-light)', margin: '4px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)', fontWeight: 700 }}>
            <span>{isRu ? 'Остаток долга после проведения:' : 'Tasdiqlangandan so‘ng qarz:'}</span>
            <span style={{ color: projectedSupplierDebt >= 0 ? 'var(--color-text-primary)' : 'var(--color-success-600)' }}>
              {formatCurrency(projectedSupplierDebt, locale, currency)}
              {projectedSupplierDebt < 0 && (
                <span style={{ fontSize: '11px', display: 'block', color: 'var(--color-success-600)', fontWeight: 500 }}>
                  ({isRu ? 'Аванс поставщику' : 'Yetkazib beruvchiga avans'})
                </span>
              )}
            </span>
          </div>
        </Card>

        {/* Totals & Submit */}
        <Card style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>{isRu ? 'Сумма без НДС:' : 'QQSsiz summa:'}</span>
            <span style={{ fontWeight: 600 }}>{formatCurrency(subtotal, locale, currency)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
            <span style={{ color: 'var(--color-text-secondary)' }}>{isRu ? 'Сумма НДС:' : 'QQS summasi:'}</span>
            <span style={{ fontWeight: 600 }}>{formatCurrency(totalVat, locale, currency)}</span>
          </div>
          <div style={{ height: '1px', backgroundColor: 'var(--color-border-light)', margin: '4px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-lg)', fontWeight: 800, color: 'var(--color-primary-600)' }}>
            <span>{isRu ? 'ИТОГО К ВОЗВРАТУ:' : 'JAMI QAYTARISH:'}</span>
            <span>{formatCurrency(totalAmount, locale, currency)}</span>
          </div>

          {!isReadOnly && (
            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <Button
                variant="secondary"
                onClick={() => handleSave('DRAFT')}
                disabled={saving}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <Save size={16} /> {isRu ? 'Сохранить черновик' : 'Qoralama saqlash'}
              </Button>
              <Button
                variant="primary"
                onClick={() => handleSave('POSTED')}
                disabled={saving}
                style={{ flex: 1.2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
              >
                <CheckCircle2 size={16} /> {isRu ? 'Сохранить и провести' : 'Saqlash va Tasdiqlash'}
              </Button>
            </div>
          )}
        </Card>
      </div>

      {/* Printable Act Modal */}
      {isActModalOpen && (
        <ReturnActModal
          isOpen={isActModalOpen}
          onClose={() => setIsActModalOpen(false)}
          purchaseReturn={
            initialData || {
              id: 'preview',
              tenantId: company?.id || '',
              returnNumber: returnNumber || 'RET-DRAFT',
              returnDate,
              counterpartyId,
              warehouseId,
              currency,
              actNumber,
              reason,
              comment,
              status: status as any,
              totalAmount,
              createdAt: new Date().toISOString(),
              counterparty: selectedSupplier,
              warehouse: warehouses.find((w) => w.id === warehouseId),
              receipt: selectedReceipt || undefined,
              items: items.map((i, idx) => ({
                id: `item-${idx}`,
                returnId: 'preview',
                productId: i.productId,
                quantity: i.quantity,
                unitPrice: i.unitPrice,
                vatRate: i.vatRate,
                vatAmount: i.vatAmount,
                totalPrice: i.totalPrice,
                product: { id: i.productId, name: i.productName, sku: i.sku, type: i.productType },
              })),
            }
          }
        />
      )}
    </div>
  );
}
