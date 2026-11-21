'use client';

import { useMemo, useState } from 'react';
import { useLocale } from 'next-intl';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { formatDateTime } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { SearchField, matchesSearch } from '@/components/ui/SearchField';
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS, labelOf, variantOf } from '@/lib/platform-labels';
import { HardDrive, History } from 'lucide-react';
import { BACKUPS_MANAGED_BY_NEON_MESSAGE, TenantCompanySummary } from '@shared/types';

interface AuditLogEntry {
  id: string;
  tenantId: string;
  userId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  ipAddress: string | null;
  createdAt: string;
  user?: { firstName: string; lastName: string; email: string };
}

export default function SuperAdminSecurityPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const logsQuery = useApiQuery<AuditLogEntry[]>('/super-admin/audit-logs', { scope: 'platform' });
  const logs = useMemo(() => logsQuery.data ?? [], [logsQuery.data]);
  // Company names for the "Company" column (the same list the Companies page loads).
  const tenantsQuery = useApiQuery<TenantCompanySummary[]>('/super-admin/tenants', { scope: 'platform' });
  const companyName = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tenantsQuery.data ?? []) map.set(t.id, typeof t.name === 'string' ? t.name : t.name?.[locale] || t.name?.uz || t.slug);
    return (id: string) => map.get(id) ?? '—';
  }, [tenantsQuery.data, locale]);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('ALL');

  const userName = (log: AuditLogEntry) => (log.user ? `${log.user.firstName} ${log.user.lastName}`.trim() : isRu ? 'Система' : 'Tizim');
  const rows = logs.filter(
    (log) =>
      (action === 'ALL' || log.action === action) &&
      matchesSearch(search, userName(log), log.user?.email, companyName(log.tenantId), labelOf(AUDIT_ENTITY_LABELS, log.entityType, locale), log.ipAddress),
  );
  const th: React.CSSProperties = { padding: '12px 16px', fontWeight: 'var(--font-medium)' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ marginBottom: 'calc(-1 * var(--space-5))' }}>
        <PageHeader
          showBreadcrumbs={false}
          title={isRu ? 'Журнал и резервные копии' : 'Jurnal va zaxira nusxalar'}
          subtitle={isRu ? 'Последние действия во всех компаниях и где хранятся резервные копии.' : 'Barcha korxonalardagi so‘nggi harakatlar va zaxira nusxalar qayerda saqlanadi.'}
        />
      </div>

      <Card>
        <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <HardDrive size={18} aria-hidden style={{ color: 'var(--color-text-secondary)' }} /> {isRu ? 'Резервные копии' : 'Zaxira nusxalar'}
        </h2>
        <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>{BACKUPS_MANAGED_BY_NEON_MESSAGE[locale]}</p>
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--color-border-light)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <h2 style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-semibold)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <History size={18} aria-hidden style={{ color: 'var(--color-text-secondary)' }} />
            {isRu ? 'Последние 50 действий' : 'So‘nggi 50 ta harakat'}
          </h2>
          {logs.length > 0 && (
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <SearchField value={search} onChange={setSearch} placeholder={isRu ? 'Пользователь, компания, объект или IP' : 'Foydalanuvchi, korxona, obyekt yoki IP'} style={{ maxWidth: 380 }} />
              <Select
                label={isRu ? 'Действие' : 'Harakat'}
                value={action}
                onChange={setAction}
                style={{ width: 220 }}
                options={[{ value: 'ALL', label: isRu ? 'Все действия' : 'Barcha harakatlar' }, ...Object.keys(AUDIT_ACTION_LABELS).map((a) => ({ value: a, label: labelOf(AUDIT_ACTION_LABELS, a, locale) }))]}
              />
            </div>
          )}
        </div>

        {logsQuery.isError ? (
          <LoadError error={logsQuery.error} onRetry={() => void logsQuery.refetch()} retrying={logsQuery.isFetching} />
        ) : logsQuery.isPending ? (
          <SkeletonRows rows={6} columns={5} />
        ) : logs.length === 0 ? (
          <EmptyState compact icon={History} title={isRu ? 'Действий пока нет' : 'Hozircha harakatlar yo‘q'} />
        ) : rows.length === 0 ? (
          <EmptyState compact title={isRu ? 'Ничего не найдено' : 'Hech narsa topilmadi'} description={isRu ? 'Измените поиск или действие.' : 'Qidiruv yoki harakatni o‘zgartiring.'} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="app-table-stack" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                  <th scope="col" style={th}>{isRu ? 'Когда' : 'Qachon'}</th>
                  <th scope="col" style={th}>{isRu ? 'Пользователь' : 'Foydalanuvchi'}</th>
                  <th scope="col" style={th}>{isRu ? 'Компания' : 'Korxona'}</th>
                  <th scope="col" style={th}>{isRu ? 'Действие' : 'Harakat'}</th>
                  <th scope="col" style={th}>{isRu ? 'Объект' : 'Obyekt'}</th>
                  <th scope="col" style={th}>IP</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((log) => (
                  <tr key={log.id} className="ux-row-hover" style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td data-primary style={{ padding: '12px 16px', whiteSpace: 'nowrap', color: 'var(--color-text-secondary)' }} className="tabular-nums">{formatDateTime(log.createdAt, locale)}</td>
                    <td data-label={isRu ? 'Пользователь' : 'Foydalanuvchi'} style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 'var(--font-medium)' }}>{userName(log)}</div>
                      {log.user?.email && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{log.user.email}</div>}
                    </td>
                    <td data-label={isRu ? 'Компания' : 'Korxona'} style={{ padding: '12px 16px' }}>{companyName(log.tenantId)}</td>
                    <td data-label={isRu ? 'Действие' : 'Harakat'} style={{ padding: '12px 16px' }}>
                      <Badge variant={variantOf(AUDIT_ACTION_LABELS, log.action)}>{labelOf(AUDIT_ACTION_LABELS, log.action, locale)}</Badge>
                    </td>
                    <td data-label={isRu ? 'Объект' : 'Obyekt'} style={{ padding: '12px 16px' }} title={`${log.entityType} ${log.entityId}`}>{labelOf(AUDIT_ENTITY_LABELS, log.entityType, locale)}</td>
                    <td data-label="IP" style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{log.ipAddress || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
