// Dialog behaviour in the real app (local API only): pinned footer, Esc/backdrop/✕ close when clean,
// discard prompt after an edit, drag-out does not close, focus trap + restore, confirm dialog focus.
// Usage: node e2e/ux/modal-verify.mjs <outDir>
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { getAuth } from './auth.mjs';

const outDir = path.resolve(process.argv[2] || '.');
fs.mkdirSync(outDir, { recursive: true });
const BASE = process.env.UX_BASE || 'http://localhost:3000';
const browser = await chromium.launch();
const auth = await getAuth((await (await browser.newContext()).newPage()).request);
let fails = 0;
const log = (ok, step, note = '') => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${note ? ' — ' + note : ''}`); };
const DLG = '[role="dialog"][aria-modal="true"]';

async function newPage(locale, theme = 'light', viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce', colorScheme: theme });
  await ctx.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: BASE }]);
  await ctx.addInitScript(([b, t]) => {
    localStorage.setItem('crm_theme', t);
    if (localStorage.getItem('crm_access_token')) return;
    localStorage.setItem('crm_access_token', b.tokens.accessToken);
    localStorage.setItem('crm_refresh_token', b.tokens.refreshToken);
    localStorage.setItem('crm_user', JSON.stringify(b.user));
    if (b.company) localStorage.setItem('crm_company', JSON.stringify(b.company));
  }, [auth, theme]);
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e)));
  return page;
}
async function go(page, url) {
  await page.goto(BASE + url);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(400);
}
const open = (page) => page.locator(DLG).count();
const shot = (page, name) => page.screenshot({ path: path.join(outDir, name + '.jpg'), type: 'jpeg', quality: 72 });

/** Opens with `opener`, runs the standard checks on the dialog it opens. */
async function checkDialog(page, tag, opener, { field, isRu }) {
  const discardText = isRu ? 'Закрыть без сохранения?' : 'Saqlamasdan yopilsinmi?';
  await opener.click();
  await page.waitForTimeout(500);
  const dlg = page.locator(DLG).last();
  if (!(await dlg.count())) { log(false, `${tag} opens`); return; }
  log(true, `${tag} opens`);
  await shot(page, tag + '-open');
  // focus inside
  const inside = await page.evaluate((sel) => !!document.querySelector(sel)?.contains(document.activeElement), DLG);
  log(inside, `${tag} focus moves into the dialog`);
  // Tab wraps inside
  for (let i = 0; i < 40; i++) await page.keyboard.press('Tab');
  log(await page.evaluate((sel) => [...document.querySelectorAll(sel)].at(-1)?.contains(document.activeElement), DLG), `${tag} Tab stays inside`);
  // background does not scroll
  log(await page.evaluate(() => getComputedStyle(document.body).overflow === 'hidden' || getComputedStyle(document.documentElement).overflow === 'hidden'), `${tag} page scroll locked`);
  // footer pinned and visible
  const footer = dlg.locator('.dlg-footer');
  if (await footer.count()) {
    const fb = await footer.first().boundingBox();
    const vh = page.viewportSize().height;
    log(!!fb && fb.y + fb.height <= vh + 1 && fb.y > 0, `${tag} footer visible in viewport`, fb ? `y=${Math.round(fb.y)} h=${Math.round(fb.height)} vh=${vh}` : 'no box');
  } else log(false, `${tag} has footer`);
  // Esc closes when clean, focus back on opener
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  log((await open(page)) === 0, `${tag} Esc closes when clean`);
  log(await opener.evaluate((el) => el === document.activeElement || el.contains(document.activeElement)), `${tag} focus returns to opener`);
  // edit then Esc → discard prompt
  await opener.click();
  await page.waitForTimeout(500);
  const input = page.locator(DLG).last().locator(field).first();
  await input.click();
  await input.fill('UX test');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  const prompt = page.locator(DLG).last().getByText(discardText);
  log((await open(page)) > 0 && (await prompt.count()) > 0, `${tag} Esc after edit asks to discard`);
  await shot(page, tag + '-discard');
  // keep editing
  await page.locator(DLG).last().getByRole('button', { name: isRu ? 'Продолжить' : 'Davom etish' }).click();
  await page.waitForTimeout(200);
  log((await prompt.count()) === 0 && (await input.inputValue()) === 'UX test', `${tag} "keep editing" keeps the value`);
  // drag from inside to backdrop does not close
  const box = await input.boundingBox();
  await page.mouse.move(box.x + 5, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(5, 5, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  log((await open(page)) > 0 && (await prompt.count()) === 0, `${tag} drag out of the dialog does not close or ask`);
  // backdrop click → prompt, then discard closes
  await page.mouse.click(5, 5);
  await page.waitForTimeout(300);
  log((await prompt.count()) > 0, `${tag} backdrop click after edit asks`);
  await page.locator(DLG).last().getByRole('button', { name: isRu ? 'Закрыть' : 'Yopish', exact: true }).last().click();
  await page.waitForTimeout(400);
  log((await open(page)) === 0, `${tag} "close" discards`);
}

for (const locale of ['uz', 'ru']) {
  const isRu = locale === 'ru';
  const page = await newPage(locale);
  // 1. Counterparties: create dialog
  await go(page, `/${locale}/counterparties`);
  await checkDialog(page, `${locale}-counterparty`, page.getByRole('button', { name: isRu ? 'Новый контрагент' : 'Yangi kontragent' }).first(), { field: 'input:not([type=search]):not([type=checkbox]):not([type=radio])', isRu });
  // 2. Users: create dialog
  await go(page, `/${locale}/users`);
  const addUser = page.getByRole('button', { name: isRu ? 'Добавить сотрудника' : 'Xodim qo‘shish' }).first();
  if (await addUser.count()) await checkDialog(page, `${locale}-user`, addUser, { field: 'input[type=text], input[type=email], input:not([type])', isRu });
  else log(false, `${locale}-user opener found`);
  // 3. Finance: operation drawer
  await go(page, `/${locale}/finance`);
  const fin = page.getByRole('button', { name: isRu ? /^Приход|Доход/ : /^Kirim/ }).first();
  if (await fin.count()) await checkDialog(page, `${locale}-finance`, fin, { field: isRu ? 'input[placeholder="Примечание..."]' : 'input[placeholder="Izoh..."]', isRu });
  else log(false, `${locale}-finance opener found`);
  log(page.errors.length === 0, `${locale} no page errors`, page.errors.slice(0, 3).join(' | '));
  await page.context().close();
}

// 4. Tall form at a short viewport: footer still pinned (inventory document create).
{
  const page = await newPage('uz', 'light', { width: 1280, height: 640 });
  await go(page, '/uz/inventory/documents');
  const btn = page.locator('.task-tile').first();
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(600);
    const f = page.locator(DLG).last().locator('.app-modal-footer');
    const fb = await f.boundingBox().catch(() => null);
    log(!!fb && fb.y + fb.height <= 641, 'invdoc footer pinned at 640px height', fb ? `bottom=${Math.round(fb.y + fb.height)}` : 'no footer');
    await shot(page, 'invdoc-640');
  } else log(false, 'invdoc opener found');
  await page.context().close();
}

// 5. Dark theme screenshots of a dialog and the discard prompt.
{
  const page = await newPage('uz', 'dark');
  await go(page, '/uz/counterparties');
  await page.getByRole('button', { name: 'Yangi kontragent' }).first().click();
  await page.waitForTimeout(500);
  await shot(page, 'dark-counterparty');
  const input = page.locator(DLG).last().locator('input:not([type=search]):not([type=checkbox]):not([type=radio])').first();
  await input.fill('x');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await shot(page, 'dark-discard');
  await page.context().close();
}

// 6. axe on open dialogs (dialog, discard prompt, confirm) in both themes, and the delete confirm:
//    focus starts on Cancel, Enter there cancels (no DELETE request), Esc closes.
for (const theme of ['light', 'dark']) {
  const page = await newPage('uz', theme);
  const axe = async (tag) => {
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).include('[role="dialog"], [role="alertdialog"]').analyze();
    log(r.violations.length === 0, `${theme} axe ${tag}`, r.violations.map((v) => `${v.id}×${v.nodes.length}`).join(', '));
  };
  await go(page, '/uz/users');
  await page.getByRole('button', { name: 'Xodim qo‘shish' }).first().click();
  await page.waitForTimeout(500);
  await axe('user modal');
  await page.locator(DLG).last().locator('input').first().fill('x');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await axe('discard prompt');
  await page.getByRole('button', { name: 'Yopish', exact: true }).last().click();

  await go(page, '/uz/sales/customers');
  const deletes = [];
  page.on('request', (r) => { if (r.method() === 'DELETE') deletes.push(r.url()); });
  const more = page.locator('button.ux-menu-trigger').first();
  if (await more.count()) {
    await more.click();
    await page.waitForTimeout(250);
    await page.getByRole('menuitem', { name: /O.chirish/ }).first().click();
    await page.waitForTimeout(400);
    const ad = page.locator('[role="alertdialog"]');
    log((await ad.count()) === 1, `${theme} delete asks in a confirm dialog`);
    log(await page.evaluate(() => document.activeElement?.textContent?.trim() === 'Bekor qilish'), `${theme} confirm focus starts on Cancel`);
    await shot(page, `${theme}-confirm`);
    await axe('confirm dialog');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    log((await ad.count()) === 0 && deletes.length === 0, `${theme} Enter on Cancel cancels (no DELETE)`);
    await more.click();
    await page.waitForTimeout(250);
    await page.getByRole('menuitem', { name: /O.chirish/ }).first().click();
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    log((await ad.count()) === 0 && deletes.length === 0, `${theme} Esc closes the confirm`);
  } else log(false, `${theme} customer row menu found`);
  await page.context().close();
}

// 7. Recipe dialog (and every footer Cancel): after an edit Cancel asks once, inside the dialog — no second
//    confirmation on top; "close" then really closes.
for (const locale of ['uz', 'ru']) {
  const isRu = locale === 'ru';
  const page = await newPage(locale);
  await go(page, `/${locale}/production?tab=recipes`);
  const open = page.getByRole('button', { name: isRu ? 'Новая рецептура' : 'Yangi retseptura' }).first();
  if (!(await open.count())) { log(false, `${locale} recipe opener found`); await page.context().close(); continue; }
  await open.click();
  await page.waitForTimeout(500);
  await page.locator('#recipe-note').fill('UX');
  await page.locator(DLG).last().getByRole('button', { name: isRu ? 'Отмена' : 'Bekor qilish', exact: true }).click();
  await page.waitForTimeout(400);
  const prompts = await page.locator('.app-dialog-discard').count();
  const alerts = await page.locator('[role="alertdialog"]').count();
  log(prompts === 1 && alerts === 0, `${locale} recipe Cancel after edit asks once, no second dialog`, `prompt=${prompts} alertdialog=${alerts}`);
  await page.locator('.app-dialog-discard').getByRole('button', { name: isRu ? 'Закрыть' : 'Yopish', exact: true }).click();
  await page.waitForTimeout(400);
  log((await page.locator(DLG).count()) === 0 && (await page.locator('[role="alertdialog"]').count()) === 0, `${locale} recipe "close" closes at once`);
  await page.context().close();
}

console.log(fails ? `\n${fails} FAILED` : '\nALL PASS');
await browser.close();
process.exit(fails ? 1 : 0);
