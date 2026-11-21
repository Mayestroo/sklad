'use client';

import { MoneyInput } from '@/components/ui/MoneyInput';
import { useState, FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { formatCurrency, formatPriceOrUnset, errorMessage, CURRENCY_OPTIONS } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ActionsMenu } from '@/components/production/ActionsMenu';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { PageHeader } from '@/components/ui/PageHeader';
import { Skeleton } from '@/components/ui/Skeleton';
import { Plus, Building2, ArrowRight } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/context/ToastContext';
import { useConfirm } from '@/context/ConfirmContext';
import { Counterparty } from '@shared/types';

interface Deal {
  id: string;
  title: string;
  stage: string;
  amount: number | string;
  /** null on legacy deals saved before the currency column (shown as "not chosen"). */
  currency: string | null;
  counterpartyId: string;
  counterparty?: { name: string } | null;
}

/** Pipeline stages; the stripe colour only decorates the named column. */
const STAGES: { slug: string; nameUz: string; nameRu: string; stripe: string }[] = [
  { slug: 'LEAD', nameUz: 'Yangi', nameRu: 'Новые', stripe: 'var(--color-primary-300)' },
  { slug: 'QUALIFICATION', nameUz: 'Saralash', nameRu: 'Квалификация', stripe: 'var(--color-primary-400)' },
  { slug: 'PROPOSAL', nameUz: 'Tijorat taklifi', nameRu: 'Коммерческое предложение', stripe: 'var(--color-primary-500)' },
  { slug: 'NEGOTIATION', nameUz: 'Muzokara', nameRu: 'Переговоры', stripe: 'var(--color-primary-600)' },
  { slug: 'WON', nameUz: 'Yutildi', nameRu: 'Выиграно', stripe: 'var(--color-success-600)' },
  { slug: 'LOST', nameUz: 'Yutqazildi', nameRu: 'Проиграно', stripe: 'var(--color-error-600)' },
];

interface DealForm {
  title: string;
  counterpartyId: string;
  amount: number;
  currency: string;
  stage: string;
}
/** Won and lost deals share one column at the end of the board. */
const CLOSED = { slug: 'CLOSED', nameUz: 'Yopilgan (yutildi / yutqazildi)', nameRu: 'Закрытые (выиграно / проиграно)', stripe: 'var(--color-border)' };
const FORWARD: Record<string, string> = { LEAD: 'QUALIFICATION', QUALIFICATION: 'PROPOSAL', PROPOSAL: 'NEGOTIATION', NEGOTIATION: 'WON' };
const nextStage = (stage: string): string | undefined => FORWARD[stage];

const EMPTY_FORM: DealForm = { title: '', counterpartyId: '', amount: 0, currency: '', stage: 'LEAD' };

