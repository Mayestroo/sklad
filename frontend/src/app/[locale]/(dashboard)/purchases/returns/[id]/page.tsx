'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
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
  const { token, company } = useAuth();

  const [returnDoc, setReturnDoc] = useState<PurchaseReturn | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || !company || !id) return;
    setLoading(true);

    apiFetch<PurchaseReturn>(`/purchases/returns/${id}`, {
      token,
      tenantId: company.id,
      locale,
    })
      .then((data) => setReturnDoc(data))
      .catch((err) => {
        setError(err?.message || (isRu ? 'Не удалось загрузить возврат' : 'Qaytarish hujjatini yuklab bo‘lmadi'));
      })
      .finally(() => setLoading(false));
  }, [token, company, id, locale]);

  if (loading) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
        <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px', display: 'block' }} />
        <div>{isRu ? 'Загрузка документа возврата...' : 'Qaytarish hujjati yuklanmoqda...'}</div>
      </div>
    );
  }

  if (error || !returnDoc) {
    return (
      <Card style={{ padding: '32px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
        <AlertCircle size={40} style={{ color: 'var(--color-danger-500)' }} />
        <div style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-danger-600)' }}>
          {error || (isRu ? 'Документ возврата не найден' : 'Qaytarish hujjati topilmadi')}
        </div>
        <Button variant="secondary" onClick={() => router.push('/purchases/returns')}>
          {isRu ? 'Вернуться к списку возвратов' : 'Qaytarishlar ro‘yxatiga qaytish'}
        </Button>
      </Card>
    );
  }

  return <PurchaseReturnDocumentForm mode="view" initialData={returnDoc} />;
}
