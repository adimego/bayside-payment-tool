import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setTaxTable, lookupJurisdiction, taxLineLabel, applyZipToDeal, applyTaxPercentToDeal, isTaxOverride, VA_TAX_RATE, VA_BUSINESS_TAX_RATE, VA_REGISTRATION, OUT_OF_STATE_REGISTRATION } from '../src/tax.js';
import { buildQuote, maxVautoPriceForPayment } from '../src/quote.js';

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

test('MD ZIP 20601 uses 6.60% (6.50% titling excise + 0.10% VA business tax) and $753.50 registration', () => {
  const j = lookupJurisdiction('20601');
  assert.equal(j.status, 'ok');
  assert.equal(j.state, 'MD');
  assert.equal(j.baseTaxRate, 0.065);
  assert.equal(j.vaBusinessRate, VA_BUSINESS_TAX_RATE);
  assert.equal(j.taxRate, 0.066);
  assert.equal(j.registration, OUT_OF_STATE_REGISTRATION);
  assert.equal(j.outOfState, true);
  assert.equal(j.taxSource, 'vehicle');
  assert.equal(j.taxName, 'titling excise tax');
  assert.equal(taxLineLabel(j), 'Tax (MD 6.60%: MD 6.50% + VA business 0.10%)');
  // TSP $40,000 × 6.6% = $2,640; OTD = 40,000 + 2,640 + 753.50
  const q = buildQuote({ vautoPrice: 39005, tier: 'Good', term: 72, zip: '20601' });
  assert.equal(q.tax, 2640);
  assert.equal(q.registration, 753.5);
  assert.equal(q.outTheDoor, 43393.5);
  assert.equal(q.taxLabel, 'Tax (MD 6.60%: MD 6.50% + VA business 0.10%)');
  assert.ok(q.disclaimers.some((t) => t.includes('Out-of-state tax and registration are estimates')));
});

test('DC ZIP 20001 uses a mid-range 6.00% excise estimate and $753.50 registration', () => {
  const j = lookupJurisdiction('20001');
  assert.equal(j.status, 'ok');
  assert.equal(j.state, 'DC');
  assert.equal(j.baseTaxRate, 0.06);
  assert.equal(j.taxRate, 0.061);
  assert.equal(j.vaBusinessRate, VA_BUSINESS_TAX_RATE);
  assert.equal(j.unmodeled, true);
  assert.equal(j.registration, OUT_OF_STATE_REGISTRATION);
  assert.equal(taxLineLabel(j), 'Tax (DC 6.10% est.: DC 6% + VA business 0.10%)');
  const q = buildQuote({ vautoPrice: 39005, tier: 'Good', term: 72, zip: '20001-1234' });
  assert.equal(q.taxState, 'DC');
  assert.equal(q.tax, 2440);
  assert.equal(q.registration, 753.5);
  assert.equal(q.taxLabel, 'Tax (DC 6.10% est.: DC 6% + VA business 0.10%)');
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
  assert.equal(j.vaBusinessRate, 0);
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
  assert.equal(j.taxRate, 0.066);
  assert.equal(j.baseTaxRate, 0.065);
  assert.equal(j.taxSource, 'vehicle');
  const d = { down: 0, tradeValue: 0, tradePayoff: 0, tier: 'Good', term: 72, military: false, zip: '20601', taxOverride: null };
  const q = buildQuote({ ...d, vautoPrice: 39005 });
  assert.equal(q.tax, 2640);
  assert.equal(q.taxLabel, 'Tax (MD 6.60%: MD 6.50% + VA business 0.10%)');
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
  assert.equal(md.taxRate, 0.066);
  assert.equal(md.baseTaxRate, 0.065);
  assert.equal(md.vaBusinessRate, VA_BUSINESS_TAX_RATE);
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
  assert.equal(j.vaBusinessRate, 0);
  assert.equal(j.taxSource, 'override');
  assert.equal(j.registration, OUT_OF_STATE_REGISTRATION);
  const cleared = applyTaxPercentToDeal(d, '');
  assert.equal(d.taxOverride, null);
  assert.equal(cleared.taxRate, 0.066);
});

