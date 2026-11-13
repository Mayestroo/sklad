/**
 * Counterparty create/edit request body. On PATCH the API treats `undefined` as
 * "leave unchanged" and `null` as "clear", so an emptied optional field must be
 * sent as null or the old value silently survives.
 */
export interface CounterpartyFormValues {
  name: string;
  type: 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
  folderId: string;
  discountPercent: string | number;
  inn: string;
  phone: string;
  email: string;
  address: string;
  bankName: string;
  bankAccount: string;
  mfo: string;
}

const textOrNull = (value: string): string | null => value.trim() || null;

export function buildCounterpartyPayload(form: CounterpartyFormValues) {
  return {
    name: form.name.trim(),
    type: form.type,
    folderId: form.folderId || null,
    discountPercent: Number(form.discountPercent) || 0,
    inn: textOrNull(form.inn),
    phone: textOrNull(form.phone),
    email: textOrNull(form.email),
    address: textOrNull(form.address),
    bankName: textOrNull(form.bankName),
    bankAccount: textOrNull(form.bankAccount),
    mfo: textOrNull(form.mfo),
  };
}
