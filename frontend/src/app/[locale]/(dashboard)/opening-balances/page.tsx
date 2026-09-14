'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
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
  HelpCircle,
  FileText,
  Clock,
  Layers,
  ChevronRight,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';
import type {
  OpeningBalanceDocument,
  OpeningBalanceLine,
  OpeningBalanceCategory,
  OpeningBalanceStatus,
  OpeningBalanceMetrics,
  ImportErrorItem,
} from '@shared/types/opening-balances';

type TabKey = 'overview' | 'cash' | 'inventory' | 'customers' | 'suppliers' | 'fixed-assets' | 'other';

export default function OpeningBalancesPage() {
  const locale = useLocale();
  const isRu = locale === 'ru';
  const { token, company } = useAuth();
  const companyId = company?.id;

  // Documents State
  const [documents, setDocuments] = useState<OpeningBalanceDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [currentDoc, setCurrentDoc] = useState<OpeningBalanceDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  // Lookups
  const [accounts, setAccounts] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [counterparties, setCounterparties] = useState<any[]>([]);

  // Working lines
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
  const [importSummary, setImportSummary] = useState<any>(null);
  const [importing, setImporting] = useState(false);

  const [showUnpostModal, setShowUnpostModal] = useState(false);
  const [unpostReason, setUnpostReason] = useState('');

  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 5000);
  };

  // ─── Fetch Lookups ─────────────────────────────────────────────

  useEffect(() => {
    if (!token || !companyId) return;

    const fetchLookups = async () => {
      try {
        const [accs, whs, prods, cps] = await Promise.all([
          apiFetch<any[]>('/finance/accounts', { token: token || undefined, tenantId: companyId, locale }).catch(() => []),
          apiFetch<any[]>('/settings/branches', { token: token || undefined, tenantId: companyId, locale })
            .then((res: any) => (Array.isArray(res) ? res.flatMap((b) => b.warehouses || []) : []))
            .catch(() => []),
          apiFetch<any>('/products', { token: token || undefined, tenantId: companyId, locale })
            .then((res) => (res?.data ? res.data : Array.isArray(res) ? res : []))
            .catch(() => []),
          apiFetch<any[]>('/counterparties', { token: token || undefined, tenantId: companyId, locale }).catch(() => []),
        ]);

        setAccounts(accs || []);
        setWarehouses(whs || []);
        setProducts(prods || []);
        setCounterparties(cps || []);
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
      showToast(e.message || 'Xatolik yuz berdi', 'error');
    } finally {
      setLoading(false);
    }
  }, [token, companyId, locale, selectedDocId]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // ─── Load Selected Document ───────────────────────────────────

  useEffect(() => {
    if (!selectedDocId || !token || !companyId) return;

    const loadDocDetails = async () => {
      try {
        const doc = await apiFetch<OpeningBalanceDocument>(`/opening-balances/${selectedDocId}`, {
          token: token || undefined,
          tenantId: companyId,
          locale,
        });
        setCurrentDoc(doc);
        setLines(doc.lines || []);
        setOpeningDate(doc.openingDate ? doc.openingDate.slice(0, 10) : '2026-10-01');
        setNotes(doc.notes || '');
      } catch (e: any) {
        showToast(e.message || 'Hujjatni yuklashda xatolik', 'error');
      }
    };

    loadDocDetails();
  }, [selectedDocId, token, companyId, locale]);

  // ─── Real-Time Balance Metrics Calculation ────────────────────

  const metrics: OpeningBalanceMetrics = useMemo(() => {
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;
    const categoryBreakdown: Record<OpeningBalanceCategory, number> = {
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
      const cat = line.category as OpeningBalanceCategory;
      if (cat && categoryBreakdown[cat] !== undefined) {
        categoryBreakdown[cat] += amt;
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
          const net = line.netAmount !== undefined && line.netAmount !== null
            ? Number(line.netAmount)
            : Math.max(0, amt - Number(line.accumulatedDepreciation || 0));
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
      totalAssets,
      totalLiabilities,
      suggestedEquity,
      enteredEquity: totalEquity,
      balanceDifference,
      isBalanced,
      categoryBreakdown,
    };
  }, [lines]);

  const isReadOnly = currentDoc?.status === 'POSTED';

  // ─── Actions ───────────────────────────────────────────────────

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
          openingDate: newDocDate,
          docNumber: newDocNumber.trim() || undefined,
          notes: newDocNotes.trim() || undefined,
        }),
      });
      showToast(isRu ? 'Документ успешно создан' : 'Yangi hujjat yaratildi');
      setShowNewDocModal(false);
      setSelectedDocId(created.id);
      await loadDocuments();
    } catch (e: any) {
      showToast(e.message || 'Xatolik yuz berdi', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveLines = async () => {
    if (!currentDoc || !token || !companyId) return;
    setSaving(true);
    try {
      const updated = await apiFetch<OpeningBalanceDocument>(`/opening-balances/${currentDoc.id}/lines`, {
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
      setCurrentDoc(updated);
      setLines(updated.lines || []);
      showToast(isRu ? 'Данные успешно сохранены' : 'Qoldiqlar muvaffaqiyatli saqlandi');
    } catch (e: any) {
      showToast(e.message || 'Saqlashda xatolik', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!currentDoc || !token || !companyId) return;
    setActionLoading(true);
    try {
      await apiFetch(`/opening-balances/${currentDoc.id}/review`, {
        method: 'POST',
        token: token || undefined,
        tenantId: companyId,
        locale,
      });
      showToast(isRu ? 'Документ передан на проверку' : 'Hujjat tekshirishga yuborildi');
      await loadDocuments();
    } catch (e: any) {
      showToast(e.message || 'Xatolik yuz berdi', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePost = async () => {
    if (!currentDoc || !token || !companyId) return;
    if (!metrics.isBalanced) {
      showToast(
        isRu
          ? `Баланс не сошелся! Разница: ${metrics.balanceDifference} UZS`
          : `Balans teng emas! Farq: ${metrics.balanceDifference} so‘m. Boshlang‘ich balans farqi 0 bo‘lishi shart!`,
        'error',
      );
      return;
    }

    setActionLoading(true);
    try {
      await apiFetch(`/opening-balances/${currentDoc.id}/post`, {
        method: 'POST',
        token: token || undefined,
        tenantId: companyId,
        locale,
      });
      showToast(isRu ? 'Начальные остатки успешно проведены!' : 'Boshlang‘ich qoldiqlar muvaffaqiyatli tasdiqlandi!');
      await loadDocuments();
    } catch (e: any) {
      showToast(e.message || 'Tasdiqlashda xatolik yuz berdi', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnpost = async () => {
    if (!currentDoc || !token || !companyId) return;
    setActionLoading(true);
    try {
      await apiFetch(`/opening-balances/${currentDoc.id}/unpost`, {
        method: 'POST',
        token: token || undefined,
        tenantId: companyId,
        locale,
        body: JSON.stringify({ reason: unpostReason }),
      });
      showToast(isRu ? 'Документ успешно возвращен в черновик' : 'Hujjat muvaffaqiyatli qayta ochildi (qoralama holatiga qaytdi)');
      setShowUnpostModal(false);
      setUnpostReason('');
      await loadDocuments();
    } catch (e: any) {
      showToast(e.message || 'Qayta ochishda xatolik', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBalanceWithEquity = () => {
    if (metrics.balanceDifference === 0) return;
    const diff = metrics.balanceDifference;
    // Find existing equity line or create a new one
    const eqIdx = lines.findIndex((l) => l.category === 'EQUITY');
    if (eqIdx >= 0) {
      const updated = [...lines];
      updated[eqIdx].amount = Number(updated[eqIdx].amount || 0) + diff;
      setLines(updated);
    } else {
      setLines([
        ...lines,
        {
          category: 'EQUITY',
          amount: diff,
          currency: 'UZS',
          notes: isRu ? 'Уставный капитал / Нераспределенная прибыль' : 'Boshlang‘ich ustav kapitali / taqsimlanmagan foyda',
        },
      ]);
    }
    showToast(isRu ? 'Разница сбалансирована за счет капитала' : 'Farq Boshlang‘ich Kapital bilan tenglashtirildi');
  };

  const handleDownloadTemplate = () => {
    const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/opening-balances/template`;
    window.open(url, '_blank');
  };

  const handleImportFile = async () => {
    if (!importFile || !currentDoc || !token || !companyId) return;
    setImporting(true);
    setImportErrors([]);

    const formData = new FormData();
    formData.append('file', importFile);

    try {
      const res: any = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'}/opening-balances/${currentDoc.id}/import-commit`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'X-Tenant-Id': companyId,
            'Accept-Language': locale,
          },
          body: formData,
        },
      );

      const data = await res.json();
      if (!res.ok || data.success === false) {
        if (data.errors && Array.isArray(data.errors)) {
          setImportErrors(data.errors);
        } else {
          showToast(data.message || 'Import xatosi', 'error');
        }
        return;
      }

      showToast(data.message || 'Excel ma’lumotlari yuklandi');
      setShowImportModal(false);
      setImportFile(null);
      await loadDocuments();
    } catch (e: any) {
      showToast(e.message || 'Import jarayonida xatolik', 'error');
    } finally {
      setImporting(false);
    }
  };

  // ─── Line Manipulation Helpers ─────────────────────────────────

  const addLine = (category: OpeningBalanceCategory, defaults: Partial<OpeningBalanceLine> = {}) => {
    if (isReadOnly) return;
    const newLine: Partial<OpeningBalanceLine> = {
      category,
      amount: 0,
      currency: 'UZS',
      exchangeRate: 1,
      ...defaults,
    };
    setLines([...lines, newLine]);
  };

  const removeLine = (index: number) => {
    if (isReadOnly) return;
    const updated = [...lines];
    updated.splice(index, 1);
    setLines(updated);
  };

  const updateLineField = (index: number, field: keyof OpeningBalanceLine, val: any) => {
    if (isReadOnly) return;
    const updated = [...lines];
    updated[index] = { ...updated[index], [field]: val };

    // Auto-compute inventory amount
    if (updated[index].category === 'INVENTORY') {
      const q = Number(field === 'quantity' ? val : updated[index].quantity || 0);
      const c = Number(field === 'unitCost' ? val : updated[index].unitCost || 0);
      updated[index].amount = Math.round(q * c * 100) / 100;
    }

    // Auto-compute fixed asset net amount
    if (updated[index].category === 'FIXED_ASSET') {
      const cost = Number(field === 'amount' ? val : updated[index].amount || 0);
      const dep = Number(field === 'accumulatedDepreciation' ? val : updated[index].accumulatedDepreciation || 0);
      updated[index].netAmount = Math.max(0, cost - dep);
    }

    setLines(updated);
  };

  // ─── Status Badge Helper ───────────────────────────────────────

  const statusBadge = (status?: OpeningBalanceStatus) => {
    switch (status) {
      case 'POSTED':
        return <Badge variant="success">{isRu ? 'Проведено' : 'Tasdiqlangan'}</Badge>;
      case 'PENDING_REVIEW':
        return <Badge variant="info">{isRu ? 'На проверке' : 'Tekshirilmoqda'}</Badge>;
      case 'CANCELLED':
        return <Badge variant="neutral">{isRu ? 'Отменено' : 'Bekor qilingan'}</Badge>;
      default:
        return <Badge variant="warning">{isRu ? 'Черновик' : 'Qoralama'}</Badge>;
    }
  };

  return (
    <div style={{ padding: 'var(--space-6)', maxWidth: '1440px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '24px',
            right: '24px',
            zIndex: 9999,
            backgroundColor: toastMessage.type === 'success' ? '#10b981' : '#ef4444',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-lg)',
            fontWeight: 500,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'fadeIn 0.2s ease-in-out',
          }}
        >
          {toastMessage.type === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          {toastMessage.text}
        </div>
      )}

      {/* ─── Top Header & Document Controls ───────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: 'var(--radius-lg)',
                backgroundColor: 'rgba(59, 130, 246, 0.12)',
                color: '#3b82f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Scale size={24} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 'var(--text-2xl)', fontWeight: 700 }}>
                {isRu ? 'Ввод начальных остатков' : 'Boshlang‘ich qoldiqlar'}
              </h1>
              <p style={{ margin: '2px 0 0', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                {isRu
                  ? 'Ввод активов, обязательств и капитала предприятия на дату перехода в ERP'
                  : 'ERP tizimiga o‘tish sanasidagi aktivlar, majburiyatlar va boshlang‘ich kapitalni kiritish'}
              </p>
            </div>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={handleDownloadTemplate} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Download size={16} />
            {isRu ? 'Шаблон Excel' : 'Excel shablon'}
          </Button>

          {currentDoc && !isReadOnly && (
            <Button variant="secondary" onClick={() => setShowImportModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Upload size={16} />
              {isRu ? 'Загрузить из Excel' : 'Excel orqali yuklash'}
            </Button>
          )}

          <Button variant="secondary" onClick={() => setShowNewDocModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} />
            {isRu ? 'Новый документ' : 'Yangi hujjat'}
          </Button>

          {currentDoc && !isReadOnly && (
            <>
              <Button
                variant="secondary"
                onClick={handleSaveLines}
                disabled={saving}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Save size={16} />
                {saving ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : isRu ? 'Сохранить' : 'Saqlash'}
              </Button>

              {currentDoc.status === 'DRAFT' && (
                <Button
                  variant="secondary"
                  onClick={handleSubmitReview}
                  disabled={actionLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Clock size={16} />
                  {isRu ? 'На проверку' : 'Tekshirishga yuborish'}
                </Button>
              )}

              <Button
                variant="primary"
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
                <CheckCircle2 size={16} />
                {actionLoading ? (isRu ? 'Проведение...' : 'Tasdiqlanmoqda...') : isRu ? 'Провести остатки' : 'Tasdiqlash (Post)'}
              </Button>
            </>
          )}

          {currentDoc && isReadOnly && (
            <Button
              variant="secondary"
              onClick={() => setShowUnpostModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444', borderColor: '#fca5a5' }}
            >
              <RotateCcw size={16} />
              {isRu ? 'Переоткрыть (Unpost)' : 'Qayta ochish (Unpost)'}
            </Button>
          )}
        </div>
      </div>

      {/* Document Selector & Date Bar */}
      {documents.length > 0 && (
        <div
          style={{
            backgroundColor: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--space-4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 'var(--space-4)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{isRu ? 'Документ:' : 'Hujjat:'}</span>
              <select
                value={selectedDocId}
                onChange={(e) => setSelectedDocId(e.target.value)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'var(--color-bg)',
                  fontSize: 'var(--text-sm)',
                  fontWeight: 600,
                }}
              >
                {documents.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.docNumber} ({d.openingDate ? d.openingDate.slice(0, 10) : ''}) — {d.status}
                  </option>
                ))}
              </select>
            </div>

            {currentDoc && statusBadge(currentDoc.status)}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                {isRu ? 'Дата среза:' : 'Qoldiq sanasi:'}
              </span>
              <input
                type="date"
                value={openingDate}
                disabled={isReadOnly}
                onChange={(e) => setOpeningDate(e.target.value)}
                style={{
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  backgroundColor: isReadOnly ? 'var(--color-bg-muted)' : 'var(--color-bg)',
                  fontSize: 'var(--text-sm)',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            <span>{isRu ? 'Всего строк:' : 'Jami qatorlar:'} <strong>{lines.length}</strong></span>
          </div>
        </div>
      )}

      {/* ─── Balance Control Executive KPI Banner ─────────────────── */}
      <div
        style={{
          backgroundColor: 'var(--color-surface)',
          border: `2px solid ${metrics.isBalanced ? '#10b981' : '#f59e0b'}`,
          borderRadius: 'var(--radius-xl)',
          padding: 'var(--space-6)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 'var(--space-4)',
          position: 'relative',
          boxShadow: metrics.isBalanced
            ? '0 4px 20px -2px rgba(16, 185, 129, 0.12)'
            : '0 4px 20px -2px rgba(245, 158, 11, 0.15)',
        }}
      >
        {/* 1. Total Assets */}
        <div>
          <span style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
            {isRu ? '1. Активы (Итого)' : '1. Jami Aktivlar'}
          </span>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: '#10b981', marginTop: '4px' }}>
            {formatCurrency(metrics.totalAssets, locale, 'UZS')}
          </div>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {isRu ? 'Касса, банк, склад, дебиторы' : 'Kassa, bank, tovar, debitorlar'}
          </span>
        </div>

        {/* 2. Total Liabilities */}
        <div>
          <span style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
            {isRu ? '2. Обязательства' : '2. Jami Majburiyatlar'}
          </span>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: '#ef4444', marginTop: '4px' }}>
            {formatCurrency(metrics.totalLiabilities, locale, 'UZS')}
          </div>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {isRu ? 'Поставщики, авансы, долги' : 'Ta’minotchilar, olingan avanslar'}
          </span>
        </div>

        {/* 3. Equity */}
        <div>
          <span style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
            {isRu ? '3. Капитал (Введено)' : '3. Boshlang‘ich Kapital'}
          </span>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: '#3b82f6', marginTop: '4px' }}>
            {formatCurrency(metrics.enteredEquity, locale, 'UZS')}
          </div>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
            {isRu ? `Расчетный: ${formatCurrency(metrics.suggestedEquity, locale, 'UZS')}` : `Kutilayotgan: ${formatCurrency(metrics.suggestedEquity, locale, 'UZS')}`}
          </span>
        </div>

        {/* 4. Balance Difference */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <span style={{ fontSize: 'var(--text-xs)', textTransform: 'uppercase', color: 'var(--color-text-muted)', fontWeight: 600 }}>
            {isRu ? 'Балансовая разница' : 'Balans farqi (A - M - K)'}
          </span>
          <div
            style={{
              fontSize: 'var(--text-xl)',
              fontWeight: 800,
              color: metrics.isBalanced ? '#10b981' : '#f59e0b',
              marginTop: '4px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {metrics.isBalanced ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
            {formatCurrency(metrics.balanceDifference, locale, 'UZS')}
          </div>

          {!metrics.isBalanced && !isReadOnly && (
            <button
              onClick={handleBalanceWithEquity}
              style={{
                marginTop: '6px',
                padding: '4px 8px',
                fontSize: 'var(--text-xs)',
                fontWeight: 600,
                color: '#ffffff',
                backgroundColor: '#3b82f6',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                width: 'fit-content',
              }}
            >
              <Sparkles size={12} />
              {isRu ? 'Сбалансировать капиталом' : 'Kapital bilan tenglashtirish'}
            </button>
          )}
        </div>
      </div>

      {/* ─── Navigation Tabs ──────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          borderBottom: '1px solid var(--color-border)',
          paddingBottom: '2px',
          overflowX: 'auto',
        }}
      >
        {[
          { key: 'overview', label: isRu ? 'Обзор и баланс' : 'Umumiy balans', icon: Scale },
          { key: 'cash', label: isRu ? 'Денежные средства' : 'Pul mablag‘lari', icon: Wallet },
          { key: 'inventory', label: isRu ? 'Товары и материалы' : 'Tovar va materiallar', icon: Package },
          { key: 'customers', label: isRu ? 'Дебиторы (Клиенты)' : 'Mijozlar qarzi', icon: Users },
          { key: 'suppliers', label: isRu ? 'Кредиторы (Поставщики)' : 'Yetkazib beruvchilar', icon: Truck },
          { key: 'fixed-assets', label: isRu ? 'Основные средства' : 'Asosiy vositalar', icon: Building2 },
          { key: 'other', label: isRu ? 'Прочее и капитал' : 'Boshqa va Kapital', icon: Layers },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as TabKey)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                border: 'none',
                background: 'none',
                borderBottom: isActive ? '3px solid #3b82f6' : '3px solid transparent',
                color: isActive ? '#3b82f6' : 'var(--color-text-muted)',
                fontWeight: isActive ? 600 : 500,
                fontSize: 'var(--text-sm)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all var(--transition-fast)',
              }}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ─── Tab Content ─────────────────────────────────────────── */}

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 'var(--space-4)',
            }}
          >
            {[
              {
                title: isRu ? 'Касса и банк' : 'Kassa va bank qoldiqlari',
                amount: metrics.categoryBreakdown.CASH + metrics.categoryBreakdown.BANK,
                icon: Wallet,
                color: '#3b82f6',
                desc: isRu ? 'Наличные и расчетные счета' : 'Naqd pullar va bank hisobvaraqlari',
                actionTab: 'cash',
              },
              {
                title: isRu ? 'Складские запасы' : 'Ombor qoldiqlari',
                amount: metrics.categoryBreakdown.INVENTORY,
                icon: Package,
                color: '#10b981',
                desc: isRu ? 'Товары, материалы, готовая продукция' : 'Tovar, xomashyo va tayyor mahsulotlar',
                actionTab: 'inventory',
              },
              {
                title: isRu ? 'Долги клиентов (Дебиторка)' : 'Mijozlar qarzdorligi (Debitorlik)',
                amount: metrics.categoryBreakdown.CUSTOMER_DEBT,
                icon: Users,
                color: '#8b5cf6',
                desc: isRu ? 'Ожидаемые поступления от покупателей' : 'Xaridorlardan kutilayotgan tushumlar',
                actionTab: 'customers',
              },
              {
                title: isRu ? 'Долги поставщикам (Кредиторка)' : 'Yetkazib beruvchilarga qarzlar',
                amount: metrics.categoryBreakdown.SUPPLIER_DEBT,
                icon: Truck,
                color: '#ef4444',
                desc: isRu ? 'Задолженность перед контрагентами' : 'Ta’minotchilarga to‘lanishi kerak bo‘lgan qarz',
                actionTab: 'suppliers',
              },
              {
                title: isRu ? 'Основные средства' : 'Asosiy vositalar (Qoldiq qiymat)',
                amount: metrics.categoryBreakdown.FIXED_ASSET,
                icon: Building2,
                color: '#06b6d4',
                desc: isRu ? 'Станки, компьютеры, авто, здания' : 'Stanok, texnika, transport va binolar',
                actionTab: 'fixed-assets',
              },
              {
                title: isRu ? 'Начальный капитал' : 'Boshlang‘ich ustav kapitali',
                amount: metrics.categoryBreakdown.EQUITY,
                icon: Layers,
                color: '#f59e0b',
                desc: isRu ? 'Собственный капитал учредителей' : 'Ta’sischilarning boshlang‘ich kapitali',
                actionTab: 'other',
              },
            ].map((card, i) => {
              const Icon = card.icon;
              return (
                <div
                  key={i}
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--space-4)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600 }}>{card.title}</span>
                      <div
                        style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: 'var(--radius-md)',
                          backgroundColor: `${card.color}15`,
                          color: card.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Icon size={18} />
                      </div>
                    </div>
                    <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, marginTop: '8px' }}>
                      {formatCurrency(card.amount, locale, 'UZS')}
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                      {card.desc}
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab(card.actionTab as TabKey)}
                    style={{
                      marginTop: '16px',
                      background: 'none',
                      border: 'none',
                      color: card.color,
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: 0,
                    }}
                  >
                    {isRu ? 'Перейти к разделу' : 'Bo‘limga o‘tish'}
                    <ChevronRight size={14} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Notes Section */}
          <div
            style={{
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-4)',
            }}
          >
            <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '8px' }}>
              {isRu ? 'Примечания к документу:' : 'Hujjatga umumiy izoh:'}
            </label>
            <textarea
              value={notes}
              disabled={isReadOnly}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                isRu
                  ? 'Введите примечания, реквизиты инвентаризационной описи или основание ввода остатков...'
                  : 'Boshlang‘ich qoldiqlarni kiritish asosi, inventarizatsiya dalolatnomasi raqami va izohlarni kiriting...'
              }
              style={{
                width: '100%',
                minHeight: '80px',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                backgroundColor: isReadOnly ? 'var(--color-bg-muted)' : 'var(--color-bg)',
                fontSize: 'var(--text-sm)',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>
      )}

      {/* TAB 2: CASH & BANK */}
      {activeTab === 'cash' && (
        <CategoryTableSection
          title={isRu ? 'Денежные средства в кассе и банке' : 'Kassa va bankdagi pul mablag‘lari'}
          category="CASH"
          isReadOnly={isReadOnly}
          lines={lines}
          onAddLine={() => addLine('CASH')}
          onRemoveLine={removeLine}
          onUpdateField={updateLineField}
          locale={locale}
          isRu={isRu}
          accounts={accounts}
        />
      )}

      {/* TAB 3: INVENTORY */}
      {activeTab === 'inventory' && (
        <InventoryTableSection
          title={isRu ? 'Остатки товаров и материалов на складе' : 'Ombordagi tovar va materiallar qoldig‘i'}
          isReadOnly={isReadOnly}
          lines={lines}
          onAddLine={() => addLine('INVENTORY')}
          onRemoveLine={removeLine}
          onUpdateField={updateLineField}
          locale={locale}
          isRu={isRu}
          products={products}
          warehouses={warehouses}
        />
      )}

      {/* TAB 4: CUSTOMER DEBTS */}
      {activeTab === 'customers' && (
        <CounterpartyTableSection
          title={isRu ? 'Задолженность покупателей и авансы' : 'Xaridorlar qarzdorligi va olingan avanslar'}
          category="CUSTOMER_DEBT"
          isReadOnly={isReadOnly}
          lines={lines}
          onAddLine={() => addLine('CUSTOMER_DEBT')}
          onRemoveLine={removeLine}
          onUpdateField={updateLineField}
          locale={locale}
          isRu={isRu}
          counterparties={counterparties.filter((c) => c.type === 'CUSTOMER' || c.type === 'BOTH')}
        />
      )}

      {/* TAB 5: SUPPLIER DEBTS */}
      {activeTab === 'suppliers' && (
        <CounterpartyTableSection
          title={isRu ? 'Задолженность поставщикам и выданные авансы' : 'Yetkazib beruvchilarga qarzlar va berilgan avanslar'}
          category="SUPPLIER_DEBT"
          isReadOnly={isReadOnly}
          lines={lines}
          onAddLine={() => addLine('SUPPLIER_DEBT')}
          onRemoveLine={removeLine}
          onUpdateField={updateLineField}
          locale={locale}
          isRu={isRu}
          counterparties={counterparties.filter((c) => c.type === 'SUPPLIER' || c.type === 'BOTH')}
        />
      )}

      {/* TAB 6: FIXED ASSETS */}
      {activeTab === 'fixed-assets' && (
        <FixedAssetsTableSection
          title={isRu ? 'Основные средства (Оборудование, техника, транспорт)' : 'Asosiy vositalar (Stanok, uskunalar, transport)'}
          isReadOnly={isReadOnly}
          lines={lines}
          onAddLine={() => addLine('FIXED_ASSET')}
          onRemoveLine={removeLine}
          onUpdateField={updateLineField}
          locale={locale}
          isRu={isRu}
        />
      )}

      {/* TAB 7: OTHER & EQUITY */}
      {activeTab === 'other' && (
        <OtherItemsTableSection
          title={isRu ? 'Прочие активы, обязательства и начальный капитал' : 'Boshqa aktivlar, majburiyatlar va ustav kapitali'}
          isReadOnly={isReadOnly}
          lines={lines}
          onAddLine={() => addLine('EQUITY')}
          onRemoveLine={removeLine}
          onUpdateField={updateLineField}
          locale={locale}
          isRu={isRu}
        />
      )}

      {/* ─── Modal: New Document ─────────────────────────────────── */}
      <Modal
        isOpen={showNewDocModal}
        title={isRu ? 'Создать документ начальных остатков' : 'Yangi boshlang‘ich qoldiq hujjati'}
        onClose={() => setShowNewDocModal(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-2)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '6px' }}>
              {isRu ? 'Дата среза остатков' : 'Boshlang‘ich qoldiq sanasi'}
            </label>
            <input
              type="date"
              value={newDocDate}
              onChange={(e) => setNewDocDate(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg)',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '6px' }}>
              {isRu ? 'Номер документа (автоматически при пустом)' : 'Hujjat raqami (avtomatik)'}
            </label>
            <input
              type="text"
              placeholder="Masalan: OB-2026-0001"
              value={newDocNumber}
              onChange={(e) => setNewDocNumber(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg)',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '6px' }}>
              {isRu ? 'Примечание' : 'Izoh'}
            </label>
            <textarea
              value={newDocNotes}
              onChange={(e) => setNewDocNotes(e.target.value)}
              placeholder={isRu ? 'Основание ввода остатков...' : 'Kiritish asosi...'}
              style={{
                width: '100%',
                minHeight: '60px',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg)',
              }}
            />
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

      {/* ─── Modal: Excel Import ─────────────────────────────────── */}
      <Modal
        isOpen={showImportModal}
        title={isRu ? 'Импорт начальных остатков из Excel' : 'Boshlang‘ich qoldiqlarni Exceldan yuklash'}
        onClose={() => setShowImportModal(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-2)' }}>
          <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            {isRu
              ? 'Заполните скачанный шаблон Excel со всеми вкладками (Деньги, Склад, Клиенты, Поставщики) и загрузите файл сюда.'
              : 'Standart Excel shablonini to‘ldiring (Pul, Tovar, Mijozlar, Yetkazib beruvchilar varaqlari bilan) va bu yerga yuklang.'}
          </p>

          <div
            style={{
              border: '2px dashed var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: 'var(--space-6)',
              textAlign: 'center',
              backgroundColor: 'rgba(59, 130, 246, 0.03)',
            }}
          >
            <FileSpreadsheet size={36} color="#3b82f6" style={{ margin: '0 auto 8px' }} />
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
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3)',
                maxHeight: '180px',
                overflowY: 'auto',
              }}
            >
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: '#b91c1c', display: 'block', marginBottom: '4px' }}>
                {isRu ? 'Ошибки в файле Excel:' : 'Excel fayldagi xatoliklar:'}
              </span>
              <ul style={{ margin: 0, paddingLeft: '18px', fontSize: 'var(--text-xs)', color: '#b91c1c' }}>
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
              {importing ? (isRu ? 'Проверка и загрузка...' : 'Tekshirilmoqda...') : isRu ? 'Загрузить и применить' : 'Yuklash va saqlash'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* ─── Modal: Unpost Confirmation (Rollback Invariant) ──────── */}
      <Modal
        isOpen={showUnpostModal}
        title={isRu ? 'Внимание! Переоткрытие остатков' : 'Diqqat! Qoldiq hujjatini qayta ochish'}
        onClose={() => setShowUnpostModal(false)}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', padding: 'var(--space-2)' }}>
          <div
            style={{
              backgroundColor: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 'var(--radius-md)',
              padding: '12px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
            }}
          >
            <ShieldAlert size={24} color="#d97706" style={{ flexShrink: 0, marginTop: '2px' }} />
            <div style={{ fontSize: 'var(--text-sm)', color: '#92400e' }}>
              <strong>{isRu ? 'Правило защиты от отката (Rollback Invariant):' : 'Qayta ochish xavfsizlik qoidasi:'}</strong>
              <p style={{ margin: '4px 0 0' }}>
                {isRu
                  ? 'Если товары из начальных партий уже были проданы через счета-фактуры или денежные средства списаны, система заблокирует переоткрытие для защиты целостности данных.'
                  : 'Agar boshlang‘ich partiyadagi tovarlar allaqachon sotuv orqali kamaygan bo‘lsa yoki kassadagi pul sarflangan bo‘lsa, ombor va moliya buzilishining oldini olish uchun tizim qayta ochishni taqiqlaydi.'}
              </p>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 600, marginBottom: '6px' }}>
              {isRu ? 'Причина переоткрытия (для аудита):' : 'Qayta ochish sababi (audit uchun):'}
            </label>
            <textarea
              value={unpostReason}
              onChange={(e) => setUnpostReason(e.target.value)}
              placeholder={isRu ? 'Укажите причину отката остатков...' : 'Qoldiqni qayta tahrirlash sababini yozing...'}
              style={{
                width: '100%',
                minHeight: '70px',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border)',
                backgroundColor: 'var(--color-bg)',
                fontSize: 'var(--text-sm)',
              }}
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
              style={{ backgroundColor: '#ef4444', borderColor: '#ef4444' }}
            >
              {actionLoading ? (isRu ? 'Проверка инвариантов...' : 'Tekshirilmoqda...') : isRu ? 'Подтвердить переоткрытие' : 'Qayta ochishni tasdiqlash'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─── Sub-Component: Cash & Bank Table ─────────────────────────────

function CategoryTableSection({
  title,
  category,
  isReadOnly,
  lines,
  onAddLine,
  onRemoveLine,
  onUpdateField,
  locale,
  isRu,
  accounts,
}: any) {
  const filteredIndices = lines
    .map((l: any, i: number) => (l.category === category || l.category === 'BANK' ? i : -1))
    .filter((i: number) => i !== -1);

  return (
    <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600 }}>{title}</h3>
        {!isReadOnly && (
          <Button variant="secondary" onClick={onAddLine} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} />
            {isRu ? 'Добавить счет / кассу' : 'Kassa / hisob qo‘shish'}
          </Button>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-muted)' }}>
              <th style={{ padding: '10px' }}>#</th>
              <th style={{ padding: '10px' }}>{isRu ? 'Касса / Счет' : 'Kassa / Hisobraqam'}</th>
              <th style={{ padding: '10px' }}>{isRu ? 'Валюта' : 'Valyuta'}</th>
              <th style={{ padding: '10px' }}>{isRu ? 'Начальный остаток' : 'Boshlang‘ich qoldiq'}</th>
              <th style={{ padding: '10px' }}>{isRu ? 'Примечание' : 'Izoh'}</th>
              {!isReadOnly && <th style={{ padding: '10px', textAlign: 'center' }}></th>}
            </tr>
          </thead>
          <tbody>
            {filteredIndices.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  {isRu ? 'Нет добавленных счетов' : 'Kassa yoki hisoblar qo‘shilmagan'}
                </td>
              </tr>
            ) : (
              filteredIndices.map((idx: number, pos: number) => {
                const line = lines[idx];
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: '10px', color: 'var(--color-text-muted)' }}>{pos + 1}</td>
                    <td style={{ padding: '10px' }}>
                      <select
                        value={line.accountId || ''}
                        disabled={isReadOnly}
                        onChange={(e) => {
                          const acc = accounts.find((a: any) => a.id === e.target.value);
                          onUpdateField(idx, 'accountId', e.target.value);
                          if (acc) {
                            onUpdateField(idx, 'currency', acc.currency || 'UZS');
                            onUpdateField(idx, 'category', acc.accountType === 'BANK' ? 'BANK' : 'CASH');
                          }
                        }}
                        style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', width: '100%', maxWidth: '240px' }}
                      >
                        <option value="">{isRu ? 'Выберите кассу/банк' : 'Kassa yoki bankni tanlang'}</option>
                        {accounts.map((acc: any) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name?.[locale] || acc.name?.uz || acc.name?.ru || 'Kassa'} ({acc.currency})
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <span style={{ fontWeight: 600 }}>{line.currency || 'UZS'}</span>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={line.amount || ''}
                        disabled={isReadOnly}
                        onChange={(e) => onUpdateField(idx, 'amount', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', width: '160px', fontWeight: 600 }}
                      />
                    </td>
                    <td style={{ padding: '10px' }}>
                      <input
                        type="text"
                        value={line.notes || ''}
                        disabled={isReadOnly}
                        onChange={(e) => onUpdateField(idx, 'notes', e.target.value)}
                        placeholder={isRu ? 'Примечание...' : 'Izoh...'}
                        style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', width: '100%' }}
                      />
                    </td>
                    {!isReadOnly && (
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <button
                          onClick={() => onRemoveLine(idx)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
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
      </div>
    </div>
  );
}

// ─── Sub-Component: Inventory Table ───────────────────────────────

function InventoryTableSection({
  title,
  isReadOnly,
  lines,
  onAddLine,
  onRemoveLine,
  onUpdateField,
  locale,
  isRu,
  products,
  warehouses,
}: any) {
  const filteredIndices = lines
    .map((l: any, i: number) => (l.category === 'INVENTORY' ? i : -1))
    .filter((i: number) => i !== -1);

  return (
    <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600 }}>{title}</h3>
        {!isReadOnly && (
          <Button variant="secondary" onClick={onAddLine} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} />
            {isRu ? 'Добавить товар' : 'Tovar qo‘shish'}
          </Button>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-muted)' }}>
              <th style={{ padding: '10px' }}>#</th>
              <th style={{ padding: '10px' }}>{isRu ? 'Товар (SKU)' : 'Tovar (SKU)'}</th>
              <th style={{ padding: '10px' }}>{isRu ? 'Склад' : 'Ombor'}</th>
              <th style={{ padding: '10px' }}>{isRu ? 'Количество' : 'Miqdor'}</th>
              <th style={{ padding: '10px' }}>{isRu ? 'Себестоимость' : 'Birlik tannarxi'}</th>
              <th style={{ padding: '10px' }}>{isRu ? 'Сумма' : 'Umumiy summa'}</th>
              <th style={{ padding: '10px' }}>{isRu ? 'Партия' : 'Partiya raqami'}</th>
              {!isReadOnly && <th style={{ padding: '10px', textAlign: 'center' }}></th>}
            </tr>
          </thead>
          <tbody>
            {filteredIndices.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  {isRu ? 'Товары не добавлены' : 'Tovarlar qo‘shilmagan'}
                </td>
              </tr>
            ) : (
              filteredIndices.map((idx: number, pos: number) => {
                const line = lines[idx];
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: '10px', color: 'var(--color-text-muted)' }}>{pos + 1}</td>
                    <td style={{ padding: '10px' }}>
                      <select
                        value={line.productId || ''}
                        disabled={isReadOnly}
                        onChange={(e) => onUpdateField(idx, 'productId', e.target.value)}
                        style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', width: '220px' }}
                      >
                        <option value="">{isRu ? 'Выберите товар' : 'Tovarni tanlang'}</option>
                        {products.map((p: any) => (
                          <option key={p.id} value={p.id}>
                            {p.sku} — {p.name?.[locale] || p.name?.uz || p.name?.ru || 'Tovar'}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <select
                        value={line.warehouseId || ''}
                        disabled={isReadOnly}
                        onChange={(e) => onUpdateField(idx, 'warehouseId', e.target.value)}
                        style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', width: '160px' }}
                      >
                        <option value="">{isRu ? 'Выберите склад' : 'Omborni tanlang'}</option>
                        {warehouses.map((w: any) => (
                          <option key={w.id} value={w.id}>
                            {w.name?.[locale] || w.name?.uz || w.name?.ru || 'Ombor'}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={line.quantity || ''}
                        disabled={isReadOnly}
                        onChange={(e) => onUpdateField(idx, 'quantity', parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', width: '90px' }}
                      />
                    </td>
                    <td style={{ padding: '10px' }}>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={line.unitCost || ''}
                        disabled={isReadOnly}
                        onChange={(e) => onUpdateField(idx, 'unitCost', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', width: '120px' }}
                      />
                    </td>
                    <td style={{ padding: '10px', fontWeight: 600, color: '#10b981' }}>
                      {formatCurrency(Number(line.amount || 0), locale, 'UZS')}
                    </td>
                    <td style={{ padding: '10px' }}>
                      <input
                        type="text"
                        value={line.batchNumber || ''}
                        disabled={isReadOnly}
                        onChange={(e) => onUpdateField(idx, 'batchNumber', e.target.value)}
                        placeholder="INIT-BATCH-01"
                        style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', width: '140px' }}
                      />
                    </td>
                    {!isReadOnly && (
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <button
                          onClick={() => onRemoveLine(idx)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
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
      </div>
    </div>
  );
}

// ─── Sub-Component: Counterparty (Customers / Suppliers) Table ────

function CounterpartyTableSection({
  title,
  category,
  isReadOnly,
  lines,
  onAddLine,
  onRemoveLine,
  onUpdateField,
  locale,
  isRu,
  counterparties,
}: any) {
  const isCustomer = category === 'CUSTOMER_DEBT';
  const filteredIndices = lines
    .map((l: any, i: number) =>
      isCustomer
        ? l.category === 'CUSTOMER_DEBT' || l.category === 'CUSTOMER_ADVANCE'
          ? i
          : -1
        : l.category === 'SUPPLIER_DEBT' || l.category === 'SUPPLIER_ADVANCE'
        ? i
        : -1,
    )
    .filter((i: number) => i !== -1);

  return (
    <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600 }}>{title}</h3>
        {!isReadOnly && (
          <Button variant="secondary" onClick={onAddLine} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} />
            {isRu ? 'Добавить контрагента' : 'Kontragent qo‘shish'}
          </Button>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-muted)' }}>
              <th style={{ padding: '10px' }}>#</th>
              <th style={{ padding: '10px' }}>{isRu ? 'Контрагент' : 'Kontragent'}</th>
              <th style={{ padding: '10px' }}>{isRu ? 'Тип остатка' : 'Qoldiq turi'}</th>
              <th style={{ padding: '10px' }}>{isRu ? 'Договор' : 'Shartnoma'}</th>
              <th style={{ padding: '10px' }}>{isRu ? 'Сумма долга' : 'Qarzdorlik summasi'}</th>
              <th style={{ padding: '10px' }}>{isRu ? 'Примечание' : 'Izoh'}</th>
              {!isReadOnly && <th style={{ padding: '10px', textAlign: 'center' }}></th>}
            </tr>
          </thead>
          <tbody>
            {filteredIndices.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  {isRu ? 'Контрагенты не добавлены' : 'Kontragentlar qo‘shilmagan'}
                </td>
              </tr>
            ) : (
              filteredIndices.map((idx: number, pos: number) => {
                const line = lines[idx];
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: '10px', color: 'var(--color-text-muted)' }}>{pos + 1}</td>
                    <td style={{ padding: '10px' }}>
                      <select
                        value={line.counterpartyId || ''}
                        disabled={isReadOnly}
                        onChange={(e) => onUpdateField(idx, 'counterpartyId', e.target.value)}
                        style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', width: '220px' }}
                      >
                        <option value="">{isRu ? 'Выберите контрагента' : 'Kontragentni tanlang'}</option>
                        {counterparties.map((c: any) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.inn ? `(INN: ${c.inn})` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <select
                        value={line.category}
                        disabled={isReadOnly}
                        onChange={(e) => onUpdateField(idx, 'category', e.target.value)}
                        style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', width: '160px' }}
                      >
                        {isCustomer ? (
                          <>
                            <option value="CUSTOMER_DEBT">{isRu ? 'Долг покупателя' : 'Mijoz qarzi (debitor)'}</option>
                            <option value="CUSTOMER_ADVANCE">{isRu ? 'Аванс от клиента' : 'Mijoz avansi'}</option>
                          </>
                        ) : (
                          <>
                            <option value="SUPPLIER_DEBT">{isRu ? 'Долг поставщику' : 'Yetkazib beruvchiga qarz'}</option>
                            <option value="SUPPLIER_ADVANCE">{isRu ? 'Аванс поставщику' : 'Yetkazib beruvchiga avans'}</option>
                          </>
                        )}
                      </select>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <input
                        type="text"
                        value={line.contractNumber || ''}
                        disabled={isReadOnly}
                        onChange={(e) => onUpdateField(idx, 'contractNumber', e.target.value)}
                        placeholder="SH-2026-01"
                        style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', width: '130px' }}
                      />
                    </td>
                    <td style={{ padding: '10px' }}>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={line.amount || ''}
                        disabled={isReadOnly}
                        onChange={(e) => onUpdateField(idx, 'amount', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', width: '150px', fontWeight: 600 }}
                      />
                    </td>
                    <td style={{ padding: '10px' }}>
                      <input
                        type="text"
                        value={line.notes || ''}
                        disabled={isReadOnly}
                        onChange={(e) => onUpdateField(idx, 'notes', e.target.value)}
                        placeholder={isRu ? 'Примечание...' : 'Izoh...'}
                        style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', width: '100%' }}
                      />
                    </td>
                    {!isReadOnly && (
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <button
                          onClick={() => onRemoveLine(idx)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
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
      </div>
    </div>
  );
}

// ─── Sub-Component: Fixed Assets Table ────────────────────────────

function FixedAssetsTableSection({
  title,
  isReadOnly,
  lines,
  onAddLine,
  onRemoveLine,
  onUpdateField,
  locale,
  isRu,
}: any) {
  const filteredIndices = lines
    .map((l: any, i: number) => (l.category === 'FIXED_ASSET' ? i : -1))
    .filter((i: number) => i !== -1);

  return (
    <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600 }}>{title}</h3>
        {!isReadOnly && (
          <Button variant="secondary" onClick={onAddLine} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} />
            {isRu ? 'Добавить ОС' : 'Asosiy vosita qo‘shish'}
          </Button>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-muted)' }}>
              <th style={{ padding: '10px' }}>#</th>
              <th style={{ padding: '10px' }}>{isRu ? 'Наименование' : 'Nomi'}</th>
              <th style={{ padding: '10px' }}>{isRu ? 'Инв. номер' : 'Inventar raqami'}</th>
              <th style={{ padding: '10px' }}>{isRu ? 'Первоначальная стоимость' : 'Boshlang‘ich qiymati'}</th>
              <th style={{ padding: '10px' }}>{isRu ? 'Накопленная амортизация' : 'Amortizatsiya'}</th>
              <th style={{ padding: '10px' }}>{isRu ? 'Остаточная стоимость' : 'Qoldiq qiymat'}</th>
              {!isReadOnly && <th style={{ padding: '10px', textAlign: 'center' }}></th>}
            </tr>
          </thead>
          <tbody>
            {filteredIndices.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  {isRu ? 'Основные средства не добавлены' : 'Asosiy vositalar kiritilmagan'}
                </td>
              </tr>
            ) : (
              filteredIndices.map((idx: number, pos: number) => {
                const line = lines[idx];
                const netBookValue = Math.max(0, Number(line.amount || 0) - Number(line.accumulatedDepreciation || 0));
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: '10px', color: 'var(--color-text-muted)' }}>{pos + 1}</td>
                    <td style={{ padding: '10px' }}>
                      <input
                        type="text"
                        value={line.notes || ''}
                        disabled={isReadOnly}
                        onChange={(e) => onUpdateField(idx, 'notes', e.target.value)}
                        placeholder={isRu ? 'Станок / Автомобиль / Сервер' : 'Stanok / Mashina / Texnika'}
                        style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', width: '220px' }}
                      />
                    </td>
                    <td style={{ padding: '10px' }}>
                      <input
                        type="text"
                        value={line.contractNumber || ''}
                        disabled={isReadOnly}
                        onChange={(e) => onUpdateField(idx, 'contractNumber', e.target.value)}
                        placeholder="INV-0012"
                        style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', width: '130px' }}
                      />
                    </td>
                    <td style={{ padding: '10px' }}>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={line.amount || ''}
                        disabled={isReadOnly}
                        onChange={(e) => onUpdateField(idx, 'amount', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', width: '150px', fontWeight: 600 }}
                      />
                    </td>
                    <td style={{ padding: '10px' }}>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={line.accumulatedDepreciation || ''}
                        disabled={isReadOnly}
                        onChange={(e) => onUpdateField(idx, 'accumulatedDepreciation', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', width: '150px' }}
                      />
                    </td>
                    <td style={{ padding: '10px', fontWeight: 700, color: '#06b6d4' }}>
                      {formatCurrency(netBookValue, locale, 'UZS')}
                    </td>
                    {!isReadOnly && (
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <button
                          onClick={() => onRemoveLine(idx)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
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
      </div>
    </div>
  );
}

// ─── Sub-Component: Other Items & Equity Table ────────────────────

function OtherItemsTableSection({
  title,
  isReadOnly,
  lines,
  onAddLine,
  onRemoveLine,
  onUpdateField,
  locale,
  isRu,
}: any) {
  const filteredIndices = lines
    .map((l: any, i: number) =>
      l.category === 'EQUITY' || l.category === 'OTHER_ASSET' || l.category === 'OTHER_LIABILITY' ? i : -1,
    )
    .filter((i: number) => i !== -1);

  return (
    <div style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 600 }}>{title}</h3>
        {!isReadOnly && (
          <Button variant="secondary" onClick={onAddLine} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={16} />
            {isRu ? 'Добавить статью' : 'Qator qo‘shish'}
          </Button>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-sm)' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left', color: 'var(--color-text-muted)' }}>
              <th style={{ padding: '10px' }}>#</th>
              <th style={{ padding: '10px' }}>{isRu ? 'Категория статьи' : 'Modda toifasi'}</th>
              <th style={{ padding: '10px' }}>{isRu ? 'Наименование' : 'Nomi'}</th>
              <th style={{ padding: '10px' }}>{isRu ? 'Сумма' : 'Summasi'}</th>
              {!isReadOnly && <th style={{ padding: '10px', textAlign: 'center' }}></th>}
            </tr>
          </thead>
          <tbody>
            {filteredIndices.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ padding: '24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
                  {isRu ? 'Статьи капитала или прочего не добавлены' : 'Kapital yoki boshqa moddalar kiritilmagan'}
                </td>
              </tr>
            ) : (
              filteredIndices.map((idx: number, pos: number) => {
                const line = lines[idx];
                return (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                    <td style={{ padding: '10px', color: 'var(--color-text-muted)' }}>{pos + 1}</td>
                    <td style={{ padding: '10px' }}>
                      <select
                        value={line.category}
                        disabled={isReadOnly}
                        onChange={(e) => onUpdateField(idx, 'category', e.target.value)}
                        style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', width: '220px' }}
                      >
                        <option value="EQUITY">{isRu ? 'Капитал (Уставный / Прибыль)' : 'Boshlang‘ich Kapital'}</option>
                        <option value="OTHER_ASSET">{isRu ? 'Прочий актив (Переплата налога и т.д.)' : 'Boshqa aktiv (Soliq ortiqcha to‘lovi)'}</option>
                        <option value="OTHER_LIABILITY">{isRu ? 'Прочее обязательство (Зарплата, налоги)' : 'Boshqa majburiyat (Ish haqi, soliq)'}</option>
                      </select>
                    </td>
                    <td style={{ padding: '10px' }}>
                      <input
                        type="text"
                        value={line.notes || ''}
                        disabled={isReadOnly}
                        onChange={(e) => onUpdateField(idx, 'notes', e.target.value)}
                        placeholder={isRu ? 'Уставный капитал...' : 'Boshlang‘ich ustav kapitali...'}
                        style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', width: '100%' }}
                      />
                    </td>
                    <td style={{ padding: '10px' }}>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={line.amount || ''}
                        disabled={isReadOnly}
                        onChange={(e) => onUpdateField(idx, 'amount', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        style={{ padding: '6px 10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', width: '170px', fontWeight: 700 }}
                      />
                    </td>
                    {!isReadOnly && (
                      <td style={{ padding: '10px', textAlign: 'center' }}>
                        <button
                          onClick={() => onRemoveLine(idx)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
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
      </div>
    </div>
  );
}
