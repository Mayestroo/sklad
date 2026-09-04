'use client';

import { useLocale } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';
import { Printer, X, PackageCheck } from 'lucide-react';

interface PickListItem {
  id: string;
  quantity: number | string;
  product?: {
    name?: string | Record<string, string>;
    sku?: string;
    barcode?: string;
    unitOfMeasure?: string;
  };
}

interface OrderPickListModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: {
    orderNumber: string;
    orderDate?: string | Date;
    createdAt: string | Date;
    counterparty?: { name: string; phone?: string } | null;
    warehouse?: { name: string | Record<string, string> } | null;
    assignedSeller?: { firstName: string; lastName: string } | null;
    comment?: string | null;
    items?: PickListItem[];
    orderItems?: PickListItem[];
  } | null;
}

export function OrderPickListModal({ isOpen, onClose, order }: OrderPickListModalProps) {
  const locale = useLocale() as 'uz' | 'ru';
  const isRu = locale === 'ru';

  if (!isOpen || !order) return null;

  const items = order.items || order.orderItems || [];
  const warehouseName =
    typeof order.warehouse?.name === 'object'
      ? order.warehouse?.name?.[locale] || order.warehouse?.name?.uz || 'Asosiy ombor'
      : order.warehouse?.name || 'Asosiy ombor';

  const sellerName = order.assignedSeller
    ? `${order.assignedSeller.firstName} ${order.assignedSeller.lastName}`
    : '-';

  const orderDateFormatted = formatDate(order.orderDate || order.createdAt, locale);

  const totalQty = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm print:p-0 print:bg-transparent">
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl print:max-h-none print:w-full print:rounded-none print:shadow-none">
        {/* Modal Controls - Hidden during Print */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 print:hidden">
          <div className="flex items-center gap-2 text-gray-800">
            <PackageCheck className="h-5 w-5 text-indigo-600" />
            <h3 className="text-lg font-semibold">
              {isRu ? 'Лист сборки (Pick List)' : 'Yig‘uv varaqasi (Pick List)'}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="primary" onClick={handlePrint} className="gap-2">
              <Printer className="h-4 w-4" />
              {isRu ? 'Печать (A4)' : 'Chop etish (A4)'}
            </Button>
            <Button variant="ghost" onClick={onClose} className="p-1 text-gray-500 hover:text-gray-700">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div className="overflow-y-auto p-8 print:p-0 print:overflow-visible text-gray-900 text-sm">
          {/* Header */}
          <div className="border-b-2 border-gray-900 pb-4 mb-6">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-xl font-black uppercase tracking-wider text-gray-900">
                  {isRu ? 'ЛИСТ СБОРКИ ЗАКАЗА' : 'BUYURTMA YIG‘UV VARAQASI'}
                </h1>
                <p className="text-xs text-gray-500 font-mono mt-1">
                  ERP Sklad Fulfillment Management
                </p>
              </div>
              <div className="text-right">
                <span className="inline-block bg-gray-900 text-white font-mono font-bold text-base px-3 py-1 rounded">
                  № {order.orderNumber}
                </span>
                <p className="text-xs text-gray-600 mt-1 font-medium">{orderDateFormatted}</p>
              </div>
            </div>

            {/* Info Grid */}
            <div className="grid grid-cols-2 gap-4 mt-4 bg-gray-50 p-3 rounded-lg border border-gray-200 text-xs">
              <div>
                <p className="text-gray-500">{isRu ? 'Склад отгрузки:' : 'Chiqaruvchi ombor:'}</p>
                <p className="font-bold text-gray-900">{warehouseName}</p>
              </div>
              <div>
                <p className="text-gray-500">{isRu ? 'Клиент (Получатель):' : 'Mijoz (Qabul qiluvchi):'}</p>
                <p className="font-bold text-gray-900">{order.counterparty?.name || '-'}</p>
              </div>
              <div>
                <p className="text-gray-500">{isRu ? 'Ответственный менеджер:' : 'Mas‘ul sotuvchi:'}</p>
                <p className="font-semibold text-gray-800">{sellerName}</p>
              </div>
              <div>
                <p className="text-gray-500">{isRu ? 'Примечание к заказу:' : 'Buyurtma izohi:'}</p>
                <p className="font-medium text-gray-700 italic">{order.comment || (isRu ? 'Нет' : 'Mavjud emas')}</p>
              </div>
            </div>
          </div>

          {/* Items Table */}
          <div className="mb-6">
            <table className="w-full border-collapse border border-gray-300 text-left text-xs">
              <thead>
                <tr className="bg-gray-100 text-gray-800 font-bold uppercase tracking-wider">
                  <th className="border border-gray-300 p-2 w-10 text-center">№</th>
                  <th className="border border-gray-300 p-2">{isRu ? 'Наименование товара' : 'Tovar nomi'}</th>
                  <th className="border border-gray-300 p-2 w-28">{isRu ? 'Артикул / Штрихкод' : 'Artikul / Shtrixkod'}</th>
                  <th className="border border-gray-300 p-2 w-16 text-center">{isRu ? 'Ед. изм.' : 'Birligi'}</th>
                  <th className="border border-gray-300 p-2 w-24 text-right font-black">{isRu ? 'К сборке' : 'Miqdori'}</th>
                  <th className="border border-gray-300 p-2 w-24 text-center">{isRu ? 'Собрано [✔]' : 'Yig‘ildi [✔]'}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => {
                  const productName =
                    typeof item.product?.name === 'object'
                      ? item.product?.name?.[locale] || item.product?.name?.uz || 'Noma‘lum tovar'
                      : item.product?.name || 'Noma‘lum tovar';

                  const sku = item.product?.sku || item.product?.barcode || '-';
                  const uom = item.product?.unitOfMeasure || (isRu ? 'шт' : 'dona');

                  return (
                    <tr key={item.id || index} className="border-b border-gray-300 hover:bg-gray-50">
                      <td className="border border-gray-300 p-2 text-center font-mono">{index + 1}</td>
                      <td className="border border-gray-300 p-2 font-medium text-gray-900">{productName}</td>
                      <td className="border border-gray-300 p-2 font-mono text-gray-600">{sku}</td>
                      <td className="border border-gray-300 p-2 text-center text-gray-600">{uom}</td>
                      <td className="border border-gray-300 p-2 text-right font-bold text-gray-900 text-sm">
                        {Number(item.quantity).toLocaleString()}
                      </td>
                      <td className="border border-gray-300 p-2 text-center">
                        <div className="mx-auto h-4 w-4 border border-gray-400 rounded-sm"></div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-bold">
                  <td colSpan={4} className="border border-gray-300 p-2 text-right uppercase">
                    {isRu ? 'Итого количество:' : 'Jami tovarlar miqdori:'}
                  </td>
                  <td className="border border-gray-300 p-2 text-right font-black text-sm">
                    {totalQty.toLocaleString()}
                  </td>
                  <td className="border border-gray-300 p-2"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Signatures & Notes */}
          <div className="mt-8 border-t border-gray-300 pt-6">
            <div className="grid grid-cols-2 gap-8 text-xs">
              <div>
                <p className="font-semibold text-gray-700 mb-6">
                  {isRu ? 'Сборщик (Кладовщик):' : 'Yig‘uvchi (Ombor xodimi):'}
                </p>
                <div className="border-b border-gray-400 pb-1 flex justify-between text-gray-500">
                  <span>{isRu ? 'Ф.И.О. / Подпись:' : 'F.I.Sh. / Imzo:'}</span>
                  <span>______________________</span>
                </div>
              </div>
              <div>
                <p className="font-semibold text-gray-700 mb-6">
                  {isRu ? 'Проверил / Выдал:' : 'Tekshirdi / Topshirdi:'}
                </p>
                <div className="border-b border-gray-400 pb-1 flex justify-between text-gray-500">
                  <span>{isRu ? 'Ф.И.О. / Подпись:' : 'F.I.Sh. / Imzo:'}</span>
                  <span>______________________</span>
                </div>
              </div>
            </div>
            <p className="text-[10px] text-gray-400 mt-6 text-center">
              {isRu
                ? 'Внутренний документ склада. Коммерческие цены скрыты. Подлежит архивации после сборки.'
                : 'Ombor ichki hujjati. Tijorat narxlari yashirilgan. Yig‘uv tugagach arxivlanadi.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
