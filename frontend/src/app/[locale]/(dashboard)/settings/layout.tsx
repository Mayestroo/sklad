import type { ReactNode } from 'react';
import { SettingsShell } from '@/components/layout/SettingsShell';

/** Every settings page sits in the same searchable settings frame. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <SettingsShell>{children}</SettingsShell>;
}
