import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CURRENT_MODEL_YEAR,
  PROCESSING_FEE,
  buildQuote,
  maxTermForYear,
} from '../src/quote.js';
import {
  MIN_YEAR,
  MAX_YEAR,
  CUSTOM_QUOTE_PATH,
  CUSTOM_STORAGE_KEY,
  validateCustomVehicle,
  encodeCustomVehicle,
  parseCustomVehicle,
  parseCustomVehicleFromHash,
  customQuoteHash,
  customVehicleName,
  isCustomVehicle,
  writeCustomVehicle,
  readCustomVehicle,
} from '../src/custom-vehicle.js';

const sample = {
  year: 2024,
  make: 'Honda',
  model: 'Accord',
  trim: 'Sport',
  condition: 'Used',
  price: 22500,
  odometer: 32000,
  stock: 'CUST01',
  vin: '1HGCV1F34NA000001',
};

test('MAX_YEAR is CURRENT_MODEL_YEAR + 1 and MIN_YEAR is 1990', () => {
  assert.equal(MIN_YEAR, 1990);
  assert.equal(MAX_YEAR, CURRENT_MODEL_YEAR + 1);
});

test('validateCustomVehicle accepts a complete used vehicle and sets custom: true', () => {
  const { ok, vehicle, errors } = validateCustomVehicle(sample);
  assert.equal(ok, true);
  assert.deepEqual(errors, {});
  assert.equal(vehicle.custom, true);
  assert.equal(vehicle.name, '2024 Honda Accord Sport');
  assert.equal(vehicle.condition, 'Used');
  assert.equal(vehicle.price, 22500);
  assert.equal(vehicle.odometer, 32000);
  assert.equal(vehicle.photo, null);
  assert.equal(isCustomVehicle(vehicle), true);
});

test('encodeCustomVehicle / parseCustomVehicle round-trip, including optional fields', () => {
  const qs = encodeCustomVehicle(sample);
  const p = new URLSearchParams(qs);
  assert.equal(p.get('y'), '2024');
  assert.equal(p.get('mk'), 'Honda');
  assert.equal(p.get('md'), 'Accord');
  assert.equal(p.get('tr'), 'Sport');
  assert.equal(p.get('c'), 'Used');
  assert.equal(p.get('p'), '22500');
  assert.equal(p.get('mi'), '32000');
  assert.equal(p.get('st'), 'CUST01');
  assert.equal(p.get('vin'), '1HGCV1F34NA000001');
  const parsed = parseCustomVehicle(qs);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.vehicle.year, 2024);
  assert.equal(parsed.vehicle.make, 'Honda');
  assert.equal(parsed.vehicle.model, 'Accord');
  assert.equal(parsed.vehicle.trim, 'Sport');
  assert.equal(parsed.vehicle.condition, 'Used');
  assert.equal(parsed.vehicle.price, 22500);
  assert.equal(parsed.vehicle.odometer, 32000);
  assert.equal(parsed.vehicle.stock, 'CUST01');
  assert.equal(parsed.vehicle.vin, '1HGCV1F34NA000001');
  assert.equal(parsed.vehicle.custom, true);
  assert.equal(encodeCustomVehicle(parsed.vehicle), qs);
});

test('optional trim, mileage, stock and VIN can be omitted', () => {
  const { ok, vehicle } = validateCustomVehicle({
    year: 2025, make: 'Jeep', model: 'Compass', condition: 'New', price: 28995,
  });
  assert.equal(ok, true);
  assert.equal(vehicle.trim, '');
  assert.equal(vehicle.odometer, null);
  assert.equal(vehicle.stock, '');
  assert.equal(vehicle.vin, '');
  const qs = encodeCustomVehicle(vehicle);
  const p = new URLSearchParams(qs);
  assert.equal(p.has('tr'), false);
  assert.equal(p.has('mi'), false);
  assert.equal(p.has('st'), false);
  assert.equal(p.has('vin'), false);
  assert.equal(parseCustomVehicle(qs).ok, true);
});

test('year must be between 1990 and CURRENT_MODEL_YEAR + 1', () => {
  const goodLo = validateCustomVehicle({ ...sample, year: 1990 });
  const goodHi = validateCustomVehicle({ ...sample, year: MAX_YEAR });
  const badLo = validateCustomVehicle({ ...sample, year: 1989 });
  const badHi = validateCustomVehicle({ ...sample, year: MAX_YEAR + 1 });
  const missing = validateCustomVehicle({ ...sample, year: '' });
  assert.equal(goodLo.ok, true);
  assert.equal(goodHi.ok, true);
  assert.equal(badLo.ok, false);
  assert.ok(badLo.errors.year);
  assert.equal(badHi.ok, false);
  assert.ok(badHi.errors.year);
  assert.equal(missing.ok, false);
  assert.equal(encodeCustomVehicle({ ...sample, year: 1989 }), '');
});

