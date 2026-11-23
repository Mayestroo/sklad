export interface CashFlowBucket {
  period: string;
  income: number;
  expense: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * The dashboard API returns only the days (or months) that had money movement.
 * For the chart, every day/month of the chosen period gets a bucket, so the
 * timeline is continuous and a quiet day reads as zero, not as missing.
 * Weekly buckets are returned as they are (their keys depend on the server's week start).
 * `from`/`to` are ISO dates (YYYY-MM-DD). Long ranges are not expanded beyond `maxBuckets`.
 */
export function fillCashFlowSeries(
  series: CashFlowBucket[],
  granularity: 'day' | 'week' | 'month',
  from: string,
  to: string,
  maxBuckets = 120,
): CashFlowBucket[] {
  if (granularity === 'week' || !from || !to || from > to) return series;
  const byKey = new Map(series.map((s) => [s.period, s]));
  const keys: string[] = [];
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  if (granularity === 'day') {
    const d = new Date(Date.UTC(fy, fm - 1, fd));
    const end = Date.UTC(ty, tm - 1, td);
    while (d.getTime() <= end && keys.length <= maxBuckets) {
      keys.push(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`);
      d.setUTCDate(d.getUTCDate() + 1);
    }
  } else {
    let y = fy;
    let m = fm;
    while ((y < ty || (y === ty && m <= tm)) && keys.length <= maxBuckets) {
      keys.push(`${y}-${pad(m)}`);
      m += 1;
      if (m > 12) {
        m = 1;
        y += 1;
      }
    }
  }
  if (keys.length > maxBuckets) return series;
  const filled = keys.map((k) => byKey.get(k) ?? { period: k, income: 0, expense: 0 });
  // Movement outside the computed range (time zones at the edges) is kept, not dropped.
  const inRange = new Set(keys);
  const extra = series.filter((s) => !inRange.has(s.period));
  return extra.length ? [...filled, ...extra].sort((a, b) => a.period.localeCompare(b.period)) : filled;
}
