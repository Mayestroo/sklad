'use client';

import { MoneyInput } from '@/components/ui/MoneyInput';
import { QuantityInput } from '@/components/ui/QuantityInput';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  linesMissingCurrency,
  needsUsdRate,
  newOpeningBalanceLine,
  suggestedStraightLineDepreciation,
  withDocumentRate,
  withProductCost,
  withRegisterAsset,
  type CounterpartyLineKind,
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
  Wallet,
  Package,
  Users,
  Building2,
  Layers,
  TrendingUp,
  TrendingDown,
  Building,
  ArrowRight,
  Calculator,
} from 'lucide-react';
import type {
  OpeningBalanceDocument,
  OpeningBalanceLine,
  OpeningBalanceCategory,
  OpeningBalanceStatus,
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
 * Opening balances, simplified:
 *  - five tabs: money, goods, debts & advances, fixed assets, capital & other;
 *  - one USD rate for the whole document (the opening date's rate);
 *  - capital balances itself: what is not entered as ustav kapitali is posted
 *    as retained earnings (8710), so there is no "balance difference" to fix;
 *  - posting saves first, then opens every line in its own module (kassa,
 *    warehouse FIFO batch, counterparty settlement, fixed-asset register,
 *    journal), and the page links to each of them.
 */

type TabKey = 'cash' | 'inventory' | 'debts' | 'fixed-assets' | 'other';
type OpeningBalanceDraftLine = Omit<Partial<OpeningBalanceLine>, 'exchangeRate'> & { exchangeRate?: number | string };
type LineValue = OpeningBalanceDraftLine[keyof OpeningBalanceDraftLine];
type IndexedLine = { line: OpeningBalanceDraftLine; index: number };
type Locale = 'uz' | 'ru';

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

const firstDayOfMonth = () => `${new Date().toISOString().slice(0, 8)}01`;

const localized = (name: unknown, locale: Locale, fallback: string): string => {
  if (!name) return fallback;
  if (typeof name === 'string') return name;
  const n = name as Partial<Record<Locale, string>>;
  return n[locale] || n.uz || n.ru || fallback;
};

// ─── Shared table styles ────────────────────────────────────────────────────

const th = (extra?: React.CSSProperties): React.CSSProperties => ({
  padding: '12px 16px',
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  color: 'var(--color-text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  ...extra,
});
const td: React.CSSProperties = { padding: '10px 16px' };
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
const theadStyle: React.CSSProperties = { backgroundColor: 'var(--color-bg-subtle)', borderBottom: '1px solid var(--color-border-light)' };
const rowStyle: React.CSSProperties = { borderBottom: '1px solid var(--color-border-light)' };

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <tr>
      <td colSpan={colSpan} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
        {text}
      </td>
    </tr>
  );
}

