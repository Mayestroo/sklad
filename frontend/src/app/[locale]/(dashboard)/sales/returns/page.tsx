'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Drawer } from '@/components/ui/Drawer';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { Badge } from '@/components/ui/Badge';
import {
  RotateCcw,
  Plus,
  Trash2,
  AlertTriangle,
  Barcode,
  CheckCircle2,
  ExternalLink,
  Eye,
  ShieldCheck,
  XCircle,
  Search,
  Filter,
  PackageCheck,
  AlertCircle,
} from 'lucide-react';

interface SalesReturnRow {
  id: string;
  returnNumber: string;
  returnDate: string;
  counterpartyId: string;
  warehouseId: string;
  defectWarehouseId?: string;
  counterparty?: { id: string; name: string };
  warehouse?: { id: string; name: any };
  defectWarehouse?: { id: string; name: any };
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
    product?: { name: any; sku: string; barcode?: string };
  }>;
  createdBy?: { id: string; firstName: string; lastName: string };
}

interface CounterpartyItem {
  id: string;
  name: string;
}

interface WarehouseItem {
  id: string;
  name: any;
  isDefect?: boolean;
}

interface InvoiceItem {
  id: string;
  invoiceNumber: string;
  counterpartyId: string;
  totalAmount: number;
}

interface ReturnableItemRow {
  productId: string;
  productName: any;
  sku?: string;
  barcode?: string;
  unit?: string;
  soldQuantity: number;
  returnedQuantity: number;
  returnableQuantity: number;
  quantity: number;
  unitPrice: number;
  isDefective: boolean;
}

