// Write and publish a platform announcement with Uzbek text only (super-admin session, local API only).
// Usage: UX_EMAIL=superadmin@local.test node e2e/ux/rd-ann.mjs [shot.jpg]
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
await page.goto(BASE + '/uz/admin/announcements', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.getByRole('button', { name: /Yangi e’lon/ }).first().click();
const dlg = page.getByRole('dialog');
await dlg.getByLabel(/Sarlavha \(o‘zbekcha\)/).fill('Yakshanba kuni texnik ishlar');
await dlg.locator('#sa-ann-msg-uz').fill('23:00 dan 01:00 gacha tizim ishlamaydi.');
console.log('preview: ' + JSON.stringify(await dlg.locator('.ann-preview').allInnerTexts()));
if (shot) await page.screenshot({ path: shot });
await dlg.getByRole('button', { name: /Hammaga e’lon qilish/ }).click();
await page.waitForTimeout(1500);
console.log('dialog open after publish: ' + (await page.getByRole('dialog').count()));
console.log('first item: ' + JSON.stringify((await page.locator('article').first().innerText()).slice(0, 160)));
console.log('errors: ' + JSON.stringify(errors));
await browser.close();
