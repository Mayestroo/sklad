// Money input in a real form (local API only): type "15,000.5" key by key into the sale price of a
// new product, read what the field shows, save, and print the number that went to the API.
// Then paste "15,000" into the same field and print the explicit note.
import { chromium } from '@playwright/test';
import { getAuth, applyAuth } from './auth.mjs';

const BASE = 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'uz', url: BASE }]);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
const bodies = [];
page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/inventory/products')) bodies.push(r.postData()); });
const b = await getAuth(page.request);
await page.goto(BASE + '/login');
await applyAuth(page, b);
await page.goto(BASE + '/uz/products/new', { waitUntil: 'networkidle' });
await page.locator('#prod-name-uz').fill('UX money ' + Date.now().toString().slice(-5));
const price = page.locator('#prod-sale-price');
await price.click();
await price.pressSequentially('15,000.5', { delay: 30 });
console.log('field while typing: ' + JSON.stringify(await price.inputValue()));
await page.locator('#prod-name-uz').click(); // blur
console.log('field after blur: ' + JSON.stringify(await price.inputValue()));
await page.locator('.doc-aside button[type="submit"]').first().click();
await page.waitForTimeout(2000);
const sent = bodies.map((x) => { try { const j = JSON.parse(x); return { salePrice: j.salePrice, type: typeof j.salePrice }; } catch { return x; } });
console.log('sent to API: ' + JSON.stringify(sent));

// paste case on a fresh form
await page.goto(BASE + '/uz/products/new', { waitUntil: 'networkidle' });
const p2 = page.locator('#prod-sale-price');
await p2.click();
await page.evaluate(() => navigator.clipboard?.writeText('15,000').catch(() => {}));
await p2.evaluate((el) => {
  const dt = new DataTransfer();
  dt.setData('text/plain', '15,000');
  el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
});
// browsers insert pasted text natively; emulate the insertion that follows the paste event
await p2.evaluate((el) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, '15,000');
  el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: '15,000' }));
});
await page.waitForTimeout(300);
console.log('pasted field: ' + JSON.stringify(await p2.inputValue()));
console.log('note: ' + JSON.stringify(await page.locator('.money-note').allInnerTexts()));
await page.locator('.money-note button').click().catch(() => {});
await page.waitForTimeout(300);
console.log('after "it was a decimal": ' + JSON.stringify(await p2.inputValue()));
console.log('errors: ' + JSON.stringify(errors));
await browser.close();
