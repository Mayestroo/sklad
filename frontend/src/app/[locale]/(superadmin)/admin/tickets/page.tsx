'use client';

import { useState } from 'react';
import { useApiQuery, useInvalidateApi } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { useLocale, useTranslations } from 'next-intl';
import { SegmentedFilter } from '@/components/ui/filters';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatDate, formatDateTime, errorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { LifeBuoy } from 'lucide-react';
import { SupportTicket } from '@shared/types';
import { toast } from '@/context/ToastContext';

/** Higher first in the inbox. */
const PRIO: Record<string, number> = { HIGH: 2, MEDIUM: 1, LOW: 0 };

export default function SuperAdminTicketsPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token } = useAuth();

  const invalidateApi = useInvalidateApi();
  const ticketsQuery = useApiQuery<SupportTicket[]>('/super-admin/tickets', { scope: 'platform' });
  const tickets = ticketsQuery.data ?? [];

  // Conversation shown on the right (first in the list when none chosen)
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);


  const handleReply = async (e: React.FormEvent, ticket: SupportTicket) => {
    e.preventDefault();
    if (!token || !replyMessage.trim()) return;
    setReplyLoading(true);
    try {
      await apiFetch(`/super-admin/tickets/${ticket.id}/reply`, {
        token,
        locale,
        method: 'POST',
        body: JSON.stringify({ message: replyMessage }),
      });

      toast.success(isRu ? 'Ответ отправлен компании' : 'Javob korxonaga yuborildi');
      setSelectedTicket(ticket); // stay on the conversation that was answered
      setReplyMessage('');
      void invalidateApi('/super-admin/tickets');
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Не удалось отправить ответ' : 'Javobni yuborib bo‘lmadi'));
    } finally {
      setReplyLoading(false);
    }
  };

  const tt = useTranslations('rd.tickets');
  type Msg = { id?: string; message: string; isFromAdmin?: boolean; senderName?: string; createdAt?: string };
  const msgsOf = (t: SupportTicket) => ((t as { messages?: Msg[] }).messages ?? []);
  const companyOf = (t: SupportTicket) => {
    const c = (t as { company?: { name?: { uz?: string; ru?: string } | string; slug?: string } }).company;
    return (typeof c?.name === 'string' ? c.name : c?.name?.[locale] || c?.name?.uz) || c?.slug || '—';
  };
  // Waiting = not resolved/closed and the last word is the company's.
  const waiting = (t: SupportTicket) => t.status !== 'RESOLVED' && t.status !== 'CLOSED' && !msgsOf(t).at(-1)?.isFromAdmin;
  const [view, setView] = useState<'waiting' | 'all'>('waiting');
  const waitingCount = tickets.filter(waiting).length;
  const listed = (view === 'waiting' ? tickets.filter(waiting) : tickets)
    .slice()
    .sort((a, b) => Number(waiting(b)) - Number(waiting(a)) || PRIO[b.priority as string] - PRIO[a.priority as string] || b.createdAt.localeCompare(a.createdAt));
  const current = selectedTicket ? tickets.find((t) => t.id === selectedTicket.id) ?? selectedTicket : listed[0] ?? null;
  const statusBadge = (t: SupportTicket) =>
    waiting(t) ? <Badge variant="warning">{tt('waiting')}</Badge> : t.status === 'RESOLVED' || t.status === 'CLOSED' ? <Badge variant="success">{tt('resolved')}</Badge> : <Badge variant="info">{tt('answered')}</Badge>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ marginBottom: 'calc(-1 * var(--space-5))' }}>
        <PageHeader
          showBreadcrumbs={false}
          title={isRu ? 'Обращения' : 'Murojaatlar'}
          subtitle={isRu ? 'Вопросы компаний в поддержку. Ответ приходит компании в её кабинет.' : 'Korxonalarning qo‘llab-quvvatlashga savollari. Javob korxona kabinetiga boradi.'}
        />
      </div>

      {ticketsQuery.isError ? (
        <LoadError error={ticketsQuery.error} onRetry={() => void ticketsQuery.refetch()} retrying={ticketsQuery.isFetching} />
      ) : ticketsQuery.isPending ? (
        <SkeletonRows rows={4} columns={2} />
      ) : tickets.length === 0 ? (
        <div className="rd-table-card">
          <EmptyState icon={LifeBuoy} title={isRu ? 'Обращений пока нет' : 'Hozircha murojaatlar yo‘q'} description={isRu ? 'Когда компания напишет в поддержку, обращение появится здесь.' : 'Korxona qo‘llab-quvvatlashga yozganda murojaat shu yerda paydo bo‘ladi.'} />
        </div>
      ) : (
        <div className="tk-inbox">
          <div className="tk-list">
            <SegmentedFilter
              name="view"
              label={tt('show')}
              value={view}
              onChange={(v: string) => setView((v || 'all') as 'waiting' | 'all')}
              options={[
                { value: 'waiting', label: tt('waiting'), count: waitingCount },
                { value: 'all', label: tt('all'), count: tickets.length },
              ]}
            />
            {listed.length === 0 ? (
              <p className="rd-sub" style={{ padding: 'var(--space-4)' }}>{tt('allAnswered')}</p>
            ) : (
              <ul>
                {listed.map((t) => (
                  <li key={t.id}>
                    <button type="button" className="tk-item" aria-current={current?.id === t.id ? 'true' : undefined} onClick={() => { setSelectedTicket(t); setReplyMessage(''); }}>
                      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                        <strong className="tk-subj">{t.subject}</strong>
                        {statusBadge(t)}
                      </span>
                      <span className="rd-sub">{companyOf(t)} · {formatDate(t.createdAt, locale)}{t.priority === 'HIGH' ? ` · ${tt('urgent')}` : ''}</span>
                      {msgsOf(t).at(-1)?.message && <span className="tk-snippet">{msgsOf(t).at(-1)?.message}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {current && (
            <section className="tk-thread" aria-label={current.subject}>
              <header style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', margin: 0 }}>{current.subject}</h2>
                  <div className="rd-sub">{companyOf(current)} · {formatDate(current.createdAt, locale)}</div>
                </div>
                {statusBadge(current)}
              </header>
              <ol className="tk-msgs">
                {msgsOf(current).map((m, i) => (
                  <li key={m.id ?? i} className={m.isFromAdmin ? 'tk-msg tk-msg-admin' : 'tk-msg'}>
                    <span className="rd-sub">{m.isFromAdmin ? tt('we') : m.senderName || companyOf(current)}{m.createdAt ? ` · ${formatDateTime(m.createdAt, locale)}` : ''}</span>
                    <span style={{ whiteSpace: 'pre-wrap' }}>{m.message}</span>
                  </li>
                ))}
              </ol>
              <form onSubmit={(e) => void handleReply(e, current)} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                <label htmlFor="sa-ticket-reply-text" style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)' }}>
                  {isRu ? 'Текст ответа' : 'Javob matni'}
                </label>
                <textarea
                  id="sa-ticket-reply-text"
                  required
                  rows={3}
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit(); }}
                  placeholder={isRu ? 'Введите текст ответа...' : 'Javob matnini kiriting...'}
                  className="tk-reply"
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="rd-sub">{tt('replyNote')}</span>
                  <Button type="submit" loading={replyLoading} loadingText={isRu ? 'Отправка…' : 'Yuborilmoqda…'} disabled={!replyMessage.trim()}>
                    {isRu ? 'Отправить ответ' : 'Javobni yuborish'}
                  </Button>
                </div>
              </form>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
