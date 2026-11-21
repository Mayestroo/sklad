// New product: type the name and a price, "Save and add another" → toast and an empty form again.
import { chromium } from '@playwright/test';
import { getAuth } from './auth.mjs';
const locale = process.argv[2] || 'uz';
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
await page.goto(BASE + '/' + locale + '/products/new', { waitUntil: 'networkidle' });
const name = 'UX test ' + Date.now().toString().slice(-5);
await page.locator(locale === 'ru' ? '#prod-name-ru' : '#prod-name-uz').fill(name);
await page.locator('#prod-sale-price').fill('25000');
console.log('preview: ' + JSON.stringify(await page.locator('.doc-aside').innerText()));
await page.locator('.doc-aside button[type="submit"]').nth(1).click();
await page.waitForTimeout(2000);
console.log('toast: ' + JSON.stringify(await page.locator('.app-toast-region').innerText().catch(() => '')));
console.log('name field after save: ' + JSON.stringify(await page.locator(locale === 'ru' ? '#prod-name-ru' : '#prod-name-uz').inputValue()));
console.log('url: ' + new URL(page.url()).pathname);
await browser.close();
