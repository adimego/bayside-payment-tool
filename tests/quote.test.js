import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQuote, aprFor, monthlyPayment, maxVautoPriceForPayment, TIERS, TERMS, CURRENT_MODEL_YEAR, maxTermForYear, vehicleAge, clampTerm, yearFromVehicleName } from '../src/quote.js';

// Hand-checked: $39,005 vAuto, Good credit, 72 months, $3,000 down.
//   TSP      = 39,005 + 995           = 40,000.00
//   Tax      = 40,000 x 4.25%         =  1,700.00
//   OTD      = 40,000 + 1,700 + 153.50 = 41,853.50
//   Financed = 41,853.50 - 3,000      = 38,853.50
//   APR      = 9.5 + 0.5 x 3          = 11.0%
//   Payment  = 38,853.50 x r / (1 - (1+r)^-72), r = 0.11/12   = 739.54
test('hand-checked example: $39,005, Good, 72 mo, $3,000 down', () => {
  const q = buildQuote({ vautoPrice: 39005, down: 3000, tier: 'Good', term: 72 });
  assert.equal(q.totalSellingPrice, 40000);
  assert.equal(q.tax, 1700);
  assert.equal(q.registration, 153.5);
  assert.equal(q.militaryRebate, 0);
  assert.equal(q.outTheDoor, 41853.5);
  assert.equal(q.amountFinanced, 38853.5);
  assert.equal(q.apr, 11);
  assert.equal(q.payment, 739.54);
});

test('military / first responder $500 comes off after tax on new vehicles', () => {
  const q = buildQuote({ vautoPrice: 39005, tier: 'Good', term: 72, military: true, condition: 'New' });
  assert.equal(q.tax, 1700); // tax still on the full $40,000
  assert.equal(q.militaryRebate, 500);
  assert.equal(q.outTheDoor, 41353.5);
  // N/U = N from the vAuto feed is also treated as new
  assert.equal(buildQuote({ vautoPrice: 39005, tier: 'Good', term: 72, military: true, condition: 'N' }).militaryRebate, 500);
});

test('military / first responder rebate is ignored on used vehicles even if requested', () => {
  const flagged = buildQuote({ vautoPrice: 39005, tier: 'Good', term: 72, military: true, condition: 'Used' });
  const plain = buildQuote({ vautoPrice: 39005, tier: 'Good', term: 72, military: false, condition: 'Used' });
  assert.equal(flagged.militaryRebate, 0);
  assert.equal(flagged.tax, 1700);
  assert.equal(flagged.outTheDoor, 41853.5); // no $500 off
  assert.equal(flagged.outTheDoor, plain.outTheDoor);
  assert.equal(flagged.amountFinanced, plain.amountFinanced);
  assert.equal(flagged.payment, plain.payment);
  // N/U = U from the vAuto feed is also treated as used
  assert.equal(buildQuote({ vautoPrice: 39005, tier: 'Good', term: 72, military: true, condition: 'U' }).militaryRebate, 0);
});

test('payment-goal ceiling ignores the military rebate for used vehicles', () => {
  const base = { payment: 750, down: 3000, tier: 'Good', term: 72 };
  const usedOn = maxVautoPriceForPayment({ ...base, military: true, condition: 'Used' });
  const usedOff = maxVautoPriceForPayment({ ...base, military: false, condition: 'Used' });
  const newOn = maxVautoPriceForPayment({ ...base, military: true, condition: 'New' });
  assert.equal(usedOn, usedOff);
  assert.ok(newOn > usedOn);
});

test('negative trade equity is added to the amount financed', () => {
  // equity = 10,000 - 14,000 = -4,000 -> financed = 41,853.50 - 3,000 + 4,000
  const q = buildQuote({ vautoPrice: 39005, down: 3000, tradeValue: 10000, tradePayoff: 14000, tier: 'Good', term: 72 });
  assert.equal(q.tradeEquity, -4000);
  assert.equal(q.amountFinanced, 42853.5);
  assert.equal(q.payment, 815.68);
});

test('positive trade equity lowers the amount financed; no trade tax credit', () => {
  const q = buildQuote({ vautoPrice: 39005, tradeValue: 15000, tradePayoff: 5000, tier: 'Good', term: 72 });
  assert.equal(q.tax, 1700);
  assert.equal(q.tradeEquity, 10000);
  assert.equal(q.amountFinanced, 31853.5);
  assert.equal(q.payment, 606.3);
});

