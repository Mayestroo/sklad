// Large-list check (local DB): add N products via the API, then measure /products and /sales/new.
import { chromium, request as pwRequest } from '@playwright/test';
import { getAuth, applyAuth } from './auth.mjs';
const N = Number(process.argv[2] || 400);
const API = 'http://localhost:3001/api';
const req = await pwRequest.newContext();
const auth = await getAuth(req);
const h = { authorization: 'Bearer ' + auth.tokens.accessToken };
const existing = await (await req.get(API + '/inventory/products', { headers: h })).json();
const have = (Array.isArray(existing) ? existing : existing.data ?? []).length;
for (let i = have; i < N; i++) {
  await req.post(API + '/inventory/products', { headers: h, data: { name: { uz: `Perf tovar ${i}`, ru: `Перф товар ${i}` }, unitOfMeasure: 'piece', type: 'PRODUCT', salePrice: 1000 + i, salePriceCurrency: 'UZS' } });
}
console.log('products before', have, 'target', N);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:3000/login');
await applyAuth(page, auth);
for (const route of ['/products', '/sales/new']) {
  const t0 = Date.now();
  await page.goto('http://localhost:3000' + route, { waitUntil: 'networkidle' });
  const load = Date.now() - t0;
  const rows = await page.locator('tbody tr').count();
  // interaction latency: type into the first search/select
  let typing = null;
  if (route === '/products') {
    const t1 = Date.now();
    await page.getByPlaceholder(/SKU/).first().fill('Perf tovar 39');
    await page.waitForTimeout(50);
    typing = Date.now() - t1;
  } else {
    const t1 = Date.now();
    await page.getByRole('combobox', { name: /Tovarni tanlang|Выберите товар/ }).first().click();
    await page.getByRole('option').first().waitFor();
    typing = Date.now() - t1;
  }
  const lt = await page.evaluate(() => performance.getEntriesByType('longtask').length);
  console.log(route, 'load', load, 'ms; rows', rows, '; interaction', typing, 'ms; longtasks', lt);
}
await browser.close();
