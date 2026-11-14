import {
  businessRangeEnd,
  businessRangeStart,
  startOfBusinessDay,
  startOfBusinessMonth,
} from './business-day';

describe('business-day (Asia/Tashkent, UTC+5)', () => {
  it('starts "today" at Tashkent midnight, not the server midnight', () => {
    // 02:00 in Tashkent on Nov 15 is still Nov 14 in UTC.
    const now = new Date('2026-11-14T21:00:00Z');
    expect(startOfBusinessDay(now).toISOString()).toBe(
      '2026-11-14T19:00:00.000Z',
    );
  });

  it('keeps the day when it is evening in Tashkent', () => {
    const now = new Date('2026-11-14T17:30:00Z'); // 22:30 Tashkent
    expect(startOfBusinessDay(now).toISOString()).toBe(
      '2026-11-13T19:00:00.000Z',
    );
  });

  it('rolls the month over at Tashkent midnight', () => {
    const now = new Date('2026-11-30T20:00:00Z'); // Dec 1, 01:00 Tashkent
    expect(startOfBusinessMonth(now).toISOString()).toBe(
      '2026-11-30T19:00:00.000Z',
    );
  });

  it('bounds a bare date filter by the whole Tashkent day', () => {
    expect(businessRangeStart('2026-11-14').toISOString()).toBe(
      '2026-11-13T19:00:00.000Z',
    );
    expect(businessRangeEnd('2026-11-14').toISOString()).toBe(
      '2026-11-14T18:59:59.999Z',
    );
    // A document dated "2026-11-14" is stored at UTC midnight: inside the range.
    const stored = new Date('2026-11-14');
    expect(stored >= businessRangeStart('2026-11-14')).toBe(true);
    expect(stored <= businessRangeEnd('2026-11-14')).toBe(true);
  });

  it('leaves a full timestamp filter as given', () => {
    expect(businessRangeEnd('2026-11-14T10:00:00Z').toISOString()).toBe(
      '2026-11-14T10:00:00.000Z',
    );
  });
});
