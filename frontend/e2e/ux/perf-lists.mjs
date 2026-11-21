// Large-table check for the redesigned lists (LOCAL API only). Tops products up to N via the API,
// then for /products, /inventory and /sales/new measures: load to network idle, rendered rows,
// search typing → list updated, header sort click → re-render, and long tasks (>50 ms).
// Usage: node e2e/ux/perf-lists.mjs [N=1000]
import { chromium, request as pwRequest } from '@playwright/test';
import { getAuth, applyAuth } from './auth.mjs';

const N = Number(process.argv[2] || 1000);
const API = 'http://localhost:3001/api';
const req = await pwRequest.newContext();
const auth = await getAuth(req);
const h = { authorization: 'Bearer ' + auth.tokens.accessToken, 'x-tenant-id': auth.company.id };
const list = await (await req.get(API + '/inventory/products', { headers: h })).json();
const have = (Array.isArray(list) ? list : list.data ?? list.items ?? []).length;
const jobs = [];
for (let i = have; i < N; i++) {
  jobs.push(() => req.post(API + '/inventory/products', { headers: h, data: { name: { uz: `Perf tovar ${i}`, ru: `Перф товар ${i}` }, unitOfMeasure: 'piece', type: 'PRODUCT', salePrice: 1000 + i, salePriceCurrency: 'UZS' } }));
}
for (let i = 0; i < jobs.length; i += 10) await Promise.all(jobs.slice(i, i + 10).map((j) => j()));
console.log(`products: had ${have}, now ≥ ${Math.max(have, N)}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  window.__lt = [];
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration); }).observe({ type: 'longtask', buffered: true });
});
await page.goto('http://localhost:3000/login');
await applyAuth(page, auth);
const longtasks = () => page.evaluate(() => { const a = window.__lt.splice(0); return { n: a.length, max: Math.round(Math.max(0, ...a)) }; });

for (const route of ['/products', '/inventory', '/sales/new']) {
  const t0 = Date.now();
  await page.goto('http://localhost:3000/uz' + route, { waitUntil: 'networkidle' });
  const load = Date.now() - t0;
  const rows = await page.locator('tbody tr').count();
  const ltLoad = await longtasks();
  let search = null, sort = null;
  if (route !== '/sales/new') {
    const box = page.locator('input[type="search"]').first();
    const before = await page.locator('tbody tr').count();
    const t1 = Date.now();
    await box.fill('Perf tovar 77');
    await page.waitForFunction((b) => document.querySelectorAll('tbody tr').length !== b, before, { timeout: 5000 }).catch(() => {});
    search = Date.now() - t1;
    await box.fill('');
    await page.waitForTimeout(400);
    const th = page.locator('thead button, thead th[aria-sort] button').first();
    if (await th.count()) {
      const first = await page.locator('tbody tr').first().innerText();
      const t2 = Date.now();
      await th.click();
      await page.waitForFunction((f) => document.querySelector('tbody tr')?.textContent !== f, first, { timeout: 5000 }).catch(() => {});
      sort = Date.now() - t2;
    }
  } else {
    const t1 = Date.now();
    await page.getByRole('combobox').filter({ hasText: /Tovar|товар/ }).first().click().catch(() => {});
    await page.getByRole('option').first().waitFor({ timeout: 5000 }).catch(() => {});
    search = Date.now() - t1;
  }
  const ltAfter = await longtasks();
  console.log(`${route.padEnd(12)} load ${load} ms · rows ${rows} · search ${search ?? '—'} ms · sort ${sort ?? '—'} ms · longtasks load ${ltLoad.n} (max ${ltLoad.max} ms) / interaction ${ltAfter.n} (max ${ltAfter.max} ms)`);
}
await browser.close();
