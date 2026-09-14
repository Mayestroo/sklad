'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { CheckCircle2, Clock } from 'lucide-react';
import { SupportTicket } from '@shared/types';
import { toast } from '@/context/ToastContext';

export default function SuperAdminTicketsPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token } = useAuth();

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);

  // Reply modal
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyMessage, setReplyMessage] = useState('');
  const [replyLoading, setReplyLoading] = useState(false);

  const fetchTickets = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch<SupportTicket[]>('/super-admin/tickets', { token, locale });
      setTickets(res);
    } catch (err: any) {
      toast.error(err.message || (isRu ? 'Ошибка загрузки тикетов' : 'Xatolik yuz berdi'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [token]);

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

      toast.success(isRu ? 'Ответ успешно отправлен' : 'Javob muvaffaqiyatli yuborildi');
      setSelectedTicket(null);
      setReplyMessage('');
      fetchTickets();
    } catch (err: any) {
      toast.error(err.message || (isRu ? 'Ошибка отправки ответа' : 'Xatolik yuz berdi'));
    } finally {
      setReplyLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div>
        <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', letterSpacing: '-0.02em', margin: 0 }}>
          {isRu ? 'Техподдержка' : 'Mijozlar murojaatlari'}
        </h1>
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
        {loading ? (
          <div style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            Yuklanmoqda...
          </div>
        ) : tickets.length === 0 ? (
          <div style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            {isRu ? 'Нет активных тикетов' : 'Hozircha hech qanday murojaat yo‘q'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-tertiary)',
                    color: 'var(--color-text-secondary)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 'var(--font-semibold)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  <th style={{ padding: '12px 20px' }}>{isRu ? 'Тема' : 'Mavzu'}</th>
                  <th style={{ padding: '12px 16px' }}>{isRu ? 'Предприятие' : 'Korxona'}</th>
                  <th style={{ padding: '12px 16px' }}>{isRu ? 'Статус' : 'Holat'}</th>
                  <th style={{ padding: '12px 16px' }}>{isRu ? 'Дата' : 'Sana'}</th>
                  <th style={{ padding: '12px 20px', textAlign: 'right' }}>{isRu ? 'Действие' : 'Amal'}</th>
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
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '14px 20px', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}>
                      <div>{ticket.subject}</div>
                      {ticket.messages?.[0]?.message && (
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 'var(--font-normal)', marginTop: '2px' }}>
                          {ticket.messages[0].message}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--color-text-secondary)' }}>
                      {(ticket as any).company?.name?.uz || (ticket as any).company?.slug || 'Korxona'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
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
                    <td style={{ padding: '14px 16px', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                      {formatDate(ticket.createdAt, locale)}
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setSelectedTicket(ticket)}
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
        title={isRu ? 'Ответ на обращение' : 'Murojaatga javob berish'}
        size="md"
      >
        {selectedTicket && (
          <form onSubmit={handleReply} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginBottom: '4px' }}>
                {isRu ? 'Тема обращения:' : 'Murojaat mavzusi:'}
              </div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}>
                {selectedTicket.subject}
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                {isRu ? 'Текст ответа' : 'Javob matni'} *
              </label>
              <textarea
                required
                rows={4}
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                placeholder={isRu ? 'Введите текст ответа...' : 'Javob matnini kiriting...'}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  backgroundColor: 'var(--color-bg-tertiary)',
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
              <Button variant="secondary" onClick={() => setSelectedTicket(null)}>
                {isRu ? 'Отмена' : 'Bekor qilish'}
              </Button>
              <Button variant="primary" type="submit" disabled={replyLoading}>
                {replyLoading ? (isRu ? 'Отправка...' : 'Yuborilmoqda...') : isRu ? 'Отправить ответ' : 'Yuborish'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
