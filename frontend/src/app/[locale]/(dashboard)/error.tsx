'use client';

import { useEffect } from 'react';
import { useLocale } from 'next-intl';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = useLocale();
  const isRu = locale === 'ru';

  useEffect(() => {
    console.error('Dashboard Error Boundary Caught:', error);
  }, [error]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        padding: 'var(--space-6)',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          maxWidth: '480px',
          width: '100%',
          backgroundColor: 'var(--color-bg-secondary)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          padding: 'var(--space-8) var(--space-6)',
          boxShadow: 'var(--shadow-md)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-4)',
        }}
      >
        <div
          style={{
            width: '56px',
            height: '56px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: 'var(--color-danger-50)',
            border: '1px solid var(--color-danger-100)',
            color: 'var(--color-danger-600)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AlertTriangle size={28} />
        </div>

        <h2
          style={{
            fontSize: 'var(--text-lg)',
            fontWeight: 'var(--font-bold)',
            color: 'var(--color-text-primary)',
            margin: 0,
          }}
        >
          {isRu ? 'Не удалось загрузить страницу' : 'Sahifani yuklab bo‘lmadi'}
        </h2>

        <p
          style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-secondary)',
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          {isRu
            ? 'Произошла непредвиденная ошибка при обработке данных. Попробуйте обновить страницу или вернуться назад.'
            : 'Ma‘lumotlarni yuklashda kutilmagan xatolik yuz berdi. Sahifani qayta yuklang yoki orqaga qayting.'}
        </p>

        {error?.message && (
          <div
            style={{
              fontSize: 'var(--text-xs)',
              fontFamily: 'monospace',
              color: 'var(--color-danger-600)',
              backgroundColor: 'var(--color-danger-50)',
              padding: '6px 12px',
              borderRadius: 'var(--radius-sm)',
              maxWidth: '100%',
              overflowX: 'auto',
            }}
          >
            {error.message}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            marginTop: 'var(--space-2)',
            flexWrap: 'wrap',
            justifyContent: 'center',
          }}
        >
          <Button
            variant="secondary"
            onClick={() => window.history.back()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ArrowLeft size={16} />
            {isRu ? 'Назад' : 'Orqaga'}
          </Button>
          <Button
            onClick={() => reset()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={16} />
            {isRu ? 'Повторить' : 'Qayta urinish'}
          </Button>
        </div>
      </div>
    </div>
  );
}
