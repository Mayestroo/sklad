import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Apple HIG / accessibility: an icon-only button needs a name (aria-label,
 * and title for the tooltip). Without one a screen reader says "button" and
 * a mouse user has to guess what a lone "×" or bin icon does.
 */
const src = fileURLToPath(new URL('..', import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (name.endsWith('.tsx') && !/\.(test|spec)\./.test(name)) out.push(path);
  }
  return out;
}

function unnamedIconButtons(file: string): string[] {
  const s = readFileSync(file, 'utf8');
  const found: string[] = [];
  const re = /<(button|Button)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const tag = m[1];
    let i = m.index + tag.length + 1;
    let depth = 0;
    for (; i < s.length; i++) {
      const c = s[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) break;
    }
    const open = s.slice(m.index, i + 1);
    if (open.endsWith('/>')) continue;
    const close = s.indexOf(`</${tag}>`, i);
    if (close < 0) continue;
    const body = s.slice(i + 1, close).trim();
    if (/aria-label|title=|aria-labelledby/.test(open)) continue;
    const iconOnly = /^<[A-Z][A-Za-z0-9]*\b[^>]*\/>$/.test(body) || /^(×|✕|✖)$/.test(body);
    if (iconOnly) found.push(`${relative(src, file)}:${s.slice(0, m.index).split('\n').length}`);
  }
  return found;
}

test('icon-only buttons have an accessible name', () => {
  assert.deepEqual(walk(src).flatMap(unnamedIconButtons), []);
});
