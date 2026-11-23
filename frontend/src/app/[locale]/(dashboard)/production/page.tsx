'use client';

import { useCallback, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { FileText, Layers3, Plus } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useConfirm } from '@/context/ConfirmContext';
import { toast } from '@/context/ToastContext';
import { apiFetch } from '@/lib/api';
import { useApiQuery, useInvalidateApi } from '@/lib/query/useApiQuery';
import { errorMessage, formatCurrency } from '@/lib/utils';
import { LoadError } from '@/components/ui/LoadError';
import { Button } from '@/components/ui/Button';
import { PageHeader } from '@/components/ui/PageHeader';
import { FilterBar, periodRange, useFilterState, type FilterDef } from '@/components/ui/filters';
import { StatCard, StatCardGrid } from '@/components/ui/stats/StatCard';
import { Link } from '@/i18n/navigation';
import type { SelectOption } from '@/components/ui/Select';
import type { MaterialCard } from '@/lib/production-recipe';
import { RecipeFormModal, type RecipeProduct } from '@/components/production/RecipeFormModal';
import { RecipesTab } from '@/components/production/RecipesTab';
import { DocumentsTab, type DocumentSortField } from '@/components/production/DocumentsTab';
import { ProductionDocumentFormModal } from '@/components/production/ProductionDocumentFormModal';
import { ProductionDocumentDetailsModal } from '@/components/production/ProductionDocumentDetailsModal';
import type { SortDir } from '@/components/production/TableParts';
import { localName, personName, STATUS_FILTERS, type DocumentsResponse, type Named, type ProductionDocument, type Recipe, type StaffOption } from '@/components/production/types';

type Tab = 'documents' | 'recipes';
const PAGE_SIZE = 20;
// Documents and recipes each keep their own filters in the URL (different keys, so both fit in one address).
const DOC_FILTER_DEFAULTS = { status: '', productId: '', warehouseId: '', responsibleId: '', period: '' };
const RECIPE_FILTER_DEFAULTS = { rstatus: '', uncosted: '' };


