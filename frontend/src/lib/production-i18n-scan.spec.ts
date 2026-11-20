import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

/**
 * TZ "Ishlab chiqarish" 11.8: every text of the production screens lives in
 * messages/uz.json and messages/ru.json (namespace "production"), none is
 * written in the code. This scan fails when an inline uz/ru pair comes back.
 */
const src = fileURLToPath(new URL('..', import.meta.url));
const files = [
  ...readdirSync(join(src, 'components/production'))
    .filter((name) => name.endsWith('.tsx') && !name.includes('.test.'))
    .map((name) => join(src, 'components/production', name)),
  join(src, 'app/[locale]/(dashboard)/production/page.tsx'),
  join(src, 'app/[locale]/(dashboard)/settings/production/page.tsx'),
];

test('production screens have no inline uz/ru texts', () => {
  const found: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    if (/\bisRu\s*\?/.test(source)) found.push(`${file}: isRu ? …`);
    if (/locale === 'ru' \?/.test(source)) found.push(`${file}: locale === 'ru' ? …`);
    if (/\bt\(\s*['`][^'`]*['`]\s*,\s*['`]/.test(source)) found.push(`${file}: t('uz', 'ru')`);
  }
  assert.deepEqual(found, []);
});

test('every production text exists in both languages, and every key used exists', () => {
  const uz = JSON.parse(readFileSync(join(src, '../messages/uz.json'), 'utf8')).production as Record<string, string>;
  const ru = JSON.parse(readFileSync(join(src, '../messages/ru.json'), 'utf8')).production as Record<string, string>;
  assert.deepEqual(Object.keys(uz).sort(), Object.keys(ru).sort());
  for (const [key, value] of Object.entries(uz)) {
    assert.ok(value.trim(), `uz ${key} is empty`);
    assert.ok(ru[key].trim(), `ru ${key} is empty`);
  }
  const missing: string[] = [];
  for (const file of files) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\bt\('([A-Za-z0-9_]+)'/g)) {
      if (!(m[1] in uz)) missing.push(`${file}: ${m[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});
