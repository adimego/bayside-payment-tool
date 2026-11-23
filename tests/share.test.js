import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SITE_URL,
  sharedQuoteUrl,
  customerFirstName,
  parseShareSlug,
  quoteDealSnapshot,
  quoteResultsSnapshot,
  dealParamsFromSnapshot,
  formatSavedDate,
} from '../src/share.js';

test('sharedQuoteUrl builds a hash link with an unguessable slug', () => {
  assert.equal(
    sharedQuoteUrl('aB3dE5fG7h'),
    'https://adimego.github.io/bayside-payment-tool/#/q/aB3dE5fG7h',
  );
  assert.equal(sharedQuoteUrl('a/b'), `${SITE_URL}/#/q/a%2Fb`);
  assert.equal(sharedQuoteUrl('  abc123xyz9  '), `${SITE_URL}/#/q/abc123xyz9`);
  assert.ok(sharedQuoteUrl('xY9kLm2pQ1').includes('/#/q/xY9kLm2pQ1'));
});

test('customerFirstName returns only the first word', () => {
  assert.equal(customerFirstName('Jordan Hale'), 'Jordan');
  assert.equal(customerFirstName('  Taylor  Ann  '), 'Taylor');
  assert.equal(customerFirstName(''), '');
});

test('parseShareSlug reads #/q/slug and ?q=', () => {
  assert.equal(parseShareSlug('#/q/aB3dE5fG7h'), 'aB3dE5fG7h');
  assert.equal(parseShareSlug('/q/aB3dE5fG7h'), 'aB3dE5fG7h');
  assert.equal(parseShareSlug('#/q/aB3dE5fG7h?x=1'), 'aB3dE5fG7h');
  assert.equal(parseShareSlug('#/', '?q=fromQuery'), 'fromQuery');
  assert.equal(parseShareSlug('#/shop?q=hashQuery'), 'hashQuery');
  assert.equal(parseShareSlug('#/vehicle/TT173979'), null);
  assert.equal(parseShareSlug(''), null);
});

test('dealParamsFromSnapshot can reopen a saved deal in the calculator', () => {
  const deal = quoteDealSnapshot({
    down: 3000,
    tradeValue: 5000,
    tradePayoff: 1000,
    tier: 'Good',
    term: 72,
    military: true,
    zip: '10001',
    taxOverride: null,
  });
  const qs = dealParamsFromSnapshot(deal);
  const p = new URLSearchParams(qs);
  assert.equal(p.get('down'), '3000');
  assert.equal(p.get('trade'), '5000');
  assert.equal(p.get('payoff'), '1000');
  assert.equal(p.get('tier'), 'Good');
  assert.equal(p.get('term'), '72');
  assert.equal(p.get('mil'), '1');
  assert.equal(p.get('zip'), '10001');
  assert.equal(p.has('tax'), false);
});

test('quoteResultsSnapshot keeps the display fields and drops nothing required for a saved quote', () => {
  const snap = quoteResultsSnapshot({
    totalSellingPrice: 25750,
    tax: 2311.06,
    taxLabel: 'Tax (NY 8.975%: NY 8.875% + VA business 0.10%)',
    registration: 753.5,
    outTheDoor: 28814.56,
    amountFinanced: 28814.56,
    payment: 548.46,
    apr: 11,
    term: 72,
    tier: 'Good',
    down: 0,
    tradeEquity: 0,
    disclaimers: ['Rates are subject to credit approval.'],
  });
  assert.equal(snap.outTheDoor, 28814.56);
  assert.equal(snap.payment, 548.46);
  assert.equal(snap.apr, 11);
  assert.equal(snap.taxLabel.startsWith('Tax (NY'), true);
});

test('formatSavedDate prints a US date in America/New_York', () => {
  assert.equal(formatSavedDate('2026-11-19T18:00:00Z'), 'Nov 19, 2026');
});
