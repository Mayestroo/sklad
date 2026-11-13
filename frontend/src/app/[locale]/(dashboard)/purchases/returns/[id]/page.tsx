'use client';

import { useParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import { FORM_SNAPSHOT, useApiQuery } from '@/lib/query/useApiQuery';
import { LoadError } from '@/components/ui/LoadError';
import { PurchaseReturn } from '@shared/types';
import { PurchaseReturnDocumentForm } from '@/components/purchases/PurchaseReturnDocumentForm';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useRouter } from '@/i18n/navigation';

export default function ViewPurchaseReturnPage() {
  const params = useParams();
  const id = params?.id as string;
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const router = useRouter();

  // Loaded once per visit: the form copies it into its own state.
  const returnQuery = useApiQuery<PurchaseReturn>(id ? `/purchases/returns/${id}` : null, FORM_SNAPSHOT);
  const returnDoc = returnQuery.data;

  const backToList = (
    <Button variant="secondary" onClick={() => router.push('/purchases/returns')}>
      {isRu ? 'Вернуться к списку возвратов' : 'Qaytarishlar ro‘yxatiga qaytish'}
    </Button>
  );

  if (returnQuery.isError) {
    return (
      <Card style={{ padding: '32px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <LoadError
          error={returnQuery.error}
          onRetry={() => void returnQuery.refetch()}
          retrying={returnQuery.isFetching}
        />
        {backToList}
      </Card>
    );
  }

  if (returnQuery.isPending) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
        <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px', display: 'block' }} />
        <div>{isRu ? 'Загрузка документа возврата...' : 'Qaytarish hujjati yuklanmoqda...'}</div>
      </div>
    );
  }

  if (!returnDoc) {
    return (
      <Card style={{ padding: '32px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <AlertCircle size={40} style={{ color: 'var(--color-danger-500)' }} />
        <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-danger-600)' }}>
          {isRu ? 'Документ возврата не найден' : 'Qaytarish hujjati topilmadi'}
        </div>
        {backToList}
      </Card>
    );
  }

  return <PurchaseReturnDocumentForm key={returnDoc.id} mode="view" initialData={returnDoc} />;
}
