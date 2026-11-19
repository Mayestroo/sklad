'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, Calculator, Plus, Save, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatQuantity } from '@/lib/utils';
import { unitLabel } from '@/lib/units';
import { entryUnitsFor, estimateRecipeCost, toCardQuantity } from '@/lib/production-recipe';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { CreateProductDrawer } from '@/components/products/CreateProductDrawer';

type Locale = 'uz' | 'ru';

/** A product card as the products list returns it (cost fields used for the estimate). */
export interface RecipeProduct {
  id: string;
  name: unknown;
  type: string;
  unitOfMeasure: string;
  sku?: string | null;
  costPrice?: number | string | null;
  costPriceCurrency?: string | null;
  costPriceExchangeRate?: number | string | null;
  totalStock?: number | string | null;
}

export interface EditableRecipe {
  id: string;
  productId: string;
  outputQuantity: number | string;
  note?: string | null;
  items: Array<{ productId: string; quantity: number | string }>;
}

interface MaterialRow {
  key: number;
  productId: string;
  quantity: string;
  /** Entry unit: the card unit or a smaller unit of the same kind. */
  unit: string;
}

export interface RecipeFormModalProps {
  isOpen: boolean;
  /** Recipe to edit; null creates a new one. */
  recipe: EditableRecipe | null;
  products: RecipeProduct[];
  rawMaterials: RecipeProduct[];
  /** Active recipes, to warn about a second recipe for the same product. */
  existingRecipes: Array<{ id: string; productId: string }>;
  locale: Locale;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
  /** A product or material was created here: the parent reloads its lists. */
  onProductsChanged: () => void | Promise<void>;
}

let rowKey = 0;
const newRow = (productId = '', quantity = '', unit = ''): MaterialRow => ({ key: ++rowKey, productId, quantity, unit });

export function localName(value: unknown, locale: Locale): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const localized = value as Record<string, unknown>;
  return String(localized[locale] ?? localized.uz ?? localized.ru ?? '');
}

