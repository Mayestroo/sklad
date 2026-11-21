'use client';

import { use } from 'react';
import { FORM_SNAPSHOT, useApiQuery } from '@/lib/query/useApiQuery';
import { PurchaseDocumentForm } from '@/components/purchases/PurchaseDocumentForm';
import { DocumentLoadState } from '@/components/ui/DocumentLoadState';
import { PurchaseReceipt } from '@shared/types';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function PurchaseDetailPage({ params }: PageProps) {
  const { id } = use(params);

  // Loaded once per visit: the form copies it into its own state.
  const receiptQuery = useApiQuery<PurchaseReceipt>(id ? `/purchases/receipts/${id}` : null, FORM_SNAPSHOT);
  const receipt = receiptQuery.data;

  if (!receipt) {
    return (
      <DocumentLoadState
        query={receiptQuery}
        missing
        listHref="/purchases"
        listLabel={{ uz: 'Kirim hujjatlari ro‘yxatiga', ru: 'К списку приходов' }}
        notFound={{ uz: 'Kirim hujjati topilmadi', ru: 'Приходный документ не найден' }}
      />
    );
  }

  return <PurchaseDocumentForm key={receipt.id} mode="edit" initialData={receipt} />;
}
