'use client';

import { useEffect, useState, use } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
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
  const { token, company } = useAuth();

  const [receipt, setReceipt] = useState<PurchaseReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !company || !id) return;
    setLoading(true);

    apiFetch<PurchaseReceipt>(`/purchases/receipts/${id}`, {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => {
        if (res) {
          setReceipt(res);
        } else {
          setError(isRu ? 'Документ не найден' : 'Hujjat topilmadi');
        }
      })
      .catch((err: any) => {
        console.error(err);
        setError(err.message || (isRu ? 'Ошибка загрузки документа' : 'Hujjatni yuklashda xatolik'));
      })
      .finally(() => setLoading(false));
  }, [token, company, id, locale]);

  if (loading) {
    return (
      <Card style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
        {isRu ? 'Загрузка документа...' : 'Hujjat yuklanmoqda...'}
      </Card>
    );
  }

  if (error || !receipt) {
    return (
      <Card style={{ padding: 'var(--space-8)', textAlign: 'center', color: '#ef4444' }}>
        {error || (isRu ? 'Документ не найден' : 'Hujjat topilmadi')}
      </Card>
    );
  }

  return <PurchaseDocumentForm mode="edit" initialData={receipt} />;
}
