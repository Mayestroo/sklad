'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { ThemeSwitcher } from '@/components/ui/ThemeSwitcher';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { formatCurrency } from '@/lib/utils';
import { Palette, Layers, Type, Sun, Moon, Sparkles, CheckCircle2, Building, Package } from 'lucide-react';

export default function DesignSystemPage() {
  const locale = useLocale() as 'uz' | 'ru';
  const [tableDensity, setTableDensity] = useState<'compact' | 'comfortable'>('comfortable');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('PROFESSIONAL');

  const selectOptions = [
    { value: 'STARTER', label: 'Starter (490,000 UZS)', description: 'Boshlang\'ich ombor va sotuvlar', icon: <Package size={16} /> },
    { value: 'PROFESSIONAL', label: 'Professional (990,000 UZS)', description: 'Buxgalteriya va CRM bilan', icon: <Building size={16} /> },
    { value: 'ENTERPRISE', label: 'Enterprise (1,990,000 UZS)', description: 'Multi-Filial va REST API', icon: <Sparkles size={16} /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            UI/UX Design System & Theme Guidelines
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            Uzbekistan bozori uchun moslashtirilgan Inter font oilasi, Light/Dark rejim va komponentlar kutubxonasi
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          <ThemeSwitcher />
          <LanguageSwitcher />
        </div>
      </div>

      {/* Design System Tokens Showcase */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-4)' }}>
        {/* Colors */}
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
            <Palette size={18} style={{ color: 'var(--color-primary-600)' }} />
            <span>Color Palette & Tokens</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'var(--color-primary-600)' }} title="Primary 600" />
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'var(--color-success-600)' }} title="Success 600" />
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'var(--color-warning-600)' }} title="Warning 600" />
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: 'var(--color-error-600)' }} title="Error 600" />
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', backgroundColor: '#8b5cf6' }} title="Purple" />
          </div>
        </Card>

        {/* Typography */}
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
            <Type size={18} style={{ color: 'var(--color-primary-600)' }} />
            <span>Inter Font Glyph Rendering (UZ/RU)</span>
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
            Lotin: <strong>O&apos;, G&apos;, Sh, Ch</strong> | Кирилл: <strong>Ў, Қ, Ғ, Ҳ</strong>
          </div>
          <div className="tabular-nums" style={{ fontSize: 'var(--text-sm)', fontWeight: 'bold', color: 'var(--color-primary-600)' }}>
            Financial Tabular Nums: {formatCurrency(12500000.5, locale)}
          </div>
        </Card>

        {/* Table Density */}
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}>
            <Layers size={18} style={{ color: 'var(--color-primary-600)' }} />
            <span>Table Density Mode</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              size="sm"
              variant={tableDensity === 'compact' ? 'primary' : 'outline'}
              onClick={() => setTableDensity('compact')}
            >
              Compact (Zich)
            </Button>
            <Button
              size="sm"
              variant={tableDensity === 'comfortable' ? 'primary' : 'outline'}
              onClick={() => setTableDensity('comfortable')}
            >
              Comfortable (Keng)
            </Button>
          </div>
        </Card>
      </div>

      {/* UI Component Library */}
      <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)' }}>
          Komponentlar Kutubxonasi (Component Library)
        </h3>

        {/* Custom Select Showcase */}
        <div>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-2)' }}>
            MODERN SELECT DROPDOWN COMPONENT:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', maxWidth: '600px' }}>
            <Select
              label="Tarif rejasini tanlang (Custom Dropdown)"
              options={selectOptions}
              value={selectedPlan}
              onChange={(val) => setSelectedPlan(val)}
            />

            <div>
              <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px', color: 'var(--color-text-secondary)' }}>
                Native HTML Select (Styled)
              </label>
              <select style={{ width: '100%' }}>
                <option value="1">Omborxona №1 (Toshkent)</option>
                <option value="2">Omborxona №2 (Samarqand)</option>
                <option value="3">Omborxona №3 (Farg&apos;ona)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-2)' }}>
            BUTTON VARIANTS:
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            <Button variant="primary">Primary Button</Button>
            <Button variant="secondary">Secondary Button</Button>
            <Button variant="outline">Outline Button</Button>
            <Button variant="primary" size="sm">Small</Button>
            <Button variant="primary" size="lg">Large</Button>
          </div>
        </div>

        {/* Badges */}
        <div>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-2)' }}>
            BADGES & TAGS:
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
            <Badge variant="success">Active (Faol)</Badge>
            <Badge variant="warning">Trial (Sinovda)</Badge>
            <Badge variant="error">Blocked (Bloklangan)</Badge>
            <Badge variant="info">In Transit (Yo&apos;lda)</Badge>
            <Badge variant="neutral">Draft (Qoralama)</Badge>
          </div>
        </div>

        {/* Form Controls */}
        <div>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-2)' }}>
            FORM INPUTS & MODALS:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', maxWidth: '600px' }}>
            <Input label="Mahsulot Nomi" placeholder="Misol: Samarkand Flour 50kg" />
            <Input label="Narxi (UZS)" placeholder="125 000 UZS" error="Noto'g'ri qiymat" />
          </div>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <Button variant="outline" onClick={() => setModalOpen(true)}>
              Modal Oynani Ochish
            </Button>
          </div>
        </div>

        {/* Table Sample */}
        <div>
          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-tertiary)', marginBottom: 'var(--space-2)' }}>
            DEMO TABLE ({tableDensity.toUpperCase()} DENSITY):
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className={`table-${tableDensity}`} style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                  <th>TOVAR NOMI</th>
                  <th>SKU</th>
                  <th>NARXI</th>
                  <th>HOLATI</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                  <td style={{ fontWeight: 'bold' }}>Samarkand Wheat Flour</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>SKU-001</td>
                  <td className="tabular-nums">{formatCurrency(125000, locale)}</td>
                  <td><Badge variant="success">Stokda bor</Badge></td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                  <td style={{ fontWeight: 'bold' }}>Tashkent Sunflower Oil</td>
                  <td style={{ fontFamily: 'var(--font-mono)' }}>SKU-002</td>
                  <td className="tabular-nums">{formatCurrency(98000, locale)}</td>
                  <td><Badge variant="warning">Kam qoldiq</Badge></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Modal Demo */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Design System Modal Showcase">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
          <div>Ushbu modal oynasi barcha brauzerlarda va Light/Dark rejimlarda mukammal moslashuvchan (Responsive) ishlaydi.</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" onClick={() => setModalOpen(false)}>Tushunarli</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
