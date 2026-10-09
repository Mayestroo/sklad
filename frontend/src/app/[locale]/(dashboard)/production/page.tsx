'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale } from 'next-intl';
import {
  CheckCircle2,
  Clock3,
  Factory,
  FileText,
  Layers3,
  Plus,
  Save,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Select, SelectOption } from '@/components/ui/Select';

type ProductionStatus = 'DRAFT' | 'PLANNED' | 'IN_PROGRESS' | 'READY' | 'COMPLETED' | 'CANCELLED';
type ProductOption = { id: string; name: unknown; type: string; unitOfMeasure: string };
type RecipeMaterial = { id?: string; productId: string; quantity: number | string; product?: ProductOption };
type Recipe = {
  id: string;
  productId: string;
  outputQuantity: number | string;
  note?: string | null;
  product: ProductOption;
  items: RecipeMaterial[];
};
type ProductionMaterial = {
  id: string;
  productId: string;
  plannedQuantity: number | string;
  actualQuantity: number | string | null;
  unitCost: number | string;
  totalCost: number | string;
  product: ProductOption;
};
type ProductionDocument = {
  id: string;
  docNumber: string;
  docDate: string;
  status: ProductionStatus;
  plannedQuantity: number | string;
  producedQuantity: number | string | null;
  plannedMaterialCost: number | string;
  actualMaterialCost: number | string;
  unitCost: number | string;
  product: ProductOption;
  warehouse: { id: string; name: unknown };
  responsible?: { id: string; firstName: string; lastName: string } | null;
  materials: ProductionMaterial[];
  note?: string | null;
};
type WarehouseOption = { id: string; name: unknown };
type StaffOption = { id: string; firstName: string; lastName: string };
type PreviewMaterial = {
  productId: string;
  plannedQuantity: number;
  physicalQuantity: number;
  freeQuantity: number;
  shortage: number;
  estimatedUnitCost: number;
  estimatedTotalCost: number;
  product: ProductOption;
};
type ProductionPreview = {
  plannedMaterialCost: number;
  materials: PreviewMaterial[];
};

const statusLabels: Record<ProductionStatus, { uz: string; ru: string; variant: 'neutral' | 'info' | 'warning' | 'success' | 'error' }> = {
  DRAFT: { uz: 'Qoralama', ru: 'Черновик', variant: 'neutral' },
  PLANNED: { uz: 'Rejalashtirilgan', ru: 'Запланировано', variant: 'info' },
  IN_PROGRESS: { uz: 'Ishlab chiqarishda', ru: 'В производстве', variant: 'warning' },
  READY: { uz: 'Tayyor', ru: 'Готово', variant: 'success' },
  COMPLETED: { uz: 'Yakunlangan', ru: 'Завершено', variant: 'success' },
  CANCELLED: { uz: 'Bekor qilingan', ru: 'Отменено', variant: 'error' },
};

const asList = <T,>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : []);
const asNumber = (value: number | string | null | undefined): number => Number(value ?? 0);

