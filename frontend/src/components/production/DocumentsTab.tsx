'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { FileText, Plus } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDate, formatQuantity } from '@/lib/utils';
import { unitLabel } from '@/lib/units';
import { EmptyState, Pagination, SkeletonRows, SortHeader, stickyRight, tdStyle, thStyle, type SortDir } from './TableParts';
import { localName, personName, STATUS_VARIANTS, type Locale, type ProductionDocument } from './types';

export type DocumentSortField = 'docNumber' | 'docDate' | 'product' | 'plannedQuantity' | 'status' | 'warehouse' | 'responsible' | 'totalCost';

export interface DocumentsTabProps {
  locale: Locale;
  documents: ProductionDocument[];
  total: number;
  loading: boolean;
  /** The shared FilterBar (the page owns the filters, kept in the URL). */
  filterBar: ReactNode;
  /** Any filter or search is set (the empty state then offers "clear"). */
  filtered: boolean;
  onClearFilters: () => void;
  page: number;
  pageSize: number;
  onPage: (page: number) => void;
  sortBy: DocumentSortField;
  sortDir: SortDir;
  onSort: (field: DocumentSortField) => void;
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
  const { locale, documents, sortBy, sortDir, onSort } = props;
  const t = useTranslations('production');
  const money = (value: number) => formatCurrency(value, locale, 'UZS');
  const quantity = (doc: ProductionDocument) => `${formatQuantity(Number(doc.producedQuantity ?? doc.plannedQuantity))} ${unitLabel(doc.productUnit || doc.product.unitOfMeasure, locale)}`;
  const warehouseText = (doc: ProductionDocument) =>
    doc.outputWarehouse && doc.outputWarehouseId !== doc.warehouseId ? `${localName(doc.warehouse.name, locale)} → ${localName(doc.outputWarehouse.name, locale)}` : localName(doc.warehouse.name, locale);

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: 16, borderBottom: '1px solid var(--color-border-light)' }}>{props.filterBar}</div>

      {!props.loading && documents.length === 0 ? (
        <EmptyState
          icon={<FileText size={26} />}
          text={props.filtered ? t('filtrBoyichaHujjatTopilmadi') : t('hozirchaIshlabChiqarishHujjatlariYoq')}
          hint={props.filtered ? undefined : t('hujjatlarBoshHolatIzohi')}
          action={
            props.filtered ? (
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
