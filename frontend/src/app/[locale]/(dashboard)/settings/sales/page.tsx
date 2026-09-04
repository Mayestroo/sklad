'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useLocale } from 'next-intl';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Badge } from '@/components/ui/Badge';
import {
  ShoppingCart,
  Layers,
  Save,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Sliders,
} from 'lucide-react';

export default function SalesSettingsPage() {
  const { token, company, updateCompanySettings } = useAuth();
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Settings state
  const [enableMultiTierPriceLists, setEnableMultiTierPriceLists] = useState(false);
  const [allowSellerPriceOverride, setAllowSellerPriceOverride] = useState(false);

  useEffect(() => {
    if (!token || !company) return;
    setLoading(true);
    apiFetch<any>('/tenants/settings', {
      token,
      tenantId: company.id,
      locale,
    })
      .then((settings) => {
        if (settings?.sales) {
          setEnableMultiTierPriceLists(Boolean(settings.sales.enableMultiTierPriceLists));
          setAllowSellerPriceOverride(Boolean(settings.sales.allowSellerPriceOverride));
        }
      })
      .catch((err) => {
        console.error('Failed to load sales settings:', err);
        setError(err.message || 'Xatolik yuz berdi');
      })
      .finally(() => setLoading(false));
  }, [token, company, locale]);

  const handleSave = async () => {
    if (!token || !company) return;
    setSaving(true);
    setError(null);
    setSaveSuccess(false);

    try {
      const updated = await apiFetch<any>('/tenants/settings', {
        method: 'PATCH',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          sales: {
            enableMultiTierPriceLists,
            allowSellerPriceOverride,
          },
        }),
      });

      if (updated) {
        updateCompanySettings(updated);
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Save failed:', err);
      setError(err.message || (isRu ? 'Ошибка сохранения' : 'Saqlashda xatolik yuz berdi'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
        {isRu ? 'Загрузка настроек...' : 'Sozlamalar yuklanmoqda...'}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', maxWidth: '900px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <ShoppingCart size={24} style={{ color: 'var(--color-primary-600)' }} />
            <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
              {isRu ? 'Настройки продаж' : 'Savdo sozlamalari'}
            </h1>
          </div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-1)' }}>
            {isRu
              ? 'Управление ценовой политикой, многоуровневыми прайс-листами и правами изменения цен'
              : 'Narx siyosati, ko\'p darajali narx jadvallari va narxni o\'zgartirish huquqlarini boshqarish'}
          </p>
        </div>

        <Button
          variant="primary"
          onClick={handleSave}
          disabled={saving}
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}
        >
          <Save size={16} />
          <span>{saving ? (isRu ? 'Сохранение...' : 'Saqlanmoqda...') : (isRu ? 'Сохранить изменения' : 'O\'zgarishlarni saqlash')}</span>
        </Button>
      </div>

      {saveSuccess && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-3) var(--space-4)',
            backgroundColor: 'var(--color-success-50)',
            color: 'var(--color-success-700)',
            border: '1px solid var(--color-success-200)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-sm)',
          }}
        >
          <CheckCircle2 size={18} />
          <span>{isRu ? 'Настройки успешно сохранены!' : 'Sozlamalar muvaffaqiyatli saqlandi!'}</span>
        </div>
      )}

      {error && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-3) var(--space-4)',
            backgroundColor: 'var(--color-error-50)',
            color: 'var(--color-error-700)',
            border: '1px solid var(--color-error-200)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-sm)',
          }}
        >
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {/* Main Settings Card */}
      <Card style={{ padding: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', borderBottom: '1px solid var(--color-border-light)', paddingBottom: 'var(--space-4)' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--color-primary-50)',
              color: 'var(--color-primary-600)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Layers size={20} />
          </div>
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)', color: 'var(--color-text-primary)' }}>
              {isRu ? 'Ценообразование и категории цен' : 'Narxlash va narx toifalari'}
            </h2>
            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
              {isRu
                ? 'Выберите подходящий режим работы для вашего масштаба бизнеса'
                : 'Biznesingiz ko\'lami va talabiga mos narxlash rejimini tanlang'}
            </p>
          </div>
        </div>

        {/* Setting 1: Enable Multi-tier Price Lists */}
        <div
          style={{
            padding: 'var(--space-4)',
            border: '1px solid var(--color-border-light)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: enableMultiTierPriceLists ? 'var(--color-primary-50)' : 'var(--color-bg-secondary)',
            transition: 'all var(--transition-fast)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
            <div style={{ flex: 1 }}>
              <Checkbox
                id="enable-multitier"
                size="lg"
                checked={enableMultiTierPriceLists}
                onChange={(e) => setEnableMultiTierPriceLists(e.target.checked)}
                label={
                  <span style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-base)' }}>
                    {isRu
                      ? 'Использовать многоуровневые прайс-листы и категории цен'
                      : 'Ko\'p darajali narxlar va chegirma jadvallaridan foydalanish (Enable Multi-tier Price Lists)'}
                  </span>
                }
                description={
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '4px', display: 'block' }}>
                    {isRu
                      ? 'Включает раздел "Прайс-листы" в боковом меню, позволяет создавать специальные цены для оптовиков, дилеров и VIP-клиентов с авто-подстановкой в заказы.'
                      : 'Yon menyuda "Narxlar va chegirmalar" bo\'limini faollashtiradi, ulgurji (optom), diler va VIP mijozlar uchun alohida narxlar belgilash hamda buyurtmada avto-narxlashni ta\'minlaydi.'}
                  </span>
                }
              />
            </div>
            <Badge variant={enableMultiTierPriceLists ? 'success' : 'neutral'}>
              {enableMultiTierPriceLists
                ? (isRu ? 'B2B / Оптом режим' : 'B2B / Optom rejimi')
                : (isRu ? 'Простой режим' : 'Oddiy rejim')}
            </Badge>
          </div>

          <div
            style={{
              marginTop: 'var(--space-3)',
              paddingTop: 'var(--space-3)',
              borderTop: '1px dashed var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-tertiary)',
            }}
          >
            <HelpCircle size={14} />
            <span>
              {enableMultiTierPriceLists
                ? (isRu
                    ? 'Активно: в карточке клиента выбор прайс-листа обязателен, а в заказах цены подставляются автоматически.'
                    : 'Faol: mijoz kartochkasida narx jadvali tanlanadi, buyurtma ochilganda esa narxlar avtomatik shakllanadi.')
                : (isRu
                    ? 'Отключено: боковое меню скрыто, все продажи и документы используют единую Базовую цену товара.'
                    : 'O\'chiq: bo\'lim yashirilgan, barcha savdo hujjatlari tovarning yagona Asosiy Narxi bo\'yicha ishlaydi.')}
            </span>
          </div>
        </div>

        {/* Setting 2: Allow Seller Price Override */}
        <div
          style={{
            padding: 'var(--space-4)',
            border: '1px solid var(--color-border-light)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--color-bg-secondary)',
          }}
        >
          <Checkbox
            id="allow-price-override"
            size="md"
            checked={allowSellerPriceOverride}
            onChange={(e) => setAllowSellerPriceOverride(e.target.checked)}
            label={
              <span style={{ fontWeight: 'var(--font-semibold)', fontSize: 'var(--text-sm)' }}>
                {isRu
                  ? 'Разрешить продавцам изменять цены вручную в заказах'
                  : 'Sotuvchilarga buyurtma va schyotlarda narxni qo\'lda o\'zgartirishga ruxsat berish (Allow Price Override)'}
              </span>
            }
            description={
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: '2px', display: 'block' }}>
                {isRu
                  ? 'Если выключено, поле цены в заказе блокируется для менеджеров без специальных прав sales:override_price.'
                  : 'Agar o\'chirilsa, maxsus huquqqa ega bo\'lmagan sotuvchilar uchun narx maydoni faqat o\'qish uchun bo\'lib qoladi.'}
              </span>
            }
          />
        </div>
      </Card>
    </div>
  );
}