export default function ProductionPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const t = useTranslations('production');
  const tp = useTranslations('rd.production');
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
  const docLf = useFilterState('production.docs', DOC_FILTER_DEFAULTS);
  const filters = docLf.values;
  const debouncedSearch = docLf.debouncedSearch;
  const range = periodRange(filters.period);
  const [sortBy, setSortBy] = useState<DocumentSortField>('docDate');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  // A new filter or sort starts again at page 1.
  const pageKey = `${debouncedSearch}|${filters.status}|${filters.productId}|${filters.warehouseId}|${filters.responsibleId}|${filters.period}|${sortBy}|${sortDir}`;
  const [pageAt, setPageAt] = useState({ key: '', page: 1 });
  const page = pageAt.key === pageKey ? pageAt.page : 1;
  const setPage = (next: number) => setPageAt({ key: pageKey, page: next });
  const documentsEndpoint = useMemo(() => {
    const query = new URLSearchParams();
    if (debouncedSearch) query.set('search', debouncedSearch);
    if (filters.status) query.set('status', filters.status);
    if (filters.productId) query.set('productId', filters.productId);
    if (filters.warehouseId) query.set('warehouseId', filters.warehouseId);
    if (filters.responsibleId) query.set('responsibleId', filters.responsibleId);
    if (range.from) query.set('dateFrom', range.from);
    if (range.to) query.set('dateTo', range.to);
    if (page > 1) query.set('page', String(page));
    if (sortBy !== 'docDate' || sortDir !== 'desc') {
      query.set('sortBy', sortBy);
      query.set('sortDir', sortDir);
    }
    query.set('pageSize', String(PAGE_SIZE));
    return `/production/documents?${query.toString()}`;
  }, [debouncedSearch, filters.status, filters.productId, filters.warehouseId, filters.responsibleId, range.from, range.to, page, sortBy, sortDir]);
  const documentsQuery = useApiQuery<DocumentsResponse>(documentsEndpoint, { keepPrevious: true });

  // ── Recipes and reference lists ──────────────────────────────────────
  const recLf = useFilterState('production.recipes', RECIPE_FILTER_DEFAULTS, { searchKey: 'rq' });
  const recipeStatus = recLf.values.rstatus || 'all';
  const uncostedOnly = recLf.values.uncosted === '1';
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
  // Disabled only once the list has loaded and is really empty, and then explained.
  const noWarehouse = !warehousesQuery.isPending && warehouses.length === 0;

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
  const docFilterDefs: FilterDef[] = [
    { key: 'status', kind: 'segmented', label: t('holat'), options: STATUS_FILTERS.map((st) => ({ value: st.value, label: t(st.key) })) },
    { key: 'productId', kind: 'select', label: t('mahsulot'), searchable: true, options: productOptions.map((o) => ({ value: o.value, label: String(o.label) })) },
    { key: 'warehouseId', kind: 'select', label: t('ombor'), options: warehouseOptions.map((o) => ({ value: o.value, label: String(o.label) })) },
    ...(canViewStaff ? [{ key: 'responsibleId', kind: 'select', label: t('masul'), searchable: true, options: staffOptions.map((o) => ({ value: o.value, label: String(o.label) })) } satisfies FilterDef] : []),
    { key: 'period', kind: 'period', label: t('sanaOraligi') },
  ];
  const recipeFilterDefs: FilterDef[] = [
    {
      key: 'rstatus',
      kind: 'segmented',
      label: t('holat'),
      options: [
        { value: 'active', label: t('faol') },
        { value: 'inactive', label: t('nofaol2') },
        { value: 'archived', label: t('arxiv') },
      ],
    },
    { key: 'uncosted', kind: 'toggle', label: t('tannarxiHisoblanmagan') },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
      <div style={{ marginBottom: 'calc(-1 * var(--space-5))' }}>
        <PageHeader
          title={t('ishlabChiqarish')}
          subtitle={t('retsepturaXomashyoSarfiVaTayyor')}
          actions={
            <>
              {tab === 'documents' && can.create && recipeStats.active === 0 && (
                <Button onClick={() => setRecipeForm('new')}>
                  <Plus size={16} aria-hidden /> {t('yangiRetseptura')}
                </Button>
              )}
              {tab === 'documents' && can.create && recipeStats.active > 0 && (
                <Button onClick={() => setDocForm({ document: null })} disabled={noWarehouse} aria-describedby={noWarehouse ? 'production-no-warehouse' : undefined}>
                  <Plus size={16} aria-hidden /> {t('ishlabChiqarishHujjati')}
                </Button>
              )}
              {tab === 'recipes' && can.create && (
                <Button onClick={() => setRecipeForm('new')}>
                  <Plus size={16} aria-hidden /> {t('yangiRetseptura')}
                </Button>
              )}
            </>
          }
        />
      </div>

      {tab === 'documents' && can.create && noWarehouse && (
        <p id="production-no-warehouse" role="note" className="doc-banner is-info">
          {t('avvalOmborYarating')} 
          <Link href="/settings/branches" style={{ color: 'var(--color-primary-700)', fontWeight: 600 }}>
            {t('filiallarVaOmborlar')}
          </Link>
        </p>
      )}

      {failed && <LoadError error={failed.error} onRetry={() => queries.forEach((q) => q.isError && void q.refetch())} retrying={queries.some((q) => q.isFetching)} />}

      {/* The production flow in three steps: what exists, what is in work, what is finished */}
      {tab === 'documents' ? (
        <StatCardGrid label={tp('flow')} count={3}>
          <StatCard label={`1 · ${tp('stepRecipe')}`} loading={recipesQuery.isPending} value={recipeStats.active} secondary={recipeStats.active > 0 ? tp('stepRecipeOk', { uncosted: recipeStats.uncosted }) : tp('stepRecipeNone')} />
          <StatCard label={`2 · ${t('jarayonda')}`} loading={!stats && documentsQuery.isPending} value={stats ? stats.inProgress : null} secondary={tp('stepWorkHint')} />
          <StatCard label={`3 · ${t('yakunlangan')}`} loading={!stats && documentsQuery.isPending} value={stats ? stats.completed : null} secondary={`${t('ishlabChiqarishTannarxi')}: ${stats ? formatCurrency(stats.completedCost, locale, 'UZS') : '—'}`} />
        </StatCardGrid>
      ) : (
        <StatCardGrid label={t('retsepturalar')} count={3}>
          <StatCard label={t('jamiRetseptura')} loading={recipesQuery.isPending} value={recipeStats.total} />
          <StatCard label={t('faol')} loading={recipesQuery.isPending} value={recipeStats.active} />
          <StatCard label={t('tannarxiHisoblanmagan')} loading={recipesQuery.isPending} value={recipeStats.uncosted} secondary={t('narxsizXomashyoBor')} />
        </StatCardGrid>
      )}

      <div
        role="tablist"
        aria-label={t('ishlabChiqarishBolimlari')}
        style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--color-border-light)' }}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
          e.preventDefault();
          const next: Tab = e.key === 'Home' ? 'documents' : e.key === 'End' ? 'recipes' : tab === 'documents' ? 'recipes' : 'documents';
          setTab(next);
          document.getElementById(next === 'documents' ? 'tab-documents' : 'tab-recipes')?.focus();
        }}
      >
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
            filterBar={<FilterBar state={docLf} defs={docFilterDefs} searchPlaceholder={t('hujjatRaqami')} label={t('hujjatlarniQidirish')} resultCount={documentsQuery.isPending ? null : (documentsData?.total ?? 0)} />}
            filtered={Boolean(debouncedSearch || docLf.activeCount > 0)}
            onClearFilters={docLf.reset}
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
            }}
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
            uncostedOnly={uncostedOnly}
            search={recLf.search}
            filterBar={<FilterBar state={recLf} defs={recipeFilterDefs} searchPlaceholder={t('mahsulotNomiYokiSku')} />}
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


function TabButton({ id, controls, active, onClick, children }: { id: string; controls: string; active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      id={id}
      type="button"
      role="tab"
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      aria-controls={controls}
      onClick={onClick}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 44, padding: '10px 14px', border: 0, borderBottom: active ? '2px solid var(--color-primary-600)' : '2px solid transparent', background: 'transparent', color: active ? 'var(--color-primary-700)' : 'var(--color-text-secondary)', fontWeight: active ? 600 : 500, cursor: 'pointer' }}
    >
      {children}
    </button>
  );
}
