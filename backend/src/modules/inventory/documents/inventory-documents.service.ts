import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { nextDocumentNumber } from '../../../common/sequences/document-sequence';
import type { InventoryDocType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../common/prisma';
import { AuditService } from '../../audit/audit.service';
import { JournalService } from '../../accounting/journal/journal.service';
import { CreateInventoryDocDto } from '../dto';
import { consumeFifoBatches, createFifoBatch } from '../fifo/fifo-batches';

@Injectable()
export class InventoryDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly journalService: JournalService,
  ) {}

  /**
   * Post Inventory Document (INBOUND, OUTBOUND, STOCKTAKING)
   * Executes atomic stock balance updates.
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

    // Atomic Prisma Transaction: stock levels, FIFO batches and the journal
    // entry commit together, or not at all.
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Document header; lines are added one by one so each line's id is
      //    known when its batch consumption is recorded.
      const doc = await tx.inventoryDocument.create({
        data: {
          tenantId,
          warehouseId: dto.warehouseId,
          docNumber,
          docType: dto.docType,
          docStatus: 'POSTED',
          comment: dto.comment,
          totalAmount: 0,
          createdById: userId,
        },
      });

      let totalAmount = 0;
      for (const [index, item] of dto.items.entries()) {
        const existingStock = await tx.stockLevel.findUnique({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId: dto.warehouseId,
              productId: item.productId,
            },
          },
        });
        const currentQuantity = existingStock
          ? Number(existingStock.quantity)
          : 0;

        // 2. Stock movement of this line (STOCKTAKING: counted - book)
        let delta: number;
        if (dto.docType === 'INBOUND') {
          delta = item.quantity;
        } else if (dto.docType === 'OUTBOUND') {
          if (currentQuantity < item.quantity) {
            throw new BadRequestException(
              `Insufficient stock for product ID ${item.productId}. Current: ${currentQuantity}, requested: ${item.quantity}`,
            );
          }
          delta = -item.quantity;
        } else {
          delta = Math.round((item.quantity - currentQuantity) * 1000) / 1000;
        }

        let unitPrice = item.unitPrice;
        let lineTotal = item.quantity * item.unitPrice;
        const line = await tx.inventoryDocumentItem.create({
          data: {
            documentId: doc.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice,
            totalPrice: lineTotal,
          },
        });

        // 3. FIFO cost layers: goods in become a batch at the line price,
        //    goods out consume the oldest batches at their cost.
        if (delta > 0) {
          await createFifoBatch(tx, {
            tenantId,
            warehouseId: dto.warehouseId,
            productId: item.productId,
            quantity: delta,
            unitCost: item.unitPrice,
            batchNumber: `${docNumber}-${index + 1}`,
          });
        } else if (delta < 0) {
          const allocation = await consumeFifoBatches(tx, {
            tenantId,
            warehouseId: dto.warehouseId,
            productId: item.productId,
            quantity: -delta,
            source: { inventoryDocumentItemId: line.id },
          });
          if (dto.docType === 'OUTBOUND') {
            // Goods leave at what they cost, not at a typed-in price.
            unitPrice = allocation.unitCost;
            lineTotal = allocation.totalCost;
            await tx.inventoryDocumentItem.update({
              where: { document: { tenantId }, id: line.id },
              data: { unitPrice, totalPrice: lineTotal },
            });
          }
        }
        totalAmount += lineTotal;

        await tx.stockLevel.upsert({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId: dto.warehouseId,
              productId: item.productId,
            },
          },
          update: { quantity: currentQuantity + delta },
          create: {
            tenantId,
            warehouseId: dto.warehouseId,
            productId: item.productId,
            quantity: currentQuantity + delta,
          },
        });
      }

      const posted = await tx.inventoryDocument.update({
        where: { tenantId, id: doc.id },
        data: { totalAmount: Math.round(totalAmount * 100) / 100 },
        include: {
          items: {
            include: { product: true },
          },
        },
      });

      // 4. Inbound documents post Dt 2910 / Kt 6010 in the same transaction
      if (dto.docType === 'INBOUND') {
        await this.journalService.autoPostInboundDoc(tenantId, posted, tx);
      }

      return posted;
    });

    // 4. Record Audit Log
    await this.auditService.logAction({
      tenantId,
      userId,
      entityType: 'InventoryDocument',
      entityId: result.id,
      action: 'CREATE',
      newValue: {
        docNumber,
        docType: dto.docType,
        totalAmount: result.totalAmount,
      },
    });

    return result;
  }

  async findAllByTenant(tenantId: string, docType?: string) {
    const where: Prisma.InventoryDocumentWhereInput = { tenantId };
    if (docType) {
      where.docType = docType as InventoryDocType;
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
    return nextDocumentNumber(
      this.prisma,
      tenantId,
      docType === 'INBOUND'
        ? 'INVENTORY_INBOUND'
        : docType === 'OUTBOUND'
          ? 'INVENTORY_OUTBOUND'
          : 'INVENTORY_STOCKTAKE',
    );
  }
}
