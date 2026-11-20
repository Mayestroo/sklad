'use client';

import { DecimalInput } from '@/components/ui/DecimalInput';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Factory, Pencil, Plus, Trash2, XCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { apiFetch } from '@/lib/api';
import { errorMessage, formatCurrency, formatDate, formatPercent, formatQuantity, formatUnitCost } from '@/lib/utils';
import { unitLabel } from '@/lib/units';
import { formatRange } from '@/lib/date-range';
import { computeProductionCost, deviationPercent, parseDecimal, roundMoney } from '@/lib/production-recipe';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { StatusBadge } from './DocumentsTab';
import { thStyle } from './TableParts';
import { COST_TYPES, isOpenStatus, isRunningStatus, localName, personName, type CostType, type Locale, type ProductionDocument } from './types';

interface CostRow {
  key: number;
  costType: CostType;
  amount: string;
  comment: string;
}
let costKey = 0;

export interface ProductionDocumentDetailsModalProps {
  locale: Locale;
  document: ProductionDocument;
  canEdit: boolean;
  canDelete: boolean;
  canComplete: boolean;
  canCancel: boolean;
  onClose: () => void;
  onEdit: () => void;
  /** The document changed (or was deleted: null). */
  onChanged: (document: ProductionDocument | null, message: string) => void | Promise<void>;
}

const issuedOf = (line: NonNullable<ProductionDocument['materials']>[number]) =>
  (line.batchConsumptions ?? []).reduce((sum, b) => sum + Number(b.quantity), 0);

