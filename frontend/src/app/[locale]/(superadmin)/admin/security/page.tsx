'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { HardDrive, ShieldCheck, Download, RefreshCw, Database } from 'lucide-react';
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
      toast.error(err.message || 'Xatolik yuz berdi');
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
      toast.error(err.message || 'Xatolik yuz berdi');
    } finally {
      setBackupTriggering(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc', letterSpacing: '-0.02em', margin: 0 }}>
            {isRu ? 'Безопасность и Резервное копирование' : 'Xavfsizlik va Zaxira Nusxalar (Backups)'}
          </h1>
          <p style={{ fontSize: '13px', color: '#64748b', marginTop: '4px', margin: 0 }}>
            {isRu
              ? 'Глобальный аудит действий, соответствие закону ZRU-547 и создание бэкапов БД'
              : 'Global audit jurnali, ZRU-547 qonuniga muvofiqlik va PostgreSQL zaxira nusxalari'}
          </p>
        </div>

        <button
          onClick={handleTriggerBackup}
          disabled={backupTriggering}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            borderRadius: '8px',
            backgroundColor: '#10b981',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '13px',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 2px 10px rgba(16, 185, 129, 0.3)',
          }}
        >
          <Database size={16} />
          <span>{backupTriggering ? 'Yaratilmoqda...' : isRu ? 'Создать бэкап' : 'Zaxira nusxa olish'}</span>
        </button>
      </div>

      {/* Backups Card */}
      <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HardDrive size={18} style={{ color: '#10b981' }} />
            <span>{isRu ? 'История резервных копий (SQL Dumps)' : 'Mavjud Zaxira Fayllari (SQL Dumps)'}</span>
          </div>
          <span style={{ fontSize: '12px', color: '#64748b' }}>{backups.length} ta nusxa</span>
        </div>

        {backups.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
            {isRu ? 'Резервные копии еще не создавались' : 'Hozircha hech qanday zaxira nusxa yaratilmagan'}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1e293b', backgroundColor: '#0b1120', color: '#64748b', fontSize: '12px' }}>
                <th style={{ padding: '12px 20px' }}>{isRu ? 'Файл' : 'Fayl nomi'}</th>
                <th style={{ padding: '12px 16px' }}>{isRu ? 'Размер' : 'Hajmi'}</th>
                <th style={{ padding: '12px 16px' }}>{isRu ? 'Статус' : 'Holati'}</th>
                <th style={{ padding: '12px 20px' }}>{isRu ? 'Дата' : 'Sana'}</th>
              </tr>
            </thead>
            <tbody>
              {backups.map((b, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '14px 20px', fontFamily: 'monospace', color: '#93c5fd' }}>{b.filename}</td>
                  <td style={{ padding: '14px 16px', color: '#cbd5e1' }}>{(b.sizeBytes / 1024).toFixed(1)} KB</td>
                  <td style={{ padding: '14px 16px', color: '#4ade80', fontWeight: 600 }}>{b.status}</td>
                  <td style={{ padding: '14px 20px', color: '#64748b' }}>{formatDate(b.createdAt, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Global Audit Logs Card */}
      <div style={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #1e293b', fontSize: '14px', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <ShieldCheck size={18} style={{ color: '#818cf8' }} />
          <span>{isRu ? 'Глобальный журнал аудита (Последние 50 записей)' : 'Global Audit Jurnali (So‘nggi 50 ta amal)'}</span>
        </div>

        {logs.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
            {isRu ? 'Записи аудита отсутствуют' : 'Audit yozuvlari yo‘q'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', backgroundColor: '#0b1120', color: '#64748b', fontSize: '12px' }}>
                  <th style={{ padding: '12px 20px' }}>{isRu ? 'Пользователь' : 'Foydalanuvchi'}</th>
                  <th style={{ padding: '12px 16px' }}>{isRu ? 'Действие' : 'Amal'}</th>
                  <th style={{ padding: '12px 16px' }}>{isRu ? 'Сущность' : 'Obyekt'}</th>
                  <th style={{ padding: '12px 16px' }}>IP</th>
                  <th style={{ padding: '12px 20px' }}>{isRu ? 'Время' : 'Vaqt'}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ fontWeight: 600, color: '#f8fafc' }}>
                        {log.user ? `${log.user.firstName} ${log.user.lastName}` : 'Tizim'}
                      </div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>{log.user?.email}</div>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', fontWeight: 600, fontSize: '11px' }}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', color: '#cbd5e1' }}>{log.entityType}</td>
                    <td style={{ padding: '14px 16px', color: '#94a3b8', fontFamily: 'monospace' }}>{log.ipAddress || '-'}</td>
                    <td style={{ padding: '14px 20px', color: '#64748b' }}>{formatDate(log.createdAt, locale)}</td>
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
