import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { SuperAdminService } from './super-admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('api/super-admin')
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Get('metrics')
  @RequirePermissions('settings:view')
  getMetrics() {
    return this.superAdminService.getGlobalMetrics();
  }

  @Get('tenants')
  @RequirePermissions('settings:view')
  getAllTenants() {
    return this.superAdminService.getAllTenants();
  }

  @Put('tenants/:id')
  @RequirePermissions('settings:edit')
  updateTenant(
    @Param('id') id: string,
    @Body()
    body: {
      status?: 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
      plan?: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
    },
  ) {
    return this.superAdminService.updateTenant(id, body.status, body.plan);
  }

  @Get('announcements')
  getAnnouncements() {
    return this.superAdminService.getAnnouncements();
  }

  @Post('announcements')
  @RequirePermissions('settings:edit')
  createAnnouncement(
    @Body()
    body: {
      title: { uz: string; ru: string };
      message: { uz: string; ru: string };
    },
  ) {
    return this.superAdminService.createAnnouncement(body.title, body.message);
  }

  @Get('tickets')
  @RequirePermissions('settings:view')
  getTickets() {
    return this.superAdminService.getSupportTickets();
  }

  @Post('tickets/:id/reply')
  @RequirePermissions('settings:edit')
  replyTicket(@Param('id') id: string, @Body() body: { message: string }) {
    return this.superAdminService.replyTicket(id, body.message);
  }

  @Post('backups/trigger')
  @RequirePermissions('settings:edit')
  triggerBackup() {
    return this.superAdminService.triggerBackup();
  }

  @Get('backups/history')
  @RequirePermissions('settings:view')
  getBackupHistory() {
    return this.superAdminService.getBackupHistory();
  }

  @Get('audit-logs')
  @RequirePermissions('settings:view')
  getAuditLogs(@CurrentTenant() tenantId: string) {
    return this.superAdminService.getAuditLogs(tenantId);
  }
}
