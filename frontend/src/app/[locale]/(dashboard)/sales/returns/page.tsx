'use client';

import { quantityWithUnit } from '@/lib/units';
import { QuantityInput } from '@/components/ui/QuantityInput';
import { useState, useMemo, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale, useTranslations } from 'next-intl';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchField } from '@/components/ui/SearchField';
import { EmptyState } from '@/components/ui/EmptyState';
import { ActionsMenu } from '@/components/production/ActionsMenu';
import { usePersistentState } from '@/lib/usePersistentState';
import { totalsByCurrency } from '@/lib/currency-totals';
import { CurrencyTotals } from '@/components/ui/list/ListKit';
import { ColumnChooser, FilterBar, periodRange, useFilterState, type FilterDef } from '@/components/ui/filters';
import { StatCard, StatCardGrid } from '@/components/ui/stats/StatCard';
import { DataTable, type Column, type SortState } from '@/components/ui/list/DataTable';
import { apiFetch } from '@/lib/api';
import { useApiQuery, useInvalidateApi } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { salesReturnHeaderFromInvoice } from '@/lib/sales-return';
import { formatCurrency, formatCurrencyIfAvailable, formatDate, formatPercent, errorMessage, type LocalizedName } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { Badge } from '@/components/ui/Badge';
import {
  RotateCcw,
  Plus,
  AlertTriangle,
  Barcode,
  CheckCircle2,
  ShieldCheck,
  XCircle,
  PackageCheck, Trash2 } from 'lucide-react';
import { useConfirm } from '@/context/ConfirmContext';
import { toast } from '@/context/ToastContext';
import { localIsoDate } from '@/lib/date-range';

interface SalesReturnRow {
  id: string;
  returnNumber: string;
  returnDate: string;
  counterpartyId: string;
  warehouseId: string;
  defectWarehouseId?: string;
  counterparty?: { id: string; name: string };
  warehouse?: { id: string; name: LocalizedName };
  defectWarehouse?: { id: string; name: LocalizedName };
  invoice?: { id: string; invoiceNumber: string; totalAmount: number };
  totalAmount: number;
  totalCogs: number;
  currency: string;
  reason?: string;
  status: 'DRAFT' | 'POSTED' | 'CANCELLED';
  items?: Array<{
    id: string;
    productId: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    unitCogs?: number;
    isDefective?: boolean;
    product?: { name: LocalizedName; sku: string; barcode?: string };
  }>;
  createdBy?: { id: string; firstName: string; lastName: string };
}

interface CounterpartyItem {
  id: string;
  name: string;
}

interface WarehouseItem {
  id: string;
  name: LocalizedName;
  isDefect?: boolean;
}

interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  counterpartyId: string;
  warehouseId: string;
  totalAmount: number;
  currency: string;
}

interface ReturnableItemRow {
  productId: string;
  productName: LocalizedName;
  sku?: string;
  barcode?: string;
  unit?: string;
  soldQuantity: number;
  returnedQuantity: number;
  returnableQuantity: number;
  quantity: number;
  /** Source line net unit price (after discount, before VAT). */
  unitPrice: number;
  /** Source line discount percentage, already applied in unitPrice. */
  discount: number;
  /** Net price plus VAT per unit: what the customer is credited. */
  unitTotalPrice: number;
  isDefective: boolean;
}

const FILTER_DEFAULTS = { status: '', period: '' };

