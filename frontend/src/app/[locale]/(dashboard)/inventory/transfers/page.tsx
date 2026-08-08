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
      setTransfers(transData);
      setWarehouses(whData);
      setProducts(prodData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransfers();
  }, [token, company]);

  const handleAddItem = () => {
    if (!selectedProductId || quantity <= 0) return;
    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod) return;

    setItems([...items, { productId: prod.id, productName: prod.name[locale] || prod.name.uz, quantity }]);
    setSelectedProductId('');
    setQuantity(1);
  };

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !company || !sourceWarehouseId || !targetWarehouseId || items.length === 0) {
      alert('Iltimos chiquvchi ombor, kiruvchi ombor va kamida 1 ta tovar kiriting');
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
          items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        }),
      });

      setModalOpen(false);
      setItems([]);
      setComment('');
      fetchTransfers();
    } catch (err: any) {
      alert(err.message || 'Error creating transfer');
    }
  };

  const handleShip = async (id: string) => {
    if (!token || !company) return;
    if (!confirm('Tovarlarni chiquvchi ombordan jo\'natishni (Ship) tasdiqlaysizmi? Status "Yo\'lda / IN_TRANSIT" ga o\'tadi va 2920 shchotiga o\'tkaziladi.')) return;

    try {
      await apiFetch(`/inventory/transfers/${id}/ship`, {
        token,
        tenantId: company.id,
        locale,
        method: 'POST',
      });
      fetchTransfers();
    } catch (err: any) {
      alert(err.message || 'Error shipping transfer');
    }
  };

  const handleReceive = async (id: string) => {
    if (!token || !company) return;
    if (!confirm('Tovarlarni kiruvchi omborga qabul qilishni (Receive) tasdiqlaysizmi? Tovar qoldiqlariga qo\'shiladi.')) return;

    try {
      await apiFetch(`/inventory/transfers/${id}/receive`, {
        token,
        tenantId: company.id,
        locale,
        method: 'POST',
      });
      fetchTransfers();
    } catch (err: any) {
      alert(err.message || 'Error receiving transfer');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <Badge variant="neutral">Qoralama (DRAFT)</Badge>;
      case 'IN_TRANSIT':
        return <Badge variant="warning">Yo&apos;lda (IN_TRANSIT)</Badge>;
      case 'RECEIVED':
        return <Badge variant="success">Qabul qilindi (RECEIVED)</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const warehouseOptions = warehouses.map((w) => ({
    value: w.id,
    label: w.name[locale] || w.name.uz,
  }));

  const productOptions = products.map((p) => ({
    value: p.id,
    label: `${p.name[locale] || p.name.uz} (${p.sku})`,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            Omborlararo Tovar Ko&apos;chirish (Stock Transfers)
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            Ikki bosqichli jo&apos;natish (Ship) va qabul qilish (Receive) workflow hamda 2920 Yo&apos;ldagi tovarlar provodkasi
          </p>
        </div>

        <Button variant="primary" onClick={() => setModalOpen(true)}>
          <Plus size={16} /> Yangi Transfer Yaratish
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
            <div>Hozircha omborlararo ko&apos;chirishlar mavjud emas</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                  <th style={{ padding: '12px' }}>TRANSFER №</th>
                  <th style={{ padding: '12px' }}>SANA</th>
                  <th style={{ padding: '12px' }}>CHIQUVCHI OMBOR</th>
                  <th style={{ padding: '12px' }}>KIRUVCHI OMBOR</th>
                  <th style={{ padding: '12px' }}>HOLATI</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>AMALLAR (WORKFLOW)</th>
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
                      {tr.sourceWarehouse?.name?.[locale] || tr.sourceWarehouse?.name?.uz || 'Chiquvchi ombor'}
                    </td>
                    <td style={{ padding: '12px', fontWeight: 'var(--font-medium)', color: 'var(--color-primary-600)' }}>
                      {tr.targetWarehouse?.name?.[locale] || tr.targetWarehouse?.name?.uz || 'Kiruvchi ombor'}
                    </td>
                    <td style={{ padding: '12px' }}>{getStatusBadge(tr.status)}</td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      {tr.status === 'DRAFT' && (
                        <Button size="sm" variant="primary" onClick={() => handleShip(tr.id)}>
                          <Send size={14} /> 1. Jo&apos;natish (Ship)
                        </Button>
                      )}
                      {tr.status === 'IN_TRANSIT' && (
                        <Button size="sm" variant="primary" onClick={() => handleReceive(tr.id)} style={{ backgroundColor: 'var(--color-success-600)' }}>
                          <CheckCircle size={14} /> 2. Qabul qilish (Receive)
                        </Button>
                      )}
                      {tr.status === 'RECEIVED' && (
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success-600)', fontWeight: 'bold' }}>
                          ✓ Yakunlandi
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
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Yangi Omborlararo Transfer">
        <form onSubmit={handleCreateTransfer} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
            <Select
              label="Chiquvchi Ombor *"
              options={warehouseOptions}
              value={sourceWarehouseId}
              onChange={(val) => setSourceWarehouseId(val)}
              placeholder="Chiquvchi omborni tanlang"
            />

            <Select
              label="Kiruvchi Ombor *"
              options={warehouseOptions}
              value={targetWarehouseId}
              onChange={(val) => setTargetWarehouseId(val)}
              placeholder="Kiruvchi omborni tanlang"
            />
          </div>

          <Input label="Izoh (Comment)" value={comment} onChange={(e) => setComment(e.target.value)} />

          <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 'var(--space-3)' }}>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)' }}>Ko&apos;chiriladigan Tovarlar:</div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              <Select
                options={productOptions}
                value={selectedProductId}
                onChange={(val) => setSelectedProductId(val)}
                placeholder="Mahsulotni tanlang"
                style={{ flex: 1 }}
              />
              <Input type="number" min={1} value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} style={{ width: '90px' }} />
              <Button type="button" variant="outline" onClick={handleAddItem}>Qo&apos;shish</Button>
            </div>

            {items.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {items.map((it, idx) => (
                  <div key={idx} style={{ padding: '6px 12px', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-xs)' }}>
                    <span>{it.productName}</span>
                    <strong>{it.quantity} ta</strong>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Bekor qilish</Button>
            <Button type="submit" variant="primary">Transfer Yaratish</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
