'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
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
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();

  const [expenses, setExpenses] = useState<PurchaseExpense[]>([]);
  const [receipts, setReceipts] = useState<PurchaseReceipt[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedReceipt, setSelectedReceipt] = useState<PurchaseReceipt | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const fetchExpenses = () => {
    if (!token || !company) return;
    setLoading(true);
    apiFetch<PurchaseExpense[]>('/purchases/expenses', { token, tenantId: company.id, locale })
      .then((res) => setExpenses(res || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!token || !company) return;

    fetchExpenses();

    // Fetch posted receipts to allow adding expenses
    apiFetch<PurchaseReceipt[]>('/purchases/receipts?status=POSTED', { token, tenantId: company.id, locale })
      .then((res) => setReceipts(res || []))
      .catch((err) => console.error(err));
  }, [token, company, locale]);

  const getExpenseTypeBadge = (type: string) => {
    switch (type) {
      case 'TRANSPORT':
        return <Badge variant="warning">{isRu ? 'Транспорт' : 'Transport'}</Badge>;
      case 'CUSTOMS':
        return <Badge variant="info">{isRu ? 'Таможня (Пошлина)' : 'Bojxona (Boj)'}</Badge>;
      case 'BROKER':
        return <Badge variant="neutral">{isRu ? 'Брокер' : 'Broker'}</Badge>;
      case 'INSURANCE':
        return <Badge variant="success">{isRu ? 'Страхование' : 'Sug‘urta'}</Badge>;
      default:
        return <Badge variant="neutral">{isRu ? 'Прочее' : 'Boshqa'}</Badge>;
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            {isRu ? 'Дополнительные Расходы и Себестоимость (Landed Cost)' : 'Qo‘shimcha Xarajatlar va Tannarx (Landed Cost) Taqsimoti'}
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            {isRu ? 'Распределение транспортных, таможенных и брокерских расходов на себестоимость товаров' : 'Transport, bojxona, brokerlik va boshqa xarajatlarni tovarlar tannarxiga taqsimlash va hisobga olish'}
          </p>
        </div>
        {receipts.length > 0 && (
          <Button onClick={() => { setSelectedReceipt(receipts[0]); setIsModalOpen(true); }}>
            <Plus size={16} style={{ marginRight: '6px' }} /> {isRu ? 'Распределить расход' : 'Yangi Xarajat Taqsimlash'}
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
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Транспортные расходы' : 'Jami Transport Xarajatlari'}</div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
              {formatCurrency(totalTransport, locale)}
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-primary-50)', color: 'var(--color-primary-600)' }}>
            <Receipt size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Таможенные пошлины' : 'Bojxona va Boj To‘lovlari'}</div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
              {formatCurrency(totalCustoms, locale)}
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-secondary-100)', color: 'var(--color-text-primary)' }}>
            <Building2 size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Услуги брокера' : 'Broker Xizmatlari'}</div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
              {formatCurrency(totalBroker, locale)}
            </div>
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-success-50)', color: 'var(--color-success-600)' }}>
            <Layers size={24} />
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{isRu ? 'Всего распределено' : 'Jami Taqsimlangan Xarajatlar'}</div>
            <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', color: 'var(--color-success-600)' }} className="tabular-nums">
              {formatCurrency(totalAll, locale)}
            </div>
          </div>
        </Card>
      </div>

      {/* Expenses Table */}
      <Card>
        {loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            {isRu ? 'Загрузка...' : 'Yuklanmoqda...'}
          </div>
        ) : expenses.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <Receipt size={44} style={{ margin: '0 auto var(--space-2)', opacity: 0.4 }} />
            <div>{isRu ? 'Расходы не найдены' : 'Hozircha kiritilgan qo‘shimcha xarajatlar mavjud emas'}</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-xs)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)', color: 'var(--color-text-tertiary)' }}>
                  <th style={{ padding: '12px' }}>{isRu ? 'ДАТА' : 'SANASI'}</th>
                  <th style={{ padding: '12px' }}>{isRu ? 'ТИП РАСХОДА' : 'XARAJAT TURI'}</th>
                  <th style={{ padding: '12px' }}>{isRu ? 'ПРИХОДНЫЙ ДОКУМЕНТ' : 'XARID HUJJATI'}</th>
                  <th style={{ padding: '12px' }}>{isRu ? 'ПОСТАВЩИК УСЛУГ' : 'XIZMAT KO‘RSATUVCHI'}</th>
                  <th style={{ padding: '12px' }}>{isRu ? 'МЕТОД РАСПРЕДЕЛЕНИЯ' : 'TAQSIMLASH MEZONI'}</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>{isRu ? 'СУММА' : 'SUMMA'}</th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((exp) => (
                  <tr key={exp.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>
                      {formatDate(exp.createdAt, locale)}
                    </td>
                    <td style={{ padding: '12px' }}>{getExpenseTypeBadge(exp.expenseType)}</td>
                    <td style={{ padding: '12px', fontWeight: 'var(--font-bold)', fontFamily: 'var(--font-mono)' }}>
                      {exp.receipt?.docNumber} ({exp.receipt?.counterparty?.name})
                    </td>
                    <td style={{ padding: '12px' }}>
                      {exp.supplier?.name || '—'}
                    </td>
                    <td style={{ padding: '12px' }}>
                      {exp.allocationMethod === 'BY_AMOUNT'
                        ? (isRu ? 'По сумме' : 'Summa bo\'yicha')
                        : (isRu ? 'По количеству' : 'Miqdor bo\'yicha')}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'var(--font-bold)', color: 'var(--color-warning-700)' }} className="tabular-nums">
                      {formatCurrency(Number(exp.amount), locale)} {exp.currency}
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
