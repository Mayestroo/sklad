// Redesign check for the sales invoice form: pick customer, pick a product,
// type quantity, Enter → new row focused, checklist ticks, Ctrl+S saves a draft.
// Usage: node e2e/ux/rd-sale-form.mjs <outDir> [locale] [width] [route=/sales/new]
import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { getAuth } from './auth.mjs';

const [outDir, locale = 'uz', widthArg = '1440', route = '/sales/new'] = process.argv.slice(2);
const width = Number(widthArg);
fs.mkdirSync(outDir, { recursive: true });
const BASE = 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: BASE }]);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
const b = await getAuth(page.request);
await page.goto(BASE + '/login');
await page.evaluate((b) => {
  localStorage.setItem('crm_access_token', b.tokens.accessToken);
  localStorage.setItem('crm_refresh_token', b.tokens.refreshToken);
  localStorage.setItem('crm_user', JSON.stringify(b.user));
  if (b.company) localStorage.setItem('crm_company', JSON.stringify(b.company));
}, b);
await page.goto(BASE + '/' + locale + route, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
const checklist = async () => (await page.locator('.doc-checklist li[data-done="true"]').count()) + '/' + (await page.locator('.doc-checklist li').count());
console.log('checklist at start: ' + (await checklist()) + ' — ' + (await page.locator('.doc-checklist h3').innerText()));

const pick = async (combo, optionIndex = 0) => {
  await combo.click();
  await page.waitForTimeout(200);
  const opts = page.locator('[role="listbox"] [role="option"]');
  await opts.nth(optionIndex).click();
  await page.waitForTimeout(200);
};
// first combobox in the main card = counterparty
const combos = page.locator('.doc-main [role="combobox"]');
await pick(combos.nth(0));
console.log('after customer: ' + (await checklist()));
// product combobox: first one inside the lines tbody
const productCombo = page.locator('.doc-main tbody tr').first().locator('[role="combobox"]');
await pick(productCombo);
console.log('after product: ' + (await checklist()));
const qty = page.locator('.doc-main tbody tr').first().locator('input').first();
await qty.click();
await qty.fill('2');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
const rows = await page.locator('.doc-main tbody tr').count();
const focusedRole = await page.evaluate(() => document.activeElement?.getAttribute('role'));
const focusedRow = await page.evaluate(() => {
  const tr = document.activeElement?.closest('tr');
  return tr ? [...tr.parentElement.children].indexOf(tr) : -1;
});
console.log(`Enter in qty of last row → rows=${rows}, focus=${focusedRole} in row ${focusedRow}`);
console.log('checklist now: ' + (await checklist()) + ' — ' + (await page.locator('.doc-checklist h3').innerText()));
await page.screenshot({ path: path.join(outDir, `filled-${locale}-${width}.jpg`), type: 'jpeg', quality: 60, fullPage: true });
// Ctrl+S saves a draft
await page.keyboard.press('Control+s');
await page.waitForTimeout(2500);
console.log('after Ctrl+S url: ' + new URL(page.url()).pathname + ' toast: ' + JSON.stringify(await page.locator('.app-toast-region').innerText().catch(() => '')));
console.log('errors: ' + JSON.stringify(errors.slice(0, 3)));
await browser.close();
