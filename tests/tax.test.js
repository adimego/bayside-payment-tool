import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTaxTable, lookupJurisdiction, taxLineLabel, applyZipToDeal, applyTaxPercentToDeal, isTaxOverride, VA_TAX_RATE, VA_REGISTRATION, OUT_OF_STATE_REGISTRATION } from '../src/tax.js';
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

test('MD ZIP 20601 uses the 6.50% vehicle titling excise tax and $753.50 registration', () => {
  const j = lookupJurisdiction('20601');
  assert.equal(j.status, 'ok');
  assert.equal(j.state, 'MD');
  assert.equal(j.taxRate, 0.065);
  assert.equal(j.registration, OUT_OF_STATE_REGISTRATION);
  assert.equal(j.outOfState, true);
  assert.equal(j.taxSource, 'vehicle');
  assert.equal(j.taxName, 'titling excise tax');
  assert.equal(taxLineLabel(j), 'Tax (MD 6.50%)');
  // TSP $40,000 × 6.5% = $2,600; OTD = 40,000 + 2,600 + 753.50
  const q = buildQuote({ vautoPrice: 39005, tier: 'Good', term: 72, zip: '20601' });
  assert.equal(q.tax, 2600);
  assert.equal(q.registration, 753.5);
  assert.equal(q.outTheDoor, 43353.5);
  assert.equal(q.taxLabel, 'Tax (MD 6.50%)');
  assert.ok(q.disclaimers.some((t) => t.includes('Out-of-state tax and registration are estimates')));
});