export function RecipeFormModal({
  isOpen,
  recipe,
  products,
  rawMaterials,
  existingRecipes,
  locale,
  onClose,
  onSaved,
  onProductsChanged,
}: RecipeFormModalProps) {
  const isRu = locale === 'ru';
  const { token, company } = useAuth();

  // The parent mounts this form when it opens (keyed by recipe), so the
  // initial values come straight from the recipe; list reloads never reset typing.
  // Edit: quantities are shown in the card unit (an empty unit means the card unit).
  const [productId, setProductId] = useState(recipe?.productId ?? '');
  const [outputQuantity, setOutputQuantity] = useState(recipe ? String(Number(recipe.outputQuantity)) : '1');
  const [note, setNote] = useState(recipe?.note ?? '');
  const [rows, setRows] = useState<MaterialRow[]>(() =>
    recipe?.items.length ? recipe.items.map((item) => newRow(item.productId, String(Number(item.quantity)))) : [newRow()],
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Created here before the parent's lists reload.
  const [created, setCreated] = useState<RecipeProduct[]>([]);
  const [quickCreate, setQuickCreate] = useState<{ kind: 'PRODUCT' } | { kind: 'RAW_MATERIAL'; rowKey: number } | null>(null);

  const allProducts = useMemo(() => mergeById(products, created.filter((p) => p.type === 'PRODUCT')), [products, created]);
  const allMaterials = useMemo(() => mergeById(rawMaterials, created.filter((p) => p.type === 'RAW_MATERIAL')), [rawMaterials, created]);
  const materialById = useMemo(() => new Map(allMaterials.map((m) => [m.id, m])), [allMaterials]);
  const finished = allProducts.find((p) => p.id === productId);
  const finishedUnit = unitLabel(finished?.unitOfMeasure, locale);

  const cardQuantities = rows.map((row) => {
    const material = materialById.get(row.productId);
    return material ? toCardQuantity(row.quantity, row.unit || material.unitOfMeasure, material.unitOfMeasure) : null;
  });
  const estimate = estimateRecipeCost(
    rows.map((row, i) => ({ quantity: cardQuantities[i], card: materialById.get(row.productId) })),
    outputQuantity,
  );
  const missingCost = rows
    .map((row, i) => ({ row, i }))
    .filter(({ i }) => cardQuantities[i] !== null && estimate.lines[i].unitCost === null)
    .map(({ row }) => localName(materialById.get(row.productId)?.name, locale));

  const otherRecipe = existingRecipes.find((r) => r.productId === productId && r.id !== recipe?.id);

  const productOptions: SelectOption[] = allProducts.map((p) => ({
    value: p.id,
    label: localName(p.name, locale),
    description: [p.sku, unitLabel(p.unitOfMeasure, locale)].filter(Boolean).join(' · '),
  }));
  const materialOptions = (currentRowKey: number): SelectOption[] => {
    const takenElsewhere = new Set(rows.filter((r) => r.key !== currentRowKey).map((r) => r.productId));
    return allMaterials
      .filter((m) => !takenElsewhere.has(m.id))
      .map((m) => ({
        value: m.id,
        label: localName(m.name, locale),
        description: `${unitLabel(m.unitOfMeasure, locale)} · ${isRu ? 'остаток' : 'qoldiq'}: ${formatQuantity(Number(m.totalStock ?? 0))}`,
      }));
  };

  const updateRow = (key: number, patch: Partial<MaterialRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const handleCreated = async (id: string) => {
    const target = quickCreate;
    setQuickCreate(null);
    if (!target || !token || !company) return;
    try {
      const product = await apiFetch<RecipeProduct>(`/inventory/products/${id}`, { token, tenantId: company.id, locale });
      if (product.type !== target.kind) {
        setError(
          target.kind === 'PRODUCT'
            ? isRu ? 'Создан не «готовый продукт» — выберите тип «Продукт».' : 'Yaratilgan element «Tayyor mahsulot» turida emas.'
            : isRu ? 'Создан не «сырьё» — выберите тип «Сырьё».' : 'Yaratilgan element «Xomashyo» turida emas.',
        );
        return;
      }
      setCreated((current) => mergeById(current, [product]));
      if (target.kind === 'PRODUCT') setProductId(product.id);
      else updateRow(target.rowKey, { productId: product.id, unit: product.unitOfMeasure });
      await onProductsChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : isRu ? 'Не удалось загрузить созданный товар' : 'Yaratilgan mahsulotni yuklab bo‘lmadi');
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !company) return;
    if (!productId) return setError(isRu ? 'Выберите готовый продукт' : 'Tayyor mahsulotni tanlang');
    if (!(Number(outputQuantity) > 0)) return setError(isRu ? 'Норма выпуска должна быть больше 0' : 'Ishlab chiqarish normasi 0 dan katta bo‘lishi kerak');
    const badRows = rows.flatMap((row, i) => (!row.productId || cardQuantities[i] === null ? [i + 1] : []));
    if (badRows.length > 0) {
      return setError(
        isRu
          ? `Проверьте сырьё и количество в строках: ${badRows.join(', ')}. Количество меньше 0,001 единицы карточки сохранить нельзя — увеличьте норму выпуска.`
          : `Qatorlardagi xomashyo va miqdorni tekshiring: ${badRows.join(', ')}. Kartochka birligining 0,001 qismidan kichik miqdorni saqlab bo‘lmaydi — ishlab chiqarish normasini oshiring.`,
      );
    }
    setBusy(true);
    setError('');
    try {
      await apiFetch(recipe ? `/production/recipes/${recipe.id}` : '/production/recipes', {
        method: recipe ? 'PUT' : 'POST',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          productId,
          outputQuantity: Number(outputQuantity),
          note: note.trim() || undefined,
          materials: rows.map((row, i) => ({ productId: row.productId, quantity: cardQuantities[i] })),
        }),
      });
      await onSaved(recipe ? (isRu ? 'Рецептура обновлена' : 'Retseptura yangilandi') : isRu ? 'Рецептура сохранена' : 'Retseptura saqlandi');
    } catch (e) {
      setError(e instanceof Error ? e.message : isRu ? 'Не удалось сохранить рецептуру' : 'Retsepturani saqlab bo‘lmadi');
    } finally {
      setBusy(false);
    }
  };

  const th: React.CSSProperties = { padding: '8px 10px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textAlign: 'left', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'top' };
  const money = (value: number | null) => (value === null ? '—' : formatCurrency(value, locale, 'UZS'));

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={recipe ? (isRu ? 'Редактировать рецептуру' : 'Retsepturani tahrirlash') : isRu ? 'Новая рецептура' : 'Yangi retseptura'} size="3xl">
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && (
            <div role="alert" style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-sm)', color: 'var(--color-error-700)', background: 'var(--color-error-50)', border: '1px solid var(--color-error-100)' }}>
              {error}
            </div>
          )}

          {/* 1. Finished product and output norm */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 12, alignItems: 'end' }}>
            <Select
              label={isRu ? 'Готовый продукт' : 'Tayyor mahsulot'}
              options={productOptions}
              value={productId}
              onChange={setProductId}
              searchable
              placeholder={isRu ? 'Выберите или создайте продукт' : 'Mahsulotni tanlang yoki yarating'}
              onCreateNew={() => setQuickCreate({ kind: 'PRODUCT' })}
              createNewLabel={isRu ? 'Новый продукт' : 'Yangi mahsulot qo‘shish'}
            />
            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                {isRu ? 'Норма выпуска' : 'Ishlab chiqarish normasi'}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Input
                  aria-label={isRu ? 'Норма выпуска' : 'Ishlab chiqarish normasi'}
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={outputQuantity}
                  onChange={(e) => setOutputQuantity(e.target.value)}
                  required
                />
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', minWidth: 40 }}>{finished ? finishedUnit : ''}</span>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', marginTop: -8 }}>
            {isRu
              ? `Ниже — расход сырья на ${formatQuantity(Number(outputQuantity) || 0)} ${finished ? finishedUnit : 'ед.'} готового продукта.`
              : `Quyida ${formatQuantity(Number(outputQuantity) || 0)} ${finished ? finishedUnit : 'birlik'} tayyor mahsulot uchun xomashyo sarfi kiritiladi.`}
          </div>
          {otherRecipe && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--text-sm)', color: 'var(--color-warning-700)' }}>
              <AlertTriangle size={16} />
              {isRu
                ? 'У этого продукта уже есть активная рецептура. Если её нужно изменить, лучше отредактировать существующую.'
                : 'Bu mahsulotda faol retseptura allaqachon bor. Uni o‘zgartirish kerak bo‘lsa, mavjudini tahrirlang.'}
            </div>
          )}

          {/* 2. Raw materials: quantity, unit, cost */}
          <div style={{ border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
                <thead style={{ background: 'var(--color-bg-tertiary)' }}>
                  <tr>
                    <th style={{ ...th, width: 32 }}>#</th>
                    <th style={{ ...th, minWidth: 220 }}>{isRu ? 'Сырьё' : 'Xomashyo'}</th>
                    <th style={{ ...th, width: 130 }}>{isRu ? 'Количество' : 'Miqdor'}</th>
                    <th style={{ ...th, width: 110 }}>{isRu ? 'Ед. изм.' : 'O‘lchov birligi'}</th>
                    <th style={{ ...th, width: 150, textAlign: 'right' }}>{isRu ? 'Цена за ед.' : 'Birlik tannarxi'}</th>
                    <th style={{ ...th, width: 150, textAlign: 'right' }}>{isRu ? 'Сумма' : 'Summa'}</th>
                    <th style={{ ...th, width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const material = materialById.get(row.productId);
                    const cardUnit = material?.unitOfMeasure;
                    const units = entryUnitsFor(cardUnit);
                    const entryUnit = row.unit || cardUnit || '';
                    const converted = cardQuantities[i];
                    const typed = row.quantity !== '' && Number(row.quantity) > 0;
                    const unitCost = estimate.lines[i].unitCost;
                    return (
                      <tr key={row.key} style={{ borderTop: '1px solid var(--color-border-light)' }}>
                        <td style={{ ...td, color: 'var(--color-text-tertiary)', paddingTop: 16 }}>{i + 1}</td>
                        <td style={td}>
                          <Select
                            aria-label={`${isRu ? 'Сырьё' : 'Xomashyo'} ${i + 1}`}
                            options={materialOptions(row.key)}
                            value={row.productId}
                            searchable
                            placeholder={isRu ? 'Выберите сырьё' : 'Xomashyoni tanlang'}
                            onChange={(value) => updateRow(row.key, { productId: value, unit: materialById.get(value)?.unitOfMeasure ?? '' })}
                            onCreateNew={() => setQuickCreate({ kind: 'RAW_MATERIAL', rowKey: row.key })}
                            createNewLabel={isRu ? 'Новое сырьё' : 'Yangi xomashyo qo‘shish'}
                          />
                        </td>
                        <td style={td}>
                          <Input
                            aria-label={`${isRu ? 'Количество' : 'Miqdor'} ${i + 1}`}
                            type="number"
                            min="0"
                            step="any"
                            value={row.quantity}
                            onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                          />
                          {material && typed && entryUnit !== cardUnit && converted !== null && (
                            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>
                              = {formatQuantity(converted)} {unitLabel(cardUnit, locale)}
                            </div>
                          )}
                          {material && typed && converted === null && (
                            <div style={{ fontSize: 11, color: 'var(--color-error-600)', marginTop: 4 }}>
                              {isRu ? `меньше 0,001 ${unitLabel(cardUnit, locale)}` : `0,001 ${unitLabel(cardUnit, locale)} dan kam`}
                            </div>
                          )}
                        </td>
                        <td style={td}>
                          {material && units.length > 1 ? (
                            <Select
                              aria-label={`${isRu ? 'Ед. изм.' : 'O‘lchov birligi'} ${i + 1}`}
                              options={units.map((u) => ({ value: u.code, label: unitLabel(u.code, locale) }))}
                              value={entryUnit}
                              onChange={(value) => updateRow(row.key, { unit: value })}
                            />
                          ) : (
                            <div style={{ paddingTop: 8, color: 'var(--color-text-secondary)' }}>{material ? unitLabel(cardUnit, locale) : '—'}</div>
                          )}
                        </td>
                        <td style={{ ...td, textAlign: 'right', paddingTop: 16 }} className="tabular-nums">
                          {material ? (
                            unitCost === null ? (
                              <span style={{ color: 'var(--color-warning-700)' }}>{isRu ? 'нет цены' : 'tannarx yo‘q'}</span>
                            ) : (
                              <>
                                {money(unitCost)}
                                <span style={{ color: 'var(--color-text-tertiary)' }}> / {unitLabel(cardUnit, locale)}</span>
                              </>
                            )
                          ) : (
                            '—'
                          )}
                        </td>
                        <td style={{ ...td, textAlign: 'right', paddingTop: 16, fontWeight: 600 }} className="tabular-nums">
                          {money(estimate.lines[i].total)}
                        </td>
                        <td style={{ ...td, paddingTop: 12 }}>
                          <button
                            type="button"
                            aria-label={isRu ? 'Удалить строку' : 'Qatorni o‘chirish'}
                            disabled={rows.length === 1}
                            onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                            style={{ background: 'none', border: 'none', cursor: rows.length === 1 ? 'not-allowed' : 'pointer', color: 'var(--color-error-500)', opacity: rows.length === 1 ? 0.4 : 1 }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ padding: 10, borderTop: '1px solid var(--color-border-light)' }}>
              <Button type="button" variant="outline" size="sm" onClick={() => setRows((current) => [...current, newRow()])}>
                <Plus size={14} /> {isRu ? 'Добавить сырьё' : 'Xomashyo qo‘shish'}
              </Button>
            </div>
          </div>

          {/* 3. Calculation */}
          <div data-testid="recipe-cost-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, padding: 12, borderRadius: 'var(--radius-md)', background: 'var(--color-bg-tertiary)' }}>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calculator size={13} /> {isRu ? `Сырьё на норму (${formatQuantity(Number(outputQuantity) || 0)} ${finishedUnit})` : `Norma uchun xomashyo (${formatQuantity(Number(outputQuantity) || 0)} ${finishedUnit})`}
              </div>
              <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)' }} className="tabular-nums">{money(estimate.total)}</div>
            </div>
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                {isRu ? `Себестоимость 1 ${finishedUnit}` : `1 ${finishedUnit} tannarxi`}
              </div>
              <div style={{ fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--color-primary-600)' }} className="tabular-nums">{money(estimate.perUnit)}</div>
            </div>
            <div style={{ gridColumn: '1 / -1', fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              {isRu
                ? 'Оценка по себестоимости в карточках сырья (UZS). Фактическая себестоимость берётся из партий FIFO при запуске производства.'
                : 'Xomashyo kartochkalaridagi tannarx bo‘yicha taxmin (UZS). Haqiqiy tannarx ishlab chiqarish boshlanganda FIFO partiyalaridan olinadi.'}
            </div>
            {missingCost.length > 0 && (
              <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 6, alignItems: 'center', fontSize: 'var(--text-xs)', color: 'var(--color-warning-700)' }}>
                <AlertTriangle size={14} />
                {isRu
                  ? `Без цены (в итог не вошли): ${missingCost.join(', ')}`
                  : `Tannarxi yo‘q (jamiga kirmadi): ${missingCost.join(', ')}`}
              </div>
            )}
          </div>

          <Input label={isRu ? 'Комментарий' : 'Izoh'} value={note} onChange={(e) => setNote(e.target.value)} />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button type="button" variant="outline" onClick={onClose}>
              {isRu ? 'Отмена' : 'Bekor qilish'}
            </Button>
            <Button type="submit" disabled={busy}>
              <Save size={15} /> {busy ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : isRu ? 'Сохранить рецептуру' : 'Retsepturani saqlash'}
            </Button>
          </div>
        </form>
      </Modal>

      {quickCreate && (
        <CreateProductDrawer
          isOpen
          initialType={quickCreate.kind}
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
