import { translateValidationMessages } from './validation-message';

describe('translateValidationMessages', () => {
  it('turns the muammolar.pdf opening-balance error into one readable line per field', () => {
    const raw = [
      'lines.0.amount must not be less than 0',
      'lines.0.amount must be a number conforming to the specified constraints',
      'lines.0.accumulatedDepreciation must not be less than 0',
      'lines.0.accumulatedDepreciation must be a number conforming to the specified constraints',
      'lines.0.netAmount must be a number conforming to the specified constraints',
    ];
    expect(translateValidationMessages(raw, 'uz')).toEqual([
      '1-qator: Summa 0 dan kichik bo‘lmasligi kerak',
      '1-qator: Eskirish 0 dan kichik bo‘lmasligi kerak',
      '1-qator: Qoldiq qiymat son bo‘lishi kerak',
    ]);
    expect(translateValidationMessages(raw, 'ru')[0]).toBe(
      'Строка 1: Сумма должно быть не меньше 0',
    );
  });

  it('top-level fields have no row; unknown fields keep their name', () => {
    expect(
      translateValidationMessages(
        [
          'counterpartyId should not be empty',
          'exchangeRate must be a positive number',
          'fooBar must be a string',
        ],
        'uz',
      ),
    ).toEqual([
      'Kontragent to‘ldirilishi shart',
      'Valyuta kursi 0 dan katta bo‘lishi kerak',
      'fooBar matn bo‘lishi kerak',
    ]);
  });

  it('uses the innermost array index as the row', () => {
    expect(
      translateValidationMessages(
        ['items.4.quantity must not be less than 0.001'],
        'uz',
      ),
    ).toEqual(['5-qator: Miqdor 0.001 dan kichik bo‘lmasligi kerak']);
  });

  it('leaves messages that are already written for users unchanged', () => {
    const custom = 'Har bir qoldiq qatori uchun valyutani tanlang';
    expect(translateValidationMessages([custom], 'uz')).toEqual([custom]);
    expect(
      translateValidationMessages(
        ['method must be one of the following values: CASH, CARD'],
        'ru',
      ),
    ).toEqual(['Способ оплаты должно быть одним из: CASH, CARD']);
  });
});
