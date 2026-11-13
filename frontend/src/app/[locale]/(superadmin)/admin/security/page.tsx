'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatDate, errorMessage } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { HardDrive, ShieldCheck } from 'lucide-react';
import { BACKUPS_MANAGED_BY_NEON_MESSAGE } from '@shared/types';
import { toast } from '@/context/ToastContext';

interface AuditLogEntry {
  id: string;
  tenantId: string;
  userId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  ipAddress: string | null;
  createdAt: string;
  user?: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

export default function SuperAdminSecurityPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token } = useAuth();

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const l = await apiFetch<AuditLogEntry[]>('/super-admin/audit-logs', { token, locale });
      setLogs(l);
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Ошибка загрузки данных' : 'Xatolik yuz berdi'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', letterSpacing: '-0.02em', margin: 0 }}>
            {isRu ? 'Безопасность и бэкапы' : 'Xavfsizlik va zaxira nusxalar'}
          </h1>
        </div>
      </div>

      {/* Backups Card */}
      <div
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <HardDrive size={18} style={{ color: 'var(--color-success-600)' }} />
            <span>{isRu ? 'Резервные копии' : 'Zaxira nusxalar'}</span>
          </div>
        </div>

        <div style={{ padding: 'var(--space-6) 20px', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
          {BACKUPS_MANAGED_BY_NEON_MESSAGE[locale]}
        </div>
      </div>

      {/* Global Audit Logs Card */}
      <div
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border-light)', fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <ShieldCheck size={18} style={{ color: 'var(--color-primary-600)' }} />
          <span>{isRu ? 'Глобальный журнал аудита (Последние 50 записей)' : 'Global Audit Jurnali (So‘nggi 50 ta amal)'}</span>
        </div>

        {logs.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            {isRu ? 'Записи аудита отсутствуют' : 'Audit yozuvlari yo‘q'}
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
                  <th style={{ padding: '12px 20px' }}>{isRu ? 'Пользователь' : 'Foydalanuvchi'}</th>
                  <th style={{ padding: '12px 16px' }}>{isRu ? 'Действие' : 'Amal'}</th>
                  <th style={{ padding: '12px 16px' }}>{isRu ? 'Сущность' : 'Obyekt'}</th>
                  <th style={{ padding: '12px 16px' }}>IP</th>
                  <th style={{ padding: '12px 20px' }}>{isRu ? 'Время' : 'Vaqt'}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    style={{
                      borderBottom: '1px solid var(--color-border-light)',
                      transition: 'background-color var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}>
                        {log.user ? `${log.user.firstName} ${log.user.lastName}` : 'Tizim'}
                      </div>
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{log.user?.email}</div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <Badge variant="info">{log.action}</Badge>
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--color-text-secondary)' }}>{log.entityType}</td>
                    <td style={{ padding: '14px 16px', color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{log.ipAddress || '-'}</td>
                    <td style={{ padding: '14px 20px', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>{formatDate(log.createdAt, locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
