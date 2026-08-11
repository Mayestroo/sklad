'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  Factory,
  Plus,
  Boxes,
  Wrench,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  Layers,
} from 'lucide-react';

interface ProductionOrder {
  id: string;
  orderNumber: string;
  productName: string;
  quantity: number;
  unit: string;
  status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  startDate: string;
  targetDate: string;
  estimatedCost: number;
  rawMaterialsCount: number;
}

const DEMO_PRODUCTION_ORDERS: ProductionOrder[] = [
  {
    id: '1',
    orderNumber: 'PRD-2026-001',
    productName: 'Gazlangan Salqin Ichimlik 1.5L (Blok 6 dona)',
    quantity: 500,
    unit: 'blok',
    status: 'IN_PROGRESS',
    startDate: '2026-08-10',
    targetDate: '2026-08-15',
    estimatedCost: 18500000,
    rawMaterialsCount: 4,
  },
  {
    id: '2',
    orderNumber: 'PRD-2026-002',
    productName: 'Tozalangan Ichimlik Suvi 0.5L (Blok 12 dona)',
    quantity: 1200,
    unit: 'blok',
    status: 'COMPLETED',
    startDate: '2026-08-01',
    targetDate: '2026-08-05',
    estimatedCost: 21600000,
    rawMaterialsCount: 3,
  },
  {
    id: '3',
    orderNumber: 'PRD-2026-003',
    productName: 'Plastik Shisha Idish 1.5L (Preforma)',
    quantity: 5000,
    unit: 'dona',
    status: 'DRAFT',
    startDate: '2026-08-12',
    targetDate: '2026-08-18',
    estimatedCost: 7500000,
    rawMaterialsCount: 2,
  },
];

export default function ProductionPage() {
  const locale = (useLocale() as 'uz' | 'ru') || 'uz';
  const [orders, setOrders] = useState<ProductionOrder[]>(DEMO_PRODUCTION_ORDERS);
  const [modalOpen, setModalOpen] = useState(false);
  const [newProduct, setNewProduct] = useState('');
  const [newQty, setNewQty] = useState('');
  const [newCost, setNewCost] = useState('');

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct || !newQty) return;

    const newOrd: ProductionOrder = {
      id: String(Date.now()),
      orderNumber: `PRD-2026-00${orders.length + 1}`,
      productName: newProduct,
      quantity: Number(newQty),
      unit: 'dona',
      status: 'IN_PROGRESS',
      startDate: new Date().toISOString().slice(0, 10),
      targetDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
      estimatedCost: Number(newCost) || 5000000,
      rawMaterialsCount: 3,
    };

    setOrders([newOrd, ...orders]);
    setModalOpen(false);
    setNewProduct('');
    setNewQty('');
    setNewCost('');
  };

  const getStatusBadge = (status: ProductionOrder['status']) => {
    switch (status) {
      case 'COMPLETED':
        return <Badge variant="success"><CheckCircle2 size={12} style={{ marginRight: 4 }} /> Bajarildi</Badge>;
      case 'IN_PROGRESS':
        return <Badge variant="warning"><Clock size={12} style={{ marginRight: 4 }} /> Jarayonda</Badge>;
      case 'DRAFT':
        return <Badge variant="info"><Layers size={12} style={{ marginRight: 4 }} /> Qoralama</Badge>;
      case 'CANCELLED':
        return <Badge variant="error"><AlertCircle size={12} style={{ marginRight: 4 }} /> Bekor qilingan</Badge>;
    }
  };

  const inProgressCount = orders.filter((o) => o.status === 'IN_PROGRESS').length;
  const completedCount = orders.filter((o) => o.status === 'COMPLETED').length;
  const totalCost = orders.reduce((sum, o) => sum + o.estimatedCost, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            Ishlab chiqarish (Production & Assembly)
          </h1>
        </div>

        <Button variant="primary" onClick={() => setModalOpen(true)}>
          <Plus size={16} /> Ishlab chiqarish buyurtmasi
        </Button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-lg)', backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Clock size={22} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Jarayondagi buyurtmalar</div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
              {inProgressCount} ta
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-lg)', backgroundColor: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={22} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Bajarilgan buyurtmalar</div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
              {completedCount} ta
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{ width: 44, height: 44, borderRadius: 'var(--radius-lg)', backgroundColor: '#FEF3C7', color: '#D97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Factory size={22} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Jami rejalashtirilgan tan narx</div>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
              {formatCurrency(totalCost, locale)}
            </div>
          </div>
        </Card>
      </div>

      {/* Orders Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border-light)', fontWeight: 'var(--font-semibold)' }}>
          Ishlab chiqarish buyurtmalari jurnali
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '12px 16px' }}>Buyurtma №</th>
              <th style={{ padding: '12px 16px' }}>Mahsulot Nomi</th>
              <th style={{ padding: '12px 16px' }}>Miqdori</th>
              <th style={{ padding: '12px 16px' }}>Reja Tan Narxi</th>
              <th style={{ padding: '12px 16px' }}>Boshlanish Sanasi</th>
              <th style={{ padding: '12px 16px' }}>Tugash Sanasi</th>
              <th style={{ padding: '12px 16px' }}>Holat</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((ord) => (
              <tr key={ord.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                <td style={{ padding: '12px 16px', fontWeight: 'var(--font-semibold)' }}>{ord.orderNumber}</td>
                <td style={{ padding: '12px 16px', color: 'var(--color-text-primary)' }}>{ord.productName}</td>
                <td style={{ padding: '12px 16px' }}>{ord.quantity} {ord.unit}</td>
                <td style={{ padding: '12px 16px', fontWeight: 'var(--font-medium)' }}>{formatCurrency(ord.estimatedCost, locale)}</td>
                <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>{formatDate(ord.startDate, locale)}</td>
                <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>{formatDate(ord.targetDate, locale)}</td>
                <td style={{ padding: '12px 16px' }}>{getStatusBadge(ord.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Yangi ishlab chiqarish buyurtmasi">
        <form onSubmit={handleCreateOrder} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Input
            label="Chiqariladigan Mahsulot Nomi"
            placeholder="Masalan: Gazlangan suv 1.5L"
            value={newProduct}
            onChange={(e) => setNewProduct(e.target.value)}
            required
          />
          <Input
            label="Rejalashtirilgan Miqdor"
            type="number"
            placeholder="100"
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
            required
          />
          <Input
            label="Taxminiy Tan Narx (UZS)"
            type="number"
            placeholder="5000000"
            value={newCost}
            onChange={(e) => setNewCost(e.target.value)}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Bekor qilish</Button>
            <Button type="submit" variant="primary">Buyurtma Yaratish</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
