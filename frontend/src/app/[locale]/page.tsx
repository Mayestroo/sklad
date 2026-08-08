import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  TrendingUp,
  Package,
  Users,
  CreditCard,
  Building2,
  CheckCircle2,
  ArrowUpRight,
  Plus,
} from 'lucide-react';

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const tCommon = useTranslations('common');
  const tNav = useTranslations('nav');

  const stats = [
    {
      title: t('revenue'),
      value: '45,850,000 UZS',
      change: '+14.2%',
      isPositive: true,
      icon: TrendingUp,
      color: 'var(--color-primary-600)',
      bgColor: 'var(--color-primary-50)',
    },
    {
      title: t('totalProducts'),
      value: '1,248',
      change: '+8 yangi',
      isPositive: true,
      icon: Package,
      color: 'var(--color-success-600)',
      bgColor: 'var(--color-success-50)',
    },
    {
      title: t('totalCustomers'),
      value: '312',
      change: '+5 ushbu oy',
      isPositive: true,
      icon: Users,
      color: 'var(--color-info-600)',
      bgColor: 'var(--color-info-50)',
    },
    {
      title: t('cashBalance'),
      value: '128,400,000 UZS',
      change: 'BHMS 100%',
      isPositive: true,
      icon: CreditCard,
      color: 'var(--color-warning-600)',
      bgColor: 'var(--color-warning-50)',
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Welcome Banner */}
      <div
        style={{
          backgroundColor: 'var(--color-bg-secondary)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--color-border-light)',
          padding: 'var(--space-6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-1)' }}>
            <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
              {t('welcome')}, Demo Company!
            </h1>
            <Badge variant="success">Active Trial</Badge>
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            Unified MoySklad (Ombor + Sotuv) & 1C (Buxgalteriya BHMS) SaaS Platformasi
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <Button variant="outline" size="sm">
            <Building2 size={16} />
            {tNav('company')}
          </Button>
          <Button variant="primary" size="sm">
            <Plus size={16} />
            Yangi operatsiya
          </Button>
        </div>
      </div>

      {/* Summary KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-4)' }}>
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card key={i}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: stat.bgColor,
                    color: stat.color,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={22} />
                </div>
                <Badge variant={stat.isPositive ? 'success' : 'warning'}>{stat.change}</Badge>
              </div>
              <div style={{ marginTop: 'var(--space-4)' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{stat.title}</div>
                <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)', marginTop: '2px' }} className="tabular-nums">
                  {stat.value}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Module Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
        {/* MoySklad Warehouse & Sales Status */}
        <Card
          title="MoySklad — Ombor va Sotuv holati"
          subtitle="Real-vaqt rejimida inventarizatsiya va operatsiyalar"
          action={
            <Button variant="ghost" size="sm">
              Barchasi <ArrowUpRight size={14} />
            </Button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-bg-tertiary)' }}>
              <div>
                <div style={{ fontWeight: 'var(--font-medium)', fontSize: 'var(--text-sm)' }}>Asosiy omborxona (Toshkent)</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>842 mahsulot turi</div>
              </div>
              <Badge variant="success">Faol</Badge>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-bg-tertiary)' }}>
              <div>
                <div style={{ fontWeight: 'var(--font-medium)', fontSize: 'var(--text-sm)' }}>Filial ombor (Samarqand)</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>406 mahsulot turi</div>
              </div>
              <Badge variant="success">Faol</Badge>
            </div>
          </div>
        </Card>

        {/* 1C Double-Entry Accounting Status */}
        <Card
          title="1C Engine — Double-Entry Buxgalteriya"
          subtitle="O'zbekiston BHMS (NAS) schyotlar rejasi va jurnallar"
          action={
            <Button variant="ghost" size="sm">
              Schyotlar rejasi <ArrowUpRight size={14} />
            </Button>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-success-50)', border: '1px solid var(--color-success-100)' }}>
              <CheckCircle2 size={20} style={{ color: 'var(--color-success-600)' }} />
              <div>
                <div style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)', color: 'var(--color-success-600)' }}>
                  Aylanma-balans tengligi 100% tasdiqlangan
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  Debet va Kredit jami tengligi: 0.00 UZS farq
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-bg-tertiary)' }}>
              <div>
                <div style={{ fontWeight: 'var(--font-medium)', fontSize: 'var(--text-sm)' }}>QQS Stavkasi</div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>O'zbekiston standarti</div>
              </div>
              <span style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)' }}>12%</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
