// Sales return: start from a sale via the quick search; the create drawer must open
// with the sale's lines loaded. Usage: node e2e/ux/rd-sreturn.mjs <outDir> [locale]
import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { getAuth } from './auth.mjs';

const [outDir, locale = 'uz'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const BASE = 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: BASE }]);
const page = await ctx.newPage();
const b = await getAuth(page.request);
await page.goto(BASE + '/login');
await page.evaluate((b) => {
  localStorage.setItem('crm_access_token', b.tokens.accessToken);
  localStorage.setItem('crm_refresh_token', b.tokens.refreshToken);
  localStorage.setItem('crm_user', JSON.stringify(b.user));
  if (b.company) localStorage.setItem('crm_company', JSON.stringify(b.company));
}, b);
await page.goto(BASE + '/' + locale + '/sales/returns', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const quick = page.locator('#sr-quick').locator('xpath=..').locator('input[type="search"]');
await quick.fill('0007');
await page.waitForTimeout(300);
const matches = await page.locator('#sr-quick').locator('xpath=..').locator('.dash-todo').count();
console.log('matches for 0007: ' + matches);
await page.locator('#sr-quick').locator('xpath=..').locator('.rd-next-btn').first().click();
await page.waitForTimeout(1500);
const dlg = page.locator('[role="dialog"]').last();
console.log('drawer open: ' + (await dlg.count()));
const rows = await dlg.locator('tbody tr').count();
console.log('lines loaded in drawer: ' + rows);
await page.screenshot({ path: path.join(outDir, `quick-start-${locale}-1440.jpg`), type: 'jpeg', quality: 60 });
await browser.close();
