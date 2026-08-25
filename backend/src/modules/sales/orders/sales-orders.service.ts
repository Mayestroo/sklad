import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { StockReservationService } from '../../inventory/stock-reservation/stock-reservation.service';
import { CreateSalesOrderDto } from '../dto/create-sales-order.dto';
import { FilterSalesOrdersDto } from '../dto/filter-sales-orders.dto';
import { DispatchSalesOrderDto } from '../dto/dispatch-sales-order.dto';
import {
  Prisma,
  SalesOrderStatus,
  PaymentCondition,
  ProductionOrderStatus,
  SalesDocStatus,
  SalesPaymentStatus,
  SalesReturnStatus,
} from '@prisma/client';

function isAdmin(roles: string[]) {
  return roles.some((r) => ['ADMIN', 'SUPER_ADMIN'].includes(r));
}
function isManagerOrAbove(roles: string[]) {
  return roles.some((r) => ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(r));
}

@Injectable()
export class SalesOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockReservationService: StockReservationService,
  ) {}

  // ─── NUMBER GENERATOR ──────────────────────────────────────────

  private async generateOrderNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `Z-${year}-`;
    const count = await this.prisma.salesOrder.count({
      where: { tenantId, orderNumber: { startsWith: prefix } },
    });
    return `${prefix}${(count + 1).toString().padStart(4, '0')}`;
  }

  // ─── DISPATCH GATE HELPER ──────────────────────────────────────

  private computeGateStatus(order: {
    paymentCondition: PaymentCondition;
    paidAmount: any;
    totalAmount: any;
    requiredPaymentPercent: any;
  }): 'OPEN' | 'SATISFIED' | 'BYPASSED' {
    if (order.paymentCondition === PaymentCondition.CREDIT) return 'BYPASSED';
    const paid = Number(order.paidAmount);
    const total = Number(order.totalAmount);
    if (order.paymentCondition === PaymentCondition.PREPAID_100) {
      return paid >= total ? 'SATISFIED' : 'OPEN';
    }
    // PARTIAL
    const requiredPct = Number(order.requiredPaymentPercent || 0);
    const requiredAmount = (total * requiredPct) / 100;
    return paid >= requiredAmount ? 'SATISFIED' : 'OPEN';
  }

  private isGateSatisfied(order: {
    paymentCondition: PaymentCondition;
    paidAmount: any;
    totalAmount: any;
    requiredPaymentPercent: any;
  }): boolean {
    return this.computeGateStatus(order) !== 'OPEN';
  }

  private buildOrderInclude() {
    return {
      counterparty: true,
      priceList: true,
      warehouse: true,
      assignedSeller: { select: { id: true, firstName: true, lastName: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      items: {
        include: {
          product: true,
          productionOrders: true,
        },
      },
      productionOrders: {
        include: {
          product: true,
          assignedTo: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      payments: {
        orderBy: { createdAt: 'desc' as const },
      },
      salesInvoices: {
        select: {
          id: true,
          invoiceNumber: true,
          status: true,
          totalAmount: true,
          totalCogs: true,
          grossProfit: true,
          createdAt: true,
        },
      },
      reservations: {
        include: {
          warehouse: true,
          product: true,
        },
      },
    };
  }

  private enrichOrder(order: any) {
    let hasBelowCost = false;
    const itemsWithComputed = (order.items || []).map((item: any) => {
      const qty = Number(item.quantity);
      const ready = Number(item.readyQty || 0);
      const shipped = Number(item.shippedQty || 0);
      const reserved = Number(item.reservedQty || 0);
      const cost = Number(item.product?.costPrice || 0);
      const effectivePrice = Number(item.unitPrice) * (1 - Number(item.discount || 0) / 100);
      const isBelowCost = cost > 0 && effectivePrice < cost;
      if (isBelowCost) hasBelowCost = true;

      return {
        ...item,
        unreadyQty: Math.max(0, qty - ready),
        remainingQty: Math.max(0, qty - shipped),
        reservedQty: reserved,
        shippedQty: shipped,
        isBelowCost,
      };
    });

    const paid = Number(order.paidAmount);
    const total = Number(order.totalAmount);
    const paymentPercent = total > 0 ? Math.round((paid / total) * 100 * 100) / 100 : 0;

    return {
      ...order,
      items: itemsWithComputed,
      remainingAmount: Math.max(0, total - paid),
      paymentPercent,
      hasBelowCost,
      gateStatus: this.computeGateStatus(order),
    };
  }

  // ─── LIST ──────────────────────────────────────────────────────

  async findAll(tenantId: string, filters: FilterSalesOrdersDto) {
    const where: Prisma.SalesOrderWhereInput = { tenantId };

    if (filters.search) {
      where.OR = [
        { orderNumber: { contains: filters.search, mode: 'insensitive' } },
        { counterparty: { name: { contains: filters.search, mode: 'insensitive' } } },
        { deliveryAddress: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.counterpartyId) where.counterpartyId = filters.counterpartyId;
    if (filters.status) where.status = filters.status as SalesOrderStatus;
    if (filters.assignedSellerId) where.assignedSellerId = filters.assignedSellerId;

    if (filters.dateFrom || filters.dateTo) {
      where.orderDate = {};
      if (filters.dateFrom) where.orderDate.gte = new Date(filters.dateFrom);
      if (filters.dateTo) where.orderDate.lte = new Date(filters.dateTo);
    }
    if (filters.deliveryDateFrom || filters.deliveryDateTo) {
      where.deliveryDate = {};
      if (filters.deliveryDateFrom) where.deliveryDate.gte = new Date(filters.deliveryDateFrom);
      if (filters.deliveryDateTo) where.deliveryDate.lte = new Date(filters.deliveryDateTo);
    }

    if (filters.productId) {
      where.items = { some: { productId: filters.productId } };
    }

    const orders = await this.prisma.salesOrder.findMany({
      where,
      include: this.buildOrderInclude(),
      orderBy: { createdAt: 'desc' },
      skip: filters.skip || 0,
      take: filters.take || 50,
    });

    const total = await this.prisma.salesOrder.count({ where });

    let enriched = orders.map((o) => this.enrichOrder(o));

    if (filters.paymentStatus) {
      enriched = enriched.filter((o) => {
        const paid = Number(o.paidAmount);
        const tot = Number(o.totalAmount);
        if (filters.paymentStatus === 'PAID') return paid >= tot && tot > 0;
        if (filters.paymentStatus === 'PARTIALLY_PAID') return paid > 0 && paid < tot;
        if (filters.paymentStatus === 'UNPAID') return paid === 0;
        return true;
      });
    }

    return {
      data: enriched,
      total,
      page: Math.floor((filters.skip || 0) / (filters.take || 50)) + 1,
      pageSize: filters.take || 50,
    };
  }

  // ─── STATS / PIPELINE COUNTERS ────────────────────────────────

  async getStats(tenantId: string) {
    const [
      newCount,
      pendingApprovalCount,
      approvedCount,
      sentToProdCount,
      inProdCount,
      partiallyReadyCount,
      readyCount,
      awaitingPaymentCount,
      paymentConfirmedCount,
      readyToShipCount,
      partiallyShippedCount,
      shippedCount,
      completedCount,
      cancelledCount,
      financials,
    ] = await Promise.all([
      this.prisma.salesOrder.count({ where: { tenantId, status: SalesOrderStatus.NEW } }),
      this.prisma.salesOrder.count({ where: { tenantId, status: SalesOrderStatus.PENDING_APPROVAL } }),
      this.prisma.salesOrder.count({ where: { tenantId, status: SalesOrderStatus.APPROVED } }),
      this.prisma.salesOrder.count({ where: { tenantId, status: SalesOrderStatus.SENT_TO_PRODUCTION } }),
      this.prisma.salesOrder.count({ where: { tenantId, status: SalesOrderStatus.IN_PRODUCTION } }),
      this.prisma.salesOrder.count({ where: { tenantId, status: SalesOrderStatus.PARTIALLY_READY } }),
      this.prisma.salesOrder.count({ where: { tenantId, status: SalesOrderStatus.READY } }),
      this.prisma.salesOrder.count({ where: { tenantId, status: SalesOrderStatus.AWAITING_PAYMENT } }),
      this.prisma.salesOrder.count({ where: { tenantId, status: SalesOrderStatus.PAYMENT_CONFIRMED } }),
      this.prisma.salesOrder.count({ where: { tenantId, status: SalesOrderStatus.READY_TO_SHIP } }),
      this.prisma.salesOrder.count({ where: { tenantId, status: SalesOrderStatus.PARTIALLY_SHIPPED } }),
      this.prisma.salesOrder.count({ where: { tenantId, status: SalesOrderStatus.SHIPPED } }),
      this.prisma.salesOrder.count({ where: { tenantId, status: SalesOrderStatus.COMPLETED } }),
      this.prisma.salesOrder.count({ where: { tenantId, status: SalesOrderStatus.CANCELLED } }),
      this.prisma.salesOrder.aggregate({
        where: { tenantId, status: { not: SalesOrderStatus.CANCELLED } },
        _sum: { totalAmount: true, paidAmount: true },
      }),
    ]);

    const totalOrdersAmount = Number(financials._sum.totalAmount || 0);
    const totalCollectedAmount = Number(financials._sum.paidAmount || 0);

    return {
      new: newCount,
      pendingApproval: pendingApprovalCount,
      approved: approvedCount,
      sentToProduction: sentToProdCount,
      inProduction: inProdCount,
      partiallyReady: partiallyReadyCount,
      ready: readyCount,
      awaitingPayment: awaitingPaymentCount,
      paymentConfirmed: paymentConfirmedCount,
      readyToShip: readyToShipCount,
      partiallyShipped: partiallyShippedCount,
      shipped: shippedCount,
      completed: completedCount,
      cancelled: cancelledCount,
      activeOrders:
        newCount +
        pendingApprovalCount +
        approvedCount +
        sentToProdCount +
        inProdCount +
        partiallyReadyCount +
        readyCount +
        awaitingPaymentCount +
        paymentConfirmedCount +
        readyToShipCount +
        partiallyShippedCount,
      totalOrdersAmount,
      totalCollectedAmount,
      outstandingAmount: Math.max(0, totalOrdersAmount - totalCollectedAmount),
    };
  }

  async getDashboardStats(tenantId: string) {
    return this.getStats(tenantId);
  }

  // ─── FIND ONE ──────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id, tenantId },
      include: this.buildOrderInclude(),
    });
    if (!order) throw new NotFoundException('Buyurtma topilmadi');

    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        tenantId,
        entityType: 'SalesOrder',
        entityId: id,
      },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      ...this.enrichOrder(order),
      auditLogs,
    };
  }

  // ─── CREATE ────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, userRoles: string[], dto: CreateSalesOrderDto) {
    if (!dto.items?.length) {
      throw new BadRequestException('Buyurtmada kamida bitta tovar tanlanishi shart');
    }

    const orderNumber = await this.generateOrderNumber(tenantId);

    let subtotalAmount = 0;
    let discountAmount = 0;
    let isAnyBelowCost = false;

    // Fetch products to verify pricing vs cost
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, tenantId },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const preparedItems = dto.items.map((item) => {
      const lineSubtotal = item.quantity * item.unitPrice;
      const disc = item.discount || 0;
      subtotalAmount += lineSubtotal;
      discountAmount += disc;

      const prd = productMap.get(item.productId);
      const cost = Number(prd?.costPrice || 0);
      const effectivePrice = item.unitPrice * (1 - disc / 100);
      if (cost > 0 && effectivePrice < cost) {
        isAnyBelowCost = true;
      }

      return {
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: disc,
        totalPrice: Math.max(0, lineSubtotal - disc),
        reservedQty: 0,
        readyQty: 0,
        shippedQty: 0,
      };
    });

    const totalAmount = Math.max(0, subtotalAmount - discountAmount);

    // If below cost and not manager, enforce PENDING_APPROVAL
    const initialStatus =
      isAnyBelowCost && !isManagerOrAbove(userRoles)
        ? SalesOrderStatus.PENDING_APPROVAL
        : SalesOrderStatus.NEW;

    const order = await this.prisma.salesOrder.create({
      data: {
        tenantId,
        orderNumber,
        counterpartyId: dto.counterpartyId,
        currency: dto.currency || 'UZS',
        exchangeRate: dto.exchangeRate || 1,
        paymentCondition: dto.paymentCondition as PaymentCondition,
        requiredPaymentPercent:
          dto.paymentCondition === 'PARTIAL' ? dto.requiredPaymentPercent : null,
        deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : null,
        deliveryAddress: dto.deliveryAddress || null,
        comment: dto.comment || null,
        priceListId: dto.priceListId || null,
        warehouseId: dto.warehouseId || null,
        assignedSellerId: dto.assignedSellerId || null,
        createdById: userId,
        status: initialStatus,
        subtotalAmount,
        discountAmount,
        totalAmount,
        paidAmount: 0,
        items: { create: preparedItems },
      },
      include: this.buildOrderInclude(),
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        userId,
        entityType: 'SalesOrder',
        entityId: order.id,
        action: 'CREATE',
        newValue: {
          status: initialStatus,
          orderNumber,
          isBelowCost: isAnyBelowCost,
        },
      },
    });

    return this.enrichOrder(order);
  }

  // ─── UPDATE (only in NEW or PENDING_APPROVAL) ──────────────────

  async update(
    tenantId: string,
    userId: string,
    id: string,
    dto: Partial<CreateSalesOrderDto>,
  ) {
    const order = await this.prisma.salesOrder.findFirst({ where: { id, tenantId } });
    if (!order) throw new NotFoundException('Buyurtma topilmadi');
    if (order.status !== SalesOrderStatus.NEW && order.status !== SalesOrderStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        "Faqat 'Yangi' yoki 'Tasdiqlashda' statusidagi buyurtmani tahrirlash mumkin",
      );
    }

    const updateData: any = {
      currency: dto.currency,
      exchangeRate: dto.exchangeRate,
      paymentCondition: dto.paymentCondition,
      requiredPaymentPercent:
        dto.paymentCondition === 'PARTIAL' ? dto.requiredPaymentPercent : null,
      deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : undefined,
      deliveryAddress: dto.deliveryAddress,
      comment: dto.comment,
      priceListId: dto.priceListId !== undefined ? dto.priceListId : undefined,
      warehouseId: dto.warehouseId,
      assignedSellerId: dto.assignedSellerId,
    };

    if (dto.items?.length) {
      let subtotalAmount = 0;
      let discountAmount = 0;
      const preparedItems = dto.items.map((item) => {
        const lineSubtotal = item.quantity * item.unitPrice;
        const disc = item.discount || 0;
        subtotalAmount += lineSubtotal;
        discountAmount += disc;
        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: disc,
          totalPrice: Math.max(0, lineSubtotal - disc),
          reservedQty: 0,
          readyQty: 0,
          shippedQty: 0,
        };
      });

      await this.prisma.salesOrderItem.deleteMany({ where: { orderId: id } });
      updateData.subtotalAmount = subtotalAmount;
      updateData.discountAmount = discountAmount;
      updateData.totalAmount = Math.max(0, subtotalAmount - discountAmount);
      updateData.items = { create: preparedItems };
    }

    const updated = await this.prisma.salesOrder.update({
      where: { id },
      data: updateData,
      include: this.buildOrderInclude(),
    });

    return this.enrichOrder(updated);
  }

  // ─── STATUS TRANSITIONS ────────────────────────────────────────

  async transition(
    tenantId: string,
    userId: string,
    id: string,
    action: 'SUBMIT' | 'APPROVE' | 'REJECT' | 'SEND_TO_PRODUCTION' | 'CANCEL',
    userRoles: string[],
    comment?: string,
  ) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Buyurtma topilmadi');

    const oldStatus = order.status;
    let newStatus: SalesOrderStatus;

    switch (action) {
      case 'SUBMIT': {
        if (order.status !== SalesOrderStatus.NEW) {
          throw new BadRequestException("Faqat 'Yangi buyurtma' statusidagi buyurtmani topshirish mumkin");
        }
        newStatus = SalesOrderStatus.PENDING_APPROVAL;
        break;
      }
      case 'APPROVE': {
        if (!isManagerOrAbove(userRoles)) {
          throw new ForbiddenException('Tasdiqlash uchun menejer yoki admin roli talab qilinadi');
        }
        if (order.status !== SalesOrderStatus.PENDING_APPROVAL && order.status !== SalesOrderStatus.NEW) {
          throw new BadRequestException("Faqat 'Yangi' yoki 'Tasdiqlashda' statusidagi buyurtmani tasdiqlash mumkin");
        }
        newStatus = SalesOrderStatus.APPROVED;
        break;
      }
      case 'REJECT': {
        if (!isManagerOrAbove(userRoles)) {
          throw new ForbiddenException('Rad etish uchun menejer yoki admin roli talab qilinadi');
        }
        if (order.status !== SalesOrderStatus.PENDING_APPROVAL) {
          throw new BadRequestException("Faqat 'Tasdiqlashda' statusidagi buyurtmani rad etish mumkin");
        }
        newStatus = SalesOrderStatus.NEW;
        break;
      }
      case 'SEND_TO_PRODUCTION': {
        if (!isManagerOrAbove(userRoles)) {
          throw new ForbiddenException('Ishlab chiqarishga yuborish uchun menejer yoki admin roli talab qilinadi');
        }
        if (order.status !== SalesOrderStatus.APPROVED) {
          throw new BadRequestException("Faqat 'Tasdiqlangan' statusidagi zakazni ishlab chiqarishga yuborish mumkin");
        }
        newStatus = SalesOrderStatus.SENT_TO_PRODUCTION;
        break;
      }
      case 'CANCEL': {
        await this._handleCancel(order, userId, tenantId, userRoles);
        return this.findOne(tenantId, id);
      }
      default:
        throw new BadRequestException("Noto'g'ri amal");
    }

    await this.prisma.$transaction(async (tx) => {
      let finalStatus: SalesOrderStatus = newStatus;

      // When APPROVED, auto-reserve available warehouse inventory
      if (newStatus === SalesOrderStatus.APPROVED) {
        let warehouseId = order.warehouseId;
        if (!warehouseId) {
          const firstWh = await tx.warehouse.findFirst({ where: { tenantId } });
          if (firstWh) warehouseId = firstWh.id;
        }

        if (warehouseId) {
          const resResults = await this.stockReservationService.reserveStockForOrder(
            tenantId,
            id,
            warehouseId,
            order.items.map((i) => ({
              orderItemId: i.id,
              productId: i.productId,
              quantity: Number(i.quantity),
            })),
            tx,
          );

          // If 100% fulfilled from stock reservation
          const is100Fulfilled = resResults.every((r) => r.remainingGap === 0);
          if (is100Fulfilled) {
            // Update readyQty to match quantity for all items
            for (const item of order.items) {
              await tx.salesOrderItem.update({
                where: { id: item.id },
                data: { readyQty: item.quantity },
              });
            }

            const gateSatisfied = this.isGateSatisfied(order as any);
            finalStatus = gateSatisfied
              ? SalesOrderStatus.READY_TO_SHIP
              : SalesOrderStatus.AWAITING_PAYMENT;
          }
        }
      }

      // When SEND_TO_PRODUCTION, create stubs only for unreserved quantities
      if (newStatus === SalesOrderStatus.SENT_TO_PRODUCTION) {
        const freshItems = await tx.salesOrderItem.findMany({ where: { orderId: id } });
        const itemsToProduce = freshItems && freshItems.length > 0 ? freshItems : (order.items || []);
        for (const item of itemsToProduce) {
          const needed = Number(item.quantity) - Number(item.reservedQty || 0);
          if (needed > 0) {
            await tx.productionOrder.create({
              data: {
                tenantId,
                salesOrderId: id,
                salesOrderItemId: item.id,
                productId: item.productId,
                requiredQty: needed,
                readyQty: 0,
                status: ProductionOrderStatus.PENDING,
              },
            });
          }
        }
      }

      await tx.salesOrder.update({
        where: { id },
        data: { status: finalStatus },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entityType: 'SalesOrder',
          entityId: id,
          action: 'UPDATE',
          oldValue: { status: oldStatus },
          newValue: { status: finalStatus, comment },
        },
      });
    });

    return this.findOne(tenantId, id);
  }

  private async _handleCancel(
    order: any,
    userId: string,
    tenantId: string,
    userRoles: string[],
  ) {
    const cancelableBySellerStatuses = [
      SalesOrderStatus.NEW,
      SalesOrderStatus.PENDING_APPROVAL,
    ];
    const cancelableByManagerStatuses = [
      ...cancelableBySellerStatuses,
      SalesOrderStatus.APPROVED,
      SalesOrderStatus.SENT_TO_PRODUCTION,
    ];
    const inProductionStatuses = [
      SalesOrderStatus.IN_PRODUCTION,
      SalesOrderStatus.PARTIALLY_READY,
      SalesOrderStatus.READY,
      SalesOrderStatus.AWAITING_PAYMENT,
      SalesOrderStatus.PAYMENT_CONFIRMED,
      SalesOrderStatus.READY_TO_SHIP,
      SalesOrderStatus.PARTIALLY_SHIPPED,
    ];

    let canCancel = false;
    let isInProduction = false;

    if (isAdmin(userRoles)) {
      canCancel = true;
      isInProduction = inProductionStatuses.includes(order.status);
    } else if (isManagerOrAbove(userRoles)) {
      canCancel = cancelableByManagerStatuses.includes(order.status);
    } else {
      canCancel = cancelableBySellerStatuses.includes(order.status);
    }

    if (!canCancel) {
      if (inProductionStatuses.includes(order.status)) {
        throw new ForbiddenException(
          'Jarayondagi buyurtmani faqat tizim administratori bekor qilishi mumkin',
        );
      }
      throw new BadRequestException('Bu holatdagi buyurtmani bekor qilish mumkin emas');
    }

    await this.prisma.$transaction(async (tx) => {
      // Release any stock reservations
      await this.stockReservationService.releaseOrderReservations(tenantId, order.id, tx);

      // Cancel linked production orders if needed
      if (isInProduction) {
        await tx.productionOrder.updateMany({
          where: {
            salesOrderId: order.id,
            status: { in: [ProductionOrderStatus.PENDING, ProductionOrderStatus.IN_PROGRESS] },
          },
          data: { status: ProductionOrderStatus.CANCELLED },
        });
      }

      await tx.salesOrder.update({
        where: { id: order.id },
        data: { status: SalesOrderStatus.CANCELLED },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entityType: 'SalesOrder',
          entityId: order.id,
          action: 'UPDATE',
          oldValue: { status: order.status },
          newValue: { status: SalesOrderStatus.CANCELLED },
        },
      });
    });
  }

  // ─── CONFIRM DELIVERY (SHIPPED → COMPLETED) ──────────────────

  async completeOrder(tenantId: string, userId: string, id: string, userRoles: string[]) {
    if (!isManagerOrAbove(userRoles)) {
      throw new ForbiddenException('Yakunlash uchun menejer yoki admin roli talab qilinadi');
    }
    const order = await this.prisma.salesOrder.findFirst({ where: { id, tenantId } });
    if (!order) throw new NotFoundException('Buyurtma topilmadi');
    if (order.status !== SalesOrderStatus.SHIPPED) {
      throw new BadRequestException("Faqat 'Jo'natildi' statusidagi buyurtmani yakunlash mumkin");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.salesOrder.update({
        where: { id },
        data: { status: SalesOrderStatus.COMPLETED },
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entityType: 'SalesOrder',
          entityId: id,
          action: 'UPDATE',
          oldValue: { status: SalesOrderStatus.SHIPPED },
          newValue: { status: SalesOrderStatus.COMPLETED },
        },
      });
    });

    return this.findOne(tenantId, id);
  }

  // ─── PAYMENT INTEGRATION ──────────────────────────────────────

  async onPaymentRegistered(tenantId: string, userId: string, orderId: string) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: orderId, tenantId },
    });
    if (!order) return;

    const agg = await this.prisma.payment.aggregate({
      where: { tenantId, orderId },
      _sum: { amount: true },
    });
    const newPaidAmount = Number(agg._sum.amount || 0);

    const updatedOrder = { ...order, paidAmount: newPaidAmount };
    const gateSatisfied = this.isGateSatisfied(updatedOrder as any);

    const dispatchableStatuses: SalesOrderStatus[] = [
      SalesOrderStatus.READY,
      SalesOrderStatus.AWAITING_PAYMENT,
    ];
    const shouldAutoTransitionToReady =
      dispatchableStatuses.includes(order.status) && gateSatisfied;

    const shouldTransitionToAwaiting =
      order.status === SalesOrderStatus.READY &&
      !gateSatisfied &&
      order.paymentCondition !== PaymentCondition.CREDIT;

    await this.prisma.$transaction(async (tx) => {
      if (shouldAutoTransitionToReady) {
        await tx.salesOrder.update({
          where: { id: orderId },
          data: { paidAmount: newPaidAmount, status: SalesOrderStatus.PAYMENT_CONFIRMED },
        });
        await tx.salesOrder.update({
          where: { id: orderId },
          data: { status: SalesOrderStatus.READY_TO_SHIP },
        });
      } else if (shouldTransitionToAwaiting) {
        await tx.salesOrder.update({
          where: { id: orderId },
          data: { paidAmount: newPaidAmount, status: SalesOrderStatus.AWAITING_PAYMENT },
        });
      } else {
        await tx.salesOrder.update({
          where: { id: orderId },
          data: { paidAmount: newPaidAmount },
        });
      }
    });
  }

  // ─── PRODUCTION: update readyQty ─────────────────────────────

  async updateProductionReadyQty(
    tenantId: string,
    userId: string,
    productionOrderId: string,
    readyQty: number,
  ) {
    const prodOrder = await this.prisma.productionOrder.findFirst({
      where: { id: productionOrderId, tenantId },
      include: { salesOrder: { include: { items: true } } },
    });
    if (!prodOrder) throw new NotFoundException("Ishlab chiqarish topshirig'i topilmadi");
    if (readyQty > Number(prodOrder.requiredQty)) {
      throw new BadRequestException(
        `Tayyor miqdor kerakli miqdordan (${prodOrder.requiredQty}) oshib ketishi mumkin emas`,
      );
    }

    const order = prodOrder.salesOrder;

    await this.prisma.$transaction(async (tx) => {
      await tx.productionOrder.update({
        where: { id: productionOrderId },
        data: {
          readyQty,
          status:
            readyQty >= Number(prodOrder.requiredQty)
              ? ProductionOrderStatus.DONE
              : ProductionOrderStatus.IN_PROGRESS,
        },
      });

      if (prodOrder.salesOrderItemId) {
        // Line total ready = reserved from stock + manufactured ready
        const matchingItem = (order?.items || []).find((i: any) => i.id === prodOrder.salesOrderItemId);
        const reserved = Number(matchingItem?.reservedQty || 0);
        await tx.salesOrderItem.update({
          where: { id: prodOrder.salesOrderItemId },
          data: { readyQty: reserved + readyQty },
        });
      }

      const allProdOrders = await tx.productionOrder.findMany({
        where: { salesOrderId: order.id, tenantId },
      });

      const totalRequired = allProdOrders.reduce((sum, p) => sum + Number(p.requiredQty), 0);
      const totalReady = allProdOrders.reduce((sum, p) => sum + Number(p.readyQty), 0);

      let newOrderStatus = order.status;
      if (totalReady >= totalRequired && totalRequired > 0) {
        newOrderStatus = SalesOrderStatus.READY;
      } else if (totalReady > 0) {
        newOrderStatus = SalesOrderStatus.PARTIALLY_READY;
      }

      if (newOrderStatus === SalesOrderStatus.READY) {
        const gateSatisfied = this.isGateSatisfied(order as any);
        if (gateSatisfied) {
          newOrderStatus = SalesOrderStatus.READY_TO_SHIP;
        } else {
          newOrderStatus = SalesOrderStatus.AWAITING_PAYMENT;
        }
      }

      if (newOrderStatus !== order.status) {
        await tx.salesOrder.update({
          where: { id: order.id },
          data: { status: newOrderStatus },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            userId,
            entityType: 'SalesOrder',
            entityId: order.id,
            action: 'UPDATE',
            oldValue: { status: order.status },
            newValue: { status: newOrderStatus },
          },
        });
      }
    });

    return this.prisma.productionOrder.findFirst({
      where: { id: productionOrderId },
      include: {
        salesOrder: true,
        product: true,
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  // ─── PRODUCTION: start production order ──────────────────────

  async startProductionOrder(tenantId: string, userId: string, productionOrderId: string) {
    const prodOrder = await this.prisma.productionOrder.findFirst({
      where: { id: productionOrderId, tenantId },
      include: { salesOrder: true },
    });
    if (!prodOrder) throw new NotFoundException("Ishlab chiqarish topshirig'i topilmadi");
    if (prodOrder.status !== ProductionOrderStatus.PENDING) {
      throw new BadRequestException('Topshiriq allaqachon boshlangan yoki tugallangan');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.productionOrder.update({
        where: { id: productionOrderId },
        data: { status: ProductionOrderStatus.IN_PROGRESS },
      });

      const order = prodOrder.salesOrder;
      if (order.status === SalesOrderStatus.SENT_TO_PRODUCTION) {
        await tx.salesOrder.update({
          where: { id: order.id },
          data: { status: SalesOrderStatus.IN_PRODUCTION },
        });
      }
    });

    return this.prisma.productionOrder.findFirst({
      where: { id: productionOrderId },
      include: { salesOrder: true, product: true },
    });
  }

  // ─── LIST PRODUCTION ORDERS ───────────────────────────────────

  async findProductionOrders(tenantId: string, filters: { salesOrderId?: string; status?: string }) {
    const where: any = { tenantId };
    if (filters.salesOrderId) where.salesOrderId = filters.salesOrderId;
    if (filters.status) where.status = filters.status;

    return this.prisma.productionOrder.findMany({
      where,
      include: {
        salesOrder: {
          include: { counterparty: { select: { id: true, name: true } } },
        },
        product: true,
        assignedTo: { select: { id: true, firstName: true, lastName: true } },
        salesOrderItem: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── DISPATCH: MULTI-SHIPMENT & FIFO INVOICING ────────────────

  async dispatch(tenantId: string, userId: string, id: string, dto: DispatchSalesOrderDto) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id, tenantId },
      include: {
        items: { include: { product: true } },
        counterparty: true,
      },
    });
    if (!order) throw new NotFoundException('Buyurtma topilmadi');

    const allowedStatuses: SalesOrderStatus[] = [
      SalesOrderStatus.READY_TO_SHIP,
      SalesOrderStatus.PARTIALLY_SHIPPED,
    ];
    if (!allowedStatuses.includes(order.status)) {
      throw new BadRequestException(
        "Faqat 'Jo'natishga tayyor' yoki 'Qisman jo'natilgan' statusidagi buyurtmani jo'natish mumkin",
      );
    }

    if (!this.isGateSatisfied(order as any)) {
      throw new BadRequestException("To'lov sharti bajarilmagan. Jo'natishga ruxsat yo'q");
    }

    const warehouseId = dto.warehouseId;

    return this.prisma.$transaction(async (tx) => {
      // 1. Determine dispatch quantities per line
      const dispatchPlan: {
        orderItem: any;
        dispatchQty: number;
        unitPrice: number;
        discount: number;
      }[] = [];

      if (dto.items && dto.items.length > 0) {
        for (const reqItem of dto.items) {
          const matchingItem = order.items.find((i) => i.id === reqItem.orderItemId);
          if (!matchingItem) {
            throw new BadRequestException(`Buyurtma qatori topilmadi (${reqItem.orderItemId})`);
          }
          const totalQty = Number(matchingItem.quantity);
          const shippedQty = Number(matchingItem.shippedQty || 0);
          const unShippedQty = Math.max(0, totalQty - shippedQty);

          if (reqItem.quantity > unShippedQty) {
            throw new BadRequestException(
              `Chiqarilayotgan miqdor (${reqItem.quantity}) qolgan jo'natilmagan miqdordan (${unShippedQty}) oshib ketdi`,
            );
          }

          if (reqItem.quantity > 0) {
            dispatchPlan.push({
              orderItem: matchingItem,
              dispatchQty: reqItem.quantity,
              unitPrice: Number(matchingItem.unitPrice),
              discount: Number(matchingItem.discount || 0),
            });
          }
        }
      } else {
        // Full remaining dispatch
        for (const item of order.items) {
          const totalQty = Number(item.quantity);
          const shippedQty = Number(item.shippedQty || 0);
          const unShippedQty = Math.max(0, totalQty - shippedQty);
          if (unShippedQty > 0) {
            dispatchPlan.push({
              orderItem: item,
              dispatchQty: unShippedQty,
              unitPrice: Number(item.unitPrice),
              discount: Number(item.discount || 0),
            });
          }
        }
      }

      if (dispatchPlan.length === 0) {
        throw new BadRequestException("Jo'natish uchun tovar miqdori tanlanmagan");
      }

      // 2. Generate invoice number
      const year = new Date().getFullYear();
      const invPrefix = `INV-${year}-`;
      const invCount = await tx.salesInvoice.count({
        where: { tenantId, invoiceNumber: { startsWith: invPrefix } },
      });
      const invoiceNumber = `${invPrefix}${(invCount + 1).toString().padStart(4, '0')}`;

      // 3. Prepare invoice items
      let subtotal = 0;
      let discountAmt = 0;
      const invoiceItems = dispatchPlan.map((dp) => {
        const lineSubtotal = dp.dispatchQty * dp.unitPrice;
        const disc = (lineSubtotal * dp.discount) / 100;
        const lineTotal = Math.max(0, lineSubtotal - disc);
        subtotal += lineSubtotal;
        discountAmt += disc;
        return {
          productId: dp.orderItem.productId,
          quantity: dp.dispatchQty,
          unitPrice: dp.unitPrice,
          discount: dp.discount,
          vatRate: 0,
          vatAmount: 0,
          totalPrice: lineTotal,
          unitCogs: 0,
          lineCogs: 0,
          lineGrossProfit: 0,
          isBelowCost: false,
        };
      });
      const invoiceTotal = subtotal - discountAmt;

      // 4. Create the SalesInvoice
      const invoice = await tx.salesInvoice.create({
        data: {
          tenantId,
          warehouseId,
          counterpartyId: order.counterpartyId,
          salesOrderId: id,
          invoiceNumber,
          currency: order.currency,
          exchangeRate: order.exchangeRate,
          comment: `Buyurtma ${order.orderNumber} bo'yicha chiqim`,
          status: SalesDocStatus.DRAFT,
          paymentStatus: SalesPaymentStatus.UNPAID,
          returnStatus: SalesReturnStatus.NONE,
          subtotalAmount: subtotal,
          discountAmount: discountAmt,
          vatAmount: 0,
          totalAmount: invoiceTotal,
          paidAmount: 0,
          totalCogs: 0,
          grossProfit: 0,
          createdById: userId,
          items: { create: invoiceItems },
        },
        include: {
          items: { include: { product: true } },
          counterparty: true,
        },
      });

      // 5. Deduct FIFO stock batches & consume reservations
      let totalCogs = 0;
      for (let idx = 0; idx < dispatchPlan.length; idx++) {
        const dp = dispatchPlan[idx];
        const invItem = invoice.items[idx];
        const qty = dp.dispatchQty;

        const stockLevel = await tx.stockLevel.findUnique({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId,
              productId: dp.orderItem.productId,
            },
          },
        });
        const availableQty = stockLevel ? Number(stockLevel.quantity) : 0;
        if (availableQty < qty) {
          throw new BadRequestException(
            `"${(dp.orderItem.product.name as any)?.uz || dp.orderItem.product.name}" uchun omborda yetarli qoldiq yo'q. Mavjud: ${availableQty}, chiqarilayotgan: ${qty}`,
          );
        }

        const batches = await tx.productBatch.findMany({
          where: {
            tenantId,
            warehouseId,
            productId: dp.orderItem.productId,
            remainingQty: { gt: 0 },
          },
          orderBy: { createdAt: 'asc' },
        });

        let remaining = qty;
        let itemCogs = 0;

        for (const batch of batches) {
          if (remaining <= 0) break;
          const batchAvail = Number(batch.remainingQty);
          const consumed = Math.min(batchAvail, remaining);
          const cost = Number(batch.landedCost) > 0 ? Number(batch.landedCost) : Number(batch.purchasePrice);
          itemCogs += consumed * cost;
          remaining -= consumed;

          await tx.productBatch.update({
            where: { id: batch.id },
            data: { remainingQty: { decrement: consumed } },
          });
          await tx.batchConsumption.create({
            data: {
              tenantId,
              salesInvoiceItemId: invItem.id,
              batchId: batch.id,
              quantity: consumed,
              unitCost: cost,
            },
          });
        }

        if (remaining > 0) {
          const product = await tx.product.findUnique({ where: { id: dp.orderItem.productId } });
          itemCogs += remaining * Number(product?.costPrice || 0);
        }

        const unitCogs = qty > 0 ? itemCogs / qty : 0;
        const lineTotal = Number(invItem.totalPrice);
        const lineGrossProfit = lineTotal - itemCogs;
        totalCogs += itemCogs;

        await tx.salesInvoiceItem.update({
          where: { id: invItem.id },
          data: { unitCogs, lineCogs: itemCogs, lineGrossProfit, isBelowCost: dp.unitPrice < unitCogs },
        });

        await tx.stockLevel.update({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId,
              productId: dp.orderItem.productId,
            },
          },
          data: { quantity: { decrement: qty } },
        });

        // Update SalesOrderItem.shippedQty
        await tx.salesOrderItem.update({
          where: { id: dp.orderItem.id },
          data: { shippedQty: { increment: qty } },
        });

        // Consume reservation
        await this.stockReservationService.consumeReservation(
          tenantId,
          id,
          warehouseId,
          dp.orderItem.productId,
          qty,
          tx,
        );
      }

      const grossProfit = Number(invoice.totalAmount) - totalCogs;

      // 6. Post Invoice & increase customer debt
      await tx.counterparty.update({
        where: { id: order.counterpartyId },
        data: { debtBalance: { increment: invoice.totalAmount } },
      });

      await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: {
          status: SalesDocStatus.POSTED,
          totalCogs,
          grossProfit,
          postedById: userId,
          postedAt: new Date(),
        },
      });

      // 7. Check if order is 100% shipped
      const refreshedItems = await tx.salesOrderItem.findMany({ where: { orderId: id } });
      const allFullyShipped = refreshedItems.every(
        (i) => Number(i.shippedQty) >= Number(i.quantity),
      );

      const nextStatus = allFullyShipped
        ? SalesOrderStatus.SHIPPED
        : SalesOrderStatus.PARTIALLY_SHIPPED;

      await tx.salesOrder.update({
        where: { id },
        data: { status: nextStatus, warehouseId },
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entityType: 'SalesOrder',
          entityId: id,
          action: 'UPDATE',
          oldValue: { status: order.status },
          newValue: { status: nextStatus, invoiceId: invoice.id, invoiceNumber },
        },
      });

      return {
        order: await tx.salesOrder.findFirst({ where: { id } }),
        invoice,
      };
    });
  }

  // ─── COUNTERPARTY PROFILE ──────────────────────────────────────

  async getCounterpartyOrders(tenantId: string, counterpartyId: string) {
    const orders = await this.prisma.salesOrder.findMany({
      where: { tenantId, counterpartyId },
      include: this.buildOrderInclude(),
      orderBy: { createdAt: 'desc' },
    });

    const totalOrdersCount = orders.length;
    const completedOrdersCount = orders.filter((o) => o.status === SalesOrderStatus.COMPLETED).length;
    const totalOrderValue = orders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
    const totalPaidValue = orders.reduce((sum, o) => sum + Number(o.paidAmount), 0);

    return {
      orders: orders.map((o) => this.enrichOrder(o)),
      stats: {
        totalOrdersCount,
        completedOrdersCount,
        totalOrderValue,
        totalPaidValue,
        outstandingOrderValue: Math.max(0, totalOrderValue - totalPaidValue),
      },
    };
  }
}
