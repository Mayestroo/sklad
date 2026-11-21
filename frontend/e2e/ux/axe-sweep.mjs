// axe (WCAG 2.0/2.1 A + AA) over the redesigned routes, light and dark. Prints one line per route
// with violation ids and node counts, and writes JSON to the given file.
// Usage: node e2e/ux/axe-sweep.mjs out.json [light|dark|both]   (UX_EMAIL for the super-admin set)
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { getAuth, applyAuth } from './auth.mjs';

const [out = 'axe.json', themes = 'both'] = process.argv.slice(2);
const BASE = 'http://localhost:3000';
const ADMIN = process.env.UX_EMAIL === 'superadmin@local.test';
const ROUTES = ADMIN
  ? ['/admin', '/admin/billing', '/admin/tickets', '/admin/announcements', '/admin/security']
  : ['/', '/sales', '/sales/new', '/sales/orders', '/sales/orders/new', '/sales/returns', '/purchases', '/purchases/new', '/purchases/expenses', '/purchases/expenses/new', '/purchases/returns', '/purchases/suppliers', '/products', '/products/new', '/inventory', '/inventory/documents', '/inventory/transfers', '/counterparties', '/sales/customers', '/sales/crm', '/sales/prices', '/finance', '/services', '/production', '/opening-balances', '/accounting', '/accounting/accounts', '/accounting/journal', '/accounting/reports', '/analytics', '/users', '/settings/branches', '/settings/sales', '/settings/production', '/settings/security', '/settings/billing'];
const PUBLIC = ADMIN ? [] : ['/login', '/register'];

const browser = await chromium.launch();
const results = [];
for (const theme of themes === 'both' ? ['light', 'dark'] : [themes]) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' });
  await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'uz', url: BASE }]);
  const page = await ctx.newPage();
  const b = await getAuth(page.request);
  for (const route of [...PUBLIC, ...ROUTES]) {
    const isPublic = PUBLIC.includes(route);
    await page.goto(BASE + '/login');
    await page.evaluate((t) => { localStorage.clear(); if (t === 'dark') localStorage.setItem('crm_theme', 'dark'); }, theme);
    if (!isPublic) await applyAuth(page, b);
    await page.goto(BASE + '/uz' + (route === '/' ? '' : route), { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).exclude('nextjs-portal').analyze();
    const v = res.violations.map((x) => ({ id: x.id, impact: x.impact, n: x.nodes.length, sample: x.nodes[0]?.target?.join(' ') }));
    results.push({ theme, route, violations: v });
    console.log(`${theme.padEnd(5)} ${route.padEnd(26)} ${v.length ? v.map((x) => `${x.id}(${x.n})`).join(' ') : 'OK'}`);
  }
  await ctx.close();
}
fs.writeFileSync(out, JSON.stringify(results, null, 1));
await browser.close();
