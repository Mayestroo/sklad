// Prints colour-contrast failures (fg/bg/ratio/text) for one route — helps find the offending token.
// Usage: node e2e/ux/axe-detail.mjs /route [locale] [theme]
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { getAuth } from './auth.mjs';
const [route = '/', locale = 'uz', theme = 'light'] = process.argv.slice(2);
const BASE = 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme === 'dark' ? 'dark' : 'light' });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: BASE }]);
const page = await ctx.newPage();
const b = await getAuth(page.request);
await page.goto(BASE + '/login');
await page.evaluate(([b, theme]) => {
  localStorage.setItem('crm_access_token', b.tokens.accessToken);
  localStorage.setItem('crm_refresh_token', b.tokens.refreshToken);
  localStorage.setItem('crm_user', JSON.stringify(b.user));
  if (b.company) localStorage.setItem('crm_company', JSON.stringify(b.company));
  if (theme === 'dark') localStorage.setItem('theme', 'dark');
}, [b, theme]);
await page.goto(BASE + route, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
const groups = new Map();
for (const v of res.violations) {
  for (const n of v.nodes) {
    const d = n.any?.[0]?.data || {};
    const key = v.id === 'color-contrast' ? `${d.fgColor} on ${d.bgColor} (${d.contrastRatio})` : v.id;
    const g = groups.get(key) || { n: 0, sample: '' };
    g.n++;
    if (!g.sample) g.sample = (n.html || '').slice(0, 140);
    groups.set(key, g);
  }
}
for (const [k, g] of [...groups].sort((a, b) => b[1].n - a[1].n)) console.log(`${g.n}x ${k}\n    ${g.sample}`);
await browser.close();
