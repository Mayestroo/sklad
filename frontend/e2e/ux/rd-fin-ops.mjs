// Finance: open Operations, switch the direction chips and print the row counts per view.
// Usage: node e2e/ux/rd-fin-ops.mjs [shot.jpg]
import { chromium } from '@playwright/test';
import { getAuth, applyAuth } from './auth.mjs';

const [shot] = process.argv.slice(2);
const BASE = 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'uz', url: BASE }]);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
const b = await getAuth(page.request);
await page.goto(BASE + '/login');
await applyAuth(page, b);
await page.goto(BASE + '/uz/finance', { waitUntil: 'networkidle' });
await page.getByRole('button', { name: 'Operatsiyalar', exact: true }).click();
await page.waitForTimeout(800);
for (const chip of ['Hammasi', 'Kirimlar', 'Chiqimlar', 'O‘tkazmalar', 'O‘chirilganlar']) {
  await page.locator('[role="group"]').getByRole('button', { name: new RegExp('^' + chip) }).click();
  await page.waitForTimeout(900);
  const rows = await page.locator('table tbody tr').count();
  console.log(chip + ': ' + rows + ' rows');
}
await page.locator('[role="group"]').getByRole('button', { name: /^Kirimlar/ }).click();
await page.waitForTimeout(800);
if (shot) await page.screenshot({ path: shot });
console.log('errors: ' + JSON.stringify(errors));
await browser.close();
