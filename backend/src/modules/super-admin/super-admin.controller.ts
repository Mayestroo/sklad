import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SuperAdminService, CreateTenantDto } from './super-admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('api/super-admin')
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Get('metrics')
  getMetrics() {
    return this.superAdminService.getGlobalMetrics();
  }

  @Get('tenants')
  getAllTenants() {
    return this.superAdminService.getAllTenants();
  }

  @Post('tenants')
  createTenant(@Body() body: CreateTenantDto) {
    return this.superAdminService.createTenant(body);
  }

  @Put('tenants/:id')
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

  @Post('impersonate/:tenantId')
  impersonateTenant(
    @CurrentUser('id') superAdminId: string,
    @Param('tenantId') tenantId: string,
  ) {
    return this.superAdminService.impersonateTenant(superAdminId, tenantId);
  }

  @Get('announcements')
  getAnnouncements() {
    return this.superAdminService.getAnnouncements();
  }

  @Post('announcements')
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
  getTickets() {
    return this.superAdminService.getSupportTickets();
  }

  @Post('tickets/:id/reply')
  replyTicket(@Param('id') id: string, @Body() body: { message: string }) {
    return this.superAdminService.replyTicket(id, body.message);
  }

  @Post('backups/trigger')
  triggerBackup() {
    return this.superAdminService.triggerBackup();
  }

  @Get('backups/history')
  getBackupHistory() {
    return this.superAdminService.getBackupHistory();
  }

  @Get('audit-logs')
  getAuditLogs(@Query('tenantId') tenantId?: string) {
    return this.superAdminService.getAuditLogs(tenantId);
  }
}
