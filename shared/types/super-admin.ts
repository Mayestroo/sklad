import { TranslatableField } from './i18n';

export interface GlobalMetrics {
  totalMrr: number;            // in UZS
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

export interface BackupMetadata {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'FAILED';
}
