'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import {
  Kanban,
  Plus,
  Building2,
  DollarSign,
  User,
  ArrowRight,
  X,
  CheckCircle2,
  XCircle,
  Edit2,
  Trash2,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/context/ToastContext';
import { Counterparty } from '@shared/types';
type Deal = any;

const STAGES: { slug: string; nameUz: string; nameRu: string; color: string }[] = [
  { slug: 'LEAD', nameUz: 'Lidlar (Yangi)', nameRu: 'Лиды (Новые)', color: 'var(--color-primary-600)' },
  { slug: 'QUALIFICATION', nameUz: 'Saralash', nameRu: 'Квалификация', color: '#8b5cf6' },
  { slug: 'PROPOSAL', nameUz: 'Tijorat Taklifi', nameRu: 'Коммерческое предл.', color: '#ec4899' },
  { slug: 'NEGOTIATION', nameUz: 'Muzokara', nameRu: 'Переговоры', color: '#f59e0b' },
  { slug: 'WON', nameUz: 'G\'alaba (Shartnoma)', nameRu: 'Успешно (Выиграно)', color: 'var(--color-success-600)' },
  { slug: 'LOST', nameUz: 'Mag\'lubiyat', nameRu: 'Проиграно', color: 'var(--color-error-600)' },
];

export default function CrmKanbanPage() {
  const t = useTranslations('sales');
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();

  const [kanbanData, setKanbanData] = useState<Record<string, Deal[]>>({});
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [loading, setLoading] = useState(true);

  // New Deal Modal State
  const [showModal, setShowModal] = useState(false);
  const [counterpartyId, setCounterpartyId] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [stage, setStage] = useState<string>('LEAD');
  const [createLoading, setCreateLoading] = useState(false);

  // Edit Deal Modal State
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAmount, setEditAmount] = useState<number>(0);
  const [editCounterpartyId, setEditCounterpartyId] = useState('');
  const [editStage, setEditStage] = useState('LEAD');
  const [editLoading, setEditLoading] = useState(false);

  // Delete Deal Modal State
  const [deletingDeal, setDeletingDeal] = useState<Deal | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);


  const fetchData = async () => {
    if (!token || !company) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [board, countData] = await Promise.all([
        apiFetch<Record<string, Deal[]>>('/sales/deals/kanban', { token, tenantId: company.id, locale }),
        apiFetch<Counterparty[]>('/sales/counterparties', { token, tenantId: company.id, locale }),
      ]);
      setKanbanData(board);
      setCounterparties(countData);
      if (countData.length > 0) setCounterpartyId(countData[0].id);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token, company]);

  const handleCreateDeal = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !company) return;
    setCreateLoading(true);

    try {
      await apiFetch<any>('/sales/deals', {
        method: 'POST',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          counterpartyId,
          title,
          amount: Number(amount),
          stage,
        }),
      });

      setShowModal(false);
      setTitle('');
      setAmount(0);
      fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setCreateLoading(false);
    }
  };

  const handleOpenEditDeal = (deal: Deal) => {
    setEditingDeal(deal);
    setEditTitle(deal.title || '');
    setEditAmount(Number(deal.amount) || 0);
    setEditCounterpartyId(deal.counterpartyId || '');
    setEditStage(deal.stage || 'LEAD');
  };

  const handleSaveEditDeal = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !company || !editingDeal) return;
    setEditLoading(true);
    try {
      await apiFetch<any>(`/sales/deals/${editingDeal.id}`, {
        method: 'PATCH',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          title: editTitle,
          amount: Number(editAmount),
          counterpartyId: editCounterpartyId,
          stage: editStage,
        }),
      });
      setEditingDeal(null);
      toast.success(isRu ? 'Сделка успешно обновлена' : 'Bitim muvaffaqiyatli yangilandi');
      fetchData();
    } catch (err: any) {
      toast.error(err?.message || (isRu ? 'Ошибка при обновлении сделки' : 'Bitimni yangilashda xatolik'));
    } finally {
      setEditLoading(false);
    }
  };

  const handleDeleteDeal = async () => {
    if (!token || !company || !deletingDeal) return;
    setDeleteLoading(true);
    try {
      await apiFetch<any>(`/sales/deals/${deletingDeal.id}`, {
        method: 'DELETE',
        token,
        tenantId: company.id,
        locale,
      });
      setDeletingDeal(null);
      toast.success(isRu ? 'Сделка успешно удалена' : 'Bitim muvaffaqiyatli o‘chirildi');
      fetchData();
    } catch (err: any) {
      toast.error(err?.message || (isRu ? 'Ошибка при удалении сделки' : 'Bitimni o‘chirishda xatolik'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleMoveStage = async (dealId: string, newStage: string) => {
    if (!token || !company) return;
    try {
      await apiFetch<any>(`/sales/deals/${dealId}/stage`, {
        method: 'PATCH',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({ stage: newStage }),
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const counterpartyOptions = counterparties.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  const stageOptions = STAGES.map((s) => ({
    value: s.slug,
    label: locale === 'uz' ? s.nameUz : s.nameRu,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            {isRu ? 'CRM Канбан Воронка Сделок' : 'CRM Kanban Bitimlar Quvuri'}
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            {isRu ? 'Движение сделок от лидов до успешного контракта по этапам' : 'Lidlardan shartnoma va sotuvgacha bo‘lgan bitimlar bosqichlari bo‘yicha harakati'}
          </p>
        </div>

        <Button variant="primary" onClick={() => setShowModal(true)}>
          <Plus size={16} />
          {isRu ? 'Создать сделку' : 'Yangi Bitim Yaratish'}
        </Button>
      </div>

      {/* Kanban Board Layout */}
      {loading ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
          {tCommon('loading')}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(240px, 1fr))', gap: 'var(--space-4)', overflowX: 'auto', paddingBottom: 'var(--space-4)' }}>
          {STAGES.map((stg) => {
            const deals = kanbanData[stg.slug] || [];
            const columnTotal = deals.reduce((sum, d) => sum + Number(d.amount), 0);

            return (
              <div key={stg.slug} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', backgroundColor: 'var(--color-bg-tertiary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', minHeight: '500px' }}>
                {/* Column Header */}
                <div style={{ borderBottom: `3px solid ${stg.color}`, paddingBottom: 'var(--space-2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
                      {locale === 'uz' ? stg.nameUz : stg.nameRu}
                    </span>
                    <Badge variant="neutral">{deals.length}</Badge>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '4px', fontWeight: 'var(--font-semibold)' }} className="tabular-nums">
                    {formatCurrency(columnTotal, locale)}
                  </div>
                </div>

                {/* Cards List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', flex: 1 }}>
                  {deals.map((deal) => (
                    <Card key={deal.id} style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: 'var(--shadow-sm)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', wordBreak: 'break-word' }}>
                          {deal.title}
                        </div>
                        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={() => handleOpenEditDeal(deal)}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px', color: 'var(--color-text-secondary)' }}
                            title={isRu ? 'Редактировать' : 'Tahrirlash'}
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingDeal(deal)}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px', color: '#ef4444' }}
                            title={isRu ? 'Удалить' : 'O‘chirish'}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Building2 size={12} />
                        <span>{deal.counterparty?.name || '—'}</span>
                      </div>

                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)', color: stg.color, marginTop: '2px' }} className="tabular-nums">
                        {formatCurrency(Number(deal.amount), locale)}
                      </div>

                      {/* Stage Selector Action */}
                      <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: '6px', marginTop: '4px' }}>
                        <Select
                          options={stageOptions}
                          value={deal.stage}
                          onChange={(val) => handleMoveStage(deal.id, val)}
                        />
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Deal Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 'var(--space-4)' }}>
          <div style={{ width: '100%', maxWidth: '460px', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Новая сделка CRM' : 'Yangi CRM Bitim Yaratish'}</h3>
              <button type="button" onClick={() => setShowModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            <form onSubmit={handleCreateDeal} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>{isRu ? 'Название сделки *' : 'Bitim Nomi *'}</label>
                <input type="text" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isRu ? 'Напр: Поставка 500 шт Coca-Cola' : 'Misol: 500 dona Coca-Cola etkazish shartnomasi'} style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }} />
              </div>

              <Select
                label={isRu ? 'Клиент (Контрагент) *' : 'Mijoz (Kontragent) *'}
                options={counterpartyOptions}
                value={counterpartyId}
                onChange={(val) => setCounterpartyId(val)}
                placeholder={isRu ? 'Выберите клиента' : 'Mijozni tanlang'}
              />

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>{isRu ? 'Ориентировочная сумма (сум)' : 'Taxminiy Summasi (So‘m)'}</label>
                <input type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }} />
              </div>

              <Select
                label={isRu ? 'Начальный этап' : 'Boshlang‘ich Bosqich'}
                options={stageOptions}
                value={stage}
                onChange={(val) => setStage(val)}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>{tCommon('cancel')}</Button>
                <Button type="submit" variant="primary" disabled={createLoading}>{createLoading ? tCommon('loading') : tCommon('save')}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Deal Modal */}
      {editingDeal && (
        <Modal
          isOpen={Boolean(editingDeal)}
          onClose={() => setEditingDeal(null)}
          title={isRu ? 'Редактировать сделку' : 'Bitimni tahrirlash'}
        >
          <form onSubmit={handleSaveEditDeal} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>
                {isRu ? 'Название сделки *' : 'Bitim Nomi *'}
              </label>
              <input
                type="text"
                required
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }}
              />
            </div>

            <Select
              label={isRu ? 'Клиент (Контрагент) *' : 'Mijoz (Kontragent) *'}
              options={counterpartyOptions}
              value={editCounterpartyId}
              onChange={(val) => setEditCounterpartyId(val)}
            />

            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>
                {isRu ? 'Ориентировочная сумма (сум)' : 'Taxminiy Summasi (So‘m)'}
              </label>
              <input
                type="number"
                min={0}
                value={editAmount}
                onChange={(e) => setEditAmount(Number(e.target.value))}
                style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }}
              />
            </div>

            <Select
              label={isRu ? 'Этап сделки' : 'Bitim Bosqichi'}
              options={stageOptions}
              value={editStage}
              onChange={(val) => setEditStage(val)}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
              <Button type="button" variant="secondary" onClick={() => setEditingDeal(null)}>
                {tCommon('cancel')}
              </Button>
              <Button type="submit" variant="primary" disabled={editLoading}>
                {editLoading ? tCommon('loading') : tCommon('save')}
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Deal Modal */}
      {deletingDeal && (
        <Modal
          isOpen={Boolean(deletingDeal)}
          onClose={() => setDeletingDeal(null)}
          title={isRu ? 'Удаление сделки' : 'Bitimni o‘chirish'}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              {isRu
                ? `Вы уверены, что хотите удалить сделку "${deletingDeal.title}"? Это действие необратимо.`
                : `Haqiqatan ham "${deletingDeal.title}" bitimini o‘chirmoqchimisiz? Bu amalni ortga qaytarib bo‘lmaydi.`}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <Button variant="secondary" onClick={() => setDeletingDeal(null)}>
                {tCommon('cancel')}
              </Button>
              <Button
                variant="primary"
                style={{ backgroundColor: '#ef4444' }}
                onClick={handleDeleteDeal}
                disabled={deleteLoading}
              >
                {deleteLoading ? tCommon('loading') : (isRu ? 'Удалить' : 'O‘chirish')}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

