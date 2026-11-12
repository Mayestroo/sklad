import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { nextDocumentNumber } from '../../../common/sequences/document-sequence';
import { consumeFifoBatches, createFifoBatch } from '../fifo/fifo-batches';
import { PrismaService } from '../../../common/prisma';
import { AuditService } from '../../audit/audit.service';
import { JournalService } from '../../accounting/journal/journal.service';
import { CreateStockTransferDto } from '../dto';

@Injectable()
export class StockTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
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

        // Goods leave the source at their FIFO batch cost; the consumption is
        // recorded so receipt can recreate the same cost layers.
        const allocation = await consumeFifoBatches(tx, {
          tenantId,
          warehouseId: transfer.sourceWarehouseId,
          productId: item.productId,
          quantity: requestedQty,
          source: { stockTransferItemId: item.id },
        });
        totalCostValue += allocation.totalCost;
      }
      totalCostValue = Math.round(totalCostValue * 100) / 100;

      const shipped = await tx.stockTransfer.update({
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

      // Dt 2920 / Kt 2910 commits with the stock movement
      await this.journalService.autoPostShipTransfer(
        tenantId,
        shipped,
        totalCostValue,
        tx,
      );

      return shipped;
    });

    // Audit log
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

        // Recreate exactly the cost layers that left the source, keeping each
        // batch's FIFO age, so 2920 (in transit) nets to zero.
        const shippedLayers = await tx.batchConsumption.findMany({
          where: { tenantId, stockTransferItemId: item.id },
          include: { batch: { select: { createdAt: true } } },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        const shippedQty = shippedLayers.reduce(
          (sum, layer) => sum + Number(layer.quantity),
          0,
        );
        if (Math.abs(shippedQty - requestedQty) > 0.0005) {
          throw new BadRequestException(
            `Jo'natilgan partiyalar (${shippedQty}) ko'chirish miqdoriga (${requestedQty}) mos emas`,
          );
        }
        for (const [index, layer] of shippedLayers.entries()) {
          await createFifoBatch(tx, {
            tenantId,
            warehouseId: transfer.targetWarehouseId,
            productId: item.productId,
            quantity: Number(layer.quantity),
            unitCost: Number(layer.unitCost),
            batchNumber: `${transfer.transferNumber}-${index + 1}`,
            createdAt: layer.batch.createdAt,
          });
          totalCostValue += Number(layer.quantity) * Number(layer.unitCost);
        }
      }
      totalCostValue = Math.round(totalCostValue * 100) / 100;

      const received = await tx.stockTransfer.update({
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

      // Dt 2910 / Kt 2920 commits with the stock movement
      await this.journalService.autoPostReceiveTransfer(
        tenantId,
        received,
        totalCostValue,
        tx,
      );

      return received;
    });

    // Audit log
    await this.auditService.logAction({
      tenantId,
      userId,
      entityType: 'StockTransfer',
      entityId: updated.id,
      action: 'UPDATE',
      newValue: { status: 'RECEIVED', transferNumber: updated.transferNumber },
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

  /**
   * Delete draft stock transfer
   */
  async deleteTransfer(tenantId: string, id: string, userId: string) {
    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id, tenantId },
    });

    if (!transfer) {
      throw new NotFoundException('Stock Transfer not found');
    }

    if (transfer.status !== 'DRAFT') {
      throw new BadRequestException(
        "Faqat 'DRAFT' (qoralama) holatidagi ko'chirishlarni o'chirish mumkin",
      );
    }

    await this.prisma.stockTransferItem.deleteMany({
      where: { transferId: id },
    });

    await this.prisma.stockTransfer.delete({
      where: { id },
    });

    await this.auditService.logAction({
      tenantId,
      userId,
      entityType: 'StockTransfer',
      entityId: id,
      action: 'DELETE',
      oldValue: { transferNumber: transfer.transferNumber },
      newValue: null,
    });

    return { success: true, message: "O'tkazma muvaffaqiyatli o'chirildi" };
  }

  private async generateTransferNumber(tenantId: string): Promise<string> {
    return nextDocumentNumber(this.prisma, tenantId, 'STOCK_TRANSFER');
  }
}