export default function ProductionPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company, user, hasPermission } = useAuth();
  const canCreate = hasPermission('inventory:create');
  const canEdit = hasPermission('inventory:edit');
  const canViewStaff = Boolean(user?.roles.some((role) => ['super_admin', 'company_admin'].includes(role)) || user?.permissions.includes('users:view'));

  const [activeTab, setActiveTab] = useState<'documents' | 'recipes'>('documents');
  const [documents, setDocuments] = useState<ProductionDocument[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [rawMaterials, setRawMaterials] = useState<ProductOption[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [responsibleFilter, setResponsibleFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [recipeModalOpen, setRecipeModalOpen] = useState(false);
  const [recipeProductId, setRecipeProductId] = useState('');
  const [recipeOutputQty, setRecipeOutputQty] = useState('1');
  const [recipeNote, setRecipeNote] = useState('');
  const [recipeMaterials, setRecipeMaterials] = useState<Array<{ productId: string; quantity: string }>>([
    { productId: '', quantity: '' },
  ]);

  const [documentModalOpen, setDocumentModalOpen] = useState(false);
  const [documentRecipeId, setDocumentRecipeId] = useState('');
  const [documentQuantity, setDocumentQuantity] = useState('');
  const [documentWarehouseId, setDocumentWarehouseId] = useState('');
  const [documentResponsibleId, setDocumentResponsibleId] = useState('');
  const [documentNote, setDocumentNote] = useState('');
  const [preview, setPreview] = useState<ProductionPreview | null>(null);
  const [previewError, setPreviewError] = useState('');

  const [selectedDocument, setSelectedDocument] = useState<ProductionDocument | null>(null);
  const [actualInputs, setActualInputs] = useState<Record<string, string>>({});
  const [producedQuantity, setProducedQuantity] = useState('');

  const productOptions = useMemo<SelectOption[]>(() => products.map((item) => ({
    value: item.id,
    label: localName(item.name, locale),
  })), [products, locale]);
  const rawMaterialOptions = useMemo<SelectOption[]>(() => rawMaterials.map((item) => ({
    value: item.id,
    label: localName(item.name, locale),
    description: item.unitOfMeasure,
  })), [rawMaterials, locale]);
  const warehouseOptions = useMemo<SelectOption[]>(() => warehouses.map((item) => ({
    value: item.id,
    label: localName(item.name, locale),
  })), [warehouses, locale]);
  const staffOptions = useMemo<SelectOption[]>(() => staff.map((item) => ({
    value: item.id,
    label: `${item.firstName} ${item.lastName}`,
  })), [staff]);
  const recipeOptions = useMemo<SelectOption[]>(() => recipes.map((recipe) => ({
    value: recipe.id,
    label: `${localName(recipe.product.name, locale)} · ${formatQuantity(asNumber(recipe.outputQuantity), locale)} ${recipe.product.unitOfMeasure}`,
  })), [recipes, locale]);

  const loadData = useCallback(async (showLoading = true) => {
    if (!token || !company) {
      setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    setPageError('');
    try {
      const query = new URLSearchParams();
      if (search.trim()) query.set('search', search.trim());
      if (statusFilter) query.set('status', statusFilter);
      if (productFilter) query.set('productId', productFilter);
      if (warehouseFilter) query.set('warehouseId', warehouseFilter);
      if (responsibleFilter) query.set('responsibleId', responsibleFilter);
      if (dateFrom) query.set('dateFrom', dateFrom);
      if (dateTo) query.set('dateTo', dateTo);
      const suffix = query.size ? `?${query.toString()}` : '';
      const [documentData, recipeData, productData, rawData, warehouseData] = await Promise.all([
        apiFetch<ProductionDocument[]>(`/production/documents${suffix}`, { token, tenantId: company.id, locale }),
        apiFetch<Recipe[]>('/production/recipes', { token, tenantId: company.id, locale }),
        apiFetch<ProductOption[]>('/inventory/products?type=PRODUCT', { token, tenantId: company.id, locale }),
        apiFetch<ProductOption[]>('/inventory/products?type=RAW_MATERIAL', { token, tenantId: company.id, locale }),
        apiFetch<WarehouseOption[]>('/tenants/warehouses', { token, tenantId: company.id, locale }),
      ]);
      setDocuments(asList<ProductionDocument>(documentData));
      setRecipes(asList<Recipe>(recipeData));
      setProducts(asList<ProductOption>(productData));
      setRawMaterials(asList<ProductOption>(rawData));
      setWarehouses(asList<WarehouseOption>(warehouseData));
      if (canViewStaff) {
        const staffData = await apiFetch<StaffOption[]>('/users/staff', { token, tenantId: company.id, locale });
        setStaff(asList<StaffOption>(staffData));
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : (isRu ? 'Не удалось загрузить производство' : 'Ishlab chiqarish ma’lumotlarini yuklab bo‘lmadi'));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [token, company, locale, search, statusFilter, productFilter, warehouseFilter, responsibleFilter, dateFrom, dateTo, canViewStaff, isRu]);

  useEffect(() => {
    // loadData synchronizes this client page with its authenticated API resources.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!documentModalOpen || !token || !company || !documentRecipeId || !documentWarehouseId || Number(documentQuantity) <= 0) {
      return;
    }
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams({ quantity: documentQuantity, warehouseId: documentWarehouseId });
      apiFetch<ProductionPreview>(`/production/recipes/${documentRecipeId}/preview?${query.toString()}`, {
        token,
        tenantId: company.id,
        locale,
      })
        .then((result) => {
          setPreview(result);
          setPreviewError('');
        })
        .catch((error: unknown) => {
          setPreview(null);
          setPreviewError(error instanceof Error ? error.message : 'Preview failed');
        });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [documentModalOpen, documentRecipeId, documentWarehouseId, documentQuantity, token, company, locale]);

  const activeCount = documents.filter((document) => document.status === 'IN_PROGRESS').length;
  const completedCount = documents.filter((document) => document.status === 'COMPLETED').length;
  const totalCompletedCost = documents
    .filter((document) => document.status === 'COMPLETED')
    .reduce((sum, document) => sum + asNumber(document.actualMaterialCost), 0);

  function resetRecipeForm() {
    setRecipeProductId('');
    setRecipeOutputQty('1');
    setRecipeNote('');
    setRecipeMaterials([{ productId: '', quantity: '' }]);
  }

  function openDocumentModal() {
    setDocumentRecipeId('');
    setDocumentQuantity('');
    setDocumentWarehouseId(warehouses[0]?.id ?? '');
    setDocumentResponsibleId(staff.some((member) => member.id === user?.id) ? user?.id ?? '' : '');
    setDocumentNote('');
    setPreview(null);
    setDocumentModalOpen(true);
  }

  async function createRecipe(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !company) return;
    if (recipeMaterials.some((line) => !line.productId || line.quantity === '' || Number(line.quantity) <= 0)) {
      setPageError(isRu ? 'Заполните все сырьевые материалы и их количество' : 'Barcha xomashyo va sarf miqdorlarini to‘ldiring');
      return;
    }
    setBusy(true);
    setPageError('');
    try {
      await apiFetch('/production/recipes', {
        method: 'POST',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          productId: recipeProductId,
          outputQuantity: Number(recipeOutputQty),
          note: recipeNote || undefined,
          materials: recipeMaterials.map((line) => ({ productId: line.productId, quantity: Number(line.quantity) })),
        }),
      });
      setRecipeModalOpen(false);
      resetRecipeForm();
      setNotice(isRu ? 'Рецептура сохранена' : 'Retseptura saqlandi');
      await loadData(false);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Could not save recipe');
    } finally {
      setBusy(false);
    }
  }

  async function createDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !company) return;
    setBusy(true);
    setPageError('');
    try {
      const created = await apiFetch<ProductionDocument>('/production/documents', {
        method: 'POST',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          recipeId: documentRecipeId,
          plannedQuantity: Number(documentQuantity),
          warehouseId: documentWarehouseId,
          responsibleId: documentResponsibleId || undefined,
          note: documentNote || undefined,
        }),
      });
      setDocumentModalOpen(false);
      setNotice(isRu ? 'Черновик производственного документа создан' : 'Ishlab chiqarish hujjati qoralamasi yaratildi');
      await loadData(false);
      if (created?.id) await openDocument(created.id);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Could not create production document');
    } finally {
      setBusy(false);
    }
  }

  async function openDocument(id: string) {
    if (!token || !company) return;
    try {
      const document = await apiFetch<ProductionDocument>(`/production/documents/${id}`, { token, tenantId: company.id, locale });
      setSelectedDocument(document);
      setProducedQuantity(document.producedQuantity == null ? '' : String(document.producedQuantity));
      setActualInputs(Object.fromEntries(document.materials.map((line) => [
        line.productId,
        line.actualQuantity == null ? '' : String(line.actualQuantity),
      ])));
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Could not load production document');
    }
  }

  async function runDocumentAction(action: 'plan' | 'start' | 'ready' | 'complete' | 'cancel') {
    if (!token || !company || !selectedDocument) return;
    setBusy(true);
    setPageError('');
    try {
      let updated: ProductionDocument;
      if (action === 'ready') {
        updated = await apiFetch<ProductionDocument>(`/production/documents/${selectedDocument.id}/materials/actual`, {
          method: 'PUT',
          token,
          tenantId: company.id,
          locale,
          body: JSON.stringify({
            materials: selectedDocument.materials.map((line) => ({
              productId: line.productId,
              actualQuantity: Number(actualInputs[line.productId]),
            })),
          }),
        });
        setSelectedDocument(updated);
        updated = await apiFetch<ProductionDocument>(`/production/documents/${selectedDocument.id}/ready`, {
          method: 'POST', token, tenantId: company.id, locale,
        });
      } else if (action === 'complete') {
        updated = await apiFetch<ProductionDocument>(`/production/documents/${selectedDocument.id}/complete`, {
          method: 'POST',
          token,
          tenantId: company.id,
          locale,
          body: JSON.stringify({ producedQuantity: Number(producedQuantity) }),
        });
      } else {
        updated = await apiFetch<ProductionDocument>(`/production/documents/${selectedDocument.id}/${action}`, {
          method: 'POST', token, tenantId: company.id, locale,
        });
      }
      setSelectedDocument(updated);
      setNotice(actionNotice(action, isRu));
      await loadData(false);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'Production action failed');
    } finally {
      setBusy(false);
    }
  }

  const statusOptions: SelectOption[] = [
    { value: '', label: isRu ? 'Все статусы' : 'Barcha holatlar' },
    ...Object.entries(statusLabels).map(([value, label]) => ({ value, label: isRu ? label.ru : label.uz })),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, color: 'var(--color-text-primary)', fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)' }}>
            {isRu ? 'Производство' : 'Ishlab chiqarish'}
          </h1>
          <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-sm)', marginTop: 4 }}>
            {isRu ? 'Рецептуры, расход материалов и себестоимость выпуска' : 'Retseptura, xomashyo sarfi va tayyor mahsulot tannarxi'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {canCreate && activeTab === 'recipes' && (
            <Button onClick={() => { resetRecipeForm(); setRecipeModalOpen(true); }}>
              <Plus size={16} /> {isRu ? 'Новая рецептура' : 'Yangi retseptura'}
            </Button>
          )}
          {canCreate && activeTab === 'documents' && (
            <Button onClick={openDocumentModal} disabled={recipes.length === 0 || warehouses.length === 0}>
              <Plus size={16} /> {isRu ? 'Производственный документ' : 'Ishlab chiqarish hujjati'}
            </Button>
          )}
        </div>
      </div>

      {pageError && <div role="alert" style={alertStyle('error')}>{pageError}</div>}
      {notice && <div role="status" style={alertStyle('success')}>{notice}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 'var(--space-4)' }}>
        <Kpi icon={<Clock3 size={20} />} title={isRu ? 'В производстве' : 'Jarayonda'} value={`${activeCount}`} color="#d97706" />
        <Kpi icon={<CheckCircle2 size={20} />} title={isRu ? 'Завершено' : 'Yakunlangan'} value={`${completedCount}`} color="#059669" />
        <Kpi icon={<Factory size={20} />} title={isRu ? 'Себестоимость выпуска' : 'Ishlab chiqarish tannarxi'} value={formatCurrency(totalCompletedCost, locale, 'UZS')} color="var(--color-primary-600)" />
      </div>

      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--color-border-light)' }}>
        <TabButton active={activeTab === 'documents'} onClick={() => setActiveTab('documents')}>
          <FileText size={15} /> {isRu ? 'Документы' : 'Hujjatlar'}
        </TabButton>
        <TabButton active={activeTab === 'recipes'} onClick={() => setActiveTab('recipes')}>
          <Layers3 size={15} /> {isRu ? 'Рецептуры' : 'Retsepturalar'}
        </TabButton>
      </div>

      {activeTab === 'documents' ? (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end', borderBottom: '1px solid var(--color-border-light)' }}>
            <Input aria-label={isRu ? 'Поиск документов' : 'Hujjatlarni qidirish'} placeholder={isRu ? 'Номер документа...' : 'Hujjat raqami...'} value={search} onChange={(event) => setSearch(event.target.value)} style={{ width: 210 }} />
            <Select label={isRu ? 'Статус' : 'Holat'} options={statusOptions} value={statusFilter} onChange={setStatusFilter} style={{ minWidth: 170 }} />
            <Select label={isRu ? 'Продукт' : 'Mahsulot'} options={[{ value: '', label: isRu ? 'Все продукты' : 'Barcha mahsulotlar' }, ...productOptions]} value={productFilter} onChange={setProductFilter} style={{ minWidth: 190 }} />
            <Select label={isRu ? 'Склад' : 'Ombor'} options={[{ value: '', label: isRu ? 'Все склады' : 'Barcha omborlar' }, ...warehouseOptions]} value={warehouseFilter} onChange={setWarehouseFilter} style={{ minWidth: 170 }} />
            {canViewStaff && <Select label={isRu ? 'Ответственный' : 'Mas’ul'} options={[{ value: '', label: isRu ? 'Все сотрудники' : 'Barcha xodimlar' }, ...staffOptions]} value={responsibleFilter} onChange={setResponsibleFilter} style={{ minWidth: 180 }} />}
            <Input label={isRu ? 'С даты' : 'Boshlanish'} type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} style={{ width: 160 }} />
            <Input label={isRu ? 'По дату' : 'Tugash'} type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} style={{ width: 160 }} />
          </div>
          {loading ? <EmptyState text={isRu ? 'Загрузка...' : 'Yuklanmoqda...'} /> : documents.length === 0 ? (
            <EmptyState text={isRu ? 'Производственных документов пока нет' : 'Hozircha ishlab chiqarish hujjatlari yo‘q'} />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead><tr>
                  <th>{isRu ? 'Документ №' : 'Hujjat №'}</th>
                  <th>{isRu ? 'Дата' : 'Sana'}</th>
                  <th>{isRu ? 'Продукт' : 'Mahsulot'}</th>
                  <th>{isRu ? 'Количество' : 'Miqdor'}</th>
                  <th>{isRu ? 'Склад' : 'Ombor'}</th>
                  <th>{isRu ? 'Ответственный' : 'Mas’ul xodim'}</th>
                  <th>{isRu ? 'Себестоимость' : 'Tannarx'}</th>
                  <th>{isRu ? 'Статус' : 'Holat'}</th>
                  <th />
                </tr></thead>
                <tbody>
                  {documents.map((document) => (
                    <tr key={document.id}>
                      <td style={{ fontWeight: 600 }}>{document.docNumber}</td>
                      <td>{formatDate(document.docDate, locale)}</td>
                      <td>{localName(document.product.name, locale)}</td>
                      <td>{formatQuantity(asNumber(document.plannedQuantity), locale)} {document.product.unitOfMeasure}</td>
                      <td>{localName(document.warehouse.name, locale)}</td>
                      <td>{document.responsible ? `${document.responsible.firstName} ${document.responsible.lastName}` : '—'}</td>
                      <td>{formatCurrency(asNumber(['DRAFT', 'PLANNED'].includes(document.status) ? document.plannedMaterialCost : document.actualMaterialCost), locale, 'UZS')}</td>
                      <td><StatusBadge status={document.status} isRu={isRu} /></td>
                      <td style={{ textAlign: 'right' }}><Button size="sm" variant="secondary" onClick={() => void openDocument(document.id)}>{isRu ? 'Открыть' : 'Ochish'}</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? <EmptyState text={isRu ? 'Загрузка...' : 'Yuklanmoqda...'} /> : recipes.length === 0 ? (
            <EmptyState text={isRu ? 'Рецептуры еще не созданы' : 'Hali retsepturalar yaratilmagan'} />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={tableStyle}>
                <thead><tr>
                  <th>{isRu ? 'Готовый продукт' : 'Tayyor mahsulot'}</th>
                  <th>{isRu ? 'Норма выпуска' : 'Ishlab chiqarish normasi'}</th>
                  <th>{isRu ? 'Сырье' : 'Xomashyo'}</th>
                  <th>{isRu ? 'Состав' : 'Tarkibi'}</th>
                  <th>{isRu ? 'Комментарий' : 'Izoh'}</th>
                </tr></thead>
                <tbody>
                  {recipes.map((recipe) => (
                    <tr key={recipe.id}>
                      <td style={{ fontWeight: 600 }}>{localName(recipe.product.name, locale)}</td>
                      <td>{formatQuantity(asNumber(recipe.outputQuantity), locale)} {recipe.product.unitOfMeasure}</td>
                      <td>{recipe.items.length}</td>
                      <td>{recipe.items.map((line) => `${localName(line.product?.name, locale)} — ${formatQuantity(asNumber(line.quantity), locale)} ${line.product?.unitOfMeasure ?? ''}`).join(', ')}</td>
                      <td>{recipe.note || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      <Modal isOpen={recipeModalOpen} onClose={() => setRecipeModalOpen(false)} title={isRu ? 'Новая рецептура' : 'Yangi retseptura'} size="2xl">
        <form onSubmit={createRecipe} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <Select label={isRu ? 'Готовый продукт' : 'Tayyor mahsulot'} options={productOptions} value={recipeProductId} onChange={setRecipeProductId} />
            <Input label={isRu ? 'Норма выпуска' : 'Ishlab chiqarish normasi'} type="number" min="0.001" step="0.001" value={recipeOutputQty} onChange={(event) => setRecipeOutputQty(event.target.value)} required />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 'var(--text-sm)', marginBottom: 8 }}>{isRu ? 'Сырье на норму' : 'Norma uchun xomashyo'}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recipeMaterials.map((line, index) => (
                <div key={index} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8, alignItems: 'end' }}>
                  <Select label={isRu ? 'Сырье' : 'Xomashyo'} options={rawMaterialOptions} value={line.productId} onChange={(value) => setRecipeMaterials((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, productId: value } : row))} />
                  <Input label={isRu ? 'Количество' : 'Miqdori'} type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => setRecipeMaterials((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: event.target.value } : row))} />
                  <Button type="button" variant="ghost" disabled={recipeMaterials.length === 1} onClick={() => setRecipeMaterials((current) => current.filter((_, rowIndex) => rowIndex !== index))}>×</Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" style={{ marginTop: 10 }} onClick={() => setRecipeMaterials((current) => [...current, { productId: '', quantity: '' }])}>
              <Plus size={14} /> {isRu ? 'Добавить сырье' : 'Xomashyo qo‘shish'}
            </Button>
          </div>
          <Input label={isRu ? 'Комментарий' : 'Izoh'} value={recipeNote} onChange={(event) => setRecipeNote(event.target.value)} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button type="button" variant="outline" onClick={() => setRecipeModalOpen(false)}>{isRu ? 'Отмена' : 'Bekor qilish'}</Button>
            <Button type="submit" disabled={busy || products.length === 0 || rawMaterials.length === 0}><Save size={15} /> {isRu ? 'Сохранить рецептуру' : 'Retsepturani saqlash'}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={documentModalOpen} onClose={() => setDocumentModalOpen(false)} title={isRu ? 'Новый производственный документ' : 'Yangi ishlab chiqarish hujjati'} size="2xl">
        <form onSubmit={createDocument} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
            <Select label={isRu ? 'Рецептура / продукт' : 'Retseptura / mahsulot'} options={recipeOptions} value={documentRecipeId} onChange={(value) => { setPreview(null); setPreviewError(''); setDocumentRecipeId(value); }} />
            <Input label={isRu ? 'Планируемое количество' : 'Rejalashtirilgan miqdor'} type="number" min="0.001" step="0.001" value={documentQuantity} onChange={(event) => { setPreview(null); setPreviewError(''); setDocumentQuantity(event.target.value); }} required />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Select label={isRu ? 'Склад' : 'Ombor'} options={warehouseOptions} value={documentWarehouseId} onChange={(value) => { setPreview(null); setPreviewError(''); setDocumentWarehouseId(value); }} />
            <Select label={isRu ? 'Ответственный' : 'Mas’ul xodim'} options={staffOptions} value={documentResponsibleId} onChange={setDocumentResponsibleId} placeholder={isRu ? 'Не выбран' : 'Tanlanmagan'} />
          </div>
          <Input label={isRu ? 'Комментарий' : 'Izoh'} value={documentNote} onChange={(event) => setDocumentNote(event.target.value)} />
          {preview && (
            <div style={{ border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <div style={{ padding: 12, background: 'var(--color-bg-tertiary)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <strong>{isRu ? 'Расчет сырья' : 'Xomashyo hisobi'}</strong>
                <span>{isRu ? 'Оценка сырьевой себестоимости' : 'Xomashyo tannarxi taxmini'}: <b>{formatCurrency(preview.plannedMaterialCost, locale, 'UZS')}</b></span>
              </div>
              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {preview.materials.map((material) => (
                  <div key={material.productId} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 'var(--text-sm)' }}>
                    <span>{localName(material.product.name, locale)}</span>
                    <span>{formatQuantity(material.plannedQuantity, locale)} {material.product.unitOfMeasure}</span>
                    <span>{isRu ? 'Доступно' : 'Mavjud'}: {formatQuantity(material.freeQuantity, locale)}</span>
                    {material.shortage > 0 && <Badge variant="error">{isRu ? 'Не хватает' : 'Yetishmaydi'}: {formatQuantity(material.shortage, locale)}</Badge>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {previewError && <div style={alertStyle('error')}>{previewError}</div>}
          <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
            {isRu ? 'Создание документа не списывает сырье. Списание происходит при запуске.' : 'Hujjatni yaratish xomashyoni chiqim qilmaydi. Chiqim ishlab chiqarish boshlanganda amalga oshadi.'}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button type="button" variant="outline" onClick={() => setDocumentModalOpen(false)}>{isRu ? 'Отмена' : 'Bekor qilish'}</Button>
            <Button type="submit" disabled={busy || !preview || recipes.length === 0 || warehouses.length === 0}><Save size={15} /> {isRu ? 'Создать черновик' : 'Qoralama yaratish'}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={Boolean(selectedDocument)} onClose={() => setSelectedDocument(null)} title={selectedDocument ? `${selectedDocument.docNumber} · ${localName(selectedDocument.product.name, locale)}` : ''} size="3xl">
        {selectedDocument && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <Detail label={isRu ? 'Дата' : 'Sana'} value={formatDate(selectedDocument.docDate, locale)} />
              <Detail label={isRu ? 'План' : 'Reja'} value={`${formatQuantity(asNumber(selectedDocument.plannedQuantity), locale)} ${selectedDocument.product.unitOfMeasure}`} />
              <Detail label={isRu ? 'Склад' : 'Ombor'} value={localName(selectedDocument.warehouse.name, locale)} />
              <Detail label={isRu ? 'Статус' : 'Holat'} value={<StatusBadge status={selectedDocument.status} isRu={isRu} />} />
              <Detail label={isRu ? 'Ответственный' : 'Mas’ul xodim'} value={selectedDocument.responsible ? `${selectedDocument.responsible.firstName} ${selectedDocument.responsible.lastName}` : '—'} />
              <Detail label={isRu ? 'Материалы по плану' : 'Reja xomashyo tannarxi'} value={formatCurrency(asNumber(selectedDocument.plannedMaterialCost), locale, 'UZS')} />
              <Detail label={isRu ? 'Фактическая себестоимость сырья' : 'Haqiqiy xomashyo tannarxi'} value={formatCurrency(asNumber(selectedDocument.actualMaterialCost), locale, 'UZS')} />
            </div>
            {selectedDocument.note && <div style={{ color: 'var(--color-text-secondary)' }}>{selectedDocument.note}</div>}
            <div style={{ overflowX: 'auto', border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-md)' }}>
              <table style={tableStyle}>
                <thead><tr>
                  <th>{isRu ? 'Сырье' : 'Xomashyo'}</th>
                  <th>{isRu ? 'Плановый расход' : 'Rejalashtirilgan sarf'}</th>
                  <th>{isRu ? 'Фактический расход' : 'Haqiqiy sarf'}</th>
                  <th>{isRu ? 'Разница' : 'Farq'}</th>
                  <th>{isRu ? 'Цена за единицу' : 'Birlik tannarxi'}</th>
                  <th>{isRu ? 'Итого' : 'Jami tannarx'}</th>
                </tr></thead>
                <tbody>
                  {selectedDocument.materials.map((line) => (
                    <tr key={line.id}>
                      <td>{localName(line.product.name, locale)}</td>
                      <td>{formatQuantity(asNumber(line.plannedQuantity), locale)} {line.product.unitOfMeasure}</td>
                      <td>
                        {selectedDocument.status === 'IN_PROGRESS' ? (
                          <Input aria-label={`${localName(line.product.name, locale)} actual`} type="number" min="0" step="0.001" value={actualInputs[line.productId] ?? ''} onChange={(event) => setActualInputs((current) => ({ ...current, [line.productId]: event.target.value }))} style={{ width: 135 }} />
                        ) : line.actualQuantity == null ? '—' : `${formatQuantity(asNumber(line.actualQuantity), locale)} ${line.product.unitOfMeasure}`}
                      </td>
                      <td>{selectedDocument.status === 'IN_PROGRESS' && actualInputs[line.productId] !== undefined && actualInputs[line.productId] !== ''
                        ? `${formatQuantity(Number(actualInputs[line.productId]) - asNumber(line.plannedQuantity), locale)} ${line.product.unitOfMeasure}`
                        : line.actualQuantity == null ? '—' : `${formatQuantity(asNumber(line.actualQuantity) - asNumber(line.plannedQuantity), locale)} ${line.product.unitOfMeasure}`}</td>
                      <td>{formatCurrency(asNumber(line.unitCost), locale, 'UZS')}</td>
                      <td>{formatCurrency(asNumber(line.totalCost), locale, 'UZS')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {selectedDocument.status === 'READY' && (
              <Input label={isRu ? 'Фактически произведено' : 'Amalda ishlab chiqarildi'} type="number" min="0.001" step="0.001" value={producedQuantity} onChange={(event) => setProducedQuantity(event.target.value)} required />
            )}
            {selectedDocument.status === 'COMPLETED' && (
              <div style={{ ...alertStyle('success'), display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                <span>{isRu ? 'Принято на склад' : 'Omborga kirim qilindi'}: <b>{formatQuantity(asNumber(selectedDocument.producedQuantity), locale)} {selectedDocument.product.unitOfMeasure}</b></span>
                <span>{isRu ? 'Себестоимость единицы' : 'Birlik tannarxi'}: <b>{formatCurrency(asNumber(selectedDocument.unitCost), locale, 'UZS')}</b></span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
              <div>
                {['DRAFT', 'PLANNED', 'IN_PROGRESS', 'READY'].includes(selectedDocument.status) && canEdit && (
                  <Button variant="danger" onClick={() => void runDocumentAction('cancel')} disabled={busy}><XCircle size={15} /> {isRu ? 'Отменить' : 'Bekor qilish'}</Button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {selectedDocument.status === 'DRAFT' && canCreate && <Button onClick={() => void runDocumentAction('plan')} disabled={busy}>{isRu ? 'Запланировать' : 'Rejalashtirish'}</Button>}
                {selectedDocument.status === 'PLANNED' && canCreate && <Button onClick={() => void runDocumentAction('start')} disabled={busy}><Factory size={15} /> {isRu ? 'Начать производство' : 'Ishlab chiqarishni boshlash'}</Button>}
                {selectedDocument.status === 'IN_PROGRESS' && canEdit && <Button onClick={() => void runDocumentAction('ready')} disabled={busy || selectedDocument.materials.some((line) => actualInputs[line.productId] === undefined || actualInputs[line.productId] === '')}><CheckCircle2 size={15} /> {isRu ? 'Сохранить расход и отметить готовым' : 'Sarfni saqlash va tayyorlash'}</Button>}
                {selectedDocument.status === 'READY' && canCreate && <Button onClick={() => void runDocumentAction('complete')} disabled={busy || Number(producedQuantity) <= 0}><CheckCircle2 size={15} /> {isRu ? 'Принять на склад' : 'Omborga kirim qilish'}</Button>}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function localName(value: unknown, locale: 'uz' | 'ru'): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  const localized = value as Record<string, unknown>;
  return String(localized[locale] ?? localized.uz ?? localized.ru ?? '');
}

function formatQuantity(value: number, locale: 'uz' | 'ru'): string {
  return new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'uz-UZ', { maximumFractionDigits: 3 }).format(value);
}

function actionNotice(action: 'plan' | 'start' | 'ready' | 'complete' | 'cancel', isRu: boolean): string {
  const messages = {
    plan: ['Ishlab chiqarish rejalashtirildi', 'Производство запланировано'],
    start: ['Ishlab chiqarish boshlandi, xomashyo FIFO bo‘yicha sarflandi', 'Производство начато, сырье списано по FIFO'],
    ready: ['Haqiqiy sarf saqlandi, hujjat tayyor', 'Фактический расход сохранен, документ готов'],
    complete: ['Tayyor mahsulot tannarx bilan omborga kirim qilindi', 'Готовый продукт принят на склад с рассчитанной себестоимостью'],
    cancel: ['Ishlab chiqarish hujjati bekor qilindi', 'Производственный документ отменен'],
  };
  return messages[action][isRu ? 1 : 0];
}

function Kpi({ icon, title, value, color }: { icon: React.ReactNode; title: string; value: string; color: string }) {
  return (
    <Card style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: 12, color, background: 'var(--color-bg-tertiary)' }}>{icon}</div>
      <div>
        <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>{title}</div>
        <div style={{ color: 'var(--color-text-primary)', fontWeight: 700, fontSize: 'var(--text-lg)' }}>{value}</div>
      </div>
    </Card>
  );
}

function StatusBadge({ status, isRu }: { status: ProductionStatus; isRu: boolean }) {
  const label = statusLabels[status];
  return <Badge variant={label.variant}>{isRu ? label.ru : label.uz}</Badge>;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 12px', border: 0, borderBottom: active ? '2px solid var(--color-primary-600)' : '2px solid transparent', background: 'transparent', color: active ? 'var(--color-primary-700)' : 'var(--color-text-secondary)', fontWeight: active ? 600 : 500, cursor: 'pointer' }}>
      {children}
    </button>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ padding: 10, border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)', marginBottom: 5 }}>{label}</div>
      <div style={{ color: 'var(--color-text-primary)', fontWeight: 600, fontSize: 'var(--text-sm)' }}>{value}</div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div style={{ padding: 36, textAlign: 'center', color: 'var(--color-text-tertiary)' }}>{text}</div>;
}

function alertStyle(kind: 'error' | 'success'): React.CSSProperties {
  return {
    padding: '10px 14px',
    borderRadius: 'var(--radius-md)',
    fontSize: 'var(--text-sm)',
    color: kind === 'error' ? 'var(--color-error-700)' : 'var(--color-success-700)',
    background: kind === 'error' ? 'var(--color-error-50)' : 'var(--color-success-50)',
    border: `1px solid ${kind === 'error' ? 'var(--color-error-100)' : 'var(--color-success-100)'}`,
  };
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  textAlign: 'left',
  fontSize: 'var(--text-sm)',
};