export default function SalesReturnsPage() {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [returns, setReturns] = useState<SalesReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [counterparties, setCounterparties] = useState<CounterpartyItem[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);

  // Search and filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Create Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [counterpartyId, setCounterpartyId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [defectWarehouseId, setDefectWarehouseId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [returnDate, setReturnDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [items, setItems] = useState<ReturnableItemRow[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
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

  const getLocalizedName = (name: any) => {
    if (!name) return '—';
    if (typeof name === 'string') return name;
    return name[locale] || name.ru || name.uz || Object.values(name)[0] || '—';
  };

  const REASON_PRESETS = isRu
    ? ['Брак / дефект товара', 'Срок годности истек', 'Неправильный размер / артикул', 'Отказ клиента', 'Повреждение при доставке', 'Другое']
    : ['Brak / nuqsonli tovar', 'Yaroqlilik muddati o\'tgan', 'Noto\'g\'ri o\'lcham / tovar', 'Mijoz rad etdi', 'Yetkazib berishda shikastlangan', 'Boshqa'];

  const fetchReturns = () => {
    if (!token || !company) return;
    setLoading(true);
    apiFetch<SalesReturnRow[]>('/sales/returns', {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => setReturns(res || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!token || !company) return;
    fetchReturns();

    apiFetch<CounterpartyItem[]>('/sales/counterparties', {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => setCounterparties(res || []))
      .catch(console.error);

    apiFetch<WarehouseItem[]>('/tenants/warehouses', {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => {
        const list = res || [];
        setWarehouses(list);
        if (list.length > 0 && !warehouseId) setWarehouseId(list[0].id);
        const defWh = list.find((w) => w.isDefect || (typeof w.name === 'string' && w.name.toLowerCase().includes('brak')));
        if (defWh) setDefectWarehouseId(defWh.id);
        else if (list.length > 1) setDefectWarehouseId(list[1].id);
      })
      .catch(console.error);

    apiFetch<InvoiceItem[]>('/sales/invoices?status=POSTED', {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => setInvoices(res || []))
      .catch(console.error);
  }, [token, company, locale]);

  // When invoice selection changes in create form, load returnable items
  useEffect(() => {
    if (!invoiceId || !token || !company) {
      setItems([]);
      return;
    }

    setLoadingItems(true);
    setFormError(null);
    apiFetch<any[]>(`/sales/invoices/${invoiceId}/returnable-items`, {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => {
        if (res && res.length > 0) {
          setItems(
            res.map((i: any) => ({
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
              isDefective: false,
            }))
          );
        } else {
          setItems([]);
        }
      })
      .catch((err) => {
        setFormError(err?.message || (isRu ? 'Ошибка загрузки товаров' : 'Tovarlarni yuklashda xatolik'));
      })
      .finally(() => setLoadingItems(false));
  }, [invoiceId, token, company, locale]);

  // Handle counterparty change: auto-filter or clear invoice
  const handleCounterpartyChange = (cpId: string) => {
    setCounterpartyId(cpId);
    setInvoiceId('');
    setItems([]);
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

  const totalReturnAmount = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const hasDefectiveItems = items.some((i) => i.isDefective && i.quantity > 0);

  const handleSubmit = async (submitStatus: 'DRAFT' | 'POSTED') => {
    if (!token || !company) return;
    if (!counterpartyId) { setFormError(isRu ? 'Выберите клиента' : 'Mijozni tanlang'); return; }
    if (!warehouseId) { setFormError(isRu ? 'Выберите склад' : 'Ombor tanlang'); return; }
    if (!invoiceId) { setFormError(isRu ? 'Выберите исходную продажу' : 'Asl sotuv fakturasini tanlang'); return; }

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
          counterpartyId,
          warehouseId,
          defectWarehouseId: hasDefectiveItems ? defectWarehouseId : undefined,
          invoiceId,
          returnDate,
          reason: reason || undefined,
          status: submitStatus,
          currency: 'UZS',
          items: activeItems.map((i) => ({
            productId: i.productId,
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
            isDefective: i.isDefective,
          })),
        }),
      });

      setShowCreateModal(false);
      setItems([]);
      setReason('');
      setInvoiceId('');
      fetchReturns();
    } catch (err: any) {
      setFormError(err?.message || (isRu ? 'Произошла ошибка при создании' : 'Qaytarishni yaratishda xatolik yuz berdi'));
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
      fetchReturns();
    } catch (err: any) {
      alert(err?.message || (isRu ? 'Ошибка при подтверждении' : 'Tasdiqlashda xatolik yuz berdi'));
    } finally {
      setActionLoadingId(null);
    }
  };

  // Cancel a return (draft void or posted rollback)
  const handleCancelReturn = async (ret: SalesReturnRow) => {
    if (!token || !company) return;
    const confirmMsg = ret.status === 'POSTED'
      ? (isRu ? 'Вы уверены, что хотите отменить проведенный возврат? Остатки на складе и долг клиента будут восстановлены.' : 'Haqiqatan ham tasdiqlangan qaytarishni bekor qilmoqchimisiz? Ombor qoldig\'i va mijoz qarzi qayta tiklanadi.')
      : (isRu ? 'Вы уверены, что хотите аннулировать этот черновик?' : 'Haqiqatan ham ushbu qoralamani bekor qilmoqchimisiz?');

    if (!confirm(confirmMsg)) return;

    setActionLoadingId(ret.id);
    try {
      await apiFetch(`/sales/returns/${ret.id}/cancel`, {
        method: 'POST',
        token: token || undefined,
        tenantId: company.id,
        locale,
      });
      fetchReturns();
    } catch (err: any) {
      alert(err?.message || (isRu ? 'Ошибка при отмене' : 'Bekor qilishda xatolik yuz berdi'));
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
        statusFilter === 'ALL' || ret.status === statusFilter;

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
      label: `${inv.invoiceNumber} (${formatCurrency(Number(inv.totalAmount), locale)})`,
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
            {isRu ? 'Возврат от покупателей' : 'Mijozdan qaytarish'}
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 4 }}>
            {isRu
              ? 'Управление возвратами проданных товаров, автоматическое восстановление партий FIFO, изоляция брака и перерасчет долга'
              : 'Sotilgan tovarlar qaytarilishi, FIFO partiyalarini asl tannarxda tiklash, brak ombori nazorati va mijoz balansi to\'g\'rilanishi'}
          </p>
        </div>
        <Button
          id="create-return-btn"
          onClick={() => {
            setFormError(null);
            setShowCreateModal(true);
          }}
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Plus size={16} /> {isRu ? 'Новый возврат' : 'Yangi qaytarish'}
        </Button>
      </div>

      {/* Search & Filter Bar */}
      <Card style={{ padding: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 260, position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
            <input
              type="text"
              placeholder={isRu ? 'Поиск по номеру возврата, накладной или клиенту...' : 'Qaytarish raqami, sotuv yoki mijoz bo\'yicha qidiruv...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-bg-input)',
                color: 'var(--color-text-primary)',
                fontSize: 'var(--text-sm)',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Filter size={15} style={{ color: 'var(--color-text-secondary)' }} />
            {['ALL', 'DRAFT', 'POSTED', 'CANCELLED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: statusFilter === st ? '1px solid var(--color-primary-600)' : '1px solid var(--color-border)',
                  background: statusFilter === st ? 'var(--color-primary-100)' : 'var(--color-bg-subtle)',
                  color: statusFilter === st ? 'var(--color-primary-700)' : 'var(--color-text-secondary)',
                }}
              >
                {st === 'ALL'
                  ? (isRu ? 'Все' : 'Barchasi')
                  : st === 'DRAFT'
                  ? (isRu ? 'Черновики' : 'Qoralamalar')
                  : st === 'POSTED'
                  ? (isRu ? 'Проведенные' : 'Tasdiqlangan')
                  : (isRu ? 'Отмененные' : 'Bekor qilingan')}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Main Table */}
      <Card>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>{isRu ? '№ Документа' : 'Hujjat №'}</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>{isRu ? 'Дата' : 'Sana'}</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>{isRu ? 'Клиент' : 'Mijoz'}</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>{isRu ? 'Исходная продажа' : 'Asl sotuv'}</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>{isRu ? 'Склад' : 'Ombor'}</th>
                <th style={{ padding: '10px 14px', textAlign: 'right', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>{isRu ? 'Сумма' : 'Summa'}</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>{isRu ? 'Статус' : 'Holati'}</th>
                <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>{isRu ? 'Причина' : 'Sabab'}</th>
                <th style={{ padding: '10px 14px', textAlign: 'center', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>{isRu ? 'Действия' : 'Amallar'}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>
                    {isRu ? 'Загрузка документов...' : 'Hujjatlar yuklanmoqda...'}
                  </td>
                </tr>
              ) : filteredReturns.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>
                    <RotateCcw size={36} style={{ margin: '0 auto 10px', opacity: 0.3, display: 'block' }} />
                    {isRu ? 'Документы возврата от покупателя не найдены' : 'Qaytarish hujjatlari topilmadi'}
                  </td>
                </tr>
              ) : (
                filteredReturns.map((ret) => (
                  <tr key={ret.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '12px 14px', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
                      <span style={{ cursor: 'pointer', color: 'var(--color-primary-600)' }} onClick={() => { setSelectedReturn(ret); setShowDetailsModal(true); }}>
                        {ret.returnNumber}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                      {formatDate(ret.returnDate, locale)}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 'var(--text-sm)' }}>
                      {ret.counterparty?.name || '—'}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 'var(--text-sm)' }}>
                      {ret.invoice ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500, color: 'var(--color-primary-700)' }}>
                          {ret.invoice.invoiceNumber}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 'var(--text-sm)' }}>
                      <div>{getLocalizedName(ret.warehouse?.name)}</div>
                      {ret.defectWarehouse && (
                        <div style={{ fontSize: '11px', color: '#ef4444', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <span>Brak: {getLocalizedName(ret.defectWarehouse.name)}</span>
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 600, fontSize: 'var(--text-sm)' }} className="tabular-nums">
                      {formatCurrency(Number(ret.totalAmount), locale)}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      {getStatusBadge(ret.status)}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ret.reason || '—'}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => { setSelectedReturn(ret); setShowDetailsModal(true); }}
                          title={isRu ? 'Просмотр' : 'Ko\'rish'}
                          style={{ padding: '4px 8px' }}
                        >
                          <Eye size={14} />
                        </Button>

                        {ret.status === 'DRAFT' && (
                          <Button
                            size="sm"
                            onClick={() => handleConfirmReturn(ret.id)}
                            disabled={actionLoadingId === ret.id}
                            title={isRu ? 'Провести' : 'Tasdiqlash'}
                            style={{ padding: '4px 8px', background: '#10b981' }}
                          >
                            <PackageCheck size={14} />
                          </Button>
                        )}

                        {ret.status !== 'CANCELLED' && (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleCancelReturn(ret)}
                            disabled={actionLoadingId === ret.id}
                            title={isRu ? 'Отменить' : 'Bekor qilish'}
                            style={{ padding: '4px 8px', color: '#ef4444' }}
                          >
                            <XCircle size={14} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

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
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid #ef4444', borderRadius: 'var(--radius-md)', padding: '10px 14px', color: '#ef4444', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} /> {formError}
            </div>
          )}

          {/* Form Fields */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
            <Select id="ret-counterparty" label={isRu ? 'Клиент *' : 'Mijoz *'} value={counterpartyId} onChange={handleCounterpartyChange} options={cpOptions} />
            <Select id="ret-invoice" label={isRu ? 'Исходная продажа *' : 'Asl sotuv hujjati *'} value={invoiceId} onChange={(val) => setInvoiceId(val)} options={invoiceOptions} />
            <Select id="ret-warehouse" label={isRu ? 'Основной склад *' : 'Asosiy ombor *'} value={warehouseId} onChange={(val) => setWarehouseId(val)} options={whOptions} />
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
          {invoiceId && items.length > 0 && (
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
            <div style={{ fontSize: 'var(--text-xs)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', background: barcodeNotice.includes('+1') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)', color: barcodeNotice.includes('+1') ? '#10b981' : '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}>
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
                            <div style={{ color: item.returnableQuantity > 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                              {item.returnableQuantity}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                              {isRu ? `из ${item.soldQuantity}` : `${item.soldQuantity} dan`}
                            </div>
                          </td>
                          <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                            <input
                              type="number"
                              min={0}
                              max={item.returnableQuantity}
                              step="any"
                              disabled={isExhausted}
                              value={item.quantity || ''}
                              onChange={(e) => handleQtyChange(idx, parseFloat(e.target.value) || 0)}
                              style={{
                                width: '100%',
                                textAlign: 'center',
                                padding: '6px 8px',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-sm)',
                                background: 'var(--color-bg-input)',
                                color: 'var(--color-text-primary)',
                                fontSize: 'var(--text-sm)',
                              }}
                            />
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 'var(--text-sm)' }} className="tabular-nums">
                            {formatCurrency(item.unitPrice, locale)}
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontSize: 'var(--text-sm)', fontWeight: 600 }} className="tabular-nums">
                            {formatCurrency(item.quantity * item.unitPrice, locale)}
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
                      <td style={{ padding: '10px', textAlign: 'right', fontWeight: 700, fontSize: 'var(--text-base)', color: '#f59e0b' }} className="tabular-nums">
                        {formatCurrency(totalReturnAmount, locale)}
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)', background: 'var(--color-bg-subtle)', padding: 14, borderRadius: 'var(--radius-md)' }}>
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
                  <span style={{ fontSize: '12px', color: '#ef4444', display: 'block' }}>{isRu ? 'Склад брака:' : 'Brak ombori:'}</span>
                  <span style={{ fontSize: 'var(--text-sm)', color: '#ef4444' }}>{getLocalizedName(selectedReturn.defectWarehouse.name)}</span>
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
                            <span style={{ fontSize: '11px', color: '#ef4444', fontWeight: 600 }}>{isRu ? 'Да' : 'Ha'}</span>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>—</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{Number(item.quantity)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }} className="tabular-nums">{formatCurrency(Number(item.unitPrice), locale)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }} className="tabular-nums">{formatCurrency(Number(item.totalPrice), locale)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: 'var(--color-bg-subtle)' }}>
                      <td colSpan={4} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{isRu ? 'Итого:' : 'Jami:'}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 700, color: '#f59e0b' }} className="tabular-nums">
                        {formatCurrency(Number(selectedReturn.totalAmount), locale)}
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
                <Button variant="secondary" onClick={() => { setShowDetailsModal(false); handleCancelReturn(selectedReturn); }} style={{ color: '#ef4444' }}>
                  <XCircle size={16} /> {isRu ? 'Отменить документ' : 'Hujjatni bekor qilish'}
                </Button>
              )}
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}
