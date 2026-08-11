import { ReactNode } from 'react';
import './globals.css';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="uz">
      <body style={{ margin: 0, padding: 0, backgroundColor: 'var(--color-bg-primary, #F8FAFC)', color: 'var(--color-text-primary, #0F172A)' }}>
        {children}
      </body>
    </html>
  );
}
