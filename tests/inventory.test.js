import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readXlsxRows } from '../scripts/lib/xlsx.mjs';
import { normalizeVautoRows, parseVehicleName, vehicleTypeFromBody, parseCsv } from '../src/vauto-parse.js';
import { websiteUrl, similarVehicles, findByPaymentGoal, searchInventory } from '../src/inventory.js';
import { maxVautoPriceForPayment } from '../src/quote.js';

const rows = readXlsxRows(readFileSync(new URL('./fixtures/vauto-sample.xlsx', import.meta.url)));
const { vehicles, warnings } = normalizeVautoRows(rows);

test('sample vAuto report parses: 144 vehicles, 99 new / 45 used', () => {
  assert.equal(vehicles.length, 144);
  assert.equal(vehicles.filter((v) => v.condition === 'New').length, 99);
  assert.equal(vehicles.filter((v) => v.condition === 'Used').length, 45);
  assert.deepEqual(warnings, []);
});

test('body -> type counts match the plan (SUV 79, Truck 47, Car 11, Van 7)', () => {
  const c = {};
  for (const v of vehicles) c[v.type] = (c[v.type] || 0) + 1;
  assert.deepEqual(c, { Truck: 47, Car: 11, SUV: 79, Van: 7 });
  assert.equal(vehicleTypeFromBody('4D Double Cab'), 'Truck');
  assert.equal(vehicleTypeFromBody('2D Sport Utility'), 'SUV');
  assert.equal(vehicleTypeFromBody('4D Hatchback'), 'Car');
  assert.equal(vehicleTypeFromBody('4D Passenger Van'), 'Van');
});

test('missing price becomes null (Call for Price)', () => {
  const ram = vehicles.find((v) => v.stock === 'VG406032');
  assert.equal(ram.name, '2027 Ram 2500 Laramie');
  assert.equal(ram.price, null);
  assert.equal(vehicles.filter((v) => v.price == null).length, 1);
});

test('vehicle names split into year / make / model / trim', () => {
  assert.deepEqual(parseVehicleName('2026 Jeep Grand Cherokee L Laredo Altitude'), { year: 2026, make: 'Jeep', model: 'Grand Cherokee L', trim: 'Laredo Altitude' });
  assert.deepEqual(parseVehicleName('2024 BMW 3 Series 330i'), { year: 2024, make: 'BMW', model: '3 Series', trim: '330i' });
  assert.deepEqual(parseVehicleName('2026 Jeep Cherokee'), { year: 2026, make: 'Jeep', model: 'Cherokee', trim: '' });
});

test('CSV version of the report parses the same way', () => {
  const csv = 'Stock #,Vehicle,Certified,VIN,New/Used,Odometer,Body,Color,"Interior\nColor",Price\n'
    + 'ABC1,"2025 Ram 1500 Rebel",,1C6XXX,N,,4D Crew Cab,Red,Black,"$51,005"\n';
  const { vehicles: v } = normalizeVautoRows(parseCsv(csv));
  assert.equal(v.length, 1);
  assert.equal(v[0].price, 51005);
  assert.equal(v[0].interiorColor, 'Black');
  assert.equal(v[0].type, 'Truck');
});

test('website link searches by stock number', () => {
  assert.equal(websiteUrl('VR623278'), 'https://www.baysidecdjrva.com/all-inventory/index.htm?search=VR623278');
});

test('similar vehicles: same type, within 15%, same make first', () => {
  const v = vehicles.find((x) => x.stock === 'VR623278'); // 2027 Dodge Charger R/T Plus, $60,795
  const sims = similarVehicles(v, vehicles);
  assert.ok(sims.length > 0);
  for (const s of sims) {
    assert.equal(s.type, v.type);
    assert.ok(Math.abs(s.price - v.price) <= v.price * 0.15);
    assert.notEqual(s.stock, v.stock);
  }
  assert.equal(sims[0].make, 'Dodge');
});

test('payment-goal finder returns only fitting vehicles of the chosen type, closest first', () => {
  const goal = { payment: 700, type: 'SUV', down: 3000, tradeValue: 0, tradePayoff: 0, tier: 'Good', term: 72, military: false };
  const { maxPrice, matches } = findByPaymentGoal(vehicles, goal);
  assert.ok(maxPrice > 0 && matches.length > 0);
  for (const m of matches) {
    assert.equal(m.vehicle.type, 'SUV');
    assert.ok(m.vehicle.price <= maxPrice);
    assert.ok(m.quote.payment <= 700);
  }
  for (let i = 1; i < matches.length; i++) assert.ok(matches[i].gap >= matches[i - 1].gap);
});

test('search filters by text, type and condition', () => {
  const r = searchInventory(vehicles, { text: 'wrangler', type: 'SUV', condition: 'New' });
  assert.ok(r.length > 0);
  assert.ok(r.every((v) => /wrangler/i.test(v.name) && v.condition === 'New'));
});

test('findByPaymentGoal uses each vehicle\'s own cap and new/used rate', () => {
  const goal = { payment: 400, down: 0, tier: 'Good', term: 84, military: false, type: 'SUV' };
  const max84used = maxVautoPriceForPayment({ ...goal, condition: 'Used' });
  const max60used = maxVautoPriceForPayment({ ...goal, condition: 'Used', year: 2016 });
  assert.ok(max84used > max60used);
  const mid = Math.floor((max84used + max60used) / 2);
  const list = [
    { stock: 'OLD', name: '2016 Jeep Test', year: 2016, price: mid, condition: 'Used', type: 'SUV' },
    { stock: 'NEW', name: '2026 Jeep Test', year: 2026, price: mid, condition: 'New', type: 'SUV' },
  ];
  const { matches } = findByPaymentGoal(list, goal);
  assert.equal(matches.some((m) => m.vehicle.stock === 'OLD'), false);
  const neu = matches.find((m) => m.vehicle.stock === 'NEW');
  assert.ok(neu);
  assert.equal(neu.quote.term, 84);
  assert.equal(neu.quote.apr, 11);
});
