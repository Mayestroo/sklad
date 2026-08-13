import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { JournalService } from './journal.service';
import { CreateJournalEntryDto } from '../dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('api/accounting/journal')
export class JournalController {
  constructor(private readonly journalService: JournalService) {}

  @Get()
  @RequirePermissions('accounting:view')
  findAll(@CurrentTenant() tenantId: string) {
    return this.journalService.findAllByTenant(tenantId);
  }

  @Post()
  @RequirePermissions('accounting:create')
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: CreateJournalEntryDto,
  ) {
    return this.journalService.createJournalEntry(tenantId, dto);
  }
}
