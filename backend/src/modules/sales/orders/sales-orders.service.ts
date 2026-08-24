import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { CreateSalesOrderDto } from '../dto/create-sales-order.dto';
import { FilterSalesOrdersDto } from '../dto/filter-sales-orders.dto';
import {
  Prisma,
  SalesOrderStatus,
  PaymentCondition,
  ProductionOrderStatus,
  SalesDocStatus,
  SalesPaymentStatus,
  SalesReturnStatus,
} from '@prisma/client';

// ─── Role classification ────────────────────────────────────────
type UserRole = 'SELLER' | 'MANAGER' | 'ADMIN' | 'PRODUCTION' | 'WAREHOUSE' | 'FINANCE';

function isAdmin(roles: string[]) {
  return roles.some((r) => ['ADMIN', 'SUPER_ADMIN'].includes(r));
}
function isManagerOrAbove(roles: string[]) {
  return roles.some((r) => ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(r));
}

@Injectable()
export class SalesOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── NUMBER GENERATOR ──────────────────────────────────────────

  private async generateOrderNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `Z-${year}-`;
    const count = await this.prisma.salesOrder.count({
      where: { tenantId, orderNumber: { startsWith: prefix } },
    });
    return `${prefix}${(count + 1).toString().padStart(4, '0')}`;
  }

  // ─── HELPERS ──────────────────────────────────────────────────

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
        select: { id: true, invoiceNumber: true, status: true, totalAmount: true, createdAt: true },
      },
    };
  }

  private enrichOrder(order: any) {
    const itemsWithComputed = (order.items || []).map((item: any) => ({
      ...item,
      remainingQty: Number(item.quantity) - Number(item.readyQty),
    }));

    const paid = Number(order.paidAmount);
    const total = Number(order.totalAmount);
    const paymentPercent = total > 0 ? Math.round((paid / total) * 100 * 100) / 100 : 0;

    return {
      ...order,
      items: itemsWithComputed,
      remainingAmount: total - paid,
      paymentPercent,
      gateStatus: this.computeGateStatus(order),
    };
  }

  // ─── LIST ──────────────────────────────────────────────────────

  async findAll(tenantId: string, filters: FilterSalesOrdersDto) {
    const {
      search,
      counterpartyId,
      dateFrom,
      dateTo,
      status,
      assignedSellerId,
      productId,
      paymentStatus,
      deliveryDateFrom,
      deliveryDateTo,
      page = 1,
      limit = 50,
    } = filters;

    const where: Prisma.SalesOrderWhereInput = { tenantId };

    if (search) {
      where.orderNumber = { contains: search, mode: 'insensitive' };
    }
    if (counterpartyId) where.counterpartyId = counterpartyId;
    if (status) where.status = status as SalesOrderStatus;
    if (assignedSellerId) where.assignedSellerId = assignedSellerId;
    if (dateFrom || dateTo) {
      where.orderDate = {};
      if (dateFrom) where.orderDate.gte = new Date(dateFrom);
      if (dateTo) where.orderDate.lte = new Date(dateTo);
    }
    if (deliveryDateFrom || deliveryDateTo) {
      where.deliveryDate = {};
      if (deliveryDateFrom) where.deliveryDate.gte = new Date(deliveryDateFrom);
      if (deliveryDateTo) where.deliveryDate.lte = new Date(deliveryDateTo);
    }
    if (productId) {
      where.items = { some: { productId } };
    }

    // Payment status filter computed from paidAmount vs totalAmount
    if (paymentStatus === 'PAID') {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        { totalAmount: { gt: 0 } },
        { paidAmount: { gte: Prisma.sql`total_amount` as any } }, // computed below via raw
      ];
      // Use raw approach: filter by computed
      // Since Prisma doesn't support column comparison, use workaround with JS-side filtering
    }

    const skip = (page - 1) * limit;

    const [total, orders] = await Promise.all([
      this.prisma.salesOrder.count({ where }),
      this.prisma.salesOrder.findMany({
        where,
        include: {
          counterparty: { select: { id: true, name: true } },
          warehouse: { select: { id: true, name: true } },
          assignedSeller: { select: { id: true, firstName: true, lastName: true } },
          items: {
            include: { product: { select: { id: true, name: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    let enrichedOrders = orders.map((o) => {
      const paid = Number(o.paidAmount);
      const tot = Number(o.totalAmount);
      const computedPaymentStatus =
        paid >= tot && tot > 0 ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
      return {
        ...o,
        items: (o.items || []).map((item: any) => ({
          ...item,
          remainingQty: Number(item.quantity) - Number(item.readyQty),
        })),
        remainingAmount: tot - paid,
        paymentPercent: tot > 0 ? Math.round((paid / tot) * 100 * 100) / 100 : 0,
        computedPaymentStatus,
      };
    });

    // Apply paymentStatus JS-side filter
    if (paymentStatus) {
      enrichedOrders = enrichedOrders.filter(
        (o) => o.computedPaymentStatus === paymentStatus,
      );
    }

    return { data: enrichedOrders, total, page, limit };
  }

  // ─── FIND ONE ─────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id, tenantId },
      include: {
        ...this.buildOrderInclude(),
        // status history via AuditLog
      },
    });
    if (!order) throw new NotFoundException('Zakaz topilmadi');

    // Fetch audit history
    const auditHistory = await this.prisma.auditLog.findMany({
      where: { tenantId, entityType: 'SalesOrder', entityId: id },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return {
      ...this.enrichOrder(order),
      auditHistory,
    };
  }

  // ─── CREATE ───────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateSalesOrderDto) {
    if (!dto.items?.length) {
      throw new BadRequestException(
        "Zakazda kamida bitta mahsulot bo'lishi shart",
      );
    }

    const orderNumber = await this.generateOrderNumber(tenantId);

    let subtotalAmount = 0;
    let discountAmount = 0;

    const preparedItems = dto.items.map((item) => {
      const qty = item.quantity;
      const unitPrice = item.unitPrice;
      const disc = item.discount || 0;
      const lineSubtotal = qty * unitPrice;
      const lineTotal = Math.max(0, lineSubtotal - disc);

      subtotalAmount += lineSubtotal;
      discountAmount += disc;

      return {
        productId: item.productId,
        quantity: qty,
        unitPrice,
        discount: disc,
        totalPrice: lineTotal,
        readyQty: 0,
      };
    });

    const totalAmount = subtotalAmount - discountAmount;

    const order = await this.prisma.salesOrder.create({
      data: {
        tenantId,
        orderNumber,
        counterpartyId: dto.counterpartyId,
        currency: dto.currency || 'UZS',
        exchangeRate: dto.exchangeRate || 1,
        paymentCondition: dto.paymentCondition as PaymentCondition,
        requiredPaymentPercent:
          dto.paymentCondition === 'PARTIAL'
            ? dto.requiredPaymentPercent
            : null,
        deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : null,
        deliveryAddress: dto.deliveryAddress || null,
        comment: dto.comment || null,
        assignedSellerId: dto.assignedSellerId || null,
        createdById: userId,
        status: SalesOrderStatus.NEW,
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
        newValue: { status: SalesOrderStatus.NEW, orderNumber },
      },
    });

    return this.enrichOrder(order);
  }

  // ─── UPDATE (only in NEW status) ──────────────────────────────

  async update(
    tenantId: string,
    userId: string,
    id: string,
    dto: Partial<CreateSalesOrderDto>,
  ) {
    const order = await this.prisma.salesOrder.findFirst({ where: { id, tenantId } });
    if (!order) throw new NotFoundException('Zakaz topilmadi');
    if (order.status !== SalesOrderStatus.NEW) {
      throw new BadRequestException(
        "Faqat 'Yangi zakaz' statusidagi zakazni tahrirlash mumkin",
      );
    }

    // Recompute totals if items provided
    let updateData: any = {
      currency: dto.currency,
      exchangeRate: dto.exchangeRate,
      paymentCondition: dto.paymentCondition,
      requiredPaymentPercent:
        dto.paymentCondition === 'PARTIAL' ? dto.requiredPaymentPercent : null,
      deliveryDate: dto.deliveryDate ? new Date(dto.deliveryDate) : undefined,
      deliveryAddress: dto.deliveryAddress,
      comment: dto.comment,
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
          readyQty: 0,
        };
      });

      // Delete old items and recreate
      await this.prisma.salesOrderItem.deleteMany({ where: { orderId: id } });
      updateData.subtotalAmount = subtotalAmount;
      updateData.discountAmount = discountAmount;
      updateData.totalAmount = subtotalAmount - discountAmount;
      updateData.items = { create: preparedItems };
    }

    // Remove undefined keys
    Object.keys(updateData).forEach(
      (k) => updateData[k] === undefined && delete updateData[k],
    );

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
    if (!order) throw new NotFoundException('Zakaz topilmadi');

    const oldStatus = order.status;
    let newStatus: SalesOrderStatus;

    switch (action) {
      case 'SUBMIT': {
        if (order.status !== SalesOrderStatus.NEW) {
          throw new BadRequestException(
            "Faqat 'Yangi zakaz' statusidagi zakazni topshirish mumkin",
          );
        }
        newStatus = SalesOrderStatus.PENDING_APPROVAL;
        break;
      }
      case 'APPROVE': {
        if (!isManagerOrAbove(userRoles)) {
          throw new ForbiddenException("Tasdiqlash uchun menejer yoki admin roli talab qilinadi");
        }
        if (order.status !== SalesOrderStatus.PENDING_APPROVAL) {
          throw new BadRequestException(
            "Faqat 'Tasdiqlash kutilmoqda' statusidagi zakazni tasdiqlash mumkin",
          );
        }
        newStatus = SalesOrderStatus.APPROVED;
        break;
      }
      case 'REJECT': {
        if (!isManagerOrAbove(userRoles)) {
          throw new ForbiddenException("Rad etish uchun menejer yoki admin roli talab qilinadi");
        }
        if (order.status !== SalesOrderStatus.PENDING_APPROVAL) {
          throw new BadRequestException(
            "Faqat 'Tasdiqlash kutilmoqda' statusidagi zakazni rad etish mumkin",
          );
        }
        newStatus = SalesOrderStatus.NEW;
        break;
      }
      case 'SEND_TO_PRODUCTION': {
        if (!isManagerOrAbove(userRoles)) {
          throw new ForbiddenException("Ishlab chiqarishga yuborish uchun menejer yoki admin roli talab qilinadi");
        }
        if (order.status !== SalesOrderStatus.APPROVED) {
          throw new BadRequestException(
            "Faqat 'Tasdiqlandi' statusidagi zakazni ishlab chiqarishga yuborish mumkin",
          );
        }
        newStatus = SalesOrderStatus.SENT_TO_PRODUCTION;
        break;
      }
      case 'CANCEL': {
        await this._handleCancel(order, userId, tenantId, userRoles);
        return this.findOne(tenantId, id);
      }
      default:
        throw new BadRequestException('Noto\'g\'ri amal');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.salesOrder.update({
        where: { id },
        data: { status: newStatus },
      });

      // Auto-create production order stubs when sending to production
      if (newStatus === SalesOrderStatus.SENT_TO_PRODUCTION) {
        for (const item of order.items) {
          await tx.productionOrder.create({
            data: {
              tenantId,
              salesOrderId: id,
              salesOrderItemId: item.id,
              productId: item.productId,
              requiredQty: item.quantity,
              readyQty: 0,
              status: ProductionOrderStatus.PENDING,
            },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          tenantId,
          userId,
          entityType: 'SalesOrder',
          entityId: id,
          action: 'UPDATE',
          oldValue: { status: oldStatus },
          newValue: { status: newStatus, comment },
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
    ];

    const isShippedOrDone = [
      SalesOrderStatus.SHIPPED,
      SalesOrderStatus.COMPLETED,
      SalesOrderStatus.CANCELLED,
    ].includes(order.status);

    if (isShippedOrDone) {
      throw new BadRequestException(
        "Jo'natilgan, yakunlangan yoki allaqachon bekor qilingan zakazni bekor qilish mumkin emas",
      );
    }

    const isInProduction = inProductionStatuses.includes(order.status);

    if (isInProduction && !isAdmin(userRoles)) {
      throw new ForbiddenException(
        "Ishlab chiqarish bosqichidagi zakazni faqat admin bekor qila oladi",
      );
    }

    if (!isAdmin(userRoles) && !cancelableByManagerStatuses.includes(order.status)) {
      throw new ForbiddenException(
        "Bu statusdagi zakazni bekor qilish uchun ruxsatingiz yo'q",
      );
    }

    await this.prisma.$transaction(async (tx) => {
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
      throw new ForbiddenException("Yakunlash uchun menejer yoki admin roli talab qilinadi");
    }
    const order = await this.prisma.salesOrder.findFirst({ where: { id, tenantId } });
    if (!order) throw new NotFoundException('Zakaz topilmadi');
    if (order.status !== SalesOrderStatus.SHIPPED) {
      throw new BadRequestException(
        "Faqat 'Jo'natildi' statusidagi zakazni yakunlash mumkin",
      );
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

  /**
   * Called by PaymentsService after a payment is registered for an orderId.
   * Recomputes paidAmount and evaluates the dispatch gate.
   */
  async onPaymentRegistered(tenantId: string, userId: string, orderId: string) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: orderId, tenantId },
    });
    if (!order) return;

    // Recompute paidAmount from all payments referencing this order
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
      order.status === SalesOrderStatus.READY && !gateSatisfied &&
      order.paymentCondition !== PaymentCondition.CREDIT;

    await this.prisma.$transaction(async (tx) => {
      let newStatus = order.status;

      if (shouldAutoTransitionToReady) {
        // PAYMENT_CONFIRMED → READY_TO_SHIP (two hops in one transaction)
        await tx.salesOrder.update({
          where: { id: orderId },
          data: { paidAmount: newPaidAmount, status: SalesOrderStatus.PAYMENT_CONFIRMED },
        });
        await tx.auditLog.create({
          data: {
            tenantId, userId,
            entityType: 'SalesOrder', entityId: orderId,
            action: 'UPDATE',
            oldValue: { status: order.status },
            newValue: { status: SalesOrderStatus.PAYMENT_CONFIRMED },
          },
        });
        newStatus = SalesOrderStatus.READY_TO_SHIP;
        await tx.salesOrder.update({
          where: { id: orderId },
          data: { status: SalesOrderStatus.READY_TO_SHIP },
        });
        await tx.auditLog.create({
          data: {
            tenantId, userId,
            entityType: 'SalesOrder', entityId: orderId,
            action: 'UPDATE',
            oldValue: { status: SalesOrderStatus.PAYMENT_CONFIRMED },
            newValue: { status: SalesOrderStatus.READY_TO_SHIP },
          },
        });
      } else if (shouldTransitionToAwaiting) {
        newStatus = SalesOrderStatus.AWAITING_PAYMENT;
        await tx.salesOrder.update({
          where: { id: orderId },
          data: { paidAmount: newPaidAmount, status: SalesOrderStatus.AWAITING_PAYMENT },
        });
        await tx.auditLog.create({
          data: {
            tenantId, userId,
            entityType: 'SalesOrder', entityId: orderId,
            action: 'UPDATE',
            oldValue: { status: order.status },
            newValue: { status: SalesOrderStatus.AWAITING_PAYMENT },
          },
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
    if (!prodOrder) throw new NotFoundException('Ishlab chiqarish topshirig\'i topilmadi');
    if (readyQty > Number(prodOrder.requiredQty)) {
      throw new BadRequestException(
        `Tayyor miqdor kerakli miqdordan (${prodOrder.requiredQty}) oshib ketishi mumkin emas`,
      );
    }

    const order = prodOrder.salesOrder;

    await this.prisma.$transaction(async (tx) => {
      // Update production order
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

      // Update matching SalesOrderItem.readyQty
      if (prodOrder.salesOrderItemId) {
        await tx.salesOrderItem.update({
          where: { id: prodOrder.salesOrderItemId },
          data: { readyQty },
        });
      }

      // Re-evaluate order status
      const allProdOrders = await tx.productionOrder.findMany({
        where: { salesOrderId: order.id, tenantId },
      });

      const allDone = allProdOrders.every(
        (po) =>
          po.id === productionOrderId
            ? readyQty >= Number(po.requiredQty)
            : Number(po.readyQty) >= Number(po.requiredQty),
      );
      const anyStarted = allProdOrders.some(
        (po) =>
          po.id === productionOrderId ? readyQty > 0 : Number(po.readyQty) > 0,
      );

      let newOrderStatus = order.status;
      const oldStatus = order.status;

      if (allDone) {
        // Check if CREDIT → go straight to READY_TO_SHIP
        if (order.paymentCondition === PaymentCondition.CREDIT) {
          newOrderStatus = SalesOrderStatus.READY_TO_SHIP;
        } else {
          const paid = Number(order.paidAmount);
          const total = Number(order.totalAmount);
          const gateSatisfied = this.isGateSatisfied(order as any);
          newOrderStatus = gateSatisfied
            ? SalesOrderStatus.READY_TO_SHIP
            : SalesOrderStatus.AWAITING_PAYMENT;
        }
      } else if (anyStarted) {
        const inProdStatuses: SalesOrderStatus[] = [
          SalesOrderStatus.SENT_TO_PRODUCTION,
          SalesOrderStatus.IN_PRODUCTION,
        ];
        if (inProdStatuses.includes(order.status)) {
          newOrderStatus = SalesOrderStatus.PARTIALLY_READY;
        }
      }

      if (newOrderStatus !== oldStatus) {
        await tx.salesOrder.update({
          where: { id: order.id },
          data: { status: newOrderStatus },
        });
        await tx.auditLog.create({
          data: {
            tenantId, userId,
            entityType: 'SalesOrder', entityId: order.id,
            action: 'UPDATE',
            oldValue: { status: oldStatus },
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
    if (!prodOrder) throw new NotFoundException('Ishlab chiqarish topshirig\'i topilmadi');
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
        await tx.auditLog.create({
          data: {
            tenantId, userId,
            entityType: 'SalesOrder', entityId: order.id,
            action: 'UPDATE',
            oldValue: { status: SalesOrderStatus.SENT_TO_PRODUCTION },
            newValue: { status: SalesOrderStatus.IN_PRODUCTION },
          },
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

  // ─── DISPATCH (Warehouse) ─────────────────────────────────────

  async dispatch(tenantId: string, userId: string, id: string, warehouseId: string) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id, tenantId },
      include: {
        items: { include: { product: true } },
        counterparty: true,
      },
    });
    if (!order) throw new NotFoundException('Zakaz topilmadi');

    if (order.status !== SalesOrderStatus.READY_TO_SHIP) {
      throw new BadRequestException(
        "Faqat 'Jo'natishga tayyor' statusidagi zakazni jo'natish mumkin",
      );
    }

    // Re-validate dispatch gate (safety net)
    if (!this.isGateSatisfied(order as any)) {
      throw new BadRequestException(
        "To'lov sharti bajarilmagan. Jo'natishga ruxsat yo'q",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 1. Generate invoice number
      const year = new Date().getFullYear();
      const invPrefix = `INV-${year}-`;
      const invCount = await tx.salesInvoice.count({
        where: { tenantId, invoiceNumber: { startsWith: invPrefix } },
      });
      const invoiceNumber = `${invPrefix}${(invCount + 1).toString().padStart(4, '0')}`;

      // 2. Prepare invoice items (same as order items, no COGS yet — will be computed on post)
      let subtotal = 0;
      let discountAmt = 0;
      const invoiceItems = order.items.map((item) => {
        const lineSubtotal = Number(item.quantity) * Number(item.unitPrice);
        const disc = Number(item.discount);
        const lineTotal = Math.max(0, lineSubtotal - disc);
        subtotal += lineSubtotal;
        discountAmt += disc;
        return {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discount: disc,
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

      // 3. Create the SalesInvoice in DRAFT
      const invoice = await tx.salesInvoice.create({
        data: {
          tenantId,
          warehouseId,
          counterpartyId: order.counterpartyId,
          salesOrderId: id,
          invoiceNumber,
          currency: order.currency,
          exchangeRate: order.exchangeRate,
          comment: `Zakaz ${order.orderNumber} asosida yaratildi`,
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

      // 4. Post the invoice: FIFO COGS + stock deduction
      let totalCogs = 0;
      for (const item of invoice.items) {
        const qty = Number(item.quantity);

        const stockLevel = await tx.stockLevel.findUnique({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId,
              productId: item.productId,
            },
          },
        });
        const availableQty = stockLevel ? Number(stockLevel.quantity) : 0;
        if (availableQty < qty) {
          throw new BadRequestException(
            `"${(item.product.name as any)?.uz || item.product.name}" uchun omborda yetarli miqdor yo'q. Mavjud: ${availableQty}, kerakli: ${qty}`,
          );
        }

        const batches = await tx.productBatch.findMany({
          where: {
            tenantId,
            warehouseId,
            productId: item.productId,
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
              salesInvoiceItemId: item.id,
              batchId: batch.id,
              quantity: consumed,
              unitCost: cost,
            },
          });
        }

        if (remaining > 0) {
          const product = await tx.product.findUnique({ where: { id: item.productId } });
          itemCogs += remaining * Number(product?.costPrice || 0);
        }

        const unitCogs = qty > 0 ? itemCogs / qty : 0;
        const lineTotal = Number(item.totalPrice);
        const lineGrossProfit = lineTotal - itemCogs;
        totalCogs += itemCogs;

        await tx.salesInvoiceItem.update({
          where: { id: item.id },
          data: { unitCogs, lineCogs: itemCogs, lineGrossProfit, isBelowCost: Number(item.unitPrice) < unitCogs },
        });

        await tx.stockLevel.update({
          where: {
            tenantId_warehouseId_productId: {
              tenantId,
              warehouseId,
              productId: item.productId,
            },
          },
          data: { quantity: { decrement: qty } },
        });
      }

      const grossProfit = Number(invoice.totalAmount) - totalCogs;

      // 5. Increase customer debt
      await tx.counterparty.update({
        where: { id: order.counterpartyId },
        data: { debtBalance: { increment: invoice.totalAmount } },
      });

      // 6. Post the invoice
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

      // 7. Update SalesOrder status and warehouseId
      await tx.salesOrder.update({
        where: { id },
        data: { status: SalesOrderStatus.SHIPPED, warehouseId },
      });

      // 8. Audit logs
      await tx.auditLog.create({
        data: {
          tenantId, userId,
          entityType: 'SalesOrder', entityId: id,
          action: 'UPDATE',
          oldValue: { status: SalesOrderStatus.READY_TO_SHIP },
          newValue: { status: SalesOrderStatus.SHIPPED, invoiceId: invoice.id, invoiceNumber },
        },
      });
      await tx.auditLog.create({
        data: {
          tenantId, userId,
          entityType: 'SalesInvoice', entityId: invoice.id,
          action: 'UPDATE',
          oldValue: { status: 'DRAFT' },
          newValue: { status: 'POSTED', totalCogs, grossProfit },
        },
      });

      return { order: await tx.salesOrder.findFirst({ where: { id } }), invoice };
    });
  }

  // ─── DASHBOARD STATS ─────────────────────────────────────────

  async getDashboardStats(tenantId: string) {
    const [statusCounts, deadlineOrders, inflightAgg] = await Promise.all([
      this.prisma.salesOrder.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: { _all: true },
      }),
      this.prisma.salesOrder.findMany({
        where: {
          tenantId,
          deliveryDate: {
            gte: new Date(),
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
          status: {
            notIn: [SalesOrderStatus.SHIPPED, SalesOrderStatus.COMPLETED, SalesOrderStatus.CANCELLED],
          },
        },
        include: { counterparty: { select: { id: true, name: true } } },
        orderBy: { deliveryDate: 'asc' },
        take: 20,
      }),
      this.prisma.salesOrder.aggregate({
        where: {
          tenantId,
          status: {
            notIn: [SalesOrderStatus.CANCELLED, SalesOrderStatus.COMPLETED],
          },
        },
        _sum: { totalAmount: true },
      }),
    ]);

    const counts: Record<string, number> = {};
    for (const sc of statusCounts) {
      counts[sc.status] = sc._count._all;
    }

    return {
      pipeline: {
        NEW: counts['NEW'] || 0,
        PENDING_APPROVAL: counts['PENDING_APPROVAL'] || 0,
        APPROVED: counts['APPROVED'] || 0,
        SENT_TO_PRODUCTION: counts['SENT_TO_PRODUCTION'] || 0,
        IN_PRODUCTION: counts['IN_PRODUCTION'] || 0,
        PARTIALLY_READY: counts['PARTIALLY_READY'] || 0,
        READY: counts['READY'] || 0,
        AWAITING_PAYMENT: counts['AWAITING_PAYMENT'] || 0,
        PAYMENT_CONFIRMED: counts['PAYMENT_CONFIRMED'] || 0,
        READY_TO_SHIP: counts['READY_TO_SHIP'] || 0,
        SHIPPED: counts['SHIPPED'] || 0,
        COMPLETED: counts['COMPLETED'] || 0,
        CANCELLED: counts['CANCELLED'] || 0,
      },
      upcomingDeadlines: deadlineOrders,
      totalInflightAmount: Number(inflightAgg._sum.totalAmount || 0),
    };
  }

  // ─── COUNTERPARTY PROFILE ─────────────────────────────────────

  async getCounterpartyOrders(tenantId: string, counterpartyId: string) {
    const orders = await this.prisma.salesOrder.findMany({
      where: { tenantId, counterpartyId },
      include: {
        items: { include: { product: true } },
        assignedSeller: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const agg = await this.prisma.salesOrder.aggregate({
      where: {
        tenantId,
        counterpartyId,
        status: { notIn: [SalesOrderStatus.CANCELLED] },
      },
      _sum: { totalAmount: true, paidAmount: true },
      _count: { _all: true },
    });

    return {
      orders: orders.map((o) => this.enrichOrder(o)),
      summary: {
        totalOrders: agg._count._all,
        totalAmount: Number(agg._sum.totalAmount || 0),
        totalPaid: Number(agg._sum.paidAmount || 0),
        totalOutstanding: Number(agg._sum.totalAmount || 0) - Number(agg._sum.paidAmount || 0),
      },
    };
  }
}
