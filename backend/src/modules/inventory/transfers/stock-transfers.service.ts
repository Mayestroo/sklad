import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { AuditService } from '../../audit/audit.service';
import { EventsGateway } from '../../../common/websockets/events.gateway';
import { JournalService } from '../../accounting/journal/journal.service';
import { CreateStockTransferDto } from '../dto';

@Injectable()
export class StockTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly eventsGateway: EventsGateway,
    private readonly journalService: JournalService,
  ) {}

  /**
   * Create Stock Transfer Order (Draft status)
   */
  async createTransfer(
    tenantId: string,
    dto: CreateStockTransferDto,
    userId: string,
  ) {
    if (dto.sourceWarehouseId === dto.targetWarehouseId) {
      throw new BadRequestException(
        'Source and target warehouses cannot be identical',
      );
    }

    const transferNumber = await this.generateTransferNumber(tenantId);

    const transfer = await this.prisma.stockTransfer.create({
      data: {
        tenantId,
        sourceWarehouseId: dto.sourceWarehouseId,
        targetWarehouseId: dto.targetWarehouseId,
        transferNumber,
        status: 'DRAFT',
        comment: dto.comment,
        createdById: userId,
        items: {
          create: dto.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        },
      },
      include: {
        sourceWarehouse: true,
        targetWarehouse: true,
        items: { include: { product: true } },
      },
    });

    return transfer;
  }

  /**
   * Step 1: Ship Transfer (Jo'natish)
   * Deducts stock from Source Warehouse, updates status to IN_TRANSIT,
   * and posts NAS Dt 2920 (In-Transit) / Kt 2910 (Source Warehouse) journal entry.
   */
  async shipTransfer(tenantId: string, id: string, userId: string) {
    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id, tenantId },
      include: {
        sourceWarehouse: true,
        targetWarehouse: true,
        items: { include: { product: true } },
      },
    });

    if (!transfer) {
      throw new NotFoundException('Stock Transfer not found');
    }

    if (transfer.status !== 'DRAFT') {
      throw new BadRequestException(
        `Transfer cannot be shipped from status: ${transfer.status}`,
      );
    }

    let totalCostValue = 0;

    // Atomic transaction: deduct source stock
    const updated = await this.prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        const stock = await tx.stockLevel.findUnique({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId: transfer.sourceWarehouseId,
              productId: item.productId,
            },
          },
        });

        const currentQty = stock ? Number(stock.quantity) : 0;
        const requestedQty = Number(item.quantity);

        if (currentQty < requestedQty) {
          throw new BadRequestException(
            `Insufficient stock in source warehouse for product ID ${item.productId}. Current: ${currentQty}, requested: ${requestedQty}`,
          );
        }

        await tx.stockLevel.update({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId: transfer.sourceWarehouseId,
              productId: item.productId,
            },
          },
          data: {
            quantity: currentQty - requestedQty,
          },
        });

        const costPrice = Number(item.product?.costPrice) || 0;
        totalCostValue += requestedQty * costPrice;
      }

      return tx.stockTransfer.update({
        where: { id },
        data: {
          status: 'IN_TRANSIT',
          shippedAt: new Date(),
        },
        include: {
          sourceWarehouse: true,
          targetWarehouse: true,
          items: { include: { product: true } },
        },
      });
    });

    // Auto-post NAS journal entry: Dt 2920 / Kt 2910
    try {
      await this.journalService.autoPostShipTransfer(
        tenantId,
        updated,
        totalCostValue,
      );
    } catch (err) {
      console.error(
        'Failed to auto-post journal entry for ship transfer:',
        err,
      );
    }

    // Audit log & WebSocket broadcast
    await this.auditService.logAction({
      tenantId,
      userId,
      entityType: 'StockTransfer',
      entityId: updated.id,
      action: 'UPDATE',
      newValue: {
        status: 'IN_TRANSIT',
        transferNumber: updated.transferNumber,
      },
    });

    this.eventsGateway.notifyStockUpdate(tenantId, {
      event: 'transfer_shipped',
      transferNumber: updated.transferNumber,
      updatedAt: new Date().toISOString(),
    });

    return updated;
  }

  /**
   * Step 2: Receive Transfer at Target Warehouse (Qabul Qilish)
   * Adds stock to Target Warehouse, updates status to RECEIVED,
   * and posts NAS Dt 2910 (Target Warehouse) / Kt 2920 (In-Transit) journal entry.
   */
  async receiveTransfer(tenantId: string, id: string, userId: string) {
    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id, tenantId },
      include: {
        sourceWarehouse: true,
        targetWarehouse: true,
        items: { include: { product: true } },
      },
    });

    if (!transfer) {
      throw new NotFoundException('Stock Transfer not found');
    }

    if (transfer.status !== 'IN_TRANSIT') {
      throw new BadRequestException(
        `Transfer cannot be received from status: ${transfer.status}`,
      );
    }

    let totalCostValue = 0;

    // Atomic transaction: add target stock
    const updated = await this.prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        const requestedQty = Number(item.quantity);

        const existingStock = await tx.stockLevel.findUnique({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId: transfer.targetWarehouseId,
              productId: item.productId,
            },
          },
        });

        const currentQty = existingStock ? Number(existingStock.quantity) : 0;
        const newQty = currentQty + requestedQty;

        await tx.stockLevel.upsert({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId: transfer.targetWarehouseId,
              productId: item.productId,
            },
          },
          update: { quantity: newQty },
          create: {
            tenantId,
            warehouseId: transfer.targetWarehouseId,
            productId: item.productId,
            quantity: newQty,
          },
        });

        const costPrice = Number(item.product?.costPrice) || 0;
        totalCostValue += requestedQty * costPrice;
      }

      return tx.stockTransfer.update({
        where: { id },
        data: {
          status: 'RECEIVED',
          receivedAt: new Date(),
        },
        include: {
          sourceWarehouse: true,
          targetWarehouse: true,
          items: { include: { product: true } },
        },
      });
    });

    // Auto-post NAS journal entry: Dt 2910 / Kt 2920
    try {
      await this.journalService.autoPostReceiveTransfer(
        tenantId,
        updated,
        totalCostValue,
      );
    } catch (err) {
      console.error(
        'Failed to auto-post journal entry for receive transfer:',
        err,
      );
    }

    // Audit log & WebSocket broadcast
    await this.auditService.logAction({
      tenantId,
      userId,
      entityType: 'StockTransfer',
      entityId: updated.id,
      action: 'UPDATE',
      newValue: { status: 'RECEIVED', transferNumber: updated.transferNumber },
    });

    this.eventsGateway.notifyStockUpdate(tenantId, {
      event: 'transfer_received',
      transferNumber: updated.transferNumber,
      updatedAt: new Date().toISOString(),
    });

    return updated;
  }

  async findAllByTenant(tenantId: string) {
    return this.prisma.stockTransfer.findMany({
      where: { tenantId },
      include: {
        sourceWarehouse: true,
        targetWarehouse: true,
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        items: { include: { product: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async generateTransferNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.stockTransfer.count({
      where: { tenantId },
    });
    const nextSeq = (count + 1).toString().padStart(6, '0');
    return `TR-${nextSeq}`;
  }
}
