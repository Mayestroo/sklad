import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

/**
 * Static scan for Prisma queries on tenant-owned models that are not scoped
 * to a tenant. There is no automatic tenant scoping (CLAUDE.md), so every
 * read, update and delete must say which tenant it is for.
 *
 * A model is tenant-owned when it has a `tenantId` column, or when it belongs
 * (through a required relation) to a tenant-owned model, e.g.
 * PurchaseReceiptItem → PurchaseReceipt. A query is scoped when its `where`
 * contains `tenantId` (directly, in a compound unique key such as
 * `tenantId_warehouseId_productId`, or under `AND`), or, for a child model, a
 * relation filter that is itself scoped (`{ receipt: { tenantId } }`).
 */

const READ_WRITE_OPS = new Set([
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
]);

/** Models that are not tenant data even though rows relate to tenants. */
const NOT_TENANT_OWNED = new Set([
  // The tenant itself: `company` rows are looked up by their id = tenantId.
  'Company',
]);

export interface TenantModelInfo {
  /** Model name → relation field → parent model, for tenant-owned models. */
  owned: Map<string, { hasTenantId: boolean; parents: Map<string, string> }>;
  /** Prisma client delegate name (camelCase) → model name. */
  delegates: Map<string, string>;
}

export function readTenantModels(schemaPath: string): TenantModelInfo {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  const models = new Map<
    string,
    { hasTenantId: boolean; relations: Map<string, string> }
  >();
  for (const [, name, body] of schema.matchAll(
    /^model (\w+) \{([\s\S]*?)^\}/gm,
  )) {
    const relations = new Map<string, string>();
    for (const [, field, type, optional] of body.matchAll(
      /^\s+(\w+)\s+(\w+)(\?)?\s+@relation\([^)]*fields:/gm,
    )) {
      if (!optional) relations.set(field, type);
    }
    models.set(name, {
      hasTenantId: /^\s+tenantId\s/m.test(body),
      relations,
    });
  }

  const owned: TenantModelInfo['owned'] = new Map();
  for (const [name, m] of models) {
    if (m.hasTenantId && !NOT_TENANT_OWNED.has(name)) {
      owned.set(name, { hasTenantId: true, parents: new Map() });
    }
  }
  // Children (and grandchildren) of tenant-owned models.
  for (let changed = true; changed;) {
    changed = false;
    for (const [name, m] of models) {
      if (NOT_TENANT_OWNED.has(name)) continue;
      const parents = new Map(
        [...m.relations].filter(([, type]) => owned.has(type)),
      );
      if (m.hasTenantId || parents.size === 0) continue;
      const known = owned.get(name);
      if (!known || known.parents.size !== parents.size) {
        owned.set(name, { hasTenantId: false, parents });
        changed = true;
      }
    }
  }

  const delegates = new Map<string, string>();
  for (const name of models.keys()) {
    delegates.set(name.charAt(0).toLowerCase() + name.slice(1), name);
  }
  return { owned, delegates };
}

export interface UnscopedQuery {
  /** Path relative to the scanned root's parent (e.g. `src/modules/...`). */
  file: string;
  line: number;
  model: string;
  op: string;
  /** `no-where`: no filter at all; `unscoped`: filter without a tenant;
   *  `dynamic`: the filter is built elsewhere and cannot be checked. */
  kind: 'no-where' | 'unscoped' | 'dynamic';
  /** Enclosing `Class.method` (or function) for the inventory. */
  scope: string;
  /** Source offsets of the `where` object literal, when there is one. */
  whereRange?: [number, number];
}

type Verdict = 'scoped' | 'unscoped' | 'dynamic';

function unwrap(node: ts.Expression): ts.Expression {
  while (
    ts.isAsExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    node = node.expression;
  }
  return node;
}

function propName(p: ts.ObjectLiteralElementLike): string | undefined {
  if (!p.name) return undefined;
  if (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) return p.name.text;
  return undefined;
}

