// Screenshots of a set of dialogs (open state), light and dark. Local API only; nothing is saved.
// Usage: node e2e/ux/modal-shots.mjs <outDir> [light|dark|both] [filter]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { getAuth } from './auth.mjs';

const outDir = path.resolve(process.argv[2] || '.');
const themes = (process.argv[3] || 'light') === 'both' ? ['light', 'dark'] : [process.argv[3] || 'light'];
const only = process.argv[4] || '';
fs.mkdirSync(outDir, { recursive: true });
const BASE = process.env.UX_BASE || 'http://localhost:3000';
const browser = await chromium.launch();
const auth = await getAuth((await (await browser.newContext()).newPage()).request);

/** name, url, how to open (a function of page). */
const CASES = [
  ['counterparty', '/uz/counterparties', (p) => p.getByRole('button', { name: 'Yangi kontragent' }).first().click()],
  ['user', '/uz/users', (p) => p.getByRole('button', { name: 'Xodim qo‘shish' }).first().click()],
  ['finance-income', '/uz/finance', (p) => p.getByRole('button', { name: /^Kirim/ }).first().click()],
  ['invdoc', '/uz/inventory/documents', (p) => p.locator('.task-tile').first().click()],
  ['customer-pay', '/uz/sales/customers', (p) => p.getByRole('button', { name: /Pul olish|To.lov/ }).first().click()],
  ['customer-delete', '/uz/sales/customers', async (p) => { await p.locator('button.ux-menu-trigger').first().click(); await p.getByRole('menuitem', { name: /O.chirish/ }).first().click(); }],
  ['folder', '/uz/counterparties', (p) => p.getByRole('button', { name: /Papka/ }).first().click()],
  ['transfer', '/uz/inventory/transfers', (p) => p.getByRole('button', { name: /Yangi|Ko.chirish/ }).first().click()],
  ['product-quick', '/uz/products', (p) => p.getByRole('button', { name: /Yangi|Qo.shish/ }).first().click()],
  ['recipe', '/uz/production?tab=recipes', async (p) => { const b = p.getByRole('button', { name: 'Yangi retseptura' }).first(); if (!(await b.count())) await p.getByRole('tab', { name: /Retseptura/ }).first().click().catch(() => {}); await p.getByRole('button', { name: 'Yangi retseptura' }).first().click(); }],
  ['prod-doc', '/uz/production', (p) => p.getByRole('button', { name: /Ishlab chiqarish hujjati/ }).first().click()],
  ['finance-expense', '/uz/finance', (p) => p.getByRole('button', { name: /^Chiqim/ }).first().click()],
  ['categories', '/uz/products', (p) => p.getByRole('button', { name: 'Kategoriyalar' }).first().click()],
  ['product-delete', '/uz/products', async (p) => { await p.locator('button.ux-menu-trigger').first().click(); await p.getByRole('menuitem', { name: /O.chirish/ }).first().click(); }],
  ['branch', '/uz/settings/branches', (p) => p.getByRole('button', { name: 'Yangi filial' }).first().click()],
  ['warehouse', '/uz/settings/branches', (p) => p.getByRole('button', { name: 'Yangi ombor' }).first().click()],
  ['crm-deal', '/uz/sales/crm', (p) => p.getByRole('button', { name: 'Yangi bitim' }).first().click()],
  ['pricelist', '/uz/sales/prices', (p) => p.getByRole('button', { name: 'Yangi narx jadvali' }).first().click()],
  ['sreturn', '/uz/sales/returns', (p) => p.getByRole('button', { name: 'Yangi qaytarish' }).first().click()],
  ['customer-profile', '/uz/sales/customers', async (p) => { await p.locator('button.ux-menu-trigger').first().click(); await p.getByRole('menuitem', { name: /Profil/ }).first().click(); }],
  ['cp-profile', '/uz/counterparties', async (p) => { await p.locator('button.ux-menu-trigger').first().click(); await p.getByRole('menuitem', { name: 'Kartochka' }).first().click(); }],
  ['cp-move', '/uz/counterparties', async (p) => { await p.locator('button.ux-menu-trigger').first().click(); await p.getByRole('menuitem', { name: /Papkaga/ }).first().click(); }],
  ['sale-preview', '/uz/sales', (p) => p.locator('table tbody tr').first().click()],
  ['purchase-preview', '/uz/purchases', (p) => p.locator('table tbody tr').first().click()],
  ['order-preview', '/uz/sales/orders', (p) => p.locator('table tbody tr').first().click()],
  ['ob-new', '/uz/opening-balances', (p) => p.getByRole('button', { name: /Yangi hujjat|Yangi boshlang/ }).first().click()],
  ['ob-import', '/uz/opening-balances', (p) => p.getByRole('button', { name: /Excel/ }).first().click()],
  ['billing-pay', '/uz/settings/billing', (p) => p.getByRole('button', { name: /To.lash|To.lov/ }).first().click()],
  ['shortcuts', '/uz', async (p) => { await p.keyboard.press('Shift+?'); }],
  ['goto', '/uz', async (p) => { await p.keyboard.press('Control+k'); }],
  ['user-edit', '/uz/users', async (p) => { await p.locator('button.ux-menu-trigger').first().click(); await p.getByRole('menuitem', { name: /Tahrirlash/ }).first().click(); }],
  ['category-edit', '/uz/products', async (p) => { await p.getByRole('button', { name: 'Kategoriyalar' }).first().click(); }],
  ['services', '/uz/services', (p) => p.getByRole('button', { name: 'Mijozga xizmat akti' }).first().click()],
];

for (const theme of themes) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', colorScheme: theme });
  await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'uz', url: BASE }]);
  await ctx.addInitScript(([b, t]) => {
    localStorage.setItem('crm_theme', t);
    if (localStorage.getItem('crm_access_token')) return;
    localStorage.setItem('crm_access_token', b.tokens.accessToken);
    localStorage.setItem('crm_refresh_token', b.tokens.refreshToken);
    localStorage.setItem('crm_user', JSON.stringify(b.user));
    if (b.company) localStorage.setItem('crm_company', JSON.stringify(b.company));
  }, [auth, theme]);
  const page = await ctx.newPage();
  for (const [name, url, openIt] of CASES) {
    if (only && !name.includes(only)) continue;
    try {
      await page.goto(BASE + url);
      await page.waitForLoadState('networkidle').catch(() => {});
      await page.waitForTimeout(400);
      await Promise.race([openIt(page), new Promise((_, r) => setTimeout(() => r(new Error('open timeout')), 8000))]);
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(outDir, `${theme}-${name}.jpg`), type: 'jpeg', quality: 75 });
      console.log('ok', theme, name);
    } catch (e) {
      console.log('skip', theme, name, String(e).split('\n')[0].slice(0, 120));
    }
  }
  await ctx.close();
}
await browser.close();
