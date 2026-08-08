'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Select';
import {
  FileText,
  Plus,
  ArrowRightLeft,
  Package,
  Building2,
  AlertCircle,
  X,
  Printer,
  CheckCircle2,
} from 'lucide-react';
import { InventoryDocument, Product } from '@shared/types';

export default function InventoryDocumentsPage() {
  const t = useTranslations('inventory');
  const tCommon = useTranslations('common');
  const locale = useLocale() as 'uz' | 'ru';
  const { token, company } = useAuth();

  const [documents, setDocuments] = useState<InventoryDocument[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Document Modal State
  const [showModal, setShowModal] = useState(false);
  const [docType, setDocType] = useState<'INBOUND' | 'OUTBOUND' | 'STOCKTAKING'>('INBOUND');
  const [warehouseId, setWarehouseId] = useState('');
  const [comment, setComment] = useState('');

  // Line Item Entry
  const [selectedProductId, setSelectedProductId] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [unitPrice, setUnitPrice] = useState<number>(0);
  const [items, setItems] = useState<{ productId: string; productName: string; quantity: number; unitPrice: number }[]>([]);

  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Print Document Modal State
  const [printDoc, setPrintDoc] = useState<InventoryDocument | null>(null);

  const fetchData = async () => {
    if (!token || !company) return;
    setLoading(true);
    try {
      const [docsData, prodsData, tenantData] = await Promise.all([
        apiFetch<InventoryDocument[]>('/inventory/documents', { token, tenantId: company.id, locale }),
        apiFetch<Product[]>('/inventory/products', { token, tenantId: company.id, locale }),
        apiFetch<any>(`/tenants/${company.id}`, { token, tenantId: company.id, locale }),
      ]);

      setDocuments(docsData);
      setProducts(prodsData);
      if (tenantData?.warehouses) {
        setWarehouses(tenantData.warehouses);
        if (tenantData.warehouses.length > 0) setWarehouseId(tenantData.warehouses[0].id);
      }
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
        unitPrice: unitPrice || Number(prod.costPrice) || 0,
      },
    ]);

    setSelectedProductId('');
    setQuantity(1);
    setUnitPrice(0);
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreateDocument = async (e: FormEvent) => {
    e.preventDefault();
    if (!token || !company || items.length === 0) return;
    setCreateError(null);
    setCreateLoading(true);

    try {
      await apiFetch<any>('/inventory/documents', {
        method: 'POST',
        token,
        tenantId: company.id,
        locale,
        body: JSON.stringify({
          warehouseId,
          docType,
          comment,
          items: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
        }),
      });

      setShowModal(false);
      setItems([]);
      setComment('');
      fetchData();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to post inventory document');
    } finally {
      setCreateLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const getDocTypeBadge = (type: string) => {
    switch (type) {
      case 'INBOUND':
        return <Badge variant="success">Kirim (Inbound)</Badge>;
      case 'OUTBOUND':
        return <Badge variant="error">Chiqim (Outbound)</Badge>;
      case 'STOCKTAKING':
        return <Badge variant="warning">Inventarizatsiya</Badge>;
      default:
        return <Badge variant="neutral">{type}</Badge>;
    }
  };

  const getDocTypeName = (type: string) => {
    if (type === 'INBOUND') return locale === 'uz' ? 'TOVAR QABUL QILISH DALOLATNOMASI (KIRIM)' : 'АКТ ПРИЁМА ТОВАРОВ (ПРИХОД)';
    if (type === 'OUTBOUND') return locale === 'uz' ? 'TOVAR HISOBDAN CHIQARISH DALOLATNOMASI (CHIQIM)' : 'АКТ СПИСАНИЯ ТОВАРОВ (РАСХОД)';
    return locale === 'uz' ? 'INVENTARIZATSIYA HISOBOTI' : 'АКТ ИНВЕНТАРИЗАЦИИ';
  };

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
            Ombor Hujjatlari
          </h1>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
            Kirim (Tushum), Chiqim (Hisobdan chiqarish) va Inventarizatsiya amallari
          </p>
        </div>

        <Button variant="primary" onClick={() => setShowModal(true)}>
          <Plus size={16} />
          Hujjat Rasmiylashtirish
        </Button>
      </div>

      {/* Document History Table */}
      <Card>
        {loading ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            {tCommon('loading')}
          </div>
        ) : documents.length === 0 ? (
          <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--color-text-tertiary)' }}>
            <FileText size={40} style={{ margin: '0 auto var(--space-2)', opacity: 0.4 }} />
            <div>Hujjatlar mavjud emas</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 'var(--text-sm)' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-tertiary)', fontSize: 'var(--text-xs)' }}>
                  <th style={{ padding: '12px' }}>HUJJAT №</th>
                  <th style={{ padding: '12px' }}>TURI</th>
                  <th style={{ padding: '12px' }}>OMBORXONA</th>
                  <th style={{ padding: '12px' }}>SANA</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>UMUMIY SUMMA</th>
                  <th style={{ padding: '12px', textAlign: 'center' }}>HOLAT</th>
                  <th style={{ padding: '12px', textAlign: 'right' }}>CHOP ETISH</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
                  <tr key={doc.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '12px', fontWeight: 'var(--font-semibold)', fontFamily: 'var(--font-mono)' }}>
                      {doc.docNumber}
                    </td>
                    <td style={{ padding: '12px' }}>{getDocTypeBadge(doc.docType)}</td>
                    <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>
                      {(doc as any).warehouse?.name?.[locale] || (doc as any).warehouse?.name?.uz || 'Ombor'}
                    </td>
                    <td style={{ padding: '12px', color: 'var(--color-text-secondary)' }}>
                      {formatDate(doc.docDate, locale)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'var(--font-bold)' }} className="tabular-nums">
                      {formatCurrency(Number(doc.totalAmount), locale)}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <Badge variant="success">O&apos;tkazilgan</Badge>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'right' }}>
                      <Button variant="outline" size="sm" onClick={() => setPrintDoc(doc)}>
                        <Printer size={14} />
                        Chop etish
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* New Document Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 'var(--space-4)' }}>
          <div style={{ width: '100%', maxWidth: '640px', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-6)', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--font-semibold)' }}>Yangi Ombor Hujjati</h3>
              <button type="button" onClick={() => setShowModal(false)} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            {createError && (
              <div style={{ padding: '10px', backgroundColor: 'var(--color-error-50)', color: 'var(--color-error-600)', borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-3)' }}>
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateDocument} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                <Select
                  label="Hujjat Turi"
                  options={[
                    { value: 'INBOUND', label: 'Kirim (Inbound - Tushum)' },
                    { value: 'OUTBOUND', label: 'Chiqim (Outbound - Chiqarish)' },
                    { value: 'STOCKTAKING', label: 'Inventarizatsiya (Tuzatish)' },
                  ]}
                  value={docType}
                  onChange={(val) => setDocType(val as any)}
                />

                <Select
                  label="Omborxona"
                  options={warehouseOptions}
                  value={warehouseId}
                  onChange={(val) => setWarehouseId(val)}
                  placeholder="Omborni tanlang"
                />
              </div>

              {/* Line Item Entry Block */}
              <div style={{ padding: '12px', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 'var(--font-semibold)', marginBottom: 'var(--space-2)' }}>Pozitsiya qo&apos;shish</div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 'var(--space-2)', alignItems: 'end' }}>
                  <Select
                    options={productOptions}
                    value={selectedProductId}
                    onChange={(val) => {
                      setSelectedProductId(val);
                      const p = products.find((prod) => prod.id === val);
                      if (p) setUnitPrice(Number(p.costPrice) || 0);
                    }}
                    placeholder="Mahsulotni tanlang..."
                  />

                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-secondary)' }}>Miqdori</label>
                    <input
                      type="number"
                      min={0.001}
                      step={0.01}
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                      style={{ width: '100%', padding: '6px 8px', fontSize: 'var(--text-xs)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-secondary)' }}>Birlik Narxi</label>
                    <input
                      type="number"
                      min={0}
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(Number(e.target.value))}
                      style={{ width: '100%', padding: '6px 8px', fontSize: 'var(--text-xs)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}
                    />
                  </div>
                  <Button type="button" variant="primary" size="sm" onClick={handleAddItem}>
                    +
                  </Button>
                </div>
              </div>

              {/* Added Line Items Table */}
              {items.length > 0 && (
                <div style={{ border: '1px solid var(--color-border-light)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)', textAlign: 'left' }}>
                    <thead style={{ backgroundColor: 'var(--color-bg-tertiary)' }}>
                      <tr>
                        <th style={{ padding: '8px' }}>Mahsulot</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Miqdori</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Narxi</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Jami</th>
                        <th style={{ padding: '8px', textAlign: 'center' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={idx} style={{ borderTop: '1px solid var(--color-border-light)' }}>
                          <td style={{ padding: '8px' }}>{item.productName}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>{item.quantity}</td>
                          <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(item.unitPrice, locale)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'var(--font-bold)' }}>
                            {formatCurrency(item.quantity * item.unitPrice, locale)}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <button type="button" onClick={() => handleRemoveItem(idx)} style={{ color: 'var(--color-error-600)', border: 'none', background: 'none', cursor: 'pointer' }}>✕</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-xs)', fontWeight: 'var(--font-medium)', marginBottom: '4px' }}>Izoh</label>
                <input
                  type="text"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Hujjat bo'yicha qo'shimcha izoh..."
                  style={{ width: '100%', padding: '8px 12px', fontSize: 'var(--text-sm)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
                  {tCommon('cancel')}
                </Button>
                <Button type="submit" variant="primary" disabled={createLoading || items.length === 0}>
                  {createLoading ? tCommon('loading') : 'Rasmiylashtirish va O\'tkazish'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Document Modal */}
      {printDoc && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60, padding: 'var(--space-4)' }}>
          <div style={{ width: '100%', maxWidth: '720px', backgroundColor: '#fff', borderRadius: 'var(--radius-lg)', padding: 'var(--space-8)', boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #000', paddingBottom: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
              <div>
                <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--font-bold)' }}>{getDocTypeName(printDoc.docType)}</h2>
                <div style={{ fontSize: 'var(--text-sm)', color: '#666' }}>Hujjat №: {printDoc.docNumber} | Sana: {formatDate(printDoc.docDate, locale)}</div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                <Button variant="primary" size="sm" onClick={handlePrint}>
                  <Printer size={14} /> Chop etish (Print)
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setPrintDoc(null)}>
                  Yopish
                </Button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', marginBottom: 'var(--space-6)', fontSize: 'var(--text-xs)' }}>
              <div>
                <strong>Tashkilot:</strong> {(company as any)?.name?.[locale] || (company as any)?.name?.uz || 'Demo Company'}<br />
                <strong>Omborxona:</strong> {(printDoc as any)?.warehouse?.name?.[locale] || (printDoc as any)?.warehouse?.name?.uz || 'Asosiy Ombor'}
              </div>
              <div>
                <strong>Tuzuvchi:</strong> {(printDoc as any)?.createdBy?.firstName} {(printDoc as any)?.createdBy?.lastName}<br />
                <strong>Holati:</strong> Tasdiqlangan / O&apos;tkazilgan (POSTED)
              </div>
            </div>

            {/* Line Items Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)', marginBottom: 'var(--space-6)' }}>
              <thead>
                <tr style={{ backgroundColor: '#f5f5f5', borderBottom: '1px solid #ccc' }}>
                  <th style={{ padding: '8px', textAlign: 'left' }}>№</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>Mahsulot</th>
                  <th style={{ padding: '8px', textAlign: 'left' }}>SKU</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Miqdori</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Birlik Narxi</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Jami</th>
                </tr>
              </thead>
              <tbody>
                {(printDoc.items || []).map((item, i) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '8px' }}>{i + 1}</td>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>{(item.product as any)?.name?.[locale] || (item.product as any)?.name?.uz}</td>
                    <td style={{ padding: '8px' }}>{(item.product as any)?.sku}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{Number(item.quantity)}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(Number(item.unitPrice), locale)}</td>
                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(Number(item.totalPrice), locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '2px solid #000', paddingTop: 'var(--space-4)', marginTop: 'var(--space-4)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: '#666' }}>Imzo: _________________________</div>
              <div style={{ fontSize: 'var(--text-base)', fontWeight: 'var(--font-bold)' }}>
                Jami: {formatCurrency(Number(printDoc.totalAmount), locale)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
