'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { LifeBuoy, MessageSquare, Send, CheckCircle2, Clock } from 'lucide-react';
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
      toast.error(err.message || 'Xatolik yuz berdi');
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
      toast.error(err.message || 'Xatolik yuz berdi');
    } finally {
      setReplyLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.02em', margin: 0 }}>
          {isRu ? 'Обращения клиентов (Техподдержка)' : 'Mijozlar Murojaatlari (Texnik yordam)'}
        </h1>
        <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', margin: 0 }}>
          {isRu ? 'Список запросов и тикетов от пользователей предприятий' : 'Korxona xodimlari tomonidan yuborilgan savol va murojaatlar'}
        </p>
      </div>

      <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
            Yuklanmoqda...
          </div>
        ) : tickets.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
            {isRu ? 'Нет активных тикетов' : 'Hozircha hech qanday murojaat yo‘q'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', backgroundColor: '#0b1120', color: '#64748b', fontSize: '12px', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 20px' }}>{isRu ? 'Тема' : 'Mavzu'}</th>
                  <th style={{ padding: '12px 16px' }}>{isRu ? 'Предприятие' : 'Korxona'}</th>
                  <th style={{ padding: '12px 16px' }}>{isRu ? 'Статус' : 'Holat'}</th>
                  <th style={{ padding: '12px 16px' }}>{isRu ? 'Дата' : 'Sana'}</th>
                  <th style={{ padding: '12px 20px', textAlign: 'right' }}>{isRu ? 'Действие' : 'Amal'}</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr key={ticket.id} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '16px 20px', fontWeight: 600, color: '#f8fafc' }}>
                      <div>{ticket.subject}</div>
                      {ticket.messages?.[0]?.message && (
                        <div style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 400, marginTop: '2px' }}>
                          {ticket.messages[0].message}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '16px', color: '#cbd5e1' }}>
                      {(ticket as any).company?.name?.uz || (ticket as any).company?.slug || 'Korxona'}
                    </td>
                    <td style={{ padding: '16px' }}>
                      {ticket.status === 'RESOLVED' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#4ade80', fontSize: '12px', fontWeight: 600 }}>
                          <CheckCircle2 size={13} /> {isRu ? 'Решен' : 'Hal qilindi'}
                        </span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#fbbf24', fontSize: '12px', fontWeight: 600 }}>
                          <Clock size={13} /> {isRu ? 'Открыт' : 'Ochiq'}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '16px', color: '#64748b' }}>
                      {formatDate(ticket.createdAt, locale)}
                    </td>
                    <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                      <button
                        onClick={() => setSelectedTicket(ticket)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          backgroundColor: '#1e293b',
                          border: '1px solid #334155',
                          color: '#818cf8',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {isRu ? 'Ответить' : 'Javob berish'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reply Modal */}
      {selectedTicket && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '16px',
              maxWidth: '520px',
              width: '100%',
              padding: '24px',
            }}
          >
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
              {isRu ? 'Ответ на обращение' : 'Murojaatga javob berish'}
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#94a3b8' }}>
              {selectedTicket.subject}
            </p>

            <form onSubmit={handleReply}>
              <textarea
                required
                rows={4}
                value={replyMessage}
                onChange={(e) => setReplyMessage(e.target.value)}
                placeholder={isRu ? 'Введите текст ответа...' : 'Javob matnini kiriting...'}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: '#1e293b',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  color: '#f8fafc',
                  fontSize: '13px',
                  outline: 'none',
                  boxSizing: 'border-box',
                  resize: 'vertical',
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedTicket(null)}
                  style={{ padding: '8px 16px', borderRadius: '8px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#94a3b8', fontSize: '13px', cursor: 'pointer' }}
                >
                  {isRu ? 'Отмена' : 'Bekor qilish'}
                </button>
                <button
                  type="submit"
                  disabled={replyLoading}
                  style={{ padding: '8px 20px', borderRadius: '8px', backgroundColor: '#6366f1', color: '#ffffff', fontWeight: 600, fontSize: '13px', border: 'none', cursor: 'pointer' }}
                >
                  {replyLoading ? 'Yuborilmoqda...' : isRu ? 'Отправить ответ' : 'Yuborish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
