// Redesign check for list pages: opens a list (optionally pre-filtered by URL),
// counts rows, clicks the first row to open the preview drawer, screenshots it,
// closes it with Esc, and opens a row from the keyboard. (Stat cards are not filters any more.)
// Usage: node e2e/ux/rd-list.mjs <route> <outDir> <name> [locale] [width]
import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { getAuth } from './auth.mjs';

const [route, outDir, name, locale = 'uz', widthArg = '1440'] = process.argv.slice(2);
const width = Number(widthArg);
fs.mkdirSync(outDir, { recursive: true });
const BASE = 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, reducedMotion: 'reduce' });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: BASE }]);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
const b = await getAuth(page.request);
await page.goto(BASE + '/login');
await page.evaluate((b) => {
  localStorage.clear();
  localStorage.setItem('crm_access_token', b.tokens.accessToken);
  localStorage.setItem('crm_refresh_token', b.tokens.refreshToken);
  localStorage.setItem('crm_user', JSON.stringify(b.user));
  if (b.company) localStorage.setItem('crm_company', JSON.stringify(b.company));
}, b);
await page.goto(BASE + '/' + locale + route, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const rows = () => page.locator('table.rd-table tbody tr').count();
console.log(`${route}: rows=${await rows()}`);
// Active filters are FilterBar chips now (e2e/ux/fc-verify.mjs exercises the filters themselves).
console.log('active filters: ' + JSON.stringify(await page.locator('.fb-chip-text').allInnerTexts()));
if ((await rows()) > 0) {
  await page.locator('table.rd-table tbody tr').first().locator('td').first().click();
  await page.waitForTimeout(500);
  const dlg = page.locator('[role="dialog"]');
  console.log('drawer open: ' + (await dlg.count()) + ' title=' + JSON.stringify(await page.locator('#drawer-title').innerText().catch(() => '')));
  await page.screenshot({ path: path.join(outDir, `${name}-drawer-${locale}-${width}.jpg`), type: 'jpeg', quality: 60 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  console.log('after Esc dialogs: ' + (await page.locator('[role="dialog"]').count()));
  // keyboard: focus first row, Enter opens
  await page.locator('table.rd-table tbody tr').first().focus();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  console.log('Enter on row opens drawer: ' + (await page.locator('[role="dialog"]').count()));
  await page.keyboard.press('Escape');
}
console.log('errors: ' + JSON.stringify(errors.slice(0, 3)));
await browser.close();
