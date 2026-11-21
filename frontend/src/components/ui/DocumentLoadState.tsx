'use client';

import { useLocale } from 'next-intl';
import { FileQuestion } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Card } from '@/components/ui/Card';
import { buttonStyle } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadError } from '@/components/ui/LoadError';
import { Skeleton } from '@/components/ui/Skeleton';

export interface DocumentLoadStateProps {
  /** The document query (anything with these fields, e.g. a TanStack query). */
  query: { isError: boolean; isPending: boolean; isFetching: boolean; error: Error | null; refetch: () => unknown };
  /** True once loaded but nothing came back. */
  missing?: boolean;
  /** Where "Back to the list" goes, and how it is called. */
  listHref: string;
  listLabel: { uz: string; ru: string };
  /** "Sales document not found" etc. */
  notFound: { uz: string; ru: string };
}

/**
 * Loading / not found / failed states of a document page, so each detail page
 * does not hand-roll them. A 404 is not something to retry: it says the
 * document is gone and offers the way back to its list. Returns null when the
 * document is ready to render.
 */
export function DocumentLoadState({ query, missing = false, listHref, listLabel, notFound }: DocumentLoadStateProps) {
  const isRu = useLocale() === 'ru';
  const back = (
    <Link href={listHref} style={buttonStyle('outline')}>
      {isRu ? listLabel.ru : listLabel.uz}
    </Link>
  );

  if ((query.isError && (query.error as { status?: number } | null)?.status === 404) || (!query.isPending && !query.isError && missing)) {
    return (
      <Card>
        <EmptyState
          icon={FileQuestion}
          title={isRu ? notFound.ru : notFound.uz}
          description={isRu ? 'Возможно, документ удалён или ссылка устарела.' : 'Ehtimol, hujjat o‘chirilgan yoki havola eskirgan.'}
          action={back}
        />
      </Card>
    );
  }

  if (query.isError) {
    return (
      <Card>
        <LoadError error={query.error} onRetry={() => void query.refetch()} retrying={query.isFetching} />
        <div style={{ display: 'flex', justifyContent: 'center', paddingBottom: 'var(--space-4)' }}>{back}</div>
      </Card>
    );
  }

  if (query.isPending) {
    return (
      <div role="status" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <span className="sr-only">{isRu ? 'Загрузка документа…' : 'Hujjat yuklanmoqda…'}</span>
        <Skeleton height={28} width="40%" />
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 'var(--space-4)' }}>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i}>
                <Skeleton height={10} width="40%" />
                <Skeleton height={36} style={{ marginTop: 8 }} />
              </div>
            ))}
          </div>
        </Card>
        <Card>
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} height={36} style={{ marginTop: i ? 12 : 0 }} />
          ))}
        </Card>
      </div>
    );
  }

  return null;
}
