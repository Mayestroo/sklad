// Lists the outermost elements that stick out past the viewport (horizontal overflow culprits).
// Usage: node e2e/ux/overflow.mjs /route [width] [locale]
import { chromium } from '@playwright/test';
import { getAuth } from './auth.mjs';
const [route = '/', width = '390', locale = 'uz'] = process.argv.slice(2);
const BASE = 'http://localhost:3000';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: Number(width), height: 844 } });
await ctx.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: BASE }]);
const page = await ctx.newPage();
const b = await getAuth(page.request);
await page.goto(BASE + '/login');
await page.evaluate((b) => {
  localStorage.setItem('crm_access_token', b.tokens.accessToken);
  localStorage.setItem('crm_refresh_token', b.tokens.refreshToken);
  localStorage.setItem('crm_user', JSON.stringify(b.user));
  if (b.company) localStorage.setItem('crm_company', JSON.stringify(b.company));
}, b);
await page.goto(BASE + route, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const out = await page.evaluate(() => {
  const vw = window.innerWidth; const process_all = false;
  const res = [];
  for (const el of document.querySelectorAll('body *')) {
    const rc = el.getBoundingClientRect();
    if (rc.right > vw + 1 && rc.width > 0) {
      // skip if inside a scroll container that clips it
      let p = el.parentElement, clipped = false;
      while (p && p !== document.body) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll|hidden|clip)/.test(cs.overflowX) && p.getBoundingClientRect().right <= vw + 1) { clipped = true; break; }
        p = p.parentElement;
      }
      if (clipped && !process_all) continue;
      const parentOver = el.parentElement && el.parentElement.getBoundingClientRect().right > vw + 1;
      if (!parentOver) res.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} right=${Math.round(rc.right)} w=${Math.round(rc.width)} text="${(el.textContent || '').trim().slice(0, 40)}"`);
    }
  }
  const t=document.querySelector("table"); const chain=[]; let p=t; while(p&&p!==document.body){const cs=getComputedStyle(p);const rc=p.getBoundingClientRect();chain.push(p.tagName+" ox="+cs.overflowX+" w="+Math.round(rc.width)+" r="+Math.round(rc.right)+" pos="+cs.position+" disp="+cs.display);p=p.parentElement;}
  return { chain, scrollW: document.documentElement.scrollWidth, res: res.slice(0, 15) };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
