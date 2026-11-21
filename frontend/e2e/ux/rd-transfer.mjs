// Transfers: create (swap button, Enter adds line), then Ship and Receive from the board cards.
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
await page.goto(BASE + '/' + locale + '/inventory/transfers', { waitUntil: 'networkidle' });
await page.locator('header button, .rd-page > div button').filter({ hasText: /o‘tkazma|перемещение/i }).first().click();
const dlg = page.locator('[role="dialog"]').last();
const combos = dlg.locator('[role="combobox"]');
// pick target = first warehouse, source = second, then swap → source first, target second
await combos.nth(1).click(); await page.locator('[role="listbox"] [role="option"]').nth(0).click();
await combos.nth(0).click(); await page.locator('[role="listbox"] [role="option"]').nth(1).click();
await dlg.getByRole('button', { name: /almashtirish|Поменять/ }).click();
await combos.nth(2).click(); await page.locator('[role="listbox"] [role="option"]').filter({ hasText: 'Perf tovar 308' }).first().click();
console.log('source stock hint: ' + JSON.stringify(await dlg.locator('.rd-sub').first().innerText().catch(() => '')));
const qty = dlg.locator('input[inputmode="decimal"], input').last();
await qty.fill('1');
await qty.press('Enter');
await page.waitForTimeout(300);
await page.screenshot({ path: path.join(outDir, `create-${locale}.jpg`), type: 'jpeg', quality: 60 });
await dlg.locator('button[type="submit"]').click();
await page.waitForTimeout(1500);
const count = async (st) => page.locator(`section[aria-labelledby="tr-${st}"] li`).count();
console.log('after create: draft=' + (await count('DRAFT')) + ' transit=' + (await count('IN_TRANSIT')) + ' received=' + (await count('RECEIVED')));
await page.locator('section[aria-labelledby="tr-DRAFT"] li button').first().click();
{ const d = page.locator('[role="alertdialog"], [role="dialog"]'); await page.waitForTimeout(300); if (await d.count()) await d.last().locator('button').last().click(); }
await page.waitForTimeout(1500);
console.log('after ship: draft=' + (await count('DRAFT')) + ' transit=' + (await count('IN_TRANSIT')));
await page.locator('section[aria-labelledby="tr-IN_TRANSIT"] li button').first().click();
{ const d = page.locator('[role="alertdialog"], [role="dialog"]'); await page.waitForTimeout(300); if (await d.count()) await d.last().locator('button').last().click(); }
await page.waitForTimeout(1500);
console.log('after receive: transit=' + (await count('IN_TRANSIT')) + ' received=' + (await count('RECEIVED')));
await page.screenshot({ path: path.join(outDir, `board-${locale}.jpg`), type: 'jpeg', quality: 60 });
await browser.close();
