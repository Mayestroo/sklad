// Screenshot an arbitrary URL path (public or authed) at widths/locales: node shot-one.mjs <outDir> <name> <path> [authed=1] [widths] [locales]
import { chromium } from '@playwright/test';
import path from 'node:path'; import fs from 'node:fs';
import { getAuth } from './auth.mjs';
const [outDir, name, route, authed = '1', widthsArg = '1440,390', locArg = 'uz'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const BASE = 'http://localhost:3000';
const browser = await chromium.launch();
for (const locale of locArg.split(',')) for (const width of widthsArg.split(',').map(Number)) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, reducedMotion: 'reduce' });
  await ctx.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: BASE }]);
  const page = await ctx.newPage();
  if (authed === '1') {
    const b = await getAuth(page.request);
    await page.goto(BASE + '/login');
    await page.evaluate((b) => { localStorage.setItem('crm_access_token', b.tokens.accessToken); localStorage.setItem('crm_refresh_token', b.tokens.refreshToken); localStorage.setItem('crm_user', JSON.stringify(b.user)); if (b.company) localStorage.setItem('crm_company', JSON.stringify(b.company)); }, b);
  }
  await page.goto(BASE + '/' + locale + route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  await page.screenshot({ path: path.join(outDir, `${name}-${locale}-${width}.jpg`), fullPage: true, type: 'jpeg', quality: 60 });
  console.log(name, locale, width, 'overflow', ov);
  await ctx.close();
}
await browser.close();
