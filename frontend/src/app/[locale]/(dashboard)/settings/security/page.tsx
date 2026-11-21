'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { formatDate, formatDateTime } from '@/lib/utils';
import { usePersistentState } from '@/lib/usePersistentState';
import { ChipGroup } from '@/components/ui/list/ListKit';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonRows } from '@/components/ui/Skeleton';
import { SearchField, matchesSearch } from '@/components/ui/SearchField';
import { Database, History } from 'lucide-react';
import { BACKUPS_MANAGED_BY_NEON_MESSAGE } from '@shared/types';
import { AUDIT_ACTION_LABELS, AUDIT_ENTITY_LABELS } from '@/lib/platform-labels';

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

// Shared words for audit codes (also used by the platform owner pages).
const ACTIONS = AUDIT_ACTION_LABELS;
const ENTITIES = AUDIT_ENTITY_LABELS;

const PAGE = 50;

export default function SecurityPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const [limit, setLimit] = useState(PAGE);
  const auditQuery = useApiQuery<AuditLogRow[]>(`/audit-logs?limit=${limit}`, { keepPrevious: true });
  const auditLogs = useMemo(() => auditQuery.data ?? [], [auditQuery.data]);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  // Sign-ins are most of the log; by default the list shows what was changed.
  const [changesOnly, setChangesOnly] = usePersistentState('security.changesOnly', true);
  const tsec = useTranslations('rd.security');
  // Group by the local calendar day the time is shown in (not the UTC date).
  const dayKey = (iso: string) => new Date(iso).toDateString();

  const actionLabel = (a: string) => (ACTIONS[a] ? (isRu ? ACTIONS[a].ru : ACTIONS[a].uz) : a);
  const entityLabel = (e: string) => (ENTITIES[e] ? (isRu ? ENTITIES[e].ru : ENTITIES[e].uz) : e);
  const userName = (log: AuditLogRow) => (log.user ? `${log.user.firstName} ${log.user.lastName}`.trim() : isRu ? 'Система' : 'Tizim');

  const rows = useMemo(
    () =>
      auditLogs.filter(
        (log) => (!action || log.action === action) && (!changesOnly || action || (log.action !== 'LOGIN' && log.action !== 'LOGOUT')) && matchesSearch(search, userName(log), entityLabel(log.entityType), log.ipAddress),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [auditLogs, action, search, locale, changesOnly],
  );

  const th = { padding: '12px', fontWeight: 'var(--font-medium)' } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      <div style={{ marginBottom: 'calc(-1 * var(--space-5))' }}>
        <PageHeader
          title={isRu ? 'Безопасность' : 'Xavfsizlik'}
          subtitle={isRu ? 'Кто, когда и что изменил в системе; где хранятся резервные копии.' : 'Tizimda kim, qachon va nimani o‘zgartirgani; zaxira nusxalar qayerda saqlanadi.'}
        />
      </div>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
          <Database size={18} aria-hidden style={{ color: 'var(--color-text-secondary)' }} />
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Резервные копии' : 'Zaxira nusxalar'}</h2>
        </div>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{BACKUPS_MANAGED_BY_NEON_MESSAGE[locale]}</p>
      </Card>

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
          <History size={18} aria-hidden style={{ color: 'var(--color-text-secondary)' }} />
          <h2 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)' }}>{isRu ? 'Журнал действий' : 'Harakatlar jurnali'}</h2>
        </div>

        {auditLogs.length > 0 && (
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 'var(--space-4)' }}>
            <SearchField value={search} onChange={setSearch} placeholder={isRu ? 'Пользователь, объект или IP' : 'Foydalanuvchi, obyekt yoki IP'} style={{ maxWidth: 340 }} />
            <ChipGroup
              label={isRu ? 'Действие' : 'Harakat'}
              options={[{ value: '', label: isRu ? 'Все действия' : 'Barcha harakatlar' }, ...Object.keys(ACTIONS).map((a) => ({ value: a, label: actionLabel(a), count: auditLogs.filter((l) => l.action === a).length }))]}
              value={action}
              onChange={setAction}
            />
            {!action && (
              <label className="auth-check">
                <input type="checkbox" checked={changesOnly} onChange={(e) => setChangesOnly(e.target.checked)} />
                {tsec('changesOnly')}
              </label>
            )}
          </div>
        )}

        {auditQuery.isError ? (
          <LoadError error={auditQuery.error} onRetry={() => void auditQuery.refetch()} retrying={auditQuery.isFetching} />
        ) : auditQuery.isPending ? (
          <SkeletonRows rows={6} columns={5} />
        ) : auditLogs.length === 0 ? (
          <EmptyState compact icon={History} title={isRu ? 'Действий пока нет' : 'Hozircha harakatlar yo‘q'} description={isRu ? 'Здесь появятся входы в систему и изменения документов и настроек.' : 'Bu yerda tizimga kirishlar, hujjat va sozlamalar o‘zgarishlari paydo bo‘ladi.'} />
        ) : rows.length === 0 ? (
          <EmptyState compact title={isRu ? 'Ничего не найдено' : 'Hech narsa topilmadi'} description={isRu ? 'Измените поиск или действие.' : 'Qidiruv yoki harakatni o‘zgartiring.'} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="app-table-stack" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                  <th scope="col" style={th}>{isRu ? 'Когда' : 'Qachon'}</th>
                  <th scope="col" style={th}>{isRu ? 'Пользователь' : 'Foydalanuvchi'}</th>
                  <th scope="col" style={th}>{isRu ? 'Действие' : 'Harakat'}</th>
                  <th scope="col" style={th}>{isRu ? 'Объект' : 'Obyekt'}</th>
                  <th scope="col" style={th}>{isRu ? 'IP-адрес' : 'IP manzil'}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((log, i) => [
                  ...(i === 0 || dayKey(rows[i - 1].createdAt) !== dayKey(log.createdAt)
                    ? [
                        <tr key={`d-${log.id}`} className="jr-day">
                          <td colSpan={5}>
                            <strong>{formatDate(log.createdAt, locale)}</strong>
                            <span className="rd-sub" style={{ display: 'inline', marginLeft: 8 }}>
                              {tsec('dayLine', { count: rows.filter((r) => dayKey(r.createdAt) === dayKey(log.createdAt)).length, deleted: rows.filter((r) => dayKey(r.createdAt) === dayKey(log.createdAt) && r.action === 'DELETE').length })}
                            </span>
                          </td>
                        </tr>,
                      ]
                    : []),
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td data-primary style={{ padding: '12px', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }} className="tabular-nums">{formatDateTime(log.createdAt, locale)}</td>
                    <td data-label={isRu ? 'Пользователь' : 'Foydalanuvchi'} style={{ padding: '12px', fontWeight: 'var(--font-medium)' }}>{userName(log)}</td>
                    <td data-label={isRu ? 'Действие' : 'Harakat'} style={{ padding: '12px' }}>
                      <Badge variant={ACTIONS[log.action]?.variant ?? 'neutral'}>{actionLabel(log.action)}</Badge>
                    </td>
                    <td data-label={isRu ? 'Объект' : 'Obyekt'} style={{ padding: '12px' }} title={`${log.entityType} ${log.entityId}`}>{entityLabel(log.entityType)}</td>
                    <td data-label={isRu ? 'IP-адрес' : 'IP manzil'} style={{ padding: '12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{log.ipAddress || '—'}</td>
                  </tr>,
                ])}
              </tbody>
            </table>
          </div>
        )}

        {auditLogs.length >= limit && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'var(--space-4)' }}>
            <Button variant="outline" size="sm" loading={auditQuery.isFetching} loadingText={isRu ? 'Загрузка…' : 'Yuklanmoqda…'} onClick={() => setLimit((l) => l + PAGE)}>
              {isRu ? 'Показать ещё' : 'Yana ko‘rsatish'}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