/** The initializer of a `const`/`let` named `name` visible from `from`. */
function resolveIdentifier(
  id: ts.Identifier,
): ts.Expression | 'parameter' | undefined {
  for (
    let scope: ts.Node | undefined = id.parent;
    scope;
    scope = scope.parent
  ) {
    let found: ts.Expression | 'parameter' | undefined;
    const visit = (n: ts.Node) => {
      if (found) return;
      if (
        ts.isVariableDeclaration(n) &&
        ts.isIdentifier(n.name) &&
        n.name.text === id.text &&
        n.initializer &&
        n.getStart() < id.getStart()
      ) {
        found = n.initializer;
        return;
      }
      if (
        ts.isParameter(n) &&
        ts.isIdentifier(n.name) &&
        n.name.text === id.text
      ) {
        found = 'parameter';
        return;
      }
      // Do not descend into nested functions other than our own chain.
      if (ts.isFunctionLike(n) && !isAncestor(n, id)) return;
      ts.forEachChild(n, visit);
    };
    if (
      ts.isBlock(scope) ||
      ts.isSourceFile(scope) ||
      ts.isFunctionLike(scope)
    ) {
      ts.forEachChild(scope, visit);
      if (found) return found;
    }
  }
  return undefined;
}

function isAncestor(ancestor: ts.Node, node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node; n; n = n.parent) {
    if (n === ancestor) return true;
  }
  return false;
}

function whereVerdict(
  node: ts.Expression,
  model: string,
  info: TenantModelInfo,
  depth = 0,
): Verdict {
  if (depth > 6) return 'dynamic';
  node = unwrap(node);
  if (ts.isIdentifier(node)) {
    const init = resolveIdentifier(node);
    if (!init || init === 'parameter') return 'dynamic';
    return whereVerdict(init, model, info, depth + 1);
  }
  if (ts.isConditionalExpression(node)) {
    const a = whereVerdict(node.whenTrue, model, info, depth + 1);
    const b = whereVerdict(node.whenFalse, model, info, depth + 1);
    if (a === 'unscoped' || b === 'unscoped') return 'unscoped';
    return a === 'scoped' && b === 'scoped' ? 'scoped' : 'dynamic';
  }
  if (ts.isArrayLiteralExpression(node)) {
    // AND: [...] — scoped if any element is.
    const verdicts = node.elements.map((e) =>
      whereVerdict(e, model, info, depth + 1),
    );
    if (verdicts.includes('scoped')) return 'scoped';
    return verdicts.includes('dynamic') ? 'dynamic' : 'unscoped';
  }
  if (!ts.isObjectLiteralExpression(node)) return 'dynamic';

  const meta = info.owned.get(model);
  let sawDynamic = false;
  for (const p of node.properties) {
    if (ts.isSpreadAssignment(p)) {
      const v = whereVerdict(p.expression, model, info, depth + 1);
      if (v === 'scoped') return 'scoped';
      if (v === 'dynamic') sawDynamic = true;
      continue;
    }
    const name = propName(p);
    if (!name) {
      sawDynamic = true;
      continue;
    }
    if (
      meta?.hasTenantId &&
      (name === 'tenantId' || name.startsWith('tenantId_'))
    )
      return 'scoped';
    if (meta?.hasTenantId && /_tenantId(_|$)/.test(name)) return 'scoped';
    const value = ts.isPropertyAssignment(p) ? p.initializer : undefined;
    if (!value) continue;
    if (name === 'AND') {
      const v = whereVerdict(value, model, info, depth + 1);
      if (v === 'scoped') return 'scoped';
      if (v === 'dynamic') sawDynamic = true;
      continue;
    }
    if (name === 'OR') {
      // Scoped only when every branch is, e.g. own rows plus shared system
      // rows: OR: [{ tenantId }, { tenantId: null }].
      const branches = unwrap(value);
      if (ts.isArrayLiteralExpression(branches) && branches.elements.length) {
        const verdicts = branches.elements.map((e) =>
          whereVerdict(e, model, info, depth + 1),
        );
        if (verdicts.every((v) => v === 'scoped')) return 'scoped';
        if (verdicts.includes('dynamic')) sawDynamic = true;
      } else {
        sawDynamic = true;
      }
      continue;
    }
    const parent = meta?.parents.get(name);
    if (parent) {
      let rel = unwrap(value);
      if (ts.isObjectLiteralExpression(rel)) {
        const is = rel.properties.find((q) => propName(q) === 'is');
        if (is && ts.isPropertyAssignment(is)) rel = unwrap(is.initializer);
      }
      const v = whereVerdict(rel, parent, info, depth + 1);
      if (v === 'scoped') return 'scoped';
      if (v === 'dynamic') sawDynamic = true;
    }
  }
  return sawDynamic ? 'dynamic' : 'unscoped';
}

