'use client';

import { quantityWithUnit } from '@/lib/units';
import { QuantityInput } from '@/components/ui/QuantityInput';
import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { formatDate, errorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { ArrowRight, ArrowRightLeft, Send, CheckCircle, Plus, Trash2, X } from 'lucide-react';
import { StockTransfer, Product } from '@shared/types';
import { useConfirm } from '@/context/ConfirmContext';
import { toast } from '@/context/ToastContext';
import type { Warehouse as WarehouseRow } from '@shared/types';

export default function StockTransfersPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();
  const confirm = useConfirm();

  const transfersQuery = useApiQuery<StockTransfer[]>('/inventory/transfers');
  const warehousesQuery = useApiQuery<WarehouseRow[]>('/tenants/warehouses');
  const productsQuery = useApiQuery<Product[]>('/inventory/products');
  const pageQueries = [transfersQuery, warehousesQuery, productsQuery];
  const transfers = transfersQuery.data ?? [];
  const warehouses = warehousesQuery.data ?? [];
  const products = productsQuery.data ?? [];
  const loading = pageQueries.some((q) => q.isPending);
  const failedQuery = pageQueries.find((q) => q.isError);

  // Transfer creation modal
  const [modalOpen, setModalOpen] = useState(false);
  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  const [comment, setComment] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [items, setItems] = useState<{ productId: string; productName: string; quantity: number; unit?: string }[]>([]);

  // Delete modal state
  const [deleteConfirmTransfer, setDeleteConfirmTransfer] = useState<StockTransfer | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteTransfer = async () => {
    if (!token || !company || !deleteConfirmTransfer) return;
    setDeleteLoading(true);
    setDeleteError(null);
    try {
      await apiFetch(`/inventory/transfers/${deleteConfirmTransfer.id}`, {
        method: 'DELETE',
        token,
        tenantId: company.id,
        locale,
      });
      setDeleteConfirmTransfer(null);
      fetchTransfers();
    } catch (err) {
      setDeleteError(errorMessage(err) || (isRu ? 'Ошибка удаления перемещения' : "O'chirishda xatolik"));
    } finally {
      setDeleteLoading(false);
    }
  };

  const fetchTransfers = () => {
    pageQueries.forEach((q) => void q.refetch());
  };

  const handleAddItem = () => {
    if (!selectedProductId || quantity <= 0) return;
    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod) return;
    const name = prod.name[locale] || prod.name.ru || prod.name.uz;
    setItems((prev) => [...prev, { productId: prod.id, productName: name, quantity, unit: prod.unitOfMeasure }]);
    setSelectedProductId('');
    setQuantity(1);
  };

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !company) return;
    if (!sourceWarehouseId || !targetWarehouseId) {
      toast.warning(isRu ? 'Выберите склады' : 'Omborlarni tanlang');
      return;
    }
    if (sourceWarehouseId === targetWarehouseId) {
      toast.warning(isRu ? 'Исходный и целевой склады не могут совпадать' : 'Chiquvchi va kiruvchi ombor bir xil bo\'lishi mumkin emas');
      return;
    }
    if (items.length === 0) {
      toast.warning(isRu ? 'Добавьте хотя бы один товар' : 'Kamida bitta tovar qo\'shing');
      return;
    }

    setCreateLoading(true);
    try {
      await apiFetch('/inventory/transfers', {
        token,
        tenantId: company.id,
        locale,
        method: 'POST',
        body: JSON.stringify({
          sourceWarehouseId,
          targetWarehouseId,
          comment,
          items,
        }),
      });
      setModalOpen(false);
      setItems([]);
      setComment('');
      toast.success(isRu ? 'Перемещение успешно создано' : 'O‘tkazma muvaffaqiyatli yaratildi');
      fetchTransfers();
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка создания перевода' : 'O‘tkazmani yaratishda xatolik'));
    } finally {
      setCreateLoading(false);
    }
  };

  const handleShip = async (id: string) => {
    if (!token || !company) return;
    const ok = await confirm({
      title: isRu ? 'Отправка перемещения' : 'O‘tkazmani jo‘natish',
      description: isRu ? 'Подтверждаете отправку товаров со склада? Статус изменится на "В пути / IN_TRANSIT".' : 'Tovarlarni chiquvchi ombordan jo\'natishni (Ship) tasdiqlaysizmi? Status "Yo\'lda / IN_TRANSIT" ga o\'tadi.',
      variant: 'info',
      confirmText: isRu ? 'Отправить' : 'Jo‘natish',
      cancelText: isRu ? 'Отмена' : 'Bekor qilish',
    });
    if (!ok) return;

    try {
      await apiFetch(`/inventory/transfers/${id}/ship`, {
        token,
        tenantId: company.id,
        locale,
        method: 'POST',
      });
      toast.success(isRu ? 'Товары успешно отправлены' : 'Tovarlar jo‘natildi');
      fetchTransfers();
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка отправки' : 'O‘tkazmani jo‘natishda xatolik'));
    }
  };

  const handleReceive = async (id: string) => {
    if (!token || !company) return;
    const ok = await confirm({
      title: isRu ? 'Приёмка перемещения' : 'O‘tkazmani qabul qilish',
      description: isRu ? 'Подтверждаете приёмку товаров на склад назначения?' : 'Tovarlarni kiruvchi omborga qabul qilishni (Receive) tasdiqlaysizmi? Tovar qoldiqlariga qo\'shiladi.',
      variant: 'info',
      confirmText: isRu ? 'Принять' : 'Qabul qilish',
      cancelText: isRu ? 'Отмена' : 'Bekor qilish',
    });
    if (!ok) return;

    try {
      await apiFetch(`/inventory/transfers/${id}/receive`, {
        token,
        tenantId: company.id,
        locale,
        method: 'POST',
      });
      toast.success(isRu ? 'Товары успешно приняты на склад' : 'Tovarlar omborga qabul qilindi');
      fetchTransfers();
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка приёмки' : 'O‘tkazmani qabul qilishda xatolik'));
    }
  };



  const warehouseOptions = warehouses.map((w) => ({
    value: w.id,
    label: w.name[locale] || w.name.ru || w.name.uz,
  }));

  const productOptions = products.map((p) => ({
    value: p.id,
    label: `${p.name[locale] || p.name.ru || p.name.uz} (${p.sku})`,
  }));

  const tt = useTranslations('rd.transfers');
  const whName = (w?: { name?: { uz?: string; ru?: string } | null } | null) => (w?.name ? w.name[locale] || w.name.ru || w.name.uz || '—' : '—');
  const columnsDef = [
    { status: 'DRAFT', title: tt('colDraft'), hint: tt('colDraftHint'), tone: 'warning' },
    { status: 'IN_TRANSIT', title: tt('colTransit'), hint: tt('colTransitHint'), tone: 'info' },
    { status: 'RECEIVED', title: tt('colReceived'), hint: tt('colReceivedHint'), tone: 'success' },
  ] as const;

  return (
    <div className="rd-page">
      <PageHeader
        title={isRu ? 'Перемещение товаров' : 'Omborlararo ko‘chirish'}
        subtitle={tt('subtitle')}
        actions={
          <Button variant="primary" onClick={() => setModalOpen(true)}>
            <Plus size={16} aria-hidden /> {isRu ? 'Создать перемещение' : 'Yangi o‘tkazma'}
          </Button>
        }
      />

      {failedQuery ? (
        <LoadError
          error={failedQuery.error}
          onRetry={() => pageQueries.filter((q) => q.isError).forEach((q) => void q.refetch())}
          retrying={pageQueries.some((q) => q.isFetching)}
        />
      ) : loading ? (
        <SkeletonRows rows={4} columns={3} />
      ) : transfers.length === 0 ? (
        <div className="rd-table-card">
          <EmptyState
            icon={ArrowRightLeft}
            title={isRu ? 'Перемещения отсутствуют' : 'Hozircha omborlararo ko‘chirishlar mavjud emas'}
            description={tt('emptyHint')}
            action={<Button onClick={() => setModalOpen(true)}><Plus size={16} aria-hidden /> {isRu ? 'Создать перемещение' : 'Yangi o‘tkazma'}</Button>}
          />
        </div>
      ) : (
        /* Workflow board: created → on the way → received; the next step is on each card */
        <div className="tr-board">
          {columnsDef.map((col) => {
            const list = transfers.filter((t) => t.status === col.status);
            return (
              <section key={col.status} className={`tr-col rd-tone-${col.tone}`} aria-labelledby={`tr-${col.status}`}>
                <header>
                  <h2 id={`tr-${col.status}`}>{col.title} <span className="rd-chip-count">{list.length}</span></h2>
                  <p>{col.hint}</p>
                </header>
                {list.length === 0 ? (
                  <p className="tr-empty">{tt('none')}</p>
                ) : (
                  <ul>
                    {list.map((tr) => (
                      <li key={tr.id} className="tr-card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <strong className="tabular-nums">{tr.transferNumber}</strong>
                          <span className="rd-sub" style={{ marginTop: 0 }}>{formatDate(tr.transferDate, locale)}</span>
                        </div>
                        <div className="tr-route">
                          <span>{whName(tr.sourceWarehouse)}</span>
                          <ArrowRight size={14} aria-hidden />
                          <span style={{ color: 'var(--color-primary-700)' }}>{whName(tr.targetWarehouse)}</span>
                        </div>
                        {(tr as { items?: unknown[] }).items && <div className="rd-sub">{tt('lines', { count: ((tr as { items?: unknown[] }).items ?? []).length })}</div>}
                        <div className="tr-actions">
                          {tr.status === 'DRAFT' && (
                            <>
                              <Button size="sm" onClick={() => handleShip(tr.id)}>
                                <Send size={14} aria-hidden /> {tt('ship')}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setDeleteConfirmTransfer(tr);
                                  setDeleteError(null);
                                }}
                                style={{ color: 'var(--color-error-700)' }}
                                aria-label={isRu ? 'Удалить перемещение' : "O'chirish"}
                                title={isRu ? 'Удалить перемещение' : "O'chirish"}
                              >
                                <Trash2 size={15} aria-hidden />
                              </Button>
                            </>
                          )}
                          {tr.status === 'IN_TRANSIT' && (
                            <Button size="sm" onClick={() => handleReceive(tr.id)}>
                              <CheckCircle size={14} aria-hidden /> {tt('receive')}
                            </Button>
                          )}
                          {tr.status === 'RECEIVED' && <span className="rd-sub" style={{ color: 'var(--color-success-700)', marginTop: 0 }}>✓ {isRu ? 'Завершено' : 'Yakunlandi'}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      {/* New Transfer Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={isRu ? 'Новое перемещение между складами' : 'Yangi Omborlararo Transfer'}>
        <form onSubmit={handleCreateTransfer} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', gap: 'var(--space-2)', alignItems: 'end' }}>
            <Select
              label={isRu ? 'Склад отправитель *' : 'Chiquvchi Ombor *'}
              options={warehouseOptions}
              value={sourceWarehouseId}
              onChange={(val) => setSourceWarehouseId(val)}
              placeholder={isRu ? 'Выберите склад' : 'Chiquvchi omborni tanlang'}
            />
            <Button
              type="button"
              variant="ghost"
              aria-label={tt('swap')}
              title={tt('swap')}
              onClick={() => {
                setSourceWarehouseId(targetWarehouseId);
                setTargetWarehouseId(sourceWarehouseId);
              }}
            >
              <ArrowRightLeft size={16} aria-hidden />
            </Button>

            <Select
              label={isRu ? 'Склад получатель *' : 'Kiruvchi Ombor *'}
              options={warehouseOptions}
              value={targetWarehouseId}
              onChange={(val) => setTargetWarehouseId(val)}
              placeholder={isRu ? 'Выберите склад' : 'Kiruvchi omborni tanlang'}
            />
          </div>

          <Input label={isRu ? 'Комментарий' : 'Izoh'} value={comment} onChange={(e) => setComment(e.target.value)} />

          <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 'var(--space-3)' }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)' }}>{isRu ? 'Перемещаемые товары:' : 'Ko‘chiriladigan Tovarlar:'}</div>
            <div
              style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-1)', flexWrap: 'wrap' }}
              onKeyDown={(e) => {
                // Enter in the quantity adds the line instead of submitting the form.
                if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
                  e.preventDefault();
                  handleAddItem();
                }
              }}
            >
              <Select
                options={productOptions}
                value={selectedProductId}
                onChange={(val) => setSelectedProductId(val)}
                placeholder={isRu ? 'Выберите товар' : 'Mahsulotni tanlang'}
                style={{ flex: 1 }}
              />
              <QuantityInput
                unit={products.find((p) => p.id === selectedProductId)?.unitOfMeasure}
                value={quantity || ''}
                onValueChange={(value) => setQuantity(Number(value) || 0)}
                aria-label={isRu ? 'Количество' : 'Miqdor'}
                style={{ width: '140px' }}
              />
              <Button type="button" variant="outline" onClick={handleAddItem}>{isRu ? 'Добавить' : 'Qo‘shish'}</Button>
            </div>
            {selectedProductId && sourceWarehouseId && (
              <div className="rd-sub" style={{ marginBottom: 'var(--space-3)' }}>
                {tt('inSource', {
                  qty: Number(((products.find((p) => p.id === selectedProductId) as { stockLevels?: Array<{ warehouseId: string; quantity: number | string }> } | undefined)?.stockLevels ?? []).find((l) => l.warehouseId === sourceWarehouseId)?.quantity ?? 0),
                })}
              </div>
            )}

            {items.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {items.map((it, idx) => (
                  <div key={idx} style={{ padding: '6px 12px', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)' }}>
                    <span>{it.productName}</span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <strong>{quantityWithUnit(it.quantity, it.unit, locale)}</strong>
                      <button type="button" className="rd-linkbtn" onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))} aria-label={tt('removeLine', { name: it.productName })}>
                        <X size={14} aria-hidden />
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>{isRu ? 'Отмена' : 'Bekor qilish'}</Button>
            <Button type="submit" variant="primary" disabled={createLoading}>{createLoading ? (isRu ? 'Создание...' : 'Yaratilmoqda...') : isRu ? 'Создать перемещение' : 'O‘tkazma yaratish'}</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      {deleteConfirmTransfer && (
        <Modal
          isOpen={Boolean(deleteConfirmTransfer)}
          onClose={() => setDeleteConfirmTransfer(null)}
          title={isRu ? 'Удалить перемещение?' : "O'tkazmani o'chirish?"}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            {deleteError && (
              <div style={{ padding: 'var(--space-3)', backgroundColor: 'var(--color-error-50)', color: 'var(--color-error-700)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}>
                {deleteError}
              </div>
            )}

            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              {isRu
                ? `Вы уверены, что хотите удалить перемещение ${deleteConfirmTransfer.transferNumber}?`
                : `Haqiqatan ham ${deleteConfirmTransfer.transferNumber} raqamli qoralama o'tkazmani o'chirmoqchimisiz?`}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <Button variant="secondary" onClick={() => setDeleteConfirmTransfer(null)} disabled={deleteLoading}>
                {isRu ? 'Отмена' : 'Bekor qilish'}
              </Button>
              <Button variant="danger"
                onClick={handleDeleteTransfer}
                disabled={deleteLoading}
              >
                {deleteLoading ? (isRu ? 'Удаление...' : 'O‘chirilmoqda...') : (isRu ? 'Да, удалить' : 'Ha, o‘chirish')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
