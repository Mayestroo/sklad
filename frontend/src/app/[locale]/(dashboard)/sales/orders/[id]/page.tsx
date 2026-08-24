'use client';

import { useEffect, useState, use } from 'react';
import { useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { SalesOrderForm } from '@/components/sales/SalesOrderForm';
import { Card } from '@/components/ui/Card';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function SalesOrderDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';
  const { token, company } = useAuth();

  const [order, setOrder] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !company || !id) return;
    setLoading(true);

    apiFetch<any>(`/sales/orders/${id}`, {
      token: token || undefined,
      tenantId: company.id,
      locale,
    })
      .then((res) => {
        if (res) {
          setOrder(res);
        } else {
          setError(isRu ? 'Заказ не найден' : 'Buyurtma topilmadi');
        }
      })
      .catch((err: any) => {
        console.error(err);
        setError(err.message || (isRu ? 'Ошибка загрузки заказа' : 'Buyurtmani yuklashda xatolik'));
      })
      .finally(() => setLoading(false));
  }, [token, company, id, locale]);

  if (loading) {
    return (
      <Card style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
        {isRu ? 'Загрузка заказа...' : 'Buyurtma yuklanmoqda...'}
      </Card>
    );
  }

  if (error || !order) {
    return (
      <Card style={{ padding: 'var(--space-8)', textAlign: 'center', color: '#ef4444' }}>
        {error || (isRu ? 'Заказ не найден' : 'Buyurtma topilmadi')}
      </Card>
    );
  }

  return <SalesOrderForm mode="edit" initialData={order} />;
}
