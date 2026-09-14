'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  X,
  Printer,
  Calendar,
  FileText,
  DollarSign,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  RotateCcw,
  Building2,
  Phone,
  CreditCard,
} from 'lucide-react';

interface StatementTx {
  id: string;
  date: string;
  docNumber: string;
  type: 'SALES_INVOICE' | 'PURCHASE_RECEIPT' | 'PAYMENT_INCOME' | 'PAYMENT_EXPENSE' | 'SALES_RETURN' | 'PURCHASE_RETURN';
  description: string;
  debit: number;
  credit: number;
  amount: number;
  currency: string;
}

interface StatementData {
  counterparty: {
    id: string;
    name: string;
    type: 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
    inn?: string;
    phone?: string;
    email?: string;
    address?: string;
    customerDebt: number;
    supplierDebt: number;
    netBalance: number;
    folder?: { name: string; color?: string } | null;
    priceList?: { name: any } | null;
  };
  summary: {
    customerDebt: number;
    supplierDebt: number;
    netBalance: number;
    totalSalesInvoiced: number;
    totalPurchasesInvoiced: number;
    totalTransactionsCount: number;
  };
  transactions: StatementTx[];
}

interface AktSverkaDrawerProps {
  isOpen: boolean;
  counterpartyId: string | null;
  onClose: () => void;
  onOpenPayment?: (counterparty: any) => void;
}

