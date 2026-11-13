'use client';

import { use } from 'react';
import { useLocale } from 'next-intl';
import { FORM_SNAPSHOT, useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { PurchaseDocumentForm } from '@/components/purchases/PurchaseDocumentForm';
import { Card } from '@/components/ui/Card';
import { PurchaseReceipt } from '@shared/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function PurchaseDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  // Loaded once per visit: the form copies it into its own state.
  const receiptQuery = useApiQuery<PurchaseReceipt>(id ? `/purchases/receipts/${id}` : null, FORM_SNAPSHOT);
  const receipt = receiptQuery.data;

  if (receiptQuery.isError) {
    return (
      <Card>
        <LoadError
          error={receiptQuery.error}
          onRetry={() => void receiptQuery.refetch()}
          retrying={receiptQuery.isFetching}
        />
      </Card>
    );
  }

  if (receiptQuery.isPending) {
    return (
      <Card style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
        {isRu ? 'Загрузка документа...' : 'Hujjat yuklanmoqda...'}
      </Card>
    );
  }

  if (!receipt) {
    return (
      <Card style={{ padding: 'var(--space-8)', textAlign: 'center', color: '#ef4444' }}>
        {isRu ? 'Документ не найден' : 'Hujjat topilmadi'}
      </Card>
    );
  }

  return <PurchaseDocumentForm key={receipt.id} mode="edit" initialData={receipt} />;
}
