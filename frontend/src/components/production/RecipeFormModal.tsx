'use client';

import { DecimalInput } from '@/components/ui/DecimalInput';
import { useTranslations } from 'next-intl';
import { useMemo, useRef, useState } from 'react';
import { AlertTriangle, Calculator, Info, Plus, Save, Trash2, ListChecks } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { errorMessage, formatCurrency, formatQuantity } from '@/lib/utils';
import { unitLabel } from '@/lib/units';
import { semiFinishedLabel } from '@/lib/product-types';
import {
  estimateRecipeForm,
  materialUnitOptions,
  MAX_LOSS_PERCENT,
  parseDecimal,
  type MaterialCard,
  type RecipeFormLine,
} from '@/lib/production-recipe';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Select, SelectOption } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { CreateProductDrawer } from '@/components/products/CreateProductDrawer';

type Locale = 'uz' | 'ru';

/** A finished product ("Tayyor mahsulot") a recipe can make. */
export interface RecipeProduct {
  id: string;
  name: unknown;
  type: string;
  unitOfMeasure: string;
  sku?: string | null;
  isSemiFinished?: boolean;
  costPrice?: number | string | null;
  costPriceCurrency?: string | null;
  costPriceExchangeRate?: number | string | null;
  costSource?: string | null;
  totalStock?: number | string | null;
}

export interface EditableRecipe {
  id: string;
  productId: string;
  outputQuantity: number | string;
  note?: string | null;
  isActive?: boolean;
  items: Array<{ productId: string; quantity: number | string; unit?: string | null; lossPercent?: number | string | null }>;
}

interface MaterialRow extends RecipeFormLine {
  key: number;
}

export interface RecipeFormModalProps {
  isOpen: boolean;
  /** Recipe to edit; null creates a new one. */
  recipe: EditableRecipe | null;
  /** Finished products (type FINISHED_PRODUCT). */
  products: RecipeProduct[];
  /** Raw materials and semi-finished products (GET /production/materials). */
  materials: MaterialCard[];
  /** Active recipes, to warn about a second recipe for the same product. */
  existingRecipes: Array<{ id: string; productId: string; isActive?: boolean }>;
  locale: Locale;
  onClose: () => void;
  onSaved: (recipeId: string, message: string) => void | Promise<void>;
  /** A product or material was created here: the parent reloads its lists. */
  onProductsChanged: () => void | Promise<void>;
}

let rowKey = 0;
const newRow = (productId = '', quantity = '', unit = '', lossPercent = ''): MaterialRow => ({ key: ++rowKey, productId, quantity, unit, lossPercent });

export function localName(value: unknown, locale: Locale): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const localized = value as Record<string, unknown>;
  return String(localized[locale] ?? localized.uz ?? localized.ru ?? '');
}

type FieldErrors = Record<string, string>;

