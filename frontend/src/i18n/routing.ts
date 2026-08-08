import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  locales: ['uz', 'ru'],
  defaultLocale: 'uz',
  localePrefix: 'never',
});