test('NC ZIP uses the 3% highway use tax, not the general combined sales rate', () => {
  const j = lookupJurisdiction('28202');
  assert.equal(j.state, 'NC');
  assert.equal(j.baseTaxRate, 0.03);
  assert.equal(j.taxRate, 0.031);
  assert.equal(j.taxSource, 'vehicle');
  assert.equal(j.taxName, 'highway use tax');
  // A $2,000 cap exists only for commercial/RV titles and is not applied here.
  assert.equal(j.taxCap, null);
  const q = buildQuote({ vautoPrice: 39005, tier: 'Good', term: 72, zip: '28202' });
  assert.equal(q.tax, 1240); // TSP $40,000 × 3.10%
  assert.equal(q.taxLabel, 'Tax (NC 3.10%: NC 3% + VA business 0.10%)');
});

test('SC ZIP caps the 5% infrastructure maintenance fee at $500 and adds 0.10% VA business tax uncapped', () => {
  const j = lookupJurisdiction('29201');
  assert.equal(j.state, 'SC');
  assert.equal(j.baseTaxRate, 0.05);
  assert.equal(j.vaBusinessRate, VA_BUSINESS_TAX_RATE);
  assert.equal(j.taxRate, 0.051);
  assert.equal(j.taxCap, 500);
  assert.equal(taxLineLabel(j), 'Tax (SC 5% capped at $500.00 + VA business 0.10%)');
  const q = buildQuote({ vautoPrice: 39005, tier: 'Good', term: 72, zip: '29201' });
  assert.equal(q.tax, 540); // $500 SC cap + $40,000 × 0.10%
  assert.equal(q.registration, 753.5);
  assert.equal(q.outTheDoor, 41293.5);
  assert.equal(q.taxLabel, 'Tax (SC 5% capped at $500.00 + VA business 0.10%)');
});

test('NYC ZIP 10001 uses 8.975% (8.875% NY combined + 0.10% VA business tax)', () => {
  const j = lookupJurisdiction('10001');
  assert.equal(j.state, 'NY');
  assert.equal(j.baseTaxRate, 0.08875);
  assert.equal(j.vaBusinessRate, VA_BUSINESS_TAX_RATE);
  assert.equal(j.taxRate, 0.08975);
  assert.equal(j.stateRate, 0.04);
  assert.equal(j.localRate, 0.04875);
  assert.equal(j.taxSource, 'zip');
  assert.equal(j.localMayApply, false);
  assert.equal(taxLineLabel(j), 'Tax (NY 8.975%: NY 8.875% + VA business 0.10%)');
  const q = buildQuote({ vautoPrice: 39005, tier: 'Good', term: 72, zip: '10001' });
  assert.equal(q.tax, 3590); // TSP $40,000 × 8.975%
  assert.equal(q.registration, 753.5);
  assert.equal(q.outTheDoor, 44343.5);
  assert.equal(q.taxLabel, 'Tax (NY 8.975%: NY 8.875% + VA business 0.10%)');
});

test('upstate NY ZIP 12866 (Saratoga Springs) uses 7% combined (4% state + 3% local)', () => {
  const j = lookupJurisdiction('12866');
  assert.equal(j.state, 'NY');
  assert.equal(j.baseTaxRate, 0.07);
  assert.equal(j.taxRate, 0.071);
  assert.equal(j.stateRate, 0.04);
  assert.equal(j.localRate, 0.03);
  assert.equal(taxLineLabel(j), 'Tax (NY 7.10%: NY 7% + VA business 0.10%)');
  const q = buildQuote({ vautoPrice: 39005, tier: 'Good', term: 72, zip: '12866' });
  assert.equal(q.tax, 2840); // TSP $40,000 × 7.10%
  assert.equal(q.registration, 753.5);
});

test('PA Philadelphia ZIP 19103 uses 8% (6% state + 2% local)', () => {
  const j = lookupJurisdiction('19103');
  assert.equal(j.state, 'PA');
  assert.equal(j.baseTaxRate, 0.08);
  assert.equal(j.taxRate, 0.081);
  assert.equal(j.stateRate, 0.06);
  assert.equal(j.localRate, 0.02);
  assert.equal(taxLineLabel(j), 'Tax (PA 8.10%: PA 8% + VA business 0.10%)');
  const q = buildQuote({ vautoPrice: 39005, tier: 'Good', term: 72, zip: '19103' });
  assert.equal(q.tax, 3240);
  assert.equal(q.registration, 753.5);
});

