'use client';

import { quantityWithUnit } from '@/lib/units';
import { QuantityInput } from '@/components/ui/QuantityInput';
import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { formatDate, errorMessage } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { ArrowRightLeft, Send, CheckCircle, Plus, Trash2 } from 'lucide-react';
import { StockTransfer, Product } from '@shared/types';
import { useConfirm } from '@/context/ConfirmContext';
import { toast } from '@/context/ToastContext';
import type { Warehouse as WarehouseRow } from '@shared/types';

export default function StockTransfersPage() {
  const tCommon = useTranslations('common');
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <Badge variant="neutral">{isRu ? 'Черновик (DRAFT)' : 'Qoralama (DRAFT)'}</Badge>;
      case 'IN_TRANSIT':
        return <Badge variant="warning">{isRu ? 'В пути (IN_TRANSIT)' : 'Yo\'lda (IN_TRANSIT)'}</Badge>;
      case 'RECEIVED':
        return <Badge variant="success">{isRu ? 'Принято (RECEIVED)' : 'Qabul qilindi (RECEIVED)'}</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', margin: 0 }}>
            {isRu ? 'Перемещение товаров' : 'Omborlararo ko‘chirish'}
          </h1>
        </div>

        <Button variant="primary" onClick={() => setModalOpen(true)}>
          <Plus size={16} /> {isRu ? 'Создать перемещение' : 'Yangi o‘tkazma'}
        </Button>
      </div>

      <Card>
        {failedQuery ? (
          <LoadError
            error={failedQuery.error}
            onRetry={() => pageQueries.filter((q) => q.isError).forEach((q) => void q.refetch())}
            retrying={pageQueries.some((q) => q.isFetching)}
          />
        ) : loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            {tCommon('loading')}
          </div>
        ) : transfers.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <ArrowRightLeft size={40} style={{ margin: '0 auto var(--space-2)', opacity: 0.4 }} />
            <div>{isRu ? 'Перемещения отсутствуют' : 'Hozircha omborlararo ko‘chirishlar mavjud emas'}</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="app-table-stack" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                  <th style={{ padding: '12px' }}>{isRu ? '№ ТРАНСФЕРА' : 'TRANSFER №'}</th>
                  <th style={{ padding: '12px' }}>{isRu ? 'ДАТА' : 'SANA'}</th>
                  <th style={{ padding: '12px' }}>{isRu ? 'СКЛАД ОТПРАВИТЕЛЬ' : 'CHIQUVCHI OMBOR'}</th>
                  <th style={{ padding: '12px' }}>{isRu ? 'СКЛАД ПОЛУЧАТЕЛЬ' : 'KIRUVCHI OMBOR'}</th>
                  <th style={{ padding: '12px' }}>{isRu ? 'СТАТУС' : 'HOLATI'}</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>{isRu ? 'ДЕЙСТВИЯ (WORKFLOW)' : 'AMALLAR (WORKFLOW)'}</th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((tr) => (
                  <tr key={tr.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td data-primary style={{ padding: '12px', fontWeight: 'var(--font-bold)', fontFamily: 'var(--font-mono)' }}>
                      {tr.transferNumber}
                    </td>
                    <td data-label={isRu ? 'ДАТА' : 'SANA'} style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>
                      {formatDate(tr.transferDate, locale)}
                    </td>
                    <td data-label={isRu ? 'СКЛАД ОТПРАВИТЕЛЬ' : 'CHIQUVCHI OMBOR'} style={{ padding: '12px', fontWeight: 'var(--font-medium)' }}>
                      {tr.sourceWarehouse?.name?.[locale] || tr.sourceWarehouse?.name?.ru || tr.sourceWarehouse?.name?.uz || 'Chiquvchi ombor'}
                    </td>
                    <td data-label={isRu ? 'СКЛАД ПОЛУЧАТЕЛЬ' : 'KIRUVCHI OMBOR'} style={{ padding: '12px', fontWeight: 'var(--font-medium)', color: 'var(--color-primary-600)' }}>
                      {tr.targetWarehouse?.name?.[locale] || tr.targetWarehouse?.name?.ru || tr.targetWarehouse?.name?.uz || 'Kiruvchi ombor'}
                    </td>
                    <td data-label={isRu ? 'СТАТУС' : 'HOLATI'} style={{ padding: '12px' }}>{getStatusBadge(tr.status)}</td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      {tr.status === 'DRAFT' && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <Button size="sm" variant="primary" onClick={() => handleShip(tr.id)}>
                            <Send size={14} /> 1. {isRu ? 'Отправить (Ship)' : 'Jo‘natish (Ship)'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setDeleteConfirmTransfer(tr);
                              setDeleteError(null);
                            }}
                            style={{ color: 'var(--color-error-600)', padding: '4px 8px' }}
                            title={isRu ? 'Удалить перемещение' : "O'chirish"}
                          >
                            <Trash2 size={15} />
                          </Button>
                        </div>
                      )}
                      {tr.status === 'IN_TRANSIT' && (
                        <Button size="sm" variant="primary" onClick={() => handleReceive(tr.id)} style={{ backgroundColor: 'var(--color-success-600)' }}>
                          <CheckCircle size={14} /> 2. {isRu ? 'Принять (Receive)' : 'Qabul qilish (Receive)'}
                        </Button>
                      )}
                      {tr.status === 'RECEIVED' && (
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success-600)', fontWeight: 'bold' }}>
                          ✓ {isRu ? 'Завершено' : 'Yakunlandi'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* New Transfer Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={isRu ? 'Новое перемещение между складами' : 'Yangi Omborlararo Transfer'}>
        <form onSubmit={handleCreateTransfer} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <Select
              label={isRu ? 'Склад отправитель *' : 'Chiquvchi Ombor *'}
              options={warehouseOptions}
              value={sourceWarehouseId}
              onChange={(val) => setSourceWarehouseId(val)}
              placeholder={isRu ? 'Выберите склад' : 'Chiquvchi omborni tanlang'}
            />

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
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
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

            {items.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {items.map((it, idx) => (
                  <div key={idx} style={{ padding: '6px 12px', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)' }}>
                    <span>{it.productName}</span>
                    <strong>{quantityWithUnit(it.quantity, it.unit, locale)}</strong>
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
              <div style={{ padding: 'var(--space-3)', backgroundColor: 'var(--color-error-50)', color: 'var(--color-error-600)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)' }}>
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
              <Button
                onClick={handleDeleteTransfer}
                disabled={deleteLoading}
                style={{ backgroundColor: 'var(--color-error-500)', color: '#fff' }}
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
