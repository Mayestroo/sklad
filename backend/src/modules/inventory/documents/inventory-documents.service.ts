import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { AuditService } from '../../audit/audit.service';
import { EventsGateway } from '../../../common/websockets/events.gateway';
import { JournalService } from '../../accounting/journal/journal.service';
import { CreateInventoryDocDto } from '../dto';

@Injectable()
export class InventoryDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly eventsGateway: EventsGateway,
    private readonly journalService: JournalService,
  ) {}

  /**
   * Post Inventory Document (INBOUND, OUTBOUND, STOCKTAKING)
   * Executes atomic stock balance updates and triggers WebSockets.
   */
  async createAndPostDocument(
    tenantId: string,
    dto: CreateInventoryDocDto,
    userId: string,
  ) {
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, tenantId },
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    const docNumber = await this.generateDocNumber(tenantId, dto.docType);

    // Compute total amount
    const totalAmount = dto.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );

    // Atomic Prisma Transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create Document header
      const doc = await tx.inventoryDocument.create({
        data: {
          tenantId,
          warehouseId: dto.warehouseId,
          docNumber,
          docType: dto.docType,
          docStatus: 'POSTED',
          comment: dto.comment,
          totalAmount,
          createdById: userId,
          items: {
            create: dto.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.quantity * item.unitPrice,
            })),
          },
        },
        include: {
          items: {
            include: { product: true },
          },
        },
      });

      // 2. Update Warehouse Stock Levels per line item
      for (const item of dto.items) {
        const existingStock = await tx.stockLevel.findUnique({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId: dto.warehouseId,
              productId: item.productId,
            },
          },
        });

        let newQuantity = existingStock ? Number(existingStock.quantity) : 0;

        if (dto.docType === 'INBOUND') {
          newQuantity += item.quantity;
        } else if (dto.docType === 'OUTBOUND') {
          if (newQuantity < item.quantity) {
            throw new BadRequestException(
              `Insufficient stock for product ID ${item.productId}. Current: ${newQuantity}, requested: ${item.quantity}`,
            );
          }
          newQuantity -= item.quantity;
        } else if (dto.docType === 'STOCKTAKING') {
          // Physical count adjustment
          newQuantity = item.quantity;
        }

        await tx.stockLevel.upsert({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId: dto.warehouseId,
              productId: item.productId,
            },
          },
          update: { quantity: newQuantity },
          create: {
            tenantId,
            warehouseId: dto.warehouseId,
            productId: item.productId,
            quantity: newQuantity,
          },
        });
      }

      return doc;
    });

    // 3. Auto-post NAS double-entry journal for Inbound (Dt 2910 / Kt 6010)
    if (dto.docType === 'INBOUND') {
      try {
        await this.journalService.autoPostInboundDoc(tenantId, result);
      } catch (err) {
        console.error(
          'Failed to auto-post journal entry for inbound document:',
          err,
        );
      }
    }

    // 4. Record Audit Log
    await this.auditService.logAction({
      tenantId,
      userId,
      entityType: 'InventoryDocument',
      entityId: result.id,
      action: 'CREATE',
      newValue: { docNumber, docType: dto.docType, totalAmount },
    });

    // 5. Broadcast Real-Time Stock Update over WebSockets
    this.eventsGateway.notifyStockUpdate(tenantId, {
      event: 'inventory_posted',
      warehouseId: dto.warehouseId,
      docNumber,
      docType: dto.docType,
      updatedAt: new Date().toISOString(),
    });

    return result;
  }

  async findAllByTenant(tenantId: string, docType?: string) {
    const where: any = { tenantId };
    if (docType) {
      where.docType = docType;
    }

    return this.prisma.inventoryDocument.findMany({
      where,
      include: {
        warehouse: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        items: {
          include: { product: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(tenantId: string, id: string) {
    const doc = await this.prisma.inventoryDocument.findFirst({
      where: { id, tenantId },
      include: {
        warehouse: true,
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        items: {
          include: { product: true },
        },
      },
    });

    if (!doc) {
      throw new NotFoundException('Inventory document not found');
    }

    return doc;
  }

  private async generateDocNumber(
    tenantId: string,
    docType: string,
  ): Promise<string> {
    const count = await this.prisma.inventoryDocument.count({
      where: { tenantId, docType: docType as any },
    });

    const prefix =
      docType === 'INBOUND' ? 'IN' : docType === 'OUTBOUND' ? 'OUT' : 'ST';
    const nextSeq = (count + 1).toString().padStart(6, '0');
    return `${prefix}-${nextSeq}`;
  }
}
