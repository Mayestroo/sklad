'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';

/**
 * Legacy URL. Product creation lives at /products/new; this page used to be a
 * stale copy that sent invalid requests (empty translation, missing currencies).
 */
export default function InventoryNewProductRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/products/new');
  }, [router]);

  return null;
}
