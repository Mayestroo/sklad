/**
 * Single source of the app navigation: the sidebar, the mobile drawer, the
 * breadcrumbs and the "Go to" palette (Ctrl+K) all read this list, so a page
 * is reachable from everywhere once it is listed here.
 *
 * Labels are keys of the `nav` namespace in messages/{uz,ru}.json.
 */
import { SALES_EXPENSE_HREF } from './finance-quick-action';

export type NavIconName =
  | 'dashboard' | 'analytics' | 'sales' | 'orders' | 'returns' | 'prices' | 'customers' | 'crm'
  | 'expenses' | 'purchases' | 'suppliers' | 'counterparties' | 'products' | 'services'
  | 'stock' | 'transfers' | 'documents' | 'production' | 'finance' | 'accounting'
  | 'opening' | 'users' | 'settings' | 'branches' | 'cost' | 'security' | 'billing';

export interface NavLeaf {
  href: string;
  /** Key in the `nav` messages namespace. */
  label: string;
  icon: NavIconName;
  /** Active only on this exact path (a parent route of other items). */
  exact?: boolean;
  /** Extra search words for the Go-to palette (both languages). */
  keywords?: string;
}

export interface NavGroup {
  /** Key in the `nav` messages namespace. */
  label: string;
  icon: NavIconName;
  /** Path prefix that makes the group active / open. */
  prefix: string;
  items: NavLeaf[];
}

export interface NavSection {
  /** Key in the `nav` messages namespace. */
  title: string;
  entries: Array<NavLeaf | NavGroup>;
}

export const isNavGroup = (e: NavLeaf | NavGroup): e is NavGroup => 'items' in e;

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'sectionMain',
    entries: [
      { href: '/', label: 'dashboard', icon: 'dashboard', exact: true },
      { href: '/analytics', label: 'analytics', icon: 'analytics', keywords: 'analitika аналитика report' },
    ],
  },
  {
    title: 'sectionTrade',
    entries: [
      {
        label: 'sales',
        icon: 'sales',
        prefix: '/sales',
        items: [
          { href: '/sales', label: 'salesOverview', icon: 'sales', exact: true, keywords: 'invoice faktura счет реализация' },
          { href: '/sales/orders', label: 'salesOrders', icon: 'orders', keywords: 'zakaz заказ' },
          { href: '/sales/returns', label: 'salesReturns', icon: 'returns', keywords: 'qaytarish возврат' },
          { href: '/sales/prices', label: 'prices', icon: 'prices', keywords: 'narx chegirma цена скидка прайс' },
          { href: '/sales/customers', label: 'customers', icon: 'customers', keywords: 'mijoz клиент покупатель' },
          { href: '/sales/crm', label: 'crm', icon: 'crm', keywords: 'bitim сделка crm' },
          { href: SALES_EXPENSE_HREF, label: 'salesExpenses', icon: 'expenses' },
        ],
      },
      {
        label: 'purchases',
        icon: 'purchases',
        prefix: '/purchases',
        items: [
          { href: '/purchases', label: 'purchaseReceipts', icon: 'purchases', exact: true, keywords: 'kirim приход поступление' },
          { href: '/purchases/expenses', label: 'purchasesExpenses', icon: 'expenses', keywords: 'xarajat расход' },
          { href: '/purchases/returns', label: 'purchasesReturns', icon: 'returns', keywords: 'qaytarish возврат' },
          { href: '/purchases/suppliers', label: 'suppliers', icon: 'suppliers', keywords: 'taminotchi поставщик' },
        ],
      },
      { href: '/counterparties', label: 'counterparties', icon: 'counterparties', keywords: 'kontragent контрагент akt sverka' },
    ],
  },
  {
    title: 'sectionWarehouse',
    entries: [
      { href: '/products', label: 'products', icon: 'products', keywords: 'tovar mahsulot товар номенклатура' },
      { href: '/services', label: 'services', icon: 'services', keywords: 'xizmat услуга akt' },
      {
        label: 'inventory',
        icon: 'stock',
        prefix: '/inventory',
        items: [
          { href: '/inventory', label: 'stockLevels', icon: 'stock', exact: true, keywords: 'qoldiq остаток' },
          { href: '/inventory/transfers', label: 'transfers', icon: 'transfers', keywords: 'ko‘chirish перемещение' },
          { href: '/inventory/documents', label: 'inventoryDocuments', icon: 'documents', keywords: 'inventarizatsiya hisobdan chiqarish инвентаризация списание' },
        ],
      },
      { href: '/production', label: 'production', icon: 'production', keywords: 'retsept рецепт производство' },
    ],
  },
  {
    title: 'sectionFinance',
    entries: [
      { href: '/finance', label: 'finance', icon: 'finance', keywords: 'kassa bank to‘lov касса банк платеж' },
      { href: '/accounting', label: 'accounting', icon: 'accounting', keywords: 'jurnal schet osv журнал счет' },
      { href: '/opening-balances', label: 'openingBalances', icon: 'opening', keywords: 'boshlang‘ich начальные остатки' },
    ],
  },
  {
    title: 'sectionAdmin',
    entries: [
      { href: '/users', label: 'users', icon: 'users', keywords: 'xodim rol сотрудник роль' },
      {
        label: 'settings',
        icon: 'settings',
        prefix: '/settings',
        items: [
          { href: '/settings/branches', label: 'branches', icon: 'branches', keywords: 'filial ombor филиал склад' },
          { href: '/settings/sales', label: 'salesSettings', icon: 'sales' },
          { href: '/settings/production', label: 'costSettings', icon: 'cost', keywords: 'tannarx себестоимость' },
          { href: '/settings/security', label: 'security', icon: 'security', keywords: 'parol пароль' },
          { href: '/settings/billing', label: 'tariff', icon: 'billing', keywords: 'tarif to‘lov тариф оплата' },
        ],
      },
    ],
  },
];

/** Every leaf in menu order. */
export function allNavLeaves(): NavLeaf[] {
  return NAV_SECTIONS.flatMap((s) => s.entries.flatMap((e) => (isNavGroup(e) ? e.items : [e])));
}

/** Path without query string. */
const pathOf = (href: string) => href.split('?')[0];

export function isLeafActive(leaf: NavLeaf, pathname: string): boolean {
  const p = pathOf(leaf.href);
  if (leaf.exact || p === '/') return pathname === p;
  return pathname === p || pathname.startsWith(`${p}/`);
}

/**
 * The menu item that owns the current path (longest matching href), and the
 * group it sits in — used for breadcrumbs and the page context.
 */
export function findNavTrail(pathname: string): { group?: NavGroup; leaf?: NavLeaf } {
  let best: { group?: NavGroup; leaf?: NavLeaf; len: number } = { len: -1 };
  for (const s of NAV_SECTIONS) {
    for (const e of s.entries) {
      const leaves = isNavGroup(e) ? e.items : [e];
      for (const leaf of leaves) {
        const p = pathOf(leaf.href);
        const match = p === '/' ? pathname === '/' : pathname === p || pathname.startsWith(`${p}/`);
        if (match && p.length > best.len) best = { group: isNavGroup(e) ? e : undefined, leaf, len: p.length };
      }
    }
  }
  return { group: best.group, leaf: best.leaf };
}

/** Case- and apostrophe-insensitive match for the Go-to palette. */
export function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʻʼ`']/g, '')
    .replace(/ё/g, 'е')
    .trim();
}
