import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * muammolar.pdf B8 ("Skidkaga narx yozilyapti"): the sales-order line table
 * rendered its cells in a different order from its header, so the price was
 * typed into the column labelled "Skidka %". There is no DOM test runner in
 * this project, so this checks the component source: header labels and body
 * inputs must come in the same order.
 */
const source = readFileSync(fileURLToPath(new URL('./OrderItemsTable.tsx', import.meta.url)), 'utf8');
const [head, body] = source.split('<tbody>');

const order = (text: string, markers: string[]) =>
  markers.map((marker) => {
    const index = text.indexOf(marker);
    assert.notEqual(index, -1, `marker not found: ${marker}`);
    return index;
  });

test('order line cells follow the header: quantity, price, discount, VAT', () => {
  const headerPositions = order(head, ["'Buyurtma miqdori'", "'Birlik narxi'", "'Skidka %'", "'QQS %'"]);
  const bodyPositions = order(body, ["'Miqdor'", "'Birlik narxi'", "'Chegirma %'", "'QQS stavkasi'"]);

  const sorted = (positions: number[]) => [...positions].sort((a, b) => a - b);
  assert.deepEqual(headerPositions, sorted(headerPositions), 'header columns out of order');
  assert.deepEqual(bodyPositions, sorted(bodyPositions), 'body cells do not follow the header order');
});
