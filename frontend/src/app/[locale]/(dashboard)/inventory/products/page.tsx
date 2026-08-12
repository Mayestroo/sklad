'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';

export default function InventoryProductsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/products');
  }, [router]);

  return null;
}
