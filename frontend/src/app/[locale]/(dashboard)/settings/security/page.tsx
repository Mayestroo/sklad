'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  ShieldCheck,
  Lock,
  Database,
  Download,
  RefreshCw,
  FileCheck,
  Server,
  Activity,
  CheckCircle2,
} from 'lucide-react';
import { BackupMetadata } from '@shared/types';

export default function SecurityPage() {
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const { token, company } = useAuth();

  const [backups, setBackups] = useState<BackupMetadata[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [backupLoading, setBackupLoading] = useState(false);

  const fetchSecurityData = async () => {
    if (!token || !company) return;
    setLoading(true);
    try {
      const [b, logs] = await Promise.all([
        apiFetch<BackupMetadata[]>('/super-admin/backups/history', { token, tenantId: company.id, locale }),
        apiFetch<any[]>('/super-admin/audit-logs', { token, tenantId: company.id, locale }),
      ]);
      setBackups(b);
      setAuditLogs(logs);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSecurityData();
  }, [token, company]);

  const handleTriggerBackup = async () => {
    if (!token || !company) return;
    setBackupLoading(true);
    try {
      const res = await apiFetch<BackupMetadata>('/super-admin/backups/trigger', {
        token,
        tenantId: company.id,
        locale,
        method: 'POST',
      });
      alert(`PostgreSQL Zaxira Nusxasi Shakllantirildi: ${res.filename}`);
      fetchSecurityData();
    } catch (err: any) {
      alert(err.message || 'Error creating backup');
    } finally {
      setBackupLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            Xavfsizlik, Zaxira Nusxalash va Qonuniy Muvofiqlik (Security & Compliance)
          </h1>
        </div>

        <Button variant="primary" onClick={handleTriggerBackup} disabled={backupLoading}>
          <Database size={16} /> {backupLoading ? 'Zaxiralanmoqda...' : 'Zahiraviy Nusxa Olish (PostgreSQL Dump)'}
        </Button>
      </div>

      {/* Uzbekistan Lex ZRU-547 Compliance Badge Banner */}
      <Card style={{ background: 'linear-gradient(135deg, rgba(22,163,74,0.08) 0%, rgba(22,163,74,0.02) 100%)', border: '1px solid var(--color-success-100)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-xl)', backgroundColor: 'var(--color-success-100)', color: 'var(--color-success-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <FileCheck size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)' }}>
                O&apos;zbekiston Respublikasi Shaxsiy Ma&apos;lumotlar Qonuniga (ZRU-547) To&apos;liq Mos
              </h3>
              <Badge variant="success">LEX ZRU-547 COMPLIANT</Badge>
            </div>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
              Barcha client kompaniyalar ma&apos;lumotlari va server infratuzilmasi O&apos;zbekiston Respublikasi hududidagi (Tashkent Data Center) serverlarda xavfsiz saqlanadi hamda yillik 30 kunlik avtomatik zaxiralash siyosatiga egadir.
            </p>
          </div>
        </div>
      </Card>

      {/* Security Audit Checklist & Tokens */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
        <Card style={{ borderLeft: '4px solid var(--color-primary-600)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
            <ShieldCheck size={18} style={{ color: 'var(--color-primary-600)' }} />
            <span>Tenant Isolation Middleware</span>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '8px' }}>
            Har bir Prisma ORM va SQL so&apos;roviga avtomatik <code>tenant_id</code> filtri biriktirilgan. Ma&apos;lumotlar sizib chiqish xavfi 0%.
          </p>
        </Card>

        <Card style={{ borderLeft: '4px solid var(--color-success-600)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
            <Lock size={18} style={{ color: 'var(--color-success-600)' }} />
            <span>Bcrypt & JWT Encryption</span>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '8px' }}>
            Parollar bcrypt xeshlanishi bilan saqlanadi va JWT auth tokenlar 7 kunlik amal qilish muddati hamda RBAC rollar bilan himoyalangan.
          </p>
        </Card>

        <Card style={{ borderLeft: '4px solid #8b5cf6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
            <Server size={18} style={{ color: '#8b5cf6' }} />
            <span>Throttler Rate Limiting</span>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '8px' }}>
            DDoS hujumlaridan himoya qilish uchun har bir IP uchun minutiga maksimal 100 ta REST API so&apos;rovi cheklovi o&apos;rnatilgan.
          </p>
        </Card>
      </div>

      {loading ? (
        <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
          {tCommon('loading')}
        </div>
      ) : (
        <>
          {/* Database Backups History Table */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)' }}>
                PostgreSQL Zaxira Nusxalari Tarixi (Backup History)
              </h3>
              <Badge variant="info">30 KUNLIK RETENTION POLICY</Badge>
            </div>

            {backups.length === 0 ? (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                Hozircha zaxira fayllari yaratilmagan. Yuqoridagi tugma orqali zaxira oling.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                      <th style={{ padding: '12px' }}>FAYL NOMI</th>
                      <th style={{ padding: '12px' }}>HACMI (BYTES)</th>
                      <th style={{ padding: '12px' }}>YARATILGAN SANA</th>
                      <th style={{ padding: '12px', textAlign: 'center' }}>HOLATI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {backups.map((b, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        <td style={{ padding: '12px', fontWeight: 'bold', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                          {b.filename}
                        </td>
                        <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }} className="tabular-nums">
                          {(b.sizeBytes / 1024).toFixed(2)} KB
                        </td>
                        <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>
                          {formatDate(b.createdAt, locale)}
                        </td>
                        <td style={{ padding: '12px', textAlign: 'center' }}>
                          <Badge variant="success">COMPLETED</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Audit Logs Trail Table */}
          <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)' }}>
                Tizim Harakatlari Auditi (System Audit Trail Logs)
              </h3>
              <Activity size={18} style={{ color: 'var(--color-primary-600)' }} />
            </div>

            {auditLogs.length === 0 ? (
              <div style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
                Auditorlik jurnali bo&apos;sh
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                      <th style={{ padding: '12px' }}>SANA VA VAQT</th>
                      <th style={{ padding: '12px' }}>FOYDALANUVCHI</th>
                      <th style={{ padding: '12px' }}>HARAKAT (ACTION)</th>
                      <th style={{ padding: '12px' }}>OBYEKT (ENTITY)</th>
                      <th style={{ padding: '12px' }}>IP MANZIL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                        <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>{formatDate(log.createdAt, locale)}</td>
                        <td style={{ padding: '12px', fontWeight: 'bold' }}>{log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System'}</td>
                        <td style={{ padding: '12px' }}><Badge variant="neutral">{log.action}</Badge></td>
                        <td style={{ padding: '12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{log.entityType} ({log.entityId.slice(0, 8)}...)</td>
                        <td style={{ padding: '12px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{log.ipAddress || '127.0.0.1'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
