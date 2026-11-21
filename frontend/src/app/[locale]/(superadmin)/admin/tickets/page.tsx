'use client';

import { useState } from 'react';
import { useApiQuery, useInvalidateApi } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatDate, errorMessage } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { Modal } from '@/components/ui/Modal';
import { CheckCircle2, Clock, LifeBuoy } from 'lucide-react';
import { SupportTicket } from '@shared/types';
import { toast } from '@/context/ToastContext';

export default function SuperAdminTicketsPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token } = useAuth();

  const invalidateApi = useInvalidateApi();
  const ticketsQuery = useApiQuery<SupportTicket[]>('/super-admin/tickets', { scope: 'platform' });
  const tickets = ticketsQuery.data ?? [];

  // Reply modal
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);


  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedTicket || !replyMessage.trim()) return;
    setReplyLoading(true);
    try {
      await apiFetch(`/super-admin/tickets/${selectedTicket.id}/reply`, {
        token,
        locale,
        method: 'POST',
        body: JSON.stringify({ message: replyMessage }),
      });

      toast.success(isRu ? 'Ответ отправлен компании' : 'Javob korxonaga yuborildi');
      setSelectedTicket(null);
      setReplyMessage('');
      void invalidateApi('/super-admin/tickets');
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Не удалось отправить ответ' : 'Javobni yuborib bo‘lmadi'));
    } finally {
      setReplyLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ marginBottom: 'calc(-1 * var(--space-5))' }}>
        <PageHeader
          showBreadcrumbs={false}
          title={isRu ? 'Обращения' : 'Murojaatlar'}
          subtitle={isRu ? 'Вопросы компаний в поддержку. Ответ приходит компании в её кабинет.' : 'Korxonalarning qo‘llab-quvvatlashga savollari. Javob korxona kabinetiga boradi.'}
        />
      </div>

      <div
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden',
        }}
      >
        {ticketsQuery.isError ? (
          <LoadError error={ticketsQuery.error} onRetry={() => void ticketsQuery.refetch()} retrying={ticketsQuery.isFetching} />
        ) : ticketsQuery.isPending ? (
          <SkeletonRows rows={4} columns={4} />
        ) : tickets.length === 0 ? (
          <EmptyState icon={LifeBuoy} title={isRu ? 'Обращений пока нет' : 'Hozircha murojaatlar yo‘q'} description={isRu ? 'Когда компания напишет в поддержку, обращение появится здесь.' : 'Korxona qo‘llab-quvvatlashga yozganda murojaat shu yerda paydo bo‘ladi.'} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="app-table-stack" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-tertiary)',
                    color: 'var(--color-text-secondary)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 'var(--font-medium)',
                  }}
                >
                  <th style={{ padding: '12px 20px' }}>{isRu ? 'Тема' : 'Mavzu'}</th>
                  <th style={{ padding: '12px 16px' }}>{isRu ? 'Предприятие' : 'Korxona'}</th>
                  <th style={{ padding: '12px 16px' }}>{isRu ? 'Статус' : 'Holat'}</th>
                  <th style={{ padding: '12px 16px' }}>{isRu ? 'Дата' : 'Sana'}</th>
                  <th style={{ padding: '12px 20px' }}><span className="sr-only">{isRu ? 'Действие' : 'Amal'}</span></th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    style={{
                      borderBottom: '1px solid var(--color-border-light)',
                      transition: 'background-color var(--transition-fast)',
                    }}
                    className="ux-row-hover"
                  >
                    <td data-primary style={{ padding: '14px 20px', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}>
                      <div>{ticket.subject}</div>
                      {ticket.messages?.[0]?.message && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-normal)', marginTop: '2px' }}>
                          {ticket.messages[0].message}
                        </div>
                      )}
                    </td>
                    <td data-label={isRu ? 'Компания' : 'Korxona'} style={{ padding: '14px 16px', color: 'var(--color-text-secondary)' }}>
                      {(ticket as { company?: { name?: { uz?: string; ru?: string }; slug?: string } }).company?.name?.[locale] || (ticket as { company?: { name?: { uz?: string } } }).company?.name?.uz || (ticket as { company?: { slug?: string } }).company?.slug || 'Korxona'}
                    </td>
                    <td data-label={isRu ? 'Статус' : 'Holat'} style={{ padding: '14px 16px' }}>
                      {ticket.status === 'RESOLVED' ? (
                        <Badge variant="success">
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <CheckCircle2 size={12} /> {isRu ? 'Решен' : 'Hal qilindi'}
                          </span>
                        </Badge>
                      ) : (
                        <Badge variant="warning">
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <Clock size={12} /> {isRu ? 'Открыт' : 'Ochiq'}
                          </span>
                        </Badge>
                      )}
                    </td>
                    <td data-label={isRu ? 'Дата' : 'Sana'} style={{ padding: '14px 16px', color: 'var(--color-text-secondary)' }}>
                      {formatDate(ticket.createdAt, locale)}
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedTicket(ticket)}
                        aria-label={isRu ? `Ответить: ${ticket.subject}` : `Javob berish: ${ticket.subject}`}
                      >
                        {isRu ? 'Ответить' : 'Javob berish'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reply Modal */}
      <Modal
        isOpen={!!selectedTicket}
        onClose={() => setSelectedTicket(null)}
        title={isRu ? 'Ответ на обращение' : 'Murojaatga javob'}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setSelectedTicket(null)}>{isRu ? 'Отмена' : 'Bekor qilish'}</Button>
            <Button variant="primary" type="submit" form="sa-ticket-reply" loading={replyLoading} loadingText={isRu ? 'Отправка…' : 'Yuborilmoqda…'}>
              {isRu ? 'Отправить ответ' : 'Javobni yuborish'}
            </Button>
          </>
        }
        onSubmitShortcut={() => (document.getElementById('sa-ticket-reply') as HTMLFormElement | null)?.requestSubmit()}
      >
        {selectedTicket && (
          <form id="sa-ticket-reply" onSubmit={handleReply} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>
                {isRu ? 'Тема обращения:' : 'Murojaat mavzusi:'}
              </div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}>
                {selectedTicket.subject}
              </div>
              {selectedTicket.messages?.[0]?.message && (
                <blockquote style={{ margin: 'var(--space-2) 0 0', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-tertiary)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap' }}>
                  {selectedTicket.messages[0].message}
                </blockquote>
              )}
            </div>

            <div>
              <label htmlFor="sa-ticket-reply-text" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                {isRu ? 'Текст ответа' : 'Javob matni'} *
              </label>
              <textarea
                id="sa-ticket-reply-text"
                autoFocus
                required
                rows={4}
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                placeholder={isRu ? 'Введите текст ответа...' : 'Javob matnini kiriting...'}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: 'var(--color-bg-input)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text-primary)',
                  fontSize: 'var(--text-sm)',
                  outline: 'none',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
            </div>

          </form>
        )}
      </Modal>
    </div>
  );
}
