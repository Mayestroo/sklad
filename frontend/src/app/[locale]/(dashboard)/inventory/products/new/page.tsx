'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter, Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { ArrowLeft, Save, Package, AlertCircle } from 'lucide-react';
import { Category } from '@shared/types';

export default function NewProductPage() {
  const t = useTranslations('inventory');
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const router = useRouter();
  const { token, company } = useAuth();

  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form Fields
  const [nameUz, setNameUz] = useState('');
  const [nameRu, setNameRu] = useState('');
  const [descUz, setDescUz] = useState('');
  const [descRu, setDescRu] = useState('');
  const [sku, setSku] = useState('');
  const [barcode, setBarcode] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [type, setType] = useState<'PRODUCT' | 'SERVICE' | 'BUNDLE'>('PRODUCT');
  const [unitOfMeasure, setUnitOfMeasure] = useState<'piece' | 'kg' | 'liter' | 'meter' | 'box' | 'pack'>('piece');
  const [costPrice, setCostPrice] = useState<number>(0);
  const [salePrice, setSalePrice] = useState<number>(0);
  const [vatRate, setVatRate] = useState<number>(12);
  const [minStockAlert, setMinStockAlert] = useState<number>(5);

  useEffect(() => {
    if (!token || !company) return;
    apiFetch<Category[]>('/inventory/categories', {
      token,
      tenantId: company.id,
      locale,
    })
      .then(setCategories)
      .catch((err) => console.error(err));
  }, [token, company]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !company) return;
    setError(null);
    setLoading(true);

    try {
      await apiFetch<any>('/inventory/products', {
        method: 'POST',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          name: {
            uz: nameUz || nameRu,
            ru: nameRu || nameUz,
          },
          description: descUz || descRu ? { uz: descUz, ru: descRu } : undefined,
          sku,
          barcode: barcode || undefined,
          categoryId: categoryId || undefined,
          type,
          unitOfMeasure,
          costPrice: Number(costPrice),
          salePrice: Number(salePrice),
          vatRate: Number(vatRate),
          minStockAlert: Number(minStockAlert),
        }),
      });

      router.push('/inventory');
    } catch (err: any) {
      setError(err.message || 'Failed to create product');
    } finally {
      setLoading(false);
    }
  };

  const categoryOptions = [
    { value: '', label: 'Tanlanmagan' },
    ...categories.map((c) => ({ value: c.id, label: c.name[locale] || c.name.uz })),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: '800px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
        <Link href="/inventory" style={{ textDecoration: 'none' }}>
          <Button variant="outline" size="sm">
            <ArrowLeft size={16} />
            {tCommon('back')}
          </Button>
        </Link>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            Yangi Mahsulot Kartochkasi
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            Nomenklatura kartasini yaratish (O&apos;zbek va Rus tillarida)
          </p>
        </div>
      </div>

      {error && (
        <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-error-50)', color: 'var(--color-error-600)', border: '1px solid var(--color-error-100)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {/* Section 1: Bilingual Names */}
          <div>
            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-3)' }}>
              1. Mahsulot Nomi (2 tilli i18n)
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>
                  Nomi (O&apos;zbekcha - UZ) *
                </label>
                <input
                  type="text"
                  required
                  value={nameUz}
                  onChange={(e) => setNameUz(e.target.value)}
                  placeholder="Coca-Cola 1.5L Idim"
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>
                  Название (Русский - RU) *
                </label>
                <input
                  type="text"
                  required
                  value={nameRu}
                  onChange={(e) => setNameRu(e.target.value)}
                  placeholder="Кока-Кола 1.5Л"
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Identifiers & Category */}
          <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 'var(--space-4)' }}>
            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-3)' }}>
              2. Identifikatorlar va Kategoriya
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>
                  SKU (Артикул) *
                </label>
                <input
                  type="text"
                  required
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="PRD-00124"
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>
                  Shtrix-kod (Barcode)
                </label>
                <input
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="4780001234567"
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }}
                />
              </div>

              <Select
                label="Kategoriya"
                options={categoryOptions}
                value={categoryId}
                onChange={(val) => setCategoryId(val)}
                placeholder="Tanlanmagan"
              />
            </div>
          </div>

          {/* Section 3: Units & Pricing */}
          <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 'var(--space-4)' }}>
            <h3 style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-3)' }}>
              3. O&apos;lchov Birligi va Narxlar
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 'var(--space-4)' }}>
              <Select
                label="O'lchov Birligi"
                options={[
                  { value: 'piece', label: 'Dona (шт)' },
                  { value: 'kg', label: 'Kilogramm (кг)' },
                  { value: 'liter', label: 'Litr (л)' },
                  { value: 'meter', label: 'Metr (м)' },
                  { value: 'box', label: 'Quti (кор)' },
                  { value: 'pack', label: 'To\'plam (упак)' },
                ]}
                value={unitOfMeasure}
                onChange={(val) => setUnitOfMeasure(val as any)}
              />

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>
                  Tan Narxi (So&apos;m)
                </label>
                <input
                  type="number"
                  min={0}
                  value={costPrice}
                  onChange={(e) => setCostPrice(Number(e.target.value))}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>
                  Sotuv Narxi (So&apos;m) *
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={salePrice}
                  onChange={(e) => setSalePrice(Number(e.target.value))}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>
                  Min. Qoldiq Me&apos;yori
                </label>
                <input
                  type="number"
                  min={0}
                  value={minStockAlert}
                  onChange={(e) => setMinStockAlert(Number(e.target.value))}
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
            <Link href="/inventory" style={{ textDecoration: 'none' }}>
              <Button type="button" variant="secondary">
                {tCommon('cancel')}
              </Button>
            </Link>
            <Button type="submit" variant="primary" disabled={loading}>
              <Save size={16} />
              {loading ? tCommon('loading') : tCommon('save')}
            </Button>
          </div>
        </Card>
      </form>
    </div>
  );
}
