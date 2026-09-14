'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Megaphone, Plus, Bell, Calendar } from 'lucide-react';
import { toast } from '@/context/ToastContext';

interface SystemAnnouncement {
  id: string;
  title: { uz: string; ru: string };
  message: { uz: string; ru: string };
  isActive: boolean;
  createdAt: string;
}

export default function SuperAdminAnnouncementsPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token } = useAuth();

  const [announcements, setAnnouncements] = useState<SystemAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [titleUz, setTitleUz] = useState('');
  const [titleRu, setTitleRu] = useState('');
  const [msgUz, setMsgUz] = useState('');
  const [msgRu, setMsgRu] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);

  const fetchAnnouncements = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch<SystemAnnouncement[]>('/super-admin/announcements', { token, locale });
      setAnnouncements(res);
    } catch (err: any) {
      toast.error(err.message || 'Xatolik yuz berdi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, [token]);

  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSubmitLoading(true);
    try {
      await apiFetch('/super-admin/announcements', {
        token,
        locale,
        method: 'POST',
        body: JSON.stringify({
          title: { uz: titleUz, ru: titleRu || titleUz },
          message: { uz: msgUz, ru: msgRu || msgUz },
        }),
      });

      toast.success(isRu ? 'Оповещение успешно опубликовано' : 'Bildirishnoma muvaffaqiyatli eʼlon qilindi');
      setModalOpen(false);
      setTitleUz('');
      setTitleRu('');
      setMsgUz('');
      setMsgRu('');
      fetchAnnouncements();
    } catch (err: any) {
      toast.error(err.message || 'Xatolik yuz berdi');
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.02em', margin: 0 }}>
            {isRu ? 'Оповещения системы (Announcements)' : 'Tizim Bildirishnomalari (Announcements)'}
          </h1>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', margin: 0 }}>
            {isRu
              ? 'Глобальные уведомления о технических работах и обновлениях для всех предприятий'
              : 'Barcha korxonalar foydalanuvchilariga rejaviy profilaktika va yangilanishlar haqida xabar yuborish'}
          </p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '8px',
            backgroundColor: '#6366f1',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '13px',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Plus size={16} />
          <span>{isRu ? 'Создать оповещение' : 'Yangi eʼlon berish'}</span>
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>
            Yuklanmoqda...
          </div>
        ) : announcements.length === 0 ? (
          <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', padding: '48px', textAlign: 'center', color: '#64748b' }}>
            {isRu ? 'Нет активных оповещений' : 'Hozircha faol bildirishnomalar yo‘q'}
          </div>
        ) : (
          announcements.map((item) => {
            const title = typeof item.title === 'string' ? item.title : item.title?.[locale] || item.title?.uz;
            const message = typeof item.message === 'string' ? item.message : item.message?.[locale] || item.message?.uz;

            return (
              <div
                key={item.id}
                style={{
                  backgroundColor: '#0f172a',
                  border: '1px solid #1e293b',
                  borderRadius: '12px',
                  padding: '20px 24px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '16px',
                }}
              >
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(99, 102, 241, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8', flexShrink: 0 }}>
                  <Bell size={20} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
                      {title}
                    </h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#64748b' }}>
                      <Calendar size={13} />
                      <span>{formatDate(item.createdAt, locale)}</span>
                    </div>
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: '13px', color: '#cbd5e1', lineHeight: '1.6' }}>
                    {message}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '20px' }}>
          <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '16px', maxWidth: '520px', width: '100%', padding: '24px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
              {isRu ? 'Новое оповещение' : 'Yangi tizim bildirishnomasi'}
            </h3>

            <form onSubmit={handleCreateAnnouncement} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                  {isRu ? 'Заголовок (UZ)' : 'Sarlavha (UZ)'} *
                </label>
                <input
                  type="text"
                  required
                  value={titleUz}
                  onChange={(e) => setTitleUz(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                  {isRu ? 'Заголовок (RU)' : 'Sarlavha (RU)'}
                </label>
                <input
                  type="text"
                  value={titleRu}
                  onChange={(e) => setTitleRu(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                  {isRu ? 'Текст сообщения (UZ)' : 'Xabar matni (UZ)'} *
                </label>
                <textarea
                  required
                  rows={3}
                  value={msgUz}
                  onChange={(e) => setMsgUz(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginBottom: '4px' }}>
                  {isRu ? 'Текст сообщения (RU)' : 'Xabar matni (RU)'}
                </label>
                <textarea
                  rows={3}
                  value={msgRu}
                  onChange={(e) => setMsgRu(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', color: '#f8fafc', fontSize: '13px', boxSizing: 'border-box' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  style={{ padding: '8px 16px', borderRadius: '8px', backgroundColor: '#1e293b', border: '1px solid #334155', color: '#94a3b8', fontSize: '13px', cursor: 'pointer' }}
                >
                  {isRu ? 'Отмена' : 'Bekor qilish'}
                </button>
                <button
                  type="submit"
                  disabled={submitLoading}
                  style={{ padding: '8px 20px', borderRadius: '8px', backgroundColor: '#6366f1', color: '#ffffff', fontWeight: 600, fontSize: '13px', border: 'none', cursor: 'pointer' }}
                >
                  {submitLoading ? 'Yuborilmoqda...' : isRu ? 'Опубликовать' : 'Eʼlon qilish'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
