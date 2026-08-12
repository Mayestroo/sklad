'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { ArrowRightLeft, Send, CheckCircle, Plus, Warehouse, Package } from 'lucide-react';
import { StockTransfer, Product } from '@shared/types';

export default function StockTransfersPage() {
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();

  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Transfer creation modal
  const [modalOpen, setModalOpen] = useState(false);
  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  const [comment, setComment] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [items, setItems] = useState<{ productId: string; productName: string; quantity: number }[]>([]);

  const fetchTransfers = async () => {
    if (!token || !company) return;
    setLoading(true);
    try {
      const [transData, whData, prodData] = await Promise.all([
        apiFetch<StockTransfer[]>('/inventory/transfers', { token, tenantId: company.id, locale }),
        apiFetch<any[]>('/tenants/warehouses', { token, tenantId: company.id, locale }),
        apiFetch<Product[]>('/inventory/products', { token, tenantId: company.id, locale }),
      ]);
      setTransfers(transData || []);
      setWarehouses(whData || []);
      setProducts(prodData || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransfers();
  }, [token, company, locale]);

  const handleAddItem = () => {
    if (!selectedProductId || quantity <= 0) return;
    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod) return;
    const name = prod.name[locale] || prod.name.ru || prod.name.uz;
    setItems((prev) => [...prev, { productId: prod.id, productName: name, quantity }]);
    setSelectedProductId('');
    setQuantity(1);
  };

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !company) return;
    if (!sourceWarehouseId || !targetWarehouseId) {
      alert(isRu ? 'Выберите склады' : 'Omborlarni tanlang');
      return;
    }
    if (sourceWarehouseId === targetWarehouseId) {
      alert(isRu ? 'Исходный и целевой склады не могут совпадать' : 'Chiquvchi va kiruvchi ombor bir xil bo\'lishi mumkin emas');
      return;
    }
    if (items.length === 0) {
      alert(isRu ? 'Добавьте хотя бы один товар' : 'Kamida bitta tovar qo\'shing');
      return;
    }

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
      fetchTransfers();
    } catch (err: any) {
      alert(err.message || (isRu ? 'Ошибка создания перевода' : 'Error creating transfer'));
    }
  };

  const handleShip = async (id: string) => {
    if (!token || !company) return;
    if (!confirm(isRu ? 'Подтверждаете отправку товаров со склада? Статус изменится на "В пути / IN_TRANSIT".' : 'Tovarlarni chiquvchi ombordan jo\'natishni (Ship) tasdiqlaysizmi? Status "Yo\'lda / IN_TRANSIT" ga o\'tadi.')) return;

    try {
      await apiFetch(`/inventory/transfers/${id}/ship`, {
        token,
        tenantId: company.id,
        locale,
        method: 'POST',
      });
      fetchTransfers();
    } catch (err: any) {
      alert(err.message || (isRu ? 'Ошибка отправки' : 'Error shipping transfer'));
    }
  };

  const handleReceive = async (id: string) => {
    if (!token || !company) return;
    if (!confirm(isRu ? 'Подтверждаете приёмку товаров на склад назначения?' : 'Tovarlarni kiruvchi omborga qabul qilishni (Receive) tasdiqlaysizmi? Tovar qoldiqlariga qo\'shiladi.')) return;

    try {
      await apiFetch(`/inventory/transfers/${id}/receive`, {
        token,
        tenantId: company.id,
        locale,
        method: 'POST',
      });
      fetchTransfers();
    } catch (err: any) {
      alert(err.message || (isRu ? 'Ошибка приёмки' : 'Error receiving transfer'));
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
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            {isRu ? 'Межскладские Перемещения (Stock Transfers)' : 'Omborlararo Tovar Ko‘chirish (Stock Transfers)'}
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            {isRu ? 'Двухэтапный процесс отгрузки (Ship) и приёмки (Receive), проводки по счёту 2920' : 'Ikki bosqichli jo‘natish (Ship) va qabul qilish (Receive) workflow hamda 2920 Yo‘ldagi tovarlar provodkasi'}
          </p>
        </div>

        <Button variant="primary" onClick={() => setModalOpen(true)}>
          <Plus size={16} /> {isRu ? 'Создать перемещение' : 'Yangi Transfer Yaratish'}
        </Button>
      </div>

      <Card>
        {loading ? (
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
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
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
                    <td style={{ padding: '12px', fontWeight: 'var(--font-bold)', fontFamily: 'var(--font-mono)' }}>
                      {tr.transferNumber}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>
                      {formatDate(tr.transferDate, locale)}
                    </td>
                    <td style={{ padding: '12px', fontWeight: 'var(--font-medium)' }}>
                      {tr.sourceWarehouse?.name?.[locale] || tr.sourceWarehouse?.name?.ru || tr.sourceWarehouse?.name?.uz || 'Chiquvchi ombor'}
                    </td>
                    <td style={{ padding: '12px', fontWeight: 'var(--font-medium)', color: 'var(--color-primary-600)' }}>
                      {tr.targetWarehouse?.name?.[locale] || tr.targetWarehouse?.name?.ru || tr.targetWarehouse?.name?.uz || 'Kiruvchi ombor'}
                    </td>
                    <td style={{ padding: '12px' }}>{getStatusBadge(tr.status)}</td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      {tr.status === 'DRAFT' && (
                        <Button size="sm" variant="primary" onClick={() => handleShip(tr.id)}>
                          <Send size={14} /> 1. {isRu ? 'Отправить (Ship)' : 'Jo‘natish (Ship)'}
                        </Button>
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

          <Input label={isRu ? 'Комментарий' : 'Izoh (Comment)'} value={comment} onChange={(e) => setComment(e.target.value)} />

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
              <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} style={{ width: '90px' }} />
              <Button type="button" variant="outline" onClick={handleAddItem}>{isRu ? 'Добавить' : 'Qo‘shish'}</Button>
            </div>

            {items.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {items.map((it, idx) => (
                  <div key={idx} style={{ padding: '6px 12px', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)' }}>
                    <span>{it.productName}</span>
                    <strong>{it.quantity} {isRu ? 'шт' : 'ta'}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>{isRu ? 'Отмена' : 'Bekor qilish'}</Button>
            <Button type="submit" variant="primary">{isRu ? 'Создать перемещение' : 'Transfer Yaratish'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
