import { translatableText } from './translatable-text';

describe('translatableText', () => {
  it('prefers Uzbek, falls back to Russian', () => {
    expect(translatableText({ uz: 'Sement', ru: 'Цемент' })).toBe('Sement');
    expect(translatableText({ uz: '', ru: 'Цемент' })).toBe('Цемент');
    expect(translatableText({ ru: 'Цемент' })).toBe('Цемент');
  });

  it('returns a plain string unchanged and never "[object Object]"', () => {
    expect(translatableText('Sement')).toBe('Sement');
    expect(translatableText({})).toBe('');
    expect(translatableText(null)).toBe('');
  });
});
