/**
 * One description of an accounting report, two outputs: a real Excel file
 * (.xlsx with widths, number formats, bold totals, a frozen header) and a
 * print document that holds only the report (no sidebar, tabs or filters).
 */

export interface ReportColumn {
  label: string;
  /** Right-aligned money column (2 decimals). */
  numeric?: boolean;
  /** Excel width in characters. */
  width?: number;
}

export type ReportRowKind = 'normal' | 'section' | 'total' | 'grand';

export interface ReportRow {
  kind?: ReportRowKind;
  cells: Array<string | number | null | undefined>;
}

export interface ReportDoc {
  title: string;
  /** Company name, shown above the title. */
  company?: string;
  /** Lines under the title: period, currency... */
  meta: string[];
  columns: ReportColumn[];
  rows: ReportRow[];
  /** Footer line, e.g. "Tuzildi: 26.11.2026 14:05". */
  footer?: string;
  /** Wide reports print in landscape. */
  landscape?: boolean;
}

/** Money as printed: "1 234 567,89", minus as "−", zero as "—". */
export function formatPrintNumber(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '—';
  const abs = Math.abs(value);
  const [int, frac] = abs.toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${value < 0 ? '−' : ''}${grouped},${frac}`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A complete, self-contained HTML page for printing (A4, black on white). */
export function buildPrintHtml(doc: ReportDoc, lang: string): string {
  const head = doc.columns
    .map((c) => `<th class="${c.numeric ? 'num' : ''}">${escapeHtml(c.label)}</th>`)
    .join('');
  const body = doc.rows
    .map((row) => {
      const kind = row.kind ?? 'normal';
      if (kind === 'section') {
        return `<tr class="section"><td colspan="${doc.columns.length}">${escapeHtml(String(row.cells[0] ?? ''))}</td></tr>`;
      }
      const cells = doc.columns
        .map((col, i) => {
          const v = row.cells[i];
          const text = typeof v === 'number' ? formatPrintNumber(v) : escapeHtml(v == null ? '' : String(v));
          return `<td class="${col.numeric ? 'num' : ''}">${text}</td>`;
        })
        .join('');
      return `<tr class="${kind}">${cells}</tr>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(doc.title)}</title>
<style>
  @page { size: A4 ${doc.landscape ? 'landscape' : 'portrait'}; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, "Helvetica Neue", sans-serif; font-size: 10.5pt; color: #000; background: #fff; }
  .company { font-size: 10pt; color: #444; margin-bottom: 2mm; }
  h1 { font-size: 15pt; margin: 0 0 2mm; }
  .meta { margin: 0; color: #333; font-size: 9.5pt; }
  table { width: 100%; border-collapse: collapse; margin-top: 5mm; }
  thead { display: table-header-group; }
  th, td { border: 0.5pt solid #999; padding: 1.6mm 2mm; text-align: left; vertical-align: top; }
  th { background: #eee; font-weight: bold; font-size: 9.5pt; }
  .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  tr { page-break-inside: avoid; }
  tr.section td { background: #f4f4f4; font-weight: bold; }
  tr.total td { font-weight: bold; }
  tr.grand td { font-weight: bold; border-top: 1.5pt solid #000; background: #f4f4f4; }
  .footer { margin-top: 6mm; font-size: 8.5pt; color: #555; }
</style>
</head>
<body>
${doc.company ? `<div class="company">${escapeHtml(doc.company)}</div>` : ''}
<h1>${escapeHtml(doc.title)}</h1>
${doc.meta.map((m) => `<p class="meta">${escapeHtml(m)}</p>`).join('\n')}
<table>
<thead><tr>${head}</tr></thead>
<tbody>
${body}
</tbody>
</table>
${doc.footer ? `<div class="footer">${escapeHtml(doc.footer)}</div>` : ''}
</body>
</html>`;
}

/** Excel sheet names: at most 31 characters, none of : \ / ? * [ ]. */
export function sheetName(title: string): string {
  return title.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31).trim() || 'Report';
}

/** The report as an .xlsx workbook (exceljs is loaded only when asked for). */
export async function buildXlsx(doc: ReportDoc): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const ws = wb.addWorksheet(sheetName(doc.title), {
    pageSetup: { paperSize: 9, orientation: doc.landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  const n = doc.columns.length;
  const thin = { style: 'thin' as const, color: { argb: 'FFB0B0B0' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const money = '#,##0.00;[Red]-#,##0.00;"—"';

  const banner = (text: string, size: number, bold: boolean) => {
    const row = ws.addRow([text]);
    ws.mergeCells(row.number, 1, row.number, n);
    row.getCell(1).font = { size, bold };
  };
  if (doc.company) banner(doc.company, 10, false);
  banner(doc.title, 14, true);
  for (const m of doc.meta) banner(m, 10, false);
  ws.addRow([]);

  const header = ws.addRow(doc.columns.map((c) => c.label));
  header.eachCell((cell, i) => {
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEDED' } };
    cell.border = border;
    cell.alignment = { vertical: 'middle', wrapText: true, horizontal: doc.columns[i - 1]?.numeric ? 'right' : 'left' };
  });
  ws.views = [{ state: 'frozen', ySplit: header.number }];

  for (const r of doc.rows) {
    const kind = r.kind ?? 'normal';
    const values = kind === 'section' ? [r.cells[0] ?? ''] : doc.columns.map((_, i) => r.cells[i] ?? null);
    const row = ws.addRow(values);
    if (kind === 'section') {
      ws.mergeCells(row.number, 1, row.number, n);
      row.getCell(1).font = { bold: true };
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F4F4' } };
      continue;
    }
    doc.columns.forEach((col, i) => {
      const cell = row.getCell(i + 1);
      cell.border = border;
      if (col.numeric) {
        cell.numFmt = money;
        cell.alignment = { horizontal: 'right' };
      }
      if (kind === 'total' || kind === 'grand') cell.font = { bold: true };
      if (kind === 'grand') {
        cell.border = { ...border, top: { style: 'medium', color: { argb: 'FF000000' } } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F4F4' } };
      }
    });
  }
  if (doc.footer) {
    ws.addRow([]);
    const f = ws.addRow([doc.footer]);
    f.getCell(1).font = { size: 9, italic: true, color: { argb: 'FF666666' } };
  }
  doc.columns.forEach((col, i) => {
    ws.getColumn(i + 1).width = col.width ?? (col.numeric ? 18 : 30);
  });
  return wb.xlsx.writeBuffer() as Promise<ArrayBuffer>;
}

/** "harakatlar 2026-11-01..30" → a safe file name. */
export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_');
}
