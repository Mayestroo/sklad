import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildPrintHtml, buildXlsx, formatPrintNumber, safeFileName, sheetName, type ReportDoc } from './accounting-export.ts';

const doc: ReportDoc = {
  title: 'Aylanma-saldo qaydnomasi',
  company: 'Test MChJ',
  meta: ['Davr: 01.11.2026 – 26.11.2026', 'Summalar UZS da'],
  columns: [
    { label: 'Hisob', width: 10 },
    { label: 'Nomi <kassa>' },
    { label: 'Qoldiq', numeric: true },
  ],
  rows: [
    { kind: 'section', cells: ['Mol-mulk'] },
    { cells: ['5010', 'Kassa', 1234567.891] },
    { cells: ['6010', 'Qarz', -500] },
    { kind: 'grand', cells: ['Jami', '', 1234067.89] },
  ],
  footer: 'Tuzildi: 26.11.2026 14:05',
  landscape: true,
};

describe('accounting export', () => {
  it('prints money with grouping, a minus sign and a dash for zero', () => {
    assert.equal(formatPrintNumber(1234567.891), '1 234 567,89');
    assert.equal(formatPrintNumber(-500), '−500,00');
    assert.equal(formatPrintNumber(0), '—');
  });

  it('builds a print page with only the report: company, title, period, table, footer', () => {
    const html = buildPrintHtml(doc, 'uz');
    assert.match(html, /^<!doctype html>/);
    assert.match(html, /@page \{ size: A4 landscape/);
    assert.match(html, /<div class="company">Test MChJ<\/div>/);
    assert.match(html, /<h1>Aylanma-saldo qaydnomasi<\/h1>/);
    assert.match(html, /Nomi &lt;kassa&gt;/);
    assert.match(html, /<tr class="section"><td colspan="3">Mol-mulk<\/td><\/tr>/);
    assert.match(html, /<td class="num">1 234 567,89<\/td>/);
    assert.match(html, /<tr class="grand">/);
    assert.match(html, /Tuzildi: 26\.11\.2026 14:05/);
    // nothing of the app page: no scripts, no external styles
    assert.doesNotMatch(html, /<script|<link/);
  });

  it('builds a real .xlsx with number formats, bold totals and a frozen header', async () => {
    const buffer = await buildXlsx(doc);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.getWorksheet('Aylanma-saldo qaydnomasi');
    assert.ok(ws);
    assert.equal(ws.getCell('A1').value, 'Test MChJ');
    assert.equal(ws.getCell('A2').value, 'Aylanma-saldo qaydnomasi');
    assert.equal(ws.getCell('A2').font?.bold, true);
    // header after company, title, 2 meta lines and a blank row
    assert.equal(ws.getCell('C6').value, 'Qoldiq');
    assert.equal(ws.views[0]?.state, 'frozen');
    assert.equal(ws.getCell('A7').value, 'Mol-mulk');
    assert.equal(ws.getCell('C8').value, 1234567.891);
    assert.match(String(ws.getCell('C8').numFmt), /#,##0\.00/);
    assert.equal(ws.getCell('C10').font?.bold, true);
    assert.equal(ws.getColumn(1).width, 10);
    assert.equal(ws.pageSetup.orientation, 'landscape');
  });

  it('keeps sheet and file names valid', () => {
    assert.equal(sheetName('Foyda/zarar: 2026 [noyabr] juda uzun nomli hisobot'), 'Foyda zarar  2026  noyabr  juda');
    assert.equal(safeFileName('aylanma saldo 2026/11'), 'aylanma_saldo_2026-11');
  });
});
