import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuote, aprFor, monthlyPayment, maxVautoPriceForPayment, TIERS, TERMS } from '../src/quote.js';

// Hand-checked: $39,005 vAuto, Good credit, 72 months, $3,000 down.
//   TSP      = 39,005 + 995           = 40,000.00
//   Tax      = 40,000 x 4.25%         =  1,700.00
//   OTD      = 40,000 + 1,700 + 153.50 = 41,853.50
//   Financed = 41,853.50 - 3,000      = 38,853.50
//   APR      = 10 + 0.5 x 3           = 11.5%
//   Payment  = 38,853.50 x r / (1 - (1+r)^-72), r = 0.115/12  = 749.53
test('hand-checked example: $39,005, Good, 72 mo, $3,000 down', () => {
  const q = buildQuote({ vautoPrice: 39005, down: 3000, tier: 'Good', term: 72 });
  assert.equal(q.totalSellingPrice, 40000);
  assert.equal(q.tax, 1700);
  assert.equal(q.registration, 153.5);
  assert.equal(q.militaryRebate, 0);
  assert.equal(q.outTheDoor, 41853.5);
  assert.equal(q.amountFinanced, 38853.5);
  assert.equal(q.apr, 11.5);
  assert.equal(q.payment, 749.53);
});

test('military / first responder $500 comes off after tax', () => {
  const q = buildQuote({ vautoPrice: 39005, tier: 'Good', term: 72, military: true });
  assert.equal(q.tax, 1700); // tax still on the full $40,000
  assert.equal(q.militaryRebate, 500);
  assert.equal(q.outTheDoor, 41353.5);
});

test('negative trade equity is added to the amount financed', () => {
  // equity = 10,000 - 14,000 = -4,000 -> financed = 41,853.50 - 3,000 + 4,000
  const q = buildQuote({ vautoPrice: 39005, down: 3000, tradeValue: 10000, tradePayoff: 14000, tier: 'Good', term: 72 });
  assert.equal(q.tradeEquity, -4000);
  assert.equal(q.amountFinanced, 42853.5);
  assert.equal(q.payment, 826.69);
});

test('positive trade equity lowers the amount financed; no trade tax credit', () => {
  const q = buildQuote({ vautoPrice: 39005, tradeValue: 15000, tradePayoff: 5000, tier: 'Good', term: 72 });
  assert.equal(q.tax, 1700);
  assert.equal(q.tradeEquity, 10000);
  assert.equal(q.amountFinanced, 31853.5);
  assert.equal(q.payment, 614.49);
});

test('tax rounds to cents; Poor credit 84 months', () => {
  // TSP 25,995; tax 1,104.7875 -> 1,104.79; OTD 27,253.29; APR 22%
  const q = buildQuote({ vautoPrice: 25000, tier: 'Poor', term: 84 });
  assert.equal(q.tax, 1104.79);
  assert.equal(q.outTheDoor, 27253.29);
  assert.equal(q.apr, 22);
  assert.equal(q.payment, 638.43);
});

test('amount financed floors at zero', () => {
  const q = buildQuote({ vautoPrice: 20000, down: 50000, tier: 'Great', term: 36 });
  assert.equal(q.amountFinanced, 0);
  assert.equal(q.payment, 0);
});

test('no price means no quote (Call for Price)', () => {
  assert.equal(buildQuote({ vautoPrice: null }), null);
  assert.equal(buildQuote({ vautoPrice: 0 }), null);
});

test('APR table: base at 36 mo, +0.5 per extra 12 months', () => {
  const expected = { Poor: [20, 20.5, 21, 21.5, 22], Fair: [16, 16.5, 17, 17.5, 18], Good: [10, 10.5, 11, 11.5, 12], Great: [8, 8.5, 9, 9.5, 10], Excellent: [6, 6.5, 7, 7.5, 8] };
  for (const t of TIERS) assert.deepEqual(TERMS.map((n) => aprFor(t.id, n)), expected[t.id]);
  assert.throws(() => aprFor('Good', 66));
  assert.throws(() => aprFor('Platinum', 36));
});

test('monthlyPayment matches the standard amortization formula', () => {
  assert.equal(monthlyPayment(41353.5, 6, 36), 1258.05);
  assert.equal(monthlyPayment(0, 6, 36), 0);
});

test('payment goal inverse: max price fits the goal and $2 more does not', () => {
  const cases = [];
  for (const tier of ['Poor', 'Good', 'Excellent']) for (const term of TERMS) for (const military of [false, true])
    cases.push({ payment: 650, down: 2500, tradeValue: 8000, tradePayoff: 11000, tier, term, military });
  cases.push({ payment: 750, down: 3000, tier: 'Good', term: 72 });
  for (const g of cases) {
    const max = maxVautoPriceForPayment(g);
    assert.ok(max > 0);
    assert.ok(buildQuote({ ...g, vautoPrice: max }).payment <= g.payment, JSON.stringify(g));
    assert.ok(buildQuote({ ...g, vautoPrice: max + 2 }).payment > g.payment, JSON.stringify(g));
  }
  // Worked example: $750/mo, Good, 72 mo, $3,000 down -> $39,028 vAuto ceiling
  assert.equal(maxVautoPriceForPayment({ payment: 750, down: 3000, tier: 'Good', term: 72 }), 39028);
});
