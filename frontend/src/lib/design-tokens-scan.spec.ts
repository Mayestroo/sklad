import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A CSS variable that is used but never defined is dropped by the browser:
 * warning text, borders and backgrounds silently lose their colour (found
 * 15 such tokens, e.g. --color-warning-700, --color-border-subtle). Every
 * var(--token) without a fallback must be defined in globals.css.
 */
const src = fileURLToPath(new URL('..', import.meta.url));
const css = readFileSync(join(src, 'app/globals.css'), 'utf8');
const defined = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(tsx?|css)$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(path);
  }
  return out;
}

test('every CSS token used without a fallback is defined in globals.css', () => {
  const missing = new Map<string, string>();
  for (const file of walk(src)) {
    for (const m of readFileSync(file, 'utf8').matchAll(/var\((--[a-z0-9-]+)\s*(,)?/g)) {
      if (!m[2] && !defined.has(m[1]) && !missing.has(m[1])) missing.set(m[1], file.slice(src.length));
    }
  }
  assert.deepEqual([...missing.entries()], []);
});

/**
 * Status colours come from the semantic tokens (--color-success|error|
 * warning|info-*), not hard-coded hex, so the palette stays one system.
 * Folder colours are user data saved in the database and stay hex.
 */
const STATUS_HEX = /['"]#(ef4444|dc2626|f59e0b|d97706|3b82f6|2563eb|10b981|059669|16a34a|22c55e)['"]/i;
const STATUS_HEX_ALLOWED = [/folder/i, /\/\/ (Blue|Green|Amber|Red)$/];

test('status colours in components use tokens', () => {
  const found: string[] = [];
  for (const file of walk(src)) {
    if (!file.endsWith('.tsx')) continue;
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (STATUS_HEX.test(line) && !STATUS_HEX_ALLOWED.some((re) => re.test(line))) found.push(file.slice(src.length) + ':' + (i + 1));
    });
  }
  assert.deepEqual(found, []);
});
