import { useAuth } from '@/context/AuthContext';

/**
 * Returns the company's default currency from tenant settings.
 * Falls back to 'USD' when settings are not yet loaded or unset.
 *
 * Usage:
 *   const defaultCurrency = useDefaultCurrency();
 *   const [currency, setCurrency] = useState(initialData?.currency || defaultCurrency);
 */
export function useDefaultCurrency(): string {
  const { company } = useAuth();
  return company?.settings?.sales?.defaultCurrency || 'USD';
}
