// Exercise the shared FilterBar (and look at StatCards) on one list page, local API only.
// Usage: node e2e/ux/fc-verify.mjs <route> <outDir> [--locales=uz,ru] [--steps=all|basic]
// Steps: search → URL q + chip; segmented status; first dropdown by keyboard; period preset; custom
// range on the calendar; Esc closes; reload keeps URL view; Back from another page keeps it; a fresh
// visit restores the remembered view; clear all; phone sheet (apply, badge, clear). Screens per step.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { getAuth } from './auth.mjs';

const route = process.argv[2];
const outDir = path.resolve(process.argv[3]);
const args = Object.fromEntries(process.argv.slice(4).map((a) => a.replace(/^--/, '').split('=')));
const locales = (args.locales || 'uz,ru').split(',');
const BASE = process.env.UX_BASE || 'http://localhost:3000';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const auth = await getAuth((await (await browser.newContext()).newPage()).request);
const results = [];
const log = (locale, width, step, ok, note = '') => {
  results.push({ locale, width, step, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${locale} ${width} ${step}${note ? ' — ' + note : ''}`);
};

async function ctxFor(locale, width) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, reducedMotion: 'reduce' });
  await ctx.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: BASE }]);
  await ctx.addInitScript((b) => {
    if (localStorage.getItem('crm_access_token')) return;
    localStorage.setItem('crm_access_token', b.tokens.accessToken);
    localStorage.setItem('crm_refresh_token', b.tokens.refreshToken);
    localStorage.setItem('crm_user', JSON.stringify(b.user));
    if (b.company) localStorage.setItem('crm_company', JSON.stringify(b.company));
  }, auth);
  return ctx;
}
const settle = async (page) => {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(500);
};
const shot = (page, name) => page.screenshot({ path: path.join(outDir, `${name}.jpg`), type: 'jpeg', quality: 72, fullPage: false });
const qs = (page) => new URL(page.url()).search;
const chips = (page) => page.locator('.fb-chip').count();

for (const locale of locales) {
  // ── Desktop ──
  {
    const width = 1440;
    const ctx = await ctxFor(locale, width);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${BASE}${route}`);
    await settle(page);
    // start clean
    if (await page.locator('.fb-clear').count()) {
      await page.locator('.fb-clear').click();
      await settle(page);
    }
    await shot(page, `${locale}-1440-1-default`);
    log(locale, width, 'toolbar present', (await page.locator('.fb').count()) > 0);
    const statCards = await page.locator('.stat-card').count();
    if (statCards) {
      const clickable = await page.locator('.stat-card button, .stat-card a, button.stat-card, a.stat-card').count();
      log(locale, width, `stat cards (${statCards}) not clickable`, clickable === 0);
    }

    // Search + "/" shortcut
    const search = page.locator('.fb-search input');
    if (await search.count()) {
      await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
      await page.keyboard.press('/');
      const focused = await search.evaluate((el) => el === document.activeElement);
      log(locale, width, '"/" focuses search', focused);
      await search.fill('a');
      await page.waitForTimeout(900);
      log(locale, width, 'search → URL q + chip', qs(page).includes('q=a') && (await chips(page)) >= 1, qs(page));
      await page.locator('.fb-search button').first().click(); // clear button
      await page.waitForTimeout(700);
      log(locale, width, 'search clear button', (await search.inputValue()) === '' && !qs(page).includes('q='));
    }

    // Segmented
    const seg = page.locator('.fb .fb-seg').first(); // the filter bar's, not a view switch
    if (await seg.count()) {
      await seg.locator('.fb-seg-item').nth(1).click();
      await settle(page);
      const checked = await seg.locator('[aria-checked="true"]').innerText();
      log(locale, width, 'segmented chooses', qs(page).length > 1 && (await chips(page)) >= 1, `${checked} ${qs(page)}`);
      await seg.locator('[aria-checked="true"]').press('ArrowRight');
      await settle(page);
      log(locale, width, 'segmented arrow key', (await seg.locator('[aria-checked="true"]').innerText()) !== checked);
      await seg.locator('.fb-seg-item').first().click();
      await settle(page);
    }

    // First dropdown via keyboard
    const dd = page.locator('.fb-controls > .fb-pop-wrap > button[aria-haspopup="listbox"]').first();
    if (await dd.count()) {
      await dd.focus();
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(250);
      const listOpen = await page.locator('[role="listbox"]').count();
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      const closed = (await page.locator('[role="listbox"]').count()) === 0;
      const back = await dd.evaluate((el) => el === document.activeElement);
      log(locale, width, 'dropdown opens by key, Esc closes, focus returns', listOpen > 0 && closed && back);
      await dd.click();
      await page.waitForTimeout(250);
      const opts = page.locator('[role="listbox"] [role="option"]');
      const n = await opts.count();
      if (n > 1) {
        await opts.nth(1).click();
        await settle(page);
        const label = await dd.innerText();
        log(locale, width, 'dropdown shows value', label.includes(':'), label.replace(/\s+/g, ' '));
      }
    }

    // Period preset + custom range
    const per = page.locator('.fb-controls button[aria-haspopup="dialog"]').first();
    if (await per.count()) {
      await per.click();
      await page.waitForTimeout(300);
      await shot(page, `${locale}-1440-2-period-open`);
      await page.locator('.fb-pop-period .fb-preset').nth(3).click(); // this month
      await settle(page);
      log(locale, width, 'period preset', qs(page).includes('period=this_month'), qs(page));
      await per.click();
      await page.waitForTimeout(300);
      const days = page.locator('.fb-pop-period .fb-cal-day');
      await days.nth(0).click();
      await days.nth(9).click();
      await settle(page);
      log(locale, width, 'custom range on calendar', /period=\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}/.test(qs(page)), qs(page));
      // keyboard in calendar
      await per.click();
      await page.waitForTimeout(300);
      await page.locator('.fb-pop-period .fb-cal-day[tabindex="0"]').focus();
      await page.keyboard.press('ArrowRight');
      const moved = await page.evaluate(() => document.activeElement?.getAttribute('data-day'));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(150);
      log(locale, width, 'calendar arrow keys + Esc', Boolean(moved) && (await page.locator('.fb-pop-period').count()) === 0, String(moved));
    }

    const viewQs = qs(page);
    const chipCount = await chips(page);
    await shot(page, `${locale}-1440-3-filtered`);
    log(locale, width, 'result count shown', (await page.locator('.fb-results').count()) > 0 || chipCount === 0);

    // Reload keeps URL view
    await page.reload();
    await settle(page);
    log(locale, width, 'reload keeps view', qs(page) === viewQs && (await chips(page)) === chipCount, qs(page));

    // Back from another page
    await page.goto(`${BASE}/`);
    await settle(page);
    await page.goBack();
    await settle(page);
    log(locale, width, 'Back keeps view', qs(page) === viewQs && (await chips(page)) === chipCount, qs(page));

    // Fresh visit restores remembered view
    await page.goto(`${BASE}${route}`);
    await settle(page);
    const restored = qs(page);
    log(locale, width, 'fresh visit restores remembered view', chipCount === 0 || (restored.length > 1 && (await chips(page)) > 0), restored);

    // Clear all
    if (await page.locator('.fb-clear').count()) {
      await page.locator('.fb-clear').click();
      await settle(page);
      log(locale, width, 'clear all', (await chips(page)) === 0 && !/[?&](status|period|paymentStatus)=/.test(qs(page)), qs(page));
    }
    log(locale, width, 'no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ── Phone ──
  {
    const width = 390;
    const ctx = await ctxFor(locale, width);
    const page = await ctx.newPage();
    await page.goto(`${BASE}${route}`);
    await settle(page);
    await shot(page, `${locale}-390-1-default`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    log(locale, width, 'no horizontal page scroll', overflow <= 1, String(overflow));
    if (await page.locator('.fb-search input').count()) log(locale, width, 'search visible', await page.locator('.fb-search input').isVisible());
    log(locale, width, 'desktop filters hidden', (await page.locator('.fb-controls').count()) === 0 || !(await page.locator('.fb-controls').isVisible()));
    const btn = page.locator('.fb-mobile-only');
    if (await btn.count()) {
      await btn.click();
      await page.waitForTimeout(300);
      const sheet = page.locator('.fb-sheet');
      log(locale, width, 'sheet opens', await sheet.isVisible());
      await shot(page, `${locale}-390-2-sheet`);
      const radios = sheet.locator('.fb-sheet-option input');
      if ((await radios.count()) > 1) await radios.nth(1).check();
      else await sheet.locator('.fb-preset').nth(3).click();
      await sheet.locator('.fb-sheet-btn.is-primary').click();
      await settle(page);
      const badge = await page.locator('.fb-mobile-only .fb-badge').count();
      log(locale, width, 'apply → badge + chip', badge > 0 && (await chips(page)) > 0, qs(page));
      await shot(page, `${locale}-390-3-applied`);
      await btn.click();
      await page.waitForTimeout(200);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
      log(locale, width, 'Esc closes sheet', (await page.locator('.fb-sheet').count()) === 0);
      await btn.click();
      await page.waitForTimeout(200);
      await page.locator('.fb-sheet-btn').first().click();
      await page.locator('.fb-sheet-btn.is-primary').click();
      await settle(page);
      log(locale, width, 'sheet clear + apply', (await page.locator('.fb-mobile-only .fb-badge').count()) === 0);
    }
    await ctx.close();
  }
}
await browser.close();
fs.writeFileSync(path.join(outDir, 'verify.json'), JSON.stringify(results, null, 1));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
