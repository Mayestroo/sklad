'use client';

import { useParams } from 'next/navigation';
import { FORM_SNAPSHOT, useApiQuery } from '@/lib/query/useApiQuery';
import { PurchaseReturn } from '@shared/types';
import { PurchaseReturnDocumentForm } from '@/components/purchases/PurchaseReturnDocumentForm';
import { DocumentLoadState } from '@/components/ui/DocumentLoadState';

export default function ViewPurchaseReturnPage() {
  const params = useParams();
  const id = params?.id as string;

  // Loaded once per visit: the form copies it into its own state.
  const returnQuery = useApiQuery<PurchaseReturn>(id ? `/purchases/returns/${id}` : null, FORM_SNAPSHOT);
  const returnDoc = returnQuery.data;

  if (!returnDoc) {
    return (
      <DocumentLoadState
        query={returnQuery}
        missing
        listHref="/purchases/returns"
        listLabel={{ uz: 'Qaytarishlar ro‘yxatiga', ru: 'К списку возвратов' }}
        notFound={{ uz: 'Qaytarish hujjati topilmadi', ru: 'Документ возврата не найден' }}
      />
    );
  }

  return <PurchaseReturnDocumentForm key={returnDoc.id} mode="view" initialData={returnDoc} />;
}
