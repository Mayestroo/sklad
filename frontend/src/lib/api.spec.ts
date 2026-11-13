import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { apiDownload, apiFetch, ApiError, listOf } from './api.ts';

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

test('a FormData body is sent as multipart, not labelled as JSON', async () => {
  let sent: Headers | undefined;
  globalThis.fetch = async (_url, init) => {
    sent = new Headers(init?.headers);
    return new Response('{"ok":true}', { status: 200 });
  };
  const body = new FormData();
  body.append('file', new Blob(['x']), 'a.xlsx');

  await apiFetch('/opening-balances/d1/import-preview', { token: 't', method: 'POST', body });

  // The browser must set multipart/form-data with its own boundary.
  assert.equal(sent?.has('Content-Type'), false);
  assert.equal(sent?.get('Authorization'), 'Bearer t');
});

test('apiDownload returns the file as a Blob and sends the auth headers', async () => {
  let sentUrl = '';
  let sent: Headers | undefined;
  globalThis.fetch = async (url, init) => {
    sentUrl = String(url);
    sent = new Headers(init?.headers);
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  };

  const blob = await apiDownload('/api/opening-balances/template', { token: 't', tenantId: 'c1' });

  assert.ok(sentUrl.endsWith('/api/opening-balances/template'));
  assert.ok(!sentUrl.includes('/api/api/'));
  assert.equal(sent?.get('Authorization'), 'Bearer t');
  assert.equal(sent?.get('X-Tenant-Id'), 'c1');
  assert.equal(blob.size, 3);
});

test('apiDownload surfaces server errors as ApiError', async () => {
  respondWith(403, { statusCode: 403, message: 'Ruxsat yo‘q', details: null });
  await assert.rejects(
    apiDownload('/opening-balances/template', { token: 't' }),
    (err: unknown) => err instanceof ApiError && err.status === 403 && err.message === 'Ruxsat yo‘q',
  );
});

test('listOf reads a list answered as an array or as { data: [...] }', () => {
  assert.deepEqual(listOf([1, 2]), [1, 2]);
  assert.deepEqual(listOf({ data: [3] }), [3]);
  assert.deepEqual(listOf({}), []);
  assert.deepEqual(listOf(null), []);
  assert.deepEqual(listOf(undefined), []);
});
