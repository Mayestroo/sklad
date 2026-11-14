import { useAuth } from '@/context/AuthContext';

/**
 * DISPLAY ONLY. Returns the company's default currency from tenant settings,
 * falling back to 'USD' when nothing is set. It labels zero amounts and
 * read-only views; never use it to start a form, price, payment or any
 * stored amount (F8, ADR 0022): those start blank and require a choice
 * (sales forms: useSalesDefaultCurrency). currency-guess-scan.spec.ts fails
 * on a new caller.
 */
export function useDefaultCurrency(): string {
  const { company } = useAuth();
  return (
    company?.settings?.sales?.defaultCurrency ||
    (company?.settings?.accounting as { defaultCurrency?: string } | undefined)?.defaultCurrency ||
    (company?.settings as { currency?: string } | null | undefined)?.currency ||
    'USD'
  );
}

