import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('invite')
  @RequirePermissions('users:create')
  inviteUser(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.createUser(tenantId, dto, actorUserId);
  }

  @Post()
  @RequirePermissions('users:create')
  createUser(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Body() dto: CreateUserDto,
  ) {
    return this.usersService.createUser(tenantId, dto, actorUserId);
  }

  @Get('staff')
  @RequirePermissions('users:view')
  findStaff(@CurrentTenant() tenantId: string) {
    return this.usersService.findAllByTenant(tenantId);
  }

  @Get()
  @RequirePermissions('users:view')
  findAll(@CurrentTenant() tenantId: string) {
    return this.usersService.findAllByTenant(tenantId);
  }

  @Get('roles')
  @RequirePermissions('users:view')
  getRoles(@CurrentTenant() tenantId: string) {
    return this.usersService.getRoles(tenantId);
  }

  @Get(':id')
  @RequirePermissions('users:view')
  findById(@CurrentTenant() tenantId: string, @Param('id') userId: string) {
    return this.usersService.findById(tenantId, userId);
  }

  @Patch(':id/status')
  @RequirePermissions('users:edit')
  updateUserStatus(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Param('id') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateUser(tenantId, userId, dto, actorUserId);
  }

  @Patch(':id')
  @RequirePermissions('users:edit')
  updateUser(
    @CurrentTenant() tenantId: string,
    @CurrentUser('id') actorUserId: string,
    @Param('id') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateUser(tenantId, userId, dto, actorUserId);
  }
}
