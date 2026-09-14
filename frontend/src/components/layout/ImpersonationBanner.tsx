'use client';

import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function ImpersonationBanner() {
  const { isImpersonated, company, exitImpersonation } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  if (!isImpersonated) return null;

  const companyName = company?.name
    ? typeof company.name === 'string'
      ? company.name
      : company.name[locale] || company.name.uz || company.slug
    : 'Korxona';

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backgroundColor: '#7f1d1d', // Tailwind red-900
        borderBottom: '2px solid #ef4444', // Tailwind red-500
        color: '#ffffff',
        padding: '8px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)',
        fontSize: '13px',
        fontWeight: 500,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <ShieldAlert size={18} style={{ color: '#f87171' }} />
        <span>
          {isRu
            ? `Вы находитесь в режиме техподдержки Superadmin: компания «${companyName}»`
            : `Siz Superadmin texnik yordam rejimidasiz: «${companyName}» korxonasi`}
        </span>
      </div>

      <Button
        variant="secondary"
        size="sm"
        onClick={exitImpersonation}
        style={{
          backgroundColor: '#ffffff',
          color: '#991b1b',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 12px',
          borderRadius: '6px',
          cursor: 'pointer',
        }}
      >
        <ArrowLeft size={14} />
        {isRu ? 'Вернуться в Superadmin Panel' : 'Superadmin panelga qaytish'}
      </Button>
    </div>
  );
}
