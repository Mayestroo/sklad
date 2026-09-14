import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SuperAdminGuard } from './super-admin.guard';

describe('SuperAdminGuard', () => {
  let guard: SuperAdminGuard;

  beforeEach(() => {
    guard = new SuperAdminGuard();
  });

  const createMockContext = (user?: any): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  it('should allow access when user has super_admin role', () => {
    const context = createMockContext({
      id: 'super-1',
      email: 'super@sklad.uz',
      roles: ['super_admin'],
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access case-insensitively for SUPER_ADMIN', () => {
    const context = createMockContext({
      id: 'super-1',
      email: 'super@sklad.uz',
      roles: ['SUPER_ADMIN'],
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException when user is company_admin or regular user', () => {
    const context = createMockContext({
      id: 'admin-1',
      email: 'admin@company.uz',
      roles: ['company_admin'],
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow('Superadmin privileges required');
  });

  it('should throw ForbiddenException when user context is missing', () => {
    const context = createMockContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(context)).toThrow('User authentication context missing');
  });
});
