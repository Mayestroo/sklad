import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import {
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA,
} from '@nestjs/common/constants';
import { getMetadataStorage } from 'class-validator';

/**
 * The global ValidationPipe (whitelist: true) only validates a @Body() whose
 * declared type is a class with class-validator decorators. A body typed as
 * Partial<Dto>, an interface or `any` reflects as Object and skips validation
 * entirely; a class without decorators has every field stripped.
 */
function controllerFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return controllerFiles(full);
    return entry.name.endsWith('.controller.ts') ? [full] : [];
  });
}

type RouteArg = { index: number };

function unvalidatedBodies(): string[] {
  const problems: string[] = [];
  const storage = getMetadataStorage();
  for (const file of controllerFiles(
    path.join(__dirname, '..', '..', 'modules'),
  )) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const exported = require(file) as Record<string, unknown>;
    for (const value of Object.values(exported)) {
      if (typeof value !== 'function') continue;
      const controller = value as { name: string; prototype: object };
      if (Reflect.getMetadata(PATH_METADATA, controller) === undefined)
        continue;

      for (const key of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = (controller.prototype as Record<string, unknown>)[key];
        if (typeof handler !== 'function') continue;
        if (Reflect.getMetadata(METHOD_METADATA, handler) === undefined)
          continue;

        const args =
          (Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, key) as
            Record<string, RouteArg> | undefined) ?? {};
        const paramTypes =
          (Reflect.getMetadata(
            'design:paramtypes',
            controller.prototype,
            key,
          ) as unknown[] | undefined) ?? [];

        for (const [argKey, arg] of Object.entries(args)) {
          if (Number(argKey.split(':')[0]) !== Number(RouteParamtypes.BODY))
            continue;
          const type = paramTypes[arg.index] as
            (new (...a: unknown[]) => unknown) | undefined;
          const name = `${controller.name}.${key}`;
          if (!type || type === Object) {
            problems.push(`${name}: body is not a DTO class (not validated)`);
            continue;
          }
          const rules = storage.getTargetValidationMetadatas(
            type,
            '',
            true,
            false,
          );
          if (rules.length === 0) {
            problems.push(`${name}: ${type.name} has no validation decorators`);
          }
        }
      }
    }
  }
  return problems;
}

/**
 * Payment-provider callbacks receive the provider's own payload format (Click,
 * Payme JSON-RPC). Whitelisting would strip provider fields, so these handlers
 * validate the payload themselves.
 */
const PROVIDER_WEBHOOKS = new Set([
  'BillingController.clickWebhook',
  'BillingController.paymeWebhook',
]);

describe('request validation contract', () => {
  it('validates every request body with a decorated DTO class', () => {
    const problems = unvalidatedBodies().filter(
      (p) => !PROVIDER_WEBHOOKS.has(p.split(':')[0]),
    );
    expect(problems).toEqual([]);
  });
});
