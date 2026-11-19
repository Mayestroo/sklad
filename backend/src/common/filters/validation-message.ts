/**
 * class-validator writes messages in English with the property path, e.g.
 *   "lines.0.amount must not be less than 0"
 * and the page showed them verbatim (muammolar.pdf, opening balances). This
 * turns each one into the user's language with a readable field name and the
 * row number ("1-qator: Summa 0 dan kichik bo'lmasligi kerak"), and keeps one
 * message per field (a field failing @IsNumber and @Min was listed twice).
 * A message that is not a class-validator default (already localized by the
 * DTO) is returned unchanged.
 */

type Locale = 'uz' | 'ru';
type Text = Record<Locale, string>;

const FIELD_LABELS: Record<string, Text> = {
  amount: { uz: 'Summa', ru: 'Сумма' },
  quantity: { uz: 'Miqdor', ru: 'Количество' },
  unitPrice: { uz: 'Narx', ru: 'Цена' },
  price: { uz: 'Narx', ru: 'Цена' },
  unitCost: { uz: 'Tannarx', ru: 'Себестоимость' },
  costPrice: { uz: 'Tannarx', ru: 'Себестоимость' },
  salePrice: { uz: 'Sotuv narxi', ru: 'Цена продажи' },
  exchangeRate: { uz: 'Valyuta kursi', ru: 'Курс валюты' },
  costPriceExchangeRate: { uz: 'Tannarx kursi', ru: 'Курс себестоимости' },
  currency: { uz: 'Valyuta', ru: 'Валюта' },
  costPriceCurrency: { uz: 'Tannarx valyutasi', ru: 'Валюта себестоимости' },
  salePriceCurrency: { uz: 'Sotuv narxi valyutasi', ru: 'Валюта цены продажи' },
  counterpartyId: { uz: 'Kontragent', ru: 'Контрагент' },
  supplierId: { uz: 'Yetkazib beruvchi', ru: 'Поставщик' },
  warehouseId: { uz: 'Ombor', ru: 'Склад' },
  sourceWarehouseId: { uz: 'Chiqim ombori', ru: 'Склад-отправитель' },
  targetWarehouseId: { uz: 'Kirim ombori', ru: 'Склад-получатель' },
  productId: { uz: 'Tovar', ru: 'Товар' },
  cashAccountId: { uz: 'Kassa', ru: 'Касса' },
  accountId: { uz: 'Hisob', ru: 'Счёт' },
  fromAccountId: { uz: 'Chiqim kassasi', ru: 'Касса списания' },
  toAccountId: { uz: 'Kirim kassasi', ru: 'Касса зачисления' },
  discount: { uz: 'Chegirma', ru: 'Скидка' },
  discountPercent: { uz: 'Chegirma', ru: 'Скидка' },
  vatRate: { uz: 'QQS stavkasi', ru: 'Ставка НДС' },
  accumulatedDepreciation: { uz: 'Eskirish', ru: 'Амортизация' },
  netAmount: { uz: 'Qoldiq qiymat', ru: 'Остаточная стоимость' },
  initialCost: { uz: 'Boshlang‘ich qiymat', ru: 'Первоначальная стоимость' },
  usefulLifeMonths: { uz: 'Foydalanish muddati', ru: 'Срок службы' },
  name: { uz: 'Nomi', ru: 'Название' },
  email: { uz: 'Email', ru: 'Email' },
  password: { uz: 'Parol', ru: 'Пароль' },
  phone: { uz: 'Telefon', ru: 'Телефон' },
  firstName: { uz: 'Ism', ru: 'Имя' },
  lastName: { uz: 'Familiya', ru: 'Фамилия' },
  inn: { uz: 'STIR', ru: 'ИНН' },
  sku: { uz: 'SKU', ru: 'SKU' },
  docDate: { uz: 'Hujjat sanasi', ru: 'Дата документа' },
  invoiceDate: { uz: 'Hujjat sanasi', ru: 'Дата документа' },
  transactionDate: { uz: 'Sana', ru: 'Дата' },
  paymentDate: { uz: 'To‘lov sanasi', ru: 'Дата оплаты' },
  openingDate: { uz: 'Qoldiq sanasi', ru: 'Дата остатков' },
  method: { uz: 'To‘lov usuli', ru: 'Способ оплаты' },
  type: { uz: 'Turi', ru: 'Тип' },
  status: { uz: 'Holat', ru: 'Статус' },
  category: { uz: 'Toifa', ru: 'Категория' },
  categoryId: { uz: 'Toifa', ru: 'Категория' },
  unitOfMeasure: { uz: 'O‘lchov birligi', ru: 'Единица измерения' },
  outputQuantity: { uz: 'Ishlab chiqarish normasi', ru: 'Норма выпуска' },
  plannedQuantity: { uz: 'Rejalashtirilgan miqdor', ru: 'Плановое количество' },
  actualQuantity: { uz: 'Haqiqiy sarf', ru: 'Фактический расход' },
  producedQuantity: {
    uz: 'Ishlab chiqarilgan miqdor',
    ru: 'Произведённое количество',
  },
  items: { uz: 'Qatorlar', ru: 'Строки' },
  lines: { uz: 'Qatorlar', ru: 'Строки' },
  materials: { uz: 'Xomashyolar', ru: 'Сырьё' },
  inventoryNumber: { uz: 'Inventar raqami', ru: 'Инвентарный номер' },
  contractNumber: { uz: 'Shartnoma raqami', ru: 'Номер договора' },
  batchNumber: { uz: 'Partiya raqami', ru: 'Номер партии' },
  comment: { uz: 'Izoh', ru: 'Комментарий' },
  note: { uz: 'Izoh', ru: 'Комментарий' },
  notes: { uz: 'Izoh', ru: 'Комментарий' },
  reason: { uz: 'Sabab', ru: 'Причина' },
};

