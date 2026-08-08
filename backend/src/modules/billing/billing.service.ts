import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import { PricingPlan } from '../../../../shared/types';

export const PLANS: PricingPlan[] = [
  {
    id: 'STARTER',
    name: { uz: 'Starter (Boshlang\'ich)', ru: 'Starter (Базовый)' },
    priceMonthly: 490000,
    priceYearly: 4900000,
    features: [
      { uz: 'Ombor va tovarlar hisobi (MoySklad)', ru: 'Склад и учёт товаров (MoySklad)' },
      { uz: 'Hisob-faktura va sotuvlar bo\'limi', ru: 'Счета-фактуры и продажи' },
      { uz: 'Bitta omborxona', ru: 'Один склад' },
      { uz: 'Shtrix-kod skaner va PDF eksport', ru: 'Сканер штрих-кодов и экспорт PDF' },
    ],
  },
  {
    id: 'PROFESSIONAL',
    name: { uz: 'Professional (Buxgalteriya)', ru: 'Professional (Бухгалтерия)' },
    priceMonthly: 990000,
    priceYearly: 9900000,
    isPopular: true,
    features: [
      { uz: 'Starter tarifi barcha imkoniyatlari', ru: 'Все возможности тарифа Starter' },
      { uz: 'Milliy BHMS / NAS 1C Ikki yo\'lama buxgalteriya', ru: 'Национальная BHMS / NAS 1C Двойная бухгалтерия' },
      { uz: 'Shakl 1 (Balans) va Shakl 2 (P&L) hisobotlar', ru: 'Отчёты Форма 1 (Баланс) и Форма 2 (P&L)' },
      { uz: 'CRM Kanban quvuri va mijozlar tarixi', ru: 'CRM Канбан воронка и история клиентов' },
    ],
  },
  {
    id: 'ENTERPRISE',
    name: { uz: 'Enterprise (Korporativ)', ru: 'Enterprise (Корпоративный)' },
    priceMonthly: 1990000,
    priceYearly: 19900000,
    features: [
      { uz: 'Professional tarifi barcha imkoniyatlari', ru: 'Все возможности тарифа Professional' },
      { uz: 'Ko\'p filialli (Multi-Branch) va Multi-Ombor tizimi', ru: 'Многофилиальная и многоскладская система' },
      { uz: 'Yo\'ldagi tovarlar (In-Transit 2920) provodkalari', ru: 'Проводки товаров в пути (In-Transit 2920)' },
      { uz: 'VIP texnik qo\'llab-quvvatlash va REST API', ru: 'VIP техподдержка и REST API' },
    ],
  },
];

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  getPlans(): PricingPlan[] {
    return PLANS;
  }

  async getSubscriptionStatus(tenantId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: tenantId },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const currentSub = await this.prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    let daysRemaining = 0;

    if (currentSub) {
      daysRemaining = Math.max(0, Math.ceil((new Date(currentSub.endDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    } else if (company.trialEndsAt) {
      daysRemaining = Math.max(0, Math.ceil((new Date(company.trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    }

    return {
      companyName: company.name,
      status: currentSub ? currentSub.status : company.status,
      plan: currentSub ? currentSub.plan : 'STARTER',
      trialEndsAt: company.trialEndsAt,
      nextBillingAt: currentSub ? currentSub.nextBillingAt : company.trialEndsAt,
      daysRemaining,
    };
  }

  async createCheckout(
    tenantId: string,
    planId: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE',
    method: 'CLICK' | 'PAYME' | 'BANK_TRANSFER',
  ) {
    const selectedPlan = PLANS.find((p) => p.id === planId);
    if (!selectedPlan) {
      throw new BadRequestException('Invalid subscription plan');
    }

    const paymentNumber = `BILL-${Date.now().toString().slice(-6)}`;
    const amount = selectedPlan.priceMonthly;

    // Create Subscription record
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);

    const sub = await this.prisma.subscription.create({
      data: {
        tenantId,
        plan: planId,
        status: 'TRIAL',
        amount,
        currency: 'UZS',
        startDate,
        endDate,
        nextBillingAt: endDate,
      },
    });

    const payment = await this.prisma.subscriptionPayment.create({
      data: {
        tenantId,
        subscriptionId: sub.id,
        paymentNumber,
        method,
        amount,
        status: 'DRAFT',
      },
    });

    // Generate Click / Payme checkout payload
    let checkoutUrl = '';
    const merchantId = process.env.CLICK_MERCHANT_ID || '12345';
    const serviceId = process.env.CLICK_SERVICE_ID || '67890';

    if (method === 'CLICK') {
      checkoutUrl = `https://my.click.uz/services/pay?service_id=${serviceId}&merchant_id=${merchantId}&amount=${amount}&transaction_param=${payment.id}`;
    } else if (method === 'PAYME') {
      const base64Data = Buffer.from(`m=${process.env.PAYME_MERCHANT_ID || 'test_merchant'};ac.payment_id=${payment.id};a=${amount * 100}`).toString('base64');
      checkoutUrl = `https://checkout.paycom.uz/${base64Data}`;
    } else {
      checkoutUrl = `/accounting/reports`;
    }

    return {
      paymentNumber,
      amount,
      method,
      checkoutUrl,
      paymentId: payment.id,
    };
  }

  async getPaymentHistory(tenantId: string) {
    return this.prisma.subscriptionPayment.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async processWebhook(provider: 'CLICK' | 'PAYME', payload: any) {
    const paymentId = payload.paymentId || payload.transaction_param;
    if (!paymentId) {
      return { status: 'error', message: 'Missing payment identifier' };
    }

    const payment = await this.prisma.subscriptionPayment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException('Subscription payment not found');
    }

    // Update payment & subscription to ACTIVE
    await this.prisma.subscriptionPayment.update({
      where: { id: paymentId },
      data: {
        status: 'PAID',
        paidAt: new Date(),
        transactionId: payload.trans_id || payload.payme_trans_id || `TX-${Date.now()}`,
      },
    });

    if (payment.subscriptionId) {
      await this.prisma.subscription.update({
        where: { id: payment.subscriptionId },
        data: {
          status: 'ACTIVE',
        },
      });
    }

    await this.prisma.company.update({
      where: { id: payment.tenantId },
      data: {
        status: 'ACTIVE',
      },
    });

    return { status: 'success', paymentId, activated: true };
  }
}
