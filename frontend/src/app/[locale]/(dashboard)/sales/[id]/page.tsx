'use client';

import { use } from 'react';
import { FORM_SNAPSHOT, useApiQuery } from '@/lib/query/useApiQuery';
import { SalesInvoiceForm } from '@/components/sales/SalesInvoiceForm';
import { DocumentLoadState } from '@/components/ui/DocumentLoadState';
import { SalesInvoice } from '@shared/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function SalesInvoiceDetailPage({ params }: PageProps) {
  const { id } = use(params);

  // Loaded once per visit: the form copies it into its own state.
  const docQuery = useApiQuery<SalesInvoice>(id ? `/sales/invoices/${id}` : null, FORM_SNAPSHOT);
  const invoice = docQuery.data;

  if (!invoice) {
    return (
      <DocumentLoadState
        query={docQuery}
        missing
        listHref="/sales"
        listLabel={{ uz: 'Sotuv hujjatlari ro‘yxatiga', ru: 'К списку продаж' }}
        notFound={{ uz: 'Sotuv hujjati topilmadi', ru: 'Документ продажи не найден' }}
      />
    );
  }

  return <SalesInvoiceForm key={invoice.id} mode="edit" initialData={invoice} />;
}