test('DC ZIP 20001 uses a mid-range 6.00% excise estimate and $753.50 registration', () => {
  const j = lookupJurisdiction('20001');
  assert.equal(j.status, 'ok');
  assert.equal(j.state, 'DC');
  assert.equal(j.taxRate, 0.06);
  assert.equal(j.unmodeled, true);
  assert.equal(j.registration, OUT_OF_STATE_REGISTRATION);
  assert.equal(taxLineLabel(j), 'Tax (DC 6.00% est.)');
  const q = buildQuote({ vautoPrice: 39005, tier: 'Good', term: 72, zip: '20001-1234' });
  assert.equal(q.taxState, 'DC');
  assert.equal(q.tax, 2400);
  assert.equal(q.registration, 753.5);
  assert.equal(q.taxLabel, 'Tax (DC 6.00% est.)');
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

test('a null taxOverride is not treated as a 0% override', () => {
  assert.equal(isTaxOverride(null), false);
  assert.equal(isTaxOverride(undefined), false);
  assert.equal(isTaxOverride(''), false);
  assert.equal(isTaxOverride(0), true);
  assert.equal(isTaxOverride(0.065), true);
  const j = lookupJurisdiction('20601', { taxOverride: null });
  assert.equal(j.taxRate, 0.065);
  assert.equal(j.taxSource, 'vehicle');
  const d = { down: 0, tradeValue: 0, tradePayoff: 0, tier: 'Good', term: 72, military: false, zip: '20601', taxOverride: null };
  const q = buildQuote({ ...d, vautoPrice: 39005 });
  assert.equal(q.tax, 2600);
  assert.equal(q.taxLabel, 'Tax (MD 6.50%)');
});

test('applyZipToDeal clears a prior override and fills the looked-up vehicle rate as soon as a 5-digit ZIP is set', () => {
  const d = { zip: '', taxOverride: 0.0425 };
  const partial = applyZipToDeal(d, '2060');
  assert.equal(d.taxOverride, null);
  assert.equal(partial.state, 'VA');
  assert.equal(partial.taxRate, VA_TAX_RATE);
  const md = applyZipToDeal(d, '20601');
  assert.equal(d.zip, '20601');
  assert.equal(d.taxOverride, null);
  assert.equal(md.state, 'MD');
  assert.equal(md.taxRate, 0.065);
  assert.equal(md.registration, OUT_OF_STATE_REGISTRATION);
  const va = applyZipToDeal(d, '22485');
  assert.equal(va.state, 'VA');
  assert.equal(va.taxRate, VA_TAX_RATE);
  assert.equal(va.registration, VA_REGISTRATION);
});

test('applyTaxPercentToDeal sets an override only from a value typed in the tax field', () => {
  const d = { zip: '20601', taxOverride: null };
  const j = applyTaxPercentToDeal(d, '7');
  assert.equal(d.taxOverride, 0.07);
  assert.equal(j.taxRate, 0.07);
  assert.equal(j.taxSource, 'override');
  assert.equal(j.registration, OUT_OF_STATE_REGISTRATION);
  applyTaxPercentToDeal(d, '');
  assert.equal(d.taxOverride, null);
});

test('NC ZIP uses the 3% highway use tax, not the general combined sales rate', () => {
  const j = lookupJurisdiction('28202');
  assert.equal(j.state, 'NC');
  assert.equal(j.taxRate, 0.03);
  assert.equal(j.taxSource, 'vehicle');
  assert.equal(j.taxName, 'highway use tax');
  // A $2,000 cap exists only for commercial/RV titles and is not applied here.
  assert.equal(j.taxCap, null);
  const q = buildQuote({ vautoPrice: 39005, tier: 'Good', term: 72, zip: '28202' });
  assert.equal(q.tax, 1200); // TSP $40,000 × 3%
  assert.equal(q.taxLabel, 'Tax (NC 3.00%)');
});

test('SC ZIP applies the 5% infrastructure maintenance fee with a $500 cap', () => {
  const j = lookupJurisdiction('29201');
  assert.equal(j.state, 'SC');
  assert.equal(j.taxRate, 0.05);
  assert.equal(j.taxCap, 500);
  assert.equal(taxLineLabel(j), 'Tax (SC 5.00%, $500.00 cap)');
  const q = buildQuote({ vautoPrice: 39005, tier: 'Good', term: 72, zip: '29201' });
  assert.equal(q.tax, 500); // 5% of $40,000 would be $2,000; cap is $500
  assert.equal(q.registration, 753.5);
  assert.equal(q.outTheDoor, 41253.5);
  assert.equal(q.taxLabel, 'Tax (SC 5.00%, $500.00 cap)');
});

test('NYC ZIP 10001 uses 8.875% combined (4% state + 4.875% local)', () => {
  const j = lookupJurisdiction('10001');
  assert.equal(j.state, 'NY');
  assert.equal(j.taxRate, 0.08875);
  assert.equal(j.stateRate, 0.04);
  assert.equal(j.localRate, 0.04875);
  assert.equal(j.taxSource, 'zip');
  assert.equal(j.localMayApply, false);
  assert.equal(taxLineLabel(j), 'Tax (NY 8.875%: state 4% + local 4.875%)');
  const q = buildQuote({ vautoPrice: 39005, tier: 'Good', term: 72, zip: '10001' });
  assert.equal(q.tax, 3550); // TSP $40,000 × 8.875%
  assert.equal(q.registration, 753.5);
  assert.equal(q.outTheDoor, 44303.5);
  assert.equal(q.taxLabel, 'Tax (NY 8.875%: state 4% + local 4.875%)');
});

test('upstate NY ZIP 12866 (Saratoga Springs) uses 7% combined (4% state + 3% local)', () => {
  const j = lookupJurisdiction('12866');
  assert.equal(j.state, 'NY');
  assert.equal(j.taxRate, 0.07);
  assert.equal(j.stateRate, 0.04);
  assert.equal(j.localRate, 0.03);
  assert.equal(taxLineLabel(j), 'Tax (NY 7%: state 4% + local 3%)');
  const q = buildQuote({ vautoPrice: 39005, tier: 'Good', term: 72, zip: '12866' });
  assert.equal(q.tax, 2800); // TSP $40,000 × 7%
  assert.equal(q.registration, 753.5);
});

test('PA Philadelphia ZIP 19103 uses 8% (6% state + 2% local)', () => {
  const j = lookupJurisdiction('19103');
  assert.equal(j.state, 'PA');
  assert.equal(j.taxRate, 0.08);
  assert.equal(j.stateRate, 0.06);
  assert.equal(j.localRate, 0.02);
  assert.equal(taxLineLabel(j), 'Tax (PA 8%: state 6% + local 2%)');
  const q = buildQuote({ vautoPrice: 39005, tier: 'Good', term: 72, zip: '19103' });
  assert.equal(q.tax, 3200);
  assert.equal(q.registration, 753.5);
});

test('OH ZIP 44113 uses a combined state + local rate and labels the split', () => {
  const j = lookupJurisdiction('44113');
  assert.equal(j.state, 'OH');
  assert.equal(j.taxRate, 0.08);
  assert.equal(j.stateRate, 0.0575);
  assert.equal(j.localRate, 0.0225);
  assert.equal(j.taxSource, 'zip');
  assert.equal(taxLineLabel(j), 'Tax (OH 8%: state 5.75% + local 2.25%)');
});

test('a local-tax state without a ZIP row falls back to the state rate with an explicit label', () => {
  const j = lookupJurisdiction('90001'); // CA, no ZIP-level row in the bundled table
  assert.equal(j.state, 'CA');
  assert.equal(j.taxRate, 0.0725);
  assert.equal(j.localMayApply, true);
  assert.equal(taxLineLabel(j), 'Tax (CA 7.25%, state rate only; local tax may apply)');
});