test('OH ZIP 44113 uses a combined state + local rate and labels the split', () => {
  const j = lookupJurisdiction('44113');
  assert.equal(j.state, 'OH');
  assert.equal(j.baseTaxRate, 0.08);
  assert.equal(j.taxRate, 0.081);
  assert.equal(j.stateRate, 0.0575);
  assert.equal(j.localRate, 0.0225);
  assert.equal(j.taxSource, 'zip');
  assert.equal(taxLineLabel(j), 'Tax (OH 8.10%: OH 8% + VA business 0.10%)');
});

test('a local-tax state without a ZIP row falls back to the state rate with an explicit label', () => {
  const j = lookupJurisdiction('90001'); // CA, no ZIP-level row in the bundled table
  assert.equal(j.state, 'CA');
  assert.equal(j.baseTaxRate, 0.0725);
  assert.equal(j.taxRate, 0.0735);
  assert.equal(j.localMayApply, true);
  assert.equal(taxLineLabel(j), 'Tax (CA 7.35%: CA 7.25% + VA business 0.10%, state rate only; local tax may apply)');
});

test('VA and no-credit states tax the full TSP even when a trade value is entered', () => {
  const va = buildQuote({ vautoPrice: 39005, tradeValue: 10000, tradePayoff: 2000, tier: 'Good', term: 72, zip: '22485' });
  assert.equal(va.tax, 1700);
  assert.equal(va.tradeTaxCredit, 0);
  assert.equal(va.taxableAmount, 40000);
  assert.equal(va.taxableLabel, '');

  const ca = buildQuote({ vautoPrice: 39005, tradeValue: 10000, tier: 'Good', term: 72, zip: '90001' });
  assert.equal(ca.tax, 2940); // 7.25% + 0.10% of full $40,000
  assert.equal(ca.tradeTaxCredit, 0);
  assert.equal(ca.taxableLabel, '');

  const dc = buildQuote({ vautoPrice: 39005, tradeValue: 10000, tier: 'Good', term: 72, zip: '20001' });
  assert.equal(dc.tax, 2440); // 6.10% of full $40,000
  assert.equal(dc.tradeTaxCredit, 0);

  const hi = buildQuote({ vautoPrice: 39005, tradeValue: 10000, tier: 'Good', term: 72, zip: '96813' });
  assert.equal(hi.tax, 1840); // 4.50% + 0.10% of full $40,000
  assert.equal(hi.tradeTaxCredit, 0);
});

test('MD, NY and PA apply a full trade-in credit to the state portion and 0.10% VA business tax on the full TSP', () => {
  const md = buildQuote({ vautoPrice: 39005, tradeValue: 10000, tradePayoff: 99999, tier: 'Good', term: 72, zip: '20601' });
  // State tax $30,000 × 6.50% = $1,950; VA business $40,000 × 0.10% = $40; payoff does not change tax
  assert.equal(md.tax, 1990);
  assert.equal(md.taxableAmount, 30000);
  assert.equal(md.tradeTaxCredit, 10000);
  assert.equal(md.taxableLabel, 'Taxable amount $30,000.00 (trade credit applied)');
  assert.equal(md.taxLabel, 'Tax (MD 6.60%: MD 6.50% + VA business 0.10%)');

  const ny = buildQuote({ vautoPrice: 39005, tradeValue: 10000, tier: 'Good', term: 72, zip: '10001' });
  // $30,000 × 8.875% = $2,662.50 + $40 = $2,702.50
  assert.equal(ny.tax, 2702.5);
  assert.equal(ny.taxableAmount, 30000);
  assert.equal(ny.taxableLabel, 'Taxable amount $30,000.00 (trade credit applied)');

  const pa = buildQuote({ vautoPrice: 39005, tradeValue: 10000, tier: 'Good', term: 72, zip: '19103' });
  // $30,000 × 8% = $2,400 + $40 = $2,440
  assert.equal(pa.tax, 2440);
  assert.equal(pa.taxableAmount, 30000);
});

