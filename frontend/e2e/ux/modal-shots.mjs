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
  ['services', '/uz/services', (p) => p.getByRole('button', { name: /Yangi|Qo.shish/ }).first().click()],
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
