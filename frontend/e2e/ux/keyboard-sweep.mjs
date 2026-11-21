// Keyboard-only check: from the top of each page press Tab (up to 80 times) and record
// - whether every focused element shows a visible focus indicator (outline / box-shadow / border change),
// - how many Tabs it takes to reach the page's main control (matched by text or selector),
// - whether focus ever gets stuck (same element twice in a row).
// Usage: node e2e/ux/keyboard-sweep.mjs [UX_EMAIL=superadmin@local.test for admin pages]
import { chromium } from '@playwright/test';
import { getAuth, applyAuth } from './auth.mjs';

const BASE = 'http://localhost:3000';
const ADMIN = process.env.UX_EMAIL === 'superadmin@local.test';
const PAGES = ADMIN
  ? [['/admin/tickets', /Javob kutmoqda/], ['/admin', /Yangi korxona/]]
  : [
      ['/', /Yangi sotuv|Sotuv/],
      ['/sales', /Yangi sotuv/],
      ['/sales/new', /Mijoz|mijoz/],
      ['/purchases', /Yangi kirim|Kirim/],
      ['/products', /Yangi tovar|tovar qo/],
      ['/inventory/transfers', /Yangi|ko‘chirish/],
      ['/finance', /Kirim qo‘shish/],
      ['/settings/sales', /Ko'p darajali|narx/],
      ['/users', /Xodim qo‘shish/],
    ];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: 'uz', url: BASE }]);
const page = await ctx.newPage();
const b = await getAuth(page.request);
await page.goto(BASE + '/login');
await applyAuth(page, b);
for (const [route, target] of PAGES) {
  await page.goto(BASE + '/uz' + (route === '/' ? '' : route), { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.locator('body').click({ position: { x: 5, y: 5 } }).catch(() => {});
  let reached = null, invisible = [], stuck = 0, prev = '', first = '';
  for (let i = 1; i <= 80; i++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(250); // outlines animate with 'transition: all' on some buttons
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const visible = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
      const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 50);
      const id = el.tagName + '|' + label + '|' + Math.round(el.getBoundingClientRect().top);
      const why = el.tagName + ' fv=' + el.matches(':focus-visible') + ' ' + cs.outlineStyle + ' ' + cs.outlineWidth + (el.style.outline ? ' inline=' + el.style.outline : '');
      return { label, visible, id, why };
    });
    if (!info) continue;
    if (i === 1) first = info.label;
    if (info.id === prev) stuck++;
    prev = info.id;
    if (!info.visible) invisible.push(info.label + ' [' + info.why + ']');
    if (!reached && target.test(info.label)) reached = i;
  }
  const uniqInvisible = [...new Set(invisible)];
  console.log(`${route.padEnd(22)} first: "${first.slice(0, 30)}" · main control at Tab ${reached ?? 'NOT within 80'} · no visible focus on ${uniqInvisible.length} element(s)${uniqInvisible.length ? ': ' + uniqInvisible.slice(0, 6).map((x) => `"${x.slice(0, 80)}"`).join(', ') : ''} · stuck ${stuck}`);
}
await browser.close();
