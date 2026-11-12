import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiFetch, ApiError } from './api.ts';

const storage = new Map<string, string>();
const events: string[] = [];

beforeEach(() => {
  storage.clear();
  events.length = 0;
  storage.set('crm_access_token', 'old-token');
  Object.assign(globalThis, {
    window: { dispatchEvent: (e: Event) => events.push(e.type) },
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    },
  });
});

function respondWith(status: number, body: unknown) {
  globalThis.fetch = async () =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

test('a wrong password on the login form does not end the stored session', async () => {
  respondWith(401, { statusCode: 401, message: "Login yoki parol noto'g'ri", details: null });

  await assert.rejects(
    apiFetch('/auth/login', { method: 'POST', body: '{}' }),
    (err: unknown) => err instanceof ApiError && err.status === 401,
  );
  assert.equal(storage.get('crm_access_token'), 'old-token');
  assert.deepEqual(events, []);
});

test('an expired token on an authenticated request signs the user out', async () => {
  respondWith(401, { statusCode: 401, message: 'Unauthorized', details: null });

  await assert.rejects(apiFetch('/finance/accounts', { token: 'old-token' }));
  assert.equal(storage.has('crm_access_token'), false);
  assert.deepEqual(events, ['crm_unauthorized']);
});

test('errors carry the HTTP status and the server message', async () => {
  respondWith(409, { statusCode: 409, message: 'Hujjat raqami band', details: null });

  await assert.rejects(
    apiFetch('/sales/invoices', { token: 't', method: 'POST', body: '{}' }),
    (err: unknown) =>
      err instanceof ApiError && err.status === 409 && err.message === 'Hujjat raqami band',
  );
});
