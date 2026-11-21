// Branches: create a demo branch through the LOCAL API if none exists, then attach the first
// unattached warehouse from the inline choice. Usage: node e2e/ux/rd-attach.mjs [shot.jpg]
import { chromium } from '@playwright/test';
import { getAuth, applyAuth } from './auth.mjs';

const [shot] = process.argv.slice(2);
const BASE = 'http://localhost:3000';
const API = 'http://localhost:3001/api';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'uz', url: BASE }]);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
const b = await getAuth(page.request);
const H = { Authorization: 'Bearer ' + b.tokens.accessToken, 'X-Tenant-Id': b.company.id };
const branches = await (await page.request.get(API + '/tenants/branches', { headers: H })).json();
if (!branches.length) {
  const r = await page.request.post(API + '/tenants/branches', { headers: H, data: { name: { uz: 'Chilonzor filiali', ru: 'Филиал Чиланзар' }, address: 'Toshkent', isMain: true } });
  console.log('branch created: ' + r.status());
}
await page.goto(BASE + '/login');
await applyAuth(page, b);
await page.goto(BASE + '/uz/settings/branches', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const title = page.locator('h2', { hasText: /biriktirilmagan/ });
console.log('unattached before: ' + JSON.stringify(await title.allInnerTexts()));
await page.locator('[id^="attach-"]').first().click();
await page.getByRole('option').first().click();
await page.waitForTimeout(1500);
console.log('unattached after: ' + JSON.stringify(await title.allInnerTexts()));
console.log('branch card: ' + JSON.stringify((await page.locator('h3', { hasText: /Omborlar/ }).allInnerTexts())));
if (shot) await page.screenshot({ path: shot, fullPage: true });
console.log('errors: ' + JSON.stringify(errors));
await browser.close();
