'use client';

import { DecimalInput } from '@/components/ui/DecimalInput';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Plus, Save, Trash2, Factory } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { errorMessage, formatCurrency, formatQuantity } from '@/lib/utils';
import { unitLabel } from '@/lib/units';
import { parseDecimal, roundMoney } from '@/lib/production-recipe';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select, type SelectOption } from '@/components/ui/Select';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { DatePicker } from '@/components/ui/DatePicker';
import { DateRangeField } from '@/components/ui/DateRangeField';
import { COST_TYPES, localName, type CostType, type Locale, type ProductionDocument, type Recipe } from './types';
import { thStyle } from './TableParts';
import { localIsoDate } from '@/lib/date-range';

interface PreviewMaterial {
  productId: string;
  plannedQuantity: number;
  freeQuantity: number;
  shortage: number;
  estimatedTotalCost: number;
  hasPrice: boolean;
  lossPercent: number;
  product: { name: unknown; unitOfMeasure: string };
}
interface Preview {
  plannedMaterialCost: number;
  materials: PreviewMaterial[];
}
interface CostRow {
  key: number;
  costType: CostType;
  amount: string;
  comment: string;
}
let costKey = 0;

export interface ProductionDocumentFormModalProps {
  locale: Locale;
  /** A draft to edit; null creates one. */
  document: ProductionDocument | null;
  /** Recipe preselected ("Ishlab chiqarish hujjati yaratish" from a recipe). */
  initialRecipeId?: string;
  recipes: Recipe[];
  warehouseOptions: SelectOption[];
  staffOptions: SelectOption[];
  defaultResponsibleId?: string;
  onClose: () => void;
  onSaved: (document: ProductionDocument, message: string) => void | Promise<void>;
}

const today = () => localIsoDate(new Date());
const isoDate = (value?: string | null) => (value ? value.slice(0, 10) : '');

