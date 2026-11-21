'use client';

import { useTranslations } from 'next-intl';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Layers3, Pencil, Plus, Search } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { formatCurrency, formatDate, formatQuantity } from '@/lib/utils';
import { unitLabel } from '@/lib/units';
import { semiFinishedLabel } from '@/lib/product-types';
import { ActionsMenu } from './ActionsMenu';
import { EmptyState, Pagination, SkeletonRows, SortHeader, stickyRight, tdStyle, thStyle, type SortDir } from './TableParts';
import { localName, type Locale, type Recipe } from './types';

type SortField = 'product' | 'norm' | 'normTotal' | 'perUnit' | 'status' | 'updatedAt';
const PAGE_SIZE = 10;

export interface RecipesTabProps {
  recipes: Recipe[];
  archived: Recipe[];
  loading: boolean;
  locale: Locale;
  highlightId: string | null;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canCreateDocument: boolean;
  status: string;
  onStatusChange: (status: string) => void;
  uncostedOnly: boolean;
  onUncostedChange: (value: boolean) => void;
  onCreate: () => void;
  onEdit: (recipe: Recipe) => void;
  onCopy: (recipe: Recipe) => void;
  onToggleActive: (recipe: Recipe) => void;
  onArchive: (recipe: Recipe) => void;
  onDelete: (recipe: Recipe) => void;
  onCreateDocument: (recipe: Recipe) => void;
}

