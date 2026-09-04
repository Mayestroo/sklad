'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { ServiceActDrawer } from '@/components/services/ServiceActDrawer';
import { ServiceActDetailsModal } from '@/components/services/ServiceActDetailsModal';
import { ServiceActPrintView } from '@/components/services/ServiceActPrintView';
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
  Filter,
} from 'lucide-react';

export default function ServicesPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  // Active Tab: PROVIDED vs RECEIVED
  const [activeType, setActiveType] = useState<'PROVIDED' | 'RECEIVED'>('PROVIDED');

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [page, setPage] = useState(1);

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
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('type', activeType);
      params.append('page', String(page));
      params.append('limit', '25');
      if (search.trim()) params.append('search', search.trim());
      if (statusFilter) params.append('status', statusFilter);
      if (paymentStatusFilter) params.append('paymentStatus', paymentStatusFilter);

      const res = await apiFetch<{ items: any[]; total: number }>(`/services?${params.toString()}`);
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
  }, [activeType, search, statusFilter, paymentStatusFilter, page]);

  useEffect(() => {
    fetchActs();
  }, [fetchActs]);

  // Aggregate Metrics for Active Tab
  const totalAmountSum = acts.reduce((s, a) => s + (Number(a.totalAmount) || 0), 0);
  const totalPaidSum = acts.reduce((s, a) => s + (Number(a.paidAmount) || 0), 0);
  const totalDebtSum = Math.max(0, totalAmountSum - totalPaidSum);

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
      const detailed = await apiFetch(`/services/${act.id}`);
      setSelectedAct(detailed);
      setIsDetailsOpen(true);
    } catch {
      setSelectedAct(act);
      setIsDetailsOpen(true);
    }
  };

  const handleDeleteDraft = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(isRu ? 'Удалить этот черновик?' : 'Ushbu qoralama aktni o\'chirmoqchimisiz?')) {
      return;
    }

    try {
      await apiFetch(`/services/${id}`, { method: 'DELETE' });
      fetchActs();
    } catch (err: any) {
      alert(err.message || 'O\'chirishda xatolik yuz berdi');
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isRu ? 'Акты и расчеты по услугам' : 'Xizmatlar aktlari va hisob-kitoblar'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {isRu
              ? 'Раздельный учет услуг (Accruals) и автоматическая синхронизация с Модулем Финансов'
              : 'Xizmatlar hisobi (Accruals) va Moliya moduli orqali avtomatik to\'lovlarni so\'ndirish'}
          </p>
        </div>
        <Button
          variant="primary"
          onClick={handleOpenCreate}
          className="flex items-center gap-2 self-start sm:self-auto shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>
            {activeType === 'PROVIDED'
              ? isRu ? 'Новая оказанная услуга' : 'Yangi ko\'rsatilgan xizmat'
              : isRu ? 'Новая полученная услуga' : 'Yangi olingan xizmat'}
          </span>
        </Button>
      </div>

      {/* Segmented Type Switcher */}
      <div className="flex bg-gray-100 p-1 rounded-lg w-full max-w-md border border-gray-200">
        <button
          type="button"
          onClick={() => {
            setActiveType('PROVIDED');
            setPage(1);
          }}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${
            activeType === 'PROVIDED'
              ? 'bg-white text-gray-900 shadow-sm font-semibold'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <ArrowUpRight className="w-4 h-4 text-green-600" />
          <span>{isRu ? 'Оказанные услуги' : 'Ko\'rsatilgan xizmatlar'}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveType('RECEIVED');
            setPage(1);
          }}
          className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 ${
            activeType === 'RECEIVED'
              ? 'bg-white text-gray-900 shadow-sm font-semibold'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          <ArrowDownRight className="w-4 h-4 text-blue-600" />
          <span>{isRu ? 'Полученные услуги' : 'Olingan xizmatlar'}</span>
        </button>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 text-xs font-medium uppercase tracking-wider">
            <span>{isRu ? 'Общая сумма услуг' : 'Jami xizmatlar summasi'}</span>
            <Clock className="w-4 h-4 text-gray-400" />
          </div>
          <p className="text-xl font-bold text-gray-900 mt-2">
            {formatCurrency(totalAmountSum, locale, 'UZS')}
          </p>
          <span className="text-xs text-gray-500 mt-1 block">
            {total} {isRu ? 'актов в текущей выборке' : 'ta hujjat'}
          </span>
        </div>

        <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 text-xs font-medium uppercase tracking-wider">
            <span>{isRu ? 'Оплачено через Финансы' : 'Moliya orqali to\'langan'}</span>
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          </div>
          <p className="text-xl font-bold text-green-600 mt-2">
            {formatCurrency(totalPaidSum, locale, 'UZS')}
          </p>
          <span className="text-xs text-gray-500 mt-1 block">
            {totalAmountSum > 0
              ? `${Math.round((totalPaidSum / totalAmountSum) * 100)}% so'ndirilgan`
              : '0%'}
          </span>
        </div>

        <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between text-gray-500 text-xs font-medium uppercase tracking-wider">
            <span>
              {activeType === 'PROVIDED'
                ? isRu ? 'Остаток задолженности клиентов' : 'Mijozlar qarzdorligi (Haqdorlik)'
                : isRu ? 'Наш долг поставщикам' : 'Yetkazib beruvchilarga qarzimiz'}
            </span>
            <AlertCircle className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-xl font-bold text-red-600 mt-2">
            {formatCurrency(totalDebtSum, locale, 'UZS')}
          </p>
          <span className="text-xs text-gray-500 mt-1 block">
            {isRu ? 'Требуется сопоставление платежей' : 'Moliya to\'lovi kutilmoqda'}
          </span>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-5 relative">
            <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400 pointer-events-none" />
            <Input
              type="text"
              placeholder={isRu ? 'Поиск по номеру, контрагенту, примечанию...' : '№, kontragent yoki izoh bo\'yicha qidiruv...'}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
            />
          </div>

          <div className="sm:col-span-3">
            <Select
              options={[
                { value: '', label: isRu ? 'Все статусы проведения' : 'Barcha holatlar' },
                { value: 'DRAFT', label: isRu ? 'Черновик (DRAFT)' : 'Qoralama' },
                { value: 'POSTED', label: isRu ? 'Проведён (POSTED)' : 'Tasdiqlangan' },
                { value: 'CANCELLED', label: isRu ? 'Отменён (CANCELLED)' : 'Bekor qilingan' },
              ]}
              value={statusFilter}
              onChange={(val) => {
                setStatusFilter(val);
                setPage(1);
              }}
            />
          </div>

          <div className="sm:col-span-4">
            <Select
              options={[
                { value: '', label: isRu ? 'Все статусы оплаты' : 'Barcha to\'lov holatlari' },
                { value: 'UNPAID', label: isRu ? 'Не оплачен' : 'To\'lanmagan' },
                { value: 'PARTIALLY_PAID', label: isRu ? 'Частично оплачен' : 'Qisman to\'langan' },
                { value: 'PAID', label: isRu ? 'Полностью оплачен' : 'To\'langan' },
              ]}
              value={paymentStatusFilter}
              onChange={(val) => {
                setPaymentStatusFilter(val);
                setPage(1);
              }}
            />
          </div>
        </div>
      </div>

      {/* Acts Table */}
      <div className="bg-white rounded-lg overflow-hidden border border-gray-200 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase border-b border-gray-200">
              <tr>
                <th className="p-3.5">{isRu ? '№ Акта' : 'Akt №'}</th>
                <th className="p-3.5">{isRu ? 'Дата' : 'Sana'}</th>
                <th className="p-3.5">
                  {activeType === 'PROVIDED'
                    ? isRu ? 'Клиент' : 'Mijoz'
                    : isRu ? 'Поставщик' : 'Yetkazib beruvchi'}
                </th>
                <th className="p-3.5">{isRu ? 'Статус' : 'Holati'}</th>
                <th className="p-3.5 text-right">{isRu ? 'Начислено' : 'Hisoblangan summa'}</th>
                <th className="p-3.5 text-right">{isRu ? 'Оплачено' : 'To\'langan summa'}</th>
                <th className="p-3.5 text-center">{isRu ? 'Оплата' : 'To\'lov holati'}</th>
                <th className="p-3.5 text-right">{isRu ? 'Действия' : 'Amallar'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-gray-500">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent"></div>
                    <p className="mt-2 text-xs">{isRu ? 'Загрузка...' : 'Yuklanmoqda...'}</p>
                  </td>
                </tr>
              ) : acts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-gray-400">
                    <Filter className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                    <p className="font-medium text-gray-600">
                      {isRu ? 'Акты не найдены' : 'Hujjatlar topilmadi'}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      {isRu
                        ? 'Создайте новый акт или измените параметры поиска'
                        : 'Yangi xizmat akti qo\'shing yoki qidiruv filtrlarini tozalang'}
                    </p>
                  </td>
                </tr>
              ) : (
                acts.map((act) => {
                  const isDraft = act.status === 'DRAFT';
                  return (
                    <tr
                      key={act.id}
                      onClick={() => handleOpenDetails(act)}
                      className="hover:bg-gray-50/75 cursor-pointer transition-colors"
                    >
                      <td className="p-3.5">
                        <span className="font-bold text-gray-900">{act.actNumber}</span>
                        {act.externalNumber && (
                          <span className="block text-xs text-gray-400 mt-0.5">
                            {isRu ? 'Внешний №: ' : 'Tashqi №: '}
                            {act.externalNumber}
                          </span>
                        )}
                      </td>
                      <td className="p-3.5 text-gray-600">{formatDate(act.actDate, locale)}</td>
                      <td className="p-3.5">
                        <span className="font-medium text-gray-900">
                          {act.counterparty?.name || '—'}
                        </span>
                        {act.counterparty?.inn && (
                          <span className="block text-xs text-gray-400">
                            STIR: {act.counterparty.inn}
                          </span>
                        )}
                      </td>
                      <td className="p-3.5">
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
                      <td className="p-3.5 text-right font-semibold text-gray-900">
                        {formatCurrency(Number(act.totalAmount), locale, act.currency)}
                      </td>
                      <td className="p-3.5 text-right font-medium text-green-700">
                        {formatCurrency(Number(act.paidAmount), locale, act.currency)}
                      </td>
                      <td className="p-3.5 text-center">
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
                            ? isRu ? 'Оплачен' : 'To\'langan'
                            : act.paymentStatus === 'PARTIALLY_PAID'
                            ? isRu ? 'Частично' : 'Qisman'
                            : isRu ? 'Не оплачен' : 'Kutilmoqda'}
                        </Badge>
                      </td>
                      <td className="p-3.5 text-right">
                        <div
                          className="flex items-center justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => handleOpenDetails(act)}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                            title={isRu ? 'Просмотр' : 'Ko\'rish'}
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setPrintAct(act)}
                            className="p-1.5 rounded hover:bg-gray-100 text-gray-600 hover:text-gray-900"
                            title={isRu ? 'Печать' : 'Chop etish'}
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          {isDraft && (
                            <button
                              type="button"
                              onClick={(e) => handleDeleteDraft(act.id, e)}
                              className="p-1.5 rounded hover:bg-red-50 text-red-500 hover:text-red-700"
                              title={isRu ? 'Удалить' : 'O\'chirish'}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer */}
      <ServiceActDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        onSuccess={fetchActs}
        initialData={editingAct}
        defaultType={activeType}
      />

      {/* Details Modal */}
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

      {/* Print View Modal */}
      {printAct && (
        <ServiceActPrintView
          act={printAct}
          onClose={() => setPrintAct(null)}
          locale={locale}
        />
      )}
    </div>
  );
}
