import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { normalizeVautoRows, cleanPhotoUrl } from '../src/vauto-parse.js';
import { vehiclePhoto, vehiclePhotoHtml } from '../src/inventory.js';
import { quoteVehicleSnapshot } from '../src/share.js';

test('photo column aliases are read and kept', () => {
  for (const h of ['Photo URL', 'Photo Thumbnail', 'Primary Photo', 'primary photo url', 'Image URL']) {
    const { vehicles } = normalizeVautoRows([
      ['Stock #', 'Vehicle', 'Body', 'Price', h],
      ['AB12345', '2026 Jeep Wrangler Sport', '2D Sport Utility', '$40,000', 'https://pictures.example.com/AB12345.jpg'],
    ]);
    assert.equal(vehicles[0].photo, 'https://pictures.example.com/AB12345.jpg', h);
  }
});

test('reports without a photo column add no photo field', () => {
  const { vehicles } = normalizeVautoRows([
    ['Stock #', 'Vehicle', 'Body', 'Price'],
    ['AB12345', '2026 Jeep Wrangler Sport', '2D Sport Utility', '$40,000'],
  ]);
  assert.equal('photo' in vehicles[0], false);
});

test('cleanPhotoUrl allows https and local thumbs only', () => {
  assert.equal(cleanPhotoUrl('assets/thumbs/VG406032.jpg'), 'assets/thumbs/VG406032.jpg');
  assert.equal(cleanPhotoUrl('http://x.example.com/a.jpg'), 'https://x.example.com/a.jpg');
  assert.equal(cleanPhotoUrl('javascript:alert(1)'), null);
  assert.equal(cleanPhotoUrl('https://x.example.com/a.jpg" onerror="x'), null);
  assert.equal(cleanPhotoUrl('../secret.jpg'), null);
  assert.equal(cleanPhotoUrl(''), null);
  assert.equal(cleanPhotoUrl(null), null);
});

test('photo markup: lazy img with alt, or a placeholder with make and model', () => {
  const withPhoto = vehiclePhotoHtml({ name: '2027 Ram 2500 Laramie', photo: 'assets/thumbs/VG406032.jpg' });
  assert.match(withPhoto, /<img src="assets\/thumbs\/VG406032\.jpg" alt="2027 Ram 2500 Laramie"/);
  assert.match(withPhoto, /loading="lazy"/);
  assert.match(vehiclePhotoHtml({ name: 'X', photo: 'assets/thumbs/A1.jpg' }, { eager: true }), /loading="eager"/);
  const none = vehiclePhotoHtml({ name: '2019 Volvo XC90 T6 <b>', make: 'Volvo', model: 'XC90' });
  assert.match(none, /no-photo/);
  assert.match(none, /Volvo XC90/);
  assert.doesNotMatch(none, /<b>/);
  assert.match(vehiclePhotoHtml({ name: 'X', photo: 'javascript:alert(1)' }), /no-photo/);
  assert.equal(vehiclePhoto({}), null);
});

test('saved quote snapshot carries only a safe photo path', () => {
  assert.equal(quoteVehicleSnapshot({ stock: 'A1', photo: 'assets/thumbs/A1.jpg' }).photo, 'assets/thumbs/A1.jpg');
  assert.equal(quoteVehicleSnapshot({ stock: 'A1', photo: 'data:text/html,hi' }).photo, null);
  assert.equal(quoteVehicleSnapshot({ stock: 'A1' }).photo, null);
});

test('every inventory photo points at a thumbnail file that exists', () => {
  const inv = JSON.parse(readFileSync(new URL('../data/inventory.json', import.meta.url)));
  const withPhoto = inv.vehicles.filter((v) => v.photo);
  assert.ok(withPhoto.length > 100);
  for (const v of withPhoto) {
    assert.equal(v.photo, `assets/thumbs/${v.stock}.jpg`);
    assert.ok(existsSync(new URL(`../${v.photo}`, import.meta.url)), v.photo);
  }
});
