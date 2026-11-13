import { useAuth } from '@/context/AuthContext';
import { salesDefaultCurrency, type SalesCurrency } from '@/lib/sales-currency';

/**
 * The tenant's sales default currency, or null when it is not set. Unlike
 * `useDefaultCurrency` it never falls back to a guessed currency, so sales
 * forms and product prices leave the currency blank instead (ADR 0022).
 */
export function useSalesDefaultCurrency(): SalesCurrency | null {
  const { company } = useAuth();
  return salesDefaultCurrency(company?.settings);
}
