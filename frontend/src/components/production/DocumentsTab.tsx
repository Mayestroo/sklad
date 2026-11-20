'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FileText, Filter, Plus, Search, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select, type SelectOption } from '@/components/ui/Select';
import { DateRangeField } from '@/components/ui/DateRangeField';
import { formatCurrency, formatDate, formatQuantity } from '@/lib/utils';
import { formatRange } from '@/lib/date-range';
import { unitLabel } from '@/lib/units';
import { EmptyState, Pagination, SkeletonRows, SortHeader, stickyRight, tdStyle, thStyle, type SortDir } from './TableParts';
import { localName, personName, STATUS_FILTERS, STATUS_VARIANTS, type Locale, type ProductionDocument } from './types';

export type DocumentSortField = 'docNumber' | 'docDate' | 'product' | 'plannedQuantity' | 'status' | 'warehouse' | 'responsible' | 'totalCost';

export interface DocumentFilters {
  search: string;
  status: string;
  productId: string;
  warehouseId: string;
  responsibleId: string;
  dateFrom: string;
  dateTo: string;
}

export const EMPTY_FILTERS: DocumentFilters = { search: '', status: '', productId: '', warehouseId: '', responsibleId: '', dateFrom: '', dateTo: '' };

export interface DocumentsTabProps {
  locale: Locale;
  documents: ProductionDocument[];
  total: number;
  loading: boolean;
  filters: DocumentFilters;
  onFilters: (patch: Partial<DocumentFilters>) => void;
  onClearFilters: () => void;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  sortBy: DocumentSortField;
  sortDir: SortDir;
  onSort: (field: DocumentSortField) => void;
  productOptions: SelectOption[];
  warehouseOptions: SelectOption[];
  staffOptions: SelectOption[] | null;
  canCreate: boolean;
  onCreate: () => void;
  onOpen: (document: ProductionDocument) => void;
  highlightId: string | null;
}

export function StatusBadge({ status, locale }: { status: ProductionDocument['status']; locale: Locale }) {
  const t = useTranslations('production');
  void locale;
  return <Badge variant={STATUS_VARIANTS[status]}>{t(`status${status}`)}</Badge>;
}

