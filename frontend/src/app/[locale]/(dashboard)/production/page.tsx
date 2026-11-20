'use client';

import { useCallback, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, CheckCircle2, Clock3, Factory, FileText, Layers3, ListChecks, Plus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { toast } from '@/context/ToastContext';
import { apiFetch } from '@/lib/api';
import { useApiQuery, useInvalidateApi } from '@/lib/query/useApiQuery';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { errorMessage, formatCurrency } from '@/lib/utils';
import { LoadError } from '@/components/ui/LoadError';
import { Button } from '@/components/ui/Button';
import type { SelectOption } from '@/components/ui/Select';
import type { MaterialCard } from '@/lib/production-recipe';
import { RecipeFormModal, type RecipeProduct } from '@/components/production/RecipeFormModal';
import { RecipesTab } from '@/components/production/RecipesTab';
import { DocumentsTab, EMPTY_FILTERS, type DocumentFilters, type DocumentSortField } from '@/components/production/DocumentsTab';
import { ProductionDocumentFormModal } from '@/components/production/ProductionDocumentFormModal';
import { ProductionDocumentDetailsModal } from '@/components/production/ProductionDocumentDetailsModal';
import type { SortDir } from '@/components/production/TableParts';
import { localName, personName, type DocumentsResponse, type Named, type ProductionDocument, type Recipe, type StaffOption } from '@/components/production/types';

type Tab = 'documents' | 'recipes';
const PAGE_SIZE = 20;


export default function ProductionPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const t = useTranslations('production');
  const { token, company, user, hasPermission } = useAuth();
  const confirm = useConfirm();
  const invalidateApi = useInvalidateApi();
  // Rights are separate (TZ 9.3). A session saved before production:* existed
  // still carries the inventory rights they were granted from (the server
  // checks the real ones).
  const allowed = (slug: string, legacy: string) => hasPermission(slug) || hasPermission(legacy);
  const can = {
    create: allowed('production:create', 'inventory:create'),
    edit: allowed('production:edit', 'inventory:edit'),
    delete: allowed('production:delete', 'inventory:delete'),
    complete: allowed('production:complete', 'inventory:create'),
    cancel: allowed('production:cancel', 'inventory:edit'),
  };
  const canViewStaff = Boolean(user?.roles.some((role) => ['super_admin', 'company_admin'].includes(role)) || user?.permissions.includes('users:view'));

  // The active tab lives in the URL (?tab=recipes), so a reload keeps it (TZ 11.3).
  const searchParams = useSearchParams();
  const [tabOverride, setTabOverride] = useState<Tab | null>(null);
  const tab: Tab = tabOverride ?? (searchParams?.get('tab') === 'recipes' ? 'recipes' : 'documents');
  const setTab = (next: Tab) => {
    setTabOverride(next);
    const url = new URL(window.location.href);
    if (next === 'recipes') url.searchParams.set('tab', 'recipes');
    else url.searchParams.delete('tab');
    window.history.replaceState(window.history.state, '', url.toString());
  };

  // ── Documents: filters, sorting, paging (server side) ────────────────
  const [filters, setFilters] = useState<DocumentFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<DocumentSortField>('docDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const debouncedSearch = useDebouncedValue(filters.search.trim(), 300);
  const documentsEndpoint = useMemo(() => {
    const query = new URLSearchParams();
    if (debouncedSearch) query.set('search', debouncedSearch);
    if (filters.status) query.set('status', filters.status);
    if (filters.productId) query.set('productId', filters.productId);
    if (filters.warehouseId) query.set('warehouseId', filters.warehouseId);
    if (filters.responsibleId) query.set('responsibleId', filters.responsibleId);
    if (filters.dateFrom) query.set('dateFrom', filters.dateFrom);
    if (filters.dateTo) query.set('dateTo', filters.dateTo);
    if (page > 1) query.set('page', String(page));
    if (sortBy !== 'docDate' || sortDir !== 'desc') {
      query.set('sortBy', sortBy);
      query.set('sortDir', sortDir);
    }
    query.set('pageSize', String(PAGE_SIZE));
    return `/production/documents?${query.toString()}`;
  }, [debouncedSearch, filters.status, filters.productId, filters.warehouseId, filters.responsibleId, filters.dateFrom, filters.dateTo, page, sortBy, sortDir]);
  const documentsQuery = useApiQuery<DocumentsResponse>(documentsEndpoint, { keepPrevious: true });

  // ── Recipes and reference lists ──────────────────────────────────────
  const [recipeStatus, setRecipeStatus] = useState('all');
  const [uncostedOnly, setUncostedOnly] = useState(false);
  const recipesQuery = useApiQuery<Recipe[]>('/production/recipes?status=all');
  const archivedQuery = useApiQuery<Recipe[]>(recipeStatus === 'archived' ? '/production/recipes?status=archived' : null);
  const finishedQuery = useApiQuery<RecipeProduct[]>('/production/finished-products');
  const materialsQuery = useApiQuery<MaterialCard[]>('/production/materials');
  const warehousesQuery = useApiQuery<Named[]>('/tenants/warehouses');
  const staffQuery = useApiQuery<StaffOption[]>(canViewStaff ? '/users/staff' : null);

  const list = <T,>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
  const documentsData = documentsQuery.data;
  const documents = list<ProductionDocument>(documentsData?.items);
  const recipes = list<Recipe>(recipesQuery.data);
  const archived = list<Recipe>(archivedQuery.data);
  const finished = list<RecipeProduct>(finishedQuery.data);
  const materials = list<MaterialCard>(materialsQuery.data);
  const warehouses = list<Named>(warehousesQuery.data);
  const staff = list<StaffOption>(staffQuery.data);
  const queries = [documentsQuery, recipesQuery, finishedQuery, materialsQuery, warehousesQuery, staffQuery];
  const failed = queries.find((q) => q.isError);

  const productOptions: SelectOption[] = useMemo(() => finished.map((p) => ({ value: p.id, label: localName(p.name, locale) })), [finished, locale]);
  const warehouseOptions: SelectOption[] = useMemo(() => warehouses.map((w) => ({ value: w.id, label: localName(w.name, locale) })), [warehouses, locale]);
  const staffOptions: SelectOption[] = useMemo(() => staff.map((s) => ({ value: s.id, label: personName(s) })), [staff]);

  // ── Dialogs ──────────────────────────────────────────────────────────
  const [recipeForm, setRecipeForm] = useState<'new' | Recipe | null>(null);
  const [docForm, setDocForm] = useState<{ document: ProductionDocument | null; recipeId?: string } | null>(null);
  const [openDoc, setOpenDoc] = useState<ProductionDocument | null>(null);
  const [highlightRecipe, setHighlightRecipe] = useState<string | null>(null);
  const [highlightDoc, setHighlightDoc] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    await Promise.all([invalidateApi('/production'), invalidateApi('/inventory/products')]);
  }, [invalidateApi]);

  const loadDocument = async (id: string) => {
    if (!token || !company) return;
    try {
      setOpenDoc(await apiFetch<ProductionDocument>(`/production/documents/${id}`, { token, tenantId: company.id, locale }));
    } catch (error) {
      toast.error(errorMessage(error) || t('hujjatniOchibBolmadi'));
    }
  };

  const recipeAction = async (path: string, method: 'POST' | 'DELETE', body: unknown, message: string) => {
    if (!token || !company) return null;
    try {
      const result = await apiFetch<Recipe>(`/production/recipes/${path}`, { method, token, tenantId: company.id, locale, ...(body ? { body: JSON.stringify(body) } : {}) });
      toast.success(message);
      await refresh();
      return result;
    } catch (error) {
      toast.error(errorMessage(error) || t('amalBajarilmadi'));
      return null;
    }
  };

  const archiveRecipe = async (recipe: Recipe) => {
    const ok = await confirm({
      title: t('retsepturaniArxivgaOlish'),
      description: t('arxivdagiRetsepturaHujjatlardaTanlanmaydiVa'),
      variant: 'warning',
      confirmText: t('arxivgaOlish'),
      cancelText: t('bekorQilish'),
    });
    if (ok) await recipeAction(`${recipe.id}/archive`, 'POST', null, t('retsepturaArxivgaOlindi'));
  };
  const deleteRecipe = async (recipe: Recipe) => {
    const ok = await confirm({
      title: t('retsepturaniOchirish'),
      description: t('retsepturaButunlayOchiriladi'),
      variant: 'danger',
      confirmText: t('ochirish'),
      cancelText: t('bekorQilish'),
    });
    if (ok) await recipeAction(recipe.id, 'DELETE', null, t('retsepturaOchirildi'));
  };

  // ── Statistics cards follow the tab (TZ 11.3) ────────────────────────
  const stats = documentsData?.stats;
  const recipeStats = {
    total: recipes.length,
    active: recipes.filter((r) => r.isActive).length,
    uncosted: recipes.filter((r) => r.estimate.missingPrice).length,
  };
  const setDocFilter = (patch: Partial<DocumentFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, color: 'var(--color-text-primary)', fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)' }}>{t('ishlabChiqarish')}</h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', margin: '4px 0 0' }}>
            {t('retsepturaXomashyoSarfiVaTayyor')}
          </p>
        </div>
        {tab === 'documents' && can.create && (
          <Button onClick={() => setDocForm({ document: null })} disabled={warehouses.length === 0}>
            <Plus size={16} aria-hidden /> {t('ishlabChiqarishHujjati')}
          </Button>
        )}
        {tab === 'recipes' && can.create && (
          <Button onClick={() => setRecipeForm('new')}>
            <Plus size={16} aria-hidden /> {t('yangiRetseptura')}
          </Button>
        )}
      </div>

      {failed && <LoadError error={failed.error} onRetry={() => queries.forEach((q) => q.isError && void q.refetch())} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 'var(--space-4)' }}>
        {tab === 'documents' ? (
          <>
            <Kpi icon={<Clock3 size={20} aria-hidden />} title={t('jarayonda')} value={stats ? String(stats.inProgress) : '…'} color="var(--color-warning-600)" active={filters.status === 'IN_PROGRESS,READY'} onClick={() => setDocFilter({ status: filters.status === 'IN_PROGRESS,READY' ? '' : 'IN_PROGRESS,READY' })} />
            <Kpi icon={<CheckCircle2 size={20} aria-hidden />} title={t('yakunlangan')} value={stats ? String(stats.completed) : '…'} color="var(--color-success-600)" active={filters.status === 'COMPLETED'} onClick={() => setDocFilter({ status: filters.status === 'COMPLETED' ? '' : 'COMPLETED' })} />
            <Kpi icon={<Factory size={20} aria-hidden />} title={t('ishlabChiqarishTannarxi')} hint={t('yakunlanganHujjatlarTanlanganDavrVa')} value={stats ? formatCurrency(stats.completedCost, locale, 'UZS') : '…'} color="var(--color-primary-600)" active={false} onClick={() => setDocFilter({ status: 'COMPLETED' })} />
          </>
        ) : (
          <>
            <Kpi icon={<Layers3 size={20} aria-hidden />} title={t('jamiRetseptura')} value={String(recipeStats.total)} color="var(--color-primary-600)" active={recipeStatus === 'all' && !uncostedOnly} onClick={() => { setRecipeStatus('all'); setUncostedOnly(false); }} />
            <Kpi icon={<ListChecks size={20} aria-hidden />} title={t('faol')} value={String(recipeStats.active)} color="var(--color-success-600)" active={recipeStatus === 'active'} onClick={() => setRecipeStatus(recipeStatus === 'active' ? 'all' : 'active')} />
            <Kpi icon={<AlertTriangle size={20} aria-hidden />} title={t('tannarxiHisoblanmagan')} hint={t('narxsizXomashyoBor')} value={String(recipeStats.uncosted)} color="var(--color-warning-600)" active={uncostedOnly} onClick={() => setUncostedOnly(!uncostedOnly)} />
          </>
        )}
      </div>

      <div role="tablist" aria-label={t('ishlabChiqarishBolimlari')} style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--color-border-light)' }}>
        <TabButton id="tab-documents" controls="panel-documents" active={tab === 'documents'} onClick={() => setTab('documents')}>
          <FileText size={15} aria-hidden /> {t('hujjatlar')}
        </TabButton>
        <TabButton id="tab-recipes" controls="panel-recipes" active={tab === 'recipes'} onClick={() => setTab('recipes')}>
          <Layers3 size={15} aria-hidden /> {t('retsepturalar')}
        </TabButton>
      </div>

      {tab === 'documents' ? (
        <div role="tabpanel" id="panel-documents" aria-labelledby="tab-documents">
          <DocumentsTab
            locale={locale}
            documents={documents}
            total={documentsData?.total ?? 0}
            loading={documentsQuery.isPending || documentsQuery.isPlaceholderData}
            filters={filters}
            onFilters={setDocFilter}
            onClearFilters={() => {
              setFilters(EMPTY_FILTERS);
              setPage(1);
            }}
            page={page}
            pageSize={PAGE_SIZE}
            onPage={setPage}
            sortBy={sortBy}
            sortDir={sortDir}
            onSort={(field) => {
              if (field === sortBy) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
              else {
                setSortBy(field);
                setSortDir(field === 'docDate' || field === 'totalCost' ? 'desc' : 'asc');
              }
              setPage(1);
            }}
            productOptions={productOptions}
            warehouseOptions={warehouseOptions}
            staffOptions={canViewStaff ? staffOptions : null}
            canCreate={can.create && warehouses.length > 0}
            onCreate={() => setDocForm({ document: null })}
            onOpen={(doc) => void loadDocument(doc.id)}
            highlightId={highlightDoc}
          />
        </div>
      ) : (
        <div role="tabpanel" id="panel-recipes" aria-labelledby="tab-recipes">
          <RecipesTab
            recipes={recipes}
            archived={archived}
            loading={recipesQuery.isPending || (recipeStatus === 'archived' && archivedQuery.isPending)}
            locale={locale}
            highlightId={highlightRecipe}
            canCreate={can.create}
            canEdit={can.edit}
            canDelete={can.delete}
            canCreateDocument={can.create}
            status={recipeStatus}
            onStatusChange={setRecipeStatus}
            uncostedOnly={uncostedOnly}
            onUncostedChange={setUncostedOnly}
            onCreate={() => setRecipeForm('new')}
            onEdit={(recipe) => setRecipeForm(recipe)}
            onCopy={async (recipe) => {
              const copy = await recipeAction(`${recipe.id}/copy`, 'POST', null, t('nusxaYaratildiNofaolTahrirlang'));
              if (copy) {
                setHighlightRecipe(copy.id);
                setRecipeForm(copy);
              }
            }}
            onToggleActive={(recipe) =>
              void recipeAction(`${recipe.id}/active`, 'POST', { isActive: !recipe.isActive }, recipe.isActive ? t('retsepturaNofaolQilindi') : t('retsepturaFaolQilindi'))
            }
            onArchive={(recipe) => void archiveRecipe(recipe)}
            onDelete={(recipe) => void deleteRecipe(recipe)}
            onCreateDocument={(recipe) => setDocForm({ document: null, recipeId: recipe.id })}
          />
        </div>
      )}

      {recipeForm !== null && (
        <RecipeFormModal
          key={recipeForm === 'new' ? 'new' : recipeForm.id}
          isOpen
          recipe={recipeForm === 'new' ? null : recipeForm}
          products={finished}
          materials={materials}
          existingRecipes={recipes}
          locale={locale}
          onClose={() => setRecipeForm(null)}
          onProductsChanged={refresh}
          onSaved={async (id, message) => {
            setRecipeForm(null);
            toast.success(message);
            setHighlightRecipe(id);
            await refresh();
          }}
        />
      )}

      {docForm && (
        <ProductionDocumentFormModal
          locale={locale}
          document={docForm.document}
          initialRecipeId={docForm.recipeId}
          recipes={recipes}
          warehouseOptions={warehouseOptions}
          staffOptions={staffOptions}
          defaultResponsibleId={staff.some((s) => s.id === user?.id) ? user?.id : undefined}
          onClose={() => setDocForm(null)}
          onSaved={async (saved, message) => {
            setDocForm(null);
            setTab('documents');
            toast.success(message);
            setHighlightDoc(saved.id);
            await refresh();
            await loadDocument(saved.id);
          }}
        />
      )}

      {openDoc && (
        <ProductionDocumentDetailsModal
          key={`${openDoc.id}-${openDoc.status}-${String(openDoc.totalCost)}`}
          locale={locale}
          document={openDoc}
          canEdit={can.edit}
          canDelete={can.delete}
          canComplete={can.complete}
          canCancel={can.cancel}
          onClose={() => setOpenDoc(null)}
          onEdit={() => {
            setDocForm({ document: openDoc });
            setOpenDoc(null);
          }}
          onChanged={async (updated, message) => {
            toast.success(message);
            setHighlightDoc(updated?.id ?? null);
            setOpenDoc(updated);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function Kpi({ icon, title, value, color, active, onClick, hint }: { icon: React.ReactNode; title: string; value: string; color: string; active: boolean; onClick: () => void; hint?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={hint}
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 16, minHeight: 76, textAlign: 'left', cursor: 'pointer', borderRadius: 'var(--radius-lg)', border: `1px solid ${active ? 'var(--color-primary-500)' : 'var(--color-border-light)'}`, background: 'var(--color-bg-secondary)', boxShadow: 'var(--shadow-sm)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12, color, background: 'var(--color-bg-tertiary)', flexShrink: 0 }}>{icon}</div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>{title}</div>
        <div className="tabular-nums" style={{ color: 'var(--color-text-primary)', fontWeight: 700, fontSize: 'var(--text-lg)' }}>{value}</div>
      </div>
    </button>
  );
}

function TabButton({ id, controls, active, onClick, children }: { id: string; controls: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      id={id}
      type="button"
      role="tab"
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 44, padding: '10px 14px', border: 0, borderBottom: active ? '2px solid var(--color-primary-600)' : '2px solid transparent', background: 'transparent', color: active ? 'var(--color-primary-700)' : 'var(--color-text-secondary)', fontWeight: active ? 600 : 500, cursor: 'pointer' }}
    >
      {children}
    </button>
  );
}
