import { TranslatableField } from './i18n';

export interface GlobalMetrics {
  /** Monthly recurring revenue, one row per subscription currency (ADR 0023). */
  mrrByCurrency: Array<{ currency: string; amount: number }>;
  activeTenantsCount: number;
  trialTenantsCount: number;
  totalUsersCount: number;
}

export interface TenantCompanySummary {
  id: string;
  name: TranslatableField;
  slug: string;
  status: 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'BLOCKED';
  plan: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
  userCount: number;
  createdAt: string;
  trialEndsAt: string | null;
}

/** Result of creating a tenant. */
export interface CreatedTenantSummary extends TenantCompanySummary {
  /**
   * Present only when the operator left the admin password empty: the
   * generated password, returned exactly once and never stored in plain text.
   */
  generatedAdminPassword?: string;
}

export interface SystemAnnouncement {
  id: string;
  title: TranslatableField;
  message: TranslatableField;
  isActive: boolean;
  createdAt: string;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  senderName: string;
  isFromAdmin: boolean;
  message: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  tenantId: string;
  companyName?: TranslatableField;
  subject: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  createdAt: string;
  messages?: TicketMessage[];
}

/**
 * The application does not take database backups. The database runs on Neon,
 * whose point-in-time restore and branch snapshots are the backup mechanism.
 */
export const BACKUPS_MANAGED_BY_NEON_MESSAGE = {
  uz: "Ma'lumotlar bazasi zaxirasi ilova tomonidan olinmaydi. Zaxiralash Neon platformasida: vaqt nuqtasiga tiklash (point-in-time restore) va branch snapshotlari orqali amalga oshiriladi.",
  ru: 'Приложение не создаёт резервные копии базы данных. Резервное копирование выполняется в Neon: восстановление на момент времени (point-in-time restore) и снапшоты веток (branch snapshots).',
} as const;

export interface BackupMetadata {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'FAILED';
}
