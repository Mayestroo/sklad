import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { Prisma } from '@prisma/client';

export interface StockAvailability {
  productId: string;
  warehouseId: string;
  physicalStock: number;
  reservedStock: number;
  freeStock: number;
}

export interface ReservationResult {
  orderItemId: string;
  productId: string;
  requestedQty: number;
  reservedQty: number;
  remainingGap: number;
}

@Injectable()
export class StockReservationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get free available stock for a specific product in a warehouse
   * Free Stock = Physical Stock - Active Reservations
   */
  async getFreeStock(
    tenantId: string,
    warehouseId: string,
    productId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<StockAvailability> {
    const client = tx || this.prisma;

    const stockLevel = await client.stockLevel.findUnique({
      where: {
        tenantId_warehouseId_productId: {
          tenantId,
          warehouseId,
          productId,
        },
      },
    });

    const physicalStock = Number(stockLevel?.quantity || 0);
    const reservedStock = Number(stockLevel?.reservedQuantity || 0);
    const freeStock = Math.max(0, physicalStock - reservedStock);

    return {
      productId,
      warehouseId,
      physicalStock,
      reservedStock,
      freeStock,
    };
  }

  /**
   * Get free stock for multiple products in a warehouse
   */
  async getWarehouseStockAvailability(
    tenantId: string,
    warehouseId: string,
    productIds?: string[],
  ): Promise<Record<string, StockAvailability>> {
    const where: Prisma.StockLevelWhereInput = {
      tenantId,
      warehouseId,
    };

    if (productIds && productIds.length > 0) {
      where.productId = { in: productIds };
    }

    const stockLevels = await this.prisma.stockLevel.findMany({
      where,
    });

    const result: Record<string, StockAvailability> = {};
    for (const sl of stockLevels) {
      const physical = Number(sl.quantity || 0);
      const reserved = Number(sl.reservedQuantity || 0);
      result[sl.productId] = {
        productId: sl.productId,
        warehouseId: sl.warehouseId,
        physicalStock: physical,
        reservedStock: reserved,
        freeStock: Math.max(0, physical - reserved),
      };
    }

    return result;
  }

  /**
   * Auto-reserve stock for a confirmed Sales Order
   * Reserves available free stock up to requested quantity and returns remaining gap for production.
   */
  async reserveStockForOrder(
    tenantId: string,
    orderId: string,
    warehouseId: string,
    items: { orderItemId: string; productId: string; quantity: number }[],
    tx?: Prisma.TransactionClient,
  ): Promise<ReservationResult[]> {
    const client = tx || this.prisma;
    const results: ReservationResult[] = [];

    for (const item of items) {
      const availability = await this.getFreeStock(tenantId, warehouseId, item.productId, client);
      const toReserve = Math.min(availability.freeStock, item.quantity);
      const remainingGap = Math.max(0, item.quantity - toReserve);

      if (toReserve > 0) {
        // Create or update StockReservation record
        await client.stockReservation.create({
          data: {
            tenantId,
            orderId,
            productId: item.productId,
            warehouseId,
            quantity: toReserve,
          },
        });

        // Increment StockLevel reservedQuantity
        await client.stockLevel.upsert({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId,
              productId: item.productId,
            },
          },
          update: {
            reservedQuantity: {
              increment: toReserve,
            },
          },
          create: {
            tenantId,
            warehouseId,
            productId: item.productId,
            quantity: 0,
            reservedQuantity: toReserve,
          },
        });

        // Update SalesOrderItem reservedQty
        await client.salesOrderItem.update({
          where: { id: item.orderItemId },
          data: {
            reservedQty: toReserve,
          },
        });
      }

      results.push({
        orderItemId: item.orderItemId,
        productId: item.productId,
        requestedQty: item.quantity,
        reservedQty: toReserve,
        remainingGap,
      });
    }

    return results;
  }

  /**
   * Release all stock reservations for a given Sales Order (upon cancellation)
   */
  async releaseOrderReservations(
    tenantId: string,
    orderId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx || this.prisma;

    const reservations = await client.stockReservation.findMany({
      where: { tenantId, orderId },
    });

    for (const res of reservations) {
      const qty = Number(res.quantity);
      if (qty > 0) {
        await client.stockLevel.updateMany({
          where: {
            tenantId,
            warehouseId: res.warehouseId,
            productId: res.productId,
          },
          data: {
            reservedQuantity: {
              decrement: qty,
            },
          },
        });
      }
    }

    await client.stockReservation.deleteMany({
      where: { tenantId, orderId },
    });

    await client.salesOrderItem.updateMany({
      where: { orderId },
      data: {
        reservedQty: 0,
      },
    });
  }

  /**
   * Consume reservation on warehouse dispatch
   */
  async consumeReservation(
    tenantId: string,
    orderId: string,
    warehouseId: string,
    productId: string,
    dispatchedQty: number,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx || this.prisma;

    const reservation = await client.stockReservation.findFirst({
      where: {
        tenantId,
        orderId,
        warehouseId,
        productId,
      },
    });

    if (reservation) {
      const currentResQty = Number(reservation.quantity);
      const consumedQty = Math.min(currentResQty, dispatchedQty);

      if (consumedQty > 0) {
        // Decrement StockLevel reservedQuantity
        await client.stockLevel.updateMany({
          where: {
            tenantId,
            warehouseId,
            productId,
          },
          data: {
            reservedQuantity: {
              decrement: consumedQty,
            },
          },
        });

        if (currentResQty <= consumedQty) {
          await client.stockReservation.delete({
            where: { id: reservation.id },
          });
        } else {
          await client.stockReservation.update({
            where: { id: reservation.id },
            data: {
              quantity: {
                decrement: consumedQty,
              },
            },
          });
        }
      }
    }
  }
}
