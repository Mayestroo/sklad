'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  LayoutDashboard,
  ShoppingBag,
  ShoppingCart,
  ClipboardList,
  PackageCheck,
  Package,
  UserCheck,
  Wallet,
  Factory,
  BarChart3,
  BookOpen,
  Users,
  Settings,
  Receipt,
  RotateCcw,
  ChevronDown,
  GitBranch,
  ShieldCheck,
  CreditCard,
  Briefcase,
  Scale,
  Tags,
  Handshake,
  ArrowLeftRight,
  FileText,
  Calculator,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  NAV_SECTIONS,
  isLeafActive,
  isNavGroup,
  type NavGroup,
  type NavIconName,
  type NavLeaf,
} from '@/lib/navigation';

export const NAV_ICONS: Record<NavIconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  analytics: BarChart3,
  sales: ShoppingCart,
  orders: ClipboardList,
  returns: RotateCcw,
  prices: Tags,
  customers: UserCheck,
  crm: Handshake,
  expenses: Receipt,
  purchases: ShoppingBag,
  suppliers: UserCheck,
  counterparties: Users,
  products: PackageCheck,
  services: Briefcase,
  stock: Package,
  transfers: ArrowLeftRight,
  documents: FileText,
  production: Factory,
  finance: Wallet,
  accounting: BookOpen,
  opening: Scale,
  users: UserCheck,
  settings: Settings,
  branches: GitBranch,
  cost: Calculator,
  security: ShieldCheck,
  billing: CreditCard,
};

/**
 * Open state of a menu group: open when the current route is inside it, and
 * opened again when the route enters it; while the route stays inside, the
 * user's open/close wins. Adjusted during render (the previous route state is
 * kept in state), not in an effect.
 */
function useGroupOpen(active: boolean) {
  const [open, setOpen] = useState(active);
  const [wasActive, setWasActive] = useState(active);
  if (active !== wasActive) {
    setWasActive(active);
    if (active) setOpen(true);
  }
  return [open, setOpen] as const;
}

function NavItem({ leaf, nested, onNavigate }: { leaf: NavLeaf; nested?: boolean; onNavigate?: () => void }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const active = isLeafActive(leaf, pathname);
  const Icon = NAV_ICONS[leaf.icon];
  return (
    <Link
      href={leaf.href}
      className={`app-nav-link${active ? ' is-active' : ''}${nested ? ' is-nested' : ''}`}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
    >
      <Icon size={nested ? 16 : 18} aria-hidden className="app-nav-icon" />
      <span className="app-nav-label">{t(leaf.label)}</span>
    </Link>
  );
}

function NavGroupItem({ group, onNavigate }: { group: NavGroup; onNavigate?: () => void }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const active = pathname === group.prefix || pathname.startsWith(`${group.prefix}/`);
  const [open, setOpen] = useGroupOpen(active);
  const Icon = NAV_ICONS[group.icon];
  const listId = `nav-group-${group.prefix.replace(/\W/g, '')}`;
  return (
    <div>
      <button
        type="button"
        className={`app-nav-link app-nav-group${active ? ' is-group-active' : ''}${active && !open ? ' is-active' : ''}`}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Icon size={18} aria-hidden className="app-nav-icon" />
        <span className="app-nav-label">{t(group.label)}</span>
        <ChevronDown size={15} aria-hidden className="app-nav-chevron" style={{ transform: open ? 'none' : 'rotate(-90deg)' }} />
      </button>
      {open && (
        <div id={listId} className="app-nav-sub">
          {group.items.map((leaf) => (
            <NavItem key={leaf.href} leaf={leaf} nested onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

interface SidebarProps {
  /** Phone/tablet drawer state (ignored on wide screens, where it is always shown). */
  mobileOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
  const t = useTranslations('nav');
  const tUx = useTranslations('ux');
  const locale = useLocale() as 'uz' | 'ru';
  const { company } = useAuth();

  const companyDisplayName =
    typeof company?.name === 'string'
      ? company.name
      : company?.name?.[locale] || company?.name?.uz || company?.slug || 'Sklad ERP';

  return (
    <aside className={`app-sidebar${mobileOpen ? ' is-open' : ''}`} aria-label={tUx('mainNav')}>
      <div className="app-sidebar-brand">
        <div className="app-sidebar-logo" aria-hidden>
          <Package size={20} />
        </div>
        <div className="app-sidebar-company" title={companyDisplayName}>
          {companyDisplayName}
        </div>
        <button type="button" className="app-sidebar-close" onClick={onClose} aria-label={tUx('closeMenu')} title={tUx('closeMenu')}>
          <X size={18} aria-hidden />
        </button>
      </div>

      <nav className="app-nav">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="app-nav-section">
            <div className="app-nav-section-title">{t(section.title)}</div>
            {section.entries.map((entry) =>
              isNavGroup(entry) ? (
                <NavGroupItem key={entry.prefix} group={entry} onNavigate={onClose} />
              ) : (
                <NavItem key={entry.href} leaf={entry} onNavigate={onClose} />
              ),
            )}
          </div>
        ))}
      </nav>
    </aside>
  );
}
