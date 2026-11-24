// Finance operations filters (the bar lives in the Operations tab, which is not in the URL). Local API only.
// Usage: node e2e/ux/fin-verify.mjs <outDir>
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { getAuth } from './auth.mjs';

const outDir = path.resolve(process.argv[2] || '.');
fs.mkdirSync(outDir, { recursive: true });
const BASE = process.env.UX_BASE || 'http://localhost:3000';
const browser = await chromium.launch();
const auth = await getAuth((await (await browser.newContext()).newPage()).request);
let fails = 0;
const log = (ok, step, note = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${note ? ' — ' + note : ''}`); };

for (const locale of ['uz', 'ru']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  await ctx.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: BASE }]);
  await ctx.addInitScript((b) => {
    if (localStorage.getItem('crm_access_token')) return;
    localStorage.setItem('crm_access_token', b.tokens.accessToken);
    localStorage.setItem('crm_refresh_token', b.tokens.refreshToken);
    localStorage.setItem('crm_user', JSON.stringify(b.user));
    if (b.company) localStorage.setItem('crm_company', JSON.stringify(b.company));
  }, auth);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const txCalls = [];
  page.on('request', (r) => { if (/\/finance\/transactions\?/.test(r.url())) txCalls.push(r.url()); });
  await page.goto(`${BASE}/${locale}/finance`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.screenshot({ path: path.join(outDir, `${locale}-1440-1-overview.jpg`), type: 'jpeg', quality: 72 });
  const cards = await page.locator('.stat-card').count();
  log(cards >= 5, `${locale} stat cards present (${cards})`);
  log((await page.locator('.stat-card button, .stat-card a').count()) === 0, `${locale} stat cards not clickable`);
  await page.getByRole('tab', { name: locale === 'uz' ? 'Operatsiyalar' : 'Операции' }).or(page.getByRole('button', { name: locale === 'uz' ? 'Operatsiyalar' : 'Операции', exact: true })).first().click();
  await page.waitForTimeout(800);
  log((await page.locator('.fb').count()) === 1, `${locale} filter bar in Operations`);
  // account dropdown
  const dd = page.locator('.fb-controls > .fb-pop-wrap > button[aria-haspopup="listbox"]').first();
  await dd.click();
  await page.waitForTimeout(250);
  const opts = page.locator('[role="listbox"] [role="option"]');
  if ((await opts.count()) > 1) {
    await opts.nth(1).click();
    await page.waitForTimeout(900);
    log(/account=/.test(page.url()) && /accountId=/.test(txCalls.at(-1) || ''), `${locale} account filter → URL + API`, txCalls.at(-1));
  } else log(false, `${locale} account options`);
  // period preset
  await page.locator('.fb-controls button[aria-haspopup="dialog"]').first().click();
  await page.waitForTimeout(300);
  await page.locator('.fb-pop-period .fb-preset').nth(3).click();
  await page.waitForTimeout(900);
  const last = txCalls.at(-1) || '';
  log(/period=this_month/.test(page.url()) && /date_from=\d{4}-\d{2}-01/.test(last), `${locale} period preset → URL + API dates`, last);
  // ops view switch still works and keeps filters
  await page.locator('[data-name="operations"] [role="radio"]').nth(1).click();
  await page.waitForTimeout(900);
  log(/direction=INCOME/.test(txCalls.at(-1) || '') && /accountId=/.test(txCalls.at(-1) || ''), `${locale} income view keeps filters`, txCalls.at(-1));
  await page.screenshot({ path: path.join(outDir, `${locale}-1440-2-operations.jpg`), type: 'jpeg', quality: 72 });
  await page.locator('.fb-clear').click();
  await page.waitForTimeout(900);
  log(!/accountId=|date_from=/.test(txCalls.at(-1) || ''), `${locale} clear all`, txCalls.at(-1));
  log(errors.length === 0, `${locale} no page errors`, errors.join(' | ').slice(0, 200));
  await ctx.close();
}
await browser.close();
console.log(fails ? `${fails} failed` : 'all passed');
process.exit(fails ? 1 : 0);
