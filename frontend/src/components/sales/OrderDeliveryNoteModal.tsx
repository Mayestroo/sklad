'use client';

import { useLocale } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Printer, X, FileText } from 'lucide-react';

interface DeliveryNoteItem {
  id: string;
  quantity: number | string;
  unitPrice: number | string;
  discount?: number | string;
  totalPrice?: number | string;
  product?: {
    name?: string | Record<string, string>;
    sku?: string;
    unitOfMeasure?: string;
  };
}

interface OrderDeliveryNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  companyName?: string;
  order: {
    orderNumber: string;
    orderDate?: string | Date;
    createdAt: string | Date;
    currency?: string;
    subtotalAmount?: number | string;
    discountAmount?: number | string;
    totalAmount?: number | string;
    deliveryAddress?: string | null;
    counterparty?: {
      name: string;
      phone?: string;
      inn?: string;
      address?: string;
    } | null;
    warehouse?: {
      name: string | Record<string, string>;
      address?: string;
    } | null;
    salesInvoices?: Array<{
      invoiceNumber: string;
      invoiceDate: string | Date;
      totalAmount: number | string;
    }>;
    items?: DeliveryNoteItem[];
    orderItems?: DeliveryNoteItem[];
  } | null;
}

export function OrderDeliveryNoteModal({
  isOpen,
  onClose,
  companyName,
  order,
}: OrderDeliveryNoteModalProps) {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  if (!isOpen || !order) return null;

  const items = order.items || order.orderItems || [];
  const currency = order.currency || 'UZS';

  const warehouseName =
    typeof order.warehouse?.name === 'object'
      ? order.warehouse?.name?.[locale] || order.warehouse?.name?.uz || 'Asosiy ombor'
      : order.warehouse?.name || 'Asosiy ombor';

  const orderDateFormatted = formatDate(order.orderDate || order.createdAt, locale);

  const linkedInvoice = order.salesInvoices?.[0];
  const invoiceDocNo = linkedInvoice?.invoiceNumber || `INV-${order.orderNumber}`;

  const totalAmountNum = Number(order.totalAmount || 0);
  const subtotalNum = Number(order.subtotalAmount || totalAmountNum);
  const discountNum = Number(order.discountAmount || 0);

  const totalQty = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm print:p-0 print:bg-transparent">
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl print:max-h-none print:w-full print:rounded-none print:shadow-none">
        {/* Modal Controls - Hidden during Print */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 print:hidden">
          <div className="flex items-center gap-2 text-gray-800">
            <FileText className="h-5 w-5 text-indigo-600" />
            <h3 className="text-lg font-semibold">
              {isRu ? 'Товарная накладная / Акт передачи' : 'Tovar yuk xati (Nakladnaya)'}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={handlePrint} className="gap-2">
              <Printer className="h-4 w-4" />
              {isRu ? 'Печать документа (A4)' : 'Hujjatni chop etish (A4)'}
            </Button>
            <Button variant="ghost" onClick={onClose} className="p-1 text-gray-500 hover:text-gray-700">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Printable Document Content */}
        <div className="overflow-y-auto p-8 print:p-0 print:overflow-visible text-gray-900 text-xs">
          {/* Header */}
          <div className="border-b-2 border-gray-900 pb-3 mb-4">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-lg font-black uppercase tracking-wider text-gray-900">
                  {isRu ? 'ТОВАРНО-ТРАНСПОРТНАЯ НАКЛАДНАЯ' : 'TOVAR YUK XATI (NAKLADNAYA)'}
                </h1>
                <p className="text-xs text-gray-600 mt-0.5">
                  {isRu ? 'Основание:' : 'Asos:'}{' '}
                  <span className="font-semibold text-gray-900">
                    Buyurtma № {order.orderNumber} / Faktura № {invoiceDocNo}
                  </span>
                </p>
              </div>
              <div className="text-right">
                <span className="inline-block bg-gray-900 text-white font-mono font-bold text-sm px-3 py-1 rounded">
                  № {invoiceDocNo}
                </span>
                <p className="text-xs text-gray-600 mt-1 font-medium">{orderDateFormatted}</p>
              </div>
            </div>

            {/* Counterparties info */}
            <div className="grid grid-cols-2 gap-4 mt-4 bg-gray-50 p-3 rounded border border-gray-200">
              <div>
                <p className="text-gray-500 font-bold uppercase text-[10px]">
                  {isRu ? 'Поставщик (Грузоотправитель):' : 'Yetkazib beruvchi (Yuboruvchi):'}
                </p>
                <p className="font-bold text-gray-900 text-sm mt-0.5">{companyName || 'Sklad ERP Savdo MCHJ'}</p>
                <p className="text-gray-600 text-[11px] mt-0.5">
                  {isRu ? 'Склад:' : 'Ombor:'} <span className="font-medium text-gray-800">{warehouseName}</span>
                </p>
              </div>
              <div>
                <p className="text-gray-500 font-bold uppercase text-[10px]">
                  {isRu ? 'Покупатель (Грузополучатель):' : 'Xaridor (Qabul qiluvchi):'}
                </p>
                <p className="font-bold text-gray-900 text-sm mt-0.5">{order.counterparty?.name || '-'}</p>
                <p className="text-gray-600 text-[11px] mt-0.5">
                  {isRu ? 'Тел:' : 'Tel:'}{' '}
                  <span className="font-mono text-gray-800">{order.counterparty?.phone || '-'}</span>
                  {order.deliveryAddress ? ` | Manzil: ${order.deliveryAddress}` : ''}
                </p>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="mb-4">
            <table className="w-full border-collapse border border-gray-300 text-left text-xs">
              <thead>
                <tr className="bg-gray-100 text-gray-800 font-bold uppercase">
                  <th className="border border-gray-300 p-2 w-8 text-center">№</th>
                  <th className="border border-gray-300 p-2">{isRu ? 'Наименование товара' : 'Tovar nomi'}</th>
                  <th className="border border-gray-300 p-2 w-16 text-center">{isRu ? 'Ед. изм.' : 'Birligi'}</th>
                  <th className="border border-gray-300 p-2 w-16 text-right">{isRu ? 'Кол-во' : 'Miqdor'}</th>
                  <th className="border border-gray-300 p-2 w-24 text-right">{isRu ? 'Цена' : 'Narxi'}</th>
                  <th className="border border-gray-300 p-2 w-16 text-right">{isRu ? 'Скидка' : 'Chegirma'}</th>
                  <th className="border border-gray-300 p-2 w-28 text-right font-black">{isRu ? 'Сумма' : 'Summa'}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const productName =
                    typeof item.product?.name === 'object'
                      ? item.product?.name?.[locale] || item.product?.name?.uz || 'Mahsulot'
                      : item.product?.name || 'Mahsulot';

                  const uom = item.product?.unitOfMeasure || (isRu ? 'шт' : 'dona');
                  const qty = Number(item.quantity || 0);
                  const price = Number(item.unitPrice || 0);
                  const disc = Number(item.discount || 0);
                  const lineTotal = item.totalPrice
                    ? Number(item.totalPrice)
                    : Math.max(0, qty * price - disc);

                  return (
                    <tr key={item.id || index} className="border-b border-gray-300">
                      <td className="border border-gray-300 p-1.5 text-center font-mono">{index + 1}</td>
                      <td className="border border-gray-300 p-1.5 font-medium text-gray-900">{productName}</td>
                      <td className="border border-gray-300 p-1.5 text-center text-gray-600">{uom}</td>
                      <td className="border border-gray-300 p-1.5 text-right font-semibold text-gray-900">
                        {qty.toLocaleString()}
                      </td>
                      <td className="border border-gray-300 p-1.5 text-right text-gray-700">
                        {formatCurrency(price, locale, currency)}
                      </td>
                      <td className="border border-gray-300 p-1.5 text-right text-gray-600">
                        {disc > 0 ? formatCurrency(disc, locale, currency) : '-'}
                      </td>
                      <td className="border border-gray-300 p-1.5 text-right font-bold text-gray-900">
                        {formatCurrency(lineTotal, locale, currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold border-t-2 border-gray-400">
                  <td colSpan={3} className="border border-gray-300 p-2 text-right uppercase">
                    {isRu ? 'Итого:' : 'Jami:'}
                  </td>
                  <td className="border border-gray-300 p-2 text-right font-bold">
                    {totalQty.toLocaleString()}
                  </td>
                  <td colSpan={2} className="border border-gray-300 p-2 text-right text-gray-600">
                    {discountNum > 0 && `${isRu ? 'Скидка:' : 'Chegirma:'} ${formatCurrency(discountNum, locale, currency)}`}
                  </td>
                  <td className="border border-gray-300 p-2 text-right font-black text-sm text-indigo-700">
                    {formatCurrency(totalAmountNum, locale, currency)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Legal Signatures Block */}
          <div className="mt-8 border-t-2 border-gray-400 pt-6">
            <div className="grid grid-cols-2 gap-8 text-xs">
              <div>
                <p className="font-bold text-gray-800 mb-1 uppercase text-[11px]">
                  {isRu ? 'Отпустил (Грузоотправитель):' : 'Topshirdi (Yuboruvchi):'}
                </p>
                <p className="text-gray-500 mb-6 text-[10px]">
                  {isRu ? 'Заведующий складом / Ответственное лицо' : 'Ombor mudiri / Mas‘ul xodim'}
                </p>
                <div className="border-b border-gray-400 pb-1 flex justify-between text-gray-600 mb-2">
                  <span>{isRu ? 'Подпись:' : 'Imzo:'} ____________________</span>
                  <span>{isRu ? 'М.П. (Печать)' : 'M.P. (Muhr)'}</span>
                </div>
              </div>

              <div>
                <p className="font-bold text-gray-800 mb-1 uppercase text-[11px]">
                  {isRu ? 'Принял (Грузополучатель):' : 'Qabul qildi (Xaridor):'}
                </p>
                <p className="text-gray-500 mb-6 text-[10px]">
                  {isRu ? 'Водитель-экспедитор / Представитель по доверенности' : 'Haydovchi-kuryer / Ishonchnoma bo‘yicha vakil'}
                </p>
                <div className="border-b border-gray-400 pb-1 flex justify-between text-gray-600 mb-2">
                  <span>{isRu ? 'Подпись:' : 'Imzo:'} ____________________</span>
                  <span>{isRu ? 'М.П. (Печать)' : 'M.P. (Muhr)'}</span>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-6 text-center">
              {isRu
                ? 'Товар передан в надлежащем количестве и качестве. Претензий по комплектации не имеется.'
                : 'Tovarlar to‘liq miqdorda va soz holda qabul qilindi. Mahsulot butligi bo‘yicha e‘tirozlar mavjud emas.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