test('tax rounds to cents; Poor credit 84 months', () => {
  // TSP 25,995; tax 1,104.7875 -> 1,104.79; OTD 27,253.29; APR 21.5%
  const q = buildQuote({ vautoPrice: 25000, tier: 'Poor', term: 84 });
  assert.equal(q.tax, 1104.79);
  assert.equal(q.outTheDoor, 27253.29);
  assert.equal(q.apr, 21.5);
  assert.equal(q.payment, 630.05);
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

test('APR table for used / pre-owned: base at 36 mo, +0.5 per extra 12 months', () => {
  const expected = { Poor: [19.5, 20, 20.5, 21, 21.5], Fair: [15.5, 16, 16.5, 17, 17.5], Good: [9.5, 10, 10.5, 11, 11.5], Great: [7.5, 8, 8.5, 9, 9.5], Excellent: [5.5, 6, 6.5, 7, 7.5] };
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
  // Worked example: $750/mo, Good, 72 mo, $3,000 down -> $39,532 vAuto ceiling
  assert.equal(maxVautoPriceForPayment({ payment: 750, down: 3000, tier: 'Good', term: 72 }), 39532);
});

test('new vehicles are 0.5 points below the used APR at every term', () => {
  const used = { Poor: [19.5, 20, 20.5, 21, 21.5], Fair: [15.5, 16, 16.5, 17, 17.5], Good: [9.5, 10, 10.5, 11, 11.5], Great: [7.5, 8, 8.5, 9, 9.5], Excellent: [5.5, 6, 6.5, 7, 7.5] };
  const neu = { Poor: [19, 19.5, 20, 20.5, 21], Fair: [15, 15.5, 16, 16.5, 17], Good: [9, 9.5, 10, 10.5, 11], Great: [7, 7.5, 8, 8.5, 9], Excellent: [5, 5.5, 6, 6.5, 7] };
  for (const t of TIERS) {
    assert.deepEqual(TERMS.map((n) => aprFor(t.id, n, 'Used')), used[t.id]);
    assert.deepEqual(TERMS.map((n) => aprFor(t.id, n, 'New')), neu[t.id]);
    assert.deepEqual(TERMS.map((n) => aprFor(t.id, n, 'N')), neu[t.id]);
  }
  assert.equal(aprFor('Good', 72), 11); // omitted condition uses the used table
  assert.equal(aprFor('Good', 72, 'New'), 10.5);
});

test('term caps by vehicle age against model year 2026', () => {
  assert.equal(CURRENT_MODEL_YEAR, 2026);
  // 2021 = age 5, no cap; 2020 = age 6, cap 72; 2017 = age 9, cap 72; 2016 = age 10, cap 60
  assert.equal(vehicleAge(2021), 5);
  assert.equal(vehicleAge(2020), 6);
  assert.equal(vehicleAge(2017), 9);
  assert.equal(vehicleAge(2016), 10);
  assert.equal(maxTermForYear(2021), 84);
  assert.equal(maxTermForYear(2020), 72);
  assert.equal(maxTermForYear(2017), 72);
  assert.equal(maxTermForYear(2016), 60);
  assert.equal(maxTermForYear(2014), 60);
  assert.equal(maxTermForYear(2026), 84);
  assert.equal(maxTermForYear(2027), 84);
  assert.equal(clampTerm(84, 2021), 84);
  assert.equal(clampTerm(84, 2020), 72);
  assert.equal(clampTerm(84, 2016), 60);
  assert.equal(clampTerm(48, 2016), 48); // already under the cap
  assert.equal(yearFromVehicleName('2016 Jeep Wrangler Unlimited Sahara'), 2016);
  assert.equal(yearFromVehicleName('2027 Dodge Charger R/T Plus'), 2027);
});

test('buildQuote auto-selects the max term when the request exceeds the cap', () => {
  const q = buildQuote({ vautoPrice: 18005, tier: 'Good', term: 84, condition: 'Used', year: 2014 });
  assert.equal(q.term, 60);
  assert.equal(q.maxTerm, 60);
  assert.equal(q.apr, 10.5); // used Good at 60 months
  const fromName = buildQuote({ vautoPrice: 18005, tier: 'Good', term: 84, condition: 'Used', name: '2014 Ram 1500 Express' });
  assert.equal(fromName.term, 60);
  assert.equal(fromName.apr, q.apr);
  assert.equal(fromName.payment, q.payment);
});

test('buildQuote uses the lower new APR and does not cap a current-year vehicle', () => {
  const q = buildQuote({ vautoPrice: 24755, tier: 'Good', term: 84, condition: 'New', year: 2026 });
  assert.equal(q.term, 84);
  assert.equal(q.maxTerm, 84);
  assert.equal(q.apr, 11); // new Good 9.0 + 2.0
  const usedSame = buildQuote({ vautoPrice: 24755, tier: 'Good', term: 84, condition: 'Used', year: 2026 });
  assert.equal(usedSame.apr, 11.5);
  assert.ok(q.payment < usedSame.payment);
});
