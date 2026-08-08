import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { AuditService } from '../../audit/audit.service';
import { EventsGateway } from '../../../common/websockets/events.gateway';
import { JournalService } from '../../accounting/journal/journal.service';
import { CreateSalesInvoiceDto } from '../dto';

@Injectable()
export class SalesInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly eventsGateway: EventsGateway,
    private readonly journalService: JournalService,
  ) {}

  /**
   * Post Sales Invoice (Hisob-faktura)
   * Deducts warehouse stock, calculates 12% VAT, updates counterparty debt balance,
   * and automatically posts Double-Entry Journal Entries (Module 4 Integration)
   */
  async createAndPostInvoice(
    tenantId: string,
    dto: CreateSalesInvoiceDto,
    userId: string,
  ) {
    const counterparty = await this.prisma.counterparty.findFirst({
      where: { id: dto.counterpartyId, tenantId },
    });

    if (!counterparty) {
      throw new NotFoundException('Counterparty not found');
    }

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { id: dto.warehouseId, tenantId },
    });

    if (!warehouse) {
      throw new NotFoundException('Warehouse not found');
    }

    const invoiceNumber = await this.generateInvoiceNumber(tenantId);

    // Calculate line items, subtotal, VAT 12%, and total
    let subtotalAmount = 0;
    let vatAmount = 0;

    const processedItems = dto.items.map((item) => {
      const lineSubtotal = item.quantity * item.unitPrice;
      const lineVat = lineSubtotal * 0.12; // 12% UZ VAT
      const lineTotal = lineSubtotal + lineVat;

      subtotalAmount += lineSubtotal;
      vatAmount += lineVat;

      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        vatAmount: lineVat,
        totalPrice: lineTotal,
      };
    });

    const totalAmount = subtotalAmount + vatAmount;

    // Atomic Prisma Transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create SalesInvoice header and items
      const invoice = await tx.salesInvoice.create({
        data: {
          tenantId,
          warehouseId: dto.warehouseId,
          counterpartyId: dto.counterpartyId,
          invoiceNumber,
          status: 'SENT',
          subtotalAmount,
          vatAmount,
          totalAmount,
          paidAmount: 0,
          createdById: userId,
          items: {
            create: processedItems,
          },
        },
        include: {
          counterparty: true,
          warehouse: true,
          items: { include: { product: true } },
        },
      });

      // 2. Deduct warehouse stock for each line item (Module 2 Integration)
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

        const currentQty = existingStock ? Number(existingStock.quantity) : 0;
        if (currentQty < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for product ID ${item.productId}. Current: ${currentQty}, required: ${item.quantity}`,
          );
        }

        await tx.stockLevel.update({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId: dto.warehouseId,
              productId: item.productId,
            },
          },
          data: {
            quantity: currentQty - item.quantity,
          },
        });
      }

      // 3. Update Counterparty debt balance
      await tx.counterparty.update({
        where: { id: dto.counterpartyId },
        data: {
          debtBalance: {
            increment: totalAmount,
          },
        },
      });

      return invoice;
    });

    // 4. Module 4 Integration: Auto-post NAS double-entry journal (Dt 4010 / Kt 9010, Dt 4010 / Kt 6410, Dt 9110 / Kt 2910)
    try {
      await this.journalService.autoPostSalesInvoice(tenantId, result);
    } catch (err) {
      console.error('Failed to auto-post journal entry for invoice:', err);
    }

    // Audit Log
    await this.auditService.logAction({
      tenantId,
      userId,
      entityType: 'SalesInvoice',
      entityId: result.id,
      action: 'CREATE',
      newValue: { invoiceNumber, totalAmount, counterparty: counterparty.name },
    });

    // WebSocket Broadcast
    this.eventsGateway.notifyTenant(tenantId, 'sales_invoice_posted', {
      invoiceNumber,
      totalAmount,
      updatedAt: new Date().toISOString(),
    });

    return result;
  }

  async findAllByTenant(tenantId: string) {
    return this.prisma.salesInvoice.findMany({
      where: { tenantId },
      include: {
        counterparty: true,
        warehouse: true,
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        items: { include: { product: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(tenantId: string, id: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id, tenantId },
      include: {
        counterparty: true,
        warehouse: true,
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        items: { include: { product: true } },
        payments: true,
      },
    });

    if (!invoice) {
      throw new NotFoundException('Sales Invoice not found');
    }

    return invoice;
  }

  private async generateInvoiceNumber(tenantId: string): Promise<string> {
    const count = await this.prisma.salesInvoice.count({ where: { tenantId } });
    const nextSeq = (count + 1).toString().padStart(6, '0');
    return `INV-${nextSeq}`;
  }
}
