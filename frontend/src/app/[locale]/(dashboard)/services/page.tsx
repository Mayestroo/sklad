'use client';

import { totalsByCurrency, type CurrencyTotal } from '@/lib/currency-totals';
import React, { useState, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { formatCurrency, formatDate, errorMessage, getLocalizedName } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { SearchField } from '@/components/ui/SearchField';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { ServiceActDrawer } from '@/components/services/ServiceActDrawer';
import { ServiceActDetailsModal } from '@/components/services/ServiceActDetailsModal';
import { ServiceActPrintView } from '@/components/services/ServiceActPrintView';
import { useConfirm } from '@/context/ConfirmContext';
import { toast } from '@/context/ToastContext';
import {
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Eye,
  Printer,
  Trash2,
  Edit2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  FileText,
} from 'lucide-react';
import type { ServiceActDetail } from '@/lib/service-act';

export default function ServicesPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const confirm = useConfirm();
  const { token, company } = useAuth();

  // Active Tab: PROVIDED vs RECEIVED
  const [activeType, setActiveType] = useState<'PROVIDED' | 'RECEIVED'>('PROVIDED');

  // Filters
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;


  // Modal / Drawer states
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingAct, setEditingAct] = useState<ServiceActDetail | null>(null);

  const [selectedAct, setSelectedAct] = useState<ServiceActDetail | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const [printAct, setPrintAct] = useState<ServiceActDetail | null>(null);

  // Data: the filters and page are the endpoint (= query key).
  const actsEndpoint = useMemo(() => {
    const params = new URLSearchParams();
    params.append('type', activeType);
    params.append('page', String(page));
    params.append('limit', String(pageSize));
    if (debouncedSearch.trim()) params.append('search', debouncedSearch.trim());
    if (statusFilter) params.append('status', statusFilter);
    if (paymentStatusFilter) params.append('paymentStatus', paymentStatusFilter);
    return `/services?${params.toString()}`;
  }, [activeType, page, debouncedSearch, statusFilter, paymentStatusFilter]);
  const actsQuery = useApiQuery<{ items: ServiceActDetail[]; total: number }>(actsEndpoint, { keepPrevious: true });
  const acts = useMemo(() => actsQuery.data?.items ?? [], [actsQuery.data]);
  const total = actsQuery.data?.total ?? 0;
  const loading = actsQuery.isPending;
  const fetchActs = async () => {
    await actsQuery.refetch();
  };

  // Aggregate Metrics for Active Tab
  // Per currency (ADR 0023): a USD act and a UZS act are never added together.
  const { amountByCurrency, paidByCurrency, debtByCurrency, totalPages } = useMemo(() => {
    const amounts = totalsByCurrency(acts, (a) => a.currency, (a) => a.totalAmount);
    const paid = totalsByCurrency(acts, (a) => a.currency, (a) => a.paidAmount);
    const debt = amounts
      .map((t) => ({
        currency: t.currency,
        amount: Math.max(0, t.amount - (paid.find((p) => p.currency === t.currency)?.amount ?? 0)),
      }))
      .filter((t) => t.amount > 0);
    return {
      amountByCurrency: amounts,
      paidByCurrency: paid,
      debtByCurrency: debt,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }, [acts, total, pageSize]);
  const moneyLines = (totals: CurrencyTotal[]) =>
    totals.length === 0
      ? '0'
      : totals.map((t) => (
          <span key={t.currency} style={{ display: 'block' }}>
            {formatCurrency(t.amount, locale, t.currency)}
          </span>
        ));
  // Share paid compares one currency with itself; with several currencies it is not shown.
  const paidShare =
    amountByCurrency.length === 1 && amountByCurrency[0].amount > 0
      ? `${Math.round(((paidByCurrency[0]?.amount ?? 0) / amountByCurrency[0].amount) * 100)}% ${isRu ? 'погашено' : 'so‘ndirilgan'}`
      : amountByCurrency.length > 1
      ? (isRu ? 'по каждой валюте отдельно' : 'har bir valyuta alohida')
      : '0%';

  const handleOpenCreate = () => {
    setEditingAct(null);
    setIsDrawerOpen(true);
  };

  const handleOpenEdit = (act: ServiceActDetail) => {
    setEditingAct(act);
    setIsDrawerOpen(true);
  };

  const handleOpenDetails = async (act: ServiceActDetail) => {
    try {
      const detailed = await apiFetch<ServiceActDetail>(`/services/${act.id}`, {
        token: token || undefined,
        tenantId: company?.id,
        locale,
      });
      setSelectedAct(detailed);
      setIsDetailsOpen(true);
    } catch {
      setSelectedAct(act);
      setIsDetailsOpen(true);
    }
  };

  const handleEditAct = async (act: ServiceActDetail, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (act.status === 'POSTED') {
      const confirmUnpost = await confirm({
        title: isRu ? 'Отмена проведения' : 'O‘tkazmani bekor qilish',
        description: isRu
          ? 'Этот акт проведён. Для редактирования его проведение будет отменено (с возвратом проводок и задолженности) и он вернётся в черновик. Продолжить?'
          : 'Ushbu akt tasdiqlangan. Tahrirlash uchun uning o‘tkazmasi bekor qilinadi (provodkalar va qarz orqaga qaytariladi) va qoralama holatiga qaytadi. Davom etasizmi?',
        variant: 'warning',
        confirmText: isRu ? 'Продолжить' : 'Davom etish',
        cancelText: isRu ? 'Отмена' : 'Bekor qilish',
      });
      if (!confirmUnpost) return;

      try {
        const unposted = await apiFetch<ServiceActDetail>(`/services/${act.id}/unpost`, {
          method: 'POST',
          token: token || undefined,
          tenantId: company?.id,
          locale,
        });
        await fetchActs();
        toast.success(isRu ? 'Проведение акта отменено' : 'Akt o‘tkazmasi bekor qilindi');
        setEditingAct(unposted || { ...act, status: 'DRAFT' });
        setIsDrawerOpen(true);
      } catch (err) {
        toast.error(errorMessage(err) || (isRu ? 'Ошибка отмены проведения' : 'O‘tkazmani bekor qilishda xatolik'));
      }
    } else {
      setEditingAct(act);
      setIsDrawerOpen(true);
    }
  };

  const handleDeleteAct = async (act: ServiceActDetail, e: React.MouseEvent) => {
    e.stopPropagation();
    const isPosted = act.status === 'POSTED';
    const confirmed = await confirm({
      title: isRu ? 'Удаление акта' : 'Aktni o‘chirish',
      description: isPosted
        ? isRu
          ? 'Этот акт проведён. При удалении он будет автоматически отменён (с откатом проводок и задолженности) и удалён из базы. Продолжить?'
          : 'Ushbu akt tasdiqlangan. O‘chirish jarayonida u avtomatik bekor qilinadi (provodkalar va qarz orqaga qaytariladi) hamda bazadan o‘chiriladi. Davom ettirasizmi?'
        : isRu
        ? `Черновик акта ${act.actNumber} будет удалён.`
        : `${act.actNumber} akt qoralamasi o‘chiriladi.`,
      variant: 'danger',
      confirmText: isRu ? 'Удалить' : 'O‘chirish',
      cancelText: isRu ? 'Отмена' : 'Bekor qilish',
    });

    if (!confirmed) {
      return;
    }

    try {
      if (isPosted) {
        await apiFetch(`/services/${act.id}/cancel`, {
          method: 'POST',
          token: token || undefined,
          tenantId: company?.id,
          locale,
        });
      }
      await apiFetch(`/services/${act.id}`, {
        method: 'DELETE',
        token: token || undefined,
        tenantId: company?.id,
        locale,
      });
      toast.success(isRu ? `Акт ${act.actNumber} удалён` : `${act.actNumber} akti o‘chirildi`);
      fetchActs();
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка при удалении' : 'O‘chirishda xatolik yuz berdi'));
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setPaymentStatusFilter('');
    setPage(1);
  };

  const isFiltered = Boolean(search || statusFilter || paymentStatusFilter);
  const counterpartyLabel = activeType === 'PROVIDED' ? (isRu ? 'Клиент' : 'Mijoz') : isRu ? 'Поставщик' : 'Yetkazib beruvchi';
  const statusMeta = (s: string) =>
    s === 'POSTED'
      ? { variant: 'success' as const, text: isRu ? 'Проведён' : 'Tasdiqlangan' }
      : s === 'DRAFT'
        ? { variant: 'warning' as const, text: isRu ? 'Черновик' : 'Qoralama' }
        : { variant: 'error' as const, text: isRu ? 'Отменён' : 'Bekor qilingan' };
  const payMeta = (s: string) =>
    s === 'PAID'
      ? { variant: 'success' as const, text: isRu ? 'Оплачен' : 'To‘langan' }
      : s === 'PARTIALLY_PAID'
        ? { variant: 'warning' as const, text: isRu ? 'Частично' : 'Qisman' }
        : { variant: 'neutral' as const, text: isRu ? 'Не оплачен' : 'To‘lanmagan' };
  const iconBtn = (danger?: boolean): React.CSSProperties => ({
    width: 32,
    height: 32,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    background: 'transparent',
    cursor: 'pointer',
    color: danger ? 'var(--color-error-700)' : 'var(--color-text-secondary)',
  });
  const th = { padding: '12px 16px', fontWeight: 'var(--font-medium)' } as const;
  const newActButton = (
    <Button variant="primary" onClick={handleOpenCreate}>
      <Plus size={16} aria-hidden />
      {activeType === 'PROVIDED' ? (isRu ? 'Новый акт оказанных услуг' : 'Ko‘rsatilgan xizmat akti') : isRu ? 'Новый акт полученных услуг' : 'Olingan xizmat akti'}
    </Button>
  );
  const tab = (type: 'PROVIDED' | 'RECEIVED', label: string, Icon: typeof ArrowUpRight) => {
    const on = activeType === type;
    return (
      <button
        type="button"
        aria-pressed={on}
        onClick={() => {
          setActiveType(type);
          setPage(1);
        }}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          minHeight: 36,
          padding: '6px 14px',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--text-sm)',
          fontWeight: on ? 600 : 500,
          backgroundColor: on ? 'var(--color-segmented-active-bg)' : 'transparent',
          color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
          boxShadow: on ? 'var(--color-segmented-active-shadow)' : 'none',
          border: on ? '1px solid var(--color-segmented-active-border)' : '1px solid transparent',
          cursor: 'pointer',
          minWidth: 0,
        }}
      >
        <Icon size={16} aria-hidden style={{ flexShrink: 0 }} />
        <span>{label}</span>
      </button>
    );
  };
  const kpi = (label: string, value: React.ReactNode, hint: string, tone?: string) => (
    <Card style={{ padding: 'var(--space-4)' }}>
      <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{label}</div>
      <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', marginTop: 4, color: tone }} className="tabular-nums">{value}</div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 4 }}>{hint}</div>
    </Card>
  );
  const pageNote = total > acts.length
    ? isRu ? `по ${acts.length} актам на этой странице из ${total}` : `shu sahifadagi ${acts.length} ta akt bo‘yicha (jami ${total})`
    : isRu ? `актов: ${total}` : `aktlar: ${total}`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ marginBottom: 'calc(-1 * var(--space-5))' }}>
        <PageHeader
          title={isRu ? 'Услуги' : 'Xizmatlar'}
          subtitle={isRu ? 'Акты оказанных клиентам и полученных от поставщиков услуг: долг и проводки создаются при проведении.' : 'Mijozlarga ko‘rsatilgan va yetkazib beruvchilardan olingan xizmatlar aktlari: tasdiqlanganda qarz va provodkalar yaratiladi.'}
          actions={newActButton}
        />
      </div>

      <div role="group" aria-label={isRu ? 'Вид актов' : 'Aktlar turi'} style={{ display: 'inline-flex', backgroundColor: 'var(--color-segmented-bg)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-segmented-border)', padding: 4, gap: 4, maxWidth: 460, width: '100%' }}>
        {tab('PROVIDED', isRu ? 'Оказанные услуги' : 'Ko‘rsatilgan xizmatlar', ArrowUpRight)}
        {tab('RECEIVED', isRu ? 'Полученные услуги' : 'Olingan xizmatlar', ArrowDownRight)}
      </div>

      <div className="ux-kpi-grid">
        {kpi(isRu ? 'Сумма актов' : 'Aktlar summasi', moneyLines(amountByCurrency), pageNote)}
        {kpi(isRu ? 'Оплачено' : 'To‘langan', moneyLines(paidByCurrency), paidShare)}
        {kpi(
          activeType === 'PROVIDED' ? (isRu ? 'Должны клиенты' : 'Mijozlar qarzi') : isRu ? 'Мы должны поставщикам' : 'Yetkazib beruvchilarga qarzimiz',
          moneyLines(debtByCurrency),
          debtByCurrency.length > 0 ? (isRu ? 'Закрывается оплатой в «Финансах»' : '«Moliya»dagi to‘lov bilan yopiladi') : isRu ? 'Долгов нет' : 'Qarz yo‘q',
          debtByCurrency.length > 0 ? 'var(--color-warning-700)' : undefined,
        )}
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end', padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border-light)' }}>
          <SearchField
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder={isRu ? '№ акта, контрагент или заметка' : 'Akt №, kontragent yoki izoh'}
            style={{ maxWidth: 360 }}
          />
          <Select
            label={isRu ? 'Статус' : 'Holati'}
            style={{ width: 200 }}
            options={[
              { value: '', label: isRu ? 'Все' : 'Hammasi' },
              { value: 'DRAFT', label: isRu ? 'Черновик' : 'Qoralama' },
              { value: 'POSTED', label: isRu ? 'Проведён' : 'Tasdiqlangan' },
              { value: 'CANCELLED', label: isRu ? 'Отменён' : 'Bekor qilingan' },
            ]}
            value={statusFilter}
            onChange={(val) => {
              setStatusFilter(val);
              setPage(1);
            }}
          />
          <Select
            label={isRu ? 'Оплата' : 'To‘lov'}
            style={{ width: 200 }}
            options={[
              { value: '', label: isRu ? 'Все' : 'Hammasi' },
              { value: 'UNPAID', label: isRu ? 'Не оплачен' : 'To‘lanmagan' },
              { value: 'PARTIALLY_PAID', label: isRu ? 'Частично оплачен' : 'Qisman to‘langan' },
              { value: 'PAID', label: isRu ? 'Оплачен' : 'To‘langan' },
            ]}
            value={paymentStatusFilter}
            onChange={(val) => {
              setPaymentStatusFilter(val);
              setPage(1);
            }}
          />
          {isFiltered && (
            <Button variant="ghost" size="sm" onClick={handleResetFilters}>
              <RotateCcw size={14} aria-hidden /> {isRu ? 'Сбросить' : 'Tozalash'}
            </Button>
          )}
        </div>

        {actsQuery.isError ? (
          <LoadError error={actsQuery.error} onRetry={() => void fetchActs()} retrying={actsQuery.isFetching} />
        ) : loading ? (
          <SkeletonRows rows={6} columns={6} />
        ) : acts.length === 0 ? (
          isFiltered ? (
            <EmptyState compact title={isRu ? 'Ничего не найдено' : 'Hech narsa topilmadi'} description={isRu ? 'Измените поиск или фильтры.' : 'Qidiruv yoki filtrlarni o‘zgartiring.'} action={<Button variant="outline" size="sm" onClick={handleResetFilters}>{isRu ? 'Сбросить фильтры' : 'Filtrlarni tozalash'}</Button>} />
          ) : (
            <EmptyState
              icon={FileText}
              title={activeType === 'PROVIDED' ? (isRu ? 'Актов оказанных услуг пока нет' : 'Hozircha ko‘rsatilgan xizmat aktlari yo‘q') : isRu ? 'Актов полученных услуг пока нет' : 'Hozircha olingan xizmat aktlari yo‘q'}
              description={activeType === 'PROVIDED' ? (isRu ? 'Оформите акт — после проведения долг клиента появится в расчётах.' : 'Akt rasmiylashtiring — tasdiqlangach mijoz qarzi hisob-kitoblarda paydo bo‘ladi.') : isRu ? 'Оформите акт — после проведения наш долг поставщику появится в расчётах.' : 'Akt rasmiylashtiring — tasdiqlangach yetkazib beruvchiga qarzimiz hisob-kitoblarda paydo bo‘ladi.'}
              action={newActButton}
            />
          )
        ) : (
          <div style={{ overflowX: 'auto', opacity: actsQuery.isFetching ? 0.7 : 1 }}>
            <table className="app-table-stack" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)', textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                  <th scope="col" style={th}>{isRu ? '№ акта' : 'Akt №'}</th>
                  <th scope="col" style={th}>{isRu ? 'Дата' : 'Sana'}</th>
                  <th scope="col" style={th}>{counterpartyLabel}</th>
                  <th scope="col" style={th}>{isRu ? 'Статус' : 'Holati'}</th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>{isRu ? 'Сумма' : 'Summa'}</th>
                  <th scope="col" style={{ ...th, textAlign: 'right' }}>{isRu ? 'Оплачено' : 'To‘langan'}</th>
                  <th scope="col" style={th}>{isRu ? 'Оплата' : 'To‘lov'}</th>
                  <th scope="col" style={th}><span className="sr-only">{isRu ? 'Действия' : 'Amallar'}</span></th>
                </tr>
              </thead>
              <tbody>
                {acts.map((act) => {
                  const st = statusMeta(act.status);
                  const pay = payMeta(act.paymentStatus);
                  return (
                    <tr key={act.id} className="ux-row-hover" style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                      <td data-primary style={{ padding: '12px 16px' }}>
                        <button type="button" onClick={() => void handleOpenDetails(act)} style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)', cursor: 'pointer', textAlign: 'left' }}>
                          {act.actNumber}
                        </button>
                        {act.externalNumber && (
                          <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 2, fontWeight: 'var(--font-normal)' }}>
                            {isRu ? 'Внешний № ' : 'Tashqi № '}{act.externalNumber}
                          </span>
                        )}
                      </td>
                      <td data-label={isRu ? 'Дата' : 'Sana'} style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>{formatDate(act.actDate, locale)}</td>
                      <td data-label={counterpartyLabel} style={{ padding: '12px 16px' }}>
                        <span style={{ fontWeight: 'var(--font-medium)' }}>{act.counterparty?.name || '—'}</span>
                        {act.counterparty?.inn && <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>{isRu ? 'ИНН' : 'STIR'} {act.counterparty.inn}</span>}
                      </td>
                      <td data-label={isRu ? 'Статус' : 'Holati'} style={{ padding: '12px 16px' }}><Badge variant={st.variant}>{st.text}</Badge></td>
                      <td data-label={isRu ? 'Сумма' : 'Summa'} style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'var(--font-semibold)', whiteSpace: 'nowrap' }} className="tabular-nums">{formatCurrency(Number(act.totalAmount), locale, act.currency)}</td>
                      <td data-label={isRu ? 'Оплачено' : 'To‘langan'} style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }} className="tabular-nums">{formatCurrency(Number(act.paidAmount), locale, act.currency)}</td>
                      <td data-label={isRu ? 'Оплата' : 'To‘lov'} style={{ padding: '12px 16px' }}><Badge variant={pay.variant}>{pay.text}</Badge></td>
                      <td style={{ padding: '8px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 2 }}>
                          <button type="button" style={iconBtn()} onClick={() => void handleOpenDetails(act)} aria-label={isRu ? `Открыть акт ${act.actNumber}` : `${act.actNumber} aktini ochish`} title={isRu ? 'Открыть' : 'Ochish'}>
                            <Eye size={16} aria-hidden />
                          </button>
                          <button type="button" style={iconBtn()} onClick={() => setPrintAct(act)} aria-label={isRu ? `Печать акта ${act.actNumber}` : `${act.actNumber} aktini chop etish`} title={isRu ? 'Печать' : 'Chop etish'}>
                            <Printer size={16} aria-hidden />
                          </button>
                          <button type="button" style={iconBtn()} onClick={(e) => void handleEditAct(act, e)} aria-label={isRu ? `Изменить акт ${act.actNumber}` : `${act.actNumber} aktini tahrirlash`} title={isRu ? 'Изменить' : 'Tahrirlash'}>
                            <Edit2 size={16} aria-hidden />
                          </button>
                          <button type="button" style={iconBtn(true)} onClick={(e) => void handleDeleteAct(act, e)} aria-label={isRu ? `Удалить акт ${act.actNumber}` : `${act.actNumber} aktini o‘chirish`} title={isRu ? 'Удалить' : 'O‘chirish'}>
                            <Trash2 size={16} aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {total > pageSize && (
          <nav aria-label={isRu ? 'Страницы' : 'Sahifalar'} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--color-border-light)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            <span className="tabular-nums">
              {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} {isRu ? 'из' : '/'} {total}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button aria-label={isRu ? 'Предыдущая страница' : 'Oldingi sahifa'} title={isRu ? 'Предыдущая страница' : 'Oldingi sahifa'} variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronLeft size={16} aria-hidden />
              </Button>
              <span className="tabular-nums">{page} / {totalPages}</span>
              <Button aria-label={isRu ? 'Следующая страница' : 'Keyingi sahifa'} title={isRu ? 'Следующая страница' : 'Keyingi sahifa'} variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                <ChevronRight size={16} aria-hidden />
              </Button>
            </div>
          </nav>
        )}
      </Card>

      <ServiceActDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} onSuccess={fetchActs} initialData={editingAct} defaultType={activeType} />

      {selectedAct && (
        <ServiceActDetailsModal
          act={selectedAct}
          isOpen={isDetailsOpen}
          onClose={() => {
            setIsDetailsOpen(false);
            setSelectedAct(null);
          }}
          onRefresh={fetchActs}
          onEdit={(act) => handleOpenEdit(act)}
          onPrint={(act) => setPrintAct(act)}
        />
      )}

      {printAct && (
        <ServiceActPrintView act={printAct} companyName={company?.name ? getLocalizedName(company.name, locale) : 'KORXONA'} onClose={() => setPrintAct(null)} locale={locale} />
      )}
    </div>
  );
}
