import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Contract check: every API path the frontend calls with a literal string
 * must match a route a backend controller declares. A typo'd or renamed
 * route otherwise fails only at runtime (the purchase-return form loaded
 * suppliers from "/counterparties", which does not exist, so its supplier
 * list was always empty).
 */
const frontendSrc = fileURLToPath(new URL('..', import.meta.url));
const backendModules = fileURLToPath(new URL('../../../backend/src', import.meta.url));

const walk = (dir: string, suffix: RegExp): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === 'node_modules' ? [] : walk(full, suffix);
    return suffix.test(name) ? [full] : [];
  });

/** A route as path segments; ':param' matches any segment. */
const toSegments = (route: string) => route.split('/').filter(Boolean);

/**
 * A frontend segment with a template (`${id}`, `documents${suffix}`) matches
 * any backend segment that starts with its literal part; a backend ':param'
 * matches any frontend segment.
 */
function matches(route: string[], call: string[]): boolean {
  if (route.length !== call.length) return false;
  return route.every((segment, i) => {
    const part = call[i];
    if (segment.startsWith(':')) return true;
    const dynamic = part.indexOf('${');
    return dynamic === -1 ? segment === part : segment.startsWith(part.slice(0, dynamic));
  });
}

function backendRoutes(): string[][] {
  const routes: string[][] = [];
  for (const file of walk(backendModules, /\.controller\.ts$/)) {
    const source = readFileSync(file, 'utf8');
    const controller = source.match(/@Controller\(([^)]*)\)/);
    if (!controller) continue;
    const prefixes = [...controller[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
    if (prefixes.length === 0) prefixes.push('');
    for (const m of source.matchAll(/@(Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)')?\s*\)/g)) {
      const sub = m[2] ?? '';
      if (sub.startsWith('/')) {
        routes.push(toSegments(sub.slice(1)));
        continue;
      }
      for (const prefix of prefixes) routes.push(toSegments([prefix, sub].filter(Boolean).join('/')));
    }
  }
  return routes;
}

function frontendCalls(): Array<{ file: string; path: string }> {
  const calls: Array<{ file: string; path: string }> = [];
  for (const file of walk(frontendSrc, /\.tsx?$/)) {
    if (file.endsWith('.spec.ts')) continue;
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/api(?:Fetch|Download)(?:<[^>(]*(?:<[^>]*>[^>(]*)*>)?\(\s*([`'])(\/[^`'?]*)/g)) {
      calls.push({ file: file.slice(frontendSrc.length), path: m[2] });
    }
  }
  return calls;
}

test('every literal API path the frontend calls is a backend route', () => {
  const routes = backendRoutes();
  assert.ok(routes.length > 100, `found only ${routes.length} backend routes`);
  const calls = frontendCalls();
  assert.ok(calls.length > 100, `found only ${calls.length} frontend calls`);

  const unknown = calls
    .filter(({ path }) => !routes.some((route) => matches(route, toSegments('api' + path))))
    .map(({ file, path }) => `${file}: ${path}`);
  assert.deepEqual(unknown, []);
});
