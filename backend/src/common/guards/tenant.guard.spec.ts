import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { TenantGuard } from './tenant.guard';

describe('TenantGuard', () => {
  let guard: TenantGuard;

  beforeEach(() => {
    guard = new TenantGuard();
  });

  const createMockContext = (user?: any, headers: Record<string, string> = {}): ExecutionContext => {
    const request: any = {
      user,
      headers: { ...headers },
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  it('should allow access when user has a valid tenantId in JWT context', () => {
    const context = createMockContext({
      id: 'user-1',
      tenantId: 'tenant-123',
      roles: ['company_admin'],
    });

    const canActivate = guard.canActivate(context);
    const req = context.switchToHttp().getRequest();

    expect(canActivate).toBe(true);
    expect(req.tenantId).toBe('tenant-123');
  });

  it('should trim tenantId from user context', () => {
    const context = createMockContext({
      id: 'user-1',
      tenantId: '  tenant-spaced  ',
      roles: ['cashier'],
    });

    const canActivate = guard.canActivate(context);
    const req = context.switchToHttp().getRequest();

    expect(canActivate).toBe(true);
    expect(req.tenantId).toBe('tenant-spaced');
  });

  it('should throw UnauthorizedException when user authentication context is missing', () => {
    const context = createMockContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(context)).toThrow('User authentication context missing');
  });

  it('should throw ForbiddenException when user has no tenantId and is not super_admin', () => {
    const context = createMockContext({
      id: 'user-1',
      tenantId: null,
      roles: ['company_admin'],
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow('Tenant context required');
  });

  it('should throw ForbiddenException when user tenantId is empty whitespace', () => {
    const context = createMockContext({
      id: 'user-1',
      tenantId: '   ',
      roles: ['company_admin'],
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should reject non-superadmin attempting to spoof tenant via x-tenant-id header without user.tenantId', () => {
    const context = createMockContext(
      {
        id: 'attacker-1',
        tenantId: null,
        roles: ['company_admin'],
      },
      { 'x-tenant-id': 'victim-tenant' },
    );

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should strictly use JWT user.tenantId and ignore x-tenant-id header for regular users', () => {
    const context = createMockContext(
      {
        id: 'user-1',
        tenantId: 'legit-tenant',
        roles: ['company_admin'],
      },
      { 'x-tenant-id': 'spoofed-tenant' },
    );

    const canActivate = guard.canActivate(context);
    const req = context.switchToHttp().getRequest();

    expect(canActivate).toBe(true);
    expect(req.tenantId).toBe('legit-tenant');
  });

  it('should allow super_admin to specify tenant via x-tenant-id header', () => {
    const context = createMockContext(
      {
        id: 'super-1',
        tenantId: null,
        roles: ['super_admin'],
      },
      { 'x-tenant-id': 'target-tenant-456' },
    );

    const canActivate = guard.canActivate(context);
    const req = context.switchToHttp().getRequest();

    expect(canActivate).toBe(true);
    expect(req.tenantId).toBe('target-tenant-456');
  });

  it('should throw ForbiddenException when super_admin does not specify x-tenant-id header', () => {
    const context = createMockContext({
      id: 'super-1',
      tenantId: null,
      roles: ['super_admin'],
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow(
      'Tenant context required: SuperAdmin must specify X-Tenant-Id header for tenant-scoped operations',
    );
  });
});
