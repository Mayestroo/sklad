'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { useDefaultCurrency } from '@/hooks/useDefaultCurrency';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select, SelectOption } from '@/components/ui/Select';
import { DatePicker } from '@/components/ui/DatePicker';
import { toast } from '@/context/ToastContext';
import {
  Scale,
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
  Truck,
  DollarSign,
  Layers,
  Clock,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Building,
} from 'lucide-react';
import type {
  OpeningBalanceDocument,
  OpeningBalanceLine,
  OpeningBalanceCategory,
  OpeningBalanceStatus,
  OpeningBalanceMetrics,
  ImportErrorItem,
} from '@shared/types/opening-balances';

type TabKey = 'cash' | 'inventory' | 'customers' | 'suppliers' | 'advances' | 'fixed-assets' | 'other';

export default function OpeningBalancesPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();
  const companyId = company?.id;

  // Documents State
  const [documents, setDocuments] = useState<OpeningBalanceDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [currentDoc, setCurrentDoc] = useState<OpeningBalanceDocument | null>(null);
  const defaultCurrency = useDefaultCurrency();
  const docCurrency = (currentDoc as any)?.currency || defaultCurrency;
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('cash');

  // Lookups
  const [accounts, setAccounts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [counterparties, setCounterparties] = useState<any[]>([]);
  const [fixedAssets, setFixedAssets] = useState<any[]>([]);

  // Working Document Lines & State
  const [lines, setLines] = useState<Array<Partial<OpeningBalanceLine>>>([]);
  const [openingDate, setOpeningDate] = useState<string>('2026-10-01');
  const [notes, setNotes] = useState<string>('');

  // Modals
  const [showNewDocModal, setShowNewDocModal] = useState(false);
  const [newDocNumber, setNewDocNumber] = useState('');
  const [newDocDate, setNewDocDate] = useState('2026-10-01');
  const [newDocNotes, setNewDocNotes] = useState('');

  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importErrors, setImportErrors] = useState<ImportErrorItem[]>([]);
  const [importing, setImporting] = useState(false);

  const [showUnpostModal, setShowUnpostModal] = useState(false);
  const [unpostReason, setUnpostReason] = useState('');

  // ─── Fetch Lookups ─────────────────────────────────────────────

  useEffect(() => {
    if (!token || !companyId) return;

    const fetchLookups = async () => {
      try {
        const [accs, whs, prods, cps, fas] = await Promise.all([
          apiFetch<any[]>('/finance/accounts', { token: token || undefined, tenantId: companyId, locale }).catch(() => []),
          apiFetch<any>('/tenants/warehouses', { token: token || undefined, tenantId: companyId, locale })
            .then((res) => res?.data || (Array.isArray(res) ? res : []))
            .catch(() => []),
          apiFetch<any>('/inventory/products', { token: token || undefined, tenantId: companyId, locale })
            .then((res) => res?.data || (Array.isArray(res) ? res : []))
            .catch(() => []),
          apiFetch<any>('/sales/counterparties', { token: token || undefined, tenantId: companyId, locale })
            .then((res) => res?.data || (Array.isArray(res) ? res : []))
            .catch(() => []),
          apiFetch<any[]>('/fixed-assets', { token: token || undefined, tenantId: companyId, locale }).catch(() => []),
        ]);

        setAccounts(Array.isArray(accs) ? accs : []);
        setWarehouses(Array.isArray(whs) ? whs : []);
        setProducts(Array.isArray(prods) ? prods : []);
        setCounterparties(Array.isArray(cps) ? cps : []);
        setFixedAssets(Array.isArray(fas) ? fas : []);
      } catch (e) {
        console.error('Failed to load lookups', e);
      }
    };

    fetchLookups();
  }, [token, companyId, locale]);

  // ─── Fetch Documents ───────────────────────────────────────────

  const loadDocuments = useCallback(async () => {
    if (!token || !companyId) return;
    setLoading(true);
    try {
      const docs = await apiFetch<OpeningBalanceDocument[]>('/opening-balances', {
        token: token || undefined,
        tenantId: companyId,
        locale,
      });
      setDocuments(docs || []);
      if (docs && docs.length > 0) {
        const targetId = selectedDocId && docs.some((d) => d.id === selectedDocId) ? selectedDocId : docs[0].id;
        setSelectedDocId(targetId);
      } else {
        setSelectedDocId('');
        setCurrentDoc(null);
        setLines([]);
      }
    } catch (e: any) {
      toast.error(e?.message || (isRu ? 'Ошибка при загрузке документов' : 'Hujjatlarni yuklashda xatolik'));
    } finally {
      setLoading(false);
    }
  }, [token, companyId, locale, selectedDocId, isRu]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // ─── Load Selected Document Details ────────────────────────────

  const loadDocumentDetails = useCallback(
    async (id: string) => {
      if (!token || !companyId || !id) return;
      try {
        const doc = await apiFetch<OpeningBalanceDocument>(`/opening-balances/${id}`, {
          token: token || undefined,
          tenantId: companyId,
          locale,
        });
        setCurrentDoc(doc);
        setLines(doc.lines || []);
        setOpeningDate(doc.openingDate ? doc.openingDate.slice(0, 10) : '2026-10-01');
        setNotes(doc.notes || '');
      } catch (e: any) {
        toast.error(e?.message || (isRu ? 'Ошибка загрузки документа' : 'Hujjat tafsilotlarini yuklashda xatolik'));
      }
    },
    [token, companyId, locale, isRu],
  );

  useEffect(() => {
    if (selectedDocId) {
      loadDocumentDetails(selectedDocId);
    }
  }, [selectedDocId, loadDocumentDetails]);

  // ─── Real-Time Client-Side Balance Metrics ──────────────────────

  const metrics: OpeningBalanceMetrics = useMemo(() => {
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;
    const breakdown: Record<OpeningBalanceCategory, number> = {
      CASH: 0,
      BANK: 0,
      INVENTORY: 0,
      CUSTOMER_DEBT: 0,
      SUPPLIER_DEBT: 0,
      CUSTOMER_ADVANCE: 0,
      SUPPLIER_ADVANCE: 0,
      FIXED_ASSET: 0,
      OTHER_ASSET: 0,
      OTHER_LIABILITY: 0,
      EQUITY: 0,
    };

    for (const line of lines) {
      const amt = Number(line.amount || 0);
      const cat = (line.category || 'CASH') as OpeningBalanceCategory;
      if (breakdown[cat] !== undefined) {
        breakdown[cat] += amt;
      }

      switch (cat) {
        case 'CASH':
        case 'BANK':
        case 'INVENTORY':
        case 'CUSTOMER_DEBT':
        case 'SUPPLIER_ADVANCE':
        case 'OTHER_ASSET':
          totalAssets += amt;
          break;
        case 'FIXED_ASSET': {
          const accDep = Number(line.accumulatedDepreciation || 0);
          const net = Math.max(0, amt - accDep);
          totalAssets += net;
          break;
        }
        case 'SUPPLIER_DEBT':
        case 'CUSTOMER_ADVANCE':
        case 'OTHER_LIABILITY':
          totalLiabilities += amt;
          break;
        case 'EQUITY':
          totalEquity += amt;
          break;
      }
    }

    const suggestedEquity = Math.max(0, totalAssets - totalLiabilities);
    const balanceDifference = Math.round((totalAssets - (totalLiabilities + totalEquity)) * 100) / 100;
    const isBalanced = Math.abs(balanceDifference) < 0.01;

    return {
      totalAssets: Math.round(totalAssets * 100) / 100,
      totalLiabilities: Math.round(totalLiabilities * 100) / 100,
      enteredEquity: Math.round(totalEquity * 100) / 100,
      suggestedEquity: Math.round(suggestedEquity * 100) / 100,
      balanceDifference,
      isBalanced,
      categoryBreakdown: breakdown,
    };
  }, [lines]);

  const isReadOnly = currentDoc?.status === 'POSTED';

  // ─── Actions & Handlers ────────────────────────────────────────

  const handleSaveLines = async () => {
    if (!token || !companyId || !selectedDocId) return;
    setActionLoading(true);
    try {
      await apiFetch(`/opening-balances/${selectedDocId}/lines`, {
        method: 'PUT',
        token: token || undefined,
        tenantId: companyId,
        locale,
        body: JSON.stringify({
          openingDate,
          notes,
          lines,
        }),
      });
      toast.success(isRu ? 'Изменения успешно сохранены' : 'Boshlang‘ich qoldiqlar muvaffaqiyatli saqlandi');
      loadDocumentDetails(selectedDocId);
    } catch (e: any) {
      toast.error(e?.message || (isRu ? 'Ошибка при сохранении' : 'Saqlashda xatolik yuz berdi'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmitForReview = async () => {
    if (!token || !companyId || !selectedDocId) return;
    setActionLoading(true);
    try {
      await apiFetch(`/opening-balances/${selectedDocId}/submit`, {
        method: 'POST',
        token: token || undefined,
        tenantId: companyId,
        locale,
      });
      toast.success(isRu ? 'Документ отправлен на проверку' : 'Hujjat tekshirishga muvaffaqiyatli yuborildi');
      loadDocuments();
      loadDocumentDetails(selectedDocId);
    } catch (e: any) {
      toast.error(e?.message || (isRu ? 'Ошибка отправки' : 'Tekshirishga yuborishda xatolik'));
    } finally {
      setActionLoading(false);
    }
  };

  const handlePost = async () => {
    if (!token || !companyId || !selectedDocId) return;
    if (!metrics.isBalanced) {
      toast.error(
        isRu
          ? `Баланс не сходится! Разница: ${formatCurrency(metrics.balanceDifference, locale, docCurrency)}. Разница должна быть 0.`
          : `Balans teng emas! Farq: ${formatCurrency(metrics.balanceDifference, locale, docCurrency)}. Boshlang‘ich balans farqi 0 bo‘lishi shart!`,
      );
      return;
    }

    setActionLoading(true);
    try {
      await apiFetch(`/opening-balances/${selectedDocId}/post`, {
        method: 'POST',
        token: token || undefined,
        tenantId: companyId,
        locale,
      });
      toast.success(
        isRu
          ? 'Остатки успешно проведены! Склады, кассы и долги обновлены.'
          : 'Boshlang‘ich qoldiqlar tasdiqlandi! Ombor, kassa va qarzdorliklar yangilandi.',
      );
      loadDocuments();
      loadDocumentDetails(selectedDocId);
    } catch (e: any) {
      toast.error(e?.message || (isRu ? 'Ошибка проведения' : 'Tasdiqlashda xatolik'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnpost = async () => {
    if (!token || !companyId || !selectedDocId) return;
    setActionLoading(true);
    try {
      await apiFetch(`/opening-balances/${selectedDocId}/unpost`, {
        method: 'POST',
        token: token || undefined,
        tenantId: companyId,
        locale,
        body: JSON.stringify({ reason: unpostReason || undefined }),
      });
      setShowUnpostModal(false);
      setUnpostReason('');
      toast.success(
        isRu
          ? 'Документ переоткрыт (черновик). Остатки безопасно возвращены.'
          : 'Hujjat qayta ochildi (qoralama). Qoldiqlar xavfsiz qaytarildi.',
      );
      loadDocuments();
      loadDocumentDetails(selectedDocId);
    } catch (e: any) {
      toast.error(e?.message || (isRu ? 'Ошибка переоткрытия' : 'Hujjatni qayta ochishda xatolik'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleAutoBalance = async () => {
    if (!token || !companyId || !selectedDocId) return;
    setActionLoading(true);
    try {
      await apiFetch(`/opening-balances/${selectedDocId}/balance-equity`, {
        method: 'POST',
        token: token || undefined,
        tenantId: companyId,
        locale,
      });
      toast.success(
        isRu
          ? 'Баланс автоматически уравновешен строкой капитала'
          : 'Balans ustav kapitali orqali avtomatik tenglashtirildi',
      );
      loadDocumentDetails(selectedDocId);
    } catch (e: any) {
      toast.error(e?.message || (isRu ? 'Ошибка балансировки' : 'Balansni tenglashtirishda xatolik'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteDocument = async () => {
    if (!token || !companyId || !selectedDocId) return;
    setActionLoading(true);
    try {
      await apiFetch(`/opening-balances/${selectedDocId}`, {
        method: 'DELETE',
        token: token || undefined,
        tenantId: companyId,
        locale,
      });
      toast.success(isRu ? 'Документ успешно удален' : 'Hujjat muvaffaqiyatli o‘chirildi');
      setSelectedDocId('');
      loadDocuments();
    } catch (e: any) {
      toast.error(e?.message || (isRu ? 'Ошибка удаления' : 'O‘chirishda xatolik'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateDocument = async () => {
    if (!token || !companyId) return;
    setActionLoading(true);
    try {
      const created = await apiFetch<OpeningBalanceDocument>('/opening-balances', {
        method: 'POST',
        token: token || undefined,
        tenantId: companyId,
        locale,
        body: JSON.stringify({
          docNumber: newDocNumber.trim() || undefined,
          openingDate: newDocDate,
          notes: newDocNotes.trim() || undefined,
          lines: [],
        }),
      });
      setShowNewDocModal(false);
      setNewDocNumber('');
      setNewDocNotes('');
      toast.success(isRu ? 'Новый документ остатков создан' : 'Yangi boshlang‘ich qoldiq hujjati yaratildi');
      await loadDocuments();
      setSelectedDocId(created.id);
    } catch (e: any) {
      toast.error(e?.message || (isRu ? 'Ошибка создания' : 'Yaratishda xatolik'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    window.open('/api/opening-balances/template/download', '_blank');
  };

  const handleImportFile = async () => {
    if (!importFile || !token || !companyId || !selectedDocId) return;
    setImporting(true);
    setImportErrors([]);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      formData.append('documentId', selectedDocId);

      const res = await fetch('/api/opening-balances/import/excel', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'x-tenant-id': companyId,
        },
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.errors && Array.isArray(data.errors)) {
          setImportErrors(data.errors);
          toast.error(isRu ? 'Ошибки валидации Excel' : 'Excel faylda xatoliklar aniqlandi');
        } else {
          toast.error(data.message || (isRu ? 'Ошибка импорта' : 'Yuklashda xatolik'));
        }
        return;
      }

      setShowImportModal(false);
      setImportFile(null);
      toast.success(
        isRu
          ? `Импорт завершен! Загружено строк: ${data.importedCount}`
          : `Excel muvaffaqiyatli yuklandi! Kiritilgan qatorlar: ${data.importedCount}`,
      );
      loadDocumentDetails(selectedDocId);
    } catch (e: any) {
      toast.error(e?.message || (isRu ? 'Ошибка загрузки файла' : 'Faylni yuklashda xatolik'));
    } finally {
      setImporting(false);
    }
  };

  // ─── Line Management Helpers ────────────────────────────────────

  const addLine = (category: OpeningBalanceCategory, defaults?: Partial<OpeningBalanceLine>) => {
    if (isReadOnly) return;
    const newLine: Partial<OpeningBalanceLine> = {
      category,
      amount: 0,
      currency: 'UZS',
      exchangeRate: 1,
      ...defaults,
    };
    setLines((prev) => [...prev, newLine]);
  };

  const removeLine = (index: number) => {
    if (isReadOnly) return;
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const updateLineField = (index: number, field: keyof OpeningBalanceLine, value: any) => {
    if (isReadOnly) return;
    setLines((prev) => {
      const updated = [...prev];
      const target = { ...updated[index], [field]: value };

      if (target.category === 'INVENTORY' && (field === 'quantity' || field === 'unitCost')) {
        const q = Number(field === 'quantity' ? value : target.quantity || 0);
        const c = Number(field === 'unitCost' ? value : target.unitCost || 0);
        target.amount = Math.round(q * c * 100) / 100;
      }

      if (target.category === 'FIXED_ASSET' && (field === 'amount' || field === 'accumulatedDepreciation')) {
        const init = Number(field === 'amount' ? value : target.amount || 0);
        const dep = Number(field === 'accumulatedDepreciation' ? value : target.accumulatedDepreciation || 0);
        target.netAmount = Math.max(0, init - dep);
      }

      updated[index] = target;
      return updated;
    });
  };

  // ─── Status Badge Formatter ────────────────────────────────────

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

  // Tab counts
  const tabCounts = useMemo(() => {
    const counts = {
      cash: 0,
      inventory: 0,
      customers: 0,
      suppliers: 0,
      advances: 0,
      fixedAssets: 0,
      other: 0,
    };
    for (const l of lines) {
      if (l.category === 'CASH' || l.category === 'BANK') counts.cash++;
      else if (l.category === 'INVENTORY') counts.inventory++;
      else if (l.category === 'CUSTOMER_DEBT') counts.customers++;
      else if (l.category === 'SUPPLIER_DEBT') counts.suppliers++;
      else if (l.category === 'CUSTOMER_ADVANCE' || l.category === 'SUPPLIER_ADVANCE') counts.advances++;
      else if (l.category === 'FIXED_ASSET') counts.fixedAssets++;
      else counts.other++;
    }
    return counts;
  }, [lines]);

  const navTabs = [
    { key: 'cash' as TabKey, label: isRu ? 'Деньги в кассе / банке' : 'Pul mablag‘lari', icon: Wallet, count: tabCounts.cash },
    { key: 'inventory' as TabKey, label: isRu ? 'Товары на складах' : 'Tovar va materiallar', icon: Package, count: tabCounts.inventory },
    { key: 'customers' as TabKey, label: isRu ? 'Дебиторы (Клиенты)' : 'Mijozlar qarzi', icon: Users, count: tabCounts.customers },
    { key: 'suppliers' as TabKey, label: isRu ? 'Кредиторы (Поставщики)' : 'Yetkazib beruvchilar', icon: Truck, count: tabCounts.suppliers },
    { key: 'advances' as TabKey, label: isRu ? 'Авансы (Предоплаты)' : 'Avanslar', icon: DollarSign, count: tabCounts.advances },
    { key: 'fixed-assets' as TabKey, label: isRu ? 'Основные средства' : 'Asosiy vositalar', icon: Building, count: tabCounts.fixedAssets },
    { key: 'other' as TabKey, label: isRu ? 'Капитал и прочее' : 'Kapital va boshqalar', icon: Layers, count: tabCounts.other },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* ─── Top Header & Primary Action Controls ─────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 'var(--space-4)',
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 'var(--text-2xl)',
              fontWeight: 'var(--font-bold)',
              color: 'var(--color-text-primary)',
              margin: 0,
            }}
          >
            {isRu ? 'Ввод начальных остатков' : 'Boshlang‘ich qoldiqlarni kiritish'}
          </h1>
        </div>

        {/* Global Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Button
            variant="primary"
            onClick={() => setShowNewDocModal(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={16} />
            <span>{isRu ? 'Новый документ' : 'Yangi hujjat'}</span>
          </Button>

          <Button
            variant="secondary"
            onClick={() => setShowImportModal(true)}
            disabled={!currentDoc || isReadOnly}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Upload size={16} />
            <span>{isRu ? 'Импорт из Excel' : 'Excel orqali yuklash'}</span>
          </Button>

          <Button
            variant="secondary"
            onClick={handleDownloadTemplate}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Download size={16} />
            <span>{isRu ? 'Скачать шаблон' : 'Shablonni yuklab olish'}</span>
          </Button>
        </div>
      </div>

      {/* ─── Executive KPI Cards Grid (Matches Finance / Purchases) ─ */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: 'var(--space-4)',
        }}
      >
        {/* Card 1: Total Assets */}
        <Card
          style={{
            padding: 'var(--space-4)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            borderLeft: '4px solid #10b981',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10b981',
              flexShrink: 0,
            }}
          >
            <TrendingUp size={20} />
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              {isRu ? '1. Активы (Итого)' : '1. Jami Aktivlar'}
            </div>
            <div
              style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text-primary)' }}
              className="tabular-nums"
            >
              {formatCurrency(metrics.totalAssets, locale, docCurrency)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Касса, банк, склад, дебиторы' : 'Kassa, bank, tovar, debitorlar'}
            </div>
          </div>
        </Card>

        {/* Card 2: Total Liabilities */}
        <Card
          style={{
            padding: 'var(--space-4)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            borderLeft: '4px solid #ef4444',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ef4444',
              flexShrink: 0,
            }}
          >
            <TrendingDown size={20} />
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              {isRu ? '2. Обязательства (Итого)' : '2. Jami Majburiyatlar'}
            </div>
            <div
              style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text-primary)' }}
              className="tabular-nums"
            >
              {formatCurrency(metrics.totalLiabilities, locale, docCurrency)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Кредиторы, авансы клиентов' : 'Yetkazib beruvchilar, olingan avanslar'}
            </div>
          </div>
        </Card>

        {/* Card 3: Equity */}
        <Card
          style={{
            padding: 'var(--space-4)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            borderLeft: '4px solid #6366f1',
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'rgba(99, 102, 241, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#6366f1',
              flexShrink: 0,
            }}
          >
            <Building2 size={20} />
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              {isRu ? '3. Собственный капитал' : '3. Boshlang‘ich Kapital'}
            </div>
            <div
              style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--color-text-primary)' }}
              className="tabular-nums"
            >
              {formatCurrency(metrics.enteredEquity, locale, docCurrency)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Расчетный:' : 'Kutilayotgan:'} {formatCurrency(metrics.suggestedEquity, locale, docCurrency)}
            </div>
          </div>
        </Card>

        {/* Card 4: Balance Equation Control */}
        <Card
          style={{
            padding: 'var(--space-4)',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            borderLeft: `4px solid ${metrics.isBalanced ? '#10b981' : '#f59e0b'}`,
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-md)',
              backgroundColor: metrics.isBalanced ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: metrics.isBalanced ? '#10b981' : '#f59e0b',
              flexShrink: 0,
            }}
          >
            {metrics.isBalanced ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
          </div>
          <div style={{ overflow: 'hidden', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                {isRu ? 'Баланс (Разница)' : 'Balans (Farq)'}
              </span>
              <Badge variant={metrics.isBalanced ? 'success' : 'warning'}>
                {metrics.isBalanced ? (isRu ? 'Баланс сошёлся' : 'Balans teng') : isRu ? 'Разница' : 'Farq bor'}
              </Badge>
            </div>
            <div
              style={{
                fontSize: 'var(--text-lg)',
                fontWeight: 700,
                color: metrics.isBalanced ? '#10b981' : '#f59e0b',
              }}
              className="tabular-nums"
            >
              {formatCurrency(metrics.balanceDifference, locale, docCurrency)}
            </div>
            {!metrics.isBalanced && !isReadOnly && (
              <button
                type="button"
                onClick={handleAutoBalance}
                disabled={actionLoading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  marginTop: '2px',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: 'var(--color-primary-600)',
                  cursor: 'pointer',
                }}
              >
                <Sparkles size={12} />
                <span>{isRu ? 'Сбалансировать капиталом' : 'Kapital bilan tenglashtirish'}</span>
              </button>
            )}
          </div>
        </Card>
      </div>

      {/* ─── Master Document Control Card ─────────────────────────── */}
      <Card style={{ padding: 'var(--space-4)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 'var(--space-4)',
          }}
        >
          {/* Left: Document Selector & Cutoff Date */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            <div style={{ width: '280px' }}>
              <Select
                options={documentOptions}
                value={selectedDocId}
                onChange={setSelectedDocId}
                placeholder={isRu ? 'Выберите документ' : 'Hujjatni tanlang'}
                size="sm"
              />
            </div>

            {currentDoc && getDocStatusBadge(currentDoc.status)}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 500, color: 'var(--color-text-secondary)' }}>
                {isRu ? 'Дата среза:' : 'Kesim sanasi:'}
              </span>
              <div style={{ width: '150px' }}>
                <DatePicker
                  value={openingDate}
                  onChange={setOpeningDate}
                  disabled={isReadOnly}
                  size="sm"
                />
              </div>
            </div>

            <Badge variant="neutral">
              {lines.length} {isRu ? 'строк' : 'ta qator'}
            </Badge>
          </div>

          {/* Right: Operational Status Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            {currentDoc && !isReadOnly && (
              <>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveLines}
                  disabled={actionLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Save size={14} />
                  <span>{actionLoading ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : isRu ? 'Сохранить' : 'Saqlash'}</span>
                </Button>

                {currentDoc.status === 'DRAFT' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleSubmitForReview}
                    disabled={actionLoading}
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Clock size={14} />
                    <span>{isRu ? 'На проверку' : 'Tekshirishga'}</span>
                  </Button>
                )}

                <Button
                  variant="primary"
                  size="sm"
                  onClick={handlePost}
                  disabled={actionLoading || !metrics.isBalanced}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    backgroundColor: metrics.isBalanced ? '#10b981' : undefined,
                    borderColor: metrics.isBalanced ? '#10b981' : undefined,
                  }}
                >
                  <CheckCircle2 size={14} />
                  <span>{actionLoading ? (isRu ? 'Проведение...' : 'Tasdiqlanmoqda...') : isRu ? 'Провести остатки' : 'Tasdiqlash (Post)'}</span>
                </Button>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleDeleteDocument}
                  disabled={actionLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--color-error-600)' }}
                >
                  <Trash2 size={14} />
                  <span>{isRu ? 'Удалить' : 'O‘chirish'}</span>
                </Button>
              </>
            )}

            {currentDoc && isReadOnly && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowUnpostModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: 'var(--color-error-600)',
                  borderColor: 'var(--color-error-100)',
                }}
              >
                <RotateCcw size={14} />
                <span>{isRu ? 'Переоткрыть (Unpost)' : 'Qayta ochish (Unpost)'}</span>
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* ─── Underline Tab Navigation Bar (Matches Finance) ────────── */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--color-border-light)',
          gap: 'var(--space-2)',
          overflowX: 'auto',
          paddingBottom: '2px',
        }}
      >
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
                transition: 'all var(--transition-fast)',
              }}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <Badge variant={isActive ? 'info' : 'neutral'}>
                  {tab.count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* ─── Sub-Ledger Content Tables ─────────────────────────────── */}

      {/* TAB 1: CASH & BANK */}
      {activeTab === 'cash' && (
        <SubledgerCard
          title={isRu ? 'Денежные средства в кассе и на расчетных счетах' : 'Kassa va bankdagi pul mablag‘lari'}
          count={tabCounts.cash}
          isReadOnly={isReadOnly}
          onAdd={() => addLine('CASH')}
          addText={isRu ? 'Добавить счет / кассу' : 'Kassa / hisob qo‘shish'}
        >
          <CashTable
            lines={lines}
            isReadOnly={isReadOnly}
            accounts={accounts}
            locale={locale}
            isRu={isRu}
            onUpdate={updateLineField}
            onRemove={removeLine}
          />
        </SubledgerCard>
      )}

      {/* TAB 2: INVENTORY */}
      {activeTab === 'inventory' && (
        <SubledgerCard
          title={isRu ? 'Товарно-материальные ценности на складах' : 'Ombordagi tovar va materiallar qoldiqlari'}
          count={tabCounts.inventory}
          isReadOnly={isReadOnly}
          onAdd={() => addLine('INVENTORY')}
          addText={isRu ? 'Добавить товар' : 'Tovar qo‘shish'}
        >
          <InventoryTable
            lines={lines}
            isReadOnly={isReadOnly}
            products={products}
            warehouses={warehouses}
            locale={locale}
            isRu={isRu}
            currency={docCurrency}
            onUpdate={updateLineField}
            onRemove={removeLine}
          />
        </SubledgerCard>
      )}

      {/* TAB 3: CUSTOMER DEBT */}
      {activeTab === 'customers' && (
        <SubledgerCard
          title={isRu ? 'Задолженность покупателей (Дебиторы)' : 'Mijozlar qarzdorligi (Debitorlik)'}
          count={tabCounts.customers}
          isReadOnly={isReadOnly}
          onAdd={() => addLine('CUSTOMER_DEBT')}
          addText={isRu ? 'Добавить клиента' : 'Mijoz qarzdorligini qo‘shish'}
        >
          <CounterpartyTable
            category="CUSTOMER_DEBT"
            lines={lines}
            isReadOnly={isReadOnly}
            counterparties={counterparties.filter((c) => c.type === 'CUSTOMER' || c.type === 'BOTH')}
            locale={locale}
            isRu={isRu}
            onUpdate={updateLineField}
            onRemove={removeLine}
          />
        </SubledgerCard>
      )}

      {/* TAB 4: SUPPLIER DEBT */}
      {activeTab === 'suppliers' && (
        <SubledgerCard
          title={isRu ? 'Задолженность поставщикам (Кредиторы)' : 'Yetkazib beruvchilarga qarzlar (Kreditorlik)'}
          count={tabCounts.suppliers}
          isReadOnly={isReadOnly}
          onAdd={() => addLine('SUPPLIER_DEBT')}
          addText={isRu ? 'Добавить поставщика' : 'Yetkazib beruvchini qo‘shish'}
        >
          <CounterpartyTable
            category="SUPPLIER_DEBT"
            lines={lines}
            isReadOnly={isReadOnly}
            counterparties={counterparties.filter((c) => c.type === 'SUPPLIER' || c.type === 'BOTH')}
            locale={locale}
            isRu={isRu}
            onUpdate={updateLineField}
            onRemove={removeLine}
          />
        </SubledgerCard>
      )}

      {/* TAB 5: ADVANCES */}
      {activeTab === 'advances' && (
        <SubledgerCard
          title={isRu ? 'Авансы: выданные поставщикам и полученные от клиентов' : 'Avanslar: yetkazib beruvchilarga berilgan va mijozlardan olingan'}
          count={tabCounts.advances}
          isReadOnly={isReadOnly}
          onAdd={() => addLine('CUSTOMER_ADVANCE')}
          addText={isRu ? 'Добавить аванс' : 'Avans qo‘shish'}
        >
          <AdvancesTable
            lines={lines}
            isReadOnly={isReadOnly}
            counterparties={counterparties}
            locale={locale}
            isRu={isRu}
            onUpdate={updateLineField}
            onRemove={removeLine}
          />
        </SubledgerCard>
      )}

      {/* TAB 6: FIXED ASSETS */}
      {activeTab === 'fixed-assets' && (
        <SubledgerCard
          title={isRu ? 'Основные средства (Оборудование, техника, транспорт)' : 'Asosiy vositalar (Uskunalar, texnika, transport)'}
          count={tabCounts.fixedAssets}
          isReadOnly={isReadOnly}
          onAdd={() => addLine('FIXED_ASSET')}
          addText={isRu ? 'Добавить объект' : 'Asosiy vosita qo‘shish'}
        >
          <FixedAssetsTable
            lines={lines}
            isReadOnly={isReadOnly}
            fixedAssets={fixedAssets}
            locale={locale}
            isRu={isRu}
            currency={docCurrency}
            onUpdate={updateLineField}
            onRemove={removeLine}
          />
        </SubledgerCard>
      )}

      {/* TAB 7: OTHER & EQUITY */}
      {activeTab === 'other' && (
        <SubledgerCard
          title={isRu ? 'Собственный капитал и прочие статьи баланса' : 'Ustav kapitali va boshqa balans moddalari'}
          count={tabCounts.other}
          isReadOnly={isReadOnly}
          onAdd={() => addLine('EQUITY')}
          addText={isRu ? 'Добавить статью' : 'Modda qo‘shish'}
        >
          <OtherTable
            lines={lines}
            isReadOnly={isReadOnly}
            locale={locale}
            isRu={isRu}
            onUpdate={updateLineField}
            onRemove={removeLine}
          />
        </SubledgerCard>
      )}

      {/* ─── Modal: New Document ───────────────────────────────────── */}
      <Modal
        isOpen={showNewDocModal}
        title={isRu ? 'Новый ввод начальных остатков' : 'Yangi boshlang‘ich qoldiq hujjati'}
        onClose={() => setShowNewDocModal(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-1)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {isRu ? 'Дата среза остатков' : 'Boshlang‘ich qoldiq sanasi'}
            </label>
            <DatePicker value={newDocDate} onChange={setNewDocDate} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {isRu ? 'Номер документа (оставьте пустым для автонумерации)' : 'Hujjat raqami (avtomatik yaratish uchun bo‘sh qoldiring)'}
            </label>
            <Input
              type="text"
              placeholder="OB-2026-0001"
              value={newDocNumber}
              onChange={(e) => setNewDocNumber(e.target.value)}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {isRu ? 'Примечание / Основание' : 'Izoh / Asos'}
            </label>
            <Input
              type="text"
              placeholder={isRu ? 'Основание ввода остатков...' : 'Kiritish asosi...'}
              value={newDocNotes}
              onChange={(e) => setNewDocNotes(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
            <Button variant="secondary" onClick={() => setShowNewDocModal(false)}>
              {isRu ? 'Отмена' : 'Bekor qilish'}
            </Button>
            <Button variant="primary" onClick={handleCreateDocument} disabled={actionLoading}>
              {actionLoading ? (isRu ? 'Создание...' : 'Yaratilmoqda...') : isRu ? 'Создать документ' : 'Hujjat yaratish'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Modal: Excel Import ───────────────────────────────────── */}
      <Modal
        isOpen={showImportModal}
        title={isRu ? 'Импорт остатков из Excel' : 'Boshlang‘ich qoldiqlarni Exceldan yuklash'}
        onClose={() => setShowImportModal(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-1)' }}>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            {isRu
              ? 'Заполните скачанный шаблон Excel со всеми вкладками (Деньги, Склад, Клиенты, Поставщики) и выберите файл для загрузки.'
              : 'Standart Excel shablonini to‘ldiring (Pul, Tovar, Mijozlar, Yetkazib beruvchilar varaqlari bilan) va yuklash uchun faylni tanlang.'}
          </p>

          <div
            style={{
              border: '2px dashed var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-6)',
              textAlign: 'center',
              backgroundColor: 'var(--color-bg-subtle)',
            }}
          >
            <FileSpreadsheet size={36} color="var(--color-primary-600)" style={{ margin: '0 auto 8px' }} />
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setImportFile(e.target.files?.[0] || null)}
              style={{ display: 'block', margin: '0 auto', fontSize: 'var(--text-sm)' }}
            />
          </div>

          {importErrors.length > 0 && (
            <div
              style={{
                backgroundColor: 'var(--color-error-50)',
                border: '1px solid var(--color-error-100)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3)',
                maxHeight: '180px',
                overflowY: 'auto',
              }}
            >
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-error-600)', display: 'block', marginBottom: '4px' }}>
                {isRu ? 'Ошибки в файле Excel:' : 'Excel fayldagi xatoliklar:'}
              </span>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: 'var(--text-xs)', color: 'var(--color-error-600)' }}>
                {importErrors.map((err, idx) => (
                  <li key={idx}>
                    <strong>[{err.sheetName}, Qator {err.rowNumber}]:</strong> {err.errorMessage}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
            <Button variant="secondary" onClick={() => setShowImportModal(false)}>
              {isRu ? 'Отмена' : 'Bekor qilish'}
            </Button>
            <Button
              variant="primary"
              onClick={handleImportFile}
              disabled={!importFile || importing}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Upload size={16} />
              <span>{importing ? (isRu ? 'Проверка...' : 'Tekshirilmoqda...') : isRu ? 'Загрузить и применить' : 'Yuklash va saqlash'}</span>
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Modal: Unpost Confirmation (Rollback Invariant) ────────── */}
      <Modal
        isOpen={showUnpostModal}
        title={isRu ? 'Переоткрыть документ остатков (Unpost)' : 'Boshlang‘ich qoldiqni qayta ochish (Unpost)'}
        onClose={() => setShowUnpostModal(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-1)' }}>
          <div
            style={{
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-warning-50)',
              border: '1px solid var(--color-warning-100)',
              display: 'flex',
              gap: '10px',
            }}
          >
            <AlertTriangle size={20} color="var(--color-warning-600)" style={{ flexShrink: 0, marginTop: '2px' }} />
            <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-warning-700)' }}>
              {isRu
                ? 'Внимание! Документ вернется в статус черновика. Будет проверен защитный инвариант: если часть товаров уже продана или деньги сняты из кассы, переоткрытие будет заблокировано.'
                : 'Diqqat! Hujjat qoralama holatiga qaytariladi. Xavfsizlik qoidasi tekshiriladi: agar dastlabki partiyadagi tovarlar sotilgan bo‘lsa yoki kassa kamaygan bo‘lsa, qayta ochish taqiqlanadi.'}
            </p>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
              {isRu ? 'Причина переоткрытия' : 'Qayta ochish sababi'}
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
            <Button
              variant="primary"
              onClick={handleUnpost}
              disabled={actionLoading}
              style={{ backgroundColor: 'var(--color-error-600)', borderColor: 'var(--color-error-600)' }}
            >
              {actionLoading ? (isRu ? 'Переоткрытие...' : 'Qayta ochilmoqda...') : isRu ? 'Да, переоткрыть' : 'Ha, qayta ochilsin'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-Components & Table Sections
// ─────────────────────────────────────────────────────────────────────────────

function SubledgerCard({
  title,
  count,
  isReadOnly,
  onAdd,
  addText,
  children,
}: {
  title: string;
  count: number;
  isReadOnly: boolean;
  onAdd: () => void;
  addText: string;
  children: React.ReactNode;
}) {
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--color-border-light)',
          flexWrap: 'wrap',
          gap: 'var(--space-2)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {title}
          </h3>
          <Badge variant="neutral">
            {count}
          </Badge>
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

// ─── Table 1: Cash & Bank ──────────────────────────────────────────────────

function CashTable({
  lines,
  isReadOnly,
  accounts,
  locale,
  isRu,
  onUpdate,
  onRemove,
}: any) {
  const filtered = lines
    .map((l: any, i: number) => (l.category === 'CASH' || l.category === 'BANK' ? { line: l, index: i } : null))
    .filter(Boolean);

  const getAccountName = (acc: any) => {
    if (!acc) return '—';
    if (typeof acc.name === 'string') return acc.name;
    return acc.name?.[locale] || acc.name?.uz || acc.name?.ru || 'Kassa';
  };

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
      <thead style={{ backgroundColor: 'var(--color-bg-subtle)', borderBottom: '1px solid var(--color-border-light)' }}>
        <tr>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '40px' }}>#</th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '240px' }}>{isRu ? 'КАССА / РАСЧЕТНЫЙ СЧЕТ' : 'KASSA / HISOBRAQAM'}</th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '90px' }}>{isRu ? 'ВАЛЮТА' : 'VALYUTA'}</th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '180px', textAlign: 'right' }}>{isRu ? 'НАЧАЛЬНЫЙ ОСТАТОК' : 'BOSHLANG‘ICH QOLDIQ'}</th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '200px' }}>{isRu ? 'ПРИМЕЧАНИЕ' : 'IZOH'}</th>
          {!isReadOnly && <th style={{ padding: '12px 16px', width: '50px', textAlign: 'center' }}></th>}
        </tr>
      </thead>
      <tbody>
        {filtered.length === 0 ? (
          <tr>
            <td colSpan={6} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Нет добавленных счетов или касс' : 'Kassa yoki hisoblar qo‘shilmagan'}
            </td>
          </tr>
        ) : (
          filtered.map(({ line, index }: any, pos: number) => (
            <tr
              key={index}
              style={{ borderBottom: '1px solid var(--color-border-light)', transition: 'background-color 0.15s ease' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <td style={{ padding: '12px 16px', color: 'var(--color-text-tertiary)', fontWeight: 500 }}>{pos + 1}</td>
              <td style={{ padding: '12px 16px' }}>
                <Select
                  value={line.accountId || ''}
                  disabled={isReadOnly}
                  onChange={(value) => {
                    const account = accounts.find((item: any) => item.id === value);
                    onUpdate(index, 'accountId', value);
                    if (account) {
                      onUpdate(index, 'currency', account.currency || 'USD');
                      onUpdate(index, 'category', account.accountType === 'BANK' ? 'BANK' : 'CASH');
                    }
                  }}
                  style={{ width: '100%', maxWidth: '300px' }}
                  options={[
                    { value: '', label: isRu ? 'Выберите кассу/банк' : 'Kassa yoki bankni tanlang' },
                    ...accounts.map((account: any) => ({
                      value: account.id,
                      label: `${getAccountName(account)} (${account.currency})`,
                    })),
                  ]}
                />
              </td>
              <td style={{ padding: '12px 16px' }}>
                <Badge variant="neutral">
                  {line.currency || 'USD'}
                </Badge>
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={line.amount || ''}
                  disabled={isReadOnly}
                  onChange={(e) => onUpdate(index, 'amount', parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="tabular-nums"
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-primary)',
                    width: '180px',
                    fontWeight: 600,
                    textAlign: 'right',
                    fontSize: 'var(--text-sm)',
                  }}
                />
              </td>
              <td style={{ padding: '12px 16px' }}>
                <input
                  type="text"
                  value={line.notes || ''}
                  disabled={isReadOnly}
                  onChange={(e) => onUpdate(index, 'notes', e.target.value)}
                  placeholder={isRu ? 'Примечание...' : 'Izoh...'}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-primary)',
                    width: '100%',
                    fontSize: 'var(--text-sm)',
                  }}
                />
              </td>
              {!isReadOnly && (
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    style={{ background: 'none', border: 'none', color: 'var(--color-error-500)', cursor: 'pointer', padding: '4px' }}
                    title={isRu ? 'Удалить' : 'O‘chirish'}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              )}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

// ─── Table 2: Inventory ───────────────────────────────────────────────────

function InventoryTable({
  lines,
  isReadOnly,
  products,
  warehouses,
  locale,
  isRu,
  currency,
  onUpdate,
  onRemove,
}: any) {
  const filtered = lines
    .map((l: any, i: number) => (l.category === 'INVENTORY' ? { line: l, index: i } : null))
    .filter(Boolean);

  const getProductName = (p: any) => {
    if (!p) return '—';
    if (typeof p.name === 'string') return p.name;
    return p.name?.[locale] || p.name?.uz || p.name?.ru || 'Tovar';
  };

  const getWarehouseName = (w: any) => {
    if (!w) return '—';
    if (typeof w.name === 'string') return w.name;
    return w.name?.[locale] || w.name?.uz || w.name?.ru || 'Ombor';
  };

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
      <thead style={{ backgroundColor: 'var(--color-bg-subtle)', borderBottom: '1px solid var(--color-border-light)' }}>
        <tr>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '40px' }}>#</th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '220px' }}>{isRu ? 'ТОВАР (SKU)' : 'TOVAR (SKU)'}</th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '180px' }}>{isRu ? 'СКЛАД' : 'OMBOR'}</th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '120px', textAlign: 'right' }}>{isRu ? 'КОЛИЧЕСТВО' : 'MIQDOR'}</th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '140px', textAlign: 'right' }}>{isRu ? 'ТАННАРХ' : 'TANNARX'}</th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '160px', textAlign: 'right' }}>{isRu ? 'СУММА' : 'SUMMA'}</th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '140px' }}>{isRu ? 'ПАРТИЯ' : 'PARTIYA №'}</th>
          {!isReadOnly && <th style={{ padding: '12px 16px', width: '50px', textAlign: 'center' }}></th>}
        </tr>
      </thead>
      <tbody>
        {filtered.length === 0 ? (
          <tr>
            <td colSpan={8} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Остатки товаров не добавлены' : 'Tovarlar qoldig‘i qo‘shilmagan'}
            </td>
          </tr>
        ) : (
          filtered.map(({ line, index }: any, pos: number) => (
            <tr
              key={index}
              style={{ borderBottom: '1px solid var(--color-border-light)', transition: 'background-color 0.15s ease' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <td style={{ padding: '12px 16px', color: 'var(--color-text-tertiary)', fontWeight: 500 }}>{pos + 1}</td>
              <td style={{ padding: '12px 16px' }}>
                <Select
                  value={line.productId || ''}
                  disabled={isReadOnly}
                  onChange={(value) => onUpdate(index, 'productId', value)}
                  style={{ width: '100%' }}
                  options={[
                    { value: '', label: isRu ? 'Выберите товар' : 'Tovarni tanlang' },
                    ...products.map((product: any) => ({
                      value: product.id,
                      label: `${product.sku ? `[${product.sku}] ` : ''}${getProductName(product)}`,
                    })),
                  ]}
                />
              </td>
              <td style={{ padding: '12px 16px' }}>
                <Select
                  value={line.warehouseId || ''}
                  disabled={isReadOnly}
                  onChange={(value) => onUpdate(index, 'warehouseId', value)}
                  style={{ width: '100%' }}
                  options={[
                    { value: '', label: isRu ? 'Выберите склад' : 'Omborni tanlang' },
                    ...warehouses.map((warehouse: any) => ({
                      value: warehouse.id,
                      label: getWarehouseName(warehouse),
                    })),
                  ]}
                />
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={line.quantity || ''}
                  disabled={isReadOnly}
                  onChange={(e) => onUpdate(index, 'quantity', parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className="tabular-nums"
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-primary)',
                    width: '100px',
                    textAlign: 'right',
                    fontSize: 'var(--text-sm)',
                  }}
                />
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={line.unitCost || ''}
                  disabled={isReadOnly}
                  onChange={(e) => onUpdate(index, 'unitCost', parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="tabular-nums"
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-primary)',
                    width: '120px',
                    textAlign: 'right',
                    fontSize: 'var(--text-sm)',
                  }}
                />
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, color: 'var(--color-text-primary)' }} className="tabular-nums">
                {formatCurrency(Number(line.amount || 0), locale, currency || 'USD')}
              </td>
              <td style={{ padding: '12px 16px' }}>
                <input
                  type="text"
                  value={line.batchNumber || ''}
                  disabled={isReadOnly}
                  onChange={(e) => onUpdate(index, 'batchNumber', e.target.value)}
                  placeholder="INIT-BATCH"
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-primary)',
                    width: '100%',
                    fontSize: 'var(--text-sm)',
                  }}
                />
              </td>
              {!isReadOnly && (
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    style={{ background: 'none', border: 'none', color: 'var(--color-error-500)', cursor: 'pointer', padding: '4px' }}
                    title={isRu ? 'Удалить' : 'O‘chirish'}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              )}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

// ─── Table 3: Counterparties (Debts) ──────────────────────────────────────

function CounterpartyTable({
  category,
  lines,
  isReadOnly,
  counterparties,
  locale,
  isRu,
  onUpdate,
  onRemove,
}: any) {
  const filtered = lines
    .map((l: any, i: number) => (l.category === category ? { line: l, index: i } : null))
    .filter(Boolean);

  const isCustomer = category === 'CUSTOMER_DEBT';

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
      <thead style={{ backgroundColor: 'var(--color-bg-subtle)', borderBottom: '1px solid var(--color-border-light)' }}>
        <tr>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '40px' }}>#</th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '240px' }}>
            {isCustomer ? (isRu ? 'КЛИЕНТ / ПОКУПАТЕЛЬ' : 'MIJOZ / XARIDOR') : isRu ? 'ПОСТАВЩИК' : 'YETKAZIB BERUVCHI'}
          </th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '160px' }}>{isRu ? 'ДОГОВОР №' : 'SHARTNOMA №'}</th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '180px', textAlign: 'right' }}>
            {isCustomer ? (isRu ? 'СУММА ДОЛГА (ДЕБИТОР)' : 'QARZ SUMMASI (DEBITOR)') : isRu ? 'НАШ ДОЛГ (КРЕДИТОР)' : 'QARZIMIZ (KREDITOR)'}
          </th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '200px' }}>{isRu ? 'ПРИМЕЧАНИЕ' : 'IZOH'}</th>
          {!isReadOnly && <th style={{ padding: '12px 16px', width: '50px', textAlign: 'center' }}></th>}
        </tr>
      </thead>
      <tbody>
        {filtered.length === 0 ? (
          <tr>
            <td colSpan={6} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Нет добавленных контрагентов' : 'Kontragentlar qo‘shilmagan'}
            </td>
          </tr>
        ) : (
          filtered.map(({ line, index }: any, pos: number) => (
            <tr
              key={index}
              style={{ borderBottom: '1px solid var(--color-border-light)', transition: 'background-color 0.15s ease' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <td style={{ padding: '12px 16px', color: 'var(--color-text-tertiary)', fontWeight: 500 }}>{pos + 1}</td>
              <td style={{ padding: '12px 16px' }}>
                <Select
                  value={line.counterpartyId || ''}
                  disabled={isReadOnly}
                  onChange={(value) => onUpdate(index, 'counterpartyId', value)}
                  style={{ width: '100%', maxWidth: '300px' }}
                  options={[
                    { value: '', label: isRu ? 'Выберите контрагента' : 'Kontragentni tanlang' },
                    ...counterparties.map((counterparty: any) => ({
                      value: counterparty.id,
                      label: `${counterparty.name} ${counterparty.inn ? `(STIR: ${counterparty.inn})` : ''}`,
                    })),
                  ]}
                />
              </td>
              <td style={{ padding: '12px 16px' }}>
                <input
                  type="text"
                  value={line.contractNumber || ''}
                  disabled={isReadOnly}
                  onChange={(e) => onUpdate(index, 'contractNumber', e.target.value)}
                  placeholder={isRu ? '№ договора...' : 'Shartnoma raqami...'}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-primary)',
                    width: '100%',
                    fontSize: 'var(--text-sm)',
                  }}
                />
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={line.amount || ''}
                  disabled={isReadOnly}
                  onChange={(e) => onUpdate(index, 'amount', parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="tabular-nums"
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: isCustomer ? '#10b981' : '#ef4444',
                    width: '180px',
                    fontWeight: 600,
                    textAlign: 'right',
                    fontSize: 'var(--text-sm)',
                  }}
                />
              </td>
              <td style={{ padding: '12px 16px' }}>
                <input
                  type="text"
                  value={line.notes || ''}
                  disabled={isReadOnly}
                  onChange={(e) => onUpdate(index, 'notes', e.target.value)}
                  placeholder={isRu ? 'Примечание...' : 'Izoh...'}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-primary)',
                    width: '100%',
                    fontSize: 'var(--text-sm)',
                  }}
                />
              </td>
              {!isReadOnly && (
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    style={{ background: 'none', border: 'none', color: 'var(--color-error-500)', cursor: 'pointer', padding: '4px' }}
                    title={isRu ? 'Удалить' : 'O‘chirish'}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              )}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

// ─── Table 4: Advances ────────────────────────────────────────────────────

function AdvancesTable({
  lines,
  isReadOnly,
  counterparties,
  locale,
  isRu,
  onUpdate,
  onRemove,
}: any) {
  const filtered = lines
    .map((l: any, i: number) =>
      l.category === 'CUSTOMER_ADVANCE' || l.category === 'SUPPLIER_ADVANCE' ? { line: l, index: i } : null,
    )
    .filter(Boolean);

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
      <thead style={{ backgroundColor: 'var(--color-bg-subtle)', borderBottom: '1px solid var(--color-border-light)' }}>
        <tr>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '40px' }}>#</th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '220px' }}>{isRu ? 'ТИП АВАНСА' : 'AVANS TURI'}</th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '240px' }}>{isRu ? 'КОНТРАГЕНТ' : 'KONTRAGENT'}</th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '180px', textAlign: 'right' }}>{isRu ? 'СУММА АВАНСА' : 'AVANS SUMMASI'}</th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '200px' }}>{isRu ? 'ПРИМЕЧАНИЕ' : 'IZOH'}</th>
          {!isReadOnly && <th style={{ padding: '12px 16px', width: '50px', textAlign: 'center' }}></th>}
        </tr>
      </thead>
      <tbody>
        {filtered.length === 0 ? (
          <tr>
            <td colSpan={6} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Нет добавленных авансов' : 'Avanslar qo‘shilmagan'}
            </td>
          </tr>
        ) : (
          filtered.map(({ line, index }: any, pos: number) => (
            <tr
              key={index}
              style={{ borderBottom: '1px solid var(--color-border-light)', transition: 'background-color 0.15s ease' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <td style={{ padding: '12px 16px', color: 'var(--color-text-tertiary)', fontWeight: 500 }}>{pos + 1}</td>
              <td style={{ padding: '12px 16px' }}>
                <Select
                  value={line.category}
                  disabled={isReadOnly}
                  onChange={(value) => onUpdate(index, 'category', value)}
                  style={{ width: '100%' }}
                  options={[
                    { value: 'CUSTOMER_ADVANCE', label: isRu ? 'Получен от клиента (Пассив)' : 'Mijozdan olingan (Majburiyat)' },
                    { value: 'SUPPLIER_ADVANCE', label: isRu ? 'Выдан поставщику (Актив)' : 'Yetkazib beruvchiga berilgan (Aktiv)' },
                  ]}
                />
              </td>
              <td style={{ padding: '12px 16px' }}>
                <Select
                  value={line.counterpartyId || ''}
                  disabled={isReadOnly}
                  onChange={(value) => onUpdate(index, 'counterpartyId', value)}
                  style={{ width: '100%', maxWidth: '300px' }}
                  options={[
                    { value: '', label: isRu ? 'Выберите контрагента' : 'Kontragentni tanlang' },
                    ...counterparties.map((counterparty: any) => ({
                      value: counterparty.id,
                      label: `${counterparty.name} ${counterparty.inn ? `(STIR: ${counterparty.inn})` : ''}`,
                    })),
                  ]}
                />
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={line.amount || ''}
                  disabled={isReadOnly}
                  onChange={(e) => onUpdate(index, 'amount', parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="tabular-nums"
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-primary)',
                    width: '180px',
                    fontWeight: 600,
                    textAlign: 'right',
                    fontSize: 'var(--text-sm)',
                  }}
                />
              </td>
              <td style={{ padding: '12px 16px' }}>
                <input
                  type="text"
                  value={line.notes || ''}
                  disabled={isReadOnly}
                  onChange={(e) => onUpdate(index, 'notes', e.target.value)}
                  placeholder={isRu ? 'Примечание...' : 'Izoh...'}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-primary)',
                    width: '100%',
                    fontSize: 'var(--text-sm)',
                  }}
                />
              </td>
              {!isReadOnly && (
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    style={{ background: 'none', border: 'none', color: 'var(--color-error-500)', cursor: 'pointer', padding: '4px' }}
                    title={isRu ? 'Удалить' : 'O‘chirish'}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              )}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

// ─── Table 5: Fixed Assets ────────────────────────────────────────────────

function FixedAssetsTable({
  lines,
  isReadOnly,
  fixedAssets,
  locale,
  isRu,
  currency,
  onUpdate,
  onRemove,
}: any) {
  const filtered = lines
    .map((l: any, i: number) => (l.category === 'FIXED_ASSET' ? { line: l, index: i } : null))
    .filter(Boolean);

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
      <thead style={{ backgroundColor: 'var(--color-bg-subtle)', borderBottom: '1px solid var(--color-border-light)' }}>
        <tr>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '40px' }}>#</th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '220px' }}>{isRu ? 'НАИМЕНОВАНИЕ ОС' : 'ASOSIY VOSITA NOMI'}</th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '140px' }}>{isRu ? 'ИНВ. НОМЕР' : 'INV. RAQAM'}</th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '160px', textAlign: 'right' }}>{isRu ? 'ПЕРВОНАЧ. СТОИМОСТЬ' : 'BOSHLANG‘ICH QIYMAT'}</th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '160px', textAlign: 'right' }}>{isRu ? 'ИЗНОС (АМОРТИЗАЦИЯ)' : 'ESKIRISH (AMORTIZATSIYA)'}</th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '160px', textAlign: 'right' }}>{isRu ? 'ОСТАТОЧНАЯ СТОИМОСТЬ' : 'QOLDIQ QIYMAT'}</th>
          {!isReadOnly && <th style={{ padding: '12px 16px', width: '50px', textAlign: 'center' }}></th>}
        </tr>
      </thead>
      <tbody>
        {filtered.length === 0 ? (
          <tr>
            <td colSpan={7} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Основные средства не добавлены' : 'Asosiy vositalar qo‘shilmagan'}
            </td>
          </tr>
        ) : (
          filtered.map(({ line, index }: any, pos: number) => {
            const initCost = Number(line.amount || 0);
            const accDep = Number(line.accumulatedDepreciation || 0);
            const netBookValue = Math.max(0, initCost - accDep);

            return (
              <tr
                key={index}
                style={{ borderBottom: '1px solid var(--color-border-light)', transition: 'background-color 0.15s ease' }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <td style={{ padding: '12px 16px', color: 'var(--color-text-tertiary)', fontWeight: 500 }}>{pos + 1}</td>
                <td style={{ padding: '12px 16px' }}>
                  <input
                    type="text"
                    value={line.notes || ''}
                    disabled={isReadOnly}
                    onChange={(e) => onUpdate(index, 'notes', e.target.value)}
                    placeholder={isRu ? 'Название станка, оборудования...' : 'Stanok, texnika, bino nomi...'}
                    style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-bg-secondary)',
                      color: 'var(--color-text-primary)',
                      width: '100%',
                      fontSize: 'var(--text-sm)',
                    }}
                  />
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <input
                    type="text"
                    value={line.contractNumber || ''}
                    disabled={isReadOnly}
                    onChange={(e) => onUpdate(index, 'contractNumber', e.target.value)}
                    placeholder="INV-001"
                    style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-bg-secondary)',
                      color: 'var(--color-text-primary)',
                      width: '100%',
                      fontSize: 'var(--text-sm)',
                    }}
                  />
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={line.amount || ''}
                    disabled={isReadOnly}
                    onChange={(e) => onUpdate(index, 'amount', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="tabular-nums"
                    style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-bg-secondary)',
                      color: 'var(--color-text-primary)',
                      width: '140px',
                      fontWeight: 600,
                      textAlign: 'right',
                      fontSize: 'var(--text-sm)',
                    }}
                  />
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={line.accumulatedDepreciation || ''}
                    disabled={isReadOnly}
                    onChange={(e) => onUpdate(index, 'accumulatedDepreciation', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="tabular-nums"
                    style={{
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      backgroundColor: 'var(--color-bg-secondary)',
                      color: '#ef4444',
                      width: '140px',
                      fontWeight: 600,
                      textAlign: 'right',
                      fontSize: 'var(--text-sm)',
                    }}
                  />
                </td>
                <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: '#10b981' }} className="tabular-nums">
                  {formatCurrency(netBookValue, locale, currency || 'USD')}
                </td>
                {!isReadOnly && (
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => onRemove(index)}
                      style={{ background: 'none', border: 'none', color: 'var(--color-error-500)', cursor: 'pointer', padding: '4px' }}
                      title={isRu ? 'Удалить' : 'O‘chirish'}
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                )}
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}

// ─── Table 6: Other & Equity ──────────────────────────────────────────────

function OtherTable({
  lines,
  isReadOnly,
  locale,
  isRu,
  onUpdate,
  onRemove,
}: any) {
  const filtered = lines
    .map((l: any, i: number) =>
      l.category === 'EQUITY' || l.category === 'OTHER_ASSET' || l.category === 'OTHER_LIABILITY'
        ? { line: l, index: i }
        : null,
    )
    .filter(Boolean);

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
      <thead style={{ backgroundColor: 'var(--color-bg-subtle)', borderBottom: '1px solid var(--color-border-light)' }}>
        <tr>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '40px' }}>#</th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '240px' }}>{isRu ? 'КАТЕГОРИЯ' : 'KATEGORIYA'}</th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '220px' }}>{isRu ? 'НАИМЕНОВАНИЕ СТАТЬИ' : 'MODDA NOMI'}</th>
          <th style={{ padding: '12px 16px', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', minWidth: '180px', textAlign: 'right' }}>{isRu ? 'СУММА' : 'SUMMA'}</th>
          {!isReadOnly && <th style={{ padding: '12px 16px', width: '50px', textAlign: 'center' }}></th>}
        </tr>
      </thead>
      <tbody>
        {filtered.length === 0 ? (
          <tr>
            <td colSpan={5} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
              {isRu ? 'Нет добавленных статей капитала или прочих остатков' : 'Kapital yoki boshqa moddalar qo‘shilmagan'}
            </td>
          </tr>
        ) : (
          filtered.map(({ line, index }: any, pos: number) => (
            <tr
              key={index}
              style={{ borderBottom: '1px solid var(--color-border-light)', transition: 'background-color 0.15s ease' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <td style={{ padding: '12px 16px', color: 'var(--color-text-tertiary)', fontWeight: 500 }}>{pos + 1}</td>
              <td style={{ padding: '12px 16px' }}>
                <Select
                  value={line.category}
                  disabled={isReadOnly}
                  onChange={(value) => onUpdate(index, 'category', value)}
                  style={{ width: '100%' }}
                  options={[
                    { value: 'EQUITY', label: isRu ? 'Собственный капитал (8330)' : 'Ustav kapitali / Taqsimlanmagan foyda' },
                    { value: 'OTHER_ASSET', label: isRu ? 'Прочие активы' : 'Boshqa aktivlar' },
                    { value: 'OTHER_LIABILITY', label: isRu ? 'Прочие обязательства' : 'Boshqa majburiyatlar' },
                  ]}
                />
              </td>
              <td style={{ padding: '12px 16px' }}>
                <input
                  type="text"
                  value={line.notes || ''}
                  disabled={isReadOnly}
                  onChange={(e) => onUpdate(index, 'notes', e.target.value)}
                  placeholder={isRu ? 'Например: Уставный фонд или переплата по налогу...' : 'Masalan: Ustav fondi yoki soliq ortiqcha to‘lovi...'}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: 'var(--color-text-primary)',
                    width: '100%',
                    fontSize: 'var(--text-sm)',
                  }}
                />
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={line.amount || ''}
                  disabled={isReadOnly}
                  onChange={(e) => onUpdate(index, 'amount', parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                  className="tabular-nums"
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    color: line.category === 'EQUITY' ? 'var(--color-primary-600)' : 'var(--color-text-primary)',
                    width: '180px',
                    fontWeight: 600,
                    textAlign: 'right',
                    fontSize: 'var(--text-sm)',
                  }}
                />
              </td>
              {!isReadOnly && (
                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => onRemove(index)}
                    style={{ background: 'none', border: 'none', color: 'var(--color-error-500)', cursor: 'pointer', padding: '4px' }}
                    title={isRu ? 'Удалить' : 'O‘chirish'}
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              )}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
