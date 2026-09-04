'use client';

import { useState, useEffect, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  RotateCcw,
  Building2,
  Package,
  Plus,
  Search,
  Printer,
  FileText,
  Download,
  Filter,
  CheckCircle2,
  XCircle,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { PurchaseReturn } from '@shared/types';
import { Link, useRouter } from '@/i18n/navigation';
import { ReturnActModal } from '@/components/purchases/ReturnActModal';

export default function ReturnsPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const router = useRouter();
  const { token, company } = useAuth();

  const [returns, setReturns] = useState<PurchaseReturn[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modals state
  const [selectedReturnForAct, setSelectedReturnForAct] = useState<PurchaseReturn | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchReturns = () => {
    if (!token || !company) return;
    setLoading(true);

    const queryParams = new URLSearchParams();
    if (searchTerm) queryParams.set('search', searchTerm);
    if (statusFilter !== 'ALL') queryParams.set('status', statusFilter);
    if (startDate) queryParams.set('startDate', startDate);
    if (endDate) queryParams.set('endDate', endDate);

    const url = `/purchases/returns${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

    apiFetch<PurchaseReturn[]>(url, { token, tenantId: company.id, locale })
      .then((res) => setReturns(res || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!token || !company) return;
    fetchReturns();
  }, [token, company, locale, statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchReturns();
  };

  const getProductName = (name: any) => {
    if (!name) return '—';
    if (typeof name === 'string') return name;
    return name[locale] || name.ru || name.uz || Object.values(name)[0] || '—';
  };

  const [activeTab, setActiveTab] = useState<'LIST' | 'ANALYTICS'>('LIST');

  // Approve a draft return
  const handleApprove = async (id: string) => {
    setActionLoadingId(id);
    try {
      await apiFetch(`/purchases/returns/${id}/approve`, {
        token: token || undefined,
        tenantId: company?.id || undefined,
        locale,
        method: 'POST',
      });
      fetchReturns();
    } catch (err: any) {
      alert(err?.message || (isRu ? 'Ошибка при утверждении возврата' : 'Tasdiqlashda xatolik'));
    } finally {
      setActionLoadingId(null);
    }
  };

  // Cancel a return
  const handleCancel = async (id: string) => {
    if (
      !window.confirm(
        isRu
          ? 'Вы действительно хотите отменить этот возврат?'
          : 'Ushbu qaytarish hujjatini bekor qilishni tasdiqlaysizmi?',
      )
    ) {
      return;
    }

    setActionLoadingId(id);
    try {
      await apiFetch(`/purchases/returns/${id}/cancel`, {
        token: token || undefined,
        tenantId: company?.id || undefined,
        locale,
        method: 'POST',
      });
      fetchReturns();
    } catch (err: any) {
      alert(err?.message || (isRu ? 'Ошибка при отмене возврата' : 'Bekor qilishda xatolik'));
    } finally {
      setActionLoadingId(null);
    }
  };

  // Metrics
  const totalReturnedSum = returns
    .filter((r) => r.status === 'POSTED')
    .reduce((sum, r) => sum + Number(r.totalAmount), 0);

  const postedCount = returns.filter((r) => r.status === 'POSTED').length;
  const draftCount = returns.filter((r) => r.status === 'DRAFT').length;

  const handleExportCsv = () => {
    if (returns.length === 0) return;
    const headers = [
      isRu ? 'Номер' : 'Raqami',
      isRu ? 'Номер акта' : 'Akt raqami',
      isRu ? 'Дата' : 'Sana',
      isRu ? 'Поставщик' : 'Yetkazib beruvchi',
      isRu ? 'Документ закупки' : 'Xarid hujjati',
      isRu ? 'Склад' : 'Ombor',
      isRu ? 'Причина' : 'Sababi',
      isRu ? 'Сумма' : 'Summa',
      isRu ? 'Статус' : 'Status',
    ];

    const rows = returns.map((r) => [
      r.returnNumber,
      `"${r.actNumber || ''}"`,
      formatDate(r.returnDate, locale),
      `"${r.counterparty?.name || ''}"`,
      r.receipt?.docNumber || '',
      `"${getProductName(r.warehouse?.name)}"`,
      `"${r.reason || ''}"`,
      Number(r.totalAmount),
      r.status,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `purchase_returns_${new Date().toISOString().split('T')[0]}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Reason Analytics Breakdown
  const reasonBreakdown: Record<string, { count: number; total: number }> = {};
  returns.forEach((r) => {
    const key = r.reason || (isRu ? 'Другое / Не указано' : 'Boshqa / Ko‘rsatilmadi');
    if (!reasonBreakdown[key]) {
      reasonBreakdown[key] = { count: 0, total: 0 };
    }
    reasonBreakdown[key].count += 1;
    reasonBreakdown[key].total += Number(r.totalAmount);
  });

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return <Badge variant="neutral">{isRu ? 'Черновик' : 'Qoralama'}</Badge>;
      case 'UNDER_REVIEW':
        return <Badge variant="warning">{isRu ? 'На проверке' : 'Tekshiruvda'}</Badge>;
      case 'POSTED':
        return <Badge variant="success">{isRu ? 'Проведено' : 'Tasdiqlangan'}</Badge>;
      case 'CANCELLED':
        return <Badge variant="error">{isRu ? 'Отменено' : 'Bekor qilingan'}</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', paddingBottom: '40px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            {isRu ? 'Возврат Товаров Поставщику' : 'Yetkazib Beruvchiga Qaytarishlar'}
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            {isRu
              ? 'Документы возврата поставщику, списание остатков со склада и перерасчет задолженности'
              : 'Tovarlarni yetkazib beruvchiga qaytarish, ombordan chiqim va qarzni qayta hisoblash jurnali'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '4px', backgroundColor: 'var(--color-bg-subtle)', padding: '3px', borderRadius: 'var(--radius-md)' }}>
            <button
              onClick={() => setActiveTab('LIST')}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                fontSize: 'var(--text-xs)',
                backgroundColor: activeTab === 'LIST' ? 'var(--color-bg-primary)' : 'transparent',
                color: activeTab === 'LIST' ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                border: 'none',
                cursor: 'pointer',
                boxShadow: activeTab === 'LIST' ? 'var(--shadow-sm)' : 'none',
              }}
            >
              {isRu ? 'Документы' : 'Hujjatlar'}
            </button>
            <button
              onClick={() => setActiveTab('ANALYTICS')}
              style={{
                padding: '6px 14px',
                borderRadius: 'var(--radius-sm)',
                fontWeight: 600,
                fontSize: 'var(--text-xs)',
                backgroundColor: activeTab === 'ANALYTICS' ? 'var(--color-bg-primary)' : 'transparent',
                color: activeTab === 'ANALYTICS' ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                border: 'none',
                cursor: 'pointer',
                boxShadow: activeTab === 'ANALYTICS' ? 'var(--shadow-sm)' : 'none',
              }}
            >
              {isRu ? 'Аналитика причин' : 'Sabablar tahlili'}
            </button>
          </div>

          <Link href="/purchases/returns/new">
            <Button variant="primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Plus size={16} /> {isRu ? 'Новый возврат' : 'Yangi qaytarish'}
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
        <Card style={{ padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {isRu ? 'Всего возвращено (Проведено)' : 'Jami Qaytarilgan (Tasdiqlangan)'}
          </div>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-primary-600)', marginTop: '6px' }}>
            {formatCurrency(totalReturnedSum, locale, 'UZS')}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
            {postedCount} {isRu ? 'проведенных операций' : 'ta tasdiqlangan hujjat'}
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {isRu ? 'Черновики к утверждению' : 'Kutilayotgan Qoralamalar'}
          </div>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: draftCount > 0 ? 'var(--color-warning-600)' : 'var(--color-text-secondary)', marginTop: '6px' }}>
            {draftCount} {isRu ? 'документов' : 'ta hujjat'}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
            {isRu ? 'Требуют проведения на складе' : 'Ombordan tasdiqlanishi lozim'}
          </div>
        </Card>

        <Card style={{ padding: 'var(--space-4)' }}>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {isRu ? 'Всего операций возврата' : 'Jami Operatsiyalar Soni'}
          </div>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-text-primary)', marginTop: '6px' }}>
            {returns.length}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
            {isRu ? 'За все время' : 'Barcha davr bo‘yicha'}
          </div>
        </Card>
      </div>

      {activeTab === 'LIST' ? (
        <>
          {/* Search and Filters Bar */}
          <Card style={{ padding: 'var(--space-4)' }}>
            <form onSubmit={handleSearchSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
              <div style={{ flex: '1 1 240px', minWidth: '200px' }}>
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={isRu ? 'Поиск по номеру, акту, поставщику...' : 'Raqam, akt yoki yetkazib beruvchi bo‘yicha qidiruv...'}
                />
              </div>

              <div style={{ width: '160px' }}>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border-light)',
                    backgroundColor: 'var(--color-bg-primary)',
                    color: 'var(--color-text-primary)',
                    fontSize: 'var(--text-sm)',
                  }}
                >
                  <option value="ALL">{isRu ? 'Все статусы' : 'Barcha statuslar'}</option>
                  <option value="DRAFT">{isRu ? 'Черновик' : 'Qoralama'}</option>
                  <option value="POSTED">{isRu ? 'Проведено' : 'Tasdiqlangan'}</option>
                  <option value="CANCELLED">{isRu ? 'Отменено' : 'Bekor qilingan'}</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <Button type="submit" variant="secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Search size={14} /> {isRu ? 'Найти' : 'Qidirish'}
                </Button>
                <Button type="button" variant="secondary" onClick={handleExportCsv} disabled={returns.length === 0} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Download size={14} /> CSV
                </Button>
              </div>
            </form>
          </Card>

          {/* Table Card */}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px', display: 'block' }} />
                <div>{isRu ? 'Загрузка документов...' : 'Hujjatlar yuklanmoqda...'}</div>
              </div>
            ) : returns.length === 0 ? (
              <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                <RotateCcw size={48} style={{ margin: '0 auto 12px', opacity: 0.3 }} />
                <div style={{ fontWeight: 600, fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)' }}>
                  {isRu ? 'Документы возврата не найдены' : 'Qaytarish hujjatlari topilmadi'}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', marginTop: '4px' }}>
                  {isRu
                    ? 'Нажмите кнопку «Новый возврат», чтобы оформить возврат поставщику'
                    : 'Yangi qaytarish hujjatini yaratish uchun yuqoridagi tugmani bosing'}
                </div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border-light)', backgroundColor: 'var(--color-bg-subtle)' }}>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.05em' }}>
                        {isRu ? '№ / Дата' : '№ / Sana'}
                      </th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.05em' }}>
                        {isRu ? 'Номер акта' : 'Akt raqami'}
                      </th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.05em' }}>
                        {isRu ? 'Поставщик' : 'Yetkazib beruvchi'}
                      </th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.05em' }}>
                        {isRu ? 'Склад' : 'Ombor'}
                      </th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.05em' }}>
                        {isRu ? 'Основание' : 'Asos xarid'}
                      </th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.05em' }}>
                        {isRu ? 'Причина' : 'Sababi'}
                      </th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.05em', textAlign: 'right' }}>
                        {isRu ? 'Сумма' : 'Summa'}
                      </th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.05em', textAlign: 'center' }}>
                        {isRu ? 'Статус' : 'Holati'}
                      </th>
                      <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontSize: '11px', letterSpacing: '0.05em', textAlign: 'right' }}>
                        {isRu ? 'Действия' : 'Amallar'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {returns.map((ret) => (
                      <tr
                        key={ret.id}
                        style={{ borderBottom: '1px solid var(--color-border-light)', transition: 'background-color 0.15s ease' }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <td style={{ padding: '12px 16px' }}>
                          <Link href={`/purchases/returns/${ret.id}`} style={{ fontWeight: 600, color: 'var(--color-primary-600)', textDecoration: 'none' }}>
                            {ret.returnNumber}
                          </Link>
                          <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                            {formatDate(ret.returnDate, locale)}
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', color: ret.actNumber ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>
                          {ret.actNumber || '—'}
                        </td>
                        <td style={{ padding: '12px 16px', fontWeight: 500 }}>
                          {ret.counterparty?.name || '—'}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {getProductName(ret.warehouse?.name)}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          {ret.receipt ? (
                            <Link href={`/purchases/${ret.receipt.id}`} style={{ fontSize: '12px', color: 'var(--color-primary-600)' }}>
                              № {ret.receipt.docNumber}
                            </Link>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
                              {isRu ? 'С нуля' : 'Noldan'}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px', maxWidth: '200px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                            {ret.reason || '—'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700 }}>
                          {formatCurrency(Number(ret.totalAmount), locale, ret.currency)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          {renderStatusBadge(ret.status)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setSelectedReturnForAct(ret)}
                              title={isRu ? 'Печать акта' : 'Aktni chop etish'}
                              style={{ padding: '4px 8px' }}
                            >
                              <Printer size={15} />
                            </Button>

                            <Link href={`/purchases/returns/${ret.id}`}>
                              <Button size="sm" variant="secondary" style={{ padding: '4px 8px' }} title={isRu ? 'Просмотр' : 'Ko‘rish'}>
                                <Eye size={15} />
                              </Button>
                            </Link>

                            {ret.status === 'DRAFT' && (
                              <Button
                                size="sm"
                                variant="primary"
                                disabled={actionLoadingId === ret.id}
                                onClick={() => handleApprove(ret.id)}
                                title={isRu ? 'Провести' : 'Tasdiqlash'}
                                style={{ padding: '4px 8px' }}
                              >
                                <CheckCircle2 size={15} />
                              </Button>
                            )}

                            {ret.status !== 'CANCELLED' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={actionLoadingId === ret.id}
                                onClick={() => handleCancel(ret.id)}
                                title={isRu ? 'Отменить' : 'Bekor qilish'}
                                style={{ padding: '4px 8px', color: 'var(--color-danger-500)' }}
                              >
                                <XCircle size={15} />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : (
        /* Analytics Tab */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <Card style={{ padding: 'var(--space-6)' }}>
            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
              {isRu ? 'Распределение возвратов по причинам' : 'Qaytarish sabablari bo‘yicha taqsimot'}
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {Object.entries(reasonBreakdown).map(([reasonName, data]) => {
                const percent = totalReturnedSum > 0 ? (data.total / totalReturnedSum) * 100 : 0;
                return (
                  <div key={reasonName} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                      <span style={{ fontWeight: 600 }}>{reasonName}</span>
                      <span>
                        <strong>{formatCurrency(data.total, locale, 'UZS')}</strong> ({data.count} {isRu ? 'операций' : 'ta'})
                      </span>
                    </div>
                    <div style={{ width: '100%', height: '8px', backgroundColor: 'var(--color-bg-subtle)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${Math.min(100, Math.max(2, percent))}%`,
                          height: '100%',
                          backgroundColor: 'var(--color-primary-500)',
                          borderRadius: '4px',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* Return Act Slip Modal */}
      {selectedReturnForAct && (
        <ReturnActModal
          isOpen={!!selectedReturnForAct}
          onClose={() => setSelectedReturnForAct(null)}
          purchaseReturn={selectedReturnForAct}
        />
      )}
    </div>
  );
}
