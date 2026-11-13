import type { MailMessage } from '../../common/mail/mail-transport';

/**
 * Emails of the sign-up flow (D3), in the admin's language. Plain text,
 * no tracking. Links point at the web app (FRONTEND_URL).
 */
type Language = 'uz' | 'ru';

export function confirmRegistrationEmail(
  to: string,
  language: Language,
  frontendUrl: string,
  token: string,
): MailMessage {
  const link = `${frontendUrl}/${language}/register/confirm?token=${token}`;
  return language === 'ru'
    ? {
        to,
        subject: 'Подтвердите регистрацию компании',
        text:
          'Здравствуйте!\n\n' +
          'Чтобы завершить регистрацию компании, откройте ссылку:\n' +
          `${link}\n\n` +
          'Ссылка действует 24 часа и только один раз. ' +
          'Если вы не регистрировались, просто проигнорируйте это письмо.',
      }
    : {
        to,
        subject: 'Kompaniya ro‘yxatdan o‘tishini tasdiqlang',
        text:
          'Assalomu alaykum!\n\n' +
          'Kompaniyani ro‘yxatdan o‘tkazishni yakunlash uchun havolani oching:\n' +
          `${link}\n\n` +
          'Havola 24 soat va faqat bir marta amal qiladi. ' +
          'Agar siz ro‘yxatdan o‘tmagan bo‘lsangiz, bu xatni e’tiborsiz qoldiring.',
      };
}

export function accountExistsEmail(
  to: string,
  language: Language,
  frontendUrl: string,
): MailMessage {
  const link = `${frontendUrl}/${language}/login`;
  return language === 'ru'
    ? {
        to,
        subject: 'Попытка регистрации с вашим email',
        text:
          'Здравствуйте!\n\n' +
          'Кто-то пытался зарегистрировать новую компанию с этим email, ' +
          'но аккаунт с ним уже существует. Если это были вы, войдите:\n' +
          `${link}\n\n` +
          'Если это были не вы, ничего делать не нужно.',
      }
    : {
        to,
        subject: 'Emailingiz bilan ro‘yxatdan o‘tishga urinish',
        text:
          'Assalomu alaykum!\n\n' +
          'Kimdir shu email bilan yangi kompaniyani ro‘yxatdan o‘tkazmoqchi bo‘ldi, ' +
          'lekin bu email bilan hisob allaqachon mavjud. Agar bu siz bo‘lsangiz, tizimga kiring:\n' +
          `${link}\n\n` +
          'Agar bu siz bo‘lmasangiz, hech narsa qilish shart emas.',
      };
}

export function slugTakenEmail(
  to: string,
  language: Language,
  frontendUrl: string,
  slug: string,
): MailMessage {
  const link = `${frontendUrl}/${language}/register`;
  return language === 'ru'
    ? {
        to,
        subject: 'Адрес компании занят',
        text:
          'Здравствуйте!\n\n' +
          `Адрес компании "${slug}" уже занят, поэтому регистрация не создана. ` +
          'Зарегистрируйтесь заново с другим адресом:\n' +
          `${link}`,
      }
    : {
        to,
        subject: 'Kompaniya manzili band',
        text:
          'Assalomu alaykum!\n\n' +
          `"${slug}" kompaniya manzili band, shuning uchun ro‘yxatdan o‘tish yaratilmadi. ` +
          'Boshqa manzil bilan qaytadan ro‘yxatdan o‘ting:\n' +
          `${link}`,
      };
}