test('Michigan caps the 2026 trade-in credit at $12,000', () => {
  const j = lookupJurisdiction('48201');
  assert.equal(j.state, 'MI');
  assert.equal(j.tradeCredit, 'capped');
  assert.equal(j.tradeCreditCap, 12000);
  const over = buildQuote({ vautoPrice: 39005, tradeValue: 15000, tier: 'Good', term: 72, zip: '48201' });
  // Taxable $28,000 × 6% = $1,680 + $40 = $1,720
  assert.equal(over.tax, 1720);
  assert.equal(over.taxableAmount, 28000);
  assert.equal(over.tradeTaxCredit, 12000);
  assert.equal(over.taxableLabel, 'Taxable amount $28,000.00 (trade credit applied, MI cap $12,000.00)');
  const under = buildQuote({ vautoPrice: 39005, tradeValue: 5000, tier: 'Good', term: 72, zip: '48201' });
  // Taxable $35,000 × 6% = $2,100 + $40 = $2,140
  assert.equal(under.tax, 2140);
  assert.equal(under.tradeTaxCredit, 5000);
});

test('Oklahoma charges 3.25% excise on the full TSP and 1.25% sales tax on the price minus trade-in', () => {
  const j = lookupJurisdiction('73102');
  assert.equal(j.state, 'OK');
  assert.equal(j.tradeCredit, 'split');
  const q = buildQuote({ vautoPrice: 39005, tradeValue: 10000, tier: 'Good', term: 72, zip: '73102' });
  // $40,000 × 3.25% + $30,000 × 1.25% + $40 = $1,300 + $375 + $40 = $1,715
  assert.equal(q.tax, 1715);
  assert.equal(q.taxableAmount, 30000);
  assert.match(q.taxableLabel, /trade credit on 1.25% OK sales tax; 3.25% excise on full price/);
});

test('Ohio allows a trade-in credit on new vehicles only', () => {
  const neu = buildQuote({ vautoPrice: 39005, tradeValue: 10000, tier: 'Good', term: 72, zip: '44113', condition: 'New' });
  assert.equal(neu.tax, 2440); // $30,000 × 8% + $40
  assert.equal(neu.tradeTaxCredit, 10000);
  const used = buildQuote({ vautoPrice: 39005, tradeValue: 10000, tier: 'Good', term: 72, zip: '44113', condition: 'Used' });
  assert.equal(used.tax, 3240); // full $40,000 × 8% + $40
  assert.equal(used.tradeTaxCredit, 0);
  assert.equal(used.taxableLabel, '');
});

test('South Carolina applies the $500 cap after the trade-in credit, and still adds 0.10% on the full TSP', () => {
  const capped = buildQuote({ vautoPrice: 39005, tradeValue: 10000, tier: 'Good', term: 72, zip: '29201' });
  assert.equal(capped.tax, 540); // min($30,000 × 5%, $500) + $40
  const small = buildQuote({ vautoPrice: 5005, tradeValue: 2000, tier: 'Good', term: 72, zip: '29201' });
  // TSP $6,000; taxable $4,000 × 5% = $200 + $6 = $206
  assert.equal(small.tax, 206);
  assert.equal(small.taxableAmount, 4000);
  assert.equal(small.taxableLabel, 'Taxable amount $4,000.00 (trade credit applied)');
});

test('a manual tax override uses the state’s taxable base and is not increased by 0.10%', () => {
  const q = buildQuote({ vautoPrice: 39005, tradeValue: 10000, tier: 'Good', term: 72, zip: '10001', taxOverride: 0.07 });
  assert.equal(q.tax, 2100); // 7% of $30,000, no VA business tax added
  assert.equal(q.taxableAmount, 30000);
  assert.equal(q.taxLabel, 'Tax (NY 7.00%)');
  const ca = buildQuote({ vautoPrice: 39005, tradeValue: 10000, tier: 'Good', term: 72, zip: '90001', taxOverride: 0.07 });
  assert.equal(ca.tax, 2800); // no-credit state: 7% of full $40,000
});

test('Find-by-payment inversion still fits the goal when a trade credit reduces tax', () => {
  const goal = { payment: 700, zip: '10001', tradeValue: 10000, tradePayoff: 0, down: 0, tier: 'Good', term: 72, condition: 'New' };
  const maxP = maxVautoPriceForPayment(goal);
  const fit = buildQuote({ ...goal, vautoPrice: maxP });
  const over = buildQuote({ ...goal, vautoPrice: maxP + 2 });
  assert.ok(fit.payment <= 700, `fit payment ${fit.payment} should be <= 700`);
  assert.ok(over.payment > 700, `over payment ${over.payment} should be > 700`);
});