function enclosingName(node: ts.Node): string {
  const parts: string[] = [];
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (
      (ts.isMethodDeclaration(n) || ts.isFunctionDeclaration(n)) &&
      n.name &&
      ts.isIdentifier(n.name)
    ) {
      parts.unshift(n.name.text);
    } else if (ts.isClassDeclaration(n) && n.name) {
      parts.unshift(n.name.text);
    } else if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer &&
      ts.isArrowFunction(n.initializer)
    ) {
      parts.unshift(n.name.text);
    }
  }
  return parts.join('.') || '<module>';
}

export function scanFile(
  file: string,
  displayPath: string,
  info: TenantModelInfo,
): UnscopedQuery[] {
  return scanSource(fs.readFileSync(file, 'utf8'), displayPath, info);
}

export function scanSource(
  text: string,
  displayPath: string,
  info: TenantModelInfo,
): UnscopedQuery[] {
  const source = ts.createSourceFile(
    displayPath,
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  const found: UnscopedQuery[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      READ_WRITE_OPS.has(node.expression.name.text) &&
      ts.isPropertyAccessExpression(node.expression.expression)
    ) {
      const op = node.expression.name.text;
      const model = info.delegates.get(node.expression.expression.name.text);
      if (model && info.owned.has(model)) {
        const arg = node.arguments[0] ? unwrap(node.arguments[0]) : undefined;
        let kind: UnscopedQuery['kind'] | undefined;
        let whereRange: [number, number] | undefined;
        if (!arg) {
          kind = 'no-where';
        } else {
          let argObj: ts.Expression | 'parameter' | undefined = arg;
          if (ts.isIdentifier(arg)) argObj = resolveIdentifier(arg);
          if (argObj && argObj !== 'parameter') argObj = unwrap(argObj);
          if (
            !argObj ||
            argObj === 'parameter' ||
            !ts.isObjectLiteralExpression(argObj)
          ) {
            kind = 'dynamic';
          } else {
            const where = argObj.properties.find(
              (p) => propName(p) === 'where',
            );
            const hasSpread = argObj.properties.some(ts.isSpreadAssignment);
            if (!where) {
              kind = hasSpread ? 'dynamic' : 'no-where';
            } else {
              const value = ts.isShorthandPropertyAssignment(where)
                ? where.name
                : ts.isPropertyAssignment(where)
                  ? where.initializer
                  : undefined;
              const v = value ? whereVerdict(value, model, info) : 'dynamic';
              if (value && ts.isObjectLiteralExpression(unwrap(value))) {
                const obj = unwrap(value);
                whereRange = [obj.getStart(), obj.getEnd()];
              }
              if (v !== 'scoped') kind = v;
            }
          }
        }
        if (kind) {
          found.push({
            file: displayPath,
            line:
              source.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            model,
            op,
            kind,
            scope: enclosingName(node),
            ...(whereRange ? { whereRange } : {}),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === '__mocks__' || entry.name === 'node_modules'
        ? []
        : sourceFiles(full);
    }
    return entry.name.endsWith('.ts') &&
      !/\.(spec|int-spec|e2e-spec)\.ts$/.test(entry.name) &&
      !entry.name.endsWith('.d.ts')
      ? [full]
      : [];
  });
}

/** Scan every non-test `.ts` file under `dirs` (relative to `backendRoot`). */
export function scanTenantScope(
  backendRoot: string,
  dirs: string[] = ['src'],
): UnscopedQuery[] {
  const info = readTenantModels(
    path.join(backendRoot, 'prisma', 'schema.prisma'),
  );
  return dirs.flatMap((dir) =>
    sourceFiles(path.join(backendRoot, dir)).flatMap((file) =>
      scanFile(
        file,
        path.relative(backendRoot, file).split(path.sep).join('/'),
        info,
      ),
    ),
  );
}
