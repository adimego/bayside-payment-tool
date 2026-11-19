import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DOWN_CHIPS, normalizeDown, normalizeTier, normalizeTerm, shortTaxLabel, zipSummary, dealSummary, shopHintText } from '../src/deal.js';
import { setTaxTable, lookupJurisdiction, applyZipToDeal } from '../src/tax.js';
import { buildQuote } from '../src/quote.js';

setTaxTable(JSON.parse(readFileSync(new URL('../data/tax-rates.json', import.meta.url))));

test('down payment input is normalized to whole, non-negative dollars', () => {
  assert.equal(normalizeDown('$2,500'), 2500);
  assert.equal(normalizeDown('1000.6'), 1001);
  assert.equal(normalizeDown(''), 0);
  assert.equal(normalizeDown('abc'), 0);
  assert.equal(normalizeDown('-500'), 500); // minus sign is stripped like other money fields
  assert.equal(normalizeDown('99999999'), 1_000_000);
  assert.deepEqual(DOWN_CHIPS, [0, 1000, 2500, 5000]);
});

test('tier and term fall back to defaults when unknown', () => {
  assert.equal(normalizeTier('Excellent'), 'Excellent');
  assert.equal(normalizeTier('Amazing'), 'Good');
  assert.equal(normalizeTerm('84'), 84);
  assert.equal(normalizeTerm(30), 72);
});

test('summary row shows credit, down, term and where tax comes from', () => {
  assert.equal(dealSummary({ tier: 'Good', down: 0, term: 72, zip: '' }, lookupJurisdiction('')), 'Good credit · $0 down · 72 mo · VA tax');
  assert.equal(dealSummary({ tier: 'Excellent', down: 5000, term: 60, zip: '20601' }, lookupJurisdiction('20601')), 'Excellent credit · $5,000 down · 60 mo · ZIP 20601 (MD)');
  assert.equal(dealSummary({ tier: 'Fair', down: 0, term: 72, tradeValue: 8000 }, lookupJurisdiction('22485')), 'Fair credit · $0 down · 72 mo · $8,000 trade · ZIP 22485 (VA)');
  assert.equal(zipSummary(lookupJurisdiction('206')), 'VA tax'); // partial ZIP while typing
  assert.equal(zipSummary(lookupJurisdiction('20601', { taxOverride: 0.07 })), 'ZIP 20601 (MD) · 7% tax');
});

test('short tax label shows the state rate plus the VA 0.10% business tax', () => {
  assert.equal(shortTaxLabel(lookupJurisdiction('')), 'VA 4.25%');
  assert.equal(shortTaxLabel(lookupJurisdiction('20601')), 'MD 6.50% + VA 0.10%');
  assert.equal(shortTaxLabel(lookupJurisdiction('10001')), 'NY 8.875% + VA 0.10%');
});

test('shop hint reflects the live settings and out-of-state registration', () => {
  const va = shopHintText({ tier: 'Great', down: 2500, term: 60 }, lookupJurisdiction(''), 995);
  assert.match(va, /Great credit, 60 months, \$2,500 down/);
  assert.match(va, /VA 4\.25% tax, \$153\.50 registration/);
  const md = shopHintText({ tier: 'Good', down: 0, term: 72, zip: '20601' }, lookupJurisdiction('20601'), 995);
  assert.match(md, /MD 6\.50% \+ VA 0\.10% tax, \$753\.50 out-of-state registration \(ZIP 20601\)/);
  const ca = shopHintText({ tier: 'Good', down: 0, term: 72, zip: '90210' }, lookupJurisdiction('90210'), 995);
  assert.match(ca, /local tax may apply/);
});

test('quick deal changes move a card payment the way the vehicle page would', () => {
  const car = { vautoPrice: 30000, condition: 'Used', year: 2023 };
  const d = { down: 0, tradeValue: 0, tradePayoff: 0, tier: 'Good', term: 72, military: false, zip: '', taxOverride: null };
  const good = buildQuote({ ...d, ...car }).payment;
  const excellent = buildQuote({ ...d, ...car, tier: 'Excellent' }).payment;
  const down = buildQuote({ ...d, ...car, tier: 'Excellent', down: 5000 }).payment;
  assert.ok(excellent < good && down < excellent);
  const md = { ...d };
  applyZipToDeal(md, '20601');
  const mdPay = buildQuote({ ...md, ...car }).payment;
  assert.ok(mdPay > good, 'MD tax + $753.50 registration costs more than VA');
});
