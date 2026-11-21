// Inventory documents: start "write-off" from its tile, pick warehouse + product,
// Enter in quantity adds the line, submit posts the document (local DB only).
import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { getAuth } from './auth.mjs';
const [outDir, locale = 'uz'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const BASE = 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: BASE }]);
const page = await ctx.newPage();
const b = await getAuth(page.request);
await page.goto(BASE + '/login');
await page.evaluate((b) => {
  localStorage.setItem('crm_access_token', b.tokens.accessToken);
  localStorage.setItem('crm_refresh_token', b.tokens.refreshToken);
  localStorage.setItem('crm_user', JSON.stringify(b.user));
  localStorage.setItem('crm_company', JSON.stringify(b.company));
}, b);
await page.goto(BASE + '/' + locale + '/inventory/documents', { waitUntil: 'networkidle' });
const rowsBefore = await page.locator('table.rd-table tbody tr').count();
await page.locator('section[aria-labelledby="invdocs-start"] button').nth(0).click();
await page.waitForTimeout(300);
const dlg = page.locator('[role="dialog"]').last();
console.log('dialog title: ' + JSON.stringify(await dlg.locator('h2, h3').first().innerText()));
const combos = dlg.locator('[role="combobox"]');
await combos.nth(0).click(); // warehouse
await page.locator('[role="listbox"] [role="option"]').first().click();
await combos.nth(1).click(); // product
await page.locator('[role="listbox"] [role="option"]').nth(1).click();
const qty = dlg.locator('input').first();
await qty.fill('3');
await qty.press('Enter');
await page.waitForTimeout(300);
console.log('lines after Enter: ' + (await dlg.locator('table tbody tr').count()));
await page.screenshot({ path: path.join(outDir, `writeoff-${locale}.jpg`), type: 'jpeg', quality: 60 });
await dlg.locator('button[type="submit"]').click();
await page.waitForTimeout(2000);
console.log('dialogs open: ' + (await page.locator('[role="dialog"]').count()) + ' rows before/after: ' + rowsBefore + '/' + (await page.locator('table.rd-table tbody tr').count()));
await browser.close();
