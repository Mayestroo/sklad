// UX verification harness: logs in to the locally running app, opens routes at
// several widths and locales, saves JPEG screenshots and a JSON report with
// console errors, horizontal overflow and (optionally) axe violations.
//
// Usage: node e2e/ux/shots.mjs <label> [--routes=/,/sales] [--widths=1440,1280,390]
//        [--locales=uz,ru] [--axe] [--out=docs/ux-audit/screens]
// Needs the app on http://localhost:3000 and the API on :3001 (local DB only).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(3).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const label = process.argv[2] || 'run';
const BASE = process.env.UX_BASE || 'http://localhost:3000';
const EMAIL = process.env.UX_EMAIL || 'admin@orient.uz';
const PASSWORD = process.env.UX_PASSWORD || 'Admin123!';
const ALL_ROUTES = [
  '/login', '/register', '/', '/sales', '/sales/new', '/sales/orders', '/sales/orders/new',
  '/sales/returns', '/sales/prices', '/sales/customers', '/sales/crm', '/purchases',
  '/purchases/new', '/purchases/expenses', '/purchases/expenses/new', '/purchases/returns',
  '/purchases/returns/new', '/purchases/suppliers', '/products', '/products/new', '/inventory',
  '/inventory/documents', '/inventory/transfers', '/counterparties', '/finance', '/services',
  '/production', '/opening-balances', '/accounting', '/accounting/accounts',
  '/accounting/journal', '/accounting/reports', '/analytics', '/users', '/settings/branches',
  '/settings/sales', '/settings/billing', '/settings/security', '/settings/production',
];
const routes = args.routes ? String(args.routes).split(',') : ALL_ROUTES;
const widths = String(args.widths || '1440,1280,390').split(',').map(Number);
const locales = String(args.locales || 'uz,ru').split(',');
const outDir = path.resolve(String(args.out || 'docs/ux-audit/screens'), label);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const report = [];
let AxeBuilder = null;
if (args.axe) AxeBuilder = (await import('@axe-core/playwright')).default;

async function newContext(locale, width) {
  const ctx = await browser.newContext({
    viewport: { width, height: width < 600 ? 844 : 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  await ctx.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: BASE }]);
  return ctx;
}

async function loginState() {
  const ctx = await newContext('uz', 1440);
  const page = await ctx.newPage();
  const r = await page.request.post('http://localhost:3001/api/auth/login', {
    data: { email: EMAIL, password: PASSWORD },
  });
  const body = await r.json();
  await page.goto(BASE + '/login');
  await page.evaluate((b) => {
    localStorage.setItem('crm_access_token', b.tokens.accessToken);
    localStorage.setItem('crm_refresh_token', b.tokens.refreshToken);
    localStorage.setItem('crm_user', JSON.stringify(b.user));
    if (b.company) localStorage.setItem('crm_company', JSON.stringify(b.company));
  }, body);
  const state = await ctx.storageState();
  await ctx.close();
  return state;
}

const state = await loginState();
for (const locale of locales) {
  for (const width of widths) {
    const ctx = await newContext(locale, width);
    for (const route of routes) {
      const authed = !['/login', '/register'].includes(route);
      if (authed) {
        await ctx.addInitScript((s) => {
          for (const o of s.origins) for (const it of o.localStorage) localStorage.setItem(it.name, it.value);
        }, state);
      }
      const page = await ctx.newPage();
      const errors = [];
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)); });
      page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 300)));
      const t0 = Date.now();
      try {
        await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 60000 });
      } catch (e) { errors.push('goto: ' + String(e).slice(0, 200)); }
      await page.waitForTimeout(400);
      const loadMs = Date.now() - t0;
      const metrics = await page.evaluate(() => ({
        overflowX: document.documentElement.scrollWidth - window.innerWidth,
        url: location.pathname,
        h1: [...document.querySelectorAll('h1')].map((h) => h.textContent?.trim()).slice(0, 3),
      }));
      const name = (route === '/' ? 'dashboard' : route.slice(1).replace(/\//g, '_')) + `-${locale}-${width}.jpg`;
      await page.screenshot({ path: path.join(outDir, name), fullPage: true, type: 'jpeg', quality: 60 });
      let axe;
      if (AxeBuilder && width === widths[0]) {
        try {
          const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
          axe = res.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0]?.target?.join(' ') }));
        } catch (e) { axe = 'axe failed: ' + String(e).slice(0, 100); }
      }
      report.push({ route, locale, width, loadMs, ...metrics, errors: errors.slice(0, 5), axe, shot: path.relative(process.cwd(), path.join(outDir, name)) });
      process.stdout.write(`${locale} ${width} ${route} ${loadMs}ms overflow=${metrics.overflowX} err=${errors.length}${axe ? ' axe=' + (Array.isArray(axe) ? axe.length : axe) : ''}\n`);
      await page.close();
    }
    await ctx.close();
  }
}
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
await browser.close();
