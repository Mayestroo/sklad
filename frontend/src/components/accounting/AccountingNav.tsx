'use client';

import { useLocale } from 'next-intl';
import { BookOpen, FileText, PieChart, Scale } from 'lucide-react';
import { Link, usePathname } from '@/i18n/navigation';

const ITEMS = [
  { href: '/accounting', Icon: Scale, uz: 'Aylanma-saldo', ru: 'Оборотно-сальдовая', hintUz: 'Har bir hisob bo‘yicha aylanma va qoldiq', hintRu: 'Обороты и остатки по каждому счёту' },
  { href: '/accounting/journal', Icon: FileText, uz: 'Provodkalar jurnali', ru: 'Журнал проводок', hintUz: 'Hujjatlar yaratgan har bir provodka', hintRu: 'Каждая проводка, созданная документами' },
  { href: '/accounting/reports', Icon: PieChart, uz: 'Moliyaviy hisobotlar', ru: 'Финансовая отчётность', hintUz: 'Balans (1-shakl) va moliyaviy natijalar (2-shakl)', hintRu: 'Баланс (форма 1) и финрезультаты (форма 2)' },
  { href: '/accounting/accounts', Icon: BookOpen, uz: 'Hisoblar rejasi', ru: 'План счетов', hintUz: 'BHMS hisoblari ro‘yxati', hintRu: 'Список счетов НСБУ' },
] as const;

/**
 * The accounting section's four pages as tabs, so a user always sees where they
 * are and can move between the trial balance, journal, statements and the chart
 * of accounts in one click (the sidebar has a single "Buxgalteriya" entry).
 */
export function AccountingNav() {
  const isRu = useLocale() === 'ru';
  const pathname = usePathname();
  return (
    <nav className="sec-tabs no-print" aria-label={isRu ? 'Разделы бухгалтерии' : 'Buxgalteriya bo‘limlari'}>
      {ITEMS.map(({ href, Icon, uz, ru, hintUz, hintRu }) => {
        const current = href === '/accounting' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link key={href} href={href} className="sec-tab" aria-current={current ? 'page' : undefined} title={isRu ? hintRu : hintUz}>
            <Icon size={16} aria-hidden />
            <span>{isRu ? ru : uz}</span>
          </Link>
        );
      })}
    </nav>
  );
}
