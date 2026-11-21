// Price list: type a price in row 1, Enter → saved, cursor in row 2; "use base price" fills a row.
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
await page.goto(BASE + '/' + locale + '/sales/prices', { waitUntil: 'networkidle' });
const first = page.locator('[data-price-row="0"] input');
await first.click();
await first.fill('15000');
await page.keyboard.press('Enter');
await page.waitForTimeout(1500);
console.log('toast: ' + JSON.stringify(await page.locator('.app-toast-region').innerText().catch(() => '')));
console.log('focused row: ' + (await page.evaluate(() => document.activeElement?.closest('[data-price-row]')?.getAttribute('data-price-row'))));
console.log('row 0 value now: ' + (await first.inputValue()));
const use = page.locator('.rd-linkbtn').first();
if (await use.count()) {
  await use.click();
  console.log('unsaved pill: ' + JSON.stringify(await page.locator('.rd-active-filter').innerText().catch(() => '')));
}
await page.screenshot({ path: '../docs/ux-redesign/prices/flow-' + locale + '.jpg', type: 'jpeg', quality: 60 });
await browser.close();