function RemoveCell({ isReadOnly, isRu, onClick }: { isReadOnly: boolean; isRu: boolean; onClick: () => void }) {
  if (isReadOnly) return null;
  return (
    <td style={{ ...td, textAlign: 'center' }}>
      <button
        type="button"
        onClick={onClick}
        style={{ background: 'none', border: 'none', color: 'var(--color-error-500)', cursor: 'pointer', padding: '4px' }}
        title={isRu ? 'Удалить' : 'O‘chirish'}
      >
        <Trash2 size={16} />
      </button>
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

  // Documents
  const [documents, setDocuments] = useState<OpeningBalanceDocument[]>([]);
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [currentDoc, setCurrentDoc] = useState<OpeningBalanceDocument | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('cash');

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

  // Working document
  const [lines, setLines] = useState<OpeningBalanceDraftLine[]>([]);
  const [openingDate, setOpeningDate] = useState<string>(firstDayOfMonth());
  const [notes, setNotes] = useState<string>('');
  // One USD rate for the whole document (rate at the opening date).
  const [usdRate, setUsdRate] = useState<string>('');
  const [ratesWereMixed, setRatesWereMixed] = useState(false);

  // Modals
  const [showNewDocModal, setShowNewDocModal] = useState(false);
  const [newDocDate, setNewDocDate] = useState(firstDayOfMonth());
  const [newDocNotes, setNewDocNotes] = useState('');

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

  const loadDocuments = useCallback(async () => {
    if (!token || !companyId) return;
    try {
      const docs = await apiFetch<OpeningBalanceDocument[]>('/opening-balances', requestOptions);
      setDocuments(docs || []);
      if (docs && docs.length > 0) {
        setSelectedDocId((current) => (current && docs.some((d) => d.id === current) ? current : docs[0].id));
      } else {
        setSelectedDocId('');
        setCurrentDoc(null);
        setLines([]);
      }
    } catch (e) {
      toast.error(errorMessage(e) || (isRu ? 'Ошибка при загрузке документов' : 'Hujjatlarni yuklashda xatolik'));
    } finally {
      setDocumentsLoaded(true);
    }
  }, [token, companyId, requestOptions, isRu]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const loadDocumentDetails = useCallback(
    async (id: string) => {
      if (!token || !companyId || !id) return;
      try {
        const doc = await apiFetch<OpeningBalanceDocument>(`/opening-balances/${id}`, requestOptions);
        const docLines = doc.lines || [];
        const { rate, mixed } = documentUsdRate(docLines);
        setCurrentDoc(doc);
        setLines(docLines);
        setUsdRate(rate);
        setRatesWereMixed(mixed);
        setOpeningDate(doc.openingDate ? doc.openingDate.slice(0, 10) : firstDayOfMonth());
        setNotes(doc.notes || '');
      } catch (e) {
        toast.error(errorMessage(e) || (isRu ? 'Ошибка загрузки документа' : 'Hujjat tafsilotlarini yuklashda xatolik'));
      }
    },
    [token, companyId, requestOptions, isRu],
  );

  useEffect(() => {
    if (selectedDocId) loadDocumentDetails(selectedDocId);
  }, [selectedDocId, loadDocumentDetails]);

  // ─── Totals (same rules the server posts with) ─────────────────

  const effectiveLines = useMemo(() => withDocumentRate(lines, usdRate), [lines, usdRate]);
  const totals = useMemo(() => computeOpeningBalanceTotals(effectiveLines), [effectiveLines]);

  const isReadOnly = currentDoc?.status === 'POSTED' || currentDoc?.status === 'CANCELLED';
  const isPosted = currentDoc?.status === 'POSTED';
  const importSummary = importPreview ? summarizeImportPreview(importPreview) : null;
  const hasUsdLines = lines.some((l) => l.currency === 'USD');

  // ─── Actions ───────────────────────────────────────────────────

  /** Client checks that need the user, not the server. */
  const readyToSend = (): boolean => {
    const missingCurrencyRows = linesMissingCurrency(lines);
    if (missingCurrencyRows.length > 0) {
      toast.error(
        isRu
          ? `Выберите валюту в каждой строке (строки: ${missingCurrencyRows.join(', ')})`
          : `Har bir qatorda valyutani tanlang (qatorlar: ${missingCurrencyRows.join(', ')})`,
      );
      return false;
    }
    if (needsUsdRate(lines, usdRate)) {
      toast.error(isRu ? 'Укажите курс USD на дату остатков' : 'Qoldiq sanasidagi USD kursini kiriting');
      return false;
    }
    return true;
  };

  const saveLines = async () => {
    await apiFetch(`/opening-balances/${selectedDocId}/lines`, {
      ...requestOptions,
      method: 'PUT',
      body: JSON.stringify({ openingDate, notes, lines: effectiveLines }),
    });
  };

  const handleSaveLines = async () => {
    if (!token || !companyId || !selectedDocId || !readyToSend()) return;
    setActionLoading(true);
    try {
      await saveLines();
      toast.success(isRu ? 'Изменения сохранены' : 'Boshlang‘ich qoldiqlar saqlandi');
      loadDocumentDetails(selectedDocId);
    } catch (e) {
      toast.error(errorMessage(e) || (isRu ? 'Ошибка при сохранении' : 'Saqlashda xatolik yuz berdi'));
    } finally {
      setActionLoading(false);
    }
  };

  /** Saves the current lines, then posts them (no separate save step). */
  const handlePost = async () => {
    if (!token || !companyId || !selectedDocId || !readyToSend()) return;
    if (lines.length === 0) {
      toast.error(isRu ? 'Добавьте хотя бы одну строку' : 'Kamida bitta qator qo‘shing');
      return;
    }
    const ok = await confirm({
      title: isRu ? 'Провести начальные остатки?' : 'Boshlang‘ich qoldiqlarni tasdiqlaysizmi?',
      description: isRu
        ? 'Деньги попадут в кассы, товары — на склады (партии FIFO), долги и авансы — в расчёты с контрагентами, основные средства станут активными, будет создана проводка в журнале. Разница между активами, обязательствами и уставным капиталом будет записана как нераспределённая прибыль (8710).'
        : 'Pul kassalarga, tovarlar omborga (FIFO partiyalari), qarz va avanslar kontragentlar hisob-kitobiga tushadi, asosiy vositalar faollashadi va jurnalda provodka yaratiladi. Aktivlar, majburiyatlar va ustav kapitali orasidagi farq taqsimlanmagan foyda (8710) sifatida yoziladi.',
      variant: 'info',
      confirmText: isRu ? 'Провести' : 'Tasdiqlash',
      cancelText: isRu ? 'Отмена' : 'Bekor qilish',
    });
    if (!ok) return;

    setActionLoading(true);
    try {
      await saveLines();
      await apiFetch(`/opening-balances/${selectedDocId}/post`, { ...requestOptions, method: 'POST' });
      toast.success(
        isRu
          ? 'Остатки проведены: кассы, склады, расчёты и журнал обновлены.'
          : 'Boshlang‘ich qoldiqlar tasdiqlandi: kassa, ombor, hisob-kitoblar va jurnal yangilandi.',
      );
      loadDocuments();
      loadDocumentDetails(selectedDocId);
    } catch (e) {
      toast.error(errorMessage(e) || (isRu ? 'Ошибка проведения' : 'Tasdiqlashda xatolik'));
      loadDocumentDetails(selectedDocId);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnpost = async () => {
    if (!token || !companyId || !selectedDocId) return;
    setActionLoading(true);
    try {
      await apiFetch(`/opening-balances/${selectedDocId}/unpost`, {
        ...requestOptions,
        method: 'POST',
        body: JSON.stringify({ reason: unpostReason || undefined }),
      });
      setShowUnpostModal(false);
      setUnpostReason('');
      toast.success(isRu ? 'Документ переоткрыт (черновик).' : 'Hujjat qayta ochildi (qoralama).');
      loadDocuments();
      loadDocumentDetails(selectedDocId);
    } catch (e) {
      toast.error(errorMessage(e) || (isRu ? 'Ошибка переоткрытия' : 'Hujjatni qayta ochishda xatolik'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteDocument = async () => {
    if (!token || !companyId || !selectedDocId) return;
    const ok = await confirm({
      title: isRu ? 'Удалить черновик?' : 'Qoralamani o‘chirasizmi?',
      description: isRu ? 'Все строки документа будут удалены.' : 'Hujjatning barcha qatorlari o‘chiriladi.',
      variant: 'danger',
      confirmText: isRu ? 'Удалить' : 'O‘chirish',
      cancelText: isRu ? 'Отмена' : 'Bekor qilish',
    });
    if (!ok) return;
    setActionLoading(true);
    try {
      await apiFetch(`/opening-balances/${selectedDocId}`, { ...requestOptions, method: 'DELETE' });
      toast.success(isRu ? 'Документ удалён' : 'Hujjat o‘chirildi');
      setSelectedDocId('');
      loadDocuments();
    } catch (e) {
      toast.error(errorMessage(e) || (isRu ? 'Ошибка удаления' : 'O‘chirishda xatolik'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateDocument = async () => {
    if (!token || !companyId) return;
    setActionLoading(true);
    try {
      const created = await apiFetch<OpeningBalanceDocument>('/opening-balances', {
        ...requestOptions,
        method: 'POST',
        body: JSON.stringify({ openingDate: newDocDate, notes: newDocNotes.trim() || undefined, lines: [] }),
      });
      setShowNewDocModal(false);
      setNewDocNotes('');
      toast.success(isRu ? 'Документ создан' : 'Hujjat yaratildi');
      setSelectedDocId(created.id);
      await loadDocuments();
    } catch (e) {
      toast.error(errorMessage(e) || (isRu ? 'Ошибка создания' : 'Yaratishda xatolik'));
    } finally {
      setActionLoading(false);
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

  /** Step 1: the server validates the file and returns the lines it would save. */
  const handlePreviewImport = async () => {
    if (!importFile || !token || !companyId || !selectedDocId) return;
    setImporting(true);
    setImportErrors([]);
    setImportPreview(null);
    try {
      const result = await apiFetch<ImportValidationResult>(openingBalanceImportPaths(selectedDocId).preview, {
        token,
        tenantId: companyId,
        locale,
        method: 'POST',
        body: importFormData(importFile),
      });
      setImportPreview(result);
      setImportErrors(result.errors);
      if (result.errors.length > 0) {
        toast.error(isRu ? 'Ошибки валидации Excel' : 'Excel faylda xatoliklar aniqlandi');
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : isRu ? 'Ошибка загрузки файла' : 'Faylni yuklashda xatolik');
    } finally {
      setImporting(false);
    }
  };

  /** Step 2: save the previewed lines into the draft document. */
  const handleCommitImport = async () => {
    if (!importFile || !token || !companyId || !selectedDocId) return;
    setImporting(true);
    try {
      const result = await apiFetch<{ success: boolean; message: string; errors?: ImportErrorItem[] }>(
        openingBalanceImportPaths(selectedDocId).commit,
        { token, tenantId: companyId, locale, method: 'POST', body: importFormData(importFile) },
      );
      if (!result.success) {
        setImportErrors(result.errors ?? []);
        toast.error(result.message || (isRu ? 'Ошибки валидации Excel' : 'Excel faylda xatoliklar aniqlandi'));
        return;
      }
      closeImportModal();
      toast.success(result.message);
      loadDocumentDetails(selectedDocId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : isRu ? 'Ошибка импорта' : 'Yuklashda xatolik');
    } finally {
      setImporting(false);
    }
  };

  // ─── Line editing ──────────────────────────────────────────────

  const addLine = (category: OpeningBalanceCategory) => {
    if (isReadOnly) return;
    const newLine: OpeningBalanceDraftLine = { ...newOpeningBalanceLine(category) } as OpeningBalanceDraftLine;
    // One warehouse: nothing to choose.
    if (category === 'INVENTORY' && warehouses.length === 1) newLine.warehouseId = warehouses[0].id;
    setLines((prev) => [...prev, newLine]);
  };

  const removeLine = (index: number) => {
    if (isReadOnly) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
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
  };

  // ─── View helpers ──────────────────────────────────────────────

  const getDocStatusBadge = (st: OpeningBalanceStatus) => {
    switch (st) {
      case 'DRAFT':
        return <Badge variant="warning">{isRu ? 'Черновик' : 'Qoralama'}</Badge>;
      case 'PENDING_REVIEW':
        return <Badge variant="info">{isRu ? 'На проверке' : 'Tekshirishda'}</Badge>;
      case 'POSTED':
        return <Badge variant="success">{isRu ? 'Проведён' : 'Tasdiqlangan'}</Badge>;
      case 'CANCELLED':
        return <Badge variant="error">{isRu ? 'Отменён' : 'Bekor qilingan'}</Badge>;
      default:
        return <Badge variant="neutral">{st}</Badge>;
    }
  };

  const documentOptions: SelectOption[] = documents.map((d) => ({
    value: d.id,
    label: `${d.docNumber} (${d.openingDate ? d.openingDate.slice(0, 10) : ''}) — ${
      d.status === 'POSTED' ? (isRu ? 'Проведён' : 'Tasdiqlangan') : isRu ? 'Черновик' : 'Qoralama'
    }`,
  }));

  const tabCounts = useMemo(() => {
    const counts = { cash: 0, inventory: 0, debts: 0, fixedAssets: 0, other: 0 };
    for (const l of lines) {
      if (CASH_CATEGORIES.has(String(l.category))) counts.cash++;
      else if (l.category === 'INVENTORY') counts.inventory++;
      else if (isCounterpartyLineKind(l.category)) counts.debts++;
      else if (l.category === 'FIXED_ASSET') counts.fixedAssets++;
      else counts.other++;
    }
    return counts;
  }, [lines]);

  const navTabs = [
    { key: 'cash' as TabKey, label: isRu ? 'Деньги' : 'Pul mablag‘lari', icon: Wallet, count: tabCounts.cash },
    { key: 'inventory' as TabKey, label: isRu ? 'Товары' : 'Tovarlar', icon: Package, count: tabCounts.inventory },
    { key: 'debts' as TabKey, label: isRu ? 'Долги и авансы' : 'Qarzlar va avanslar', icon: Users, count: tabCounts.debts },
    { key: 'fixed-assets' as TabKey, label: isRu ? 'Основные средства' : 'Asosiy vositalar', icon: Building, count: tabCounts.fixedAssets },
    { key: 'other' as TabKey, label: isRu ? 'Капитал и прочее' : 'Kapital va boshqalar', icon: Layers, count: tabCounts.other },
  ];

  const tableProps = { lines, isReadOnly, locale, isRu, onUpdate: updateLineField, onRemove: removeLine };

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div style={{ maxWidth: 720 }}>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', margin: 0 }}>
            {isRu ? 'Начальные остатки' : 'Boshlang‘ich qoldiqlar'}
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            {isRu
              ? 'Укажите, что есть у компании на дату начала учёта: деньги, товары, долги, основные средства. Капитал рассчитывается автоматически.'
              : 'Hisob boshlanadigan sanadagi bor narsani kiriting: pul, tovar, qarzlar, asosiy vositalar. Kapital avtomatik hisoblanadi.'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Button variant="secondary" onClick={() => setShowImportModal(true)} disabled={!currentDoc || isReadOnly} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileSpreadsheet size={16} />
            <span>Excel</span>
          </Button>
          <Button variant="primary" onClick={() => setShowNewDocModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} />
            <span>{isRu ? 'Новый документ' : 'Yangi hujjat'}</span>
          </Button>
        </div>
      </div>

      {documentsLoaded && documents.length === 0 ? (
        <Card style={{ padding: 'var(--space-8)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-3)' }}>
          <Layers size={36} color="var(--color-primary-600)" />
          <h3 style={{ margin: 0, fontSize: 'var(--text-lg)', color: 'var(--color-text-primary)' }}>
            {isRu ? 'Остатки ещё не вводились' : 'Boshlang‘ich qoldiqlar hali kiritilmagan'}
          </h3>
          <p style={{ margin: 0, maxWidth: 520, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            {isRu
              ? 'Выберите дату начала учёта и внесите остатки по вкладкам или загрузите их из Excel.'
              : 'Hisob boshlanish sanasini tanlang va qoldiqlarni bo‘limlar bo‘yicha kiriting yoki Exceldan yuklang.'}
          </p>
          <Button variant="primary" onClick={() => setShowNewDocModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} />
            <span>{isRu ? 'Начать ввод остатков' : 'Qoldiqlarni kiritishni boshlash'}</span>
          </Button>
        </Card>
      ) : (
        <>
          {/* Document bar */}
          <Card style={{ padding: 'var(--space-4)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
                {documents.length > 1 ? (
                  <div style={{ width: '280px' }}>
                    <Select options={documentOptions} value={selectedDocId} onChange={setSelectedDocId} placeholder={isRu ? 'Выберите документ' : 'Hujjatni tanlang'} size="sm" />
                  </div>
                ) : (
                  <strong style={{ color: 'var(--color-text-primary)' }}>{currentDoc?.docNumber}</strong>
                )}
                {currentDoc && getDocStatusBadge(currentDoc.status)}

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                    {isRu ? 'Дата остатков:' : 'Qoldiq sanasi:'}
                  </span>
                  <div style={{ width: '150px' }}>
                    <DatePicker value={openingDate} onChange={setOpeningDate} disabled={isReadOnly} size="sm" />
                  </div>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }} data-testid="document-usd-rate">
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                    {isRu ? 'Курс USD (UZS):' : 'USD kursi (UZS):'}
                  </span>
                  <MoneyInput
                    value={usdRate}
                    disabled={isReadOnly}
                    onValueChange={setUsdRate}
                    decimals={4}
                    placeholder={hasUsdLines ? (isRu ? 'обязательно' : 'majburiy') : '—'}
                    aria-label={isRu ? 'Курс USD к UZS на дату остатков' : 'Qoldiq sanasidagi USD ning UZS kursi'}
                    style={{ width: 130, borderColor: needsUsdRate(lines, usdRate) && !isReadOnly ? 'var(--color-warning-500)' : undefined }}
                  />
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {currentDoc && !isReadOnly && (
                  <>
                    <Button variant="secondary" size="sm" onClick={handleSaveLines} disabled={actionLoading} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Save size={14} />
                      <span>{isRu ? 'Сохранить' : 'Saqlash'}</span>
                    </Button>
                    <Button variant="primary" size="sm" onClick={handlePost} disabled={actionLoading} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={14} />
                      <span>{actionLoading ? (isRu ? 'Подождите...' : 'Kuting...') : isRu ? 'Провести' : 'Tasdiqlash'}</span>
                    </Button>
                    <Button aria-label={isRu ? 'Удалить черновик' : 'Qoralamani o‘chirish'} title={isRu ? 'Удалить черновик' : 'Qoralamani o‘chirish'} variant="secondary" size="sm" onClick={handleDeleteDocument} disabled={actionLoading} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-error-600)' }}>
                      <Trash2 size={14} />
                    </Button>
                  </>
                )}
                {currentDoc && isPosted && (
                  <Button variant="secondary" size="sm" onClick={() => setShowUnpostModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-error-600)' }}>
                    <RotateCcw size={14} />
                    <span>{isRu ? 'Переоткрыть' : 'Qayta ochish'}</span>
                  </Button>
                )}
              </div>
            </div>
            {ratesWereMixed && !isReadOnly && (
              <p style={{ margin: 'var(--space-3) 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-warning-700)' }}>
                {isRu
                  ? 'В строках были разные курсы USD. При сохранении ко всем USD-строкам будет применён один курс документа.'
                  : 'Qatorlarda turli USD kurslari bor edi. Saqlaganda barcha USD qatorlariga hujjatning bitta kursi qo‘llanadi.'}
              </p>
            )}
          </Card>

          {/* Summary: assets, liabilities, capital (balances itself) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
            <SummaryCard
              color="#10b981"
              icon={<TrendingUp size={20} />}
              title={isRu ? 'Активы' : 'Aktivlar'}
              value={formatCurrency(totals.totalAssets, locale, docCurrency)}
              hint={isRu ? 'Деньги, товары, долги клиентов, ОС' : 'Pul, tovar, mijozlar qarzi, asosiy vositalar'}
            />
            <SummaryCard
              color="#ef4444"
              icon={<TrendingDown size={20} />}
              title={isRu ? 'Обязательства' : 'Majburiyatlar'}
              value={formatCurrency(totals.totalLiabilities, locale, docCurrency)}
              hint={isRu ? 'Долги поставщикам, полученные авансы' : 'Yetkazib beruvchilarga qarz, olingan avanslar'}
            />
            <SummaryCard
              color="#6366f1"
              icon={<Building2 size={20} />}
              title={isRu ? 'Капитал (рассчитан)' : 'Kapital (hisoblangan)'}
              value={formatCurrency(totals.totalEquity, locale, docCurrency)}
              hint={
                isRu
                  ? `Уставный: ${formatCurrency(totals.enteredEquity, locale, docCurrency)} · Нераспр. прибыль: ${formatCurrency(totals.retainedEarnings, locale, docCurrency)}`
                  : `Ustav: ${formatCurrency(totals.enteredEquity, locale, docCurrency)} · Taqsimlanmagan foyda: ${formatCurrency(totals.retainedEarnings, locale, docCurrency)}`
              }
            />
          </div>
          {!totals.hasValidCurrencyRates && !isReadOnly && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--text-sm)', color: 'var(--color-warning-700)' }}>
              <AlertTriangle size={16} />
              <span>
                {isRu
                  ? 'Строки без валюты или USD-строки без курса не входят в итоги.'
                  : 'Valyutasiz qatorlar yoki kurssiz USD qatorlari jamiga kirmaydi.'}
              </span>
            </div>
          )}

          {isPosted && <PostedLinks isRu={isRu} />}

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border-light)', gap: 'var(--space-2)', overflowX: 'auto', paddingBottom: '2px' }}>
            {navTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 16px',
                    border: 'none',
                    background: 'none',
                    borderBottom: isActive ? '2px solid var(--color-primary-600)' : '2px solid transparent',
                    color: isActive ? 'var(--color-primary-600)' : 'var(--color-text-secondary)',
                    fontWeight: isActive ? 600 : 500,
                    fontSize: 'var(--text-sm)',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                  {tab.count > 0 && <Badge variant={isActive ? 'info' : 'neutral'}>{tab.count}</Badge>}
                </button>
              );
            })}
          </div>

          {activeTab === 'cash' && (
            <SubledgerCard
              title={isRu ? 'Деньги в кассах и на счетах' : 'Kassa va bankdagi pul'}
              hint={isRu ? 'Попадут на баланс выбранной кассы.' : 'Tanlangan kassa qoldig‘iga qo‘shiladi.'}
              isReadOnly={isReadOnly}
              onAdd={() => addLine('CASH')}
              addText={isRu ? 'Добавить кассу' : 'Kassa qo‘shish'}
            >
              <CashTable {...tableProps} accounts={accounts} />
            </SubledgerCard>
          )}

          {activeTab === 'inventory' && (
            <SubledgerCard
              title={isRu ? 'Товары и материалы на складах' : 'Ombordagi tovar va materiallar'}
              hint={
                isRu
                  ? 'Каждая строка станет первой партией FIFO на складе; себестоимость берётся из карточки товара.'
                  : 'Har bir qator omborda birinchi FIFO partiyasi bo‘ladi; tannarx tovar kartochkasidan olinadi.'
              }
              isReadOnly={isReadOnly}
              onAdd={() => addLine('INVENTORY')}
              addText={isRu ? 'Добавить товар' : 'Tovar qo‘shish'}
            >
              <InventoryTable
                {...tableProps}
                products={products}
                warehouses={warehouses}
                onCreateProduct={(index) => setQuickCreate({ kind: 'product', index })}
              />
            </SubledgerCard>
          )}

          {activeTab === 'debts' && (
            <SubledgerCard
              title={isRu ? 'Долги и авансы контрагентов' : 'Kontragentlar bilan qarz va avanslar'}
              hint={
                isRu
                  ? 'Попадут в расчёты с контрагентом в своей валюте; последующие оплаты закроют их.'
                  : 'Kontragent hisob-kitobiga o‘z valyutasida tushadi; keyingi to‘lovlar ularni yopadi.'
              }
              isReadOnly={isReadOnly}
              onAdd={() => addLine('CUSTOMER_DEBT')}
              addText={isRu ? 'Добавить строку' : 'Qator qo‘shish'}
            >
              <DebtsTable
                {...tableProps}
                counterparties={counterparties}
                onCreateCounterparty={(index, type) => setQuickCreate({ kind: 'counterparty', index, type })}
              />
            </SubledgerCard>
          )}

          {activeTab === 'fixed-assets' && (
            <SubledgerCard
              title={isRu ? 'Основные средства' : 'Asosiy vositalar'}
              hint={null}
              isReadOnly={isReadOnly}
              onAdd={() => addLine('FIXED_ASSET')}
              addText={isRu ? 'Добавить средство' : 'Asosiy vosita qo‘shish'}
            >
              {/* B6 / D6: depreciation is not computed by the system after posting. */}
              <p
                data-testid="fixed-asset-depreciation-notice"
                style={{ margin: 'var(--space-3) var(--space-5)', padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', background: 'var(--color-warning-50)', color: 'var(--color-warning-700)', fontSize: 'var(--text-sm)' }}
              >
                {isRu
                  ? 'Амортизация не рассчитывается автоматически. Выберите средство из реестра или создайте новое: стоимость и накопленная амортизация (UZS) берутся из реестра; при создании можно рассчитать амортизацию линейным методом на дату остатков.'
                  : 'Eskirish tizimda avtomatik hisoblanmaydi. Vositani reyestrdan tanlang yoki yangisini yarating: qiymat va jamg‘arilgan eskirish (UZS) reyestrdan olinadi; yaratishda eskirishni qoldiq sanasiga chiziqli usulda hisoblab olish mumkin.'}
              </p>
              <FixedAssetsTable
                {...tableProps}
                fixedAssets={fixedAssets}
                currency={docCurrency}
                onCreateAsset={(index) => setQuickCreate({ kind: 'fixedAsset', index })}
              />
            </SubledgerCard>
          )}

          {activeTab === 'other' && (
            <SubledgerCard
              title={isRu ? 'Уставный капитал и прочие статьи' : 'Ustav kapitali va boshqa moddalar'}
              hint={
                isRu
                  ? 'Нераспределённую прибыль вводить не нужно — она рассчитывается автоматически.'
                  : 'Taqsimlanmagan foydani kiritish shart emas — u avtomatik hisoblanadi.'
              }
              isReadOnly={isReadOnly}
              onAdd={() => addLine('EQUITY')}
              addText={isRu ? 'Добавить статью' : 'Modda qo‘shish'}
            >
              <OtherTable {...tableProps} />
            </SubledgerCard>
          )}
        </>
      )}

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

      {/* New document */}
      <Modal isOpen={showNewDocModal} title={isRu ? 'Новый ввод остатков' : 'Yangi boshlang‘ich qoldiq hujjati'} onClose={() => setShowNewDocModal(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-1)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {isRu ? 'Дата, на которую вводятся остатки' : 'Qoldiqlar qaysi sanaga kiritiladi'}
            </label>
            <DatePicker value={newDocDate} onChange={setNewDocDate} />
            <p style={{ margin: '6px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Номер документа присваивается автоматически.' : 'Hujjat raqami avtomatik beriladi.'}
            </p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {isRu ? 'Примечание' : 'Izoh'}
            </label>
            <Input type="text" value={newDocNotes} onChange={(e) => setNewDocNotes(e.target.value)} placeholder={isRu ? 'Необязательно' : 'Ixtiyoriy'} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
            <Button variant="secondary" onClick={() => setShowNewDocModal(false)}>
              {isRu ? 'Отмена' : 'Bekor qilish'}
            </Button>
            <Button variant="primary" onClick={handleCreateDocument} disabled={actionLoading}>
              {actionLoading ? (isRu ? 'Создание...' : 'Yaratilmoqda...') : isRu ? 'Создать' : 'Yaratish'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Excel import (template download included) */}
      <Modal isOpen={showImportModal} title={isRu ? 'Импорт остатков из Excel' : 'Qoldiqlarni Exceldan yuklash'} onClose={closeImportModal}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-1)' }}>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-primary-600)', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <Download size={14} />
                {isRu ? 'Скачайте шаблон' : 'Shablonni yuklab oling'}
              </button>
            </li>
            <li>{isRu ? 'Заполните листы (деньги, товары, клиенты, поставщики).' : 'Varaqlarni to‘ldiring (pul, tovar, mijozlar, yetkazib beruvchilar).'}</li>
            <li>{isRu ? 'Выберите файл, проверьте и сохраните.' : 'Faylni tanlang, tekshiring va saqlang.'}</li>
          </ol>

          <div style={{ border: '2px dashed var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', textAlign: 'center', backgroundColor: 'var(--color-bg-subtle)' }}>
            <FileSpreadsheet size={36} color="var(--color-primary-600)" style={{ margin: '0 auto 8px' }} />
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => {
                resetImport();
                setImportFile(e.target.files?.[0] ?? null);
              }}
              style={{ display: 'block', margin: '0 auto', fontSize: 'var(--text-sm)' }}
            />
          </div>

          {importErrors.length > 0 && (
            <div style={{ backgroundColor: 'var(--color-error-50)', border: '1px solid var(--color-error-100)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', maxHeight: '180px', overflowY: 'auto' }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-error-600)', display: 'block', marginBottom: '4px' }}>
                {isRu ? 'Ошибки в файле Excel:' : 'Excel fayldagi xatoliklar:'}
              </span>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: 'var(--text-xs)', color: 'var(--color-error-600)' }}>
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
                {isRu ? 'Готово к сохранению' : 'Saqlashga tayyor'}: <strong>{importSummary.lineCount}</strong>
                {' · '}
                {isRu ? 'Ошибок' : 'Xatoliklar'}: <strong>{importPreview.errors.length}</strong>
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
              {importSummary.canCommit && (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start', color: 'var(--color-warning-600)' }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0 }} />
                  <span>
                    {isRu
                      ? 'При сохранении все текущие строки черновика будут заменены строками из файла.'
                      : 'Saqlaganda qoralamaning hozirgi barcha qatorlari fayldagi qatorlar bilan almashtiriladi.'}
                  </span>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
            <Button variant="secondary" onClick={closeImportModal}>
              {isRu ? 'Отмена' : 'Bekor qilish'}
            </Button>
            {importSummary?.canCommit ? (
              <Button variant="primary" onClick={handleCommitImport} disabled={importing} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Save size={16} />
                <span>{importing ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : isRu ? 'Сохранить в документ' : 'Hujjatga saqlash'}</span>
              </Button>
            ) : (
              <Button variant="primary" onClick={handlePreviewImport} disabled={!importFile || importing} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Upload size={16} />
                <span>{importing ? (isRu ? 'Проверка...' : 'Tekshirilmoqda...') : isRu ? 'Проверить файл' : 'Faylni tekshirish'}</span>
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* Unpost (rollback invariant) */}
      <Modal isOpen={showUnpostModal} title={isRu ? 'Переоткрыть документ остатков' : 'Boshlang‘ich qoldiqni qayta ochish'} onClose={() => setShowUnpostModal(false)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-1)' }}>
          <div style={{ padding: 'var(--space-3)', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-warning-50)', border: '1px solid var(--color-warning-100)', display: 'flex', gap: '10px' }}>
            <AlertTriangle size={20} color="var(--color-warning-600)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-warning-700)' }}>
              {isRu
                ? 'Документ вернётся в черновик, а кассы, склады, расчёты и журнал — в состояние до проведения. Если товары из начальных партий уже проданы или деньги из кассы потрачены, переоткрыть нельзя.'
                : 'Hujjat qoralamaga qaytadi, kassa, ombor, hisob-kitob va jurnal tasdiqlashdan oldingi holatiga qaytariladi. Boshlang‘ich partiyadagi tovar sotilgan yoki kassadagi pul sarflangan bo‘lsa, qayta ochib bo‘lmaydi.'}
            </p>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {isRu ? 'Причина' : 'Sabab'}
            </label>
            <Input
              type="text"
              placeholder={isRu ? 'Например: исправление ошибки в остатках...' : 'Masalan: qoldiqdagi xatolikni tuzatish...'}
              value={unpostReason}
              onChange={(e) => setUnpostReason(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
            <Button variant="secondary" onClick={() => setShowUnpostModal(false)}>
              {isRu ? 'Отмена' : 'Bekor qilish'}
            </Button>
            <Button variant="primary" onClick={handleUnpost} disabled={actionLoading} style={{ backgroundColor: 'var(--color-error-600)', borderColor: 'var(--color-error-600)' }}>
              {actionLoading ? (isRu ? 'Переоткрытие...' : 'Qayta ochilmoqda...') : isRu ? 'Переоткрыть' : 'Qayta ochish'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Building blocks
// ─────────────────────────────────────────────────────────────────────────────

function SummaryCard({ color, icon, title, value, hint }: { color: string; icon: React.ReactNode; title: string; value: string; hint: string }) {
  return (
    <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)', borderLeft: `4px solid ${color}` }}>
      <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)', backgroundColor: `${color}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ overflow: 'hidden' }}>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{title}</div>
        <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text-primary)' }} className="tabular-nums">
          {value}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{hint}</div>
      </div>
    </Card>
  );
}

/** Where a posted opening balance can be seen in the rest of the system. */
function PostedLinks({ isRu }: { isRu: boolean }) {
  const links = [
    { href: '/finance', label: isRu ? 'Кассы и банк' : 'Kassa va bank' },
    { href: '/inventory', label: isRu ? 'Остатки на складах' : 'Ombor qoldiqlari' },
    { href: '/counterparties', label: isRu ? 'Расчёты с контрагентами' : 'Kontragentlar hisob-kitobi' },
    { href: '/accounting/journal', label: isRu ? 'Журнал проводок' : 'Buxgalteriya jurnali' },
  ];
  return (
    <Card style={{ padding: 'var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }} data-testid="opening-balance-posted-links">
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
        {isRu ? 'Остатки проведены и видны в разделах:' : 'Qoldiqlar tasdiqlangan va quyidagi bo‘limlarda ko‘rinadi:'}
      </span>
      {links.map((link) => (
        <Link key={link.href} href={link.href} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-primary-600)' }}>
          {link.label}
          <ArrowRight size={14} />
        </Link>
      ))}
    </Card>
  );
}

function SubledgerCard({ title, hint, isReadOnly, onAdd, addText, children }: {
  title: string;
  hint: string | null;
  isReadOnly: boolean;
  onAdd: () => void;
  addText: string;
  children: React.ReactNode;
}) {
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border-light)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text-primary)' }}>{title}</h3>
          {hint && <p style={{ margin: '4px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{hint}</p>}
        </div>
        {!isReadOnly && (
          <Button variant="secondary" size="sm" onClick={onAdd} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={14} />
            <span>{addText}</span>
          </Button>
        )}
      </div>
      <div style={{ overflowX: 'auto' }}>{children}</div>
    </Card>
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
          <th style={th({ width: '40px' })}>#</th>
          <th style={th({ minWidth: '260px' })}>{isRu ? 'Касса / счёт' : 'Kassa / hisob'}</th>
          <th style={th({ width: '90px' })}>{isRu ? 'Валюта' : 'Valyuta'}</th>
          <th style={th({ minWidth: '180px', textAlign: 'right' })}>{isRu ? 'Остаток' : 'Qoldiq'}</th>
          <th style={th({ minWidth: '200px' })}>{isRu ? 'Примечание' : 'Izoh'}</th>
          {!isReadOnly && <th style={th({ width: '50px' })}></th>}
        </tr>
      </thead>
      <tbody>
        {filtered.length === 0 ? (
          <EmptyRow colSpan={6} text={isRu ? 'Кассы не добавлены' : 'Kassalar qo‘shilmagan'} />
        ) : (
          filtered.map(({ line, index }, pos) => (
            <tr key={index} style={rowStyle}>
              <td style={{ ...td, color: 'var(--color-text-tertiary)' }}>{pos + 1}</td>
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
                  style={{ width: '100%', maxWidth: '320px' }}
                  options={[
                    { value: '', label: isRu ? 'Выберите кассу/банк' : 'Kassa yoki bankni tanlang' },
                    ...usable.map((account) => ({
                      value: account.id,
                      label: `${localized(account.name, locale, 'Kassa')} (${account.currency})`,
                    })),
                  ]}
                />
              </td>
              <td style={td}>
                <Badge variant="neutral">{line.currency || '—'}</Badge>
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
              <td style={td}>
                <NotesInput line={line} index={index} isReadOnly={isReadOnly} isRu={isRu} onUpdate={onUpdate} />
              </td>
              <RemoveCell isReadOnly={isReadOnly} isRu={isRu} onClick={() => onRemove(index)} />
            </tr>
          ))
        )}
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
          <th style={th({ width: '40px' })}>#</th>
          <th style={th({ minWidth: '240px' })}>{isRu ? 'Товар' : 'Tovar'}</th>
          {warehouses.length > 1 && <th style={th({ minWidth: '180px' })}>{isRu ? 'Склад' : 'Ombor'}</th>}
          <th style={th({ width: '120px', textAlign: 'right' })}>{isRu ? 'Количество' : 'Miqdor'}</th>
          <th style={th({ width: '140px', textAlign: 'right' })}>{isRu ? 'Себестоимость' : 'Tannarx'}</th>
          <th style={th({ width: '110px' })}>{isRu ? 'Валюта' : 'Valyuta'}</th>
          <th style={th({ width: '160px', textAlign: 'right' })}>{isRu ? 'Сумма' : 'Summa'}</th>
          {!isReadOnly && <th style={th({ width: '50px' })}></th>}
        </tr>
      </thead>
      <tbody>
        {filtered.length === 0 ? (
          <EmptyRow colSpan={8} text={isRu ? 'Товары не добавлены' : 'Tovarlar qo‘shilmagan'} />
        ) : (
          filtered.map(({ line, index }, pos) => (
            <tr key={index} style={rowStyle}>
              <td style={{ ...td, color: 'var(--color-text-tertiary)' }}>{pos + 1}</td>
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
          ))
        )}
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
          <th style={th({ width: '40px' })}>#</th>
          <th style={th({ width: '240px' })}>{isRu ? 'Что это' : 'Turi'}</th>
          <th style={th({ minWidth: '240px' })}>{isRu ? 'Контрагент' : 'Kontragent'}</th>
          <th style={th({ width: '100px' })}>{isRu ? 'Валюта' : 'Valyuta'}</th>
          <th style={th({ minWidth: '180px', textAlign: 'right' })}>{isRu ? 'Сумма' : 'Summa'}</th>
          <th style={th({ minWidth: '160px' })}>{isRu ? 'Договор №' : 'Shartnoma №'}</th>
          {!isReadOnly && <th style={th({ width: '50px' })}></th>}
        </tr>
      </thead>
      <tbody>
        {filtered.length === 0 ? (
          <EmptyRow colSpan={7} text={isRu ? 'Долги и авансы не добавлены' : 'Qarz va avanslar qo‘shilmagan'} />
        ) : (
          filtered.map(({ line, index }, pos) => {
            const kind = line.category as CounterpartyLineKind;
            const side = COUNTERPARTY_LINE_KINDS[kind].side;
            const isAsset = kind === 'CUSTOMER_DEBT' || kind === 'SUPPLIER_ADVANCE';
            return (
              <tr key={index} style={rowStyle}>
                <td style={{ ...td, color: 'var(--color-text-tertiary)' }}>{pos + 1}</td>
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
                <td style={td}>
                  <Select
                    options={CURRENCY_OPTIONS}
                    value={line.currency || ''}
                    placeholder={isRu ? 'Валюта' : 'Valyuta'}
                    disabled={isReadOnly}
                    onChange={(currency) => onUpdate(index, 'currency', currency)}
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
                    style={field('180px', { fontWeight: 600, textAlign: 'right', color: isAsset ? 'var(--color-success-600)' : 'var(--color-error-600)' })}
                  />
                </td>
                <td style={td}>
                  <input
                    type="text"
                    value={line.contractNumber || ''}
                    disabled={isReadOnly}
                    onChange={(e) => onUpdate(index, 'contractNumber', e.target.value)}
                    placeholder={isRu ? 'Необязательно' : 'Ixtiyoriy'}
                    style={field('100%')}
                  />
                </td>
                <RemoveCell isReadOnly={isReadOnly} isRu={isRu} onClick={() => onRemove(index)} />
              </tr>
            );
          })
        )}
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
    <table style={tableStyle}>
      <thead style={theadStyle}>
        <tr>
          <th style={th({ width: '40px' })}>#</th>
          <th style={th({ minWidth: '260px' })}>{isRu ? 'Средство из реестра' : 'Reyestrdagi vosita'}</th>
          <th style={th({ width: '140px' })}>{isRu ? 'Инв. номер' : 'Inv. raqam'}</th>
          <th style={th({ width: '160px', textAlign: 'right' })}>{isRu ? 'Стоимость' : 'Boshlang‘ich qiymat'}</th>
          <th style={th({ width: '160px', textAlign: 'right' })}>{isRu ? 'Амортизация' : 'Eskirish'}</th>
          <th style={th({ width: '160px', textAlign: 'right' })}>{isRu ? 'Остаточная' : 'Qoldiq qiymat'}</th>
          {!isReadOnly && <th style={th({ width: '50px' })}></th>}
        </tr>
      </thead>
      <tbody>
        {filtered.length === 0 ? (
          <EmptyRow colSpan={7} text={isRu ? 'Основные средства не добавлены' : 'Asosiy vositalar qo‘shilmagan'} />
        ) : (
          filtered.map(({ line, index }, pos) => {
            const initCost = Number(line.amount || 0);
            const accDep = Number(line.accumulatedDepreciation || 0);
            const netBookValue = Math.max(0, initCost - accDep);
            // Rejected by the server as well (B6): never clamp silently.
            const overDepreciated = accDep > initCost;
            return (
              <tr key={index} style={rowStyle}>
                <td style={{ ...td, color: 'var(--color-text-tertiary)' }}>{pos + 1}</td>
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
                <td style={{ ...td, textAlign: 'right', color: 'var(--color-error-600)' }} className="tabular-nums">
                  {line.fixedAssetId ? formatCurrency(accDep, locale, 'UZS') : '—'}
                </td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: overDepreciated ? 'var(--color-error-600)' : 'var(--color-success-600)' }} className="tabular-nums">
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
          })
        )}
      </tbody>
    </table>
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
    <Modal isOpen title={isRu ? 'Новое основное средство' : 'Yangi asosiy vosita'} onClose={onClose}>
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
        <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <Button variant="secondary" onClick={onClose}>
            {isRu ? 'Отмена' : 'Bekor qilish'}
          </Button>
          <Button variant="primary" onClick={submit} disabled={saving}>
            {saving ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : isRu ? 'Добавить' : 'Qo‘shish'}
          </Button>
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
          <th style={th({ width: '40px' })}>#</th>
          <th style={th({ width: '240px' })}>{isRu ? 'Статья' : 'Modda'}</th>
          <th style={th({ minWidth: '220px' })}>{isRu ? 'Описание' : 'Tavsif'}</th>
          <th style={th({ minWidth: '180px', textAlign: 'right' })}>{isRu ? 'Сумма (UZS)' : 'Summa (UZS)'}</th>
          {!isReadOnly && <th style={th({ width: '50px' })}></th>}
        </tr>
      </thead>
      <tbody>
        {filtered.length === 0 ? (
          <EmptyRow colSpan={5} text={isRu ? 'Статьи не добавлены' : 'Moddalar qo‘shilmagan'} />
        ) : (
          filtered.map(({ line, index }, pos) => (
            <tr key={index} style={rowStyle}>
              <td style={{ ...td, color: 'var(--color-text-tertiary)' }}>{pos + 1}</td>
              <td style={td}>
                <Select
                  value={line.category ?? ''}
                  disabled={isReadOnly}
                  onChange={(value) => onUpdate(index, 'category', value)}
                  style={{ width: '100%' }}
                  options={[
                    { value: 'EQUITY', label: isRu ? 'Уставный капитал' : 'Ustav kapitali' },
                    { value: 'OTHER_ASSET', label: isRu ? 'Прочий актив' : 'Boshqa aktiv' },
                    { value: 'OTHER_LIABILITY', label: isRu ? 'Прочее обязательство' : 'Boshqa majburiyat' },
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
          ))
        )}
      </tbody>
    </table>
  );
}