export function RecipeFormModal({
  isOpen,
  recipe,
  products,
  materials,
  existingRecipes,
  locale,
  onClose,
  onSaved,
  onProductsChanged,
}: RecipeFormModalProps) {
  const t = useTranslations('production');
  const { token, company } = useAuth();
  const formRef = useRef<HTMLFormElement>(null);

  // The parent mounts this form when it opens (keyed by recipe), so the
  // initial values come straight from the recipe; list reloads never reset typing.
  const [productId, setProductId] = useState(recipe?.productId ?? '');
  const [outputQuantity, setOutputQuantity] = useState(recipe ? String(Number(recipe.outputQuantity)) : '1');
  const [note, setNote] = useState(recipe?.note ?? '');
  const [isActive, setIsActive] = useState(recipe?.isActive ?? true);
  const [rows, setRows] = useState<MaterialRow[]>(() =>
    recipe?.items.length
      ? recipe.items.map((item) => newRow(item.productId, String(Number(item.quantity)), item.unit ?? '', Number(item.lossPercent ?? 0) ? String(Number(item.lossPercent)) : ''))
      : [newRow()],
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  // Created here before the parent's lists reload.
  const [createdProducts, setCreatedProducts] = useState<RecipeProduct[]>([]);
  const [createdMaterials, setCreatedMaterials] = useState<MaterialCard[]>([]);
  const [quickCreate, setQuickCreate] = useState<{ kind: 'FINISHED_PRODUCT'; name: string } | { kind: 'RAW_MATERIAL'; rowKey: number; name: string } | null>(null);

  const allProducts = useMemo(() => mergeById(products, createdProducts), [products, createdProducts]);
  const allMaterials = useMemo(() => mergeById(materials, createdMaterials), [materials, createdMaterials]);
  const materialById = useMemo(() => new Map(allMaterials.map((m) => [m.id, m])), [allMaterials]);
  const finished = allProducts.find((p) => p.id === productId);
  const finishedUnit = unitLabel(finished?.unitOfMeasure, locale);
  const normUnitText = finished ? finishedUnit : t('birlik2');

  // TZ 4.4: recalculated on every change, without a reload.
  const estimate = estimateRecipeForm(rows, materialById, outputQuantity);
  const otherRecipe = existingRecipes.find((r) => r.productId === productId && r.id !== recipe?.id && r.isActive !== false);
  const duplicateIds = new Set(rows.map((r) => r.productId).filter((id, i, all) => id && all.indexOf(id) !== i));

  const money = (value: number | null) => formatCurrency(value ?? 0, locale, 'UZS');

  const productOptions: SelectOption[] = allProducts
    .filter((p) => p.id !== undefined)
    .map((p) => ({
      value: p.id,
      label: localName(p.name, locale),
      description: [p.sku, unitLabel(p.unitOfMeasure, locale)].filter(Boolean).join(' · '),
    }));
  const materialOptions = (currentRowKey: number): SelectOption[] => {
    const takenElsewhere = new Set(rows.filter((r) => r.key !== currentRowKey).map((r) => r.productId));
    return allMaterials
      .filter((m) => !takenElsewhere.has(m.id) && m.id !== productId)
      .map((m) => {
        const stock = Number(m.stock_qty ?? 0);
        return {
          value: m.id,
          label: `${localName(m.name, locale)}${m.isSemiFinished ? ` · ${semiFinishedLabel(locale)}` : ''}`,
          description: `${unitLabel(m.unitOfMeasure, locale)} · ${t('qoldiq')}: ${formatQuantity(stock)}${stock <= 0 ? ` (${t('ombordaYoq')})` : ''}`,
        };
      });
  };

  const updateRow = (key: number, patch: Partial<MaterialRow>) => {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const handleCreated = async (id: string) => {
    const target = quickCreate;
    setQuickCreate(null);
    if (!target || !token || !company) return;
    try {
      const product = await apiFetch<RecipeProduct & MaterialCard>(`/inventory/products/${id}`, { token, tenantId: company.id, locale });
      if (target.kind === 'FINISHED_PRODUCT') {
        setCreatedProducts((current) => mergeById(current, [product]));
        setProductId(product.id);
      } else {
        setCreatedMaterials((current) => mergeById(current, [{ ...product, stock_qty: 0 }]));
        updateRow(target.rowKey, { productId: product.id, unit: '' });
      }
      await onProductsChanged();
    } catch (e) {
      setFormError(errorMessage(e) || t('yaratilganMahsulotniYuklabBolmadi'));
    }
  };

  const validate = (): FieldErrors => {
    const next: FieldErrors = {};
    if (!productId) next.product = t('tayyorMahsulotniTanlang');
    if (!(parseDecimal(outputQuantity)! > 0)) next.output = t('ishlabChiqarishNormasi0Dan');
    rows.forEach((row, i) => {
      const material = materialById.get(row.productId);
      if (!row.productId) next[`material-${row.key}`] = t('xomashyoniTanlang');
      else if (!material?.unitOfMeasure) next[`material-${row.key}`] = t('xomashyoUchunOlchovBirligiKorsatilmagan');
      if (duplicateIds.has(row.productId) && rows.findIndex((r) => r.productId === row.productId) !== i) {
        next[`material-${row.key}`] = t('buXomashyoAllaqachonQoshilgan');
      }
      const quantity = parseDecimal(row.quantity);
      if (!(quantity! > 0)) next[`quantity-${row.key}`] = t('miqdor0DanKattaBolsin');
      const loss = row.lossPercent.trim() === '' ? 0 : parseDecimal(row.lossPercent);
      if (loss === null || loss < 0 || loss > MAX_LOSS_PERCENT) next[`loss-${row.key}`] = t('n09999');
      if (material && estimate.info[i].factor === null) next[`unit-${row.key}`] = t('birlikniTanlang');
    });
    return next;
  };

  const submit = async () => {
    if (busy || !token || !company) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      setFormError(t('formadaTaXatoBorBelgilangan', { v0: Object.keys(found).length }));
      // TZ 11.4: focus the first invalid field.
      window.setTimeout(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"] button, [data-invalid="true"] input')?.focus(), 0);
      return;
    }
    setBusy(true);
    setFormError('');
    try {
      const saved = await apiFetch<{ id: string }>(recipe ? `/production/recipes/${recipe.id}` : '/production/recipes', {
        method: recipe ? 'PUT' : 'POST',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          productId,
          outputQuantity: parseDecimal(outputQuantity),
          note: note.trim() || undefined,
          isActive,
          materials: rows.map((row) => {
            const material = materialById.get(row.productId);
            return {
              productId: row.productId,
              quantity: parseDecimal(row.quantity),
              unit: row.unit && row.unit !== material?.unitOfMeasure ? row.unit : undefined,
              lossPercent: row.lossPercent.trim() === '' ? 0 : parseDecimal(row.lossPercent),
            };
          }),
        }),
      });
      await onSaved(saved.id, recipe ? t('retsepturaYangilandi') : t('retsepturaSaqlandi'));
    } catch (e) {
      setFormError(errorMessage(e) || t('retsepturaniSaqlabBolmadi'));
    } finally {
      setBusy(false);
    }
  };

  // Asking before losing typed input is the dialog's job (backdrop, Esc, ✕ and Cancel all go through it).
  const requestClose = () => {
    if (busy) return;
    onClose();
  };

  const th: React.CSSProperties = { padding: '10px 12px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textAlign: 'left', whiteSpace: 'nowrap', background: 'var(--color-bg-tertiary)' };
  const td: React.CSSProperties = { padding: '6px 12px', verticalAlign: 'top', minHeight: 48 };
  const fieldError = (key: string) =>
    errors[key] ? (
      <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--color-error-700)', marginTop: 4 }}>
        <AlertTriangle size={12} aria-hidden /> {errors[key]}
      </div>
    ) : null;
  const inputStyle = (invalid: boolean): React.CSSProperties => ({
    width: '100%',
    minHeight: 40,
    padding: '8px 10px',
    borderRadius: 'var(--radius-md)',
    border: `1px solid ${invalid ? 'var(--color-error-500)' : 'var(--color-border)'}`,
    background: 'var(--color-bg-primary)',
    color: 'var(--color-text-primary)',
    fontSize: 'var(--text-sm)',
    textAlign: 'right',
  });

  return (
    <>
      <Modal icon={<ListChecks size={20} />} description={t('recipeDialogDesc')}
        isOpen={isOpen}
        onClose={() => requestClose()}
        onSubmitShortcut={() => void submit()}
        title={recipe ? t('retsepturaniTahrirlash') : t('yangiRetseptura')}
        size="2xl"
        footer={
          <>
            <Button data-dialog-cancel type="button" variant="outline" onClick={() => requestClose()} disabled={busy}>
              {t('bekorQilish')}
            </Button>
            <Button type="button" onClick={() => void submit()} disabled={busy} aria-busy={busy}>
              <Save size={15} aria-hidden /> {busy ? t('saqlanmoqda') : t('saqlash')}
            </Button>
          </>
        }
      >
        <form
          ref={formRef}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
          noValidate
        >
          {formError && (
            <div role="alert" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', color: 'var(--color-error-700)', background: 'var(--color-error-50)', border: '1px solid var(--color-error-100)' }}>
              <AlertTriangle size={16} aria-hidden /> {formError}
            </div>
          )}

          {/* 1. Finished product and output quantity */}
          <section aria-labelledby="recipe-sec-product" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 id="recipe-sec-product" className="dlg-section" style={{ margin: 0, padding: 0, borderTop: 'none' }}>{t('recipeSectionProduct')}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 12, alignItems: 'start' }}>
              <div data-invalid={Boolean(errors.product)} style={{ gridColumn: 'span 2' }}>
                <Select
                  label={`${t('tayyorMahsulot')} *`}
                  options={productOptions}
                  value={productId}
                  onChange={(value) => {
                    setProductId(value);
                    setErrors((e) => ({ ...e, product: '' }));
                  }}
                  searchable
                  placeholder={t('mahsulotniTanlangYokiYarating')}
                  onCreateNew={(query) => setQuickCreate({ kind: 'FINISHED_PRODUCT', name: query ?? '' })}
                  createNewLabel={t('yangiMahsulotQoshish')}
                  noOptionsText={t('natijaTopilmadi')}
                  error={errors.product || undefined}
                />
              </div>
              <div>
                <label htmlFor="recipe-output" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
                  {t('chiqadiganMiqdor')} *
                </label>
                <div style={{ position: 'relative' }}>
                  <DecimalInput
                    id="recipe-output"
                    value={outputQuantity}
                    invalid={Boolean(errors.output)}
                    aria-describedby="recipe-output-hint"
                    onValueChange={(value) => setOutputQuantity(value)}
                    onBlur={() => setErrors((e) => ({ ...e, output: parseDecimal(outputQuantity)! > 0 ? '' : t('ishlabChiqarishNormasi0Dan') }))}
                    style={{ ...inputStyle(Boolean(errors.output)), paddingRight: 64 }}
                  />
                  <span aria-hidden style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', pointerEvents: 'none' }}>
                    {normUnitText}
                  </span>
                </div>
                {fieldError('output') ?? (
                  <div id="recipe-output-hint" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 4 }}>
                    {t('outputHint')}
                  </div>
                )}
              </div>
            </div>
            {otherRecipe && (
              <div role="status" style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', borderRadius: 'var(--radius-md)', background: 'var(--color-warning-50)', fontSize: 'var(--text-sm)', color: 'var(--color-warning-700)' }}>
                <Info size={16} aria-hidden />
                {t('buMahsulotdaBoshqaFaolRetseptura')}
              </div>
            )}
          </section>

          {/* 2. Raw materials: quantity, unit, loss, cost */}
          <section aria-labelledby="recipe-sec-materials" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 id="recipe-sec-materials" className="dlg-section" style={{ margin: 0 }}>
            {t('recipeSectionMaterials')}
            {rows.some((r) => r.productId) && (
              <span style={{ marginLeft: 6, color: 'var(--color-text-secondary)', fontWeight: 'var(--font-normal)' }}>{rows.filter((r) => r.productId).length}</span>
            )}
          </h3>
          <div style={{ border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)', minWidth: 900 }}>
                <thead>
                  <tr>
                    <th scope="col" style={{ ...th, width: 36 }}>№</th>
                    <th scope="col" style={{ ...th, minWidth: 240 }}>{t('xomashyo')} *</th>
                    <th scope="col" style={{ ...th, width: 120, textAlign: 'right' }}>{t('miqdor')} *</th>
                    <th scope="col" style={{ ...th, width: 120 }}>{t('tovarBirligi')}</th>
                    <th scope="col" style={{ ...th, width: 100, textAlign: 'right' }}>{t('yoqotish2')}</th>
                    <th scope="col" style={{ ...th, width: 150, textAlign: 'right' }}>{t('birlikTannarxi2')}</th>
                    <th scope="col" style={{ ...th, width: 140, textAlign: 'right' }}>{t('summa')}</th>
                    <th scope="col" style={{ ...th, width: 48 }}><span className="sr-only">{t('amallar')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const material = materialById.get(row.productId);
                    const units = materialUnitOptions(material);
                    const entryUnit = row.unit || material?.unitOfMeasure || '';
                    const info = estimate.info[i];
                    const line = estimate.lines[i];
                    const noPrice = Boolean(material) && !info.hasPrice;
                    return (
                      <tr key={row.key} style={{ borderTop: '1px solid var(--color-border-light)' }}>
                        <td style={{ ...td, color: 'var(--color-text-secondary)', paddingTop: 16 }}>{i + 1}</td>
                        <td style={td} data-invalid={Boolean(errors[`material-${row.key}`])}>
                          <Select
                            aria-label={`${t('xomashyo')} ${i + 1}`}
                            options={materialOptions(row.key)}
                            value={row.productId}
                            searchable
                            placeholder={t('xomashyoniTanlang')}
                            noOptionsText={t('natijaTopilmadi')}
                            onChange={(value) => {
                              updateRow(row.key, { productId: value, unit: '' });
                              setErrors((e) => ({ ...e, [`material-${row.key}`]: '' }));
                            }}
                            onCreateNew={(query) => setQuickCreate({ kind: 'RAW_MATERIAL', rowKey: row.key, name: query ?? '' })}
                            createNewLabel={t('yangiXomashyoQoshish')}
                            error={errors[`material-${row.key}`] || undefined}
                          />
                          {material?.isSemiFinished && (
                            <div style={{ fontSize: 11, color: 'var(--color-info-700)', marginTop: 4 }}>{semiFinishedLabel(locale)}</div>
                          )}
                          {material && Number(material.stock_qty ?? 0) <= 0 && (
                            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                              {t('ombordaQoldiqYoqRetsepturaChiqim')}
                            </div>
                          )}
                        </td>
                        <td style={td}>
                          <DecimalInput
                            aria-label={`${t('miqdor')} ${i + 1}`}
                            value={row.quantity}
                            invalid={Boolean(errors[`quantity-${row.key}`])}
                            onValueChange={(value) => updateRow(row.key, { quantity: value })}
                            onBlur={() =>
                              setErrors((e) => ({ ...e, [`quantity-${row.key}`]: parseDecimal(row.quantity)! > 0 ? '' : t('miqdor0DanKattaBolsin') }))
                            }
                            style={inputStyle(Boolean(errors[`quantity-${row.key}`]))}
                          />
                          {fieldError(`quantity-${row.key}`)}
                          {material && info.factor !== null && info.factor !== 1 && info.quantity !== null && info.quantity > 0 && (
                            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4, textAlign: 'right' }}>
                              = {formatQuantity(info.quantity * info.factor)} {unitLabel(material.unitOfMeasure, locale)}
                            </div>
                          )}
                        </td>
                        <td style={td}>
                          {material && units.length > 1 ? (
                            <Select
                              aria-label={`${t('tovarBirligi')} ${i + 1}`}
                              options={units.map((u) => ({ value: u.code, label: unitLabel(u.code, locale), description: u.isBase ? undefined : `= ${formatQuantity(u.factor)} ${unitLabel(material.unitOfMeasure, locale)}` }))}
                              value={entryUnit}
                              onChange={(value) => updateRow(row.key, { unit: value })}
                              error={errors[`unit-${row.key}`] || undefined}
                            />
                          ) : (
                            <div style={{ paddingTop: 10, color: 'var(--color-text-primary)' }}>{material ? unitLabel(material.unitOfMeasure, locale) : '—'}</div>
                          )}
                        </td>
                        <td style={td}>
                          <DecimalInput
                            aria-label={`${t('yoqotishFoizi')} ${i + 1}`}
                            placeholder="0"
                            decimals={2}
                            value={row.lossPercent}
                            invalid={Boolean(errors[`loss-${row.key}`])}
                            onValueChange={(value) => updateRow(row.key, { lossPercent: value })}
                          />
                          {fieldError(`loss-${row.key}`)}
                        </td>
                        <td style={{ ...td, textAlign: 'right', paddingTop: 16 }} className="tabular-nums">
                          {material ? (
                            <>
                              <span style={{ color: noPrice ? 'var(--color-warning-700)' : undefined }}>{money(line.entryUnitCost)}</span>
                              <span style={{ color: 'var(--color-text-secondary)' }}> / {unitLabel(entryUnit, locale)}</span>
                            </>
                          ) : (
                            <span style={{ color: 'var(--color-text-secondary)' }}>—</span>
                          )}
                        </td>
                        <td style={{ ...td, textAlign: 'right', paddingTop: 16, fontWeight: 600 }} className="tabular-nums">
                          {material ? money(line.total) : '—'}
                        </td>
                        <td style={{ ...td, paddingTop: 4 }}>
                          <button
                            type="button"
                            aria-label={`${t('qatorniOchirish')} ${i + 1}`}
                            title={t('qatorniOchirish')}
                            disabled={rows.length === 1}
                            onClick={() => {
                              setRows((current) => current.filter((r) => r.key !== row.key));
                            }}
                            style={{ width: 40, height: 40, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 'var(--radius-md)', cursor: rows.length === 1 ? 'not-allowed' : 'pointer', color: 'var(--color-error-700)', opacity: rows.length === 1 ? 0.4 : 1 }}
                          >
                            <Trash2 size={16} aria-hidden />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.map((row, i) =>
                    materialById.get(row.productId) && !estimate.info[i].hasPrice ? (
                      <tr key={`warn-${row.key}`}>
                        <td colSpan={8} style={{ padding: '0 12px 8px 48px' }}>
                          <div role="status" style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '6px 10px', borderRadius: 'var(--radius-md)', background: 'var(--color-warning-50)', color: 'var(--color-warning-700)', fontSize: 'var(--text-xs)' }}>
                            <AlertTriangle size={14} aria-hidden />
                            {i + 1}. {localName(materialById.get(row.productId)?.name, locale)}:{' '}
                            {t('buXomashyoUchunNarxYoq')}
                          </div>
                        </td>
                      </tr>
                    ) : null,
                  )}
                </tbody>
              </table>
            </div>
            <div style={{ padding: 10, borderTop: '1px solid var(--color-border-light)' }}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setRows((current) => [...current, newRow()]);
                }}
              >
                <Plus size={14} aria-hidden /> {t('xomashyoQoshish')}
              </Button>
            </div>
          </div>

          </section>

          {/* 3. Summary (TZ 4.4) */}
          <section aria-labelledby="recipe-sec-cost" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h3 id="recipe-sec-cost" className="dlg-section" style={{ margin: 0 }}>{t('recipeSectionCost')}</h3>
            <div data-testid="recipe-cost-summary" aria-live="polite" style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
              <div style={{ flex: '1 1 220px', padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-tertiary)' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Calculator size={13} aria-hidden /> {t('normaUchunXomashyo')} ({formatQuantity(parseDecimal(outputQuantity) ?? 0)} {normUnitText})
                </div>
                <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)', marginTop: 2 }} className="tabular-nums">{money(estimate.normTotal)}</div>
              </div>
              <div style={{ flex: '1 1 220px', padding: '12px 16px', borderRadius: 'var(--radius-md)', background: 'var(--color-primary-50)' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  {t('n1Tannarxi', { finishedUnit: normUnitText })} ({t('taxminiy')})
                </div>
                <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--color-primary-700)', marginTop: 2 }} className="tabular-nums">{money(estimate.perUnit)}</div>
              </div>
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{t('costHintShort')}</div>
            {estimate.missingPrice && (
              <div role="status" style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-warning-700)' }}>
                <AlertTriangle size={14} aria-hidden />
                {t('narxiYoqXomashyoBorTannarx')}
              </div>
            )}
          </section>

          <div>
            <label htmlFor="recipe-note" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 4 }}>
              {t('izoh')}
            </label>
            <textarea
              id="recipe-note"
              rows={2}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
              }}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', resize: 'vertical' }}
            />
          </div>
          <div>
            <Checkbox label={t('faolRetseptura')} checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 2, paddingLeft: 28 }}>{t('faolRetsepturaHint')}</div>
          </div>
        </form>
      </Modal>

      {quickCreate && (
        <CreateProductDrawer
          isOpen
          initialType={quickCreate.kind}
          lockType
          initialSkuOrBarcode={quickCreate.name}
          onClose={() => setQuickCreate(null)}
          onSuccess={(product) => void handleCreated(product.id)}
        />
      )}
    </>
  );
}

function mergeById<T extends { id: string }>(base: T[], extra: T[]): T[] {
  if (extra.length === 0) return base;
  const ids = new Set(base.map((item) => item.id));
  return [...base, ...extra.filter((item) => !ids.has(item.id))];
}
