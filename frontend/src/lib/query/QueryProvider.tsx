'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { createQueryClient } from './query-client';

/** Drops every cached response when the user logs out or switches company. */
function ClearCacheOnIdentityChange() {
  const queryClient = useQueryClient();
  const { token, company } = useAuth();
  const identity = token && company ? `${company.id}` : null;
  useEffect(() => {
    if (identity === null) queryClient.clear();
  }, [identity, queryClient]);
  return null;
}

/** Must sit inside AuthProvider (the queries read the token from it). */
export function QueryProvider({ children }: { children: ReactNode }) {
  // One client per browser session; useState keeps it stable across renders.
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <ClearCacheOnIdentityChange />
      {children}
    </QueryClientProvider>
  );
}