/** Retsepturalar tabi (TZ "Ishlab chiqarish" 11.2). */
export function RecipesTab(props: RecipesTabProps) {
  const { recipes, archived, loading, locale, highlightId, status, uncostedOnly } = props;
  const t = useTranslations('production');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('updatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const source = status === 'archived' ? archived : recipes;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = source.filter((recipe) => {
      if (status === 'active' && !recipe.isActive) return false;
      if (status === 'inactive' && recipe.isActive) return false;
      if (uncostedOnly && !recipe.estimate.missingPrice) return false;
      if (!q) return true;
      return localName(recipe.product.name, locale).toLowerCase().includes(q) || (recipe.product.sku ?? '').toLowerCase().includes(q);
    });
    const key = (r: Recipe): string | number => {
      switch (sortBy) {
        case 'product':
          return localName(r.product.name, locale).toLowerCase();
        case 'norm':
          return Number(r.outputQuantity);
        case 'normTotal':
          return r.estimate.normTotal;
        case 'perUnit':
          return r.estimate.perUnit ?? 0;
        case 'status':
          return r.isActive ? 0 : 1;
        default:
          return r.updatedAt;
      }
    };
    return [...rows].sort((a, b) => {
      const x = key(a);
      const y = key(b);
      const cmp = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), locale);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [source, status, uncostedOnly, search, sortBy, sortDir, locale]);

  // The page starts again at 1 when a filter changes; after a save it shows
  // the saved recipe's page (TZ 11.4) and the row is highlighted.
  const pageKey = `${search}|${status}|${uncostedOnly}|${highlightId ?? ''}`;
  const [pageState, setPageState] = useState({ key: pageKey, page: 1 });
  const highlightIndex = highlightId ? filtered.findIndex((r) => r.id === highlightId) : -1;
  const page = pageState.key === pageKey ? pageState.page : highlightIndex >= 0 ? Math.floor(highlightIndex / PAGE_SIZE) + 1 : 1;
  const setPage = (next: number) => setPageState({ key: pageKey, page: next });

  useEffect(() => {
    if (!highlightId) return;
    const timer = window.setTimeout(() => document.getElementById(`recipe-${highlightId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
    return () => window.clearTimeout(timer);
  }, [highlightId]);

  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const onSort = (field: SortField) => {
    if (field === sortBy) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortBy(field);
      setSortDir(field === 'updatedAt' ? 'desc' : 'asc');
    }
  };
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const money = (value: number | null) => formatCurrency(value ?? 0, locale, 'UZS');
  const unitOf = (recipe: Recipe) => unitLabel(recipe.product.unitOfMeasure, locale);
  const lineUnit = (line: Recipe['items'][number]) => unitLabel(line.unit || line.product?.unitOfMeasure, locale);

  const statusBadge = (recipe: Recipe) =>
    recipe.isArchived ? (
      <Badge variant="neutral">{t('arxiv')}</Badge>
    ) : recipe.isActive ? (
      <Badge variant="success">● {t('faol2')}</Badge>
    ) : (
      <Badge variant="neutral">○ {t('nofaol')}</Badge>
    );

  const estimateBadge = (recipe: Recipe) => (
    <span title={t('xomashyoKartalaridagiNarxBoyicha')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--color-text-secondary)' }}>
      {t('taxminiy')}
      {recipe.estimate.missingPrice && (
        <AlertTriangle size={14} aria-label={t('narxiYoqXomashyoBor')} style={{ color: 'var(--color-warning-700)' }} />
      )}
    </span>
  );

  const actions = (recipe: Recipe) => [
    { label: t('nusxaOlish'), onSelect: () => props.onCopy(recipe), hidden: !props.canCreate },
    {
      label: recipe.isActive ? t('nofaolQilish') : t('faolQilish'),
      onSelect: () => props.onToggleActive(recipe),
      hidden: !props.canEdit || recipe.isArchived,
    },
    { label: t('ishlabChiqarishHujjatiYaratish'), onSelect: () => props.onCreateDocument(recipe), hidden: !props.canCreateDocument || !recipe.isActive || recipe.isArchived },
    { label: t('arxivgaOlish'), onSelect: () => props.onArchive(recipe), danger: true, hidden: !props.canDelete || recipe.isArchived },
    { label: t('ochirish'), onSelect: () => props.onDelete(recipe), danger: true, hidden: !props.canDelete || Boolean(recipe.usedInDocuments) },
  ];

  const chips = (recipe: Recipe) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      {recipe.items.slice(0, 2).map((line) => (
        <span
          key={line.productId}
          title={`${localName(line.product?.name, locale)} · ${formatQuantity(Number(line.quantity))} ${lineUnit(line)}`}
          style={{ display: 'inline-flex', alignItems: 'center', maxWidth: 220, padding: '4px 10px', borderRadius: 999, background: 'var(--color-bg-tertiary)', fontSize: 'var(--text-xs)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {localName(line.product?.name, locale)} · {formatQuantity(Number(line.quantity))} {lineUnit(line)}
        </span>
      ))}
      {recipe.items.length > 2 && (
        <span style={{ padding: '4px 8px', borderRadius: 999, border: '1px solid var(--color-border)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>+{recipe.items.length - 2}</span>
      )}
    </div>
  );

  const details = (recipe: Recipe) => (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
      <thead>
        <tr>
          <th scope="col" style={{ ...thStyle, background: 'transparent' }}>{t('xomashyo')}</th>
          <th scope="col" style={{ ...thStyle, background: 'transparent', textAlign: 'right' }}>{t('miqdor')}</th>
          <th scope="col" style={{ ...thStyle, background: 'transparent' }}>{t('birlik')}</th>
          <th scope="col" style={{ ...thStyle, background: 'transparent', textAlign: 'right' }}>{t('yoqotish')}</th>
          <th scope="col" style={{ ...thStyle, background: 'transparent', textAlign: 'right' }}>{t('birlikNarxi')}</th>
          <th scope="col" style={{ ...thStyle, background: 'transparent', textAlign: 'right' }}>{t('summa')}</th>
        </tr>
      </thead>
      <tbody>
        {recipe.items.map((line, i) => (
          <tr key={line.productId}>
            <td style={{ ...tdStyle, height: 44 }}>
              {localName(line.product?.name, locale)}
              {line.product?.isSemiFinished && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--color-info-700)' }}>{semiFinishedLabel(locale)}</span>}
            </td>
            <td style={{ ...tdStyle, height: 44, textAlign: 'right' }} className="tabular-nums">{formatQuantity(Number(line.quantity))}</td>
            <td style={{ ...tdStyle, height: 44 }}>{lineUnit(line)}</td>
            <td style={{ ...tdStyle, height: 44, textAlign: 'right' }} className="tabular-nums">{Number(line.lossPercent ?? 0) ? `${formatQuantity(Number(line.lossPercent))} %` : '—'}</td>
            <td style={{ ...tdStyle, height: 44, textAlign: 'right' }} className="tabular-nums">{money(recipe.estimate.lines[i]?.entryUnitCost ?? 0)}</td>
            <td style={{ ...tdStyle, height: 44, textAlign: 'right', fontWeight: 600 }} className="tabular-nums">{money(recipe.estimate.lines[i]?.total ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', borderBottom: '1px solid var(--color-border-light)' }}>
        <div style={{ flex: '1 1 240px', minWidth: 200 }}>
          <label htmlFor="recipe-search" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
            {t('qidiruv')}
          </label>
          <div style={{ position: 'relative' }}>
            <Search size={15} aria-hidden style={{ position: 'absolute', left: 10, top: 12, color: 'var(--color-text-secondary)' }} />
            <input
              id="recipe-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('mahsulotNomiYokiSku')}
              style={{ width: '100%', minHeight: 40, padding: '8px 10px 8px 32px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)' }}
            />
          </div>
        </div>
        <Select
          label={t('holat')}
          value={status}
          onChange={props.onStatusChange}
          options={[
            { value: 'all', label: t('barchasi') },
            { value: 'active', label: t('faol') },
            { value: 'inactive', label: t('nofaol2') },
            { value: 'archived', label: t('arxiv') },
          ]}
          style={{ minWidth: 170 }}
        />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 40, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', cursor: 'pointer' }}>
          <input type="checkbox" checked={uncostedOnly} onChange={(e) => props.onUncostedChange(e.target.checked)} style={{ width: 18, height: 18 }} />
          {t('tannarxiHisoblanmagan')}
        </label>
        <span aria-live="polite" style={{ marginLeft: 'auto', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
          {t('topildi', { v0: filtered.length })}
        </span>
      </div>

      {!loading && filtered.length === 0 ? (
        <EmptyState
          icon={<Layers3 size={26} />}
          text={source.length === 0 ? t('hozirchaRetsepturalarYoq') : t('filtrBoyichaRetsepturaTopilmadi')}
          hint={source.length === 0 ? t('retsepturaBoshHolatIzohi') : undefined}
          action={
            source.length === 0 && props.canCreate ? (
              <Button onClick={props.onCreate}>
                <Plus size={16} aria-hidden /> {t('yangiRetseptura')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="prod-table" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 1080 }}>
              <caption className="sr-only">{t('retsepturalar')}</caption>
              <thead>
                <tr>
                  <th scope="col" style={{ ...thStyle, width: 48 }}><span className="sr-only">{t('batafsil')}</span></th>
                  <SortHeader label={t('tayyorMahsulot')} field="product" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHeader label={t('norma')} field="norm" sortBy={sortBy} sortDir={sortDir} onSort={onSort} align="right" />
                  <th scope="col" style={thStyle}>{t('tarkibi')}</th>
                  <SortHeader label={t('normaUchunXomashyo')} field="normTotal" sortBy={sortBy} sortDir={sortDir} onSort={onSort} align="right" />
                  <SortHeader label={t('birlikTannarxi')} field="perUnit" sortBy={sortBy} sortDir={sortDir} onSort={onSort} align="right" />
                  <SortHeader label={t('holat')} field="status" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHeader label={t('yangilangan')} field="updatedAt" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <th scope="col" style={{ ...thStyle, ...stickyRight, background: 'var(--color-bg-tertiary)', textAlign: 'right' }}>{t('amallar')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SkeletonRows columns={9} />
                ) : (
                  pageRows.map((recipe) => {
                    const open = expanded.has(recipe.id);
                    return (
                      <Fragment key={recipe.id}>
                        <tr id={`recipe-${recipe.id}`} className={recipe.id === highlightId ? 'prod-row-highlight' : undefined} onClick={() => toggle(recipe.id)} style={{ cursor: 'pointer' }}>
                          <td style={tdStyle}>
                            <button
                              type="button"
                              aria-expanded={open}
                              aria-label={open ? t('tarkibniYopish') : t('tarkibniOchish')}
                              title={open ? t('tarkibniYopish') : t('tarkibniOchish')}
                              onClick={(e) => {
                                e.stopPropagation();
                                toggle(recipe.id);
                              }}
                              style={{ width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', borderRadius: 'var(--radius-md)' }}
                            >
                              {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
                            </button>
                          </td>
                          <td style={{ ...tdStyle, maxWidth: 260 }}>
                            <div title={localName(recipe.product.name, locale)} style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {localName(recipe.product.name, locale)}
                            </div>
                            {recipe.product.sku && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{recipe.product.sku}</div>}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }} className="tabular-nums">
                            {formatQuantity(Number(recipe.outputQuantity))} {unitOf(recipe)}
                          </td>
                          <td style={{ ...tdStyle, maxWidth: 320 }}>{chips(recipe)}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }} className="tabular-nums">
                            {money(recipe.estimate.normTotal)}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }} className="tabular-nums">
                            <div style={{ fontWeight: 600 }}>{money(recipe.estimate.perUnit)}</div>
                            {estimateBadge(recipe)}
                          </td>
                          <td style={tdStyle}>{statusBadge(recipe)}</td>
                          <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDate(recipe.updatedAt, locale)}</td>
                          <td style={{ ...tdStyle, ...stickyRight, textAlign: 'right', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                              {props.canEdit && !recipe.isArchived && (
                                <Button size="sm" variant="secondary" onClick={() => props.onEdit(recipe)} style={{ minHeight: 40 }}>
                                  <Pencil size={14} aria-hidden /> {t('tahrirlash')}
                                </Button>
                              )}
                              <ActionsMenu label={t('boshqaAmallar')} actions={actions(recipe)} />
                            </div>
                          </td>
                        </tr>
                        {open && (
                          <tr>
                            <td colSpan={9} style={{ padding: '0 16px 16px 64px', background: 'var(--color-bg-primary)', borderBottom: '1px solid var(--color-border-light)' }}>
                              {details(recipe)}
                              {recipe.note && <div style={{ marginTop: 8, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{recipe.note}</div>}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Phones: one card per recipe (TZ 11.7). */}
          <div className="prod-cards" style={{ padding: 16 }}>
            {pageRows.map((recipe) => (
              <article key={recipe.id} className={recipe.id === highlightId ? 'prod-row-highlight' : undefined} style={{ border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-md)', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{localName(recipe.product.name, locale)}</strong>
                  {statusBadge(recipe)}
                </div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                  {t('norma')}: {formatQuantity(Number(recipe.outputQuantity))} {unitOf(recipe)}
                </div>
                {chips(recipe)}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="tabular-nums" style={{ fontWeight: 600 }}>
                    {money(recipe.estimate.perUnit)} / {unitOf(recipe)}
                  </span>
                  {estimateBadge(recipe)}
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  {props.canEdit && !recipe.isArchived && (
                    <Button size="sm" variant="secondary" onClick={() => props.onEdit(recipe)} style={{ minHeight: 44 }}>
                      <Pencil size={14} aria-hidden /> {t('tahrirlash')}
                    </Button>
                  )}
                  <ActionsMenu label={t('boshqaAmallar')} actions={actions(recipe)} />
                </div>
              </article>
            ))}
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} locale={locale} />
        </>
      )}
    </Card>
  );
}
