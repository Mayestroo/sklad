'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { ServiceActDrawer } from '@/components/services/ServiceActDrawer';
import { ServiceActDetailsModal } from '@/components/services/ServiceActDetailsModal';
import { ServiceActPrintView } from '@/components/services/ServiceActPrintView';
import { useConfirm } from '@/context/ConfirmContext';
import { toast } from '@/context/ToastContext';
import {
  Plus,
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Eye,
  Printer,
  Trash2,
  Edit2,
  Filter,
  Briefcase,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  FileText,
} from 'lucide-react';

export default function ServicesPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const confirm = useConfirm();
  const { token, company } = useAuth();

  // Active Tab: PROVIDED vs RECEIVED
  const [activeType, setActiveType] = useState<'PROVIDED' | 'RECEIVED'>('PROVIDED');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Data
  const [acts, setActs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // Modal / Drawer states
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingAct, setEditingAct] = useState<any | null>(null);

  const [selectedAct, setSelectedAct] = useState<any | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const [printAct, setPrintAct] = useState<any | null>(null);

  // Fetch Acts
  const fetchActs = useCallback(async () => {
    if (!token && !company?.id) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('type', activeType);
      params.append('page', String(page));
      params.append('limit', String(pageSize));
      if (search.trim()) params.append('search', search.trim());
      if (statusFilter) params.append('status', statusFilter);
      if (paymentStatusFilter) params.append('paymentStatus', paymentStatusFilter);

      const res = await apiFetch<{ items: any[]; total: number }>(`/services?${params.toString()}`, {
        token: token || undefined,
        tenantId: company?.id,
        locale,
      });

      if (res) {
        setActs(res.items || []);
        setTotal(res.total || 0);
      }
    } catch {
      setActs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [activeType, search, statusFilter, paymentStatusFilter, page, token, company?.id, locale]);

  useEffect(() => {
    fetchActs();
  }, [fetchActs]);

  // Aggregate Metrics for Active Tab
  const { totalAmountSum, totalPaidSum, totalDebtSum, totalPages } = useMemo(() => {
    const totalAmount = acts.reduce((s, a) => s + (Number(a.totalAmount) || 0), 0);
    const totalPaid = acts.reduce((s, a) => s + (Number(a.paidAmount) || 0), 0);
    const totalDebt = Math.max(0, totalAmount - totalPaid);
    const pages = Math.max(1, Math.ceil(total / pageSize));
    return {
      totalAmountSum: totalAmount,
      totalPaidSum: totalPaid,
      totalDebtSum: totalDebt,
      totalPages: pages,
    };
  }, [acts, total, pageSize]);

  const handleOpenCreate = () => {
    setEditingAct(null);
    setIsDrawerOpen(true);
  };

  const handleOpenEdit = (act: any) => {
    setEditingAct(act);
    setIsDrawerOpen(true);
  };

  const handleOpenDetails = async (act: any) => {
    try {
      const detailed = await apiFetch(`/services/${act.id}`, {
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

  const handleEditAct = async (act: any, e?: React.MouseEvent) => {
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
        const unposted = await apiFetch<any>(`/services/${act.id}/unpost`, {
          method: 'POST',
          token: token || undefined,
          tenantId: company?.id,
          locale,
        });
        await fetchActs();
        toast.success(isRu ? 'Проведение акта отменено' : 'Akt o‘tkazmasi bekor qilindi');
        setEditingAct(unposted || { ...act, status: 'DRAFT' });
        setIsDrawerOpen(true);
      } catch (err: any) {
        toast.error(err.message || (isRu ? 'Ошибка отмены проведения' : 'O‘tkazmani bekor qilishda xatolik'));
      }
    } else {
      setEditingAct(act);
      setIsDrawerOpen(true);
    }
  };

  const handleDeleteAct = async (act: any, e: React.MouseEvent) => {
    e.stopPropagation();
    const isPosted = act.status === 'POSTED';
    const confirmed = await confirm({
      title: isRu ? 'Удаление акта' : 'Aktni o‘chirish',
      description: isPosted
        ? isRu
          ? 'Этот акт проведён. При удалении он будет автоматически отменён (с откатом проводок и задолженности) и удалён из базы. Продолжить?'
          : 'Ushbu akt tasdiqlangan. O‘chirish jarayonida u avtomatik bekor qilinadi (provodkalar va qarz orqaga qaytariladi) hamda bazadan o‘chiriladi. Davom ettirasizmi?'
        : isRu
        ? 'Удалить этот акт?'
        : 'Ushbu aktni o‘chirishni xohlaysizmi?',
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
      toast.success(isRu ? 'Акт успешно удален' : 'Akt muvaffaqiyatli o‘chirildi');
      fetchActs();
    } catch (err: any) {
      toast.error(err.message || (isRu ? 'Ошибка при удалении' : 'O‘chirishda xatolik yuz berdi'));
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setStatusFilter('');
    setPaymentStatusFilter('');
    setPage(1);
  };

  const isFiltered = Boolean(search || statusFilter || paymentStatusFilter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* ─── Top Header & Primary Action ──────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 'var(--text-2xl)',
              fontWeight: 'var(--font-bold)',
              color: 'var(--color-text-primary)',
              margin: 0,
            }}
          >
            {isRu ? 'Услуги' : 'Xizmatlar'}
          </h1>
        </div>

        <Button
          variant="primary"
          onClick={handleOpenCreate}
          className="flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>
            {activeType === 'PROVIDED'
              ? isRu
                ? 'Новая услуга'
                : 'Yangi xizmat'
              : isRu
              ? 'Новая услуга'
              : 'Yangi xizmat'}
          </span>
        </Button>
      </div>

      {/* ─── Segmented Navigation Switcher ────────────────────────── */}
      <div
        style={{
          display: 'inline-flex',
          backgroundColor: 'var(--color-bg-secondary)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border-light)',
          padding: '4px',
          maxWidth: '440px',
          width: '100%',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <button
          type="button"
          onClick={() => {
            setActiveType('PROVIDED');
            setPage(1);
          }}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-sm)',
            fontWeight: activeType === 'PROVIDED' ? 'var(--font-semibold)' : 'var(--font-medium)',
            backgroundColor: activeType === 'PROVIDED' ? 'var(--color-bg-primary)' : 'transparent',
            color: activeType === 'PROVIDED' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            boxShadow: activeType === 'PROVIDED' ? 'var(--shadow-sm)' : 'none',
            border: activeType === 'PROVIDED' ? '1px solid var(--color-border-light)' : 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap',
          }}
        >
          <ArrowUpRight className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{isRu ? 'Оказанные услуги' : 'Ko‘rsatilgan xizmatlar'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveType('RECEIVED');
            setPage(1);
          }}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '8px 16px',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-sm)',
            fontWeight: activeType === 'RECEIVED' ? 'var(--font-semibold)' : 'var(--font-medium)',
            backgroundColor: activeType === 'RECEIVED' ? 'var(--color-bg-primary)' : 'transparent',
            color: activeType === 'RECEIVED' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
            boxShadow: activeType === 'RECEIVED' ? 'var(--shadow-sm)' : 'none',
            border: activeType === 'RECEIVED' ? '1px solid var(--color-border-light)' : 'none',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            whiteSpace: 'nowrap',
          }}
        >
          <ArrowDownRight className="w-4 h-4 text-blue-600 shrink-0" />
          <span>{isRu ? 'Полученные услуги' : 'Olingan xizmatlar'}</span>
        </button>
      </div>

      {/* ─── Executive KPI Cards ──────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        {/* Total Invoiced */}
        <div
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border-light)',
            borderLeft: '4px solid #3b82f6',
            boxShadow: 'var(--shadow-sm)',
            padding: 'var(--space-4) var(--space-5)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-semibold)',
                color: 'var(--color-text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {isRu ? 'Общая сумма услуг' : 'Jami xizmatlar summasi'}
            </span>
            <Clock style={{ width: 16, height: 16, color: '#3b82f6' }} />
          </div>
          <p
            style={{
              fontSize: 'var(--text-2xl)',
              fontWeight: 'var(--font-bold)',
              color: 'var(--color-text-primary)',
              marginTop: 'var(--space-2)',
            }}
          >
            {formatCurrency(totalAmountSum, locale, 'UZS')}
          </p>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-tertiary)',
              marginTop: '4px',
              display: 'block',
            }}
          >
            {total} {isRu ? 'актов в текущей выборке' : 'ta xizmat akti'}
          </span>
        </div>

        {/* Total Settled */}
        <div
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border-light)',
            borderLeft: '4px solid #10b981',
            boxShadow: 'var(--shadow-sm)',
            padding: 'var(--space-4) var(--space-5)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-semibold)',
                color: 'var(--color-text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {isRu ? 'Оплачено через Финансы' : 'Moliya orqali to‘langan'}
            </span>
            <CheckCircle2 style={{ width: 16, height: 16, color: '#10b981' }} />
          </div>
          <p
            style={{
              fontSize: 'var(--text-2xl)',
              fontWeight: 'var(--font-bold)',
              color: '#10b981',
              marginTop: 'var(--space-2)',
            }}
          >
            {formatCurrency(totalPaidSum, locale, 'UZS')}
          </p>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-tertiary)',
              marginTop: '4px',
              display: 'block',
            }}
          >
            {totalAmountSum > 0
              ? `${Math.round((totalPaidSum / totalAmountSum) * 100)}% ${isRu ? 'погашено' : 'so‘ndirilgan'}`
              : '0%'}
          </span>
        </div>

        {/* Outstanding Debt */}
        <div
          style={{
            backgroundColor: 'var(--color-bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--color-border-light)',
            borderLeft: '4px solid #f59e0b',
            boxShadow: 'var(--shadow-sm)',
            padding: 'var(--space-4) var(--space-5)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--font-semibold)',
                color: 'var(--color-text-tertiary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {activeType === 'PROVIDED'
                ? isRu
                  ? 'Остаток долга клиентов'
                  : 'Mijozlar qarzdorligi (Haqdorlik)'
                : isRu
                ? 'Наш долг поставщикам'
                : 'Yetkazib beruvchilarga qarzimiz'}
            </span>
            <AlertCircle style={{ width: 16, height: 16, color: '#f59e0b' }} />
          </div>
          <p
            style={{
              fontSize: 'var(--text-2xl)',
              fontWeight: 'var(--font-bold)',
              color: totalDebtSum > 0 ? '#ef4444' : 'var(--color-text-primary)',
              marginTop: 'var(--space-2)',
            }}
          >
            {formatCurrency(totalDebtSum, locale, 'UZS')}
          </p>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-tertiary)',
              marginTop: '4px',
              display: 'block',
            }}
          >
            {totalDebtSum > 0
              ? isRu
                ? 'Ожидается погашение через кассу/банк'
                : 'Moliya to‘lovi orqali yopilishi kutilmoqda'
              : isRu
              ? 'Полностью рассчитано'
              : 'To‘liq hisob-kitob qilingan'}
          </span>
        </div>
      </div>

      {/* ─── Filter Toolbar ───────────────────────────────────────── */}
      <Card style={{ padding: 'var(--space-4)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'var(--space-3)',
            alignItems: 'center',
          }}
        >
          <div style={{ position: 'relative' }}>
            <Search
              style={{
                width: 16,
                height: 16,
                position: 'absolute',
                left: 12,
                top: 10,
                color: 'var(--color-text-tertiary)',
                pointerEvents: 'none',
              }}
            />
            <Input
              type="text"
              placeholder={
                isRu
                  ? 'Поиск по номеру, контрагенту, заметкам...'
                  : '№, kontragent yoki izoh bo‘yicha qidiruv...'
              }
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              style={{ paddingLeft: '36px' }}
            />
          </div>

          <Select
            options={[
              { value: '', label: isRu ? 'Все статусы проведения' : 'Barcha o‘tkazma holatlari' },
              { value: 'DRAFT', label: isRu ? 'Черновик (DRAFT)' : 'Qoralama (DRAFT)' },
              { value: 'POSTED', label: isRu ? 'Проведён (POSTED)' : 'Tasdiqlangan (POSTED)' },
              { value: 'CANCELLED', label: isRu ? 'Отменён (CANCELLED)' : 'Bekor qilingan (CANCELLED)' },
            ]}
            value={statusFilter}
            onChange={(val) => {
              setStatusFilter(val);
              setPage(1);
            }}
          />

          <Select
            options={[
              { value: '', label: isRu ? 'Все статусы оплаты' : 'Barcha to‘lov holatlari' },
              { value: 'UNPAID', label: isRu ? 'Не оплачен (UNPAID)' : 'To‘lanmagan' },
              { value: 'PARTIALLY_PAID', label: isRu ? 'Частично оплачен' : 'Qisman to‘langan' },
              { value: 'PAID', label: isRu ? 'Полностью оплачен' : 'To‘langan' },
            ]}
            value={paymentStatusFilter}
            onChange={(val) => {
              setPaymentStatusFilter(val);
              setPage(1);
            }}
          />

          {isFiltered && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleResetFilters}
              className="flex items-center gap-1.5 justify-center"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isRu ? 'Сбросить' : 'Filtrni tozalash'}</span>
            </Button>
          )}
        </div>
      </Card>

      {/* ─── Acts Table ───────────────────────────────────────────── */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 'var(--text-sm)',
              textAlign: 'left',
            }}
          >
            <thead>
              <tr
                style={{
                  backgroundColor: 'var(--color-bg-primary)',
                  borderBottom: '1px solid var(--color-border-light)',
                  color: 'var(--color-text-tertiary)',
                  fontSize: 'var(--text-xs)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                <th style={{ padding: '12px 16px' }}>{isRu ? '№ Акта' : 'Akt №'}</th>
                <th style={{ padding: '12px 16px' }}>{isRu ? 'Дата' : 'Sana'}</th>
                <th style={{ padding: '12px 16px' }}>
                  {activeType === 'PROVIDED'
                    ? isRu ? 'Клиент' : 'Mijoz'
                    : isRu ? 'Поставщик' : 'Yetkazib beruvchi'}
                </th>
                <th style={{ padding: '12px 16px' }}>{isRu ? 'Статус' : 'Holati'}</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>
                  {isRu ? 'Начислено' : 'Hisoblangan summa'}
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>
                  {isRu ? 'Оплачено' : 'To‘langan summa'}
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'center' }}>
                  {isRu ? 'Оплата' : 'To‘lov holati'}
                </th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>
                  {isRu ? 'Действия' : 'Amallar'}
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: '48px', textAlign: 'center' }}>
                    <div className="inline-block animate-spin rounded-full h-7 w-7 border-2 border-blue-600 border-t-transparent"></div>
                    <p style={{ marginTop: '8px', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                      {isRu ? 'Загрузка актов...' : 'Xizmat aktlari yuklanmoqda...'}
                    </p>
                  </td>
                </tr>
              ) : acts.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '48px 16px', textAlign: 'center' }}>
                    <FileText
                      style={{
                        width: 40,
                        height: 40,
                        margin: '0 auto 12px',
                        color: 'var(--color-text-tertiary)',
                        opacity: 0.6,
                      }}
                    />
                    <p
                      style={{
                        fontWeight: 'var(--font-semibold)',
                        color: 'var(--color-text-primary)',
                        fontSize: 'var(--text-base)',
                      }}
                    >
                      {isRu ? 'Акты не найдены' : 'Xizmat aktlari topilmadi'}
                    </p>
                    <p
                      style={{
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-text-tertiary)',
                        marginTop: '4px',
                        marginBottom: '16px',
                      }}
                    >
                      {isFiltered
                        ? isRu
                          ? 'Попробуйте изменить параметры поиска или фильтры'
                          : 'Qidiruv mezonlarini o‘zgartirib ko‘ring yoki filtrni tozalang'
                        : isRu
                        ? 'Создайте первый акт оказанных или полученных услуг'
                        : 'Birinchi ko‘rsatilgan yoki olingan xizmat aktini shakllantiring'}
                    </p>
                    {!isFiltered && (
                      <Button variant="primary" size="sm" onClick={handleOpenCreate}>
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        <span>{isRu ? 'Создать акт' : 'Yangi akt yaratish'}</span>
                      </Button>
                    )}
                  </td>
                </tr>
              ) : (
                acts.map((act) => {
                  return (
                    <tr
                      key={act.id}
                      onClick={() => handleOpenDetails(act)}
                      style={{
                        borderBottom: '1px solid var(--color-border-light)',
                        cursor: 'pointer',
                        transition: 'background-color 0.15s ease',
                      }}
                      className="hover:bg-gray-50/75 dark:hover:bg-gray-800/40"
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontWeight: 'var(--font-semibold)',
                            color: 'var(--color-text-primary)',
                          }}
                        >
                          {act.actNumber}
                        </span>
                        {act.externalNumber && (
                          <span
                            style={{
                              display: 'block',
                              fontSize: 'var(--text-xs)',
                              color: 'var(--color-text-tertiary)',
                              marginTop: '2px',
                            }}
                          >
                            {isRu ? 'Внешний №: ' : 'Tashqi №: '}
                            {act.externalNumber}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--color-text-secondary)' }}>
                        {formatDate(act.actDate, locale)}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontWeight: 'var(--font-medium)',
                            color: 'var(--color-text-primary)',
                          }}
                        >
                          {act.counterparty?.name || '—'}
                        </span>
                        {act.counterparty?.inn && (
                          <span
                            style={{
                              display: 'block',
                              fontSize: 'var(--text-xs)',
                              color: 'var(--color-text-tertiary)',
                              marginTop: '2px',
                            }}
                          >
                            STIR: {act.counterparty.inn}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Badge
                          variant={
                            act.status === 'POSTED'
                              ? 'success'
                              : act.status === 'DRAFT'
                              ? 'warning'
                              : 'error'
                          }
                        >
                          {act.status === 'POSTED'
                            ? isRu ? 'Проведён' : 'Tasdiqlangan'
                            : act.status === 'DRAFT'
                            ? isRu ? 'Черновик' : 'Qoralama'
                            : isRu ? 'Отменён' : 'Bekor qilingan'}
                        </Badge>
                      </td>
                      <td
                        style={{
                          padding: '12px 16px',
                          textAlign: 'right',
                          fontWeight: 'var(--font-semibold)',
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {formatCurrency(Number(act.totalAmount), locale, act.currency)}
                      </td>
                      <td
                        style={{
                          padding: '12px 16px',
                          textAlign: 'right',
                          fontWeight: 'var(--font-medium)',
                          color: '#10b981',
                        }}
                      >
                        {formatCurrency(Number(act.paidAmount), locale, act.currency)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <Badge
                          variant={
                            act.paymentStatus === 'PAID'
                              ? 'success'
                              : act.paymentStatus === 'PARTIALLY_PAID'
                              ? 'warning'
                              : 'neutral'
                          }
                        >
                          {act.paymentStatus === 'PAID'
                            ? isRu ? 'Оплачен' : 'To‘langan'
                            : act.paymentStatus === 'PARTIALLY_PAID'
                            ? isRu ? 'Частично' : 'Qisman'
                            : isRu ? 'Не оплачен' : 'Kutilmoqda'}
                        </Badge>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            gap: '6px',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => handleOpenDetails(act)}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
                            title={isRu ? 'Просмотр' : 'Ko‘rish'}
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setPrintAct(act)}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900 transition-colors"
                            title={isRu ? 'Печать' : 'Chop etish'}
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleEditAct(act, e)}
                            className="p-1.5 rounded hover:bg-blue-50 text-blue-600 hover:text-blue-800 transition-colors"
                            title={isRu ? 'Редактировать' : 'Tahrirlash'}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleDeleteAct(act, e)}
                            className="p-1.5 rounded hover:bg-red-50 text-red-500 hover:text-red-700 transition-colors"
                            title={isRu ? 'Удалить' : 'O‘chirish'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {total > pageSize && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderTop: '1px solid var(--color-border-light)',
              backgroundColor: 'var(--color-bg-primary)',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <span>
              {isRu ? 'Показано ' : 'Ko‘rsatilmoqda: '}
              <strong>{(page - 1) * pageSize + 1}</strong> -{' '}
              <strong>{Math.min(page * pageSize, total)}</strong> / {total}
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span>
                {page} / {totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ─── Drawer Form ──────────────────────────────────────────── */}
      <ServiceActDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onSuccess={fetchActs}
        initialData={editingAct}
        defaultType={activeType}
      />

      {/* ─── Details Modal ────────────────────────────────────────── */}
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

      {/* ─── Print View Modal ─────────────────────────────────────── */}
      {printAct && (
        <ServiceActPrintView
          act={printAct}
          companyName={company?.name || 'KORXONA'}
          onClose={() => setPrintAct(null)}
          locale={locale}
        />
      )}
    </div>
  );
}
