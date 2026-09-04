'use client';

import React from 'react';
import { Badge } from '@/components/ui/Badge';
import {
  ORDER_STATUS_LABELS,
  DOCUMENT_STATUS_LABELS,
  PAYMENT_STATUS_LABELS,
  StatusMeta,
} from '@/lib/constants/statuses';

interface DocumentStatusBadgeProps {
  status: string;
  type?: 'order' | 'document' | 'payment';
  locale?: 'uz' | 'ru';
}

export function DocumentStatusBadge({
  status,
  type = 'document',
  locale = 'uz',
}: DocumentStatusBadgeProps) {
  let meta: StatusMeta | undefined;

  if (type === 'order') {
    meta = ORDER_STATUS_LABELS[status];
  } else if (type === 'payment') {
    meta = PAYMENT_STATUS_LABELS[status];
  } else {
    meta = DOCUMENT_STATUS_LABELS[status] || ORDER_STATUS_LABELS[status];
  }

  if (!meta) {
    return <Badge variant="neutral">{status}</Badge>;
  }

  const label = locale === 'ru' ? meta.ru : meta.uz;

  return (
    <Badge variant={meta.variant}>
      {label}
    </Badge>
  );
}
