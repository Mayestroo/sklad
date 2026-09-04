'use client';

import React from 'react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Printer, X } from 'lucide-react';

interface ServiceActPrintViewProps {
  act: any;
  companyName?: string;
  onClose: () => void;
  locale?: string;
}

export function ServiceActPrintView({
  act,
  companyName = 'KORXONA',
  onClose,
  locale = 'uz',
}: ServiceActPrintViewProps) {
  const isRu = locale === 'ru';

  const handlePrint = () => {
    window.print();
  };

  const isProvided = act.type === 'PROVIDED';
  const executor = isProvided ? companyName : act.counterparty?.name;
  const customer = isProvided ? act.counterparty?.name : companyName;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="bg-white text-black w-full max-w-4xl rounded-lg shadow-2xl p-8 max-h-[90vh] overflow-y-auto print:max-w-none print:max-h-none print:shadow-none print:p-0">
        {/* Screen Toolbar */}
        <div className="flex items-center justify-between pb-6 mb-6 border-b border-gray-200 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-lg text-gray-800">
              {isRu ? 'Печать акта' : 'Dalolatnomani chop etish'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={handlePrint} className="flex items-center gap-2">
              <Printer className="w-4 h-4" />
              {isRu ? 'Печать' : 'Chop etish'}
            </Button>
            <Button variant="secondary" onClick={onClose} className="flex items-center gap-2">
              <X className="w-4 h-4" />
              {isRu ? 'Yopish' : 'Yopish'}
            </Button>
          </div>
        </div>

        {/* Printable Document Body */}
        <div className="space-y-6 text-sm text-gray-900 print:text-black">
          {/* Header */}
          <div className="text-center space-y-1">
            <h1 className="text-xl font-bold uppercase tracking-wide">
              {isRu
                ? `АКТ ВЫПОЛНЕННЫХ РАБОТ (ОКАЗАННЫХ УСЛУГ) № ${act.actNumber}`
                : `BAJARILGAN ISHLAR (KO'RSATILGAN XIZMATLAR) DALOLATNOMASI № ${act.actNumber}`}
            </h1>
            <p className="text-gray-600 font-medium">
              {isRu ? 'от' : 'Sanasi:'} {formatDate(act.actDate, locale)}
            </p>
          </div>

          {/* Parties */}
          <div className="grid grid-cols-2 gap-6 p-4 rounded bg-gray-50 border border-gray-200 text-xs leading-relaxed">
            <div>
              <p className="font-bold text-gray-700 uppercase">
                {isRu ? 'Исполнитель (Xizmat ko\'rsatuvchi):' : 'Ijrochi (Xizmat ko\'rsatuvchi):'}
              </p>
              <p className="font-semibold text-sm mt-1">{executor}</p>
              {isProvided && (
                <p className="text-gray-500 mt-0.5">Asosiy korxona hisobidan</p>
              )}
              {!isProvided && act.counterparty && (
                <>
                  {act.counterparty.inn && <p>STIR (INN): {act.counterparty.inn}</p>}
                  {act.counterparty.phone && <p>Tel: {act.counterparty.phone}</p>}
                </>
              )}
            </div>
            <div>
              <p className="font-bold text-gray-700 uppercase">
                {isRu ? 'Заказчик (Buyurtmachi):' : 'Buyurtmachi:'}
              </p>
              <p className="font-semibold text-sm mt-1">{customer}</p>
              {isProvided && act.counterparty && (
                <>
                  {act.counterparty.inn && <p>STIR (INN): {act.counterparty.inn}</p>}
                  {act.counterparty.phone && <p>Tel: {act.counterparty.phone}</p>}
                </>
              )}
              {!isProvided && (
                <p className="text-gray-500 mt-0.5">Asosiy korxona hisobidan</p>
              )}
            </div>
          </div>

          {act.externalNumber && (
            <p className="text-xs text-gray-500 italic">
              {isRu ? 'Внешний номер / основание:' : 'Tashqi hujjat / asos:'} {act.externalNumber}
              {act.externalDate ? ` (${formatDate(act.externalDate, locale)})` : ''}
            </p>
          )}

          {/* Table */}
          <table className="w-full border-collapse border border-gray-300 text-xs">
            <thead>
              <tr className="bg-gray-100 text-left">
                <th className="border border-gray-300 p-2 w-8 text-center">№</th>
                <th className="border border-gray-300 p-2">
                  {isRu ? 'Наименование услуги / работы' : 'Xizmat / ish nomi'}
                </th>
                <th className="border border-gray-300 p-2 w-20 text-center">
                  {isRu ? 'Ед. изм.' : 'O\'lchov birligi'}
                </th>
                <th className="border border-gray-300 p-2 w-16 text-right">
                  {isRu ? 'Кол-во' : 'Miqdori'}
                </th>
                <th className="border border-gray-300 p-2 w-24 text-right">
                  {isRu ? 'Цена' : 'Narxi'}
                </th>
                <th className="border border-gray-300 p-2 w-20 text-right">
                  {isRu ? 'НДС' : 'QQS'}
                </th>
                <th className="border border-gray-300 p-2 w-28 text-right">
                  {isRu ? 'Сумма с НДС' : 'Jami summa'}
                </th>
              </tr>
            </thead>
            <tbody>
              {act.items?.map((item: any, idx: number) => (
                <tr key={item.id || idx}>
                  <td className="border border-gray-300 p-2 text-center">{idx + 1}</td>
                  <td className="border border-gray-300 p-2">
                    <span className="font-medium">{item.serviceName}</span>
                    {item.description && (
                      <p className="text-gray-500 text-[11px] mt-0.5">{item.description}</p>
                    )}
                  </td>
                  <td className="border border-gray-300 p-2 text-center">{item.unit || 'dona'}</td>
                  <td className="border border-gray-300 p-2 text-right">{Number(item.quantity)}</td>
                  <td className="border border-gray-300 p-2 text-right">
                    {formatCurrency(Number(item.unitPrice), locale, act.currency)}
                  </td>
                  <td className="border border-gray-300 p-2 text-right">
                    {Number(item.vatRate)}% ({formatCurrency(Number(item.vatAmount), locale, act.currency)})
                  </td>
                  <td className="border border-gray-300 p-2 text-right font-medium">
                    {formatCurrency(Number(item.lineTotal), locale, act.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} className="border border-gray-300 p-2 text-right font-medium">
                  {isRu ? 'Итого без НДС:' : 'QQSsiz jami:'}
                </td>
                <td colSpan={2} className="border border-gray-300 p-2 text-right font-semibold">
                  {formatCurrency(Number(act.subtotal), locale, act.currency)}
                </td>
              </tr>
              <tr>
                <td colSpan={5} className="border border-gray-300 p-2 text-right font-medium">
                  {isRu ? 'В том числе НДС:' : 'Shu jumladan QQS:'}
                </td>
                <td colSpan={2} className="border border-gray-300 p-2 text-right font-semibold">
                  {formatCurrency(Number(act.vatAmount), locale, act.currency)}
                </td>
              </tr>
              <tr className="bg-gray-50">
                <td colSpan={5} className="border border-gray-300 p-2 text-right font-bold text-sm">
                  {isRu ? 'ВСЕГО К ОПЛАТЕ:' : 'JAMI TO\'LANISHI KERAK:'}
                </td>
                <td colSpan={2} className="border border-gray-300 p-2 text-right font-bold text-sm text-blue-700">
                  {formatCurrency(Number(act.totalAmount), locale, act.currency)}
                </td>
              </tr>
            </tfoot>
          </table>

          {/* Statement of Acceptance */}
          <div className="pt-2 text-xs text-gray-700 leading-relaxed border-t border-gray-200">
            <p>
              {isRu
                ? 'Вышеуказанные работы (услуги) выполнены полностью и в срок. Заказчик претензий по объему, качеству и срокам оказания услуг не имеет.'
                : 'Yuqorida ko\'rsatilgan ishlar (xizmatlar) to\'liq va belgilangan muddatda bajarildi. Buyurtmachi tomonidan xizmatlar sifati, hajmi va muddatlari bo\'yicha hech qanday e\'tirozlar mavjud emas.'}
            </p>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-12 pt-8">
            <div className="space-y-4">
              <p className="font-bold text-xs uppercase">{isRu ? 'Исполнитель:' : 'Ijrochi:'}</p>
              <div className="border-b border-black w-3/4 h-8"></div>
              <p className="text-[11px] text-gray-500">M.O‘. / М.П. (Imzo / Подпись)</p>
            </div>
            <div className="space-y-4">
              <p className="font-bold text-xs uppercase">{isRu ? 'Заказчик:' : 'Buyurtmachi:'}</p>
              <div className="border-b border-black w-3/4 h-8"></div>
              <p className="text-[11px] text-gray-500">M.O‘. / М.П. (Imzo / Подпись)</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
