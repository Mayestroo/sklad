'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Receipt, Truck, Plus, Building2, Layers } from 'lucide-react';
import { PurchaseExpense, PurchaseReceipt } from '@shared/types';
import { AllocateExpenseModal } from '@/components/purchases/AllocateExpenseModal';

export default function ExpensesPage() {
  const { token, company } = useAuth();

  const [expenses, setExpenses] = useState<PurchaseExpense[]>([]);
  const [receipts, setReceipts] = useState<PurchaseReceipt[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedReceipt, setSelectedReceipt] = useState<PurchaseReceipt | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchExpenses = () => {
    if (!token || !company) return;
    setLoading(true);
    apiFetch<PurchaseExpense[]>('/purchases/expenses', { token, tenantId: company.id })
      .then((res) => setExpenses(res || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!token || !company) return;

    fetchExpenses();

    // Fetch posted receipts to allow adding expenses
    apiFetch<PurchaseReceipt[]>('/purchases/receipts?status=POSTED', { token, tenantId: company.id })
      .then((res) => setReceipts(res || []))
      .catch((err) => console.error(err));
  }, [token, company]);

  const getExpenseTypeBadge = (type: string) => {
    switch (type) {
      case 'TRANSPORT':
        return <Badge variant="warning">🚚 Transport</Badge>;
      case 'CUSTOMS':
        return <Badge variant="info">🛃 Bojxona (Boj)</Badge>;
      case 'BROKER':
        return <Badge variant="neutral">💼 Broker</Badge>;
      case 'INSURANCE':
        return <Badge variant="success">🛡️ Sug&apos;urta</Badge>;
      default:
        return <Badge variant="neutral">📦 Boshqa</Badge>;
    }
  };

  // Aggregated totals
  const totalTransport = expenses.filter((e) => e.expenseType === 'TRANSPORT').reduce((s, e) => s + Number(e.amount), 0);
  const totalCustoms = expenses.filter((e) => e.expenseType === 'CUSTOMS').reduce((s, e) => s + Number(e.amount), 0);
  const totalBroker = expenses.filter((e) => e.expenseType === 'BROKER').reduce((s, e) => s + Number(e.amount), 0);
  const totalAll = expenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            🚚 Qo&apos;shimcha Xarajatlar va Tannarx (`Landed Cost`) Taqsimoti
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            Transport, bojxona, brokerlik va boshqa xarajatlarni tovarlar tannarxiga taqsimlash va hisobga olish
          </p>
        </div>
        {receipts.length > 0 && (
          <Button onClick={() => { setSelectedReceipt(receipts[0]); setIsModalOpen(true); }}>
            <Plus size={16} style={{ marginRight: '6px' }} /> Yangi Xarajat Taqsimlash
          </Button>
        )}
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-warning-50)', color: 'var(--color-warning-600)' }}>
            <Truck size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Jami Transport Xarajatlari</div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
              {formatCurrency(totalTransport, 'uz')} UZS
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-600)' }}>
            <Receipt size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Bojxona va Boj To&apos;lovlari</div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
              {formatCurrency(totalCustoms, 'uz')} UZS
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-secondary-100)', color: 'var(--color-text-primary)' }}>
            <Building2 size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Broker Xizmatlari</div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
              {formatCurrency(totalBroker, 'uz')} UZS
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-success-50)', color: 'var(--color-success-600)' }}>
            <Layers size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Jami Taqsimlangan Xarajatlar</div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: 'var(--color-success-600)' }} className="tabular-nums">
              {formatCurrency(totalAll, 'uz')} UZS
            </div>
          </div>
        </Card>
      </div>

      {/* Expenses Table */}
      <Card>
        {loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            Yuklanmoqda...
          </div>
        ) : expenses.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <Receipt size={44} style={{ margin: '0 auto var(--space-2)', opacity: 0.4 }} />
            <div>Hozircha kiritilgan qo&apos;shimcha xarajatlar mavjud emas</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-xs)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-tertiary)' }}>
                  <th style={{ padding: '12px' }}>SANASI</th>
                  <th style={{ padding: '12px' }}>XARAAT TURI</th>
                  <th style={{ padding: '12px' }}>XARID HUJJATI</th>
                  <th style={{ padding: '12px' }}>XIZMAT KURSATUVCHI</th>
                  <th style={{ padding: '12px' }}>TAQSIMLASH MEZONI</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>SUMMA</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp) => (
                  <tr key={exp.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>
                      {formatDate(exp.createdAt, 'uz')}
                    </td>
                    <td style={{ padding: '12px' }}>{getExpenseTypeBadge(exp.expenseType)}</td>
                    <td style={{ padding: '12px', fontWeight: 'var(--font-bold)', fontFamily: 'var(--font-mono)' }}>
                      {exp.receipt?.docNumber} ({exp.receipt?.counterparty?.name})
                    </td>
                    <td style={{ padding: '12px' }}>
                      {exp.supplier?.name || '—'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {exp.allocationMethod === 'BY_AMOUNT' ? '💰 Summa bo\'yicha' : '📦 Miqdor bo\'yicha'}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'var(--font-bold)', color: 'var(--color-warning-700)' }} className="tabular-nums">
                      {formatCurrency(Number(exp.amount), 'uz')} {exp.currency}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Allocate Expense Modal */}
      {isModalOpen && selectedReceipt && (
        <AllocateExpenseModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          receipt={selectedReceipt}
          onSuccess={fetchExpenses}
        />
      )}
    </div>
  );
}
