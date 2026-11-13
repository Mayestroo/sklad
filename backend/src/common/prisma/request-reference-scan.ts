import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

/**
 * Static scan for service methods that take ids from a request DTO and may
 * write them as foreign keys without checking the tenant.
 *
 * A method is reported when one of its parameters is typed with a DTO class
 * (a type name ending in `Dto`, or one of REQUEST_INPUT_TYPES) and its body
 * reads an id-like property (`counterpartyId`, `productId`, `selectedItemIds`,
 * …) from that parameter, directly (`dto.warehouseId`) or from an element of
 * one of its arrays (`dto.items.map((item) => item.productId)`,
 * `for (const line of dto.lines) line.accountId`), unless the body calls
 * `assertTenantOwned`. Methods that check their ids another way are listed,
 * with the reason, in the allowlist of `request-reference.spec.ts`.
 */

/** Non-`Dto` parameter types that carry request input. */
const REQUEST_INPUT_TYPES = new Set(['JournalEntryInput']);

const ID_PROPERTY = /^[a-z][A-Za-z]*Ids?$/;
/** Never a foreign key chosen by the caller. */
const IGNORED_PROPERTIES = new Set(['tenantId']);

export interface ReferenceFinding {
  /** Path relative to the scanned root, forward slashes. */
  file: string;
  line: number;
  /** `Class.method`. */
  method: string;
  /** Sorted, unique id properties read from the request. */
  ids: string[];
  checked: boolean;
}

function typeName(node: ts.TypeNode | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isTypeReferenceNode(node)) return node.typeName.getText();
  if (ts.isIntersectionTypeNode(node) || ts.isUnionTypeNode(node)) {
    for (const part of node.types) {
      const name = typeName(part);
      if (name && isRequestType(name)) return name;
    }
  }
  // Partial<CreateXDto>, etc.
  if (ts.isTypeReferenceNode(node) && node.typeArguments?.length) {
    return typeName(node.typeArguments[0]);
  }
  return undefined;
}

function isRequestType(name: string): boolean {
  return name.endsWith('Dto') || REQUEST_INPUT_TYPES.has(name);
}

function isObjectLiteralType(t: ts.TypeNode): boolean {
  if (ts.isTypeLiteralNode(t)) return true;
  if (ts.isArrayTypeNode(t)) return isObjectLiteralType(t.elementType);
  // Partial<{ ... }>
  return (
    ts.isTypeReferenceNode(t) &&
    !!t.typeArguments?.length &&
    isObjectLiteralType(t.typeArguments[0])
  );
}

function requestTypeOf(param: ts.ParameterDeclaration): boolean {
  const t = param.type;
  if (!t) return false;
  // Inline shapes (`dto: { counterpartyId?: string }`) are request input as
  // often as DTO classes; internal helpers that take them are allowlisted.
  if (isObjectLiteralType(t)) return true;
  if (ts.isTypeReferenceNode(t) && t.typeArguments?.length) {
    // Partial<CreateSalesOrderDto>
    const inner = typeName(t.typeArguments[0]);
    if (inner && isRequestType(inner)) return true;
  }
  const name = typeName(t);
  return !!name && isRequestType(name);
}

/** Root identifier of an expression such as `dto.items` → `dto`. */
function rootIdentifier(expr: ts.Expression): string | undefined {
  let current: ts.Expression = expr;
  for (;;) {
    if (ts.isIdentifier(current)) return current.text;
    if (
      ts.isPropertyAccessExpression(current) ||
      ts.isElementAccessExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isParenthesizedExpression(current)
    ) {
      current = current.expression;
      continue;
    }
    if (ts.isCallExpression(current)) {
      // dto.items.filter(...).map(...) → keep walking the callee
      current = current.expression;
      continue;
    }
    return undefined;
  }
}

