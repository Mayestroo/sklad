import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { type Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { OpeningBalancesService } from './opening-balances.service';
import { OpeningBalancesImportService } from './opening-balances-import.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateOpeningBalanceDto } from './dto/create-opening-balance.dto';
import { UpdateOpeningBalanceLinesDto } from './dto/update-opening-balance.dto';
import { UnpostOpeningBalanceDto } from './dto/unpost-opening-balance.dto';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('api/opening-balances')
export class OpeningBalancesController {
  constructor(
    private readonly service: OpeningBalancesService,
    private readonly importService: OpeningBalancesImportService,
  ) {}

  @Get()
  async findAll(@CurrentTenant() tenantId: string) {
    return this.service.findAll(tenantId);
  }

  @Get('template')
  async downloadTemplate(@Res() res: Response) {
    const buffer = await this.importService.generateTemplate();
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename=boshlangich_qoldiqlar_shablon.xlsx',
    );
    res.send(buffer);
  }

  @Get(':id')
  async findOne(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.service.findOne(tenantId, id);
  }

  @Post()
  async create(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Body() dto: CreateOpeningBalanceDto,
  ) {
    return this.service.create(tenantId, user.id, dto);
  }

  @Put(':id/lines')
  async updateLines(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateOpeningBalanceLinesDto,
  ) {
    return this.service.updateLines(tenantId, id, dto);
  }

  @Post(':id/review')
  async submitForReview(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.service.submitForReview(tenantId, id);
  }

  @Post(':id/post')
  async postDocument(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.service.post(tenantId, user.id, id);
  }

  @Post(':id/unpost')
  async unpostDocument(
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto?: UnpostOpeningBalanceDto,
  ) {
    return this.service.unpost(tenantId, user.id, id, dto);
  }

  @Delete(':id')
  async delete(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
  ) {
    return this.service.delete(tenantId, id);
  }

  @Post(':id/import-preview')
  @UseInterceptors(FileInterceptor('file'))
  async importPreview(
    @CurrentTenant() tenantId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Excel fayli yuklanmadi');
    return this.importService.validateAndParse(tenantId, file.buffer, file.originalname);
  }

  @Post(':id/import-commit')
  @UseInterceptors(FileInterceptor('file'))
  async importCommit(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Excel fayli yuklanmadi');
    const result = await this.importService.validateAndParse(
      tenantId,
      file.buffer,
      file.originalname,
    );

    if (result.errors.length > 0) {
      return {
        success: false,
        message: 'Faylda xatoliklar mavjud. Iltimos, xatoliklarni to‘g‘rilab qayta yuklang.',
        errors: result.errors,
      };
    }

    const lines = result.previewLines || [];
    const updated = await this.service.updateLines(tenantId, id, { lines: lines as any });

    return {
      success: true,
      message: `${lines.length} ta boshlang‘ich qoldiq qatori muvaffaqiyatli saqlandi`,
      document: updated,
    };
  }
}
