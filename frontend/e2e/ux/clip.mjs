// Screenshot of the top of a route (viewport only). Usage: node e2e/ux/clip.mjs /route width locale out.png
import { chromium } from '@playwright/test';
import { getAuth, applyAuth } from './auth.mjs';
const [route = '/', width = '390', locale = 'uz', out = 'clip.png'] = process.argv.slice(2);
const BASE = 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: Number(width), height: 700 } });
const theme = process.argv[6] || 'light';
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: BASE }]);
const page = await ctx.newPage();
const b = await getAuth(page.request);
await page.goto(BASE + '/login');
await applyAuth(page, b);
if (theme === 'dark') await page.evaluate(() => localStorage.setItem('crm_theme', 'dark'));
await page.goto(BASE + route, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.screenshot({ path: out });
await browser.close();