export default function CrmKanbanPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const tcrm = useTranslations('rd.crm');
  const { token, company } = useAuth();
  const confirm = useConfirm();

  const kanbanQuery = useApiQuery<Record<string, Deal[]>>('/sales/deals/kanban');
  const counterpartiesQuery = useApiQuery<Counterparty[]>('/sales/counterparties');
  const pageQueries = [kanbanQuery, counterpartiesQuery];
  const kanbanData = kanbanQuery.data ?? {};
  const counterparties = counterpartiesQuery.data ?? [];
  const loading = pageQueries.some((q) => q.isPending);
  const failedQuery = pageQueries.find((q) => q.isError);

  // null = closed; editingId null + open = new deal
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<DealForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<{ counterpartyId?: string; currency?: string }>({});
  const [saving, setSaving] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);

  const fetchData = () => pageQueries.forEach((q) => void q.refetch());
  const stageName = (slug: string) => {
    const s = STAGES.find((x) => x.slug === slug);
    return s ? (isRu ? s.nameRu : s.nameUz) : slug;
  };

  const openNew = () => {
    setEditingId(null);
    // No client is pre-selected: a deal on the wrong client is worse than one more click.
    setForm(EMPTY_FORM);
    setErrors({});
    setFormOpen(true);
  };
  const openEdit = (deal: Deal) => {
    setEditingId(deal.id);
    setForm({ title: deal.title || '', counterpartyId: deal.counterpartyId || '', amount: Number(deal.amount) || 0, currency: deal.currency ?? '', stage: deal.stage || 'LEAD' });
    setErrors({});
    setFormOpen(true);
  };

  const handleSave = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!token || !company || saving) return;
    const nextErrors: typeof errors = {};
    if (!form.counterpartyId) nextErrors.counterpartyId = isRu ? 'Выберите клиента' : 'Mijozni tanlang';
    if (form.amount > 0 && !form.currency) nextErrors.currency = isRu ? 'Выберите валюту' : 'Valyutani tanlang';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !form.title.trim()) return;
    setSaving(true);
    try {
      const body = JSON.stringify({
        title: form.title.trim(),
        counterpartyId: form.counterpartyId,
        amount: Number(form.amount),
        ...(form.currency ? { currency: form.currency } : {}),
        stage: form.stage,
      });
      if (editingId) {
        await apiFetch<Deal>(`/sales/deals/${editingId}`, { method: 'PATCH', token, tenantId: company.id, locale, body });
        toast.success(isRu ? 'Сделка сохранена' : 'Bitim saqlandi');
      } else {
        await apiFetch<Deal>('/sales/deals', { method: 'POST', token, tenantId: company.id, locale, body });
        toast.success(isRu ? 'Сделка создана' : 'Bitim yaratildi');
      }
      setFormOpen(false);
      fetchData();
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Не удалось сохранить сделку' : 'Bitimni saqlab bo‘lmadi'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteDeal = async (deal: Deal) => {
    if (!token || !company) return;
    const ok = await confirm({
      title: isRu ? 'Удалить сделку?' : 'Bitim o‘chirilsinmi?',
      description: isRu ? `Сделка «${deal.title}» будет удалена без возможности восстановления.` : `«${deal.title}» bitimi butunlay o‘chiriladi.`,
      variant: 'danger',
      confirmText: isRu ? 'Удалить' : 'O‘chirish',
      cancelText: isRu ? 'Отмена' : 'Bekor qilish',
    });
    if (!ok) return;
    try {
      await apiFetch<unknown>(`/sales/deals/${deal.id}`, { method: 'DELETE', token, tenantId: company.id, locale });
      toast.success(isRu ? `Сделка «${deal.title}» удалена` : `«${deal.title}» o‘chirildi`);
      fetchData();
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Не удалось удалить сделку' : 'Bitimni o‘chirib bo‘lmadi'));
    }
  };

  const handleMoveStage = async (deal: Deal, newStage: string) => {
    if (!token || !company || newStage === deal.stage) return;
    setMovingId(deal.id);
    try {
      await apiFetch<Deal>(`/sales/deals/${deal.id}/stage`, { method: 'PATCH', token, tenantId: company.id, locale, body: JSON.stringify({ stage: newStage }) });
      toast.success(isRu ? `«${deal.title}» → ${stageName(newStage)}` : `«${deal.title}» → ${stageName(newStage)}`);
      fetchData();
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Не удалось перенести сделку' : 'Bitimni ko‘chirib bo‘lmadi'));
    } finally {
      setMovingId(null);
    }
  };

  const counterpartyOptions = counterparties.map((c) => ({ value: c.id, label: c.name }));
  const stageOptions = STAGES.map((s) => ({ value: s.slug, label: isRu ? s.nameRu : s.nameUz }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ marginBottom: 'calc(-1 * var(--space-5))' }}>
        <PageHeader
          title={isRu ? 'Сделки' : 'Bitimlar'}
          subtitle={isRu ? 'Воронка продаж: от первого контакта до договора. Меняйте этап в карточке сделки.' : 'Savdo voronkasi: birinchi aloqadan shartnomagacha. Bosqichni bitim kartochkasida o‘zgartiring.'}
          actions={
            <Button variant="primary" onClick={openNew}>
              <Plus size={16} aria-hidden /> {isRu ? 'Новая сделка' : 'Yangi bitim'}
            </Button>
          }
        />
      </div>

      {failedQuery ? (
        <Card>
          <LoadError error={failedQuery.error} onRetry={() => pageQueries.filter((q) => q.isError).forEach((q) => void q.refetch())} retrying={pageQueries.some((q) => q.isFetching)} />
        </Card>
      ) : loading ? (
        <div role="status" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 'var(--space-4)' }}>
          <span className="sr-only">{isRu ? 'Загрузка…' : 'Yuklanmoqda…'}</span>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-3)' }}>
              <Skeleton height={14} width="50%" />
              <Skeleton height={80} style={{ marginTop: 12 }} />
            </div>
          ))}
        </div>
      ) : (
        <div tabIndex={0} role="region" aria-label={isRu ? 'Воронка сделок' : 'Bitimlar voronkasi'} className="crm-board">
          {[...STAGES.slice(0, 4), CLOSED].map((stg) => {
            const deals = stg.slug === 'CLOSED' ? [...(kanbanData.WON || []), ...(kanbanData.LOST || [])] : kanbanData[stg.slug] || [];
            // Per currency (ADR 0023); legacy deals without a currency stay apart.
            const totals = new Map<string, number>();
            for (const d of deals) {
              const key = d.currency ?? '';
              totals.set(key, (totals.get(key) ?? 0) + Number(d.amount));
            }
            const columnTotals = [...totals.entries()].filter(([, sum]) => sum !== 0);
            const headingId = `crm-stage-${stg.slug}`;

            return (
              <section key={stg.slug} aria-labelledby={headingId} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', backgroundColor: 'var(--color-bg-tertiary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-lg)', minHeight: 320 }}>
                <div style={{ borderBottom: `3px solid ${stg.stripe}`, paddingBottom: 'var(--space-2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <h2 id={headingId} style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}>{stg.slug === 'CLOSED' ? tcrm('closed') : isRu ? stg.nameRu : stg.nameUz}</h2>
                    <Badge variant="neutral">{deals.length}</Badge>
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 4, fontWeight: 'var(--font-medium)' }} className="tabular-nums">
                    {columnTotals.length === 0
                      ? '—'
                      : columnTotals.map(([cur, sum]) => (
                          <span key={cur || 'none'} style={{ display: 'block' }}>{cur ? formatCurrency(sum, locale, cur) : formatPriceOrUnset(sum, locale, null)}</span>
                        ))}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', flex: 1 }}>
                  {deals.length === 0 && (
                    <div style={{ padding: 'var(--space-6) var(--space-2)', textAlign: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', border: '1px dashed var(--color-border)', borderRadius: 'var(--radius-md)' }}>
                      {stg.slug === 'LEAD'
                        ? isRu ? 'Новых сделок нет. Нажмите «Новая сделка».' : 'Yangi bitimlar yo‘q. «Yangi bitim»ni bosing.'
                        : isRu ? 'Нет сделок на этом этапе' : 'Bu bosqichda bitim yo‘q'}
                    </div>
                  )}
                  {deals.map((deal) => (
                    <Card key={deal.id} style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8, boxShadow: 'var(--shadow-sm)', opacity: movingId === deal.id ? 0.6 : 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <h3 style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)', wordBreak: 'break-word' }}>{deal.title}</h3>
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Building2 size={12} aria-hidden />
                        <span>{deal.counterparty?.name || '—'}</span>
                      </div>
                      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)' }} className="tabular-nums">
                        {formatPriceOrUnset(Number(deal.amount), locale, deal.currency)}
                      </div>
                      {(deal.stage === 'WON' || deal.stage === 'LOST') && (
                        <Badge variant={deal.stage === 'WON' ? 'success' : 'error'}>{stageName(deal.stage)}</Badge>
                      )}
                      <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 6, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                        {nextStage(deal.stage) && (
                          <button type="button" className="rd-next-btn" disabled={movingId === deal.id} onClick={() => void handleMoveStage(deal, nextStage(deal.stage)!)}>
                            {stageName(nextStage(deal.stage)!)} <ArrowRight size={13} aria-hidden />
                          </button>
                        )}
                        {deal.stage === 'NEGOTIATION' && (
                          <button type="button" className="rd-next-btn" style={{ background: 'var(--color-error-50)', color: 'var(--color-error-700)', borderColor: 'var(--color-error-200)' }} disabled={movingId === deal.id} onClick={() => void handleMoveStage(deal, 'LOST')}>
                            {stageName('LOST')}
                          </button>
                        )}
                        <span style={{ marginLeft: 'auto' }}>
                          <ActionsMenu
                            label={isRu ? 'Другие действия' : 'Boshqa amallar'}
                            actions={[
                              ...STAGES.filter((x) => x.slug !== deal.stage).map((x) => ({ label: `→ ${isRu ? x.nameRu : x.nameUz}`, onSelect: () => void handleMoveStage(deal, x.slug) })),
                              { label: isRu ? 'Изменить' : 'Tahrirlash', onSelect: () => openEdit(deal) },
                              { label: isRu ? 'Удалить' : 'O‘chirish', onSelect: () => void handleDeleteDeal(deal), danger: true },
                            ]}
                          />
                        </span>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId ? (isRu ? 'Изменить сделку' : 'Bitimni tahrirlash') : isRu ? 'Новая сделка' : 'Yangi bitim'}
        onSubmitShortcut={() => void handleSave()}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>{isRu ? 'Отмена' : 'Bekor qilish'}</Button>
            <Button type="submit" form="crm-deal-form" variant="primary" loading={saving} loadingText={isRu ? 'Сохранение…' : 'Saqlanmoqda…'}>
              {editingId ? (isRu ? 'Сохранить' : 'Saqlash') : isRu ? 'Создать сделку' : 'Bitim yaratish'}
            </Button>
          </>
        }
      >
        <form id="crm-deal-form" onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <Input
            autoFocus
            required
            label={isRu ? 'Название сделки *' : 'Bitim nomi *'}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder={isRu ? 'Напр.: поставка 500 коробок воды' : 'Masalan: 500 quti suv yetkazish'}
          />
          <Select
            label={isRu ? 'Клиент *' : 'Mijoz *'}
            options={counterpartyOptions}
            value={form.counterpartyId}
            searchable
            error={errors.counterpartyId}
            onChange={(val) => {
              setForm((f) => ({ ...f, counterpartyId: val }));
              setErrors((er) => ({ ...er, counterpartyId: undefined }));
            }}
            placeholder={isRu ? 'Выберите клиента' : 'Mijozni tanlang'}
          />
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 120px', gap: 'var(--space-2)', alignItems: 'start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label htmlFor="crm-deal-amount" style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)' }}>
                {isRu ? 'Ожидаемая сумма' : 'Taxminiy summa'}
              </label>
              <MoneyInput id="crm-deal-amount" value={form.amount || ''} onValueChange={(value) => setForm((f) => ({ ...f, amount: Number(value) || 0 }))} />
            </div>
            <Select
              label={isRu ? 'Валюта' : 'Valyuta'}
              options={CURRENCY_OPTIONS}
              value={form.currency}
              error={errors.currency}
              onChange={(val) => {
                setForm((f) => ({ ...f, currency: val }));
                setErrors((er) => ({ ...er, currency: undefined }));
              }}
              placeholder={isRu ? 'Выбрать' : 'Tanlang'}
            />
          </div>
          <Select label={isRu ? 'Этап' : 'Bosqich'} options={stageOptions} value={form.stage} onChange={(val) => setForm((f) => ({ ...f, stage: val }))} />
        </form>
      </Modal>
    </div>
  );
}
