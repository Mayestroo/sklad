'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
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
      toast.error(err.message || (isRu ? 'Ошибка загрузки оповещений' : 'Xatolik yuz berdi'));
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
      toast.error(err.message || (isRu ? 'Ошибка при публикации' : 'Xatolik yuz berdi'));
    } finally {
      setSubmitLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    backgroundColor: 'var(--color-bg-tertiary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-text-primary)',
    fontSize: 'var(--text-sm)',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', letterSpacing: '-0.02em', margin: 0 }}>
            {isRu ? 'Оповещения системы' : 'Tizim bildirishnomalari'}
          </h1>
        </div>

        <Button onClick={() => setModalOpen(true)} variant="primary">
          <Plus size={16} />
          <span>{isRu ? 'Создать оповещение' : 'Yangi eʼlon berish'}</span>
        </Button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {loading ? (
          <div style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            Yuklanmoqda...
          </div>
        ) : announcements.length === 0 ? (
          <Card style={{ padding: 'var(--space-12)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
            {isRu ? 'Нет активных оповещений' : 'Hozircha faol bildirishnomalar yo‘q'}
          </Card>
        ) : (
          announcements.map((item) => {
            const title = typeof item.title === 'string' ? item.title : item.title?.[locale] || item.title?.uz;
            const message = typeof item.message === 'string' ? item.message : item.message?.[locale] || item.message?.uz;

            return (
              <Card key={item.id} style={{ padding: 'var(--space-5)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--color-primary-50)',
                      color: 'var(--color-primary-600)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <Bell size={20} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                      <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
                        {title}
                      </h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                        <Calendar size={13} />
                        <span>{formatDate(item.createdAt, locale)}</span>
                      </div>
                    </div>
                    <p style={{ margin: '8px 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: '1.6' }}>
                      {message}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={isRu ? 'Новое оповещение' : 'Yangi tizim bildirishnomasi'}
        size="md"
      >
        <form onSubmit={handleCreateAnnouncement} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
              {isRu ? 'Заголовок (UZ)' : 'Sarlavha (UZ)'} *
            </label>
            <input
              type="text"
              required
              value={titleUz}
              onChange={(e) => setTitleUz(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
              {isRu ? 'Заголовок (RU)' : 'Sarlavha (RU)'}
            </label>
            <input
              type="text"
              value={titleRu}
              onChange={(e) => setTitleRu(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
              {isRu ? 'Текст сообщения (UZ)' : 'Xabar matni (UZ)'} *
            </label>
            <textarea
              required
              rows={3}
              value={msgUz}
              onChange={(e) => setMsgUz(e.target.value)}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
              {isRu ? 'Текст сообщения (RU)' : 'Xabar matni (RU)'}
            </label>
            <textarea
              rows={3}
              value={msgRu}
              onChange={(e) => setMsgRu(e.target.value)}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              {isRu ? 'Отмена' : 'Bekor qilish'}
            </Button>
            <Button variant="primary" type="submit" disabled={submitLoading}>
              {submitLoading ? (isRu ? 'Публикация...' : 'Yuborilmoqda...') : isRu ? 'Опубликовать' : 'Eʼlon qilish'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
