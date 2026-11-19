import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTaxTable, lookupJurisdiction, taxLineLabel, VA_TAX_RATE, VA_REGISTRATION, OUT_OF_STATE_REGISTRATION } from '../src/tax.js';
import { buildQuote } from '../src/quote.js';

const table = JSON.parse(readFileSync(new URL('../data/tax-rates.json', import.meta.url)));
before(() => setTaxTable(table));

test('VA ZIP 22485 keeps 4.25% tax and $153.50 registration', () => {
  const j = lookupJurisdiction('22485');
  assert.equal(j.status, 'ok');
  assert.equal(j.state, 'VA');
  assert.equal(j.taxRate, VA_TAX_RATE);
  assert.equal(j.registration, VA_REGISTRATION);
  assert.equal(j.outOfState, false);
  assert.equal(taxLineLabel(j), 'Tax (VA 4.25%)');
  const q = buildQuote({ vautoPrice: 39005, tier: 'Good', term: 72, zip: '22485' });
  assert.equal(q.tax, 1700);
  assert.equal(q.registration, 153.5);
  assert.equal(q.outTheDoor, 41853.5);
  assert.equal(q.taxLabel, 'Tax (VA 4.25%)');
  assert.equal(q.outOfState, false);
});

test('MD ZIP 20601 uses 6.00% tax and $753.50 registration', () => {
  const j = lookupJurisdiction('20601');
  assert.equal(j.status, 'ok');
  assert.equal(j.state, 'MD');
  assert.equal(j.taxRate, 0.06);
  assert.equal(j.registration, OUT_OF_STATE_REGISTRATION);
  assert.equal(j.outOfState, true);
  assert.equal(j.taxSource, 'state'); // Maryland has a single statewide rate
  assert.equal(taxLineLabel(j), 'Tax (MD 6.00%)');
  // TSP $40,000 × 6% = $2,400; OTD = 40,000 + 2,400 + 753.50
  const q = buildQuote({ vautoPrice: 39005, tier: 'Good', term: 72, zip: '20601' });
  assert.equal(q.tax, 2400);
  assert.equal(q.registration, 753.5);
  assert.equal(q.outTheDoor, 43153.5);
  assert.equal(q.taxLabel, 'Tax (MD 6.00%)');
  assert.ok(q.disclaimers.some((t) => t.includes('Out-of-state tax and registration are estimates')));
});

test('DC ZIP 20001 uses 6.00% tax and $753.50 registration', () => {
  const j = lookupJurisdiction('20001');
  assert.equal(j.status, 'ok');
  assert.equal(j.state, 'DC');
  assert.equal(j.taxRate, 0.06);
  assert.equal(j.registration, OUT_OF_STATE_REGISTRATION);
  assert.equal(taxLineLabel(j), 'Tax (DC 6.00%)');
  const q = buildQuote({ vautoPrice: 39005, tier: 'Good', term: 72, zip: '20001-1234' });
  assert.equal(q.taxState, 'DC');
  assert.equal(q.tax, 2400);
  assert.equal(q.registration, 753.5);
});

test('a blank ZIP keeps Virginia tax and registration', () => {
  for (const raw of ['', null, undefined, '   ']) {
    const j = lookupJurisdiction(raw);
    assert.equal(j.status, 'blank');
    assert.equal(j.state, 'VA');
    assert.equal(j.taxRate, VA_TAX_RATE);
    assert.equal(j.registration, VA_REGISTRATION);
    assert.equal(j.outOfState, false);
  }
  const q = buildQuote({ vautoPrice: 39005, tier: 'Good', term: 72 });
  assert.equal(q.tax, 1700);
  assert.equal(q.registration, 153.5);
  assert.equal(q.outTheDoor, 41853.5);
});

test('invalid ZIP input falls back to Virginia tax and registration', () => {
  for (const raw of ['12', 'abc', '00000', '99', '-----']) {
    const j = lookupJurisdiction(raw);
    assert.equal(j.status, 'invalid', raw);
    assert.equal(j.state, 'VA', raw);
    assert.equal(j.taxRate, VA_TAX_RATE, raw);
    assert.equal(j.registration, VA_REGISTRATION, raw);
    assert.equal(j.outOfState, false, raw);
  }
});

test('the customer can override the tax rate on an out-of-state ZIP', () => {
  const j = lookupJurisdiction('20601', { taxOverride: 0.07 });
  assert.equal(j.state, 'MD');
  assert.equal(j.taxRate, 0.07);
  assert.equal(j.taxSource, 'override');
  assert.equal(j.registration, OUT_OF_STATE_REGISTRATION);
  assert.equal(taxLineLabel(j), 'Tax (MD 7.00%)');
  const q = buildQuote({ vautoPrice: 39005, tier: 'Good', term: 72, zip: '20601', taxOverride: 0.07 });
  assert.equal(q.tax, 2800); // 40,000 × 7%
  assert.equal(q.registration, 753.5);
  assert.equal(q.outTheDoor, 43553.5);
});
