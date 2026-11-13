'use client';

import { useLocale } from 'next-intl';
import { Button } from '@/components/ui/Button';

/** A failed page load, with the API's message and a retry button. */
export function LoadError({
  error,
  onRetry,
  retrying = false,
}: {
  error: Error | null;
  onRetry: () => void;
  retrying?: boolean;
}) {
  const isRu = useLocale() === 'ru';
  return (
    <div
      role="alert"
      style={{
        padding: 'var(--space-6)',
        textAlign: 'center',
        color: 'var(--color-error-600)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-3)',
      }}
    >
      <div>
        {isRu ? 'Не удалось загрузить данные' : 'Ma’lumotlarni yuklab bo‘lmadi'}
        {error?.message ? `: ${error.message}` : ''}
      </div>
      <Button variant="secondary" size="sm" onClick={onRetry} disabled={retrying}>
        {isRu ? 'Повторить' : 'Qayta urinish'}
      </Button>
    </div>
  );
}
