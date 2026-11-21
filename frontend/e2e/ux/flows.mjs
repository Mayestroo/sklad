// Real-flow checks in the browser against the local app (local DB only).
// Usage: node e2e/ux/flows.mjs <flow> [locale] [width]
// Flows: login, sale, receipt, palette, drawer, expense, order, product, delorder, finance, users, crm, prices
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { getAuth } from './auth.mjs';

const [flow = 'sale', locale = 'uz', width = '1440'] = process.argv.slice(2);
const BASE = 'http://localhost:3000';
const OUT = path.resolve('../docs/ux-audit/flows');
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: Number(width), height: Number(width) < 600 ? 844 : 900 }, reducedMotion: 'reduce' });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: BASE }]);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
const shot = (name) => page.screenshot({ path: path.join(OUT, `${flow}-${name}-${locale}-${width}.jpg`), type: 'jpeg', quality: 60, fullPage: false });
const log = (...a) => console.log(`[${flow} ${locale} ${width}]`, ...a);
const isRu = locale === 'ru';

async function signIn() {
    const b = await getAuth(page.request);
  await page.goto(BASE + '/login');
  await page.evaluate((b) => {
    localStorage.setItem('crm_access_token', b.tokens.accessToken);
    localStorage.setItem('crm_refresh_token', b.tokens.refreshToken);
    localStorage.setItem('crm_user', JSON.stringify(b.user));
    if (b.company) localStorage.setItem('crm_company', JSON.stringify(b.company));
  }, b);
}

/** Opens a custom Select by its accessible name and picks the option containing `text`. */
async function pick(comboName, text) {
  const combo = page.getByRole('combobox', { name: comboName }).first();
  await combo.click();
  const search = page.locator('input[placeholder]').filter({ hasNot: page.locator('[disabled]') });
  const opt = page.getByRole('option', { name: new RegExp(text, 'i') }).first();
  if (!(await opt.isVisible().catch(() => false))) {
    await page.keyboard.type(text.slice(0, 5));
  }
  await opt.click();
  void search;
}

