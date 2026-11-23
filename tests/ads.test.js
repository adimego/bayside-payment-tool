import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import {
  interleaveAds, AD_INTERVAL, AD_OPEN_LABEL, ADS, gridAds, quoteAds,
  adCardHtml, adDetailHtml, adTeaser, findAd,
} from '../src/ads.js';

const vehicles = (n) => Array.from({ length: n }, (_, i) => ({ stock: 'V' + (i + 1) }));

test('interleave inserts an ad after every N vehicles and does not count ads as vehicles', () => {
  const ads = [{ id: 'a' }, { id: 'b' }];
  const rows = interleaveAds(vehicles(13), ads, { interval: 6 });
  const onlyVehicles = rows.filter((r) => r.kind === 'vehicle');
  const onlyAds = rows.filter((r) => r.kind === 'ad');
  assert.equal(onlyVehicles.length, 13);
  assert.equal(onlyVehicles.map((r) => r.vehicle.stock).join(','), vehicles(13).map((v) => v.stock).join(','));
  assert.equal(onlyAds.length, 2); // after the 6th and 12th, not the 13th
  assert.equal(rows[6].kind, 'ad');
  assert.equal(rows[6].ad.id, 'a');
  assert.equal(rows[13].kind, 'ad');
  assert.equal(rows[13].ad.id, 'b');
  assert.equal(AD_INTERVAL, 6);
});

test('interleave rotates ads and leaves short or empty lists without ads', () => {
  const ads = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(interleaveAds([], ads), []);
  const short = interleaveAds(vehicles(5), ads, { interval: 6 });
  assert.equal(short.length, 5);
  assert.ok(short.every((r) => r.kind === 'vehicle'));
  const none = interleaveAds(vehicles(8), [], { interval: 6 });
  assert.equal(none.length, 8);
  assert.ok(none.every((r) => r.kind === 'vehicle'));
  const six = interleaveAds(vehicles(12), ads, { interval: 6 });
  assert.equal(six.filter((r) => r.kind === 'ad').map((r) => r.ad.id).join(','), 'a,b');
  const offset = interleaveAds(vehicles(12), ads, { interval: 6, offset: 1 });
  assert.equal(offset.filter((r) => r.kind === 'ad').map((r) => r.ad.id).join(','), 'b,a');
});

test('catalog includes Zurich Shield and Bayside Maintenance for the grid and quote page', () => {
  const ids = ADS.map((a) => a.id);
  assert.deepEqual(ids, ['zurich-shield', 'bayside-maintenance']);
  assert.equal(gridAds().length, 2);
  assert.equal(quoteAds().length, 2);
  const zurich = findAd('zurich-shield');
  assert.equal(zurich.url, 'https://www.zurichshield.com/');
  assert.equal(zurich.cta, 'Learn more');
  assert.match(zurich.ask, /Ask us about Zurich Shield/);
  assert.equal(zurich.headline, 'Protection for the road ahead');
  assert.ok(existsSync(new URL('../' + zurich.logo, import.meta.url)));
  const maint = findAd('bayside-maintenance');
  assert.equal(maint.cta, 'Ask about plans');
  assert.match(maint.url, /^https:\/\/www\.baysidecdjrva\.com\//);
  assert.match(maint.headline, /Maintenance made easy/i);
  assert.match(adTeaser(zurich), /harmful elements and stains/i);
  assert.match(adTeaser(maint), /oil change and tire rotation plans at Bayside/i);
});

test('compact cards show a teaser and Learn more; the dialog has benefits, ask line, and the external CTA', () => {
  const zurich = findAd('zurich-shield');
  const maint = findAd('bayside-maintenance');
  const card = adCardHtml(zurich) + adCardHtml(maint, { variant: 'quote' });
  assert.match(card, /data-ad="zurich-shield"/);
  assert.match(card, /data-ad="bayside-maintenance"/);
  assert.match(card, /class="ad-thumb"/);
  assert.match(card, /class="ad-teaser"/);
  assert.equal([...card.matchAll(/data-ad-open/g)].length, 2);
  assert.match(card, new RegExp(`aria-haspopup="dialog"[^>]*>${AD_OPEN_LABEL}<`));
  assert.doesNotMatch(card, /ad-benefits/);
  assert.doesNotMatch(card, /Ask us about Zurich Shield/);
  assert.doesNotMatch(card, /target="_blank"/);
  assert.doesNotMatch(card, /\$\d/);

  const detail = adDetailHtml(zurich) + adDetailHtml(maint);
  assert.match(detail, /ad-benefits/);
  assert.match(detail, /Ask us about Zurich Shield/);
  assert.match(detail, /Ask us about Bayside Maintenance/);
  assert.match(detail, /href="https:\/\/www\.zurichshield\.com\/"/);
  assert.match(detail, /Ask about plans/);
  assert.match(detail, /target="_blank"/);
  assert.match(detail, /rel="noopener"/);
  assert.doesNotMatch(detail, /\$\d/);
});