export function ProductionDocumentDetailsModal(props: ProductionDocumentDetailsModalProps) {
  const { locale, document: doc } = props;
  const t = useTranslations('production');
  const { token, company } = useAuth();
  const confirm = useConfirm();
  const running = isRunningStatus(doc.status);
  const materials = doc.materials ?? [];
  const [actual, setActual] = useState<Record<string, string>>(() =>
    Object.fromEntries(materials.map((m) => [m.productId, String(m.actualQuantity != null ? Number(m.actualQuantity) : issuedOf(m))])),
  );
  const [produced, setProduced] = useState(doc.producedQuantity != null ? String(Number(doc.producedQuantity)) : String(Number(doc.plannedQuantity)));
  const [costs, setCosts] = useState<CostRow[]>(() =>
    (doc.extraCosts ?? []).map((c) => ({ key: ++costKey, costType: c.costType, amount: String(Number(c.amount)), comment: c.comment ?? '' })),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  const productUnit = unitLabel(doc.productUnit || doc.product.unitOfMeasure, locale);
  const extraTotal = roundMoney(costs.reduce((sum, c) => sum + (parseDecimal(c.amount) ?? 0), 0));
  const producedValue = parseDecimal(produced) ?? 0;

  const call = async (path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown) => {
    if (!token || !company) throw new Error('auth');
    return apiFetch<ProductionDocument>(`/production/documents/${doc.id}${path}`, {
      method,
      token,
      tenantId: company.id,
      locale,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  };
  const run = async (action: () => Promise<ProductionDocument | null>, message: string) => {
    setBusy(true);
    setError('');
    try {
      const result = await action();
      await props.onChanged(result, message);
    } catch (e) {
      setError(errorMessage(e) || t('amalBajarilmadi'));
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    const ok = await confirm({
      title: t('ishlabChiqarishniBoshlash'),
      description: t('xomashyoOmbordanFifoBoyichaEng'),
      variant: 'info',
      confirmText: t('jarayongaOtkazish'),
      cancelText: t('bekorQilish'),
    });
    if (ok) await run(() => call('/start', 'POST'), t('hujjatJarayongaOtkazildiXomashyoFifo'));
  };

  const materialPayload = () => materials.map((m) => ({ productId: m.productId, actualQuantity: parseDecimal(actual[m.productId]) ?? 0 }));
  const costPayload = () => costs.map((c) => ({ costType: c.costType, amount: parseDecimal(c.amount) ?? 0, comment: c.comment.trim() || undefined }));

  const complete = async () => {
    if (!(producedValue > 0)) {
      setError(t('chiqqanMiqdor0DanKatta'));
      return;
    }
    if (costs.some((c) => !(parseDecimal(c.amount)! > 0))) {
      setError(t('harBirQoshimchaXarajatSummasini'));
      return;
    }
    if (materials.some((m) => parseDecimal(actual[m.productId]) === null || parseDecimal(actual[m.productId])! < 0)) {
      setError(t('harBirXomashyoUchunHaqiqiy'));
      return;
    }
    const ok = await confirm({
      title: t('ishlabChiqarishniYakunlash'),
      description: t('tayyorMahsulotOmborgaYangiPartiya', { v0: formatQuantity(producedValue), productUnit }),
      variant: 'info',
      confirmText: t('yakunlash'),
      cancelText: t('bekorQilish'),
    });
    if (!ok) return;
    await run(
      () => call('/complete', 'POST', { producedQuantity: producedValue, materials: materialPayload(), extraCosts: costPayload() }),
      t('ishlabChiqarishYakunlandiTayyorMahsulot'),
    );
  };

  const saveActual = () =>
    run(async () => {
      await call('/materials/actual', 'PUT', { materials: materialPayload() });
      return call('', 'PUT', { extraCosts: costPayload() });
    }, t('haqiqiySarfVaXarajatlarSaqlandi'));

  const remove = async () => {
    const ok = await confirm({
      title: t('qoralamaniOchirish'),
      description: t('qoralamaButunlayOchiriladiOmborgaTasiri'),
      variant: 'danger',
      confirmText: t('ochirish'),
      cancelText: t('bekorQilish'),
    });
    if (ok) await run(async () => { await call('', 'DELETE'); return null; }, t('qoralamaOchirildi'));
  };

  const cancelDocument = () =>
    run(() => call('/cancel', 'POST', { reason: reason.trim() }), t('hujjatBekorQilindiOmborHarakatlari'));

  // Plan vs actual; for a completed one the planned unit cost is not shown (actual is final).
  const totals = computeProductionCost(
    materials.reduce((sum, m) => sum + Number(m.totalCost), 0),
    costs.map((c) => parseDecimal(c.amount) ?? 0),
    running ? producedValue : Number(doc.producedQuantity ?? 0),
  );

  return (
    <>
      <Modal
        isOpen
        onClose={props.onClose}
        title={`${doc.docNumber} · ${localName(doc.product.name, locale)}`}
        size="2xl"
        onSubmitShortcut={running && props.canComplete ? () => void complete() : undefined}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', width: '100%' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {doc.status !== 'CANCELLED' && props.canCancel && (
                <Button variant="danger" onClick={() => setCancelOpen(true)} disabled={busy}>
                  <XCircle size={15} aria-hidden /> {t('bekorQilishStorno')}
                </Button>
              )}
              {isOpenStatus(doc.status) && props.canDelete && (
                <Button variant="outline" onClick={() => void remove()} disabled={busy}>
                  <Trash2 size={15} aria-hidden /> {t('ochirish')}
                </Button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {isOpenStatus(doc.status) && props.canEdit && (
                <>
                  <Button variant="outline" onClick={props.onEdit} disabled={busy}>
                    <Pencil size={15} aria-hidden /> {t('tahrirlash')}
                  </Button>
                  <Button onClick={() => void start()} disabled={busy} aria-busy={busy}>
                    <Factory size={15} aria-hidden /> {t('jarayongaOtkazish2')}
                  </Button>
                </>
              )}
              {running && props.canEdit && (
                <Button variant="outline" onClick={() => void saveActual()} disabled={busy}>
                  {t('sarfniSaqlash')}
                </Button>
              )}
              {running && props.canComplete && (
                <Button onClick={() => void complete()} disabled={busy} aria-busy={busy}>
                  <CheckCircle2 size={15} aria-hidden /> {busy ? t('bajarilmoqda') : t('yakunlash')} <kbd style={{ fontSize: 11, opacity: 0.8 }}>Ctrl+Enter</kbd>
                </Button>
              )}
            </div>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && (
            <div role="alert" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', color: 'var(--color-error-700)', background: 'var(--color-error-50)', border: '1px solid var(--color-error-100)' }}>
              <AlertTriangle size={16} aria-hidden /> {error}
            </div>
          )}
          {doc.status === 'CANCELLED' && doc.cancelReason && (
            <div role="status" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', background: 'var(--color-error-50)', color: 'var(--color-error-700)', fontSize: 'var(--text-sm)' }}>
              {t('bekorQilishSababi')}: {doc.cancelReason}
            </div>
          )}
          <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: 10, margin: 0 }}>
            <Detail label={t('holat')} value={<StatusBadge status={doc.status} locale={locale} />} />
            <Detail label={t('sana')} value={formatDate(doc.docDate, locale)} />
            <Detail label={t('rejaBoyichaMiqdor2')} value={`${formatQuantity(Number(doc.plannedQuantity))} ${productUnit}`} />
            <Detail label={t('xomashyoOmbori')} value={localName(doc.warehouse.name, locale)} />
            <Detail label={t('tayyorMahsulotOmbori')} value={localName((doc.outputWarehouse ?? doc.warehouse).name, locale)} />
            <Detail label={t('masul')} value={personName(doc.responsible) || '—'} />
            <Detail label={t('boshlanishTugash')} value={formatRange(doc.plannedStartDate?.slice(0, 10) ?? '', doc.plannedEndDate?.slice(0, 10) ?? '') || '—'} />
            <Detail label={t('xomashyoRejaTaxminiy')} value={formatCurrency(Number(doc.plannedMaterialCost), locale, 'UZS')} />
          </dl>
          {doc.note && <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>{doc.note}</div>}

          {/* TZ 5.3: plan and actual side by side, deviation in percent. */}
          <div style={{ overflowX: 'auto', border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-md)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)', minWidth: 760 }}>
              <caption className="sr-only">{t('xomashyoSarfi')}</caption>
              <thead>
                <tr>
                  <th scope="col" style={thStyle}>{t('xomashyo')}</th>
                  <th scope="col" style={{ ...thStyle, textAlign: 'right' }}>{t('reja')}</th>
                  <th scope="col" style={{ ...thStyle, textAlign: 'right' }}>{t('haqiqiySarf')}</th>
                  <th scope="col" style={{ ...thStyle, textAlign: 'right' }}>{t('ogish')}</th>
                  <th scope="col" style={{ ...thStyle, textAlign: 'right' }}>{t('birlikTannarxiFifo')}</th>
                  <th scope="col" style={{ ...thStyle, textAlign: 'right' }}>{t('summa')}</th>
                </tr>
              </thead>
              <tbody>
                {materials.map((line) => {
                  const unit = unitLabel(line.unitOfMeasure || line.product.unitOfMeasure, locale);
                  const plannedQty = Number(line.plannedQuantity);
                  const actualQty = running ? parseDecimal(actual[line.productId]) : line.actualQuantity != null ? Number(line.actualQuantity) : isOpenStatus(doc.status) ? null : issuedOf(line);
                  const deviation = actualQty == null ? null : deviationPercent(plannedQty, actualQty);
                  return (
                    <tr key={line.id} style={{ borderTop: '1px solid var(--color-border-light)' }}>
                      <td style={{ padding: '10px 16px' }}>{localName(line.product.name, locale)}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }} className="tabular-nums">{formatQuantity(plannedQty)} {unit}</td>
                      <td style={{ padding: '6px 16px', textAlign: 'right' }} className="tabular-nums">
                        {running && props.canEdit ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <DecimalInput
                              aria-label={`${localName(line.product.name, locale)}: ${t('haqiqiySarf2')}`}
                              value={actual[line.productId] ?? ''}
                              onValueChange={(value) => setActual((current) => ({ ...current, [line.productId]: value }))}
                              style={{ width: 120 }}
                            />
                            {unit}
                          </span>
                        ) : actualQty == null ? (
                          '—'
                        ) : (
                          `${formatQuantity(actualQty)} ${unit}`
                        )}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: deviation && Math.abs(deviation) >= 5 ? 'var(--color-warning-700)' : undefined }} className="tabular-nums">
                        {deviation == null ? '—' : `${deviation > 0 ? '+' : ''}${formatPercent(deviation, 2)}`}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }} className="tabular-nums">{isOpenStatus(doc.status) ? '—' : formatUnitCost(Number(line.unitCost), locale, 'UZS')}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600 }} className="tabular-nums">{isOpenStatus(doc.status) ? '—' : formatCurrency(Number(line.totalCost), locale, 'UZS')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {running && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              {t('sarfOzgarsaFarqOmbordanQoshimcha')}
            </div>
          )}

          {/* Extra costs: editable until completed. */}
          <section aria-label={t('qoshimchaXarajatlar')} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <strong style={{ fontSize: 'var(--text-sm)' }}>{t('qoshimchaXarajatlarUzs')}</strong>
            {costs.length === 0 && !running && <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>—</div>}
            {costs.map((cost, i) =>
              running && props.canEdit ? (
                <div key={cost.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(min(100%, 140px), 1fr) minmax(min(100%, 140px), 1fr) minmax(160px, 2fr) 40px', gap: 8 }}>
                  <Select
                    aria-label={`${t('xarajatTuri')} ${i + 1}`}
                    options={COST_TYPES.map((type) => ({ value: type, label: t(`cost${type}`) }))}
                    value={cost.costType}
                    onChange={(value) => setCosts((rows) => rows.map((r) => (r.key === cost.key ? { ...r, costType: value as CostType } : r)))}
                  />
                  <MoneyInput aria-label={`${t('summa')} ${i + 1}`} value={cost.amount} onValueChange={(value) => setCosts((rows) => rows.map((r) => (r.key === cost.key ? { ...r, amount: value } : r)))} />
                  <input
                    aria-label={`${t('izoh')} ${i + 1}`}
                    value={cost.comment}
                    onChange={(e) => setCosts((rows) => rows.map((r) => (r.key === cost.key ? { ...r, comment: e.target.value } : r)))}
                    style={{ minHeight: 40, padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}
                  />
                  <button
                    type="button"
                    aria-label={`${t('xarajatniOchirish')} ${i + 1}`}
                    title={t('xarajatniOchirish')}
                    onClick={() => setCosts((rows) => rows.filter((r) => r.key !== cost.key))}
                    style={{ width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: 'var(--color-error-700)', cursor: 'pointer' }}
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </div>
              ) : (
                <div key={cost.key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--text-sm)' }}>
                  <span>
                    {t(`cost${cost.costType}`)}
                    {cost.comment && <span style={{ color: 'var(--color-text-secondary)' }}> · {cost.comment}</span>}
                  </span>
                  <span className="tabular-nums">{formatCurrency(parseDecimal(cost.amount) ?? 0, locale, 'UZS')}</span>
                </div>
              ),
            )}
            {running && props.canEdit && (
              <div>
                <Button type="button" variant="outline" size="sm" onClick={() => setCosts((rows) => [...rows, { key: ++costKey, costType: 'SALARY', amount: '', comment: '' }])}>
                  <Plus size={14} aria-hidden /> {t('xarajatQoshish')}
                </Button>
              </div>
            )}
          </section>

          {running && (
            <div style={{ maxWidth: 320 }}>
              <label htmlFor="produced-qty" style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                {t('haqiqiyChiqqanMiqdor')} *
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <DecimalInput id="produced-qty" value={produced} invalid={!(producedValue > 0)} onValueChange={setProduced} />
                <span style={{ color: 'var(--color-text-secondary)' }}>{productUnit}</span>
              </div>
              {!(producedValue > 0) && (
                <div role="alert" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error-700)', marginTop: 4 }}>
                  {t('n0DanKattaBolishiKerak')}
                </div>
              )}
            </div>
          )}

          {!isOpenStatus(doc.status) && (
            <div aria-live="polite" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 12, padding: 16, borderRadius: 'var(--radius-md)', background: doc.status === 'COMPLETED' ? 'var(--color-success-50)' : 'var(--color-bg-tertiary)' }}>
              <Total label={t('xomashyoFifo')} value={formatCurrency(Number(doc.actualMaterialCost), locale, 'UZS')} />
              <Total label={t('qoshimchaXarajatlar')} value={formatCurrency(running ? extraTotal : Number(doc.extraCost), locale, 'UZS')} />
              <Total label={t('umumiyTannarx')} value={formatCurrency(running ? roundMoney(Number(doc.actualMaterialCost) + extraTotal) : Number(doc.totalCost), locale, 'UZS')} strong />
              <Total
                label={t('n1Tannarxi2', { productUnit })}
                value={doc.status === 'COMPLETED' ? formatUnitCost(Number(doc.unitCost), locale, 'UZS') : totals ? formatUnitCost(roundMoney((Number(doc.actualMaterialCost) + extraTotal) / Math.max(producedValue, 1e-9)), locale, 'UZS') : '—'}
                strong
              />
              {doc.status === 'COMPLETED' && (
                <Total label={t('omborgaKirdi')} value={`${formatQuantity(Number(doc.producedQuantity))} ${productUnit}`} />
              )}
            </div>
          )}
        </div>
      </Modal>

      {cancelOpen && (
        <Modal
          isOpen
          size="sm"
          title={t('hujjatniBekorQilish')}
          onClose={() => setCancelOpen(false)}
          footer={
            <>
              <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={busy}>
                {t('orqaga')}
              </Button>
              <Button
                variant="danger"
                disabled={busy || !reason.trim()}
                onClick={() => {
                  setCancelOpen(false);
                  void cancelDocument();
                }}
              >
                <XCircle size={15} aria-hidden /> {t('bekorQilish2')}
              </Button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div role="note" style={{ display: 'flex', gap: 8, padding: '10px 12px', borderRadius: 'var(--radius-md)', background: 'var(--color-warning-50)', color: 'var(--color-warning-700)', fontSize: 'var(--text-sm)' }}>
              <AlertTriangle size={16} aria-hidden style={{ flexShrink: 0 }} />
              {doc.status === 'COMPLETED'
                ? t('bekorQilinsaXomashyoOmborgaQaytariladi')
                : isRunningStatus(doc.status)
                  ? t('bekorQilinsaXomashyoOmborgaQaytariladi2')
                  : t('qoralamaBekorQilinadiOmborgaTasiri')}
            </div>
            <div>
              <label htmlFor="cancel-reason" style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                {t('sabab')} *
              </label>
              <textarea
                id="cancel-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                aria-required="true"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}
              />
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ padding: 12, border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-md)' }}>
      <dt style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)', marginBottom: 4 }}>{label}</dt>
      <dd style={{ margin: 0, color: 'var(--color-text-primary)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>{value}</dd>
    </div>
  );
}

function Total({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{label}</div>
      <div className="tabular-nums" style={{ fontWeight: strong ? 700 : 600, fontSize: strong ? 'var(--text-lg)' : 'var(--text-base)', textAlign: 'right' }}>
        {value}
      </div>
    </div>
  );
}