try {
  if (flow === 'login') {
    await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
    await shot('1-empty');
    const email = page.locator('input[name=email]');
    log('email focused:', await email.evaluate((el) => el === document.activeElement));
    await page.keyboard.type('admin@orient.uz');
    await page.keyboard.press('Tab');
    await page.keyboard.type('wrong-password');
    await page.keyboard.press('Enter');
    const alert = page.locator('main [role=alert]');
    await alert.waitFor({ timeout: 10000 });
    log('error shown:', (await alert.textContent())?.trim());
    log('password selected+focused:', await page.locator('input[name=password]').evaluate((el) => el === document.activeElement && el.selectionEnd - el.selectionStart === el.value.length));
    await shot('2-error');
    await page.keyboard.type('Admin123!');
    await page.getByRole('button', { name: isRu ? 'Показать пароль' : 'Parolni ko‘rsatish' }).click();
    log('password visible type:', await page.locator('input[name=password]').getAttribute('type'));
    await page.locator('input[name=password]').press('Enter');
    await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 15000 }).catch(() => {});
    await page.getByRole('heading', { level: 1 }).waitFor({ timeout: 15000 });
    log('after login h1:', await page.getByRole('heading', { level: 1 }).first().textContent());
    await shot('3-dashboard');
  }

  if (flow === 'sale') {
    await signIn();
    await page.goto(BASE + '/sales/new', { waitUntil: 'networkidle' });
    await shot('1-new');
    // try to post empty → inline errors
    await page.keyboard.press('Control+Enter');
    await page.getByRole('alert').first().waitFor({ timeout: 8000 });
    log('empty post error:', (await page.getByRole('alert').first().textContent())?.trim());
    await shot('2-validation');
    await pick(isRu ? 'Клиент' : 'Mijoz', 'Baraka');
    await pick(isRu ? 'Выберите товар' : 'Tovarni tanlang', isRu ? 'Сахар' : 'Shakar');
    const qty = page.getByLabel(isRu ? 'Количество для строки 1' : 'Miqdor 1');
    await qty.fill('3');
    await page.waitForTimeout(300);
    log('live total:', (await page.locator('.doc-live-total').textContent().catch(() => 'none'))?.trim());
    await shot('3-filled');
    await page.getByRole('button', { name: isRu ? 'Провести и закрыть' : 'Tasdiqlash va yopish' }).click();
    await page.waitForURL((u) => u.pathname === '/sales', { timeout: 20000 });
    await page.waitForTimeout(500);
    log('toast:', (await page.getByRole('status').filter({ hasText: /tasdiqlandi|проведена/ }).first().textContent().catch(() => 'none'))?.trim());
    await shot('4-posted');
  }

  if (flow === 'receipt') {
    await signIn();
    await page.goto(BASE + '/purchases/new', { waitUntil: 'networkidle' });
    await shot('1-new');
    await pick(isRu ? 'Контрагент' : 'Kontragent', 'Ulgurji');
    const prodCombo = page.getByRole('combobox').filter({ hasText: isRu ? 'Выберите' : 'tanlang' }).last();
    await prodCombo.click();
    await page.getByRole('option', { name: isRu ? /Рис/ : /Guruch/ }).first().click();
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(600);
    log('missing currency marked:', await page.getByText(isRu ? 'Выберите валюту' : 'Valyutani tanlang').count());
    await pick(isRu ? 'Валюта' : 'Valyuta', 'UZS');
    await page.getByLabel(isRu ? 'Количество для строки 1' : 'Miqdor 1').fill('10');
    await page.getByLabel(isRu ? 'Цена за ед. для строки 1' : 'Birlik narxi 1').fill('15000');
    await page.waitForTimeout(300);
    log('live total:', (await page.locator('.doc-live-total').textContent().catch(() => 'none'))?.trim());
    await shot('2-filled');
    await page.keyboard.press('Control+s');
    await page.waitForURL(/\/purchases\/[0-9a-f-]{36}/, { timeout: 20000 });
    log('saved draft url:', new URL(page.url()).pathname);
    await shot('3-saved');
  }

  if (flow === 'palette') {
    await signIn();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox', { name: isRu ? 'Поиск раздела или действия' : 'Sahifa yoki amal qidirish' }).waitFor();
    await page.keyboard.type(isRu ? 'возврат' : 'qaytar');
    await shot('1-search');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    log('navigated to:', new URL(page.url()).pathname);
    await page.keyboard.press('?');
    await page.waitForTimeout(300);
    log('help open:', await page.getByRole('dialog').isVisible().catch(() => false));
    await shot('2-help');
  }

  if (flow === 'drawer') {
    await signIn();
    await page.goto(BASE + '/', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: isRu ? 'Открыть меню' : 'Menyuni ochish' }).click();
    await page.waitForTimeout(300);
    await shot('1-open');
    await page.getByRole('button', { name: isRu ? /^Закупки$/ : /^Xaridlar$/ }).click();
    await page.getByRole('link', { name: isRu ? 'Доп. расходы' : 'Qo‘shimcha xarajatlar' }).click();
    await page.waitForURL(/purchases\/expenses/, { timeout: 15000 });
    await page.waitForTimeout(400);
    log('drawer closed after nav:', !(await page.locator('.app-sidebar.is-open').count()));
    log('overflow:', await page.evaluate(() => document.documentElement.scrollWidth - innerWidth));
    await shot('2-navigated');
  }

  if (flow === 'expense') {
    await signIn();
    await page.goto(BASE + '/purchases/expenses/new', { waitUntil: 'networkidle' });
    await shot('1-new');
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(500);
    log('empty post error:', (await page.locator('main [role=alert]').first().textContent().catch(() => 'none'))?.trim());
    await pick(isRu ? 'Выберите или найдите поставщика' : 'Kontragentni qidiring', 'Toshkent');
    await page.getByLabel(isRu ? 'Сумма расхода' : 'Xarajat summasi').fill('500000');
    await pick(isRu ? 'Валюта' : 'Valyuta', 'UZS');
    await pick(isRu ? 'Выберите или найдите партию' : 'Xarid hujjatini qidiring', 'PUR-2026-0002');
    await page.waitForTimeout(1500);
    await shot('2-filled');
    await page.keyboard.press('Control+Enter');
    await page.waitForURL(/purchases\/expenses\/[0-9a-f-]{36}/, { timeout: 20000 });
    await page.waitForTimeout(800);
    log('posted, url:', new URL(page.url()).pathname);
    await shot('3-posted');
  }

  if (flow === 'order') {
    await signIn();
    await page.goto(BASE + '/sales/orders/new', { waitUntil: 'networkidle' });
    await shot('1-new');
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(500);
    log('empty save error:', (await page.locator('main [role=alert]').first().textContent().catch(() => 'none'))?.trim());
    await pick(isRu ? 'Клиент' : 'Mijoz', 'Oila');
    await pick(isRu ? 'Валюта' : 'Valyuta', 'UZS');
    await pick(isRu ? 'Выберите товар' : 'Tovarni tanlang', isRu ? 'Мука' : 'Un oliy');
    await page.getByLabel(isRu ? 'Количество для строки 1' : 'Miqdor 1').fill('4');
    await page.waitForTimeout(300);
    await shot('2-filled');
    await page.keyboard.press('Control+s');
    await page.waitForURL(/sales\/orders\/[0-9a-f-]{36}/, { timeout: 20000 });
    log('saved order url:', new URL(page.url()).pathname);
    await shot('3-saved');
  }

  if (flow === 'product') {
    await signIn();
    await page.goto(BASE + '/products/new', { waitUntil: 'networkidle' });
    log('name focused:', await page.locator('#prod-name-uz').evaluate((el) => el === document.activeElement));
    await page.keyboard.type(isRu ? 'Тест товар ' + Date.now() % 1000 : 'Test tovar ' + Date.now() % 1000);
    await page.getByRole('button', { name: isRu ? 'Сохранить и добавить ещё' : 'Saqlash va yana qo‘shish' }).click();
    await page.waitForTimeout(1500);
    log('toast:', (await page.locator('.app-toast-region').textContent().catch(() => 'none'))?.trim());
    log('name cleared + focused:', await page.locator('#prod-name-uz').evaluate((el) => el.value === '' && el === document.activeElement));
    log('error:', (await page.locator('main [role=alert]').first().textContent().catch(() => 'none'))?.trim());
    await shot('1-after-save');
  }

  if (flow === 'delorder') {
    await signIn();
    await page.goto(BASE + '/sales/orders', { waitUntil: 'networkidle' });
    const del = page.getByTitle(isRu ? 'Удалить заказ' : "Buyurtmani o'chirish").first();
    const before = await page.getByTitle(isRu ? 'Удалить заказ' : "Buyurtmani o'chirish").count();
    await del.click();
    const dlg = page.getByRole('dialog');
    await dlg.waitFor();
    log('dialog title:', (await dlg.locator('h3').first().textContent())?.trim());
    log('focus inside dialog:', await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')));
    await shot('1-dialog');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    log('closed by Esc:', !(await dlg.isVisible().catch(() => false)));
    await del.click();
    await dlg.waitFor();
    await page.getByRole('button', { name: isRu ? 'Да, удалить' : 'Ha, o‘chirish' }).click();
    await page.waitForTimeout(1500);
    const after = await page.getByTitle(isRu ? 'Удалить заказ' : "Buyurtmani o'chirish").count();
    log('rows with delete before/after:', before, after);
  }

  if (flow === 'finance') {
    await signIn();
    await page.goto(BASE + '/finance', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: isRu ? 'Приход' : 'Kirim qo‘shish' }).first().click();
    await page.getByRole('dialog').waitFor();
    await page.waitForTimeout(400);
    log('focused element:', await page.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName));
    await shot('1-income-drawer');
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(800);
    log('validation:', (await page.getByRole('dialog').locator('[role=alert], div').filter({ hasText: /tanlang|kiriting|Выберите|Укажите|Введите/ }).first().textContent().catch(() => 'none'))?.trim().slice(0, 120));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    log('closed by Esc:', !(await page.getByRole('dialog').isVisible().catch(() => false)));
  }

  if (flow === 'users') {
    await signIn();
    await page.goto(BASE + '/users', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: isRu ? 'Добавить сотрудника' : 'Xodim qo‘shish' }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.waitFor();
    await page.waitForTimeout(200);
    log('dialog title:', (await dlg.locator('h3').first().textContent())?.trim());
    log('focus in first field:', await page.evaluate(() => document.activeElement?.tagName + ' in dialog=' + !!document.activeElement?.closest('[role=dialog]')));
    await shot('1-invite');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    log('closed by Esc:', !(await dlg.isVisible().catch(() => false)));
  }

  if (flow === 'crm') {
    await signIn();
    await page.goto(BASE + '/sales/crm', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: isRu ? 'Новая сделка' : 'Yangi bitim' }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.waitFor();
    await page.waitForTimeout(200);
    log('focus in title field:', await page.evaluate(() => document.activeElement?.tagName));
    await page.keyboard.type('UX test bitim');
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(300);
    log('client required message:', (await dlg.locator('[role=alert]').allTextContents()).join(' | '));
    await shot('1-missing-client');
    await pick(isRu ? 'Клиент' : 'Mijoz', 'Baraka');
    await dlg.getByRole('button', { name: isRu ? 'Создать сделку' : 'Bitim yaratish' }).click();
    await dlg.waitFor({ state: 'hidden', timeout: 10000 });
    const card = page.getByRole('heading', { name: 'UX test bitim' });
    await card.waitFor({ timeout: 10000 });
    log('deal on the board: yes');
    await shot('2-created');
    const cardRoot = card.locator('xpath=ancestor::div[contains(@style,"flex-direction: column")][1]');
    await cardRoot.getByRole('combobox').click();
    await page.getByRole('option', { name: isRu ? 'Переговоры' : 'Muzokara' }).click();
    await page.waitForTimeout(1200);
    const col = page.getByRole('region', { name: isRu ? 'Переговоры' : 'Muzokara' });
    log('moved to negotiation:', await col.getByRole('heading', { name: 'UX test bitim' }).isVisible().catch(() => false));
    await shot('3-moved');
    await page.getByRole('button', { name: isRu ? 'Удалить сделку «UX test bitim»' : '«UX test bitim» bitimini o‘chirish' }).click();
    const confirmDlg = page.getByRole('alertdialog').or(page.getByRole('dialog'));
    await confirmDlg.first().waitFor();
    log('confirm text:', (await confirmDlg.first().textContent())?.replace(/\s+/g, ' ').slice(0, 140));
    await confirmDlg.first().getByRole('button', { name: isRu ? 'Удалить' : 'O‘chirish' }).click();
    await page.waitForTimeout(1200);
    log('deal removed:', !(await page.getByRole('heading', { name: 'UX test bitim' }).isVisible().catch(() => false)));
  }

  if (flow === 'prices') {
    await signIn();
    await page.goto(BASE + '/sales/prices', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: isRu ? 'Новый прайс-лист' : 'Yangi narx jadvali' }).first().click();
    await page.locator('#pl-name-uz').fill('Ulgurji UX');
    await pick(isRu ? 'Валюта' : 'Valyuta', 'UZS');
    await page.getByRole('button', { name: isRu ? 'Создать' : 'Yaratish' }).click();
    await page.getByRole('heading', { name: 'Ulgurji UX' }).waitFor({ timeout: 10000 });
    log('list created and selected: yes');
    await page.getByRole('searchbox').fill('Shakar');
    const edit = page.getByRole('button', { name: new RegExp(isRu ? 'Указать цену: ' : 'Narx kiritish: ') }).first();
    await edit.click();
    await page.keyboard.press('Escape');
    log('Esc cancels inline edit:', await edit.isVisible().catch(() => false));
    await edit.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('250000');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    log('row after save:', (await page.locator('tbody tr').first().textContent())?.replace(/\s+/g, ' ').slice(0, 160));
    await shot('1-priced');
    await page.getByRole('button', { name: isRu ? 'Удалить' : 'O‘chirish' }).first().click();
    const dlg = page.getByRole('alertdialog').or(page.getByRole('dialog')).first();
    await dlg.waitFor();
    log('confirm text:', (await dlg.textContent())?.replace(/\s+/g, ' ').slice(0, 160));
    await dlg.getByRole('button', { name: isRu ? 'Удалить' : 'O‘chirish' }).click();
    await page.waitForTimeout(1200);
    log('list removed:', !(await page.getByRole('heading', { name: 'Ulgurji UX' }).isVisible().catch(() => false)));
  }

  if (flow === 'service') {
    await signIn();
    await page.goto(BASE + '/services', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: isRu ? 'Новый акт оказанных услуг' : 'Ko‘rsatilgan xizmat akti' }).first().click();
    const drawer = page.getByRole('dialog');
    await drawer.waitFor();
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(400);
    log('empty submit message:', (await drawer.locator('[role=alert]').first().textContent().catch(() => ''))?.trim());
    await shot('1-empty-submit');
    await pick(isRu ? 'Клиент' : 'Mijoz', 'Baraka');
    await pick(isRu ? 'Валюта' : 'Valyuta', 'UZS');
    await drawer.getByLabel(isRu ? 'Название услуги *' : 'Xizmat nomi *').fill('UX yetkazib berish');
    await drawer.locator('#service-price-0').fill('150000');
    log('footer total:', (await drawer.getByText(isRu ? 'Итого:' : 'Jami:').first().textContent())?.trim());
    await drawer.getByRole('button', { name: isRu ? 'Сохранить черновик' : 'Qoralamani saqlash' }).click();
    await drawer.waitFor({ state: 'hidden', timeout: 10000 });
    const row = page.locator('tbody tr').first();
    const actNo = (await row.locator('td').first().locator('button').textContent())?.trim();
    log('draft created:', actNo);
    await row.locator('td').first().locator('button').click();
    const dlg = page.getByRole('dialog');
    await dlg.waitFor();
    await shot('2-details-draft');
    await dlg.getByRole('button', { name: isRu ? 'Провести' : 'Tasdiqlash' }).click();
    await page.getByRole('alertdialog').or(page.getByRole('dialog').filter({ hasText: isRu ? 'будет проведён' : 'tasdiqlanadi' })).first().getByRole('button', { name: isRu ? 'Провести' : 'Tasdiqlash' }).click();
    await page.waitForTimeout(1500);
    log('status after post:', (await page.locator('tbody tr').first().textContent())?.replace(/\s+/g, ' ').slice(0, 140));
    await page.locator('tbody tr').first().locator('td').first().locator('button').click();
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button', { name: isRu ? 'Принять оплату' : 'To‘lov qabul qilish' }).click();
    await page.waitForTimeout(800);
    log('payment view title:', (await page.getByRole('dialog').locator('h2, h3').first().textContent())?.trim());
    log('dialogs open:', await page.getByRole('dialog').count());
    await shot('3-payment');
    await page.getByRole('button', { name: isRu ? 'Назад к акту' : 'Aktga qaytish' }).click();
    log('back to details:', await page.getByRole('dialog').getByRole('button', { name: isRu ? 'Печать' : 'Chop etish' }).isVisible());
    await page.getByRole('dialog').getByRole('button', { name: isRu ? 'Удалить' : 'O‘chirish' }).first().click();
    const conf = page.getByRole('alertdialog').or(page.getByRole('dialog').filter({ hasText: isRu ? 'отменён' : 'bekor qilinadi' })).first();
    await conf.waitFor();
    await conf.getByRole('button', { name: isRu ? 'Удалить' : 'O‘chirish' }).click();
    await page.waitForTimeout(1500);
    log('act removed:', !(await page.getByText(actNo || '???', { exact: true }).isVisible().catch(() => false)));
  }
} catch (e) {
  log('FAILED:', String(e).split('\n')[0]);
  await shot('zz-failure');
  process.exitCode = 1;
}
const real = errors.filter((e) => !/React DevTools|Download the/.test(e));
log('console errors:', real.length ? real : 'none');
await browser.close();
