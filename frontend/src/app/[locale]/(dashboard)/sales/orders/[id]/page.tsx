'use client';

import { use } from 'react';
import { useLocale } from 'next-intl';
import { FORM_SNAPSHOT, useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { SalesOrderForm } from '@/components/sales/SalesOrderForm';
import { Card } from '@/components/ui/Card';
import type { SalesOrderDetail } from '@/components/sales/order-form/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function SalesOrderDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  // Loaded once per visit: the form copies it into its own state.
  const docQuery = useApiQuery<SalesOrderDetail>(id ? `/sales/orders/${id}` : null, FORM_SNAPSHOT);
  const order = docQuery.data;

  if (docQuery.isError) {
    return (
      <Card>
        <LoadError error={docQuery.error} onRetry={() => void docQuery.refetch()} retrying={docQuery.isFetching} />
      </Card>
    );
  }

  if (docQuery.isPending) {
    return (
      <Card style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
        {isRu ? 'Загрузка заказа...' : 'Buyurtma yuklanmoqda...'}
      </Card>
    );
  }

  if (!order) {
    return (
      <Card style={{ padding: 'var(--space-8)', textAlign: 'center', color: '#ef4444' }}>
        {isRu ? 'Заказ не найден' : 'Buyurtma topilmadi'}
      </Card>
    );
  }

  return <SalesOrderForm key={order.id} mode="edit" initialData={order} />;
}
