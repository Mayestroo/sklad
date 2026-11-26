'use client';

import { MoneyInput } from '@/components/ui/MoneyInput';
import { QuantityInput } from '@/components/ui/QuantityInput';
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { apiDownload, apiFetch, listOf, type ListResponse } from '@/lib/api';
import {
  IMPORT_CATEGORY_LABELS,
  openingBalanceImportPaths,
  summarizeImportPreview,
} from '@/lib/opening-balance-import';
import { CURRENCY_OPTIONS, formatCurrency, formatCurrencyIfAvailable, errorMessage } from '@/lib/utils';
import {
  COUNTERPARTY_LINE_KINDS,
  counterpartiesForKind,
  documentUsdRate,
  isCounterpartyLineKind,
  needsUsdRate,
  newOpeningBalanceLine,
  openingBalanceSaveBlocker,
  suggestedStraightLineDepreciation,
  withDocumentRate,
  withProductCost,
  withRegisterAsset,
  type CounterpartyLineKind,
  type OpeningBalanceSaveBlocker,
} from '@/lib/opening-balance-lines';
import { computeOpeningBalanceTotals } from '@shared/types/opening-balance-posting';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { CurrencyInput } from '@/components/ui/CurrencyInput';
import { CreateProductDrawer } from '@/components/products/CreateProductDrawer';
import { CreateCounterpartyDrawer } from '@/components/counterparties/CreateCounterpartyDrawer';
import { toast } from '@/context/ToastContext';
import {
  Plus,
  Save,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  FileSpreadsheet,
  Upload,
  Download,
  Trash2,
  ArrowRight,
  Check,
  Loader2,
  Calculator,
  LockOpen,
  Building2,
  ArrowLeft,
  CalendarDays,
  Wallet,
  Package,
  Users,
  Building,
  Landmark,
  ClipboardCheck,
  Pencil,
  type LucideIcon,
} from 'lucide-react';
import type {
  OpeningBalanceDocument,
  OpeningBalanceLine,
  OpeningBalanceCategory,
  ImportErrorItem,
  ImportValidationResult,
} from '@shared/types/opening-balances';
import { isCashAccountCurrencyValid } from '@shared/types/cash-account-policy';
import type { CashAccount } from '@shared/types/finance';
import type { Product } from '@shared/types/inventory';
import type { Counterparty } from '@shared/types/sales';
import type { Warehouse } from '@shared/types/tenant';
import type { FixedAsset } from '@shared/types/fixed-assets';

/**
 * Opening balances as one page an operator fills top to bottom:
 *  1. the date the company starts keeping its books here;
 *  2. five sections, each a plain question (money, goods, debts, fixed
 *     assets, capital) — empty sections count as zero;
 *  3. "check and confirm": has − owes = own capital, and one post button.
 *
 * There is no "document" step: the draft is created by the first change and
 * every change is saved on its own (autosave). The page only waits when the
 * server would refuse the save — a line without a currency, or USD lines
 * without the document's USD rate — and says which.
 *
 * Capital balances itself: what is not entered as ustav kapitali is posted
 * as retained earnings (8710). Posting opens every line in its own module
 * (kassa, warehouse FIFO batch, counterparty settlement, fixed-asset
 * register, journal).
 */

type SectionKey = 'cash' | 'inventory' | 'debts' | 'fixed-assets' | 'other';
type OpeningBalanceDraftLine = Omit<Partial<OpeningBalanceLine>, 'exchangeRate'> & { exchangeRate?: number | string };
type LineValue = OpeningBalanceDraftLine[keyof OpeningBalanceDraftLine];
type IndexedLine = { line: OpeningBalanceDraftLine; index: number };
type Locale = 'uz' | 'ru';
type SaveState = 'idle' | 'saving' | 'saved' | 'blocked' | 'error';
/** The flow: the date, the five sections, then check and confirm. */
type StepKey = 'date' | SectionKey | 'review';
const STEPS: StepKey[] = ['date', 'cash', 'inventory', 'debts', 'fixed-assets', 'other', 'review'];
const SECTION_KEYS: SectionKey[] = ['cash', 'inventory', 'debts', 'fixed-assets', 'other'];

const AUTOSAVE_DELAY_MS = 1200;

interface SubledgerTableProps {
  lines: OpeningBalanceDraftLine[];
  isReadOnly: boolean;
  locale: Locale;
  isRu: boolean;
  onUpdate: (index: number, field: keyof OpeningBalanceLine, value: LineValue) => void;
  onRemove: (index: number) => void;
}

/** The lines of one category, with their position in the full list. */
function linesWhere(lines: OpeningBalanceDraftLine[], keep: (line: OpeningBalanceDraftLine) => boolean): IndexedLine[] {
  return lines.flatMap((line, index) => (keep(line) ? [{ line, index }] : []));
}

const CASH_CATEGORIES = new Set<string>(['CASH', 'BANK']);
const OTHER_CATEGORIES = new Set<string>(['EQUITY', 'OTHER_ASSET', 'OTHER_LIABILITY']);

function sectionOf(category: string | null | undefined): SectionKey {
  if (CASH_CATEGORIES.has(String(category))) return 'cash';
  if (category === 'INVENTORY') return 'inventory';
  if (isCounterpartyLineKind(category)) return 'debts';
  if (category === 'FIXED_ASSET') return 'fixed-assets';
  return 'other';
}

const SECTION_NAMES: Record<SectionKey, Record<Locale, string>> = {
  cash: { uz: 'Pul', ru: 'Деньги' },
  inventory: { uz: 'Tovarlar', ru: 'Товары' },
  debts: { uz: 'Qarzlar', ru: 'Долги' },
  'fixed-assets': { uz: 'Uskuna va binolar', ru: 'Оборудование и здания' },
  other: { uz: 'Ustav kapitali', ru: 'Уставный капитал' },
};

const firstDayOfMonth = () => `${new Date().toISOString().slice(0, 8)}01`;

const localized = (name: unknown, locale: Locale, fallback: string): string => {
  if (!name) return fallback;
  if (typeof name === 'string') return name;
  const n = name as Partial<Record<Locale, string>>;
  return n[locale] || n.uz || n.ru || fallback;
};

/** "1 200 000 UZS · 300 USD": one sum per currency, never added together (ADR 0023). */
function sumsByCurrency(items: IndexedLine[], valueOf: (line: OpeningBalanceDraftLine) => number, locale: Locale): string | null {
  const sums = new Map<string, number>();
  for (const { line } of items) {
    if (!line.currency) continue;
    sums.set(line.currency, (sums.get(line.currency) ?? 0) + valueOf(line));
  }
  const parts = [...sums.entries()].filter(([, sum]) => sum !== 0).map(([currency, sum]) => formatCurrency(sum, locale, currency));
  return parts.length > 0 ? parts.join(' · ') : null;
}

// ─── Shared table styles ────────────────────────────────────────────────────

const th = (extra?: React.CSSProperties): React.CSSProperties => ({
  padding: '10px 12px',
  fontSize: 'var(--text-xs)',
  fontWeight: 500,
  color: 'var(--color-text-secondary)',
  ...extra,
});
const td: React.CSSProperties = { padding: '8px 12px' };
const field = (width: number | string, extra?: React.CSSProperties): React.CSSProperties => ({
  padding: '8px 12px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--color-border)',
  backgroundColor: 'var(--color-bg-secondary)',
  color: 'var(--color-text-primary)',
  width,
  fontSize: 'var(--text-sm)',
  ...extra,
});
const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' };
const theadStyle: React.CSSProperties = { borderBottom: '1px solid var(--color-border-light)' };
const rowStyle: React.CSSProperties = { borderBottom: '1px solid var(--color-border-light)' };

function RemoveCell({ isReadOnly, isRu, onClick }: { isReadOnly: boolean; isRu: boolean; onClick: () => void }) {
  if (isReadOnly) return null;
  return (
    <td style={{ ...td, textAlign: 'center', width: 48 }}>
      <Button
        type="button"
        variant="danger-ghost"
        size="sm"
        onClick={onClick}
        aria-label={isRu ? 'Удалить строку' : 'Qatorni o‘chirish'}
        title={isRu ? 'Удалить строку' : 'Qatorni o‘chirish'}
      >
        <Trash2 size={16} aria-hidden />
      </Button>
    </td>
  );
}

function NotesInput({ line, index, isReadOnly, isRu, onUpdate, placeholder }: {
  line: OpeningBalanceDraftLine;
  index: number;
  isReadOnly: boolean;
  isRu: boolean;
  onUpdate: SubledgerTableProps['onUpdate'];
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={line.notes || ''}
      disabled={isReadOnly}
      onChange={(e) => onUpdate(index, 'notes', e.target.value)}
      placeholder={placeholder ?? (isRu ? 'Примечание...' : 'Izoh...')}
      aria-label={isRu ? 'Описание' : 'Tavsif'}
      style={field('100%')}
    />
  );
}

