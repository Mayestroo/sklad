import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * D8: every displayed amount, quantity and percentage goes through the shared
 * formatter (shared/format/money.ts, re-exported from lib/utils.ts). This
 * scan fails when a page or component formats numbers on its own again.
 *
 * To round a computed value use roundTo() from lib/round.ts.
 */
const SRC = fileURLToPath(new URL('..', import.meta.url));
const SCANNED_DIRS = ['app', 'components'];

const AD_HOC_PATTERNS: Array<[RegExp, string]> = [
  [/\.toFixed\(/, 'toFixed('],
  [/\.toLocaleString\(/, 'toLocaleString('],
  [/Intl\.NumberFormat/, 'Intl.NumberFormat'],
];

/**
 * Allowed exceptions, with the reason. Keep this list short.
 * - CurrencyInput: an editing widget, not display text. It keeps its typing
 *   grammar (dot decimal from the numpad, comma grouping while typing);
 *   changing how users type numbers is out of scope for the D8 display fix.
 */
const ALLOWED = new Set(['components/ui/CurrencyInput.tsx']);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(name) && !/\.spec\.ts$/.test(name) ? [full] : [];
  });
}

test('pages and components use the shared number formatter (no ad-hoc formatting)', () => {
  const offenders: string[] = [];
  for (const dir of SCANNED_DIRS) {
    for (const file of walk(join(SRC, dir))) {
      const rel = relative(SRC, file).split('\\').join('/');
      if (ALLOWED.has(rel)) continue;
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, index) => {
        for (const [pattern, label] of AD_HOC_PATTERNS) {
          if (pattern.test(line)) offenders.push(`${rel}:${index + 1} uses ${label}`);
        }
      });
    }
  }
  assert.deepEqual(offenders, [], `use formatCurrency/formatQuantity/formatPercent/formatNumber from @/lib/utils:\n${offenders.join('\n')}`);
});

test('the scan sees the files it is meant to scan', () => {
  const files = SCANNED_DIRS.flatMap((dir) => walk(join(SRC, dir)));
  assert.ok(files.length > 50, `expected many component files, found ${files.length}`);
  assert.ok(files.some((file) => file.endsWith('CurrencyInput.tsx')));
});
