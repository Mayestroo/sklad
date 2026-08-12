import { ReactNode } from 'react';
import './globals.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="uz" suppressHydrationWarning>
      <head>
        <title>CRM SaaS — Unified MoySklad + 1C Platform (Uzbekistan)</title>
        <meta name="description" content="Multi-tenant SaaS platform combining warehouse management and double-entry accounting natively in Uzbek and Russian." />
      </head>
      <body suppressHydrationWarning style={{ margin: 0, padding: 0, backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}>
        {children}
      </body>
    </html>
  );
}
