'use client';

import { useState } from 'react';
import { useApiQuery, useInvalidateApi } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatDate, errorMessage } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { Plus, Bell, Calendar } from 'lucide-react';
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

  const invalidateApi = useInvalidateApi();
  const announcementsQuery = useApiQuery<SystemAnnouncement[]>('/super-admin/announcements', { scope: 'platform' });
  const announcements = announcementsQuery.data ?? [];

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [titleUz, setTitleUz] = useState('');
  const [titleRu, setTitleRu] = useState('');
  const [msgUz, setMsgUz] = useState('');
  const [msgRu, setMsgRu] = useState('');
  const [submitLoading, setSubmitLoading] = useState(false);


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

      toast.success(isRu ? 'Объявление опубликовано' : 'E’lon chop etildi');
      setModalOpen(false);
      setTitleUz('');
      setTitleRu('');
      setMsgUz('');
      setMsgRu('');
      void invalidateApi('/super-admin/announcements');
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Не удалось опубликовать' : 'E’lonni chop etib bo‘lmadi'));
    } finally {
      setSubmitLoading(false);
    }
  };

  const fieldStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 12px',
    backgroundColor: 'var(--color-bg-input)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-text-primary)',
    fontSize: 'var(--text-sm)',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
    resize: 'vertical',
  };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', color: 'var(--color-text-secondary)', marginBottom: 4 };
  const newButton = (
    <Button onClick={() => setModalOpen(true)} variant="primary">
      <Plus size={16} aria-hidden /> {isRu ? 'Новое объявление' : 'Yangi e’lon'}
    </Button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ marginBottom: 'calc(-1 * var(--space-5))' }}>
        <PageHeader
          showBreadcrumbs={false}
          title={isRu ? 'Объявления' : 'E’lonlar'}
          subtitle={isRu ? 'Сообщения, которые видят пользователи всех компаний (обновления, плановые работы).' : 'Barcha korxonalar foydalanuvchilari ko‘radigan xabarlar (yangilanishlar, rejali ishlar).'}
          actions={newButton}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        {announcementsQuery.isError ? (
          <Card>
            <LoadError error={announcementsQuery.error} onRetry={() => void announcementsQuery.refetch()} retrying={announcementsQuery.isFetching} />
          </Card>
        ) : announcementsQuery.isPending ? (
          <Card><SkeletonRows rows={3} columns={2} /></Card>
        ) : announcements.length === 0 ? (
          <Card>
            <EmptyState icon={Bell} title={isRu ? 'Объявлений пока нет' : 'Hozircha e’lonlar yo‘q'} description={isRu ? 'Напишите объявление — оно появится у пользователей всех компаний.' : 'E’lon yozing — u barcha korxonalar foydalanuvchilarida paydo bo‘ladi.'} action={newButton} />
          </Card>
        ) : (
          announcements.map((item) => {
            const title = typeof item.title === 'string' ? item.title : item.title?.[locale] || item.title?.uz;
            const message = typeof item.message === 'string' ? item.message : item.message?.[locale] || item.message?.uz;
            return (
              <Card key={item.id} style={{ padding: 'var(--space-5)' }}>
                <article style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
                  <div aria-hidden style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Bell size={20} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                      <h2 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)' }}>{title}</h2>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                        <Calendar size={13} aria-hidden /> {formatDate(item.createdAt, locale)}
                      </span>
                    </div>
                    <p style={{ margin: '8px 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{message}</p>
                  </div>
                </article>
              </Card>
            );
          })
        )}
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={isRu ? 'Новое объявление' : 'Yangi e’lon'}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalOpen(false)}>{isRu ? 'Отмена' : 'Bekor qilish'}</Button>
            <Button variant="primary" type="submit" form="sa-announcement" loading={submitLoading} loadingText={isRu ? 'Публикация…' : 'E’lon qilinmoqda…'}>
              {isRu ? 'Опубликовать для всех' : 'Hammaga e’lon qilish'}
            </Button>
          </>
        }
      >
        <form id="sa-announcement" onSubmit={handleCreateAnnouncement} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            {isRu ? 'Если русский текст пуст, покажем узбекский.' : 'Ruscha matn bo‘sh bo‘lsa, o‘zbekchasi ko‘rsatiladi.'}
          </p>
          <Input autoFocus required label={isRu ? 'Заголовок (по-узбекски) *' : 'Sarlavha (o‘zbekcha) *'} value={titleUz} onChange={(e) => setTitleUz(e.target.value)} />
          <Input label={isRu ? 'Заголовок (по-русски)' : 'Sarlavha (ruscha)'} value={titleRu} onChange={(e) => setTitleRu(e.target.value)} />
          <div>
            <label htmlFor="sa-ann-msg-uz" style={labelStyle}>{isRu ? 'Текст (по-узбекски) *' : 'Matn (o‘zbekcha) *'}</label>
            <textarea id="sa-ann-msg-uz" required rows={3} value={msgUz} onChange={(e) => setMsgUz(e.target.value)} style={fieldStyle} />
          </div>
          <div>
            <label htmlFor="sa-ann-msg-ru" style={labelStyle}>{isRu ? 'Текст (по-русски)' : 'Matn (ruscha)'}</label>
            <textarea id="sa-ann-msg-ru" rows={3} value={msgRu} onChange={(e) => setMsgRu(e.target.value)} style={fieldStyle} />
          </div>
        </form>
      </Modal>
    </div>
  );
}
