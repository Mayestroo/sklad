'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Database, Activity } from 'lucide-react';
import { BACKUPS_MANAGED_BY_NEON_MESSAGE } from '@shared/types';

/** GET /audit-logs */
interface AuditLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress: string | null;
  createdAt: string;
  user?: { firstName: string; lastName: string } | null;
}

export default function SecurityPage() {
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();

  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSecurityData = async () => {
    if (!token || !company) return;
    setLoading(true);
    try {
      const logs = await apiFetch<AuditLogRow[]>('/audit-logs', { token, tenantId: company.id, locale });
      setAuditLogs(logs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurityData();
  }, [token, company]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            {isRu ? 'Безопасность и соответствие' : 'Xavfsizlik va muvofiqlik'}
          </h1>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
          {tCommon('loading')}
        </div>
      ) : (
        <>
          {/* Database backups are Neon's job, not the app's */}
          <Card>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
              <Database size={18} style={{ color: 'var(--color-primary-600)' }} />
              <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)' }}>
                {isRu ? 'Резервные копии' : 'Zaxira nusxalar'}
              </h3>
            </div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              {BACKUPS_MANAGED_BY_NEON_MESSAGE[locale]}
            </p>
          </Card>

          {/* Audit Logs Trail Table */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)' }}>
                Tizim Harakatlari Auditi (System Audit Trail Logs)
              </h3>
              <Activity size={18} style={{ color: 'var(--color-primary-600)' }} />
            </div>

            {auditLogs.length === 0 ? (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                Auditorlik jurnali bo&apos;sh
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                      <th style={{ padding: '12px' }}>SANA VA VAQT</th>
                      <th style={{ padding: '12px' }}>FOYDALANUVCHI</th>
                      <th style={{ padding: '12px' }}>HARAKAT (ACTION)</th>
                      <th style={{ padding: '12px' }}>OBYEKT (ENTITY)</th>
                      <th style={{ padding: '12px' }}>IP MANZIL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>{formatDate(log.createdAt, locale)}</td>
                        <td style={{ padding: '12px', fontWeight: 'bold' }}>{log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System'}</td>
                        <td style={{ padding: '12px' }}><Badge variant="neutral">{log.action}</Badge></td>
                        <td style={{ padding: '12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{log.entityType} ({log.entityId.slice(0, 8)}...)</td>
                        <td style={{ padding: '12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{log.ipAddress || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