export default function SalesReturnsPage() {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const tIn = useTranslations('rd.inline');
  const confirm = useConfirm();

  const invalidateApi = useInvalidateApi();
  const returnsQuery = useApiQuery<SalesReturnRow[]>('/sales/returns');
  const returns = useMemo(() => returnsQuery.data ?? [], [returnsQuery.data]);
  const counterparties = useApiQuery<CounterpartyItem[]>('/sales/counterparties').data ?? [];
  const warehouses = useApiQuery<WarehouseItem[]>('/tenants/warehouses').data ?? [];
  const invoicesQuery = useApiQuery<InvoiceItem[]>('/sales/invoices?status=POSTED');
  const invoices = useMemo(() => invoicesQuery.data ?? [], [invoicesQuery.data]);

  // Filters live in the URL and are remembered per user; the list is filtered here.
  const lf = useFilterState('sreturns.list', FILTER_DEFAULTS);
  const searchQuery = lf.search.trim();
  const statusFilter = lf.values.status;

  // Create Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [counterpartyId, setCounterpartyId] = useState('');
  // The user's choice; until they choose, the tenant's defect warehouse
  // (or the second warehouse) is used.
  const [defectWarehouseChoice, setDefectWarehouseId] = useState('');
  const defaultDefectWarehouseId =
    warehouses.find((w) => w.isDefect || (typeof w.name === 'string' && w.name.toLowerCase().includes('brak')))?.id ??
    (warehouses.length > 1 ? warehouses[1].id : '');
  const defectWarehouseId = defectWarehouseChoice || defaultDefectWarehouseId;
  const [invoiceId, setInvoiceId] = useState('');
  // A return is booked in the invoice's own warehouse and currency
  const selectedInvoice = invoices.find((inv) => inv.id === invoiceId);
  const returnCurrency = selectedInvoice?.currency;
  const [returnDate, setReturnDate] = useState(localIsoDate(new Date()));
  const [reason, setReason] = useState('');
  const [items, setItems] = useState<ReturnableItemRow[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  // Bumped on every invoice change, so a late answer for an earlier invoice
  // never replaces the items of the current one.
  const itemsRequest = useRef(0);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Barcode scanner in create drawer
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeNotice, setBarcodeNotice] = useState<string | null>(null);
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // View Details Modal state
  const [selectedReturn, setSelectedReturn] = useState<SalesReturnRow | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Action states
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Delete state
  const [deleteConfirmReturn, setDeleteConfirmReturn] = useState<SalesReturnRow | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteReturn = async () => {
    if (!token || !company || !deleteConfirmReturn) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await apiFetch(`/sales/returns/${deleteConfirmReturn.id}`, {
        method: 'DELETE',
        token,
        tenantId: company.id,
        locale,
      });
      setDeleteConfirmReturn(null);
      void invalidateApi('/sales/returns');
    } catch (err) {
      setDeleteError(errorMessage(err) || (isRu ? 'Ошибка удаления возврата' : "Qaytarishni o'chirishda xatolik"));
    } finally {
      setDeleteLoading(false);
    }
  };

  const getLocalizedName = (name: LocalizedName | null | undefined) => {
    if (!name) return '—';
    if (typeof name === 'string') return name;
    return name[locale] || name.ru || name.uz || Object.values(name)[0] || '—';
  };

  const REASON_PRESETS = isRu
    ? ['Брак / дефект товара', 'Срок годности истек', 'Неправильный размер / артикул', 'Отказ клиента', 'Повреждение при доставке', 'Другое']
    : ['Brak / nuqsonli tovar', 'Yaroqlilik muddati o\'tgan', 'Noto\'g\'ri o\'lcham / tovar', 'Mijoz rad etdi', 'Yetkazib berishda shikastlangan', 'Boshqa'];

  // Choosing an invoice in the create form loads its returnable items into
  // the editable list (event-driven, so typed quantities are never replaced
  // by a background reload).
  const handleInvoiceChange = (nextInvoiceId: string) => {
    setInvoiceId(nextInvoiceId);
    const request = ++itemsRequest.current;
    setItems([]);
    setFormError(null);
    if (!nextInvoiceId || !token || !company) {
      setLoadingItems(false);
      return;
    }

    setLoadingItems(true);
    apiFetch<Array<Omit<ReturnableItemRow, 'quantity' | 'isDefective' | 'discount'> & { discount?: number }>>(`/sales/invoices/${nextInvoiceId}/returnable-items`, {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => {
        if (request !== itemsRequest.current) return;
        if (res && res.length > 0) {
          setItems(
            res.map((i) => ({
              productId: i.productId,
              productName: i.productName,
              sku: i.sku,
              barcode: i.barcode,
              unit: i.unit,
              soldQuantity: Number(i.soldQuantity),
              returnedQuantity: Number(i.returnedQuantity),
              returnableQuantity: Number(i.returnableQuantity),
              quantity: 0,
              unitPrice: Number(i.unitPrice),
              discount: Number(i.discount ?? 0),
              unitTotalPrice: Number(i.unitTotalPrice),
              isDefective: false,
            }))
          );
        } else {
          setItems([]);
        }
      })
      .catch((err) => {
        if (request !== itemsRequest.current) return;
        setFormError(err?.message || (isRu ? 'Ошибка загрузки товаров' : 'Tovarlarni yuklashda xatolik'));
      })
      .finally(() => {
        if (request === itemsRequest.current) setLoadingItems(false);
      });
  };

  // Handle counterparty change: auto-filter or clear invoice
  const handleCounterpartyChange = (cpId: string) => {
    setCounterpartyId(cpId);
    handleInvoiceChange('');
  };

  const handleQtyChange = (idx: number, val: number) => {
    setItems((prev) => {
      const next = [...prev];
      const max = next[idx].returnableQuantity;
      next[idx] = {
        ...next[idx],
        quantity: Math.max(0, Math.min(max, val)),
      };
      return next;
    });
  };

  const toggleDefective = (idx: number) => {
    setItems((prev) => {
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        isDefective: !next[idx].isDefective,
      };
      return next;
    });
  };

  // Barcode rapid scan (+1)
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = barcodeInput.trim();
    if (!query) return;

    const idx = items.findIndex(
      (it) => it.barcode === query || it.sku?.toLowerCase() === query.toLowerCase()
    );

    if (idx === -1) {
      setBarcodeNotice(isRu ? `Штрих-код "${query}" не найден в накладной` : `"${query}" shtrix-kodi ushbu sotuvda topilmadi`);
      setTimeout(() => setBarcodeNotice(null), 3000);
      setBarcodeInput('');
      return;
    }

    const currentItem = items[idx];
    if (currentItem.quantity >= currentItem.returnableQuantity) {
      setBarcodeNotice(isRu ? `Лимит возврата для "${getLocalizedName(currentItem.productName)}" исчерпан (${currentItem.returnableQuantity})` : `"${getLocalizedName(currentItem.productName)}" uchun qaytarish limiti (${currentItem.returnableQuantity}) to'ldi`);
      setTimeout(() => setBarcodeNotice(null), 3000);
      setBarcodeInput('');
      return;
    }

    handleQtyChange(idx, currentItem.quantity + 1);
    setBarcodeNotice(isRu ? `+1 добавлено: ${getLocalizedName(currentItem.productName)}` : `+1 qo'shildi: ${getLocalizedName(currentItem.productName)}`);
    setTimeout(() => setBarcodeNotice(null), 2500);
    setBarcodeInput('');
  };

  // VAT-inclusive, like the posted return (plan T3.6).
  const totalReturnAmount = items.reduce((s, i) => s + i.quantity * i.unitTotalPrice, 0);
  const hasDefectiveItems = items.some((i) => i.isDefective && i.quantity > 0);

  const handleSubmit = async (submitStatus: 'DRAFT' | 'POSTED') => {
    if (!token || !company) return;
    if (!counterpartyId) { setFormError(isRu ? 'Выберите клиента' : 'Mijozni tanlang'); return; }
    if (!selectedInvoice) { setFormError(isRu ? 'Выберите исходную продажу' : 'Asl sotuv fakturasini tanlang'); return; }

    const activeItems = items.filter((i) => i.quantity > 0);
    if (activeItems.length === 0) {
      setFormError(isRu ? 'Укажите количество хотя бы для одного товара' : 'Kamida bitta tovar uchun qaytarish miqdorini kiriting');
      return;
    }

    setFormLoading(true);
    setFormError(null);

    try {
      await apiFetch('/sales/returns', {
        method: 'POST',
        token: token || undefined,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          ...salesReturnHeaderFromInvoice(selectedInvoice),
          defectWarehouseId: hasDefectiveItems ? defectWarehouseId : undefined,
          returnDate,
          reason: reason || undefined,
          status: submitStatus,
          items: activeItems.map((i) => ({
            productId: i.productId,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            isDefective: i.isDefective,
          })),
        }),
      });

      setShowCreateModal(false);
      setReason('');
      handleInvoiceChange('');
      void invalidateApi('/sales/returns');
    } catch (err) {
      setFormError(errorMessage(err) || (isRu ? 'Произошла ошибка при создании' : 'Qaytarishni yaratishda xatolik yuz berdi'));
    } finally {
      setFormLoading(false);
    }
  };

  // Confirm a DRAFT return
  const handleConfirmReturn = async (retId: string) => {
    if (!token || !company) return;
    setActionLoadingId(retId);
    try {
      await apiFetch(`/sales/returns/${retId}/confirm`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company.id,
        locale,
      });
      toast.success(isRu ? 'Возврат успешно подтвержден' : 'Qaytarish muvaffaqiyatli tasdiqlandi');
      void invalidateApi('/sales/returns');
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка при подтверждении' : 'Tasdiqlashda xatolik yuz berdi'));
    } finally {
      setActionLoadingId(null);
    }
  };

  // Cancel a return (draft void or posted rollback)
  const handleCancelReturn = async (ret: SalesReturnRow) => {
    if (!token || !company) return;
    const confirmed = await confirm({
      title: isRu ? 'Отмена возврата' : 'Qaytarishni bekor qilish',
      description: ret.status === 'POSTED'
        ? (isRu ? 'Вы уверены, что хотите отменить проведенный возврат? Остатки на складе и долг клиента будут восстановлены.' : 'Haqiqatan ham tasdiqlangan qaytarishni bekor qilmoqchimisiz? Ombor qoldig\'i va mijoz qarzi qayta tiklanadi.')
        : (isRu ? 'Вы уверены, что хотите аннулировать этот черновик?' : 'Haqiqatan ham ushbu qoralamani bekor qilmoqchimisiz?'),
      variant: 'warning',
      confirmText: isRu ? 'Да' : 'Ha',
      cancelText: isRu ? 'Нет' : 'Yo‘q',
    });

    if (!confirmed) return;

    setActionLoadingId(ret.id);
    try {
      await apiFetch(`/sales/returns/${ret.id}/cancel`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company.id,
        locale,
      });
      toast.success(isRu ? 'Возврат успешно отменен' : 'Qaytarish muvaffaqiyatli bekor qilindi');
      void invalidateApi('/sales/returns');
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка при отмене' : 'Bekor qilishda xatolik yuz berdi'));
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filtered invoices by counterparty
  const filteredInvoices = useMemo(() => {
    if (!counterpartyId) return invoices;
    return invoices.filter((inv) => inv.counterpartyId === counterpartyId);
  }, [invoices, counterpartyId]);

  // Filtered returns table
  const filteredReturns = useMemo(() => {
    return returns.filter((ret) => {
      const matchSearch =
        ret.returnNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ret.counterparty?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ret.invoice?.invoiceNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ret.reason?.toLowerCase().includes(searchQuery.toLowerCase());

      const matchStatus =
        !statusFilter || ret.status === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [returns, searchQuery, statusFilter]);

  const cpOptions: SelectOption[] = counterparties.map((c) => ({ value: c.id, label: c.name }));
  const whOptions: SelectOption[] = warehouses.map((w) => ({
    value: w.id,
    label: getLocalizedName(w.name),
  }));
  const invoiceOptions: SelectOption[] = [
    { value: '', label: isRu ? '— Выберите накладную —' : '— Asl sotuv fakturasini tanlang —' },
    ...filteredInvoices.map((inv) => ({
      value: inv.id,
      label: `${inv.invoiceNumber} (${formatCurrency(Number(inv.totalAmount), locale, inv.currency)})`,
    })),
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'POSTED':
        return <Badge variant="success">{isRu ? 'Проведен' : 'Tasdiqlangan'}</Badge>;
      case 'CANCELLED':
        return <Badge variant="error">{isRu ? 'Отменен' : 'Bekor qilingan'}</Badge>;
      case 'DRAFT':
      default:
        return <Badge variant="warning">{isRu ? 'Черновик' : 'Qoralama'}</Badge>;
    }
  };

  const tl = useTranslations('rd.list');
  const td = useTranslations('rd.doc');
  const tr = useTranslations('rd.sreturns');
  const [hiddenCols, setHiddenCols] = usePersistentState<string[]>('sreturns.hidden', []);
  const [sort, setSort] = usePersistentState<SortState | null>('sreturns.sort', null);
  const [quickSearch, setQuickSearch] = useState('');
  const range = periodRange(lf.values.period);
  const shownReturns = filteredReturns.filter((r) => {
    const d = (r.returnDate || '').slice(0, 10);
    return (!range.from || d >= range.from) && (!range.to || d <= range.to);
  });
  const monthStart = localIsoDate(new Date()).slice(0, 8) + '01';
  const monthPosted = returns.filter((r) => r.status === 'POSTED' && (r.returnDate || '').slice(0, 10) >= monthStart);
  const draftCount = returns.filter((r) => r.status === 'DRAFT').length;
  const quickMatches = quickSearch.trim()
    ? invoices
        .filter((inv) => {
          const q = quickSearch.trim().toLowerCase();
          const cp = counterparties.find((c) => c.id === inv.counterpartyId)?.name ?? '';
          return inv.invoiceNumber.toLowerCase().includes(q) || cp.toLowerCase().includes(q);
        })
        .slice(0, 5)
    : [];
  /** "Return from this sale": the create drawer opens with customer, invoice and its items loaded. */
  const startFromInvoice = (inv: InvoiceItem) => {
    setFormError(null);
    setCounterpartyId(inv.counterpartyId);
    handleInvoiceChange(inv.id);
    setShowCreateModal(true);
    setQuickSearch('');
  };
  const openDetails = (ret: SalesReturnRow) => {
    setSelectedReturn(ret);
    setShowDetailsModal(true);
  };

  const columns: Column<SalesReturnRow>[] = [
    {
      key: 'number',
      label: tIn('sana'),
      primary: true,
      locked: true,
      sortValue: (r) => r.returnDate,
      render: (r) => (
        <div>
          <div className="rd-doc-no">{r.returnNumber}</div>
          <div className="rd-sub">{formatDate(r.returnDate, locale)}</div>
        </div>
      ),
      footer: <span>{tl('total')} · {tl('results', { count: shownReturns.length })}</span>,
    },
    { key: 'customer', label: isRu ? 'Клиент' : 'Mijoz', sortValue: (r) => r.counterparty?.name ?? '', render: (r) => <span style={{ fontWeight: 'var(--font-medium)' }}>{r.counterparty?.name || '—'}</span> },
    { key: 'origin', label: tr('origin'), sortValue: (r) => r.invoice?.invoiceNumber ?? '', render: (r) => r.invoice?.invoiceNumber ?? '—' },
    {
      key: 'warehouse',
      label: tl('warehouse'),
      render: (r) => (
        <div>
          <div>{getLocalizedName(r.warehouse?.name)}</div>
          {r.defectWarehouse && <div className="rd-sub" style={{ color: 'var(--color-error-700)' }}>{tr('defect', { name: getLocalizedName(r.defectWarehouse.name) })}</div>}
        </div>
      ),
    },
    {
      key: 'amount',
      label: tl('amount'),
      numeric: true,
      sortValue: (r) => Number(r.totalAmount),
      render: (r) => <strong>{formatCurrency(Number(r.totalAmount), locale, r.currency)}</strong>,
      footer: <CurrencyTotals totals={totalsByCurrency(shownReturns.filter((r) => r.status !== 'CANCELLED'), (r) => r.currency, (r) => Number(r.totalAmount))} locale={locale} />,
    },
    { key: 'status', label: tl('status'), sortValue: (r) => r.status, render: (r) => getStatusBadge(r.status) },
    { key: 'reason', label: tr('reason'), render: (r) => <span style={{ color: 'var(--color-text-secondary)', display: 'inline-block', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', verticalAlign: 'bottom' }}>{r.reason || '—'}</span> },
    {
      key: 'actions',
      label: isRu ? 'Действия' : 'Amallar',
      locked: true,
      render: (r) => (
        <div className="rd-row-actions">
          {r.status === 'DRAFT' && (
            <button type="button" className="rd-next-btn" disabled={actionLoadingId === r.id} onClick={() => void handleConfirmReturn(r.id)}>
              <PackageCheck size={14} aria-hidden /> {td('post')}
            </button>
          )}
          <ActionsMenu
            label={tl('rowActions')}
            actions={[
              { label: tl('open'), onSelect: () => openDetails(r) },
              { label: isRu ? 'Отменить' : 'Bekor qilish', onSelect: () => void handleCancelReturn(r), danger: true, hidden: r.status === 'CANCELLED' },
              { label: tl('delete'), onSelect: () => { setDeleteConfirmReturn(r); setDeleteError(null); }, danger: true, hidden: !(r.status === 'DRAFT' || r.status === 'CANCELLED') },
            ]}
          />
        </div>
      ),
    },
  ];

  const statusChips = [
    { value: 'DRAFT', label: isRu ? 'Черновики' : 'Qoralamalar' },
    { value: 'POSTED', label: tIn('tasdiqlangan') },
    { value: 'CANCELLED', label: tIn('bekor_qilingan') },
  ];
  const filterDefs: FilterDef[] = [
    { key: 'status', kind: 'segmented', label: tl('status'), options: statusChips },
    { key: 'period', kind: 'period', label: tl('period') },
  ];
  const anyFilter = Boolean(searchQuery || lf.activeCount > 0);
  const clearAll = lf.reset;

  return (
    <div className="rd-page">
      <PageHeader
        title={isRu ? 'Возврат от покупателей' : 'Mijozdan qaytarish'}
        subtitle={tr('subtitle')}
        actions={
          <Button
            id="create-return-btn"
            variant="secondary"
            onClick={() => {
              setFormError(null);
              setShowCreateModal(true);
            }}
          >
            <Plus size={16} aria-hidden /> {isRu ? 'Новый возврат' : 'Yangi qaytarish'}
          </Button>
        }
      />

      {/* Start from the sale: the usual way a return begins */}
      <section className="rd-table-card dash-panel" aria-labelledby="sr-quick">
        <h2 id="sr-quick" className="dash-panel-title">{tr('quickTitle')}</h2>
        <p className="dash-panel-hint">{tr('quickHint')}</p>
        <div style={{ marginTop: 'var(--space-3)', maxWidth: 560 }}>
          <SearchField value={quickSearch} onChange={setQuickSearch} placeholder={tr('quickPh')} label={tr('quickTitle')} />
        </div>
        {quickSearch.trim() && (
          quickMatches.length === 0 ? (
            <p className="dash-panel-hint" style={{ marginTop: 'var(--space-3)' }}>{tr('quickNone')}</p>
          ) : (
            <ul className="dash-todo-list">
              {quickMatches.map((inv) => (
                <li key={inv.id} className="dash-todo">
                  <div className="dash-todo-text">
                    <div className="dash-todo-title">{inv.invoiceNumber}</div>
                    <div className="dash-todo-hint">{counterparties.find((c) => c.id === inv.counterpartyId)?.name ?? '—'}</div>
                  </div>
                  <div className="dash-todo-amount tabular-nums">{formatCurrency(Number(inv.totalAmount), locale, inv.currency)}</div>
                  <button type="button" className="rd-next-btn" onClick={() => startFromInvoice(inv)}>
                    <RotateCcw size={14} aria-hidden /> {tr('returnThis')}
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
      </section>

      <StatCardGrid label={tl('summary')} count={3}>
        <StatCard label={tr('sigDrafts')} value={draftCount} secondary={tr('sigDraftsHint')} />
        <StatCard label={tr('sigMonth')} value={<CurrencyTotals totals={totalsByCurrency(monthPosted, (r) => r.currency, (r) => Number(r.totalAmount))} locale={locale} />} secondary={tr('sigMonthHint')} />
        <StatCard label={tr('sigAll')} value={returns.length} />
      </StatCardGrid>

      <FilterBar
        state={lf}
        defs={filterDefs}
        searchPlaceholder={tr('searchPh')}
        resultCount={shownReturns.length}
        columns={<ColumnChooser columns={columns.map((c) => ({ key: c.key, label: c.label, locked: c.locked }))} hidden={hiddenCols} onChange={setHiddenCols} />}
      />

      <div className="rd-table-card">
        {returnsQuery.isError ? (
          <LoadError error={returnsQuery.error} onRetry={() => void returnsQuery.refetch()} retrying={returnsQuery.isFetching} />
        ) : (
          <DataTable
            rows={shownReturns}
            columns={columns}
            rowKey={(r) => r.id}
            hidden={hiddenCols}
            sort={sort}
            onSortChange={setSort}
            onRowClick={openDetails}
            selectedKey={showDetailsModal ? selectedReturn?.id : null}
            loading={returnsQuery.isPending}
            caption={tl('clickRowHint')}
            empty={
              anyFilter ? (
                <EmptyState icon={RotateCcw} title={tl('nothingFound')} description={tl('nothingFoundHint')} action={<Button variant="secondary" onClick={clearAll}>{tl('clearFilters')}</Button>} />
              ) : (
                <EmptyState icon={RotateCcw} title={tr('noReturns')} description={tr('noReturnsHint')} />
              )
            }
          />
        )}
      </div>

      {/* Create Return Drawer */}
      <Drawer
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={isRu ? 'Новый документ возврата' : 'Yangi qaytarish hujjati'}
        description={isRu ? 'Оформление возврата товаров на склад от покупателя по накладной' : 'Mijozdan tovarlarni omborga qaytarishni rasmiylashtirish'}
        icon={<RotateCcw size={20} />}
        size="lg"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', width: '100%' }}>
            <Button variant="secondary" onClick={() => setShowCreateModal(false)} disabled={formLoading}>
              {isRu ? 'Отмена' : 'Bekor qilish'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleSubmit('DRAFT')}
              disabled={formLoading || totalReturnAmount <= 0}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <ShieldCheck size={16} />
              {formLoading ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : (isRu ? 'Сохранить черновик' : 'Qoralama saqlash')}
            </Button>
            <Button
              onClick={() => handleSubmit('POSTED')}
              disabled={formLoading || totalReturnAmount <= 0}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <RotateCcw size={16} />
              {formLoading ? (isRu ? 'Проведение...' : 'Bajarilmoqda...') : (isRu ? 'Подтвердить и провести' : 'Tasdiqlash va kirim qilish')}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {formError && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 'var(--radius-md)', padding: '10px 14px', color: 'var(--color-error-700)', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} /> {formError}
            </div>
          )}

          {/* Form Fields */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 'var(--space-3)' }}>
            <Select id="ret-counterparty" label={isRu ? 'Клиент *' : 'Mijoz *'} value={counterpartyId} onChange={handleCounterpartyChange} options={cpOptions} />
            <Select id="ret-invoice" label={isRu ? 'Исходная продажа *' : 'Asl sotuv hujjati *'} value={invoiceId} onChange={handleInvoiceChange} options={invoiceOptions} />
            <Select id="ret-warehouse" label={isRu ? 'Склад (из продажи)' : 'Ombor (sotuvdagi)'} value={selectedInvoice?.warehouseId ?? ''} onChange={() => {}} options={whOptions} disabled />
            {hasDefectiveItems && (
              <Select id="ret-defect-warehouse" label={isRu ? 'Склад брака *' : 'Brak ombori *'} value={defectWarehouseId} onChange={(val) => setDefectWarehouseId(val)} options={whOptions} />
            )}
            <DatePicker label={isRu ? 'Дата *' : 'Sana *'} value={returnDate} onChange={(val) => setReturnDate(val)} />
          </div>

          <Input id="ret-reason" label={isRu ? 'Причина возврата' : 'Qaytarish sababi'} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isRu ? 'Напр. Брак / несоответствие...' : 'Mas. Brak / yaroqsiz tovar...'} />

          {/* Reason presets */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {REASON_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setReason(preset)}
                style={{
                  fontSize: '11px',
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: reason === preset ? 'var(--color-primary-100)' : 'var(--color-bg-subtle)',
                  color: reason === preset ? 'var(--color-primary-700)' : 'var(--color-text-secondary)',
                  border: '1px solid var(--color-border)',
                  cursor: 'pointer',
                }}
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Barcode Fast Scanner Input */}
          {invoiceId && returnCurrency && items.length > 0 && (
            <form onSubmit={handleBarcodeSubmit} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-bg-subtle)', padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <Barcode size={20} style={{ color: 'var(--color-text-secondary)' }} />
              <input
                ref={barcodeInputRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                placeholder={isRu ? 'Сканируйте штрих-код товара или введите артикул (+1)...' : 'Shtrix-kod skaner qiling yoki SKU kiriting (+1)...'}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text-primary)',
                }}
              />
              <Button type="submit" size="sm" variant="secondary">
                {isRu ? 'Добавить' : 'Qo\'shish'}
              </Button>
            </form>
          )}

          {barcodeNotice && (
            <div style={{ fontSize: 'var(--text-xs)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', background: barcodeNotice.includes('+1') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: barcodeNotice.includes('+1') ? 'var(--color-success-500)' : 'var(--color-error-500)', display: 'flex', alignItems: 'center', gap: 6 }}>
              {barcodeNotice.includes('+1') ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
              <span>{barcodeNotice}</span>
            </div>
          )}

          {/* Items Table */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ fontSize: 'var(--text-sm)' }}>
                {isRu ? 'Возвращаемые товары по накладной' : 'Sotuv fakturasi bo\'yicha tovarlar'}
              </strong>
            </div>

            {!invoiceId ? (
              <div style={{ padding: 30, textAlign: 'center', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', background: 'var(--color-bg-subtle)' }}>
                {isRu ? 'Сначала выберите клиента и исходную продажу (счет-фактуру)' : 'Avval mijozni va uning sotuv fakturasini tanlang'}
              </div>
            ) : loadingItems ? (
              <div style={{ padding: 30, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                {isRu ? 'Загрузка остатков продаж...' : 'Sotuv qoldiqlari yuklanmoqda...'}
              </div>
            ) : items.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', background: 'var(--color-bg-subtle)' }}>
                {isRu ? 'В данной накладной нет доступных для возврата товаров' : 'Ushbu sotuvda qaytarish uchun tovar qolmagan'}
              </div>
            ) : (
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-bg-subtle)' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{isRu ? 'Товар' : 'Tovar'}</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', width: 70 }}>{isRu ? 'Брак?' : 'Brak?'}</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{isRu ? 'Доступно' : 'Qoldiq'}</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', width: 110 }}>{isRu ? 'Возврат' : 'Qaytarish'}</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{isRu ? 'Цена' : 'Narx'}</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)' }}>{isRu ? 'Итого' : 'Jami'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => {
                      const isExhausted = item.returnableQuantity <= 0;
                      return (
                        <tr
                          key={item.productId}
                          style={{
                            borderBottom: '1px solid var(--color-border-light)',
                            opacity: isExhausted ? 0.6 : 1,
                            backgroundColor: item.isDefective ? 'rgba(239, 68, 68, 0.04)' : undefined,
                          }}
                        >
                          <td style={{ padding: '8px 10px' }}>
                            <div style={{ fontWeight: 500, fontSize: 'var(--text-sm)' }}>
                              {getLocalizedName(item.productName)}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                              {item.sku ? `SKU: ${item.sku}` : ''} {item.barcode ? `| ${item.barcode}` : ''}
                            </div>
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={item.isDefective}
                              onChange={() => toggleDefective(idx)}
                              disabled={isExhausted}
                              style={{ cursor: 'pointer' }}
                            />
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 'var(--text-sm)' }}>
                            <div style={{ color: item.returnableQuantity > 0 ? 'var(--color-success-700)' : 'var(--color-error-700)', fontWeight: 600 }}>
                              {quantityWithUnit(item.returnableQuantity, item.unit, locale)}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                              {isRu ? `из ${quantityWithUnit(item.soldQuantity, item.unit, locale)}` : `${quantityWithUnit(item.soldQuantity, item.unit, locale)} dan`}
                            </div>
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                            <QuantityInput
                              unit={item.unit}
                              value={item.quantity || ''}
                              max={item.returnableQuantity}
                              disabled={isExhausted}
                              onValueChange={(value) => handleQtyChange(idx, Number(value) || 0)}
                              aria-label={isRu ? 'Количество возврата' : 'Qaytarish miqdori'}
                            />
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 'var(--text-sm)' }} className="tabular-nums">
                            {(formatCurrencyIfAvailable(item.unitPrice, locale, returnCurrency) ?? '—')}
                            {item.discount > 0 && (
                              <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>-{formatPercent(item.discount)}</div>
                            )}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 'var(--text-sm)', fontWeight: 600 }} className="tabular-nums">
                            {(formatCurrencyIfAvailable(item.quantity * item.unitTotalPrice, locale, returnCurrency) ?? '—')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--color-bg-subtle)', borderTop: '2px solid var(--color-border)' }}>
                      <td colSpan={5} style={{ padding: '10px', textAlign: 'right', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                        {isRu ? 'Итого к возврату:' : 'Jami qaytariladigan summa:'}
                      </td>
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, fontSize: 'var(--text-base)', color: 'var(--color-warning-700)' }} className="tabular-nums">
                        {(formatCurrencyIfAvailable(totalReturnAmount, locale, returnCurrency) ?? '—')}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </div>
      </Drawer>

      {/* View Return Details Drawer */}
      {selectedReturn && (
        <Drawer
          isOpen={showDetailsModal}
          onClose={() => setShowDetailsModal(false)}
          title={`${isRu ? 'Возврат' : 'Qaytarish'} № ${selectedReturn.returnNumber}`}
          description={`${formatDate(selectedReturn.returnDate, locale)} — ${selectedReturn.counterparty?.name || ''}`}
          icon={<RotateCcw size={20} />}
          size="md"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 'var(--space-3)', background: 'var(--color-bg-subtle)', padding: 14, borderRadius: 'var(--radius-md)' }}>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block' }}>{isRu ? 'Статус:' : 'Holati:'}</span>
                <div style={{ marginTop: 2 }}>{getStatusBadge(selectedReturn.status)}</div>
              </div>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block' }}>{isRu ? 'Исходная накладная:' : 'Asl sotuv fakturasi:'}</span>
                <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{selectedReturn.invoice?.invoiceNumber || '—'}</span>
              </div>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block' }}>{isRu ? 'Склад поступления:' : 'Kirim ombori:'}</span>
                <span style={{ fontSize: 'var(--text-sm)' }}>{getLocalizedName(selectedReturn.warehouse?.name)}</span>
              </div>
              {selectedReturn.defectWarehouse && (
                <div>
                  <span style={{ fontSize: '12px', color: 'var(--color-error-700)', display: 'block' }}>{isRu ? 'Склад брака:' : 'Brak ombori:'}</span>
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-error-700)' }}>{getLocalizedName(selectedReturn.defectWarehouse.name)}</span>
                </div>
              )}
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)', display: 'block' }}>{isRu ? 'Причина возврата:' : 'Qaytarish sababi:'}</span>
                <span style={{ fontSize: 'var(--text-sm)' }}>{selectedReturn.reason || '—'}</span>
              </div>
            </div>

            {/* Items */}
            <div>
              <strong style={{ fontSize: 'var(--text-sm)', display: 'block', marginBottom: 8 }}>
                {isRu ? 'Товары в документе' : 'Hujjatdagi tovarlar'}
              </strong>
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-bg-subtle)' }}>
                      <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '12px', color: 'var(--color-text-secondary)' }}>{isRu ? 'Товар' : 'Tovar'}</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center', fontSize: '12px', color: 'var(--color-text-secondary)' }}>{isRu ? 'Брак' : 'Brak'}</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '12px', color: 'var(--color-text-secondary)' }}>{isRu ? 'Кол-во' : 'Miqdor'}</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '12px', color: 'var(--color-text-secondary)' }}>{isRu ? 'Цена' : 'Narx'}</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: '12px', color: 'var(--color-text-secondary)' }}>{isRu ? 'Сумма' : 'Summa'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedReturn.items || []).map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        <td style={{ padding: '8px 10px' }}>
                          <div style={{ fontWeight: 500 }}>{getLocalizedName(item.product?.name)}</div>
                          {item.product?.sku && <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{item.product.sku}</div>}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                          {item.isDefective ? (
                            <span style={{ fontSize: '11px', color: 'var(--color-error-700)', fontWeight: 600 }}>{isRu ? 'Да' : 'Ha'}</span>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{Number(item.quantity)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }} className="tabular-nums">{formatCurrency(Number(item.unitPrice), locale, selectedReturn.currency)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }} className="tabular-nums">{formatCurrency(Number(item.totalPrice), locale, selectedReturn.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--color-bg-subtle)' }}>
                      <td colSpan={4} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{isRu ? 'Итого:' : 'Jami:'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: 'var(--color-warning-700)' }} className="tabular-nums">
                        {formatCurrency(Number(selectedReturn.totalAmount), locale, selectedReturn.currency)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              {selectedReturn.status === 'DRAFT' && (
                <Button onClick={() => { setShowDetailsModal(false); handleConfirmReturn(selectedReturn.id); }}>
                  <PackageCheck size={16} /> {isRu ? 'Провести' : 'Tasdiqlash'}
                </Button>
              )}
              {selectedReturn.status !== 'CANCELLED' && (
                <Button variant="danger-outline" onClick={() => { setShowDetailsModal(false); handleCancelReturn(selectedReturn); }}>
                  <XCircle size={16} /> {isRu ? 'Отменить документ' : 'Hujjatni bekor qilish'}
                </Button>
              )}
            </div>
          </div>
        </Drawer>
      )}

      {/* Delete confirmation: shared dialog (role=dialog, Esc, focus kept inside) */}
      <Modal icon={<Trash2 size={20} />} tone="error"
        isOpen={Boolean(deleteConfirmReturn)}
        onClose={() => { if (!deleteLoading) setDeleteConfirmReturn(null); }}
        title={isRu ? 'Удалить документ возврата?' : 'Qaytarish hujjatini o‘chirish?'}
        size="sm"
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setDeleteConfirmReturn(null)} disabled={deleteLoading}>
              {isRu ? 'Отмена' : 'Bekor qilish'}
            </Button>
            <Button type="button" variant="danger" onClick={handleDeleteReturn} loading={deleteLoading} loadingText={isRu ? 'Удаление…' : 'O‘chirilmoqda…'}>
              {isRu ? 'Да, удалить' : 'Ha, o‘chirish'}
            </Button>
          </>
        }
      >
        {deleteError && (
          <div role="alert" className="doc-banner is-error" style={{ marginBottom: 'var(--space-4)' }}>
            {deleteError}
          </div>
        )}
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
          {deleteConfirmReturn && (isRu
            ? `Возврат покупателя № ${deleteConfirmReturn.returnNumber} будет удалён. Это действие нельзя отменить.`
            : `№ ${deleteConfirmReturn.returnNumber} xaridor qaytarish hujjati o‘chiriladi. Bu amalni qaytarib bo‘lmaydi.`)}
        </p>
      </Modal>
    </div>
  );
}
