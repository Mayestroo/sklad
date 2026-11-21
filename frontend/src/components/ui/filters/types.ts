export interface FilterOption {
  value: string;
  label: string;
  /** Count already known to the page (never fetched for the filter). */
  count?: number;
}

interface Base {
  /** Key in the filter values and in the URL. */
  key: string;
  label: string;
}

/**
 * One filter of a list page. "Hammasi" (value '') is added automatically as the
 * first option unless `noAll` (a filter that always has a value, e.g. a tab).
 */
export type FilterDef =
  | (Base & { kind: 'segmented'; options: FilterOption[]; noAll?: boolean })
  | (Base & { kind: 'select'; options: FilterOption[]; searchable?: boolean; noAll?: boolean; allLabel?: string })
  | (Base & { kind: 'period' })
  | (Base & { kind: 'toggle' });
