// Open a route signed in, click a selector (nth), confirm a dialog if one opens,
// then print the text of a check selector. Usage:
// node e2e/ux/rd-click.mjs <route> <clickSelector> <checkSelector> [nth=0] [locale=uz] [shot.jpg]
import { chromium } from '@playwright/test';
import { getAuth } from './auth.mjs';

const [route, clickSel, checkSel, nthArg = '0', locale = 'uz', shot] = process.argv.slice(2);
const BASE = 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: BASE }]);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
const b = await getAuth(page.request);
await page.goto(BASE + '/login');
await page.evaluate((b) => {
  localStorage.setItem('crm_access_token', b.tokens.accessToken);
  localStorage.setItem('crm_refresh_token', b.tokens.refreshToken);
  localStorage.setItem('crm_user', JSON.stringify(b.user));
  if (b.company) localStorage.setItem('crm_company', JSON.stringify(b.company));
}, b);
await page.goto(BASE + '/' + locale + route, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
console.log('before: ' + JSON.stringify((await page.locator(checkSel).allInnerTexts()).slice(0, 6)));
await page.locator(clickSel).nth(Number(nthArg)).click();
await page.waitForTimeout(500);
const dialog = page.locator('[role="alertdialog"], [role="dialog"]');
if (await dialog.count() && process.env.NOCONFIRM !== '1') {
  const btns = dialog.last().locator('button');
  const n = await btns.count();
  console.log('dialog: ' + JSON.stringify((await dialog.last().innerText()).slice(0, 160)));
  if (shot) await page.screenshot({ path: shot.replace('.jpg', '-dialog.jpg'), type: 'jpeg', quality: 60 });
  await btns.nth(n - 1).click();
}
await page.waitForTimeout(1800);
if (process.env.NOCONFIRM === '1') console.log('dialog text: ' + JSON.stringify((await page.locator('[role="dialog"]').last().innerText().catch(() => '')).slice(0, 200)));
console.log('after: ' + JSON.stringify((await page.locator(checkSel).allInnerTexts()).slice(0, 6)));
if (shot) await page.screenshot({ path: shot, type: 'jpeg', quality: 60 });
console.log('errors: ' + JSON.stringify(errors.slice(0, 3)));
await browser.close();
