import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * F8 / ADR 0022: no silent currency guess. A form, price, payment or stored
 * amount never takes a guessed currency (`x || 'UZS'`, `useState('USD')`,
 * `useDefaultCurrency()`); it starts blank and refuses to submit until one is
 * chosen. This scan fails when a new guess appears.
 *
 * The display-only exceptions once listed here (F8 table, F10 cross-currency
 * totals) are fixed: totals are kept per currency, a zero shows no currency
 * and the display-only `useDefaultCurrency` hook is gone. ALLOWED keeps only
 * defined (not guessed) currencies; each entry is the number of matches
 * allowed in that file for that pattern, and one more fails the scan.
 */
const SRC = fileURLToPath(new URL('..', import.meta.url));
const SCANNED_DIRS = ['app', 'components', 'hooks', 'lib', 'context'];

const PATTERNS: Record<string, RegExp> = {
  literal: /(\|\||\?\?)\s*['"](USD|UZS|EUR|RUB)['"]/,
  state: /useState(<[^>]*>)?\(\s*['"](USD|UZS|EUR|RUB)['"]\s*\)/,
  hook: /useDefaultCurrency\(/,
  objectDefault: /\b[cC]urrency\s*[:=]\s*['"](USD|UZS|EUR|RUB)['"]/,
};


const ALLOWED: Array<{ file: string; pattern: keyof typeof PATTERNS; count: number; reason: string }> = [
  { file: 'lib/opening-balance-lines.ts', pattern: 'objectDefault', count: 1, reason: 'defined, not guessed: the fixed-asset register is kept in UZS (D6)' },
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(name) && !/\.(spec|test)\.tsx?$/.test(name) ? [full] : [];
  });
}

function scan(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const dir of SCANNED_DIRS) {
    for (const file of walk(join(SRC, dir))) {
      const rel = relative(SRC, file).split('\\').join('/');
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        for (const [name, pattern] of Object.entries(PATTERNS)) {
          const key = `${rel} | ${name}`;
          if (pattern.test(line)) counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
    }
  }
  return counts;
}

const keyOf = (entry: { file: string; pattern: string }) => `${entry.file} | ${entry.pattern}`;

test('no new silent currency guess in the frontend (F8, ADR 0022)', () => {
  const allowed = new Map(ALLOWED.map((entry) => [keyOf(entry), entry.count]));
  const offenders = [...scan()]
    .filter(([key, count]) => count > (allowed.get(key) ?? 0))
    .map(([key, count]) => `${key}: ${count} match(es), ${allowed.get(key) ?? 0} allowed`);
  assert.deepEqual(
    offenders,
    [],
    `start the currency blank and require a choice (see SalesOrderForm / CreateProductDrawer); a display-only case goes in ALLOWED with a reason:\n${offenders.join('\n')}`,
  );
});

test('the allow-list has no stale entries (a fixed guess is removed from it)', () => {
  const counts = scan();
  const stale = ALLOWED.filter((entry) => (counts.get(keyOf(entry)) ?? 0) < entry.count)
    .map((entry) => `${keyOf(entry)}: allowed ${entry.count}, found ${counts.get(keyOf(entry)) ?? 0}`);
  assert.deepEqual(stale, [], `lower or remove these entries:\n${stale.join('\n')}`);
});

test('the scan catches the patterns it is meant to catch', () => {
  assert.ok(PATTERNS.literal.test(`const c = order.currency || 'USD';`));
  assert.ok(PATTERNS.literal.test(`currency ?? 'UZS'`));
  assert.ok(PATTERNS.state.test(`const [currency, setCurrency] = useState<'USD' | 'UZS'>('UZS');`));
  assert.ok(PATTERNS.hook.test('const c = useDefaultCurrency();'));
  assert.ok(PATTERNS.objectDefault.test(`  currency: 'UZS',`));
  assert.ok(!PATTERNS.literal.test(`if (currency === 'UZS') return 1;`));
  assert.ok(!PATTERNS.state.test(`useState('')`));
});
