import assert from 'node:assert/strict';
import test from 'node:test';
import { compareRows, CUSTOMER_NAME_DIFFERENCE_EXPLANATION } from './comparison.ts';

function record(number, customer, amount, sourceIndex, issues = []) {
  return {
    number,
    key: number.trim().toLowerCase(),
    customer,
    date: '2026-10-10',
    cents: amount,
    issues,
    sourceIndex,
  };
}

function compare(aRows, bRows) {
  return compareRows(
    { fileName: 'file-a.csv', rows: aRows, count: aRows.length },
    { fileName: 'file-b.csv', rows: bRows, count: bRows.length },
  );
}

test('flags INV-2001 customer-name difference when invoice number and amount match', () => {
  const [result] = compare(
    [record('INV-2001', 'Northstar Cooling', 200000, 2)],
    [record('INV-2001', 'Northstar Services', 200000, 2)],
  );

  assert.equal(result.number, 'INV-2001');
  assert.equal(result.type, 'Customer name differs');
  assert.equal(result.category, 'customer-name-difference');
  assert.equal(result.comparison.invoiceNumber, 'Match');
  assert.equal(result.comparison.amount, 'Match');
  assert.equal(result.comparison.customerName, 'Difference detected');
  assert.equal(result.customerNameDifferent, true);
  assert.match(result.explanation, /Invoice number: Match\. Amount: Match\. Customer name: Difference detected\./);
  assert.ok(result.explanation.includes(CUSTOMER_NAME_DIFFERENCE_EXPLANATION));
  assert.match(result.explanation, /Northstar Cooling/);
  assert.match(result.explanation, /Northstar Services/);
});

test('keeps amount-difference detection and flags both fields when both differ', () => {
  const [result] = compare(
    [record('INV-2002', 'Northstar Cooling', 200000, 2)],
    [record('INV-2002', 'Northstar Services', 195000, 2)],
  );

  assert.equal(result.type, 'Amount differs');
  assert.equal(result.category, 'amount-difference');
  assert.equal(result.comparison.amount, 'Difference detected');
  assert.equal(result.comparison.customerName, 'Difference detected');
  assert.equal(result.customerNameDifferent, true);
  assert.equal(new Set([result.issueId]).size, 1);
});

test('continues reporting clean matches when compared fields agree', () => {
  const [result] = compare(
    [record('INV-2003', 'Northstar Cooling', 200000, 2)],
    [record('INV-2003', ' northstar   cooling ', 200000, 2)],
  );

  assert.equal(result.type, 'Matched');
  assert.equal(result.customerNameDifferent, false);
  assert.equal(result.comparison.customerName, 'Match');
});

test('preserves missing invoices on either side', () => {
  const results = compare(
    [record('INV-2004', 'Northstar Cooling', 200000, 2)],
    [record('INV-2005', 'Northstar Services', 180000, 2)],
  );

  assert.deepEqual(results.map((result) => result.type), ['Only in A', 'Only in B']);
  assert.ok(results.every((result) => result.category === 'missing'));
});

test('keeps duplicate invoice records for human review instead of auto-matching', () => {
  const results = compare(
    [
      record('INV-2006', 'Northstar Cooling', 200000, 2),
      record('INV-2006', 'Northstar Cooling', 200000, 3),
    ],
    [record('INV-2006', 'Northstar Cooling', 200000, 2)],
  );

  assert.equal(results.length, 3);
  assert.ok(results.every((result) => result.type === 'Needs review' && result.category === 'duplicate'));
  assert.equal(new Set(results.map((result) => result.issueId)).size, 1);
});