export function AktSverkaDrawer({
  isOpen,
  counterpartyId,
  onClose,
  onOpenPayment,
}: AktSverkaDrawerProps) {
  const { token, company } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterType, setFilterType] = useState<string>('all');

  useEffect(() => {
    if (!isOpen || !counterpartyId || !token || !company) return;

    setLoading(true);
    apiFetch<StatementData>(`/sales/counterparties/${counterpartyId}/statement`, {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => setData(res))
      .catch((err) => {
        console.error('Failed to fetch statement:', err);
      })
      .finally(() => setLoading(false));
  }, [isOpen, counterpartyId, token, company, locale]);

  if (!isOpen) return null;

  const cp = data?.counterparty;
  const net = cp?.netBalance ?? 0;

  const filteredTxs = (data?.transactions || []).filter((tx) => {
    if (filterType === 'all') return true;
    if (filterType === 'invoices') return tx.type === 'SALES_INVOICE' || tx.type === 'PURCHASE_RECEIPT';
    if (filterType === 'payments') return tx.type === 'PAYMENT_INCOME' || tx.type === 'PAYMENT_EXPENSE';
    if (filterType === 'returns') return tx.type === 'SALES_RETURN' || tx.type === 'PURCHASE_RETURN';
    return true;
  });

  const getTxTypeBadge = (t: string) => {
    switch (t) {
      case 'SALES_INVOICE':
        return <Badge variant="info">{isRu ? 'Продажа' : 'Sotuv'}</Badge>;
      case 'PURCHASE_RECEIPT':
        return <Badge variant="warning">{isRu ? 'Покупка' : 'Xarid'}</Badge>;
      case 'PAYMENT_INCOME':
        return <Badge variant="success">{isRu ? 'Приход' : 'Kirim'}</Badge>;
      case 'PAYMENT_EXPENSE':
        return <Badge variant="error">{isRu ? 'Расход' : 'Chiqim'}</Badge>;
      case 'SALES_RETURN':
        return <Badge variant="neutral">{isRu ? 'Возврат (продажа)' : 'Qaytarish (sotuv)'}</Badge>;
      case 'PURCHASE_RETURN':
        return <Badge variant="neutral">{isRu ? 'Возврат (покупка)' : 'Qaytarish (xarid)'}</Badge>;
      default:
        return <Badge variant="neutral">{t}</Badge>;
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        justifyContent: 'flex-end',
        backdropFilter: 'blur(2px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '850px',
          height: '100%',
          backgroundColor: 'var(--color-bg-surface, #fff)',
          boxShadow: '-4px 0 24px rgba(0, 0, 0, 0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: 'var(--space-4) var(--space-6)',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'var(--color-bg-subtle)',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, margin: 0 }}>
                {isRu ? 'Акт сверки взаиморасчетов' : "O'zaro hisob-kitob dalolatnomasi (Akt sverka)"}
              </h2>
              {cp?.type && (
                <Badge variant={cp.type === 'CUSTOMER' ? 'info' : cp.type === 'SUPPLIER' ? 'warning' : 'success'}>
                  {cp.type === 'CUSTOMER'
                    ? isRu ? 'Клиент' : 'Mijoz'
                    : cp.type === 'SUPPLIER'
                    ? isRu ? 'Поставщик' : 'Yetkazib beruvchi'
                    : isRu ? 'Клиент и Поставщик' : 'Mijoz & Yetkazib beruvchi'}
                </Badge>
              )}
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 4 }}>
              {cp ? `${cp.name} ${cp.inn ? `| STIR/INN: ${cp.inn}` : ''}` : isRu ? 'Загрузка...' : 'Yuklanmoqda...'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button size="sm" variant="secondary" onClick={handlePrint} title={isRu ? 'Печать' : 'Chop etish'}>
              <Printer size={16} />
              <span style={{ marginLeft: 6 }}>{isRu ? 'Печать' : 'Chop etish'}</span>
            </Button>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-text-secondary)',
                padding: 6,
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
          {loading ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              {isRu ? 'Формирование акта сверки...' : 'Akt sverka shakllantirilmoqda...'}
            </div>
          ) : !data ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Информация не найдена' : "Ma'lumot topilmadi"}
            </div>
          ) : (
            <>
              {/* Financial Balance Overview Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
                {/* Net Balance Card */}
                <div
                  style={{
                    padding: 'var(--space-4)',
                    borderRadius: 'var(--radius-lg)',
                    border: `1px solid ${net > 0 ? '#10b981' : net < 0 ? '#ef4444' : 'var(--color-border)'}`,
                    backgroundColor: net > 0 ? 'rgba(16, 185, 129, 0.06)' : net < 0 ? 'rgba(239, 68, 68, 0.06)' : 'var(--color-bg-subtle)',
                  }}
                >
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                    {net > 0
                      ? isRu ? 'Сальдо в нашу пользу (Дебитор)' : "Bizning foydamizga qoldiq (Haqdorlik)"
                      : net < 0
                      ? isRu ? 'Сальдо в пользу контрагента (Кредитор)' : "Kontragent foydasiga qoldiq (Qarzdorlik)"
                      : isRu ? 'Расчет окончен (Сальдо 0)' : "To'liq hisob-kitob qilingan (Balans 0)"}
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--text-2xl)',
                      fontWeight: 800,
                      marginTop: 6,
                      color: net > 0 ? '#059669' : net < 0 ? '#dc2626' : 'var(--color-text-primary)',
                    }}
                  >
                    {net > 0 ? '+ ' : net < 0 ? '- ' : ''}
                    {formatCurrency(Math.abs(net), locale)}
                  </div>
                  {onOpenPayment && net !== 0 && (
                    <Button
                      size="sm"
                      onClick={() => onOpenPayment(cp)}
                      style={{
                        marginTop: 10,
                        backgroundColor: net > 0 ? '#10b981' : '#ef4444',
                        color: '#fff',
                        width: '100%',
                      }}
                    >
                      {net > 0
                        ? isRu ? 'Принять оплату' : "To'lov qabul qilish"
                        : isRu ? 'Выплатить долг' : "Qarzni to'lash"}
                    </Button>
                  )}
                </div>

                {/* Sales Turnover Card */}
                <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-light)', backgroundColor: 'var(--color-bg-surface)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                    {isRu ? 'Всего отгружено (Продажи)' : "Jami sotilgan mahsulotlar"}
                  </div>
                  <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginTop: 6, color: 'var(--color-text-primary)' }}>
                    {formatCurrency(data.summary.totalSalesInvoiced, locale)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                    {data.transactions.filter((t) => t.type === 'SALES_INVOICE').length} {isRu ? 'счетов-фактур' : 'ta invoys'}
                  </div>
                </div>

                {/* Purchase Turnover Card */}
                <div style={{ padding: 'var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border-light)', backgroundColor: 'var(--color-bg-surface)' }}>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                    {isRu ? 'Всего получено (Закупки)' : "Jami qabul qilingan tovarlar"}
                  </div>
                  <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginTop: 6, color: 'var(--color-text-primary)' }}>
                    {formatCurrency(data.summary.totalPurchasesInvoiced, locale)}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                    {data.transactions.filter((t) => t.type === 'PURCHASE_RECEIPT').length} {isRu ? 'приходных документов' : 'ta kirim hujjati'}
                  </div>
                </div>
              </div>

              {/* Filter Tabs */}
              <div style={{ display: 'flex', gap: 'var(--space-2)', borderBottom: '1px solid var(--color-border-light)', paddingBottom: 'var(--space-2)' }}>
                {[
                  { id: 'all', label: isRu ? 'Все операции' : 'Barcha operatsiyalar', count: data.transactions.length },
                  { id: 'invoices', label: isRu ? 'Накладные / Счета' : 'Invoyslar & Nakladnoylar' },
                  { id: 'payments', label: isRu ? 'Платежи' : "To'lovlar" },
                  { id: 'returns', label: isRu ? 'Возвраты' : 'Qaytarishlar' },
                ].map((tab) => {
                  const active = filterType === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setFilterType(tab.id)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 'var(--radius-md)',
                        border: 'none',
                        background: active ? 'var(--color-primary-100, rgba(59, 130, 246, 0.12))' : 'transparent',
                        color: active ? 'var(--color-primary-700, #1d4ed8)' : 'var(--color-text-secondary)',
                        fontWeight: active ? 600 : 500,
                        fontSize: 'var(--text-xs)',
                        cursor: 'pointer',
                      }}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Transactions Ledger Table */}
              <div style={{ border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-md)', overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
                  <thead>
                    <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border-light)', textAlign: 'left' }}>
                      <th style={{ padding: '10px 12px' }}>{isRu ? 'ДАТА' : 'SANA'}</th>
                      <th style={{ padding: '10px 12px' }}>{isRu ? 'ДОКУМЕНТ' : 'HUJJAT №'}</th>
                      <th style={{ padding: '10px 12px' }}>{isRu ? 'ТИП' : 'TURI'}</th>
                      <th style={{ padding: '10px 12px' }}>{isRu ? 'ОПИСАНИЕ' : 'TAFSILOT / IZOH'}</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>{isRu ? 'ДЕБЕТ (+)' : 'DEBET (+)'}</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right' }}>{isRu ? 'КРЕДИТ (-)' : 'KREDIT (-)'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTxs.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '30px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                          {isRu ? 'Нет операций в выбранной категории' : 'Ushbu toifada operatsiyalar mavjud emas'}
                        </td>
                      </tr>
                    ) : (
                      filteredTxs.map((tx) => (
                        <tr key={tx.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }}>
                            {new Date(tx.date).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'uz-UZ')}
                          </td>
                          <td style={{ padding: '10px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {tx.docNumber}
                          </td>
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                            {getTxTypeBadge(tx.type)}
                          </td>
                          <td style={{ padding: '10px 12px', color: 'var(--color-text-secondary)' }}>
                            {tx.description}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600, color: tx.debit > 0 ? '#059669' : 'var(--color-text-tertiary)' }}>
                            {tx.debit > 0 ? `+ ${formatCurrency(tx.debit, locale, tx.currency)}` : '—'}
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap', fontWeight: 600, color: tx.credit > 0 ? '#dc2626' : 'var(--color-text-tertiary)' }}>
                            {tx.credit > 0 ? `- ${formatCurrency(tx.credit, locale, tx.currency)}` : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