function callsAssert(node: ts.Node, helpers: Set<string>): boolean {
  let found = false;
  const visit = (n: ts.Node) => {
    if (found) return;
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      if (ts.isIdentifier(callee) && callee.text === 'assertTenantOwned') {
        found = true;
      }
      // this.assertLineReferences(...) where that method calls the helper
      if (
        ts.isPropertyAccessExpression(callee) &&
        callee.expression.kind === ts.SyntaxKind.ThisKeyword &&
        helpers.has(callee.name.text)
      ) {
        found = true;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

function scanMethod(
  method: ts.MethodDeclaration,
  sourceFile: ts.SourceFile,
  helpers: Set<string>,
): { ids: string[]; checked: boolean } | null {
  if (!method.body) return null;
  const tainted = new Set<string>();
  for (const param of method.parameters) {
    if (ts.isIdentifier(param.name) && requestTypeOf(param)) {
      tainted.add(param.name.text);
    }
  }
  if (tainted.size === 0) return null;

  const ids = new Set<string>();
  const checked = callsAssert(method.body, helpers);

  // Two passes so element variables declared before use are tainted.
  for (let pass = 0; pass < 2; pass++) {
    const visit = (node: ts.Node) => {
      // dto.items.map((item) => ...) / forEach / filter / some / every / flatMap / reduce
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression)
      ) {
        const root = rootIdentifier(node.expression.expression);
        if (root && tainted.has(root)) {
          for (const arg of node.arguments) {
            if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
              const params =
                node.expression.name.text === 'reduce'
                  ? arg.parameters.slice(1, 2)
                  : arg.parameters.slice(0, 1);
              for (const p of params) {
                if (ts.isIdentifier(p.name)) tainted.add(p.name.text);
              }
            }
          }
        }
      }
      // for (const item of dto.items) / for (const [i, item] of dto.items.entries())
      if (ts.isForOfStatement(node)) {
        const root = rootIdentifier(node.expression);
        if (root && tainted.has(root)) {
          const decl = node.initializer;
          if (ts.isVariableDeclarationList(decl)) {
            for (const d of decl.declarations) {
              if (ts.isIdentifier(d.name)) tainted.add(d.name.text);
              if (ts.isArrayBindingPattern(d.name)) {
                for (const el of d.name.elements) {
                  if (ts.isBindingElement(el) && ts.isIdentifier(el.name)) {
                    tainted.add(el.name.text);
                  }
                }
              }
            }
          }
        }
      }
      // const { counterpartyId } = dto;  /  const lines = dto.lines || [];
      if (ts.isVariableDeclaration(node) && node.initializer) {
        const init = ts.isBinaryExpression(node.initializer)
          ? node.initializer.left
          : node.initializer;
        const root = rootIdentifier(init);
        if (root && tainted.has(root)) {
          if (ts.isIdentifier(node.name)) tainted.add(node.name.text);
          if (ts.isObjectBindingPattern(node.name)) {
            for (const el of node.name.elements) {
              const prop = (el.propertyName ?? el.name).getText(sourceFile);
              if (ID_PROPERTY.test(prop) && !IGNORED_PROPERTIES.has(prop)) {
                ids.add(prop);
              }
            }
          }
        }
      }
      if (
        ts.isPropertyAccessExpression(node) &&
        ID_PROPERTY.test(node.name.text) &&
        !IGNORED_PROPERTIES.has(node.name.text)
      ) {
        const base = node.expression;
        const root = ts.isIdentifier(base)
          ? base.text
          : ts.isNonNullExpression(base) && ts.isIdentifier(base.expression)
            ? base.expression.text
            : undefined;
        if (root && tainted.has(root)) ids.add(node.name.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(method.body);
  }

  if (ids.size === 0) return null;
  return { ids: [...ids].sort(), checked };
}

export function scanFile(filePath: string, root: string): ReferenceFinding[] {
  const text = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  const findings: ReferenceFinding[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isClassDeclaration(node) && node.name) {
      // Same-class helpers that call assertTenantOwned count as the check.
      const helpers = new Set<string>();
      for (const member of node.members) {
        if (
          ts.isMethodDeclaration(member) &&
          member.body &&
          callsAssert(member.body, new Set())
        ) {
          helpers.add(member.name.getText(sourceFile));
        }
      }
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member)) continue;
        const result = scanMethod(member, sourceFile, helpers);
        if (!result) continue;
        findings.push({
          file: path.relative(root, filePath).split(path.sep).join('/'),
          line:
            sourceFile.getLineAndCharacterOfPosition(member.getStart()).line +
            1,
          method: `${node.name.text}.${member.name.getText(sourceFile)}`,
          ...result,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return findings;
}

export function scanDirectory(dir: string, root = dir): ReferenceFinding[] {
  const out: ReferenceFinding[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__mocks__' || entry.name === 'node_modules') continue;
      out.push(...scanDirectory(full, root));
    } else if (
      entry.name.endsWith('.service.ts') ||
      entry.name.endsWith('.engine.ts')
    ) {
      out.push(...scanFile(full, root));
    }
  }
  return out;
}