type Rule = { pattern: RegExp; text: (m: RegExpMatchArray) => Text };

// Default class-validator messages, after the "<property> " prefix.
const RULES: Rule[] = [
  {
    pattern: /^must not be less than (-?[\d.]+)$/,
    text: (m) => ({
      uz: `${m[1]} dan kichik bo‘lmasligi kerak`,
      ru: `должно быть не меньше ${m[1]}`,
    }),
  },
  {
    pattern: /^must not be greater than (-?[\d.]+)$/,
    text: (m) => ({
      uz: `${m[1]} dan katta bo‘lmasligi kerak`,
      ru: `должно быть не больше ${m[1]}`,
    }),
  },
  {
    pattern: /^must be a positive number$/,
    text: () => ({
      uz: '0 dan katta bo‘lishi kerak',
      ru: 'должно быть больше 0',
    }),
  },
  {
    pattern: /^must be a number conforming to the specified constraints$/,
    text: () => ({ uz: 'son bo‘lishi kerak', ru: 'должно быть числом' }),
  },
  {
    pattern: /^must be an integer number$/,
    text: () => ({
      uz: 'butun son bo‘lishi kerak',
      ru: 'должно быть целым числом',
    }),
  },
  {
    pattern:
      /^(should not be empty|should not be null or undefined|is required)$/,
    text: () => ({
      uz: 'to‘ldirilishi shart',
      ru: 'обязательно для заполнения',
    }),
  },
  {
    pattern: /^must be a string$/,
    text: () => ({ uz: 'matn bo‘lishi kerak', ru: 'должно быть текстом' }),
  },
  {
    pattern: /^must be a UUID$/,
    text: () => ({
      uz: 'tanlanmagan yoki noto‘g‘ri',
      ru: 'не выбрано или неверно',
    }),
  },
  {
    pattern: /^must be a valid ISO 8601 date string$/,
    text: () => ({
      uz: 'to‘g‘ri sana bo‘lishi kerak',
      ru: 'должно быть корректной датой',
    }),
  },
  {
    pattern: /^must be a boolean value$/,
    text: () => ({
      uz: 'ha/yo‘q qiymati bo‘lishi kerak',
      ru: 'должно быть да/нет',
    }),
  },
  {
    pattern: /^must be an email$/,
    text: () => ({
      uz: 'to‘g‘ri email bo‘lishi kerak',
      ru: 'должен быть корректным email',
    }),
  },
  {
    pattern: /^must be an array$/,
    text: () => ({ uz: 'ro‘yxat bo‘lishi kerak', ru: 'должно быть списком' }),
  },
  {
    pattern: /^should not be empty array|^must contain at least \d+ elements?$/,
    text: () => ({
      uz: 'kamida bitta qator bo‘lishi kerak',
      ru: 'нужна хотя бы одна строка',
    }),
  },
  {
    pattern: /^must be an object$/,
    text: () => ({ uz: 'noto‘g‘ri formatda', ru: 'неверный формат' }),
  },
  {
    pattern: /^must be (?:one of the following values|one of): (.+)$/,
    text: (m) => ({
      uz: `quyidagilardan biri bo‘lishi kerak: ${m[1]}`,
      ru: `должно быть одним из: ${m[1]}`,
    }),
  },
  {
    pattern: /^must be longer than or equal to (\d+) characters$/,
    text: (m) => ({
      uz: `kamida ${m[1]} belgidan iborat bo‘lishi kerak`,
      ru: `должно содержать не менее ${m[1]} символов`,
    }),
  },
  {
    pattern: /^must be shorter than or equal to (\d+) characters$/,
    text: (m) => ({
      uz: `${m[1]} belgidan oshmasligi kerak`,
      ru: `не должно превышать ${m[1]} символов`,
    }),
  },
  {
    pattern: /^must match .+ regular expression$/,
    text: () => ({ uz: 'formati noto‘g‘ri', ru: 'неверный формат' }),
  },
];

const PATH = /^((?:[A-Za-z_]\w*|\d+)(?:\.(?:[A-Za-z_]\w*|\d+))*) (.+)$/;

/** "lines.2.amount" → { field: 'amount', row: 3 } (the last array index). */
function splitPath(path: string): { field: string; row: number | null } {
  const parts = path.split('.');
  const field = parts[parts.length - 1];
  let row: number | null = null;
  for (const part of parts) if (/^\d+$/.test(part)) row = Number(part) + 1;
  return { field, row };
}

function label(field: string, locale: Locale): string {
  return FIELD_LABELS[field]?.[locale] ?? field;
}

export interface TranslatedValidation {
  /** Key used to keep one message per field. */
  key: string;
  text: string;
}

export function translateValidationMessage(
  message: string,
  locale: Locale,
): TranslatedValidation {
  const parsed = PATH.exec(message);
  if (!parsed) return { key: message, text: message };
  const [, path, rest] = parsed;
  const rule = RULES.find((r) => r.pattern.test(rest));
  if (!rule) return { key: message, text: message };
  const { field, row } = splitPath(path);
  const body = `${label(field, locale)} ${rule.text(rest.match(rule.pattern) as RegExpMatchArray)[locale]}`;
  const prefix =
    row === null ? '' : locale === 'ru' ? `Строка ${row}: ` : `${row}-qator: `;
  return { key: path, text: prefix + body };
}

/** Translates and keeps the first message for each field path. */
export function translateValidationMessages(
  messages: string[],
  locale: string,
): string[] {
  const lang: Locale = locale === 'ru' ? 'ru' : 'uz';
  const seen = new Set<string>();
  const out: string[] = [];
  for (const message of messages) {
    const { key, text } = translateValidationMessage(message, lang);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}
