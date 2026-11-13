import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { PermissionsGuard } from '../guards/permissions.guard';
import { TenantGuard } from '../guards/tenant.guard';
import { ALL_PERMISSION_SLUGS } from './permission-catalog';

type Route = {
  name: string;
  method: RequestMethod;
  guards: unknown[];
  permissions: string[];
};

function controllerFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return controllerFiles(full);
    return entry.name.endsWith('.controller.ts') ? [full] : [];
  });
}

function collectRoutes(): Route[] {
  const routes: Route[] = [];
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

      const classGuards =
        (Reflect.getMetadata(GUARDS_METADATA, controller) as
          unknown[] | undefined) ?? [];
      const classPermissions =
        (Reflect.getMetadata(PERMISSIONS_KEY, controller) as
          string[] | undefined) ?? [];

      for (const key of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = (controller.prototype as Record<string, unknown>)[key];
        if (typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as
          RequestMethod | undefined;
        if (method === undefined) continue;
        routes.push({
          name: `${controller.name}.${key}`,
          method,
          guards: [
            ...classGuards,
            ...((Reflect.getMetadata(GUARDS_METADATA, handler) as unknown[]) ??
              []),
          ],
          permissions:
            (Reflect.getMetadata(PERMISSIONS_KEY, handler) as string[]) ??
            classPermissions,
        });
      }
    }
  }
  return routes;
}

describe('permission catalog', () => {
  const routes = collectRoutes();

  it('discovers the application routes', () => {
    expect(routes.length).toBeGreaterThan(100);
  });

  it('only requires permissions that the seeders actually create', () => {
    const unknown = routes.flatMap((r) =>
      r.permissions
        .filter((p) => !ALL_PERMISSION_SLUGS.has(p))
        .map((p) => `${r.name} requires "${p}"`),
    );
    expect(unknown).toEqual([]);
  });

  it('protects every tenant-scoped write route with an explicit permission', () => {
    const unprotected = routes
      .filter(
        (r) => r.guards.includes(TenantGuard) && r.method !== RequestMethod.GET,
      )
      .filter(
        (r) =>
          !r.guards.includes(PermissionsGuard) || r.permissions.length === 0,
      )
      .map((r) => r.name);
    expect(unprotected).toEqual([]);
  });
});
