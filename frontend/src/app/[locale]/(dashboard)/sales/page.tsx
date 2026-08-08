'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import {
  ShoppingCart,
  Plus,
  FileText,
  Printer,
  Users,
  CreditCard,
  Building2,
  AlertCircle,
  X,
  Kanban,
  Truck,
} from 'lucide-react';
import { SalesInvoice, Counterparty, Product } from '@shared/types';

export default function SalesPage() {
  const t = useTranslations('sales');
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const { token, company, hasPermission } = useAuth();

  const [invoices, setInvoices] = useState<SalesInvoice[]>([]);
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Invoice Modal State
  const [showModal, setShowModal] = useState(false);
  const [counterpartyId, setCounterpartyId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [items, setItems] = useState<{ productId: string; productName: string; quantity: number; unitPrice: number }[]>([]);

  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // E-Faktura Print Modal
  const [printInvoice, setPrintInvoice] = useState<SalesInvoice | null>(null);

  const fetchData = async () => {
    if (!token || !company) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [invsData, countData, prodsData, tenantData] = await Promise.all([
        apiFetch<SalesInvoice[]>('/sales/invoices', { token, tenantId: company.id, locale }),
        apiFetch<Counterparty[]>('/sales/counterparties', { token, tenantId: company.id, locale }),
        apiFetch<Product[]>('/inventory/products', { token, tenantId: company.id, locale }),
        apiFetch<any>(`/tenants/${company.id}`, { token, tenantId: company.id, locale }),
      ]);

      setInvoices(invsData);
      setCounterparties(countData);
      setProducts(prodsData);
      if (countData.length > 0) setCounterpartyId(countData[0].id);
      if (tenantData?.warehouses?.length > 0) setWarehouseId(tenantData.warehouses[0].id);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token, company]);

  const handleAddItem = () => {
    if (!selectedProductId || quantity <= 0) return;
    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod) return;

    const prodName = prod.name[locale] || prod.name.uz || prod.name.ru;
    setItems((prev) => [
      ...prev,
      {
        productId: selectedProductId,
        productName: prodName,
        quantity,
        unitPrice: unitPrice || Number(prod.salePrice) || 0,
      },
    ]);

    setSelectedProductId('');
    setQuantity(1);
    setUnitPrice(0);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateInvoice = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !company || items.length === 0) return;
    setCreateError(null);
    setCreateLoading(true);

    try {
      await apiFetch<any>('/sales/invoices', {
        method: 'POST',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          counterpartyId,
          warehouseId,
          items: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
        }),
      });

      setShowModal(false);
      setItems([]);
      fetchData();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to post sales invoice');
    } finally {
      setCreateLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PAID':
        return <Badge variant="success">To&apos;langan (PAID)</Badge>;
      case 'PARTIALLY_PAID':
        return <Badge variant="warning">Qisman to&apos;langan</Badge>;
      case 'SENT':
        return <Badge variant="info">Yuborilgan (SENT)</Badge>;
      case 'OVERDUE':
        return <Badge variant="error">Muddati o&apos;tgan</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const totalSalesAmount = invoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
  const totalPaidAmount = invoices.reduce((sum, inv) => sum + Number(inv.paidAmount), 0);

  const counterpartyOptions = counterparties.map((c) => ({
    value: c.id,
    label: `${c.name} ${c.inn ? `(STIR: ${c.inn})` : ''}`,
  }));

  const warehouseOptions = warehouses.map((w) => ({
    value: w.id,
    label: w.name[locale] || w.name.uz,
  }));

  const productOptions = products.map((p) => ({
    value: p.id,
    label: `${p.name[locale] || p.name.uz} (${p.sku})`,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-text-primary)' }}>
            Sotuv va Hisob-fakturalar (E-Faktura)
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            Mijozlar buyurtmalari, 12% QQS hisob-fakturalari va to&apos;lovlar monitoringi
          </p>
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          <Link href="/sales/customers" style={{ textDecoration: 'none' }}>
            <Button variant="outline">
              <Users size={16} /> Kontragentlar
            </Button>
          </Link>
          <Link href="/sales/crm" style={{ textDecoration: 'none' }}>
            <Button variant="outline">
              <Kanban size={16} /> CRM Kanban
            </Button>
          </Link>
          <Link href="/sales/purchases" style={{ textDecoration: 'none' }}>
            <Button variant="outline">
              <Truck size={16} /> Xaridlar
            </Button>
          </Link>
          {hasPermission('sales:create') && (
            <Button variant="primary" onClick={() => setShowModal(true)}>
              <Plus size={16} />
              Yangi Hisob-faktura
            </Button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
        <Card>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>JAMI SOTUV SHARTNOMA SUMMASI</div>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', marginTop: '4px' }} className="tabular-nums">
            {formatCurrency(totalSalesAmount, locale)}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>QABUL QILINGAN TO&apos;LOVLAR</div>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-success-600)', marginTop: '4px' }} className="tabular-nums">
            {formatCurrency(totalPaidAmount, locale)}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>KUTILAYOTGAN DEBITORLIK QARZI</div>
          <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)', color: 'var(--color-warning-600)', marginTop: '4px' }} className="tabular-nums">
            {formatCurrency(totalSalesAmount - totalPaidAmount, locale)}
          </div>
        </Card>
      </div>

      {/* Invoices List Table */}
      <Card>
        {loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            {tCommon('loading')}
          </div>
        ) : invoices.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <ShoppingCart size={40} style={{ margin: '0 auto var(--space-2)', opacity: 0.4 }} />
            <div>Sotuv hisob-fakturalari mavjud emas</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                  <th style={{ padding: '12px' }}>FAKTURA №</th>
                  <th style={{ padding: '12px' }}>MIJOZ (KONTRAGENT)</th>
                  <th style={{ padding: '12px' }}>SANA</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>QQS (12%)</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>UMUMIY SUMMA</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>HOLAT</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>E-FAKTURA</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '12px', fontWeight: 'var(--font-semibold)', fontFamily: 'var(--font-mono)' }}>
                      {inv.invoiceNumber}
                    </td>
                    <td style={{ padding: '12px', fontWeight: 'var(--font-medium)' }}>
                      {inv.counterparty?.name || '—'}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>
                      {formatDate(inv.invoiceDate, locale)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', color: 'var(--color-text-secondary)' }} className="tabular-nums">
                      {formatCurrency(Number(inv.vatAmount), locale)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
                      {formatCurrency(Number(inv.totalAmount), locale)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {getStatusBadge(inv.status)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <Button variant="outline" size="sm" onClick={() => setPrintInvoice(inv)}>
                        <Printer size={14} /> E-Faktura Chop
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* New Invoice Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 'var(--space-4)' }}>
          <div style={{ width: '100%', maxWidth: '640px', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)' }}>Yangi Hisob-faktura yaratish</h3>
              <button type="button" onClick={() => setShowModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>

            {createError && (
              <div style={{ padding: '10px', backgroundColor: 'var(--color-error-50)', color: 'var(--color-error-600)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3)' }}>
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateInvoice} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <Select
                  label="Mijoz (Kontragent)"
                  options={counterpartyOptions}
                  value={counterpartyId}
                  onChange={(val) => setCounterpartyId(val)}
                  placeholder="Mijozni tanlang"
                />

                <Select
                  label="Chiqim Omborxonasi"
                  options={warehouseOptions}
                  value={warehouseId}
                  onChange={(val) => setWarehouseId(val)}
                  placeholder="Omborni tanlang"
                />
              </div>

              {/* Line Item Entry Block */}
              <div style={{ padding: '12px', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)' }}>Tovar pozitsiyasi qo&apos;shish</div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 'var(--space-2)', alignItems: 'end' }}>
                  <Select
                    options={productOptions}
                    value={selectedProductId}
                    onChange={(val) => {
                      setSelectedProductId(val);
                      const p = products.find((prod) => prod.id === val);
                      if (p) setUnitPrice(Number(p.salePrice) || 0);
                    }}
                    placeholder="Mahsulotni tanlang..."
                  />

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-secondary)' }}>Miqdori</label>
                    <input
                      type="number"
                      min={0.001}
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      style={{ width: '100%', padding: '6px 8px', fontSize: 'var(--text-xs)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-secondary)' }}>Sotuv Narxi</label>
                    <input
                      type="number"
                      min={0}
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(Number(e.target.value))}
                      style={{ width: '100%', padding: '6px 8px', fontSize: 'var(--text-xs)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                    />
                  </div>

                  <Button type="button" variant="primary" size="sm" onClick={handleAddItem}>+</Button>
                </div>
              </div>

              {/* Items List */}
              {items.length > 0 && (
                <div style={{ border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)', textAlign: 'left' }}>
                    <thead style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
                      <tr>
                        <th style={{ padding: '8px' }}>Mahsulot</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Miqdor</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Narx</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>QQS (12%)</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Jami</th>
                        <th style={{ padding: '8px', textAlign: 'center' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => {
                        const sub = item.quantity * item.unitPrice;
                        const vat = sub * 0.12;
                        return (
                          <tr key={idx} style={{ borderTop: '1px solid var(--color-border-light)' }}>
                            <td style={{ padding: '8px' }}>{item.productName}</td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>{item.quantity}</td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(item.unitPrice, locale)}</td>
                            <td style={{ padding: '8px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>{formatCurrency(vat, locale)}</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'var(--font-bold)' }}>{formatCurrency(sub + vat, locale)}</td>
                            <td style={{ padding: '8px', textAlign: 'center' }}>
                              <button type="button" onClick={() => handleRemoveItem(idx)} style={{ color: 'var(--color-error-600)', border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>{tCommon('cancel')}</Button>
                <Button type="submit" variant="primary" disabled={createLoading || items.length === 0}>
                  {createLoading ? tCommon('loading') : 'Rasmiylashtirish va Ombordan Chiqish'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Official E-Faktura Printable View Modal */}
      {printInvoice && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 'var(--space-4)' }}>
          <div style={{ width: '100%', maxWidth: '760px', backgroundColor: '#fff', borderRadius: 'var(--radius-lg)', padding: 'var(--space-8)', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000', paddingBottom: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
              <div>
                <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)' }}>
                  {locale === 'uz' ? 'HISOB-FAKTURA (O\'ZBEKISTON RESPUBLIKASI STANDARTI)' : 'СЧЁТ-ФАКТУРА (СТАНДАРТ РЕСПУБЛИКИ УЗБЕКИСТАН)'}
                </h2>
                <div style={{ fontSize: 'var(--text-sm)', color: '#666' }}>№: {printInvoice.invoiceNumber} | Sana: {formatDate(printInvoice.invoiceDate, locale)}</div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <Button variant="primary" size="sm" onClick={() => window.print()}>
                  <Printer size={14} /> Chop etish (Print)
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setPrintInvoice(null)}>
                  Yopish
                </Button>
              </div>
            </div>

            {/* Legal Information Section */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)', marginBottom: 'var(--space-6)', fontSize: 'var(--text-xs)' }}>
              <div style={{ border: '1px solid #ccc', padding: '12px', borderRadius: '4px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '4px', textTransform: 'uppercase' }}>ETKAZIB BERUVCHI (SELLER):</div>
                <strong>Tashkilot:</strong> {(company as any)?.name?.[locale] || (company as any)?.name?.uz || 'Demo Company'}<br />
                <strong>STIR / INN:</strong> 309876543<br />
                <strong>MFO / Bank:</strong> 00440 (Ipoteka Bank)<br />
                <strong>Hisob raqam:</strong> 20208000900123456001
              </div>

              <div style={{ border: '1px solid #ccc', padding: '12px', borderRadius: '4px' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '4px', textTransform: 'uppercase' }}>HARIDOR (BUYER):</div>
                <strong>Mijoz:</strong> {printInvoice.counterparty?.name}<br />
                <strong>STIR / INN:</strong> {printInvoice.counterparty?.inn || '301234567'}<br />
                <strong>MFO:</strong> {printInvoice.counterparty?.mfo || '00440'}<br />
                <strong>Hisob raqam:</strong> {printInvoice.counterparty?.bankAccount || '20208000900987654001'}
              </div>
            </div>

            {/* Line Items Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-6)' }}>
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '1px solid #ccc' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>№</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Mahsulot Nomi</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Miqdor</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Birlik Narxi</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Summa (QQSsiz)</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>QQS (12%)</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Jami Summa</th>
                </tr>
              </thead>
              <tbody>
                {(printInvoice.items || []).map((item, i) => {
                  const sub = Number(item.quantity) * Number(item.unitPrice);
                  const vat = Number(item.vatAmount);
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '8px' }}>{i + 1}</td>
                      <td style={{ padding: '8px', fontWeight: 'bold' }}>{(item.product as any)?.name?.[locale] || (item.product as any)?.name?.uz}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{Number(item.quantity)}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(Number(item.unitPrice), locale)}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(sub, locale)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: '#666' }}>{formatCurrency(vat, locale)}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(sub + vat, locale)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid #000', paddingTop: 'var(--space-4)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: '#666' }}>
                Rahbar: _____________________<br />
                Bosh Buxgalter: _____________________
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 'var(--text-xs)', color: '#666' }}>QQS (12%): {formatCurrency(Number(printInvoice.vatAmount), locale)}</div>
                <div style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-bold)', marginTop: '4px' }}>
                  Jami To&apos;lanishi Kerak: {formatCurrency(Number(printInvoice.totalAmount), locale)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
