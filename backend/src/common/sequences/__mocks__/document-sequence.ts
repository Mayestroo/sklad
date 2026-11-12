/**
 * Jest manual mock for unit tests that run services against a mocked Prisma
 * client (no `$queryRaw`). Opt in with
 *   jest.mock('<relative path>/common/sequences/document-sequence');
 * Numbers use the real formatting and restart at 1 for every test. Atomicity is
 * covered by document-numbering.int-spec.ts against a real database.
 */
const actual = jest.requireActual<typeof import('../document-sequence')>(
  '../document-sequence',
);

const counters = new Map<string, number>();
beforeEach(() => counters.clear());

export const seriesPrefix = actual.seriesPrefix;
export const formatDocumentNumber = actual.formatDocumentNumber;
export type DocumentSeries = import('../document-sequence').DocumentSeries;

export const nextDocumentNumber = jest.fn(
  (
    _db: unknown,
    tenantId: string,
    series: DocumentSeries,
    date: Date = new Date(),
  ) => {
    const key = `${tenantId}:${actual.seriesPrefix(series, date)}`;
    const value = (counters.get(key) ?? 0) + 1;
    counters.set(key, value);
    return Promise.resolve(actual.formatDocumentNumber(series, value, date));
  },
);
