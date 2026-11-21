'use client';

import { use } from 'react';
import { FORM_SNAPSHOT, useApiQuery } from '@/lib/query/useApiQuery';
import { SalesOrderForm } from '@/components/sales/SalesOrderForm';
import { DocumentLoadState } from '@/components/ui/DocumentLoadState';
import type { SalesOrderDetail } from '@/components/sales/order-form/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function SalesOrderDetailPage({ params }: PageProps) {
  const { id } = use(params);

  // Loaded once per visit: the form copies it into its own state.
  const docQuery = useApiQuery<SalesOrderDetail>(id ? `/sales/orders/${id}` : null, FORM_SNAPSHOT);
  const order = docQuery.data;

  if (!order) {
    return (
      <DocumentLoadState
        query={docQuery}
        missing
        listHref="/sales/orders"
        listLabel={{ uz: 'Buyurtmalar ro‘yxatiga', ru: 'К списку заказов' }}
        notFound={{ uz: 'Buyurtma topilmadi', ru: 'Заказ не найден' }}
      />
    );
  }

  return <SalesOrderForm key={order.id} mode="edit" initialData={order} />;
}