test('price must be greater than 0', () => {
  assert.equal(validateCustomVehicle({ ...sample, price: 0 }).ok, false);
  assert.ok(validateCustomVehicle({ ...sample, price: 0 }).errors.price);
  assert.equal(validateCustomVehicle({ ...sample, price: -1 }).ok, false);
  assert.equal(validateCustomVehicle({ ...sample, price: 'abc' }).ok, false);
  assert.equal(validateCustomVehicle({ ...sample, price: 1 }).ok, true);
  assert.equal(validateCustomVehicle({ ...sample, price: '$22,500.50' }).vehicle.price, 22500.5);
});

test('make, model and condition are required; N/U normalize to New/Used', () => {
  assert.ok(validateCustomVehicle({ ...sample, make: '  ' }).errors.make);
  assert.ok(validateCustomVehicle({ ...sample, model: '' }).errors.model);
  assert.ok(validateCustomVehicle({ ...sample, condition: 'Lease' }).errors.condition);
  assert.equal(validateCustomVehicle({ ...sample, condition: 'N' }).vehicle.condition, 'New');
  assert.equal(validateCustomVehicle({ ...sample, condition: 'u' }).vehicle.condition, 'Used');
});

test('customQuoteHash builds #/c?... and keeps deal params separate from vehicle params', () => {
  const hash = customQuoteHash(sample, 'down=5000&tier=Excellent&term=72&mil=0');
  assert.match(hash, new RegExp(`^#/${CUSTOM_QUOTE_PATH}\\?`));
  const parsed = parseCustomVehicleFromHash(hash);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.vehicle.make, 'Honda');
  assert.equal(parsed.vehicle.price, 22500);
  const qs = hash.split('?')[1];
  const p = new URLSearchParams(qs);
  assert.equal(p.get('down'), '5000');
  assert.equal(p.get('tier'), 'Excellent');
  assert.equal(p.get('term'), '72');
  assert.equal(p.get('y'), '2024');
  // A stray vehicle key in the deal query cannot overwrite the vehicle.
  const hijack = customQuoteHash(sample, 'p=1&mk=Other&down=1000');
  const again = parseCustomVehicleFromHash(hijack);
  assert.equal(again.vehicle.price, 22500);
  assert.equal(again.vehicle.make, 'Honda');
  assert.equal(new URLSearchParams(hijack.split('?')[1]).get('down'), '1000');
});

test('parseCustomVehicleFromHash rejects a shop or inventory vehicle hash', () => {
  assert.equal(parseCustomVehicleFromHash('#/vehicle/TT173979').ok, false);
  assert.equal(parseCustomVehicleFromHash('#/').ok, false);
  assert.equal(parseCustomVehicleFromHash('#/c?y=1989&mk=Jeep&md=X&c=Used&p=1').ok, false);
});

test('sessionStorage write/read round-trips a valid vehicle and rejects junk', () => {
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
  };
  assert.equal(writeCustomVehicle(storage, sample), true);
  assert.ok(store.get(CUSTOM_STORAGE_KEY));
  const read = readCustomVehicle(storage);
  assert.equal(read.name, '2024 Honda Accord Sport');
  assert.equal(read.custom, true);
  storage.setItem(CUSTOM_STORAGE_KEY, '{"year":99}');
  assert.equal(readCustomVehicle(storage), null);
  assert.equal(writeCustomVehicle(storage, { ...sample, price: 0 }), false);
});

test('custom vehicle name omits empty trim', () => {
  assert.equal(customVehicleName({ year: 2025, make: 'Jeep', model: 'Compass' }), '2025 Jeep Compass');
  assert.equal(customVehicleName({ year: 2025, make: 'Jeep', model: 'Compass', trim: 'Limited' }), '2025 Jeep Compass Limited');
});

test('quote math on a custom vehicle matches inventory: fee, tax, term cap, new vs used, military on new only', () => {
  const used = validateCustomVehicle(sample).vehicle;
  const usedQuote = buildQuote({ vautoPrice: used.price, condition: used.condition, year: used.year, name: used.name, tier: 'Good', term: 72, down: 0 });
  const inventorySame = buildQuote({ vautoPrice: 22500, condition: 'Used', year: 2024, name: '2024 Honda Accord Sport', tier: 'Good', term: 72, down: 0 });
  assert.equal(usedQuote.totalSellingPrice, 22500 + PROCESSING_FEE);
  assert.equal(usedQuote.payment, inventorySame.payment);
  assert.equal(usedQuote.apr, inventorySame.apr);

  const old = validateCustomVehicle({ ...sample, year: 2015 }).vehicle;
  assert.equal(maxTermForYear(old.year), 60);
  const capped = buildQuote({ vautoPrice: old.price, condition: old.condition, year: old.year, term: 84, tier: 'Good' });
  assert.equal(capped.term, 60);

  const usedMil = buildQuote({ vautoPrice: used.price, condition: 'Used', year: used.year, military: true, tier: 'Good', term: 72 });
  const newMil = buildQuote({ vautoPrice: used.price, condition: 'New', year: used.year, military: true, tier: 'Good', term: 72 });
  assert.equal(usedMil.militaryRebate, 0);
  assert.equal(newMil.militaryRebate, 500);
  assert.ok(newMil.apr < usedMil.apr);
  assert.ok(newMil.payment < usedMil.payment);
});
