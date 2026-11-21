'use client';

import { quantityWithUnit } from '@/lib/units';
import { QuantityInput } from '@/components/ui/QuantityInput';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { useState, FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { formatCurrency, formatDate, errorMessage, getLocalizedName } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { usePersistentState } from '@/lib/usePersistentState';
import { ChipGroup } from '@/components/ui/list/ListKit';
import { DataTable, type Column, type SortState } from '@/components/ui/list/DataTable';
import {
  FileText,
  PackagePlus,
  PackageMinus,
  ClipboardCheck,
  Plus,
  Printer,
} from 'lucide-react';
import { InventoryDocument, Product, Warehouse } from '@shared/types';

/** Inventory documents have no currency: their prices are FIFO batch cost, kept in UZS. */
const INVENTORY_COST_CURRENCY = 'UZS';

export default function InventoryDocumentsPage() {
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const tdoc = useTranslations('rd.invdocs');
  const isRu = locale === 'ru';
  const tIn = useTranslations('rd.inline');
  const { token, company } = useAuth();

  const documentsQuery = useApiQuery<InventoryDocument[]>('/inventory/documents');
  const productsQuery = useApiQuery<Product[]>('/inventory/products');
  const warehousesQuery = useApiQuery<Warehouse[]>('/tenants/warehouses');
  const pageQueries = [documentsQuery, productsQuery, warehousesQuery];
  const documents = documentsQuery.data ?? [];
  const products = productsQuery.data ?? [];
  const warehouses = warehousesQuery.data ?? [];
  const loading = pageQueries.some((q) => q.isPending);
  const failedQuery = pageQueries.find((q) => q.isError);

  // Document Modal State
  const [showModal, setShowModal] = useState(false);
  const [docType, setDocType] = useState<'INBOUND' | 'OUTBOUND' | 'STOCKTAKING'>('INBOUND');
  const [pickedWarehouseId, setWarehouseId] = useState('');
  // The document form starts on the first warehouse until one is picked.
  const warehouseId = pickedWarehouseId || warehouses[0]?.id || '';
  const [comment, setComment] = useState('');

  // Line Item Entry
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [items, setItems] = useState<{ productId: string; productName: string; quantity: number; unitPrice: number; unit?: string }[]>([]);

  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Print Preview
  const [printDoc, setPrintDoc] = useState<InventoryDocument | null>(null);

  const fetchData = () => {
    pageQueries.forEach((q) => void q.refetch());
  };

  const handleAddItem = () => {
    if (!selectedProductId || quantity <= 0) return;
    const p = products.find((prod) => prod.id === selectedProductId);
    if (!p) return;
    const name = p.name[locale] || p.name.ru || p.name.uz;

    setItems((prev) => [...prev, { productId: p.id, productName: name, quantity, unitPrice, unit: p.unitOfMeasure }]);
    setSelectedProductId('');
    setQuantity(1);
    setUnitPrice(0);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateDocument = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !company) return;
    if (!warehouseId) {
      setCreateError(isRu ? 'Выберите склад' : 'Omborni tanlang');
      return;
    }
    if (items.length === 0) {
      setCreateError(isRu ? 'Добавьте хотя бы один товар' : 'Kamida bitta tovar pozitsiyasini qo\'shing');
      return;
    }

    setCreateLoading(true);
    setCreateError(null);

    try {
      await apiFetch('/inventory/documents', {
        method: 'POST',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          warehouseId,
          docType,
          comment,
          items: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
        }),
      });

      setShowModal(false);
      setItems([]);
      setComment('');
      fetchData();
    } catch (err) {
      setCreateError(errorMessage(err) || (isRu ? 'Ошибка создания документа' : 'Hujjatni yaratib bo‘lmadi'));
    } finally {
      setCreateLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const getDocTypeBadge = (type: string) => {
    switch (type) {
      case 'INBOUND':
        return <Badge variant="success">{tdoc('inTitle')}</Badge>;
      case 'OUTBOUND':
        return <Badge variant="error">{tdoc('outTitle')}</Badge>;
      case 'STOCKTAKING':
        return <Badge variant="warning">{tdoc('countTitle')}</Badge>;
      default:
        return <Badge variant="neutral">{type}</Badge>;
    }
  };

  const getDocTypeName = (type: string) => {
    if (type === 'INBOUND') return isRu ? 'АКТ ПРИЁМА ТОВАРОВ (ПРИХОД)' : 'TOVAR QABUL QILISH DALOLATNOMASI (KIRIM)';
    if (type === 'OUTBOUND') return isRu ? 'АКТ СПИСАНИЯ ТОВАРОВ (РАСХОД)' : 'TOVAR HISOBDAN CHIQARISH DALOLATNOMASI (CHIQIM)';
    return isRu ? 'АКТ ИНВЕНТАРИЗАЦИИ' : 'INVENTARIZATSIYA HISOBOTI';
  };

  const warehouseOptions = warehouses.map((w) => ({
    value: w.id,
    label: w.name[locale] || w.name.ru || w.name.uz,
  }));

  const productOptions = products.map((p) => ({
    value: p.id,
    label: `${p.name[locale] || p.name.ru || p.name.uz} (${p.sku})`,
  }));

  const tl = useTranslations('rd.list');
  const [typeFilter, setTypeFilter] = useState('');
  const [sort, setSort] = usePersistentState<SortState | null>('invdocs.sort', null);
  const startDocument = (type: 'INBOUND' | 'OUTBOUND' | 'STOCKTAKING') => {
    setDocType(type);
    setCreateError(null);
    setShowModal(true);
  };
  const shownDocs = typeFilter ? documents.filter((d) => d.docType === typeFilter) : documents;
  const countOf = (type: string) => documents.filter((d) => d.docType === type).length;
  const tasks = [
    { type: 'INBOUND' as const, Icon: PackagePlus, tone: 'success', title: tdoc('inTitle'), hint: tdoc('inHint') },
    { type: 'OUTBOUND' as const, Icon: PackageMinus, tone: 'error', title: tdoc('outTitle'), hint: tdoc('outHint') },
    { type: 'STOCKTAKING' as const, Icon: ClipboardCheck, tone: 'warning', title: tdoc('countTitle'), hint: tdoc('countHint') },
  ];

  const columns: Column<InventoryDocument>[] = [
    {
      key: 'number',
      label: tIn('sana'),
      primary: true,
      locked: true,
      sortValue: (d) => d.docDate,
      render: (d) => (
        <div>
          <div className="rd-doc-no">{d.docNumber}</div>
          <div className="rd-sub">{formatDate(d.docDate, locale)}</div>
        </div>
      ),
      footer: <span>{tl('total')} · {tl('results', { count: shownDocs.length })}</span>,
    },
    { key: 'type', label: isRu ? 'Тип' : 'Turi', sortValue: (d) => d.docType, render: (d) => getDocTypeBadge(d.docType) },
    { key: 'warehouse', label: tl('warehouse'), render: (d) => getLocalizedName(d.warehouse?.name, locale) || '—' },
    {
      key: 'amount',
      label: tIn('tannarx_boyicha_summa'),
      numeric: true,
      sortValue: (d) => Number(d.totalAmount),
      render: (d) => <strong>{formatCurrency(Number(d.totalAmount), locale, INVENTORY_COST_CURRENCY)}</strong>,
    },
    {
      key: 'actions',
      label: tIn('amallar'),
      locked: true,
      render: (d) => (
        <div className="rd-row-actions">
          <button type="button" className="rd-next-btn" onClick={() => setPrintDoc(d)}>
            <Printer size={14} aria-hidden /> {isRu ? 'Печать' : 'Chop etish'}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="rd-page">
      <PageHeader
        title={isRu ? 'Складские документы' : 'Ombor hujjatlari'}
        subtitle={isRu ? 'Инвентаризация, оприходование излишков и списание' : 'Inventarizatsiya, ortiqcha tovarni kirim qilish va hisobdan chiqarish'}
      />

      {/* Start from the task, not from a "document type" field */}
      <section aria-labelledby="invdocs-start">
        <h2 id="invdocs-start" className="dash-section-title">{tdoc('startTitle')}</h2>
        <div className="rd-signals">
          {tasks.map(({ type, Icon, tone, title, hint }) => (
            <button key={type} type="button" className={`rd-signal rd-tone-${tone}`} onClick={() => startDocument(type)}>
              <span className="rd-signal-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon size={16} aria-hidden /> {title}
              </span>
              <span className="rd-signal-hint" style={{ color: 'var(--color-text-secondary)' }}>{hint}</span>
              <span className="rd-signal-hint">{tdoc('docsSoFar', { count: countOf(type) })}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="rd-toolbar">
        <div className="rd-toolbar-row">
          <ChipGroup
            label={isRu ? 'Тип' : 'Turi'}
            showLabel
            options={[
              { value: '', label: tl('all') },
              { value: 'INBOUND', label: tdoc('inTitle'), count: countOf('INBOUND') },
              { value: 'OUTBOUND', label: tdoc('outTitle'), count: countOf('OUTBOUND') },
              { value: 'STOCKTAKING', label: tdoc('countTitle'), count: countOf('STOCKTAKING') },
            ]}
            value={typeFilter}
            onChange={setTypeFilter}
          />
        </div>
      </div>

      <div className="rd-table-card">
        {failedQuery ? (
          <LoadError
            error={failedQuery.error}
            onRetry={() => pageQueries.filter((q) => q.isError).forEach((q) => void q.refetch())}
            retrying={pageQueries.some((q) => q.isFetching)}
          />
        ) : (
          <DataTable
            rows={shownDocs}
            columns={columns}
            rowKey={(d) => d.id}
            sort={sort}
            onSortChange={setSort}
            onRowClick={(d) => setPrintDoc(d)}
            loading={loading}
            empty={
              <EmptyState
                icon={FileText}
                title={isRu ? 'Складских документов пока нет' : 'Hozircha ombor hujjatlari yo‘q'}
                description={tIn('yuqoridan_vazifani_tanlang_ortiq')}
              />
            }
          />
        )}
      </div>

      {/* New Document dialog */}
      {showModal && (
        <Modal isOpen onClose={() => setShowModal(false)} title={tasks.find((t) => t.type === docType)?.title ?? (tIn('yangi_ombor_hujjati'))} size="lg">
          <div>
            {createError && (
              <div style={{ padding: '10px', backgroundColor: 'var(--color-error-50)', color: 'var(--color-error-700)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3)' }}>
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateDocument} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 'var(--space-3)' }}>
                <div>
                  <span className="rd-field-label">{tIn('hujjat_turi')}</span>
                  <ChipGroup
                    label={tIn('hujjat_turi')}
                    options={tasks.map((t) => ({ value: t.type, label: t.title }))}
                    value={docType}
                    onChange={(v) => v && setDocType(v as typeof docType)}
                  />
                </div>

                <Select
                  label={isRu ? 'Склад' : 'Omborxona'}
                  options={warehouseOptions}
                  value={warehouseId}
                  onChange={(val) => setWarehouseId(val)}
                  placeholder={isRu ? 'Выберите склад' : 'Omborni tanlang'}
                />
              </div>

              {/* Line Item Entry Block */}
              <div
                style={{ padding: '12px', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)' }}
                onKeyDown={(e) => {
                  // Enter in quantity or price adds the line (the form is not submitted).
                  if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
                    e.preventDefault();
                    handleAddItem();
                  }
                }}
              >
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)' }}>{isRu ? 'Добавить позицию' : 'Pozitsiya qo\'shish'} <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)' }}>· {tdoc('enterAdds')}</span></div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 'var(--space-2)', alignItems: 'end' }}>
                  <Select
                    options={productOptions}
                    value={selectedProductId}
                    onChange={(val) => {
                      setSelectedProductId(val);
                      const p = products.find((prod) => prod.id === val);
                      if (p) setUnitPrice(Number(p.costPrice) || 0);
                    }}
                    placeholder={isRu ? 'Выберите товар...' : 'Mahsulotni tanlang...'}
                  />

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-secondary)' }}>{isRu ? 'Кол-во' : 'Miqdori'}</label>
                    <QuantityInput
                      unit={products.find((p) => p.id === selectedProductId)?.unitOfMeasure}
                      value={quantity || ''}
                      onValueChange={(value) => setQuantity(Number(value) || 0)}
                      aria-label={isRu ? 'Количество' : 'Miqdor'}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-secondary)' }}>{isRu ? 'Цена за ед.' : 'Birlik Narxi'}</label>
                    <MoneyInput
                      aria-label={isRu ? 'Цена за ед.' : 'Birlik narxi'}
                      value={unitPrice || ''}
                      onValueChange={(value) => setUnitPrice(Number(value) || 0)}
                    />
                  </div>
                  <Button type="button" variant="primary" size="sm" onClick={handleAddItem} aria-label={tIn('pozitsiya_qoshish')}>
                    <Plus size={14} aria-hidden />
                  </Button>
                </div>
              </div>

              {/* Added Line Items Table */}
              {items.length > 0 && (
                <div style={{ border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)', textAlign: 'left' }}>
                    <thead style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
                      <tr>
                        <th style={{ padding: '8px' }}>{isRu ? 'Товар' : 'Mahsulot'}</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>{isRu ? 'Кол-во' : 'Miqdori'}</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>{isRu ? 'Цена' : 'Narxi'}</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>{isRu ? 'Итого' : 'Jami'}</th>
                        <th style={{ padding: '8px', textAlign: 'center' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={idx} style={{ borderTop: '1px solid var(--color-border-light)' }}>
                          <td style={{ padding: '8px' }}>{item.productName}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>{quantityWithUnit(item.quantity, item.unit, locale)}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(item.unitPrice, locale, INVENTORY_COST_CURRENCY)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'var(--font-bold)' }}>
                            {formatCurrency(item.quantity * item.unitPrice, locale, INVENTORY_COST_CURRENCY)}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <button aria-label={isRu ? 'Удалить' : 'O‘chirish'} title={isRu ? 'Удалить' : 'O‘chirish'} type="button" onClick={() => handleRemoveItem(idx)} style={{ color: 'var(--color-error-700)', border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>{isRu ? 'Комментарий' : 'Izoh'}</label>
                <input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder={isRu ? 'Дополнительные примечания к документу...' : 'Hujjat bo\'yicha qo\'shimcha izoh...'}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
                  {tCommon('cancel')}
                </Button>
                <Button type="submit" variant="primary" disabled={createLoading || items.length === 0}>
                  {createLoading ? tCommon('loading') : (isRu ? 'Провести документ' : 'Rasmiylashtirish va o‘tkazish')}
                </Button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      {/* Printable Document Modal */}
      {printDoc && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 'var(--space-4)' }}>
          <div style={{ width: '100%', maxWidth: '720px', backgroundColor: '#fff', borderRadius: 'var(--radius-lg)', padding: 'var(--space-8)', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000', paddingBottom: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
              <div>
                <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)' }}>{getDocTypeName(printDoc.docType)}</h2>
                <div style={{ fontSize: 'var(--text-sm)', color: '#666' }}>{isRu ? 'Документ №:' : 'Hujjat №:'} {printDoc.docNumber} | {isRu ? 'Дата:' : 'Sana:'} {formatDate(printDoc.docDate, locale)}</div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <Button variant="primary" size="sm" onClick={handlePrint}>
                  <Printer size={14} /> {isRu ? 'Печать' : 'Chop etish (Print)'}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setPrintDoc(null)}>
                  {isRu ? 'Закрыть' : 'Yopish'}
                </Button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-6)', fontSize: 'var(--text-xs)' }}>
              <div>
                <strong>{isRu ? 'Организация:' : 'Tashkilot:'}</strong> {getLocalizedName(company?.name, locale) === '—' ? 'Demo Company' : getLocalizedName(company?.name, locale)}<br />
                <strong>{isRu ? 'Склад:' : 'Omborxona:'}</strong> {printDoc?.warehouse?.name?.[locale] || printDoc?.warehouse?.name?.ru || printDoc?.warehouse?.name?.uz || 'Asosiy Ombor'}
              </div>
              <div>
                <strong>{isRu ? 'Составитель:' : 'Tuzuvchi:'}</strong> {printDoc?.createdBy?.firstName} {printDoc?.createdBy?.lastName}<br />
                <strong>{isRu ? 'Статус:' : 'Holati:'}</strong> {isRu ? 'Проведён (POSTED)' : 'Tasdiqlangan / O\'tkazilgan (POSTED)'}
              </div>
            </div>

            {/* Line Items Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-6)' }}>
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '1px solid #ccc' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>№</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>{isRu ? 'Товар' : 'Mahsulot'}</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>SKU</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>{isRu ? 'Кол-во' : 'Miqdori'}</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>{isRu ? 'Цена за ед.' : 'Birlik Narxi'}</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>{isRu ? 'Итого' : 'Jami'}</th>
                </tr>
              </thead>
              <tbody>
                {(printDoc.items || []).map((item, i) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px' }}>{i + 1}</td>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>{item.product?.name?.[locale] || item.product?.name?.ru || item.product?.name?.uz}</td>
                    <td style={{ padding: '8px' }}>{item.product?.sku}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{Number(item.quantity)}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(Number(item.unitPrice), locale, INVENTORY_COST_CURRENCY)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(Number(item.totalPrice), locale, INVENTORY_COST_CURRENCY)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid #000', paddingTop: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: '#666' }}>{isRu ? 'Подпись:' : 'Imzo:'} _________________________</div>
              <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)' }}>
                {isRu ? 'Итого:' : 'Jami:'} {formatCurrency(Number(printDoc.totalAmount), locale, INVENTORY_COST_CURRENCY)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