export default function OpeningBalancesPage() {
  const locale = useLocale() as Locale;
  const isRu = locale === 'ru';
  const { token, company } = useAuth();
  const confirm = useConfirm();
  const companyId = company?.id;
  const docCurrency = 'UZS';

  // Documents (usually one; the page never asks the user to "create" one)
  const [documents, setDocuments] = useState<OpeningBalanceDocument[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [currentDoc, setCurrentDoc] = useState<OpeningBalanceDocument | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Lookups
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [fixedAssets, setFixedAssets] = useState<FixedAsset[]>([]);
  // Create a missing product, counterparty or register asset from a line,
  // then put it on that line.
  const [quickCreate, setQuickCreate] = useState<
    | { kind: 'product'; index: number }
    | { kind: 'counterparty'; index: number; type: 'CUSTOMER' | 'SUPPLIER' }
    | { kind: 'fixedAsset'; index: number }
    | null
  >(null);

  // Working draft
  const [lines, setLines] = useState<OpeningBalanceDraftLine[]>([]);
  const [openingDate, setOpeningDate] = useState<string>(firstDayOfMonth());
  const [notes, setNotes] = useState<string>('');
  // One USD rate for the whole document (rate at the opening date).
  const [usdRate, setUsdRate] = useState<string>('');
  const [ratesWereMixed, setRatesWereMixed] = useState(false);

  // Autosave: every edit bumps the version; a save records the version it sent.
  const [editVersion, setEditVersion] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState('');

  // Where the user is in the flow, and which steps they have opened.
  const [step, setStep] = useState<StepKey>('date');
  const [visited, setVisited] = useState<ReadonlySet<StepKey>>(() => new Set<StepKey>(['date']));
  const flowRef = useRef<HTMLDivElement>(null);
  const versionRef = useRef(0);
  const savedVersionRef = useRef(0);
  const savingRef = useRef<Promise<boolean> | null>(null);
  const draftRef = useRef({ lines, openingDate, notes, usdRate, docId: '' });

  // Modals
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importErrors, setImportErrors] = useState<ImportErrorItem[]>([]);
  const [importPreview, setImportPreview] = useState<ImportValidationResult | null>(null);
  const [importing, setImporting] = useState(false);

  const [showUnpostModal, setShowUnpostModal] = useState(false);
  const [unpostReason, setUnpostReason] = useState('');

  const requestOptions = useMemo(
    () => ({ token: token || undefined, tenantId: companyId, locale }),
    [token, companyId, locale],
  );

  useEffect(() => {
    draftRef.current = { lines, openingDate, notes, usdRate, docId: draftRef.current.docId };
  }, [lines, openingDate, notes, usdRate]);

  const isReadOnly = currentDoc?.status === 'POSTED' || currentDoc?.status === 'CANCELLED';
  const isPosted = currentDoc?.status === 'POSTED';

  // ─── Lookups ───────────────────────────────────────────────────

  useEffect(() => {
    if (!token || !companyId) return;
    const fetchLookups = async () => {
      // A list that fails to load must say so: an empty dropdown with no
      // reason read as "the existing counterparties are not pulled in"
      // (muammolar.pdf B4).
      const failed: string[] = [];
      const load = <T,>(promise: Promise<T[]>, name: { uz: string; ru: string }) =>
        promise.catch(() => {
          failed.push(isRu ? name.ru : name.uz);
          return [] as T[];
        });
      const [accs, whs, prods, cps, fas] = await Promise.all([
        load(apiFetch<CashAccount[]>('/finance/accounts', requestOptions), { uz: 'kassalar', ru: 'кассы' }),
        load(apiFetch<ListResponse<Warehouse>>('/tenants/warehouses', requestOptions).then((res) => listOf(res)), { uz: 'omborlar', ru: 'склады' }),
        load(apiFetch<ListResponse<Product>>('/inventory/products', requestOptions).then((res) => listOf(res)), { uz: 'tovarlar', ru: 'товары' }),
        load(apiFetch<ListResponse<Counterparty>>('/sales/counterparties', requestOptions).then((res) => listOf(res)), { uz: 'kontragentlar', ru: 'контрагенты' }),
        load(apiFetch<FixedAsset[]>('/fixed-assets', requestOptions), { uz: 'asosiy vositalar', ru: 'основные средства' }),
      ]);
      setAccounts(Array.isArray(accs) ? accs : []);
      setWarehouses(Array.isArray(whs) ? whs : []);
      setProducts(Array.isArray(prods) ? prods : []);
      setCounterparties(Array.isArray(cps) ? cps : []);
      setFixedAssets(Array.isArray(fas) ? fas : []);
      if (failed.length > 0) {
        toast.error(
          isRu
            ? `Не удалось загрузить: ${failed.join(', ')}. Обновите страницу.`
            : `Yuklab bo‘lmadi: ${failed.join(', ')}. Sahifani yangilang.`,
        );
      }
    };
    fetchLookups();
  }, [token, companyId, requestOptions, isRu]);

  // ─── Documents ─────────────────────────────────────────────────

  /** Puts a loaded document on the page as the saved state. */
  const applyDocument = useCallback((doc: OpeningBalanceDocument | null) => {
    const docLines = doc?.lines || [];
    const { rate, mixed } = documentUsdRate(docLines);
    setCurrentDoc(doc);
    setLines(docLines);
    setUsdRate(rate);
    setRatesWereMixed(mixed);
    setOpeningDate(doc?.openingDate ? doc.openingDate.slice(0, 10) : firstDayOfMonth());
    setNotes(doc?.notes || '');
    draftRef.current.docId = doc?.id ?? '';
    savedVersionRef.current = versionRef.current;
    setSaveError('');
    setSaveState(doc && doc.status === 'DRAFT' ? 'saved' : 'idle');
    // A document with content opens on its summary; an empty one at the start.
    const opensOnReview = Boolean(doc && (doc.status !== 'DRAFT' || docLines.length > 0));
    setStep(opensOnReview ? 'review' : 'date');
    setVisited(new Set<StepKey>(opensOnReview ? STEPS : ['date']));
  }, []);

  const fetchDocument = useCallback(
    (id: string) => apiFetch<OpeningBalanceDocument>(`/opening-balances/${id}`, requestOptions),
    [requestOptions],
  );

  /** The draft to keep working on, else the latest document. */
  const pickDocument = (docs: OpeningBalanceDocument[]) => docs.find((d) => d.status === 'DRAFT') ?? docs[0];

  const reload = useCallback(
    async (preferId?: string) => {
      const docs = (await apiFetch<OpeningBalanceDocument[]>('/opening-balances', requestOptions)) || [];
      setDocuments(docs);
      const target = docs.find((d) => d.id === preferId) ?? pickDocument(docs);
      applyDocument(target ? await fetchDocument(target.id) : null);
    },
    [requestOptions, applyDocument, fetchDocument],
  );

  useEffect(() => {
    if (!token || !companyId) return;
    let cancelled = false;
    (async () => {
      try {
        const docs = (await apiFetch<OpeningBalanceDocument[]>('/opening-balances', requestOptions)) || [];
        if (cancelled) return;
        setDocuments(docs);
        const target = pickDocument(docs);
        const doc = target ? await fetchDocument(target.id) : null;
        if (!cancelled) applyDocument(doc);
      } catch (e) {
        toast.error(errorMessage(e) || (isRu ? 'Ошибка при загрузке остатков' : 'Qoldiqlarni yuklashda xatolik'));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, companyId, requestOptions, isRu, applyDocument, fetchDocument]);

  // ─── Autosave ──────────────────────────────────────────────────

  const effectiveLines = useMemo(() => withDocumentRate(lines, usdRate), [lines, usdRate]);
  const totals = useMemo(() => computeOpeningBalanceTotals(effectiveLines), [effectiveLines]);
  const blocker = useMemo(() => openingBalanceSaveBlocker(lines, usdRate), [lines, usdRate]);

  const markEdited = () => {
    versionRef.current += 1;
    setEditVersion(versionRef.current);
  };

  /**
   * Saves the draft if it changed (creating it on the first save) and
   * resolves true when the server has the current version. One save at a
   * time; an edit made during a save is picked up by the next one.
   */
  const persist = useCallback(async (): Promise<boolean> => {
    if (savingRef.current) await savingRef.current;
    const draft = draftRef.current;
    if (draft.docId && versionRef.current === savedVersionRef.current) return true;
    if (openingBalanceSaveBlocker(draft.lines, draft.usdRate)) {
      setSaveState('blocked');
      return false;
    }
    const version = versionRef.current;
    const effectiveLines = withDocumentRate(draft.lines, draft.usdRate);
    const body = JSON.stringify({ openingDate: draft.openingDate, notes: draft.notes || undefined, lines: effectiveLines });
    const run = (async () => {
      setSaveState('saving');
      try {
        if (draft.docId) {
          await apiFetch(`/opening-balances/${draft.docId}/lines`, { ...requestOptions, method: 'PUT', body });
        } else {
          const created = await apiFetch<OpeningBalanceDocument>('/opening-balances', { ...requestOptions, method: 'POST', body });
          draftRef.current.docId = created.id;
          setCurrentDoc(created);
          setDocuments((prev) => [created, ...prev.filter((d) => d.id !== created.id)]);
        }
        savedVersionRef.current = Math.max(savedVersionRef.current, version);
        setSaveError('');
        setSaveState(versionRef.current === version ? 'saved' : 'saving');
        return true;
      } catch (e) {
        setSaveError(errorMessage(e) || (isRu ? 'Ошибка сохранения' : 'Saqlashda xatolik'));
        setSaveState('error');
        return false;
      }
    })();
    savingRef.current = run;
    try {
      return await run;
    } finally {
      savingRef.current = null;
    }
  }, [requestOptions, isRu]);

  useEffect(() => {
    if (isReadOnly || editVersion === savedVersionRef.current) return;
    const timer = setTimeout(() => void persist(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [editVersion, isReadOnly, persist]);

  // Leaving with unsaved edits: the browser asks; in-app navigation saves now.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (versionRef.current !== savedVersionRef.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (versionRef.current !== savedVersionRef.current) void persist();
    };
  }, [persist]);

  const blockerText = (b: OpeningBalanceSaveBlocker): string => {
    if (!b) return '';
    if (b.kind === 'usdRate') return isRu ? 'укажите курс USD вверху страницы' : 'sahifa tepasida USD kursini kiriting';
    // Cash lines take their currency from the kassa: ask for the kassa there,
    // and for the currency everywhere else.
    const keys = [...new Set(b.categories.map((c) => sectionOf(c)))];
    return keys
      .map((key) => {
        const what = key === 'cash' ? (isRu ? 'кассу' : 'kassani') : isRu ? 'валюту' : 'valyutani';
        const name = SECTION_NAMES[key][locale];
        return isRu ? `выберите ${what} в разделе «${name}»` : `«${name}» bo‘limida ${what} tanlang`;
      })
      .join('; ');
  };

  // ─── Actions ───────────────────────────────────────────────────

  /** Saves what is on the page, then posts it. */
  const handlePost = async () => {
    if (!token || !companyId) return;
    if (lines.length === 0) {
      toast.error(isRu ? 'Сначала заполните хотя бы один раздел' : 'Avval kamida bitta bo‘limni to‘ldiring');
      return;
    }
    if (blocker) {
      toast.error(isRu ? `Нельзя провести: ${blockerText(blocker)}` : `Tasdiqlab bo‘lmaydi: ${blockerText(blocker)}`);
      return;
    }
    const ok = await confirm({
      title: isRu ? 'Провести начальные остатки?' : 'Boshlang‘ich qoldiqlarni tasdiqlaysizmi?',
      description: isRu
        ? 'Деньги появятся в кассах, товары — на складе, долги — у клиентов и поставщиков, бухгалтерия получит проводку. После этого страница станет только для просмотра; ошибку можно исправить кнопкой «Исправить».'
        : 'Pul kassalarda, tovar omborda, qarzlar mijoz va yetkazib beruvchilarda paydo bo‘ladi, buxgalteriyaga provodka yoziladi. Shundan keyin sahifa faqat ko‘rish uchun bo‘ladi; xatoni «Tuzatish» tugmasi bilan to‘g‘rilash mumkin.',
      variant: 'info',
      confirmText: isRu ? 'Провести' : 'Tasdiqlash',
      cancelText: isRu ? 'Отмена' : 'Bekor qilish',
    });
    if (!ok) return;

    setActionLoading(true);
    try {
      if (!(await persist())) {
        toast.error(isRu ? 'Не удалось сохранить, проведение отменено' : 'Saqlab bo‘lmadi, tasdiqlash to‘xtatildi');
        return;
      }
      const id = draftRef.current.docId;
      await apiFetch(`/opening-balances/${id}/post`, { ...requestOptions, method: 'POST' });
      toast.success(
        isRu
          ? 'Остатки проведены: кассы, склады, расчёты и журнал обновлены.'
          : 'Boshlang‘ich qoldiqlar tasdiqlandi: kassa, ombor, hisob-kitoblar va jurnal yangilandi.',
      );
      await reload(id);
    } catch (e) {
      toast.error(errorMessage(e) || (isRu ? 'Ошибка проведения' : 'Tasdiqlashda xatolik'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnpost = async () => {
    const id = currentDoc?.id;
    if (!token || !companyId || !id) return;
    setActionLoading(true);
    try {
      await apiFetch(`/opening-balances/${id}/unpost`, {
        ...requestOptions,
        method: 'POST',
        body: JSON.stringify({ reason: unpostReason || undefined }),
      });
      setShowUnpostModal(false);
      setUnpostReason('');
      toast.success(isRu ? 'Можно исправлять. После правок проведите снова.' : 'Endi tuzatish mumkin. Tuzatgach, qayta tasdiqlang.');
      await reload(id);
    } catch (e) {
      toast.error(errorMessage(e) || (isRu ? 'Ошибка переоткрытия' : 'Qayta ochishda xatolik'));
    } finally {
      setActionLoading(false);
    }
  };

  /** Clears the draft: the saved one is deleted, an unsaved one is just emptied. */
  const handleClearDraft = async () => {
    const ok = await confirm({
      title: isRu ? 'Очистить всё и начать заново?' : 'Hammasini tozalab, qaytadan boshlaysizmi?',
      description: isRu ? 'Все введённые строки будут удалены.' : 'Kiritilgan barcha qatorlar o‘chiriladi.',
      variant: 'danger',
      confirmText: isRu ? 'Очистить' : 'Tozalash',
      cancelText: isRu ? 'Отмена' : 'Bekor qilish',
    });
    if (!ok) return;
    setActionLoading(true);
    try {
      if (savingRef.current) await savingRef.current;
      const id = draftRef.current.docId;
      if (id) await apiFetch(`/opening-balances/${id}`, { ...requestOptions, method: 'DELETE' });
      toast.success(isRu ? 'Очищено' : 'Tozalandi');
      await reload();
    } catch (e) {
      toast.error(errorMessage(e) || (isRu ? 'Ошибка удаления' : 'O‘chirishda xatolik'));
    } finally {
      setActionLoading(false);
    }
  };

  /** A second set of balances at another date (rare): an empty, unsaved draft. */
  const startNewDraft = () => {
    applyDocument(null);
  };

  const switchDocument = async (id: string) => {
    if (id === currentDoc?.id) return;
    if (versionRef.current !== savedVersionRef.current && !(await persist())) {
      toast.error(isRu ? 'Сначала исправьте текущий черновик' : 'Avval joriy qoralamani to‘g‘rilang');
      return;
    }
    try {
      applyDocument(await fetchDocument(id));
    } catch (e) {
      toast.error(errorMessage(e) || (isRu ? 'Ошибка загрузки' : 'Yuklashda xatolik'));
    }
  };

  // ─── Excel import ──────────────────────────────────────────────

  const handleDownloadTemplate = async () => {
    if (!token || !companyId) return;
    try {
      const blob = await apiDownload(openingBalanceImportPaths('').template, { token, tenantId: companyId, locale });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'boshlangich_qoldiqlar_shablon.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : isRu ? 'Не удалось скачать шаблон' : 'Shablonni yuklab bo‘lmadi');
    }
  };

  const resetImport = () => {
    setImportFile(null);
    setImportErrors([]);
    setImportPreview(null);
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    resetImport();
  };

  const importFormData = (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return formData;
  };

  /** The import goes into the draft, so the draft must exist on the server first. */
  const ensureDraftId = async (): Promise<string | null> => {
    if (!(await persist())) {
      toast.error(isRu ? `Сначала ${blockerText(blocker) || 'сохраните черновик'}` : `Avval ${blockerText(blocker) || 'qoralamani saqlang'}`);
      return null;
    }
    return draftRef.current.docId || null;
  };

  /** Step 1: the server validates the file and returns the lines it would save. */
  const handlePreviewImport = async () => {
    if (!importFile || !token || !companyId) return;
    setImporting(true);
    setImportErrors([]);
    setImportPreview(null);
    try {
      const id = await ensureDraftId();
      if (!id) return;
      const result = await apiFetch<ImportValidationResult>(openingBalanceImportPaths(id).preview, {
        token,
        tenantId: companyId,
        locale,
        method: 'POST',
        body: importFormData(importFile),
      });
      setImportPreview(result);
      setImportErrors(result.errors);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : isRu ? 'Ошибка загрузки файла' : 'Faylni yuklashda xatolik');
    } finally {
      setImporting(false);
    }
  };

  /** Step 2: save the previewed lines into the draft. */
  const handleCommitImport = async () => {
    const id = draftRef.current.docId;
    if (!importFile || !token || !companyId || !id) return;
    setImporting(true);
    try {
      const result = await apiFetch<{ success: boolean; message: string; errors?: ImportErrorItem[] }>(
        openingBalanceImportPaths(id).commit,
        { token, tenantId: companyId, locale, method: 'POST', body: importFormData(importFile) },
      );
      if (!result.success) {
        setImportErrors(result.errors ?? []);
        return;
      }
      closeImportModal();
      toast.success(result.message);
      applyDocument(await fetchDocument(id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : isRu ? 'Ошибка импорта' : 'Yuklashda xatolik');
    } finally {
      setImporting(false);
    }
  };

  const importSummary = importPreview ? summarizeImportPreview(importPreview) : null;

  // ─── Line editing ──────────────────────────────────────────────

  const addLine = (category: OpeningBalanceCategory) => {
    if (isReadOnly) return;
    const newLine: OpeningBalanceDraftLine = { ...newOpeningBalanceLine(category) } as OpeningBalanceDraftLine;
    // One warehouse: nothing to choose.
    if (category === 'INVENTORY' && warehouses.length === 1) newLine.warehouseId = warehouses[0].id;
    setLines((prev) => [...prev, newLine]);
    markEdited();
  };

  const removeLine = (index: number) => {
    if (isReadOnly) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
    markEdited();
  };

  const updateLineField = (index: number, field: keyof OpeningBalanceLine, value: LineValue) => {
    if (isReadOnly) return;
    setLines((prev) => {
      const updated = [...prev];
      let target: OpeningBalanceDraftLine = { ...updated[index], [field]: value };

      // muammolar B2: a product picked on an inventory line brings its card
      // cost and that cost's currency, unless a cost was already typed.
      if (target.category === 'INVENTORY' && field === 'productId') {
        target = withProductCost(target, products.find((p) => p.id === value));
      }
      if (target.category === 'INVENTORY' && (field === 'quantity' || field === 'unitCost')) {
        target.amount = Math.round(Number(target.quantity || 0) * Number(target.unitCost || 0) * 100) / 100;
      }
      // A debt/advance kind decides the side: drop a counterparty of the other side.
      if (field === 'category' && isCounterpartyLineKind(String(value)) && target.counterpartyId) {
        const fits = counterpartiesForKind(value as CounterpartyLineKind, counterparties).some((c) => c.id === target.counterpartyId);
        if (!fits) target.counterpartyId = null;
      }
      // D6: a fixed-asset line opens an asset from the register and takes its values.
      if (target.category === 'FIXED_ASSET' && field === 'fixedAssetId') {
        target = withRegisterAsset(target, fixedAssets.find((a) => a.id === value));
      }

      updated[index] = target;
      return updated;
    });
    markEdited();
  };

  const changeOpeningDate = (value: string) => {
    setOpeningDate(value);
    markEdited();
  };

  const changeUsdRate = (value: string) => {
    setUsdRate(value);
    markEdited();
  };

  const handleQuickCreated = async (id: string) => {
    const target = quickCreate;
    setQuickCreate(null);
    if (!target || !token || !companyId) return;
    try {
      if (target.kind === 'product') {
        const product = await apiFetch<Product>(`/inventory/products/${id}`, requestOptions);
        setProducts((prev) => [product, ...prev.filter((p) => p.id !== product.id)]);
        setLines((prev) => prev.map((line, i) => (i === target.index ? withProductCost({ ...line, productId: product.id }, product) : line)));
        markEdited();
      } else if (target.kind === 'counterparty') {
        const counterparty = await apiFetch<Counterparty>(`/sales/counterparties/${id}`, requestOptions);
        setCounterparties((prev) => [counterparty, ...prev.filter((c) => c.id !== counterparty.id)]);
        updateLineField(target.index, 'counterpartyId', counterparty.id);
      }
    } catch (err) {
      toast.error(errorMessage(err) || (isRu ? 'Не удалось загрузить созданную запись' : 'Yaratilgan yozuvni yuklab bo‘lmadi'));
    }
  };

  const handleAssetCreated = (asset: FixedAsset) => {
    const target = quickCreate;
    setQuickCreate(null);
    setFixedAssets((prev) => [asset, ...prev.filter((a) => a.id !== asset.id)]);
    if (target?.kind !== 'fixedAsset') return;
    setLines((prev) => prev.map((line, i) => (i === target.index ? withRegisterAsset(line, asset) : line)));
    markEdited();
  };

  // ─── View data ─────────────────────────────────────────────────

  const bySection = useMemo(() => {
    const of = (key: SectionKey) => linesWhere(effectiveLines, (l) => sectionOf(l.category) === key);
    return { cash: of('cash'), inventory: of('inventory'), debts: of('debts'), 'fixed-assets': of('fixed-assets'), other: of('other') } as Record<SectionKey, IndexedLine[]>;
  }, [effectiveLines]);

  const hasUsdLines = lines.some((l) => l.currency === 'USD');
  const documentOptions: SelectOption[] = documents.map((d) => ({
    value: d.id,
    label: `${d.openingDate ? d.openingDate.slice(0, 10) : ''} — ${
      d.status === 'POSTED' ? (isRu ? 'проведён' : 'tasdiqlangan') : isRu ? 'черновик' : 'qoralama'
    }`,
  }));

  const tableProps = { lines, isReadOnly, locale, isRu, onUpdate: updateLineField, onRemove: removeLine };
  const amountOf = (line: OpeningBalanceDraftLine) => Number(line.amount || 0);
  const countText = (n: number) => {
    if (!isRu) return `${n} ta qator`;
    const [m10, m100] = [n % 10, n % 100];
    const word = m10 === 1 && m100 !== 11 ? 'строка' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'строки' : 'строк';
    return `${n} ${word}`;
  };

  /** What a section adds up to, for its header and the summary. */
  const sectionSummary = (key: SectionKey): string | null => {
    const items = bySection[key];
    if (items.length === 0) return null;
    if (key === 'cash' || key === 'inventory') return sumsByCurrency(items, amountOf, locale);
    if (key === 'fixed-assets') return sumsByCurrency(items, (l) => Math.max(0, Number(l.amount || 0) - Number(l.accumulatedDepreciation || 0)), locale);
    return countText(items.length);
  };

  const STEP_INFO: Record<StepKey, { label: string; title: string; hint: string; icon: LucideIcon }> = {
    date: {
      label: isRu ? 'Дата' : 'Sana',
      title: isRu ? 'С какого дня вы ведёте учёт в программе?' : 'Qaysi kundan boshlab dasturda hisob yuritasiz?',
      hint: isRu ? 'Дальше вы запишете, что было у компании на начало этого дня.' : 'Keyin shu kun boshida kompaniyada nima bor bo‘lganini yozasiz.',
      icon: CalendarDays,
    },
    cash: {
      label: isRu ? 'Деньги' : 'Pul',
      title: isRu ? 'Сколько денег в кассах и на счетах?' : 'Kassa va bankda qancha pul bor?',
      hint: isRu ? 'По строке на каждую кассу или банковский счёт.' : 'Har bir kassa yoki bank hisobi uchun bitta qator.',
      icon: Wallet,
    },
    inventory: {
      label: isRu ? 'Товары' : 'Tovarlar',
      title: isRu ? 'Что и сколько лежит на складе?' : 'Omborda nima va qancha bor?',
      hint: isRu
        ? 'Товар, количество и закупочная цена одной штуки (подставится из карточки). По ней потом считается прибыль.'
        : 'Tovar, miqdori va bittasining olingan narxi (kartochkadan o‘zi qo‘yiladi). Foyda keyin shu narxdan hisoblanadi.',
      icon: Package,
    },
    debts: {
      label: isRu ? 'Долги' : 'Qarzlar',
      title: isRu ? 'Кто кому должен?' : 'Kim kimga qarz?',
      hint: isRu
        ? 'Одна строка — один клиент или поставщик. Когда долг оплатят, он закроется сам.'
        : 'Bitta qator — bitta mijoz yoki yetkazib beruvchi. Qarz to‘langanda o‘zi yopiladi.',
      icon: Users,
    },
    'fixed-assets': {
      label: isRu ? 'Оборудование' : 'Uskunalar',
      title: isRu ? 'Есть оборудование, машины, здания?' : 'Uskuna, mashina, bino bormi?',
      hint: isRu
        ? 'То, чем компания пользуется годами (основные средства). Нет — пропустите.'
        : 'Kompaniya yillab foydalanadigan narsalar (asosiy vositalar). Bo‘lmasa, o‘tkazib yuboring.',
      icon: Building,
    },
    other: {
      label: isRu ? 'Капитал' : 'Kapital',
      title: isRu ? 'Уставный капитал и прочее' : 'Ustav kapitali va boshqalar',
      hint: isRu
        ? 'Обычно не нужно: капитал программа посчитает сама. Впишите уставный капитал, если об этом просит бухгалтер.'
        : 'Odatda kerak emas: kapitalni dastur o‘zi hisoblaydi. Buxgalter so‘rasa, ustav kapitalini yozing.',
      icon: Landmark,
    },
    review: {
      label: isRu ? 'Проверка' : 'Tekshirish',
      title: isPosted ? (isRu ? 'Остатки проведены' : 'Qoldiqlar tasdiqlangan') : isRu ? 'Проверьте и проведите' : 'Tekshiring va tasdiqlang',
      hint: isPosted
        ? isRu
          ? 'Всё, что было введено, и итог.'
          : 'Kiritilgan hamma narsa va yakun.'
        : isRu
          ? 'Посмотрите итог. Если всё верно — проведите, и остатки появятся в кассах, на складе и в расчётах.'
          : 'Yakunni ko‘ring. Hammasi to‘g‘ri bo‘lsa, tasdiqlang — qoldiqlar kassa, ombor va hisob-kitoblarda paydo bo‘ladi.',
      icon: ClipboardCheck,
    },
  };

  const SECTION_ADD: Record<SectionKey, { category: OpeningBalanceCategory; text: string }> = {
    cash: { category: 'CASH', text: isRu ? 'Добавить кассу или счёт' : 'Kassa yoki hisob qo‘shish' },
    inventory: { category: 'INVENTORY', text: isRu ? 'Добавить товар' : 'Tovar qo‘shish' },
    debts: { category: 'CUSTOMER_DEBT', text: isRu ? 'Добавить долг' : 'Qarz qo‘shish' },
    'fixed-assets': { category: 'FIXED_ASSET', text: isRu ? 'Добавить оборудование' : 'Uskuna qo‘shish' },
    other: { category: 'EQUITY', text: isRu ? 'Добавить' : 'Qo‘shish' },
  };

  const stepIndex = STEPS.indexOf(step);
  const prevStep = STEPS[stepIndex - 1];
  const nextStep = STEPS[stepIndex + 1];
  const isSectionStep = (key: StepKey): key is SectionKey => (SECTION_KEYS as StepKey[]).includes(key);

  const stepState = (key: StepKey): 'current' | 'done' | 'skipped' | 'todo' => {
    if (key === step) return 'current';
    if (key === 'date') return currentDoc || lines.length > 0 || visited.has('cash') ? 'done' : 'todo';
    if (key === 'review') return isPosted ? 'done' : 'todo';
    if (bySection[key].length > 0) return 'done';
    return visited.has(key) ? 'skipped' : 'todo';
  };

  const goTo = (key: StepKey) => {
    setStep(key);
    setVisited((prev) => (prev.has(key) ? prev : new Set([...prev, key])));
    flowRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const renderSection = (key: SectionKey) => {
    switch (key) {
      case 'cash':
        return <CashTable {...tableProps} accounts={accounts} />;
      case 'inventory':
        return (
          <InventoryTable {...tableProps} products={products} warehouses={warehouses} onCreateProduct={(index) => setQuickCreate({ kind: 'product', index })} />
        );
      case 'debts':
        return (
          <DebtsTable {...tableProps} counterparties={counterparties} onCreateCounterparty={(index, type) => setQuickCreate({ kind: 'counterparty', index, type })} />
        );
      case 'fixed-assets':
        return (
          <FixedAssetsTable {...tableProps} fixedAssets={fixedAssets} currency={docCurrency} onCreateAsset={(index) => setQuickCreate({ kind: 'fixedAsset', index })} />
        );
      default:
        return <OtherTable {...tableProps} />;
    }
  };

  const docControls = (documents.length > 1 || isPosted) && (
    <div className="ob-docs">
      {documents.length > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{isRu ? 'Другие остатки:' : 'Boshqa qoldiqlar:'}</span>
          <div style={{ width: 240 }}>
            <Select options={documentOptions} value={currentDoc?.id ?? ''} onChange={(id) => void switchDocument(id)} placeholder={isRu ? 'Новый (не сохранён)' : 'Yangi (saqlanmagan)'} size="sm" />
          </div>
        </div>
      )}
      {isPosted && (
        <Button variant="ghost" size="sm" onClick={startNewDraft}>
          <Plus size={14} aria-hidden />
          <span>{isRu ? 'Остатки на другую дату' : 'Boshqa sanaga qoldiq kiritish'}</span>
        </Button>
      )}
    </div>
  );

  // ─── Render ────────────────────────────────────────────────────

  if (!loaded) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
        <Loader2 size={16} className="app-spinner" aria-hidden />
        {isRu ? 'Загрузка…' : 'Yuklanmoqda…'}
      </div>
    );
  }

  const info = STEP_INFO[step];
  const StepIcon = info.icon;
  const summary = isSectionStep(step) ? sectionSummary(step) : null;

  return (
    <div className="ob-page" ref={flowRef}>
      {/* Header: title, save state, Excel */}
      <div className="ob-head">
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', margin: 0 }}>
            {isRu ? 'Начальные остатки' : 'Boshlang‘ich qoldiqlar'}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            {isRu ? 'Что было у компании в день начала работы в программе — по шагам.' : 'Dasturni boshlagan kuningizda kompaniyada nima bor edi — qadamma-qadam.'}
          </p>
        </div>
        <div className="ob-head-actions">
          {isPosted ? (
            <Badge variant="success">{isRu ? 'Проведено' : 'Tasdiqlangan'}</Badge>
          ) : (
            <SaveStatus state={saveState} blocker={blockerText(blocker)} error={saveError} hasDraft={Boolean(currentDoc)} isRu={isRu} onRetry={() => void persist()} />
          )}
          {!isReadOnly && (
            <Button variant="secondary" size="sm" onClick={() => setShowImportModal(true)}>
              <FileSpreadsheet size={16} aria-hidden />
              <span>{isRu ? 'Из Excel' : 'Exceldan yuklash'}</span>
            </Button>
          )}
        </div>
      </div>

      {/* The steps */}
      <nav className="ob-flow" aria-label={isRu ? 'Шаги' : 'Qadamlar'}>
        <ol>
          {STEPS.map((key, i) => {
            const state = stepState(key);
            return (
              <li key={key} data-state={state}>
                <button type="button" onClick={() => goTo(key)} aria-current={state === 'current' ? 'step' : undefined}>
                  <span className="ob-flow-dot" aria-hidden>
                    {state === 'done' ? <Check size={14} strokeWidth={3} /> : i + 1}
                  </span>
                  <span className="ob-flow-label">{STEP_INFO[key].label}</span>
                </button>
              </li>
            );
          })}
        </ol>
        <p className="ob-flow-mobile" aria-hidden>
          {isRu ? 'Шаг' : 'Qadam'} {stepIndex + 1}/{STEPS.length} · {info.label}
        </p>
      </nav>

      {/* The dollar rate, whenever a line is in dollars */}
      {(hasUsdLines || Number(usdRate) > 0) && step !== 'date' && (
        <div className="ob-rate" data-testid="document-usd-rate">
          <label htmlFor="ob-usd-rate" style={{ fontWeight: 500 }}>{isRu ? 'Курс доллара на эту дату:' : 'Shu kundagi dollar kursi:'}</label>
          <span>1 USD =</span>
          <MoneyInput
            id="ob-usd-rate"
            value={usdRate}
            disabled={isReadOnly}
            onValueChange={changeUsdRate}
            decimals={4}
            placeholder={isRu ? 'например, 12 800' : 'masalan, 12 800'}
            aria-label={isRu ? 'Курс USD к UZS на дату остатков' : 'Qoldiq sanasidagi USD ning UZS kursi'}
            style={{ width: 150, borderColor: needsUsdRate(lines, usdRate) && !isReadOnly ? 'var(--color-warning-500)' : undefined }}
          />
          <span>UZS</span>
          <span className="ob-field-hint">{isRu ? 'по нему доллары пересчитаются в сумы' : 'dollar summalar shu kurs bilan so‘mga o‘tkaziladi'}</span>
        </div>
      )}

      {/* The current step */}
      <section className="ob-step-card" aria-labelledby="ob-step-title" key={step}>
        <header className="ob-step-head">
          <span className="ob-step-icon" aria-hidden>
            <StepIcon size={22} />
          </span>
          <div style={{ minWidth: 0, flex: '1 1 260px' }}>
            <span className="ob-step-kicker">
              {isRu ? 'Шаг' : 'Qadam'} {stepIndex + 1} / {STEPS.length}
            </span>
            <h2 id="ob-step-title" className="ob-step-title">{info.title}</h2>
            <p className="ob-step-hint">{info.hint}</p>
          </div>
          {summary && <span className="ob-section-sum tabular-nums">{summary}</span>}
        </header>

        <div className="ob-step-body">
          {step === 'date' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ width: 220 }}>
                <DatePicker value={openingDate} onChange={changeOpeningDate} disabled={isReadOnly} aria-label={info.title} />
              </div>
              <p className="ob-field-hint" style={{ margin: 0 }}>
                {isRu
                  ? 'Обычно это первое число месяца, с которого вы начинаете работать в программе.'
                  : 'Odatda bu dasturda ishlashni boshlagan oyning birinchi kuni.'}
              </p>
              {ratesWereMixed && !isReadOnly && (
                <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-warning-700)' }}>
                  {isRu
                    ? 'В строках были разные курсы USD. Теперь ко всем долларовым строкам применяется один курс.'
                    : 'Qatorlarda turli USD kurslari bor edi. Endi barcha dollardagi qatorlarga bitta kurs qo‘llanadi.'}
                </p>
              )}
              {docControls}
            </div>
          )}

          {isSectionStep(step) &&
            (bySection[step].length > 0 ? (
              <>
                <div style={{ overflowX: 'auto' }}>{renderSection(step)}</div>
                {!isReadOnly && (
                  <div style={{ marginTop: 'var(--space-3)' }}>
                    <Button variant="secondary" size="sm" onClick={() => addLine(SECTION_ADD[step].category)}>
                      <Plus size={14} aria-hidden />
                      <span>{isRu ? 'Добавить ещё' : 'Yana qo‘shish'}</span>
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <div className="ob-empty">
                <span className="ob-empty-icon" aria-hidden>
                  <StepIcon size={28} />
                </span>
                {isReadOnly ? (
                  <p>{isRu ? 'Не заполнено' : 'Kiritilmagan'}</p>
                ) : (
                  <>
                    <p>{isRu ? 'Пока ничего не добавлено.' : 'Hozircha hech narsa qo‘shilmagan.'}</p>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', justifyContent: 'center' }}>
                      <Button variant="primary" onClick={() => addLine(SECTION_ADD[step].category)}>
                        <Plus size={16} aria-hidden />
                        <span>{SECTION_ADD[step].text}</span>
                      </Button>
                      {step === 'inventory' && (
                        <Button variant="secondary" onClick={() => setShowImportModal(true)}>
                          <FileSpreadsheet size={16} aria-hidden />
                          <span>{isRu ? 'Загрузить список из Excel' : 'Ro‘yxatni Exceldan yuklash'}</span>
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}

          {step === 'review' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {isPosted && <PostedLinks isRu={isRu} onFix={() => setShowUnpostModal(true)} />}

              <ul className="ob-review">
                {SECTION_KEYS.map((key) => {
                  const Icon = STEP_INFO[key].icon;
                  const count = bySection[key].length;
                  return (
                    <li key={key}>
                      <button type="button" onClick={() => goTo(key)}>
                        <span className="ob-review-icon" data-done={count > 0 ? 'true' : undefined} aria-hidden>
                          <Icon size={16} />
                        </span>
                        <span className="ob-review-name">{STEP_INFO[key].label}</span>
                        <span className="ob-review-value tabular-nums">
                          {count > 0 ? sectionSummary(key) : <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>{isRu ? 'нет' : 'yo‘q'}</span>}
                        </span>
                        {!isReadOnly && <Pencil size={14} className="ob-review-edit" aria-label={isRu ? 'Изменить' : 'O‘zgartirish'} />}
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="ob-equation" aria-label={isRu ? 'Итоги' : 'Yakunlar'}>
                <div className="ob-eq-item">
                  <span className="ob-eq-label">{isRu ? 'Есть у компании' : 'Kompaniyada bor'}</span>
                  <strong className="tabular-nums">{formatCurrency(totals.totalAssets, locale, docCurrency)}</strong>
                  <span className="ob-eq-hint">{isRu ? 'деньги, товары, долги вам, оборудование' : 'pul, tovar, sizga qarzlar, uskunalar'}</span>
                </div>
                <span className="ob-eq-op" aria-hidden>−</span>
                <div className="ob-eq-item">
                  <span className="ob-eq-label">{isRu ? 'Компания должна' : 'Kompaniya qarzi'}</span>
                  <strong className="tabular-nums">{formatCurrency(totals.totalLiabilities, locale, docCurrency)}</strong>
                  <span className="ob-eq-hint">{isRu ? 'поставщикам и полученные предоплаты' : 'yetkazib beruvchilarga va olingan oldindan to‘lovlar'}</span>
                </div>
                <span className="ob-eq-op" aria-hidden>=</span>
                <div className="ob-eq-item" data-result="true">
                  <span className="ob-eq-label">{isRu ? 'Собственный капитал' : 'O‘z kapitali'}</span>
                  <strong className="tabular-nums" style={{ color: totals.totalEquity < 0 ? 'var(--color-error-700)' : undefined }}>
                    {formatCurrency(totals.totalEquity, locale, docCurrency)}
                  </strong>
                  <span className="ob-eq-hint">
                    {totals.enteredEquity !== 0
                      ? isRu
                        ? `из них уставный ${formatCurrency(totals.enteredEquity, locale, docCurrency)}`
                        : `shundan ustav kapitali ${formatCurrency(totals.enteredEquity, locale, docCurrency)}`
                      : isRu
                        ? 'считается сам'
                        : 'o‘zi hisoblanadi'}
                  </span>
                </div>
              </div>
              {hasUsdLines && (
                <p className="ob-field-hint" style={{ margin: 0 }}>
                  {isRu ? 'Долларовые суммы пересчитаны в сумы по курсу выше.' : 'Dollardagi summalar yuqoridagi kurs bo‘yicha so‘mga o‘tkazilgan.'}
                </p>
              )}
              {!totals.hasValidCurrencyRates && !isReadOnly && (
                <p style={{ display: 'flex', gap: 8, alignItems: 'center', margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-warning-700)' }}>
                  <AlertTriangle size={16} aria-hidden />
                  {isRu ? 'Строки без валюты или без курса доллара пока не вошли в итог.' : 'Valyutasiz yoki dollar kursisiz qatorlar hali jamiga kirmagan.'}
                </p>
              )}
              {isPosted && docControls}
            </div>
          )}
        </div>

        {/* Back / next; the last step posts */}
        <footer className="ob-step-foot">
          {prevStep ? (
            <Button variant="ghost" onClick={() => goTo(prevStep)}>
              <ArrowLeft size={16} aria-hidden />
              <span>{isRu ? 'Назад' : 'Orqaga'}</span>
            </Button>
          ) : (
            <span />
          )}
          <div className="ob-step-foot-end">
            {step === 'review' && !isReadOnly && (currentDoc || lines.length > 0) && (
              <Button variant="danger-ghost" size="sm" onClick={handleClearDraft} disabled={actionLoading}>
                <Trash2 size={14} aria-hidden />
                <span>{isRu ? 'Очистить всё' : 'Hammasini tozalash'}</span>
              </Button>
            )}
            {nextStep && (
              <Button
                variant={isSectionStep(step) && bySection[step].length === 0 && !isReadOnly ? 'secondary' : 'primary'}
                onClick={() => goTo(nextStep)}
              >
                <span>
                  {isSectionStep(step) && bySection[step].length === 0 && !isReadOnly
                    ? isRu
                      ? 'У нас нет — дальше'
                      : 'Bizda yo‘q — keyingisi'
                    : isRu
                      ? `Дальше: ${STEP_INFO[nextStep].label}`
                      : `Keyingi: ${STEP_INFO[nextStep].label}`}
                </span>
                <ArrowRight size={16} aria-hidden />
              </Button>
            )}
            {step === 'review' && !isReadOnly && (
              <Button variant="primary" size="lg" onClick={handlePost} loading={actionLoading} loadingText={isRu ? 'Подождите…' : 'Kuting…'} disabled={lines.length === 0}>
                <CheckCircle2 size={18} aria-hidden />
                <span>{isRu ? 'Провести остатки' : 'Qoldiqlarni tasdiqlash'}</span>
              </Button>
            )}
          </div>
        </footer>
      </section>

      {quickCreate?.kind === 'product' && (
        <CreateProductDrawer isOpen onClose={() => setQuickCreate(null)} onSuccess={(created) => void handleQuickCreated(created.id)} />
      )}
      {quickCreate?.kind === 'counterparty' && (
        <CreateCounterpartyDrawer
          isOpen
          defaultType={quickCreate.type}
          onClose={() => setQuickCreate(null)}
          onSuccess={(created) => void handleQuickCreated(created.id)}
        />
      )}
      {quickCreate?.kind === 'fixedAsset' && (
        <NewFixedAssetModal
          isRu={isRu}
          openingDate={openingDate}
          requestOptions={requestOptions}
          onClose={() => setQuickCreate(null)}
          onCreated={handleAssetCreated}
        />
      )}

      {/* Excel import (template download included) */}
      <Modal icon={<FileSpreadsheet size={20} />} isOpen={showImportModal} title={isRu ? 'Загрузить остатки из Excel' : 'Qoldiqlarni Exceldan yuklash'} onClose={closeImportModal}
        footer={
          <>
            <Button data-dialog-cancel variant="secondary" onClick={closeImportModal}>
              {isRu ? 'Отмена' : 'Bekor qilish'}
            </Button>
            {importSummary?.canCommit ? (
              <Button variant="primary" onClick={handleCommitImport} disabled={importing}>
                <Save size={16} aria-hidden />
                <span>{importing ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : isRu ? 'Загрузить на страницу' : 'Sahifaga yuklash'}</span>
              </Button>
            ) : (
              <Button variant="primary" onClick={handlePreviewImport} disabled={!importFile || importing}>
                <Upload size={16} aria-hidden />
                <span>{importing ? (isRu ? 'Проверка...' : 'Tekshirilmoqda...') : isRu ? 'Проверить файл' : 'Faylni tekshirish'}</span>
              </Button>
            )}
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-1)' }}>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                style={{ background: 'none', border: 'none', padding: 0, minHeight: 32, color: 'var(--color-primary-600)', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <Download size={14} aria-hidden />
                {isRu ? 'Скачайте шаблон' : 'Shablonni yuklab oling'}
              </button>
            </li>
            <li>{isRu ? 'Заполните листы (деньги, товары, клиенты, поставщики).' : 'Varaqlarni to‘ldiring (pul, tovar, mijozlar, yetkazib beruvchilar).'}</li>
            <li>{isRu ? 'Выберите файл и нажмите «Проверить файл».' : 'Faylni tanlang va «Faylni tekshirish»ni bosing.'}</li>
          </ol>

          <div style={{ border: '2px dashed var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', textAlign: 'center', backgroundColor: 'var(--color-bg-subtle)' }}>
            <FileSpreadsheet size={36} color="var(--color-primary-600)" style={{ margin: '0 auto 8px' }} aria-hidden />
            <input
              type="file"
              accept=".xlsx,.xls"
              aria-label={isRu ? 'Файл Excel' : 'Excel fayl'}
              onChange={(e) => {
                resetImport();
                setImportFile(e.target.files?.[0] ?? null);
              }}
              style={{ display: 'block', margin: '0 auto', fontSize: 'var(--text-sm)' }}
            />
          </div>

          {importErrors.length > 0 && (
            <div role="alert" style={{ backgroundColor: 'var(--color-error-50)', border: '1px solid var(--color-error-100)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', maxHeight: '180px', overflowY: 'auto' }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-error-700)', display: 'block', marginBottom: '4px' }}>
                {isRu ? 'В файле есть ошибки — исправьте их и выберите файл снова:' : 'Faylda xatolar bor — tuzatib, faylni qayta tanlang:'}
              </span>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: 'var(--text-xs)', color: 'var(--color-error-700)' }}>
                {importErrors.map((err, idx) => (
                  <li key={idx}>
                    <strong>
                      [{err.sheetName}, {isRu ? 'строка' : 'qator'} {err.rowNumber}]:
                    </strong>{' '}
                    {err.errorMessage}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {importSummary && importPreview && (
            <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', fontSize: 'var(--text-sm)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div>
                {isRu ? 'Строк в файле' : 'Fayldagi qatorlar'}: <strong>{importPreview.totalRows}</strong>
                {' · '}
                {isRu ? 'Готово' : 'Tayyor'}: <strong>{importSummary.lineCount}</strong>
                {' · '}
                {isRu ? 'Ошибок' : 'Xatolar'}: <strong>{importPreview.errors.length}</strong>
              </div>
              {importSummary.byCategory.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {importSummary.byCategory.map(({ category, count }) => (
                    <Badge key={category} variant="info">
                      {IMPORT_CATEGORY_LABELS[category][locale]}: {count}
                    </Badge>
                  ))}
                </div>
              )}
              {importSummary.canCommit && lines.length > 0 && (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', color: 'var(--color-warning-700)' }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} aria-hidden />
                  <span>
                    {isRu
                      ? 'Строки на странице будут заменены строками из файла.'
                      : 'Sahifadagi qatorlar fayldagi qatorlar bilan almashtiriladi.'}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* Fix a posted balance (rollback invariant) */}
      <Modal icon={<LockOpen size={20} />} tone="warning" isOpen={showUnpostModal} title={isRu ? 'Исправить остатки' : 'Qoldiqlarni tuzatish'} onClose={() => setShowUnpostModal(false)}
        footer={
          <>
            <Button data-dialog-cancel variant="secondary" onClick={() => setShowUnpostModal(false)}>
              {isRu ? 'Отмена' : 'Bekor qilish'}
            </Button>
            <Button variant="danger" onClick={handleUnpost} disabled={actionLoading}>
              {actionLoading ? (isRu ? 'Подождите...' : 'Kuting...') : isRu ? 'Открыть для исправления' : 'Tuzatish uchun ochish'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-1)' }}>
          <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-warning-50)', border: '1px solid var(--color-warning-100)', display: 'flex', gap: '10px' }}>
            <AlertTriangle size={20} color="var(--color-warning-700)" style={{ flexShrink: 0, marginTop: '2px' }} aria-hidden />
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-warning-700)' }}>
              {isRu
                ? 'Остатки уберутся из касс, склада и расчётов, страница снова станет редактируемой. Исправьте и проведите заново. Если товар из остатков уже продан или деньги потрачены, открыть нельзя.'
                : 'Qoldiqlar kassa, ombor va hisob-kitoblardan olinadi, sahifa yana tahrirlanadigan bo‘ladi. Tuzating va qayta tasdiqlang. Qoldiqdagi tovar sotilgan yoki pul sarflangan bo‘lsa, ochib bo‘lmaydi.'}
            </p>
          </div>
          <div>
            <label htmlFor="ob-unpost-reason" style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {isRu ? 'Что нужно исправить (необязательно)' : 'Nimani tuzatmoqchisiz (ixtiyoriy)'}
            </label>
            <Input
              id="ob-unpost-reason"
              type="text"
              placeholder={isRu ? 'Например: неверное количество товара' : 'Masalan: tovar miqdori noto‘g‘ri'}
              value={unpostReason}
              onChange={(e) => setUnpostReason(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Building blocks
// ─────────────────────────────────────────────────────────────────────────────

/** Saved / saving / what is missing — always next to the date, in plain words. */
function SaveStatus({ state, blocker, error, hasDraft, isRu, onRetry }: {
  state: SaveState;
  blocker: string;
  error: string;
  hasDraft: boolean;
  isRu: boolean;
  onRetry: () => void;
}) {
  const style: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)' };
  let content: React.ReactNode;
  if (state === 'saving') {
    content = (
      <span style={{ ...style, color: 'var(--color-text-secondary)' }}>
        <Loader2 size={14} className="app-spinner" aria-hidden /> {isRu ? 'Сохраняется…' : 'Saqlanmoqda…'}
      </span>
    );
  } else if (state === 'blocked' && blocker) {
    content = (
      <span style={{ ...style, color: 'var(--color-warning-700)' }}>
        <AlertTriangle size={14} aria-hidden /> {isRu ? `Не сохранено: ${blocker}` : `Saqlanmadi: ${blocker}`}
      </span>
    );
  } else if (state === 'error') {
    content = (
      <span style={{ ...style, color: 'var(--color-error-700)', flexWrap: 'wrap' }}>
        <AlertTriangle size={14} aria-hidden /> {isRu ? `Не сохранено: ${error}` : `Saqlanmadi: ${error}`}
        <Button variant="secondary" size="sm" onClick={onRetry}>{isRu ? 'Повторить' : 'Qayta urinish'}</Button>
      </span>
    );
  } else if (hasDraft) {
    content = (
      <span style={{ ...style, color: 'var(--color-success-700)' }}>
        <Check size={14} aria-hidden /> {isRu ? 'Сохранено' : 'Saqlandi'}
      </span>
    );
  } else {
    content = <span style={{ ...style, color: 'var(--color-text-tertiary)' }}>{isRu ? 'Сохраняется автоматически' : 'Avtomatik saqlanadi'}</span>;
  }
  return <div aria-live="polite">{content}</div>;
}

/** Where a posted opening balance can be seen, and the way to fix it. */
function PostedLinks({ isRu, onFix }: { isRu: boolean; onFix: () => void }) {
  const links = [
    { href: '/finance', label: isRu ? 'Кассы и банк' : 'Kassa va bank' },
    { href: '/inventory', label: isRu ? 'Остатки на складах' : 'Ombor qoldiqlari' },
    { href: '/counterparties', label: isRu ? 'Расчёты с контрагентами' : 'Kontragentlar hisob-kitobi' },
    { href: '/accounting/journal', label: isRu ? 'Журнал проводок' : 'Buxgalteriya jurnali' },
  ];
  return (
    <div role="note" data-testid="opening-balance-posted-links" className="ob-posted">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', gap: 8, alignItems: 'flex-start' }}>
          <CheckCircle2 size={18} color="var(--color-success-700)" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden />
          {isRu
            ? 'Остатки проведены — здесь их можно только посмотреть. Нашли ошибку? Нажмите «Исправить».'
            : 'Qoldiqlar tasdiqlangan — bu yerda faqat ko‘rish mumkin. Xato topdingizmi? «Tuzatish»ni bosing.'}
        </span>
        <Button variant="secondary" size="sm" onClick={onFix}>
          <RotateCcw size={14} aria-hidden />
          <span>{isRu ? 'Исправить' : 'Tuzatish'}</span>
        </Button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
        <span>{isRu ? 'Где их видно:' : 'Qayerda ko‘rinadi:'}</span>
        {links.map((link) => (
          <Link key={link.href} href={link.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600, color: 'var(--color-primary-600)' }}>
            {link.label}
            <ArrowRight size={14} aria-hidden />
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Money ─────────────────────────────────────────────────────────────────

function CashTable({ lines, isReadOnly, accounts, locale, isRu, onUpdate, onRemove }: SubledgerTableProps & { accounts: CashAccount[] }) {
  const filtered = linesWhere(lines, (l) => CASH_CATEGORIES.has(String(l.category)));
  const usable = accounts.filter((account) => isCashAccountCurrencyValid(account));

  return (
    <table style={tableStyle}>
      <thead style={theadStyle}>
        <tr>
          <th style={th({ minWidth: '260px' })}>{isRu ? 'Касса / счёт' : 'Kassa / hisob'}</th>
          <th style={th({ minWidth: '220px', textAlign: 'right' })}>{isRu ? 'Сколько денег' : 'Qancha pul'}</th>
          {!isReadOnly && <th style={th({ width: '50px' })}></th>}
        </tr>
      </thead>
      <tbody>
        {filtered.map(({ line, index }) => (
            <tr key={index} style={rowStyle}>
              <td style={td}>
                <Select
                  value={line.accountId || ''}
                  disabled={isReadOnly}
                  onChange={(value) => {
                    const account = accounts.find((item) => item.id === value);
                    onUpdate(index, 'accountId', value);
                    if (account) {
                      // The kassa decides the currency and whether it is a bank line.
                      onUpdate(index, 'currency', account.currency);
                      onUpdate(index, 'category', account.accountType === 'BANK' ? 'BANK' : 'CASH');
                    }
                  }}
                  style={{ width: '100%', minWidth: 240 }}
                  options={[
                    { value: '', label: isRu ? 'Выберите кассу/банк' : 'Kassa yoki bankni tanlang' },
                    ...usable.map((account) => ({
                      value: account.id,
                      label: (() => {
                        const name = localized(account.name, locale, 'Kassa');
                        return name.includes(account.currency) ? name : `${name} (${account.currency})`;
                      })(),
                    })),
                  ]}
                />
              </td>
              <td style={{ ...td, textAlign: 'right' }}>
                <CurrencyInput
                  value={line.amount || ''}
                  disabled={isReadOnly}
                  onChange={(value) => onUpdate(index, 'amount', value)}
                  min={0}
                  decimals={2}
                  placeholder="0"
                  className="tabular-nums"
                  aria-label={isRu ? 'Сумма' : 'Summa'}
                  style={field('180px', { fontWeight: 600, textAlign: 'right' })}
                />
                <span style={{ display: 'inline-block', minWidth: 36, marginLeft: 8, color: 'var(--color-text-secondary)', textAlign: 'left' }}>{line.currency || ''}</span>
              </td>
              <RemoveCell isReadOnly={isReadOnly} isRu={isRu} onClick={() => onRemove(index)} />
            </tr>
          ))}
      </tbody>
    </table>
  );
}

// ─── Goods ─────────────────────────────────────────────────────────────────

function InventoryTable({
  lines,
  isReadOnly,
  products,
  warehouses,
  locale,
  isRu,
  onUpdate,
  onRemove,
  onCreateProduct,
}: SubledgerTableProps & { products: Product[]; warehouses: Warehouse[]; onCreateProduct: (index: number) => void }) {
  const filtered = linesWhere(lines, (l) => l.category === 'INVENTORY');

  return (
    <table style={tableStyle}>
      <thead style={theadStyle}>
        <tr>
          <th style={th({ minWidth: '240px' })}>{isRu ? 'Товар' : 'Tovar'}</th>
          {warehouses.length > 1 && <th style={th({ minWidth: '180px' })}>{isRu ? 'Склад' : 'Ombor'}</th>}
          <th style={th({ width: '120px', textAlign: 'right' })}>{isRu ? 'Количество' : 'Miqdor'}</th>
          <th style={th({ width: '140px', textAlign: 'right' })}>{isRu ? 'Цена за 1 шт. (закуп)' : '1 donasi (tannarx)'}</th>
          <th style={th({ width: '110px' })}>{isRu ? 'Валюта' : 'Valyuta'}</th>
          <th style={th({ width: '160px', textAlign: 'right' })}>{isRu ? 'Сумма' : 'Summa'}</th>
          {!isReadOnly && <th style={th({ width: '50px' })}></th>}
        </tr>
      </thead>
      <tbody>
        {filtered.map(({ line, index }) => (
            <tr key={index} style={rowStyle}>
              <td style={td}>
                <Select
                  value={line.productId || ''}
                  disabled={isReadOnly}
                  searchable
                  onChange={(value) => onUpdate(index, 'productId', value)}
                  onCreateNew={!isReadOnly ? () => onCreateProduct(index) : undefined}
                  createNewLabel={isRu ? 'Новый товар' : 'Yangi tovar qo‘shish'}
                  style={{ width: '100%' }}
                  options={[
                    { value: '', label: isRu ? 'Выберите товар' : 'Tovarni tanlang' },
                    ...products.map((product) => ({
                      value: product.id,
                      label: `${product.sku ? `[${product.sku}] ` : ''}${localized(product.name, locale, 'Tovar')}`,
                    })),
                  ]}
                />
              </td>
              {warehouses.length > 1 && (
                <td style={td}>
                  <Select
                    value={line.warehouseId || ''}
                    disabled={isReadOnly}
                    onChange={(value) => onUpdate(index, 'warehouseId', value)}
                    style={{ width: '100%' }}
                    options={[
                      { value: '', label: isRu ? 'Выберите склад' : 'Omborni tanlang' },
                      ...warehouses.map((warehouse) => ({ value: warehouse.id, label: localized(warehouse.name, locale, 'Ombor') })),
                    ]}
                  />
                </td>
              )}
              <td style={{ ...td, textAlign: 'right' }}>
                <QuantityInput
                  unit={products.find((product) => product.id === line.productId)?.unitOfMeasure}
                  value={line.quantity || ''}
                  disabled={isReadOnly}
                  onValueChange={(value) => onUpdate(index, 'quantity', Number(value) || 0)}
                  aria-label={isRu ? 'Количество' : 'Miqdor'}
                  style={field('130px', { textAlign: 'right' })}
                />
              </td>
              <td style={{ ...td, textAlign: 'right' }}>
                <CurrencyInput
                  value={line.unitCost || ''}
                  disabled={isReadOnly}
                  onChange={(value) => onUpdate(index, 'unitCost', value)}
                  min={0}
                  decimals={2}
                  placeholder="0"
                  className="tabular-nums"
                  style={field('120px', { textAlign: 'right' })}
                />
              </td>
              <td style={td}>
                <Select
                  options={CURRENCY_OPTIONS}
                  value={line.currency || ''}
                  placeholder={isRu ? 'Валюта' : 'Valyuta'}
                  disabled={isReadOnly}
                  onChange={(value) => onUpdate(index, 'currency', value)}
                  aria-label={isRu ? 'Валюта себестоимости' : 'Tannarx valyutasi'}
                />
              </td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: 'var(--color-text-primary)' }} className="tabular-nums">
                {formatCurrencyIfAvailable(Number(line.amount || 0), locale, line.currency) ?? '—'}
              </td>
              <RemoveCell isReadOnly={isReadOnly} isRu={isRu} onClick={() => onRemove(index)} />
            </tr>
          ))}
      </tbody>
    </table>
  );
}

// ─── Debts & advances (one table) ──────────────────────────────────────────

function DebtsTable({
  lines,
  isReadOnly,
  counterparties,
  locale,
  isRu,
  onUpdate,
  onRemove,
  onCreateCounterparty,
}: SubledgerTableProps & {
  counterparties: Counterparty[];
  onCreateCounterparty: (index: number, type: 'CUSTOMER' | 'SUPPLIER') => void;
}) {
  const filtered = linesWhere(lines, (l) => isCounterpartyLineKind(l.category));
  const kindOptions = (Object.keys(COUNTERPARTY_LINE_KINDS) as CounterpartyLineKind[]).map((kind) => ({
    value: kind,
    label: COUNTERPARTY_LINE_KINDS[kind].label[locale],
  }));

  return (
    <table style={tableStyle}>
      <thead style={theadStyle}>
        <tr>
          <th style={th({ width: '240px' })}>{isRu ? 'Кто кому должен' : 'Kim kimga qarz'}</th>
          <th style={th({ minWidth: '240px' })}>{isRu ? 'Клиент или поставщик' : 'Mijoz yoki yetkazib beruvchi'}</th>
          <th style={th({ minWidth: '180px', textAlign: 'right' })}>{isRu ? 'Сумма' : 'Summa'}</th>
          <th style={th({ width: '110px' })}>{isRu ? 'Валюта' : 'Valyuta'}</th>
          {!isReadOnly && <th style={th({ width: '50px' })}></th>}
        </tr>
      </thead>
      <tbody>
        {filtered.map(({ line, index }) => {
            const kind = line.category as CounterpartyLineKind;
            const side = COUNTERPARTY_LINE_KINDS[kind].side;
            const isAsset = kind === 'CUSTOMER_DEBT' || kind === 'SUPPLIER_ADVANCE';
            return (
              <tr key={index} style={rowStyle}>
                <td style={td}>
                  <Select value={kind} disabled={isReadOnly} onChange={(value) => onUpdate(index, 'category', value)} style={{ width: '100%' }} options={kindOptions} />
                </td>
                <td style={td}>
                  <Select
                    value={line.counterpartyId || ''}
                    disabled={isReadOnly}
                    searchable
                    onChange={(value) => onUpdate(index, 'counterpartyId', value)}
                    onCreateNew={!isReadOnly ? () => onCreateCounterparty(index, side) : undefined}
                    createNewLabel={isRu ? 'Новый контрагент' : 'Yangi kontragent qo‘shish'}
                    style={{ width: '100%', maxWidth: '300px' }}
                    options={[
                      { value: '', label: isRu ? 'Выберите контрагента' : 'Kontragentni tanlang' },
                      ...counterpartiesForKind(kind, counterparties).map((counterparty) => ({
                        value: counterparty.id,
                        label: counterparty.name,
                        description: counterparty.inn ? `STIR: ${counterparty.inn}` : undefined,
                      })),
                    ]}
                  />
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <CurrencyInput
                    value={line.amount || ''}
                    disabled={isReadOnly}
                    onChange={(value) => onUpdate(index, 'amount', value)}
                    min={0}
                    decimals={2}
                    placeholder="0"
                    className="tabular-nums"
                    style={field('180px', { fontWeight: 600, textAlign: 'right', color: isAsset ? 'var(--color-success-700)' : 'var(--color-error-700)' })}
                  />
                </td>
                <td style={td}>
                  <Select
                    options={CURRENCY_OPTIONS}
                    value={line.currency || ''}
                    placeholder={isRu ? 'Валюта' : 'Valyuta'}
                    disabled={isReadOnly}
                    onChange={(currency) => onUpdate(index, 'currency', currency)}
                  />
                </td>
                <RemoveCell isReadOnly={isReadOnly} isRu={isRu} onClick={() => onRemove(index)} />
              </tr>
            );
          })}
      </tbody>
    </table>
  );
}

// ─── Fixed assets ──────────────────────────────────────────────────────────

function FixedAssetsTable({
  lines,
  isReadOnly,
  locale,
  isRu,
  currency,
  fixedAssets,
  onUpdate,
  onRemove,
  onCreateAsset,
}: SubledgerTableProps & { fixedAssets: FixedAsset[]; currency?: string; onCreateAsset: (index: number) => void }) {
  const filtered = linesWhere(lines, (l) => l.category === 'FIXED_ASSET');

  return (
    <>
    {/* B6 / D6: depreciation is not computed by the system after posting. */}
    <p
      data-testid="fixed-asset-depreciation-notice"
      style={{ margin: '0 0 var(--space-3)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-warning-50)', color: 'var(--color-warning-700)', fontSize: 'var(--text-sm)' }}
    >
      {isRu
        ? 'Выберите из списка или нажмите «Новое средство» и впишите цену покупки и износ (кнопка «Рассчитать» посчитает). Амортизация не рассчитывается автоматически и после проведения.'
        : 'Ro‘yxatdan tanlang yoki «Yangi asosiy vosita»ni bosib, sotib olingan narxi va eskirishini yozing («Hisoblash» tugmasi hisoblab beradi). Eskirish tizimda avtomatik hisoblanmaydi, tasdiqlangandan keyin ham.'}
    </p>
    <table style={tableStyle}>
      <thead style={theadStyle}>
        <tr>
          <th style={th({ minWidth: '260px' })}>{isRu ? 'Что это' : 'Nima'}</th>
          <th style={th({ width: '140px' })}>{isRu ? 'Инв. номер' : 'Inv. raqam'}</th>
          <th style={th({ width: '160px', textAlign: 'right' })}>{isRu ? 'Купили за' : 'Olingan narxi'}</th>
          <th style={th({ width: '160px', textAlign: 'right' })}>{isRu ? 'Износ' : 'Eskirgan qismi'}</th>
          <th style={th({ width: '160px', textAlign: 'right' })}>{isRu ? 'Стоит сейчас' : 'Hozirgi qiymati'}</th>
          {!isReadOnly && <th style={th({ width: '50px' })}></th>}
        </tr>
      </thead>
      <tbody>
        {filtered.map(({ line, index }) => {
            const initCost = Number(line.amount || 0);
            const accDep = Number(line.accumulatedDepreciation || 0);
            const netBookValue = Math.max(0, initCost - accDep);
            // Rejected by the server as well (B6): never clamp silently.
            const overDepreciated = accDep > initCost;
            return (
              <tr key={index} style={rowStyle}>
                <td style={td}>
                  <div data-testid="fixed-asset-register-select">
                    <Select
                      value={line.fixedAssetId || ''}
                      disabled={isReadOnly}
                      onChange={(value) => onUpdate(index, 'fixedAssetId', value)}
                      onCreateNew={!isReadOnly ? () => onCreateAsset(index) : undefined}
                      createNewLabel={isRu ? 'Новое средство' : 'Yangi asosiy vosita'}
                      searchable
                      style={{ width: '100%' }}
                      options={[
                        { value: '', label: isRu ? 'Выберите средство' : 'Vositani tanlang' },
                        ...fixedAssets.map((asset) => ({ value: asset.id, label: asset.name, description: asset.inventoryNumber })),
                      ]}
                    />
                  </div>
                </td>
                <td style={{ ...td, color: 'var(--color-text-secondary)' }}>{line.contractNumber || '—'}</td>
                {/* Values come from the register (D6): shown, not typed. */}
                <td style={{ ...td, textAlign: 'right' }} className="tabular-nums">
                  {line.fixedAssetId ? formatCurrency(initCost, locale, 'UZS') : '—'}
                </td>
                <td style={{ ...td, textAlign: 'right', color: 'var(--color-error-700)' }} className="tabular-nums">
                  {line.fixedAssetId ? formatCurrency(accDep, locale, 'UZS') : '—'}
                </td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: overDepreciated ? 'var(--color-error-700)' : 'var(--color-success-700)' }} className="tabular-nums">
                  {overDepreciated ? (
                    <span data-testid="fixed-asset-over-depreciated">{isRu ? 'Амортизация больше стоимости' : 'Eskirish qiymatdan katta'}</span>
                  ) : line.fixedAssetId ? (
                    formatCurrencyIfAvailable(netBookValue, locale, line.currency, currency) ?? '—'
                  ) : (
                    '—'
                  )}
                </td>
                <RemoveCell isReadOnly={isReadOnly} isRu={isRu} onClick={() => onRemove(index)} />
              </tr>
            );
          })}
      </tbody>
    </table>
    </>
  );
}

/**
 * Adds an asset to the fixed-asset register from the opening-balance page
 * (there is no separate register screen yet) and puts it on the line.
 * Accumulated depreciation can be suggested by the straight-line method at
 * the opening date (B6, owner option c); the user may change it.
 */
function NewFixedAssetModal({
  isRu,
  openingDate,
  requestOptions,
  onClose,
  onCreated,
}: {
  isRu: boolean;
  openingDate: string;
  requestOptions: { token?: string; tenantId?: string; locale: Locale };
  onClose: () => void;
  onCreated: (asset: FixedAsset) => void;
}) {
  const [name, setName] = useState('');
  const [inventoryNumber, setInventoryNumber] = useState('');
  const [acquisitionDate, setAcquisitionDate] = useState('');
  const [initialCost, setInitialCost] = useState<number | ''>('');
  const [usefulLifeMonths, setUsefulLifeMonths] = useState('60');
  const [accumulatedDepreciation, setAccumulatedDepreciation] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);

  const suggestion = suggestedStraightLineDepreciation({
    cost: Number(initialCost),
    acquisitionDate,
    usefulLifeMonths: Number(usefulLifeMonths),
    asOf: openingDate,
  });
  const overDepreciated = Number(accumulatedDepreciation || 0) > Number(initialCost || 0);

  const label = (text: string) => (
    <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>{text}</label>
  );

  const submit = async () => {
    if (!name.trim() || !inventoryNumber.trim() || !(Number(initialCost) > 0)) {
      toast.error(isRu ? 'Укажите название, инвентарный номер и стоимость' : 'Nomi, inventar raqami va qiymatini kiriting');
      return;
    }
    if (overDepreciated) {
      toast.error(isRu ? 'Амортизация не может превышать стоимость' : 'Eskirish qiymatdan katta bo‘lishi mumkin emas');
      return;
    }
    setSaving(true);
    try {
      const asset = await apiFetch<FixedAsset>('/fixed-assets', {
        ...requestOptions,
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          inventoryNumber: inventoryNumber.trim(),
          acquisitionDate: acquisitionDate || undefined,
          initialCost: Number(initialCost),
          accumulatedDepreciation: Number(accumulatedDepreciation || 0),
          usefulLifeMonths: Number(usefulLifeMonths) > 0 ? Math.round(Number(usefulLifeMonths)) : undefined,
          depreciationMethod: 'STRAIGHT_LINE',
        }),
      });
      toast.success(isRu ? 'Средство добавлено в реестр' : 'Vosita reyestrga qo‘shildi');
      onCreated(asset);
    } catch (e) {
      toast.error(errorMessage(e) || (isRu ? 'Не удалось создать средство' : 'Vositani yaratib bo‘lmadi'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal icon={<Building2 size={20} />} isOpen title={isRu ? 'Новое основное средство' : 'Yangi asosiy vosita'} onClose={onClose}
      footer={
        <>
          <Button data-dialog-cancel variant="secondary" onClick={onClose}>
            {isRu ? 'Отмена' : 'Bekor qilish'}
          </Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : isRu ? 'Добавить' : 'Qo‘shish'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', padding: 'var(--space-1)' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          {label(isRu ? 'Название' : 'Nomi')}
          <Input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={isRu ? 'Например: лазерный станок' : 'Masalan: lazerli kesish stanogi'} />
        </div>
        <div>
          {label(isRu ? 'Инвентарный номер' : 'Inventar raqami')}
          <Input type="text" value={inventoryNumber} onChange={(e) => setInventoryNumber(e.target.value)} />
        </div>
        <div>
          {label(isRu ? 'Дата приобретения' : 'Olingan sana')}
          <DatePicker value={acquisitionDate} onChange={setAcquisitionDate} />
        </div>
        <div>
          {label(isRu ? 'Первоначальная стоимость (UZS)' : 'Boshlang‘ich qiymat (UZS)')}
          <CurrencyInput value={initialCost} onChange={(v) => setInitialCost(v)} min={0} decimals={2} placeholder="0" style={field('100%', { textAlign: 'right' })} />
        </div>
        <div>
          {label(isRu ? 'Срок службы (мес.)' : 'Foydalanish muddati (oy)')}
          <QuantityInput
            unit={isRu ? 'мес.' : 'oy'}
            value={usefulLifeMonths}
            onValueChange={setUsefulLifeMonths}
            decimals={0}
            aria-label={isRu ? 'Срок службы' : 'Foydalanish muddati'}
          />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          {label(isRu ? `Накопленная амортизация на ${openingDate} (UZS)` : `${openingDate} holatiga jamg‘arilgan eskirish (UZS)`)}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <CurrencyInput
              value={accumulatedDepreciation}
              onChange={(v) => setAccumulatedDepreciation(v)}
              min={0}
              decimals={2}
              placeholder="0"
              style={field('100%', { textAlign: 'right', borderColor: overDepreciated ? 'var(--color-error-500)' : 'var(--color-border)' })}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={suggestion === null}
              onClick={() => suggestion !== null && setAccumulatedDepreciation(suggestion)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
              title={isRu ? 'Линейный метод: стоимость × месяцы использования ÷ срок службы' : 'Chiziqli usul: qiymat × foydalanilgan oylar ÷ foydalanish muddati'}
            >
              <Calculator size={14} />
              {isRu ? 'Рассчитать' : 'Hisoblash'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── Capital & other ───────────────────────────────────────────────────────

function OtherTable({ lines, isReadOnly, isRu, onUpdate, onRemove }: SubledgerTableProps) {
  const filtered = linesWhere(lines, (l) => OTHER_CATEGORIES.has(String(l.category)));

  return (
    <table style={tableStyle}>
      <thead style={theadStyle}>
        <tr>
          <th style={th({ width: '240px' })}>{isRu ? 'Что это' : 'Nima'}</th>
          <th style={th({ minWidth: '220px' })}>{isRu ? 'Описание' : 'Tavsif'}</th>
          <th style={th({ minWidth: '180px', textAlign: 'right' })}>{isRu ? 'Сумма (UZS)' : 'Summa (UZS)'}</th>
          {!isReadOnly && <th style={th({ width: '50px' })}></th>}
        </tr>
      </thead>
      <tbody>
        {filtered.map(({ line, index }) => (
            <tr key={index} style={rowStyle}>
              <td style={td}>
                <Select
                  value={line.category ?? ''}
                  disabled={isReadOnly}
                  onChange={(value) => onUpdate(index, 'category', value)}
                  style={{ width: '100%' }}
                  options={[
                    { value: 'EQUITY', label: isRu ? 'Уставный капитал' : 'Ustav kapitali' },
                    { value: 'OTHER_ASSET', label: isRu ? 'Прочее, что есть у компании' : 'Kompaniyada bor boshqa narsa', description: isRu ? 'Например: переплата налога' : 'Masalan: soliq ortiqcha to‘lovi' },
                    { value: 'OTHER_LIABILITY', label: isRu ? 'Прочий долг компании' : 'Kompaniyaning boshqa qarzi', description: isRu ? 'Например: зарплата или налог к уплате' : 'Masalan: to‘lanmagan ish haqi yoki soliq' },
                  ]}
                />
              </td>
              <td style={td}>
                <NotesInput
                  line={line}
                  index={index}
                  isReadOnly={isReadOnly}
                  isRu={isRu}
                  onUpdate={onUpdate}
                  placeholder={isRu ? 'Например: переплата по налогу...' : 'Masalan: soliq ortiqcha to‘lovi...'}
                />
              </td>
              <td style={{ ...td, textAlign: 'right' }}>
                <CurrencyInput
                  value={line.amount || ''}
                  disabled={isReadOnly}
                  onChange={(value) => onUpdate(index, 'amount', value)}
                  min={0}
                  decimals={2}
                  placeholder="0"
                  className="tabular-nums"
                  style={field('180px', { fontWeight: 600, textAlign: 'right' })}
                />
              </td>
              <RemoveCell isReadOnly={isReadOnly} isRu={isRu} onClick={() => onRemove(index)} />
            </tr>
          ))}
      </tbody>
    </table>
  );
}
