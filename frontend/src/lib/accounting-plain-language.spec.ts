import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Buxgalteriya TZ, test E: the simple mode never says debet, kredit,
 * provodka, aylanma or saldo. Every text the simple mode shows lives in these
 * keys of messages `acct.*`; the accountant-only keys (journal, manual, tb,
 * *_official, accountant tabs) and the glossary that explains the terms are
 * left out on purpose.
 */
const SIMPLE_KEYS = ['subtitle', 'mode', 'period', 'export', 'units', 'banner', 'issue', 'cards', 'recent', 'empty', 'plain', 'effect', 'movements', 'accounts', 'common'];
const FORBIDDEN: Record<string, RegExp> = {
  uz: /debet|kredit|provodka|aylanma|saldo/i,
  ru: /дебет|кредит|проводк|оборот|сальдо/i,
};
// Accountant-only texts inside otherwise simple namespaces.
const ACCOUNTANT_ONLY = new Set(['accounts.accountantHint']);

function texts(node: unknown, path: string, out: Array<[string, string]>) {
  if (typeof node === 'string') out.push([path, node]);
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) texts(v, path ? `${path}.${k}` : k, out);
}

for (const lang of ['uz', 'ru'] as const) {
  test(`simple-mode texts (${lang}) avoid accounting jargon`, () => {
    const file = fileURLToPath(new URL(`../../messages/${lang}.json`, import.meta.url));
    const acct = JSON.parse(readFileSync(file, 'utf8')).acct;
    const all: Array<[string, string]> = [];
    for (const key of SIMPLE_KEYS) texts(acct[key], key, all);
    for (const tab of ['overview', 'movements', 'reports', 'accounts']) all.push([`tabs.simple_${tab}`, acct.tabs[`simple_${tab}`]]);
    for (const r of ['profit-loss', 'balance', 'cash-flow', 'pnlProfit', 'pnlLoss', 'balanceSummary', 'cashSummary']) all.push([`reports.${r}`, acct.reports[r]]);
    for (const ty of ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']) all.push([`types.${ty}`, acct.types[ty]], [`types.${ty}_help`, acct.types[`${ty}_help`]]);
    const offending = all.filter(([path, text]) => !ACCOUNTANT_ONLY.has(path) && FORBIDDEN[lang].test(text));
    assert.deepEqual(offending, []);
  });
}
