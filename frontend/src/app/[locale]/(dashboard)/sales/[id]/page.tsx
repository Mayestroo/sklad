'use client';

import { use } from 'react';
import { useLocale } from 'next-intl';
import { FORM_SNAPSHOT, useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { SalesInvoiceForm } from '@/components/sales/SalesInvoiceForm';
import { Card } from '@/components/ui/Card';
import { SalesInvoice } from '@shared/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function SalesInvoiceDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  // Loaded once per visit: the form copies it into its own state.
  const docQuery = useApiQuery<SalesInvoice>(id ? `/sales/invoices/${id}` : null, FORM_SNAPSHOT);
  const invoice = docQuery.data;

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
        {isRu ? 'Загрузка документа...' : 'Hujjat yuklanmoqda...'}
      </Card>
    );
  }

  if (!invoice) {
    return (
      <Card style={{ padding: 'var(--space-8)', textAlign: 'center', color: '#ef4444' }}>
        {isRu ? 'Документ не найден' : 'Hujjat topilmadi'}
      </Card>
    );
  }

  return <SalesInvoiceForm key={invoice.id} mode="edit" initialData={invoice} />;
}
