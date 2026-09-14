'use client';

import { useEffect } from 'react';
import { useRouter } from '@/i18n/navigation';

export default function LegacySuperAdminRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin');
  }, [router]);

  return null;
}
