// Answer the first waiting support ticket from the platform inbox (super-admin session, local API only).
// Usage: UX_EMAIL=superadmin@local.test node e2e/ux/rd-reply.mjs [shot.jpg]
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
await page.goto(BASE + '/uz/admin/tickets', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const chips = async () => (await page.locator('.tk-list [role="group"] button, .tk-list .rd-chip').allInnerTexts()).join(' | ');
console.log('chips before: ' + (await chips()));
await page.locator('#sa-ticket-reply-text').fill('Rahmat, tekshirdik: brauzerda qalqib chiquvchi oynalarga ruxsat bering.');
await page.keyboard.press('Control+Enter');
await page.waitForTimeout(1500);
console.log('chips after: ' + (await chips()));
console.log('thread: ' + JSON.stringify((await page.locator('.tk-msg').allInnerTexts()).slice(-1)));
console.log('list: ' + JSON.stringify(await page.locator('.tk-list').innerText()));
if (shot) await page.screenshot({ path: shot });
console.log('errors: ' + JSON.stringify(errors));
await browser.close();