/** Hujjatlar tabi (TZ "Ishlab chiqarish" 6, 11.6). */
export function DocumentsTab(props: DocumentsTabProps) {
  const { locale, documents, filters, sortBy, sortDir, onSort } = props;
  const t = useTranslations('production');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const labelOf = (options: SelectOption[] | null, value: string) => options?.find((o) => o.value === value)?.label ?? value;
  const statusLabel = STATUS_FILTERS.find((s) => s.value === filters.status);
  const chips: Array<{ key: keyof DocumentFilters | 'dates'; label: string }> = [
    ...(filters.search ? [{ key: 'search' as const, label: `«${filters.search}»` }] : []),
    ...(statusLabel ? [{ key: 'status' as const, label: t(statusLabel.key) }] : []),
    ...(filters.productId ? [{ key: 'productId' as const, label: labelOf(props.productOptions, filters.productId) }] : []),
    ...(filters.warehouseId ? [{ key: 'warehouseId' as const, label: labelOf(props.warehouseOptions, filters.warehouseId) }] : []),
    ...(filters.responsibleId ? [{ key: 'responsibleId' as const, label: labelOf(props.staffOptions, filters.responsibleId) }] : []),
    ...(filters.dateFrom || filters.dateTo ? [{ key: 'dates' as const, label: formatRange(filters.dateFrom, filters.dateTo) }] : []),
  ];
  const removeChip = (key: (typeof chips)[number]['key']) => (key === 'dates' ? props.onFilters({ dateFrom: '', dateTo: '' }) : props.onFilters({ [key]: '' }));

  const money = (value: number) => formatCurrency(value, locale, 'UZS');
  const quantity = (doc: ProductionDocument) => `${formatQuantity(Number(doc.producedQuantity ?? doc.plannedQuantity))} ${unitLabel(doc.productUnit || doc.product.unitOfMeasure, locale)}`;
  const warehouseText = (doc: ProductionDocument) =>
    doc.outputWarehouse && doc.outputWarehouseId !== doc.warehouseId ? `${localName(doc.warehouse.name, locale)} → ${localName(doc.outputWarehouse.name, locale)}` : localName(doc.warehouse.name, locale);

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: 16, borderBottom: '1px solid var(--color-border-light)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
          type="button"
          className="prod-filter-toggle"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((o) => !o)}
          style={{ display: 'none', alignItems: 'center', gap: 8, minHeight: 44, padding: '8px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)', cursor: 'pointer', alignSelf: 'flex-start' }}
        >
          <Filter size={16} aria-hidden /> {t('filtrlar')}
          {chips.length > 0 && <Badge variant="info">{chips.length}</Badge>}
        </button>
        <div className="prod-filters" data-open={filtersOpen} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, alignItems: 'end' }}>
          <div>
            <label htmlFor="doc-search" style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {t('hujjatRaqami')}
            </label>
            <div style={{ position: 'relative' }}>
              <Search size={15} aria-hidden style={{ position: 'absolute', left: 10, top: 12, color: 'var(--color-text-secondary)' }} />
              <input
                id="doc-search"
                type="search"
                aria-label={t('hujjatlarniQidirish')}
                value={filters.search}
                onChange={(e) => props.onFilters({ search: e.target.value })}
                placeholder="PR-…"
                style={{ width: '100%', minHeight: 40, padding: '8px 10px 8px 32px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)' }}
              />
            </div>
          </div>
          <Select
            label={t('holat')}
            value={filters.status}
            onChange={(value) => props.onFilters({ status: value })}
            options={[{ value: '', label: t('barchaHolatlar') }, ...STATUS_FILTERS.map((s) => ({ value: s.value, label: t(s.key) }))]}
          />
          <Select label={t('mahsulot')} searchable value={filters.productId} onChange={(value) => props.onFilters({ productId: value })} options={[{ value: '', label: t('barchaMahsulotlar') }, ...props.productOptions]} />
          <Select label={t('ombor')} value={filters.warehouseId} onChange={(value) => props.onFilters({ warehouseId: value })} options={[{ value: '', label: t('barchaOmborlar') }, ...props.warehouseOptions]} />
          {props.staffOptions && (
            <Select label={t('masul')} searchable value={filters.responsibleId} onChange={(value) => props.onFilters({ responsibleId: value })} options={[{ value: '', label: t('barchaXodimlar') }, ...props.staffOptions]} />
          )}
          <DateRangeField
            label={t('sanaOraligi')}
            from={filters.dateFrom}
            to={filters.dateTo}
            onChange={(dateFrom, dateTo) => props.onFilters({ dateFrom, dateTo })}
            locale={locale}
            style={{ gridColumn: 'span 1', minWidth: 220 }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 32 }}>
          {chips.map((chip) => (
            <span key={chip.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 4px 2px 10px', borderRadius: 999, background: 'var(--color-primary-50)', color: 'var(--color-primary-700)', fontSize: 'var(--text-xs)' }}>
              {chip.label}
              <button
                type="button"
                aria-label={`${t('filtrniOlibTashlash')}: ${chip.label}`}
                title={t('filtrniOlibTashlash')}
                onClick={() => removeChip(chip.key)}
                style={{ width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 999, background: 'transparent', color: 'inherit', cursor: 'pointer' }}
              >
                <X size={13} aria-hidden />
              </button>
            </span>
          ))}
          {chips.length > 0 && (
            <Button size="sm" variant="outline" onClick={props.onClearFilters}>
              {t('hammasiniTozalash')}
            </Button>
          )}
          <span aria-live="polite" style={{ marginLeft: 'auto', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            {t('topildi', { v0: props.total })}
          </span>
        </div>
      </div>

      {!props.loading && documents.length === 0 ? (
        <EmptyState
          icon={<FileText size={26} />}
          text={chips.length ? t('filtrBoyichaHujjatTopilmadi') : t('hozirchaIshlabChiqarishHujjatlariYoq')}
          action={
            chips.length ? (
              <Button variant="outline" onClick={props.onClearFilters}>{t('filtrlarniTozalash')}</Button>
            ) : props.canCreate ? (
              <Button onClick={props.onCreate}>
                <Plus size={16} aria-hidden /> {t('hujjatYaratish')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="prod-table" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 1000 }}>
              <caption className="sr-only">{t('ishlabChiqarishHujjatlari')}</caption>
              <thead>
                <tr>
                  <SortHeader label="№" field="docNumber" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHeader label={t('sana')} field="docDate" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHeader label={t('mahsulot')} field="product" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHeader label={t('miqdor')} field="plannedQuantity" sortBy={sortBy} sortDir={sortDir} onSort={onSort} align="right" />
                  <SortHeader label={t('holat')} field="status" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHeader label={t('ombor')} field="warehouse" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHeader label={t('masul')} field="responsible" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHeader label={t('tannarx')} field="totalCost" sortBy={sortBy} sortDir={sortDir} onSort={onSort} align="right" />
                  <th scope="col" style={{ ...thStyle, ...stickyRight, background: 'var(--color-bg-tertiary)', textAlign: 'right' }}>{t('amallar')}</th>
                </tr>
              </thead>
              <tbody>
                {props.loading && documents.length === 0 ? (
                  <SkeletonRows columns={9} />
                ) : (
                  documents.map((doc) => (
                    <tr key={doc.id} className={doc.id === props.highlightId ? 'prod-row-highlight' : undefined}>
                      <td style={{ ...tdStyle, fontWeight: 600, whiteSpace: 'nowrap' }}>{doc.docNumber}</td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatDate(doc.docDate, locale)}</td>
                      <td style={{ ...tdStyle, maxWidth: 240 }}>
                        <div title={localName(doc.product.name, locale)} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {localName(doc.product.name, locale)}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }} className="tabular-nums">{quantity(doc)}</td>
                      <td style={tdStyle}>
                        <StatusBadge status={doc.status} locale={locale} />
                      </td>
                      <td style={{ ...tdStyle, maxWidth: 220 }}>
                        <div title={warehouseText(doc)} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {warehouseText(doc)}
                        </div>
                      </td>
                      <td style={tdStyle}>{personName(doc.responsible) || '—'}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }} className="tabular-nums">{money(doc.displayCost)}</td>
                      <td style={{ ...tdStyle, ...stickyRight, textAlign: 'right' }}>
                        <Button size="sm" variant="secondary" onClick={() => props.onOpen(doc)} style={{ minHeight: 40 }}>
                          {t('ochish')}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="prod-cards" style={{ padding: 16 }}>
            {documents.map((doc) => (
              <article key={doc.id} style={{ border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-md)', padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{localName(doc.product.name, locale)}</strong>
                  <StatusBadge status={doc.status} locale={locale} />
                </div>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                  {doc.docNumber} · {formatDate(doc.docDate, locale)} · {quantity(doc)}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="tabular-nums" style={{ fontWeight: 600 }}>{money(doc.displayCost)}</span>
                  <Button size="sm" variant="secondary" onClick={() => props.onOpen(doc)} style={{ minHeight: 44 }}>
                    {t('ochish')}
                  </Button>
                </div>
              </article>
            ))}
          </div>
          <Pagination page={props.page} pageSize={props.pageSize} total={props.total} onPage={props.onPage} locale={locale} />
        </>
      )}
    </Card>
  );
}