/** «+ Ishlab chiqarish hujjati» (TZ "Ishlab chiqarish" 5.1). */
export function ProductionDocumentFormModal(props: ProductionDocumentFormModalProps) {
  const { locale, document: doc, recipes } = props;
  const t = useTranslations('production');
  const { token, company } = useAuth();

  const activeRecipes = useMemo(() => recipes.filter((r) => r.isActive && !r.isArchived), [recipes]);
  const initialRecipe = doc ? recipes.find((r) => r.id === doc.recipeId) : activeRecipes.find((r) => r.id === props.initialRecipeId);
  const [productId, setProductId] = useState(doc?.product.id ?? initialRecipe?.productId ?? '');
  const [recipeId, setRecipeId] = useState(doc?.recipeId ?? initialRecipe?.id ?? '');
  const [quantity, setQuantity] = useState(doc ? String(Number(doc.plannedQuantity)) : '');
  const [docDate, setDocDate] = useState(isoDate(doc?.docDate) || today());
  const [warehouseId, setWarehouseId] = useState(doc?.warehouseId ?? props.warehouseOptions[0]?.value ?? '');
  const [outputWarehouseId, setOutputWarehouseId] = useState(doc?.outputWarehouseId ?? '');
  const [responsibleId, setResponsibleId] = useState(doc?.responsibleId ?? props.defaultResponsibleId ?? '');
  const [startDate, setStartDate] = useState(isoDate(doc?.plannedStartDate));
  const [endDate, setEndDate] = useState(isoDate(doc?.plannedEndDate));
  const [note, setNote] = useState(doc?.note ?? '');
  const [costs, setCosts] = useState<CostRow[]>(() =>
    (doc?.extraCosts ?? []).map((c) => ({ key: ++costKey, costType: c.costType, amount: String(Number(c.amount)), comment: c.comment ?? '' })),
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  // Products that have an active recipe, then that product's active recipes (TZ 4.5).
  const productOptions: SelectOption[] = useMemo(() => {
    const seen = new Map<string, Recipe>();
    for (const r of activeRecipes) if (!seen.has(r.productId)) seen.set(r.productId, r);
    return [...seen.values()].map((r) => ({ value: r.productId, label: localName(r.product.name, locale), description: r.product.sku ?? undefined }));
  }, [activeRecipes, locale]);
  const productRecipes = activeRecipes.filter((r) => r.productId === productId);
  const recipe = recipes.find((r) => r.id === recipeId);
  const productUnit = unitLabel(recipe?.product.unitOfMeasure, locale);

  useEffect(() => {
    if (!token || !company || !recipeId || !warehouseId || !(parseDecimal(quantity)! > 0)) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ quantity: String(parseDecimal(quantity)), warehouseId });
      apiFetch<Preview>(`/production/recipes/${recipeId}/preview?${query.toString()}`, { token, tenantId: company.id, locale })
        .then((result) => {
          setPreview(result);
          setPreviewError('');
        })
        .catch((error: unknown) => {
          setPreview(null);
          setPreviewError(errorMessage(error) || t('xomashyoHisobiniOlibBolmadi'));
        })
        .finally(() => setPreviewLoading(false));
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId, warehouseId, quantity, token, company, locale]);

  const extraTotal = roundMoney(costs.reduce((sum, c) => sum + (parseDecimal(c.amount) ?? 0), 0));
  const planned = parseDecimal(quantity) ?? 0;
  const estimatedTotal = roundMoney((preview?.plannedMaterialCost ?? 0) + extraTotal);
  const shortages = preview?.materials.filter((m) => m.shortage > 0) ?? [];

  const validate = () => {
    const next: Record<string, string> = {};
    if (!productId) next.product = t('mahsulotniTanlang');
    if (!recipeId) next.recipe = t('retsepturaniTanlang');
    if (!(planned > 0)) next.quantity = t('miqdor0DanKattaBolsin');
    if (!warehouseId) next.warehouse = t('xomashyoOmboriniTanlang');
    if (!docDate) next.date = t('sananiKiriting');
    if (startDate && endDate && endDate < startDate) next.dates = t('tugashSanasiBoshlanishdanOldinBolishi');
    costs.forEach((c) => {
      if (!(parseDecimal(c.amount)! > 0)) next[`cost-${c.key}`] = t('summaniKiriting');
    });
    return next;
  };

  const submit = async () => {
    if (busy || !token || !company) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      setFormError(t('belgilanganMaydonlarniToldiring'));
      window.setTimeout(() => document.querySelector<HTMLElement>('[data-doc-form] [aria-invalid="true"], [data-doc-form] [data-invalid="true"] button')?.focus(), 0);
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      const body = {
        recipeId,
        plannedQuantity: planned,
        warehouseId,
        outputWarehouseId: outputWarehouseId || (doc ? null : undefined),
        responsibleId: responsibleId || (doc ? null : undefined),
        docDate,
        plannedStartDate: startDate || (doc ? null : undefined),
        plannedEndDate: endDate || (doc ? null : undefined),
        note: note.trim() || (doc ? null : undefined),
        extraCosts: costs.map((c) => ({ costType: c.costType, amount: parseDecimal(c.amount), comment: c.comment.trim() || undefined })),
      };
      const saved = await apiFetch<ProductionDocument & { stockWarnings?: unknown[] }>(doc ? `/production/documents/${doc.id}` : '/production/documents', {
        method: doc ? 'PUT' : 'POST',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify(body),
      });
      await props.onSaved(saved, doc ? t('hujjatSaqlandi') : t('ishlabChiqarishHujjatiQoralamasiYaratildi'));
    } catch (error) {
      setFormError(errorMessage(error) || t('hujjatniSaqlabBolmadi'));
    } finally {
      setBusy(false);
    }
  };

  // Asking before losing typed input is the dialog's job (backdrop, Esc, ✕ and Cancel all go through it).
  const requestClose = () => {
    if (busy) return;
    props.onClose();
  };

  const label = (text: string, htmlFor?: string) => (
    <label htmlFor={htmlFor} style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
      {text}
    </label>
  );
  const err = (key: string) =>
    errors[key] ? (
      <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--color-error-700)', marginTop: 4 }}>
        <AlertTriangle size={12} aria-hidden /> {errors[key]}
      </div>
    ) : null;

  return (
    <Modal icon={<Factory size={20} />} description={t('docDialogDesc')}
      isOpen
      onClose={() => requestClose()}
      onSubmitShortcut={() => void submit()}
      title={doc ? `${doc.docNumber} · ${t('tahrirlash2')}` : t('yangiIshlabChiqarishHujjati')}
      size="xl"
      footer={
        <>
          <Button data-dialog-cancel type="button" variant="outline" onClick={() => requestClose()} disabled={busy}>
            {t('bekorQilish')}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={busy} aria-busy={busy}>
            <Save size={15} aria-hidden /> {busy ? t('saqlanmoqda') : doc ? t('saqlash') : t('qoralamaYaratish')}
          </Button>
        </>
      }
    >
      <form
        data-doc-form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        {formError && (
          <div role="alert" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', color: 'var(--color-error-700)', background: 'var(--color-error-50)', border: '1px solid var(--color-error-100)' }}>
            <AlertTriangle size={16} aria-hidden /> {formError}
          </div>
        )}
        <h3 className="dlg-section" style={{ margin: 0, padding: 0, borderTop: 'none' }}>{t('docSectionWhat')}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12, alignItems: 'start' }}>
          <div data-invalid={Boolean(errors.product)}>
            <Select
              label={`${t('mahsulot')} *`}
              searchable
              options={productOptions}
              value={productId}
              onChange={(value) => {
                setProductId(value);
                const own = activeRecipes.filter((r) => r.productId === value);
                setRecipeId(own.length === 1 ? own[0].id : '');
              }}
              placeholder={t('mahsulotniTanlang')}
              noOptionsText={t('faolRetsepturasiBorMahsulotYoq')}
              error={errors.product || undefined}
            />
          </div>
          <div data-invalid={Boolean(errors.recipe)}>
            <Select
              label={`${t('retseptura')} *`}
              options={productRecipes.map((r, i) => ({
                value: r.id,
                label: `${t('retseptura')} ${i + 1}: ${formatQuantity(Number(r.outputQuantity))} ${unitLabel(r.product.unitOfMeasure, locale)} · ${r.items.length} ${t('xomashyo2')}`,
                description: r.note ?? undefined,
              }))}
              value={recipeId}
              onChange={(value) => {
                setRecipeId(value);
              }}
              disabled={!productId}
              placeholder={t('faolRetsepturaniTanlang')}
              error={errors.recipe || undefined}
            />
          </div>
          <div>
            {label(`${t('rejaBoyichaMiqdor')} *`, 'doc-qty')}
            <div style={{ position: 'relative' }}>
              <DecimalInput id="doc-qty" value={quantity} invalid={Boolean(errors.quantity)} onValueChange={setQuantity} style={{ paddingRight: recipe ? 64 : undefined }} />
              {recipe && (
                <span aria-hidden style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', pointerEvents: 'none' }}>
                  {productUnit}
                </span>
              )}
            </div>
            {err('quantity')}
          </div>
        </div>
        <h3 className="dlg-section" style={{ margin: 0 }}>{t('docSectionWhereWhen')}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12, alignItems: 'start' }}>
          <div>
            <DatePicker label={`${t('sana')} *`} value={docDate} onChange={(value) => setDocDate(value)} error={errors.date || undefined} />
          </div>
          <div data-invalid={Boolean(errors.warehouse)}>
            <Select label={`${t('xomashyoOmbori')} *`} options={props.warehouseOptions} value={warehouseId} onChange={(value) => setWarehouseId(value)} error={errors.warehouse || undefined} />
          </div>
          <div>
            <Select
              label={t('tayyorMahsulotOmbori')}
              options={[{ value: '', label: t('xomashyoOmboriBilanBirXil') }, ...props.warehouseOptions]}
              value={outputWarehouseId}
              onChange={(value) => setOutputWarehouseId(value)}
            />
          </div>
          <div>
            <Select
              label={t('masul')}
              searchable
              options={[{ value: '', label: t('tanlanmagan') }, ...props.staffOptions]}
              value={responsibleId}
              onChange={(value) => setResponsibleId(value)}
            />
          </div>
          <div>
            <DateRangeField
              label={t('boshlanishTugashSanasi')}
              from={startDate}
              to={endDate}
              onChange={(from, to) => {
                setStartDate(from);
                setEndDate(to);
              }}
              locale={locale}
            />
            {err('dates')}
          </div>
        </div>

        {/* Materials preview: plan, stock and the estimate. */}
        <section aria-label={t('xomashyoHisobi')} style={{ border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <div style={{ padding: '10px 16px', background: 'var(--color-bg-tertiary)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 'var(--text-sm)' }}>{t('xomashyoSarfiReja')}</strong>
            {preview && (
              <span style={{ fontSize: 'var(--text-sm)' }}>
                {t('xomashyoTaxminiy')}: <b className="tabular-nums">{formatCurrency(preview.plannedMaterialCost, locale, 'UZS')}</b>
              </span>
            )}
          </div>
          {!recipeId || !(planned > 0) ? (
            <div style={{ padding: 16, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              {t('retsepturaVaMiqdorTanlangandaXomashyo')}
            </div>
          ) : previewLoading && !preview ? (
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }} aria-busy="true">
              <span className="prod-skeleton" style={{ width: '80%' }} />
              <span className="prod-skeleton" style={{ width: '60%' }} />
            </div>
          ) : preview ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)', minWidth: 600 }}>
                <thead>
                  <tr>
                    <th scope="col" style={thStyle}>{t('xomashyo')}</th>
                    <th scope="col" style={{ ...thStyle, textAlign: 'right' }}>{t('kerak')}</th>
                    <th scope="col" style={{ ...thStyle, textAlign: 'right' }}>{t('mavjud')}</th>
                    <th scope="col" style={{ ...thStyle, textAlign: 'right' }}>{t('taxminiySumma')}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.materials.map((m) => (
                    <tr key={m.productId} style={{ borderTop: '1px solid var(--color-border-light)' }}>
                      <td style={{ padding: '10px 16px' }}>
                        {localName(m.product.name, locale)}
                        {m.lossPercent > 0 && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--color-text-secondary)' }}>({t('yoqotish3')} {formatQuantity(m.lossPercent)} %)</span>}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }} className="tabular-nums">
                        {formatQuantity(m.plannedQuantity)} {unitLabel(m.product.unitOfMeasure, locale)}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }} className="tabular-nums">
                        {formatQuantity(m.freeQuantity)}{' '}
                        {m.shortage > 0 && <Badge variant="error">⚠ {t('yetishmaydi')}: {formatQuantity(m.shortage)}</Badge>}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right' }} className="tabular-nums">
                        {formatCurrency(m.estimatedTotalCost, locale, 'UZS')}
                        {!m.hasPrice && <AlertTriangle size={13} aria-label={t('narxYoq')} style={{ marginLeft: 4, color: 'var(--color-warning-700)' }} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            previewError && <div role="alert" style={{ padding: 16, color: 'var(--color-error-700)', fontSize: 'var(--text-sm)' }}>{previewError}</div>
          )}
          {shortages.length > 0 && (
            <div role="status" style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '10px 16px', background: 'var(--color-warning-50)', color: 'var(--color-warning-700)', fontSize: 'var(--text-xs)' }}>
              <AlertTriangle size={14} aria-hidden />
              {t('qoralamaSaqlanadiLekinQoldiqYetmasa')}
            </div>
          )}
        </section>

        {/* Extra costs (TZ 5.1): type and amount in UZS. */}
        <section aria-label={t('qoshimchaXarajatlar')} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <strong style={{ fontSize: 'var(--text-sm)' }}>{t('qoshimchaXarajatlarUzs')}</strong>
          {costs.map((cost, i) => (
            <div key={cost.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(min(100%, 140px), 1fr) minmax(min(100%, 140px), 1fr) minmax(160px, 2fr) 40px', gap: 8, alignItems: 'start' }}>
              <Select
                aria-label={`${t('xarajatTuri')} ${i + 1}`}
                options={COST_TYPES.map((type) => ({ value: type, label: t(`cost${type}`) }))}
                value={cost.costType}
                onChange={(value) => {
                  setCosts((rows) => rows.map((r) => (r.key === cost.key ? { ...r, costType: value as CostType } : r)));
                }}
              />
              <MoneyInput
                aria-label={`${t('summa')} ${i + 1}`}
                value={cost.amount}
                onValueChange={(value) => setCosts((rows) => rows.map((r) => (r.key === cost.key ? { ...r, amount: value } : r)))}
                error={errors[`cost-${cost.key}`] || undefined}
              />
              <input
                aria-label={`${t('izoh')} ${i + 1}`}
                placeholder={t('izoh')}
                value={cost.comment}
                onChange={(e) => setCosts((rows) => rows.map((r) => (r.key === cost.key ? { ...r, comment: e.target.value } : r)))}
                style={{ width: '100%', minHeight: 40, padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}
              />
              <button
                type="button"
                aria-label={`${t('xarajatniOchirish')} ${i + 1}`}
                title={t('xarajatniOchirish')}
                onClick={() => {
                  setCosts((rows) => rows.filter((r) => r.key !== cost.key));
                }}
                style={{ width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', color: 'var(--color-error-700)', cursor: 'pointer' }}
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </div>
          ))}
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setCosts((rows) => [...rows, { key: ++costKey, costType: 'SALARY', amount: '', comment: '' }]);
              }}
            >
              <Plus size={14} aria-hidden /> {t('xarajatQoshish')}
            </Button>
          </div>
        </section>

        <div aria-live="polite" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 12, padding: 16, borderRadius: 'var(--radius-md)', background: 'var(--color-bg-tertiary)' }}>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{t('qoshimchaXarajatlar')}</div>
            <div className="tabular-nums" style={{ fontWeight: 600, textAlign: 'right' }}>{formatCurrency(extraTotal, locale, 'UZS')}</div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{t('umumiyTannarxTaxminiy')}</div>
            <div className="tabular-nums" style={{ fontWeight: 700, textAlign: 'right' }}>{formatCurrency(estimatedTotal, locale, 'UZS')}</div>
          </div>
          <div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{t('n1TannarxiTaxminiy', { productUnit })}</div>
            <div className="tabular-nums" style={{ fontWeight: 700, textAlign: 'right', color: 'var(--color-primary-700)' }}>
              {formatCurrency(planned > 0 ? roundMoney(estimatedTotal / planned) : 0, locale, 'UZS')}
            </div>
          </div>
        </div>

        <div>
          {label(t('izoh'), 'doc-note')}
          <textarea
            id="doc-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', resize: 'vertical' }}
          />
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
          {t('qoralamaOmborgaTasirQilmaydiXomashyo')}
        </div>
      </form>
    </Modal>
  );
}
