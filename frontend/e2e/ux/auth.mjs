// Signs in once and caches the auth response (the API rate-limits /auth/login).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CACHE = path.join(os.tmpdir(), 'sklad-ux-auth.json');
const API = process.env.UX_API || 'http://localhost:3001/api';

export async function getAuth(request) {
  try {
    const cached = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
    if (Date.now() - cached.at < 12 * 3600 * 1000) return cached.body;
  } catch { /* no cache */ }
  const r = await request.post(API + '/auth/login', {
    data: { email: process.env.UX_EMAIL || 'admin@orient.uz', password: process.env.UX_PASSWORD || 'Admin123!' },
  });
  const body = await r.json();
  if (!body?.tokens?.accessToken) throw new Error('login failed: ' + JSON.stringify(body).slice(0, 200));
  fs.writeFileSync(CACHE, JSON.stringify({ at: Date.now(), body }));
  return body;
}

/** Puts the session into localStorage of the current page (must be on the app origin). */
export async function applyAuth(page, body) {
  await page.evaluate((b) => {
    localStorage.setItem('crm_access_token', b.tokens.accessToken);
    localStorage.setItem('crm_refresh_token', b.tokens.refreshToken);
    localStorage.setItem('crm_user', JSON.stringify(b.user));
    if (b.company) localStorage.setItem('crm_company', JSON.stringify(b.company));
  }, body);
}
