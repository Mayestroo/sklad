// Screenshot routes in a theme, optionally scrolling the first table, opening the first row menu or filter dropdown.
// Usage: node e2e/ux/ui-check.mjs <outDir> <theme light|dark> <action none|scroll|menu|dropdown> <route...>
import { chromium } from '@playwright/test';
import path from 'node:path'; import fs from 'node:fs';
import { getAuth } from './auth.mjs';
const [outDir, theme, action, ...routes] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const BASE = 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'uz', url: BASE }]);
const page = await ctx.newPage();
const b = await getAuth(page.request);
await page.goto(BASE + '/login');
await page.evaluate(({ b, theme }) => { localStorage.setItem('crm_access_token', b.tokens.accessToken); localStorage.setItem('crm_refresh_token', b.tokens.refreshToken); localStorage.setItem('crm_user', JSON.stringify(b.user)); if (b.company) localStorage.setItem('crm_company', JSON.stringify(b.company)); localStorage.setItem('crm_theme', theme); }, { b, theme });
for (const route of routes) {
  await page.goto(BASE + '/uz' + route, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1200);
  if (action === 'scroll') await page.evaluate(() => { const s = document.querySelector('.rd-table-scroll') || [...document.querySelectorAll('div')].find((d) => d.scrollHeight > d.clientHeight + 50 && getComputedStyle(d).overflowY !== 'visible' && d.querySelector('table')); if (s) s.scrollTop = 120; });
  if (action === 'menu') { const btn = page.locator('.ux-menu-trigger, main button[aria-haspopup="menu"]').last(); if (await btn.count()) await btn.click().catch(() => {}); }
  if (action === 'dropdown') { const btn = page.locator('.fb-controls button[aria-haspopup="listbox"]', { hasText: process.env.DD || 'Mijoz' }).first(); if (await btn.count()) await btn.click().catch(() => {}); }
  if (action === 'columns') { await page.getByRole('button', { name: /Ustunlar/ }).first().click().catch(() => {}); }
  await page.waitForTimeout(400);
  const name = route.replace(/\//g, '_') || 'home';
  await page.screenshot({ path: path.join(outDir, `${name}-${theme}-${action}.jpg`), type: 'jpeg', quality: 60, fullPage: !!process.env.FULL });
  console.log('shot', name);
}
await browser.close();
