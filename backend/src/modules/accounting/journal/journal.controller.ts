import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JournalService } from './journal.service';
import { JournalQueryDto, ManualJournalEntryDto } from '../dto';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../../common/guards/tenant.guard';
import { PermissionsGuard } from '../../../common/guards/permissions.guard';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, TenantGuard, PermissionsGuard)
@Controller('api/accounting/journal')
export class JournalController {
  constructor(private readonly journalService: JournalService) {}

  @Get()
  @RequirePermissions('accounting:view')
  findAll(@CurrentTenant() tenantId: string, @Query() query: JournalQueryDto) {
    return this.journalService.findEntries(tenantId, query);
  }

  /** A manual entry (accountant only: accounting:create). */
  @Post()
  @RequirePermissions('accounting:create')
  create(
    @CurrentTenant() tenantId: string,
    @Body() dto: ManualJournalEntryDto,
    @CurrentUser('id') userId?: string,
  ) {
    return this.journalService.createManualEntry(tenantId, dto, userId);
  }
}
