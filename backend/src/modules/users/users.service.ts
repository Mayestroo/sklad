import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma';
import { AuditService } from '../audit/audit.service';
import { CreateUserDto, UpdateUserDto } from './dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Create staff user within tenant
   */
  async createUser(tenantId: string, dto: CreateUserDto, actorUserId: string) {
    const existing = await this.prisma.user.findFirst({
      where: { tenantId, email: dto.email },
    });

    if (existing) {
      throw new ConflictException('User with this email already exists in company');
    }

    // Resolve Role by slug
    const role = await this.prisma.role.findFirst({
      where: {
        slug: dto.roleSlug,
        OR: [{ tenantId }, { tenantId: null }],
      },
    });

    if (!role) {
      throw new BadRequestException(`Role '${dto.roleSlug}' not found`);
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        tenantId,
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        preferredLanguage: dto.preferredLanguage || 'uz',
        isActive: true,
        userRoles: {
          create: {
            roleId: role.id,
          },
        },
      },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });

    // Log Audit event
    await this.auditService.logAction({
      tenantId,
      userId: actorUserId,
      entityType: 'User',
      entityId: user.id,
      action: 'CREATE',
      newValue: { email: user.email, role: dto.roleSlug },
    });

    return this.sanitizeUser(user);
  }

  /**
   * List all users for a tenant
   */
  async findAllByTenant(tenantId: string) {
    const users = await this.prisma.user.findMany({
      where: { tenantId },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return users.map((u) => this.sanitizeUser(u));
  }

  /**
   * Find user by ID within tenant
   */
  async findById(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.sanitizeUser(user);
  }

  /**
   * Update staff user role/status
   */
  async updateUser(tenantId: string, userId: string, dto: UpdateUserDto, actorUserId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId },
      include: { userRoles: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updateData: any = {};
    if (dto.firstName) updateData.firstName = dto.firstName;
    if (dto.lastName) updateData.lastName = dto.lastName;
    if (dto.preferredLanguage) updateData.preferredLanguage = dto.preferredLanguage;
    if (typeof dto.isActive === 'boolean') updateData.isActive = dto.isActive;

    // Role update
    if (dto.roleSlug) {
      const newRole = await this.prisma.role.findFirst({
        where: {
          slug: dto.roleSlug,
          OR: [{ tenantId }, { tenantId: null }],
        },
      });

      if (!newRole) {
        throw new BadRequestException(`Role '${dto.roleSlug}' not found`);
      }

      // Remove existing role assignments and re-assign
      await this.prisma.userRole.deleteMany({
        where: { userId },
      });

      await this.prisma.userRole.create({
        data: {
          userId,
          roleId: newRole.id,
        },
      });
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      include: {
        userRoles: {
          include: { role: true },
        },
      },
    });

    await this.auditService.logAction({
      tenantId,
      userId: actorUserId,
      entityType: 'User',
      entityId: userId,
      action: 'UPDATE',
      oldValue: { isActive: user.isActive },
      newValue: updateData,
    });

    return this.sanitizeUser(updatedUser);
  }

  /**
   * List all available roles
   */
  async getRoles(tenantId: string) {
    return this.prisma.role.findMany({
      where: {
        OR: [{ tenantId }, { tenantId: null }],
      },
      include: {
        rolePermissions: {
          include: { permission: true },
        },
      },
    });
  }

  private sanitizeUser(user: any) {
    const { passwordHash, ...sanitized } = user;
    return {
      ...sanitized,
      roles: user.userRoles?.map((ur: any) => ur.role.slug) || [],
    };
  }
}
