// Screenshot the FilterBar of one route and report how many rows it takes. Local API only.
// Usage: node e2e/ux/fb-shot.mjs <route> <outFile.jpg> [width] [locale]
import { chromium } from '@playwright/test';
import { getAuth } from './auth.mjs';
const [route, out, w = '1440', locale = 'uz'] = process.argv.slice(2);
const BASE = process.env.UX_BASE || 'http://localhost:3000';
const browser = await chromium.launch();
const auth = await getAuth((await (await browser.newContext()).newPage()).request);
const ctx = await browser.newContext({ viewport: { width: Number(w), height: 900 } });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: BASE }]);
await ctx.addInitScript((b) => {
  localStorage.setItem('crm_access_token', b.tokens.accessToken);
  localStorage.setItem('crm_refresh_token', b.tokens.refreshToken);
  localStorage.setItem('crm_user', JSON.stringify(b.user));
  if (b.company) localStorage.setItem('crm_company', JSON.stringify(b.company));
}, auth);
const page = await ctx.newPage();
await page.goto(`${BASE}${route}`);
await page.waitForLoadState('networkidle').catch(() => {});
await page.waitForTimeout(800);
const info = await page.evaluate(() => {
  const row = document.querySelector('.fb-row');
  if (!row) return null;
  const tops = new Set([...row.querySelectorAll(':scope > *, .fb-controls > *')].filter((e) => e.offsetParent).map((e) => Math.round(e.getBoundingClientRect().top)));
  return { rowWidth: Math.round(row.getBoundingClientRect().width), lines: tops.size, scrollW: document.documentElement.scrollWidth };
});
console.log(JSON.stringify(info));
await page.screenshot({ path: out, type: 'jpeg', quality: 75 });
await browser.close();
