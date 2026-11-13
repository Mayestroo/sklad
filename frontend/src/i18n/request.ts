import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';
import uzMessages from '../../messages/uz.json';
import ruMessages from '../../messages/ru.json';

const messagesMap: Record<string, typeof uzMessages> = {
  uz: uzMessages,
  ru: ruMessages,
};

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as (typeof routing.locales)[number])) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: messagesMap[locale] || uzMessages,
  };
});
