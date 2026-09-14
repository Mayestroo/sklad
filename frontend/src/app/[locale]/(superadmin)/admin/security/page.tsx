'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { HardDrive, ShieldCheck, Database } from 'lucide-react';
import { BackupMetadata } from '@shared/types';
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

  const [backups, setBackups] = useState<BackupMetadata[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [backupTriggering, setBackupTriggering] = useState(false);

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [b, l] = await Promise.all([
        apiFetch<BackupMetadata[]>('/super-admin/backups/history', { token, locale }),
        apiFetch<AuditLogEntry[]>('/super-admin/audit-logs', { token, locale }),
      ]);
      setBackups(b);
      setLogs(l);
    } catch (err: any) {
      toast.error(err.message || (isRu ? 'Ошибка загрузки данных' : 'Xatolik yuz berdi'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const handleTriggerBackup = async () => {
    if (!token) return;
    setBackupTriggering(true);
    try {
      await apiFetch('/super-admin/backups/trigger', {
        token,
        locale,
        method: 'POST',
      });
      toast.success(
        isRu ? 'Резервная копия успешно создана' : 'Baza zaxira nusxasi (Backup) yaratildi',
      );
      fetchData();
    } catch (err: any) {
      toast.error(err.message || (isRu ? 'Ошибка создания бэкапа' : 'Xatolik yuz berdi'));
    } finally {
      setBackupTriggering(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', letterSpacing: '-0.02em', margin: 0 }}>
            {isRu ? 'Безопасность и бэкапы' : 'Xavfsizlik va zaxira nusxalar'}
          </h1>
        </div>

        <Button onClick={handleTriggerBackup} disabled={backupTriggering} variant="primary">
          <Database size={16} />
          <span>{backupTriggering ? (isRu ? 'Создание...' : 'Yaratilmoqda...') : isRu ? 'Создать бэкап' : 'Zaxira nusxa olish'}</span>
        </Button>
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
            <span>{isRu ? 'История резервных копий (SQL Dumps)' : 'Mavjud Zaxira Fayllari (SQL Dumps)'}</span>
          </div>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{backups.length} ta nusxa</span>
        </div>

        {backups.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            {isRu ? 'Резервные копии еще не создавались' : 'Hozircha hech qanday zaxira nusxa yaratilmagan'}
          </div>
        ) : (
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
                <th style={{ padding: '12px 20px' }}>{isRu ? 'Файл' : 'Fayl nomi'}</th>
                <th style={{ padding: '12px 16px' }}>{isRu ? 'Размер' : 'Hajmi'}</th>
                <th style={{ padding: '12px 16px' }}>{isRu ? 'Статус' : 'Holati'}</th>
                <th style={{ padding: '12px 20px' }}>{isRu ? 'Дата' : 'Sana'}</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b, idx) => (
                <tr
                  key={idx}
                  style={{
                    borderBottom: '1px solid var(--color-border-light)',
                    transition: 'background-color var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <td style={{ padding: '14px 20px', fontFamily: 'var(--font-mono)', color: 'var(--color-primary-600)', fontSize: 'var(--text-xs)' }}>
                    {b.filename}
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--color-text-secondary)' }}>{(b.sizeBytes / 1024).toFixed(1)} KB</td>
                  <td style={{ padding: '14px 16px' }}>
                    <Badge variant="success">{b.status}</Badge>
                  </td>
                  <td style={{ padding: '14px 20px', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>{formatDate(b.createdAt, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
