// Redesign check: first sign-in remembers the e-mail; the second sign-in asks only the password.
// Usage: node e2e/ux/rd-login.mjs <outDir> [locale] [width]
import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const out = path.resolve(process.argv[2] || '../docs/ux-redesign/auth/flow');
const locale = process.argv[3] || 'uz';
const width = Number(process.argv[4] || 1440);
fs.mkdirSync(out, { recursive: true });
const BASE = 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width, height: 900 } });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: BASE }]);
const page = await ctx.newPage();
const log = (m) => console.log(m);

await page.goto(BASE + '/' + locale + '/login', { waitUntil: 'networkidle' });
await page.fill('input[name="email"]', 'admin@orient.uz');
await page.fill('input[name="password"]', 'Admin123!');
const t0 = Date.now();
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 });
log(`first sign-in OK in ${Date.now() - t0}ms → ${new URL(page.url()).pathname}`);

// Sign out locally (keep the remembered e-mail), come back to /login.
await page.evaluate(() => {
  for (const k of ['crm_access_token', 'crm_refresh_token', 'crm_user', 'crm_company']) localStorage.removeItem(k);
});
await page.goto(BASE + '/' + locale + '/login', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const who = await page.locator('.auth-who').innerText().catch(() => '');
log('returning card: ' + JSON.stringify(who));
const emailFieldVisible = await page.locator('input[type="email"]').count();
log('email field shown: ' + emailFieldVisible);
const focused = await page.evaluate(() => document.activeElement?.getAttribute('name'));
log('focused field: ' + focused);
await page.screenshot({ path: path.join(out, `returning-${locale}-${width}.jpg`), type: 'jpeg', quality: 60 });
await page.keyboard.type('Admin123!');
await page.keyboard.press('Enter');
await page.waitForURL((u) => !u.pathname.endsWith('/login'), { timeout: 30000 });
log('second sign-in (password only) OK → ' + new URL(page.url()).pathname);

// "Other account" brings the e-mail field back.
await page.evaluate(() => {
  for (const k of ['crm_access_token', 'crm_refresh_token', 'crm_user', 'crm_company']) localStorage.removeItem(k);
});
await page.goto(BASE + '/' + locale + '/login', { waitUntil: 'networkidle' });
await page.locator('.auth-who button').click();
log('after "other account", email field: ' + (await page.locator('input[type="email"]').count()));
await browser.close();
