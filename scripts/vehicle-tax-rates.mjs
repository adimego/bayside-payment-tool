// Statewide motor-vehicle tax rules that differ from general retail sales tax.
// Rates are stored packed at unit 100000 (6.50% = 6500). Caps are in dollars.
// useLocal: false means ignore ZIP-level general sales-tax overrides.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const VEHICLE_TAX_AS_OF = '2026-11';

export const VEHICLE_TAX_SOURCE = 'Official state DMV/DOR pages and statutes, corroborated by the Pennsylvania DOR Sales and Use Tax Credit Chart (REV-227, updated 2026-09-12). These are motor-vehicle titling/excise/highway-use rates, not general retail sales-tax rates.';

/** @type {Record<string, object>} */
export const VEHICLE_RATES = {
  AL: {
    rate: 2000,
    useLocal: true,
    subtractFromCombined: 2000,
    name: 'motor vehicle sales tax',
    notes: [
      { kind: 'rate', text: 'Alabama taxes motor vehicles at a 2% state rate (general sales tax is 4%); local rates still apply. Estimated as the combined general rate minus 2 percentage points.', modeled: true },
    ],
  },
  DE: {
    rate: 5250,
    useLocal: false,
    name: 'document fee',
    notes: [
      { kind: 'rate', text: 'Delaware has no sales tax. The DMV document fee is 5.25% of purchase price (effective October 1, 2025).', modeled: true },
    ],
  },
  DC: {
    rate: 6000,
    useLocal: false,
    name: 'excise tax',
    unmodeled: true,
    notes: [
      { kind: 'variable-rate', text: 'DC excise tax is 1%–11% of fair market value by unladen weight and city MPG (electric vehicles 1%–3%), effective February 17, 2025. 6.00% is a mid-range estimate (3,500–4,999 lb, 21–25 MPG). Enter the rate for this vehicle.', modeled: false },
    ],
  },
  FL: {
    rate: 6000,
    useLocal: false,
    name: 'motor vehicle sales tax',
    unmodeled: true,
    notes: [
      { kind: 'local-surtax', text: 'Florida state rate is 6%. County discretionary sales surtax applies only to the first $5,000 and is not included in this estimate (at most about $75).', modeled: false },
    ],
  },
  GA: {
    rate: 7000,
    useLocal: false,
    name: 'title ad valorem tax',
    notes: [
      { kind: 'rate', text: 'Georgia charges a 7% Title Ad Valorem Tax (TAVT) in place of sales tax. No local sales tax on the title.', modeled: true },
    ],
  },
  IA: {
    rate: 5000,
    useLocal: false,
    name: 'fee for new registration',
    notes: [
      { kind: 'rate', text: 'Iowa exempts motor vehicles from sales tax and charges a 5% fee for new registration.', modeled: true },
    ],
  },
  IN: {
    rate: 7000,
    useLocal: false,
    name: 'motor vehicle sales tax',
    notes: [
      { kind: 'rate', text: 'Indiana charges a 7% statewide rate on motor vehicles; local sales tax does not apply.', modeled: true },
    ],
  },
  KY: {
    rate: 6000,
    useLocal: false,
    name: 'motor vehicle usage tax',
    notes: [
      { kind: 'rate', text: 'Kentucky charges a 6% motor vehicle usage tax statewide; local sales tax does not apply.', modeled: true },
    ],
  },
  MD: {
    rate: 6500,
    useLocal: false,
    name: 'titling excise tax',
    notes: [
      { kind: 'rate', text: 'Maryland charges a 6.5% vehicle titling excise tax (general sales tax is 6% and does not apply).', modeled: true },
    ],
  },
  MN: {
    rate: 6875,
    useLocal: false,
    name: 'motor vehicle sales tax',
    notes: [
      { kind: 'rate', text: 'Minnesota motor vehicle sales tax is 6.875%. Local sales tax does not apply. A few cities levy a separate local vehicle excise tax that is not included.', modeled: true },
      { kind: 'local-excise', text: 'Some Minnesota cities levy a separate local vehicle excise tax that is not included in this estimate.', modeled: false },
    ],
  },
  MS: {
    rate: 5000,
    useLocal: false,
    name: 'motor vehicle sales tax',
    notes: [
      { kind: 'rate', text: 'Mississippi taxes motor vehicles and light trucks (10,000 lbs or less) at 5% (general sales tax is 7%).', modeled: true },
      { kind: 'heavy-trucks', text: 'Different rates apply to heavier trucks and some other vehicles; not modeled.', modeled: false },
    ],
  },
  NC: {
    rate: 3000,
    useLocal: false,
    name: 'highway use tax',
    notes: [
      { kind: 'rate', text: 'North Carolina charges a 3% highway use tax in place of sales tax.', modeled: true },
      { kind: 'cap', amount: 2000, text: 'A $2,000 cap applies only to Class A/B commercial motor vehicles and recreational vehicles, not to typical cars, SUVs, or light trucks.', modeled: false },
    ],
  },
  ND: {
    rate: 5000,
    useLocal: false,
    name: 'motor vehicle excise tax',
    notes: [
      { kind: 'rate', text: 'North Dakota charges a 5% motor vehicle excise tax in place of sales tax.', modeled: true },
    ],
  },
  NM: {
    rate: 4000,
    useLocal: false,
    name: 'motor vehicle excise tax',
    notes: [
      { kind: 'rate', text: 'New Mexico charges a 4% motor vehicle excise tax (not the gross receipts tax).', modeled: true },
    ],
  },
  OK: {
    rate: 4500,
    useLocal: false,
    name: 'motor vehicle excise and sales tax',
    notes: [
      { kind: 'rate', text: 'Oklahoma charges 3.25% motor vehicle excise tax plus 1.25% sales tax (4.50% combined). Local sales tax does not apply.', modeled: true },
    ],
  },
  SC: {
    rate: 5000,
    useLocal: false,
    cap: 500,
    name: 'infrastructure maintenance fee',
    notes: [
      { kind: 'cap', amount: 500, text: 'South Carolina charges a 5% infrastructure maintenance fee in place of sales tax, capped at $500.', modeled: true },
    ],
  },
  SD: {
    rate: 4000,
    useLocal: false,
    name: 'motor vehicle excise tax',
    notes: [
      { kind: 'rate', text: 'South Dakota charges a 4% motor vehicle excise tax (general sales tax is 4.2%).', modeled: true },
    ],
  },
  TX: {
    rate: 6250,
    useLocal: false,
    name: 'motor vehicle sales tax',
    notes: [
      { kind: 'rate', text: 'Texas charges a 6.25% motor vehicle sales tax. Local sales tax does not apply to motor vehicles.', modeled: true },
    ],
  },
  VT: {
    rate: 6000,
    useLocal: false,
    name: 'purchase and use tax',
    notes: [
      { kind: 'rate', text: 'Vermont charges a 6% purchase and use tax on automobiles and light trucks.', modeled: true },
      { kind: 'cap', amount: 2486, text: 'A $2,486 cap applies to heavy trucks (curb weight 10,100 lbs or more) and some other vehicles, not typical cars or light trucks.', modeled: false },
    ],
  },
  WV: {
    rate: 6000,
    useLocal: false,
    name: 'titling sales tax',
    notes: [
      { kind: 'rate', text: 'West Virginia charges a 6% statewide titling sales tax. Local sales tax does not apply.', modeled: true },
      { kind: 'flat', amount: 30, text: 'A flat $30 titling tax applies when the net purchase price is under $500; not modeled.', modeled: false },
    ],
  },
  CT: {
    rate: 6350,
    useLocal: false,
    name: 'sales and use tax',
    notes: [
      { kind: 'rate', text: 'Connecticut charges the 6.35% state rate on motor vehicles; there is no local sales tax.', modeled: true },
      { kind: 'luxury-rate', text: 'A 7.75% rate may apply to vehicles priced over $50,000; not modeled. Enter the rate by hand if it applies.', modeled: false },
    ],
  },
  AK: {
    rate: 0,
    useLocal: true,
    name: 'local sales tax',
    notes: [
      { kind: 'rate', text: 'Alaska has no state sales tax. Some boroughs and cities tax vehicle purchases locally. If no ZIP rate is on file, the quote uses 0% and notes that local tax may apply.', modeled: true },
    ],
  },
  AZ: {
    rate: 5600,
    useLocal: true,
    name: 'transaction privilege tax',
    notes: [
      { kind: 'rate', text: 'Arizona charges a 5.6% state transaction privilege tax plus local rates on motor vehicle purchases.', modeled: true },
    ],
  },
  AR: {
    rate: 6500,
    useLocal: true,
    name: 'sales tax',
    notes: [
      { kind: 'rate', text: 'Arkansas charges 6.5% state sales tax plus local rates on motor vehicles, generally collected at registration.', modeled: true },
    ],
  },
  CA: {
    rate: 7250,
    useLocal: true,
    name: 'sales and use tax',
    notes: [
      { kind: 'rate', text: 'California charges a 7.25% statewide sales and use tax plus district taxes on vehicles registered in a district. If no ZIP-level combined rate is on file, the quote uses 7.25% and notes that local tax may apply.', modeled: true },
    ],
  },
  CO: {
    rate: 2900,
    useLocal: true,
    name: 'sales tax',
    notes: [
      { kind: 'rate', text: 'Colorado charges 2.9% state sales tax plus state-administered local taxes on motor vehicles, generally based on where the vehicle will be registered.', modeled: true },
    ],
  },
  HI: {
    rate: 4500,
    useLocal: false,
    name: 'general excise tax',
    notes: [
      { kind: 'rate', text: 'Hawaii GET is 4% plus a 0.5% county surcharge in all four counties, so vehicle sales are estimated at 4.50%. Dealers may pass on up to 4.712%.', modeled: true },
    ],
  },
  ID: {
    rate: 6000,
    useLocal: true,
    name: 'sales tax',
    notes: [
      { kind: 'rate', text: 'Idaho charges a 6% state sales tax on motor vehicles. A few local resort or auditorium taxes may also apply.', modeled: true },
    ],
  },
  IL: {
    rate: 6250,
    useLocal: true,
    name: 'sales tax',
    notes: [
      { kind: 'rate', text: 'Illinois dealer sales of motor vehicles are subject to the 6.25% state rate plus local retailers occupation taxes where they apply. If no ZIP-level rate is on file, the quote uses 6.25% and notes that local tax may apply.', modeled: true },
    ],
  },
  KS: {
    rate: 6500,
    useLocal: true,
    name: 'sales tax',
    notes: [
      { kind: 'rate', text: 'Kansas charges 6.5% state sales tax plus local rates on motor vehicles.', modeled: true },
    ],
  },
  LA: {
    rate: 5000,
    useLocal: true,
    name: 'sales tax',
    notes: [
      { kind: 'rate', text: 'Louisiana state sales tax is 5% as of January 1, 2025 (it had been 4.45%). Local parish and city taxes also apply to motor vehicles. If no ZIP-level combined rate is on file, the quote uses 5% and notes that local tax may apply.', modeled: true },
    ],
  },
  MO: {
    rate: 4225,
    useLocal: true,
    name: 'sales tax',
    notes: [
      { kind: 'rate', text: 'Missouri charges 4.225% state sales tax plus local rates on motor vehicles, generally collected at the license office.', modeled: true },
    ],
  },
  NE: {
    rate: 5500,
    useLocal: true,
    name: 'sales tax',
    notes: [
      { kind: 'rate', text: 'Nebraska charges 5.5% state sales tax plus local rates on motor vehicles.', modeled: true },
    ],
  },
  NV: {
    rate: 6850,
    useLocal: true,
    name: 'sales tax',
    notes: [
      { kind: 'rate', text: 'Nevada charges 6.85% state sales tax plus local rates on motor vehicles.', modeled: true },
    ],
  },
  NY: {
    rate: 4000,
    useLocal: true,
    name: 'sales tax',
    notes: [
      { kind: 'rate', text: 'New York charges 4% state sales tax plus county and city local tax (and 0.375% MCTD tax in the downstate district) on motor vehicles, at the combined rate of the owner\'s resident jurisdiction. ZIP-level rates follow Publication 718 county/city rates mapped from Census ZCTA to county; ZIP boundaries may not match tax jurisdictions exactly.', modeled: true },
    ],
  },
  OH: {
    rate: 5750,
    useLocal: true,
    name: 'sales tax',
    notes: [
      { kind: 'rate', text: 'Ohio charges 5.75% state sales tax plus county and transit rates on motor vehicles.', modeled: true },
    ],
  },
  PA: {
    rate: 6000,
    useLocal: true,
    name: 'sales tax',
    notes: [
      { kind: 'rate', text: 'Pennsylvania charges 6% state sales tax on motor vehicles, plus 2% local tax if the vehicle is registered in Philadelphia and 1% if registered in Allegheny County.', modeled: true },
    ],
  },
  TN: {
    rate: 7000,
    useLocal: false,
    name: 'sales tax',
    unmodeled: true,
    notes: [
      { kind: 'rate', text: 'Tennessee charges 7% state sales tax on the full vehicle price. Local option tax applies only to the first $1,600 (the cap is lower in a few counties), and an additional 2.75% state single-article tax applies from $1,600.01 through $3,200. Those extras are not included (together they are typically under $100).', modeled: false },
    ],
  },
  UT: {
    rate: 4850,
    useLocal: true,
    name: 'sales tax',
    notes: [
      { kind: 'rate', text: 'Utah state sales tax is 4.85%. Local option taxes also apply to motor vehicles (some special resort or correctional-facility taxes do not). If no ZIP-level combined rate is on file, the quote uses 4.85% and notes that local tax may apply.', modeled: true },
    ],
  },
  WA: {
    rate: 6500,
    useLocal: true,
    name: 'sales and use tax',
    notes: [
      { kind: 'rate', text: 'Washington charges 6.5% state sales/use tax plus local rates on motor vehicles, generally at the rate where the vehicle will be registered.', modeled: true },
    ],
  },
  WI: {
    rate: 5000,
    useLocal: true,
    name: 'sales tax',
    notes: [
      { kind: 'rate', text: 'Wisconsin charges a 5% state sales tax plus county and stadium district taxes on motor vehicles where those taxes apply.', modeled: true },
    ],
  },
  WY: {
    rate: 4000,
    useLocal: true,
    name: 'sales tax',
    notes: [
      { kind: 'rate', text: 'Wyoming charges 4% state sales tax plus local option taxes on motor vehicles.', modeled: true },
    ],
  },

};

// Packed general state sales-tax bases that were stale in the ReceiptEdit 2026.1 file.
export const STATE_BASE_FIXES = { LA: 5000, UT: 4850 };

export function applyLocalVehicleZips(table) {
  const path = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'ny-pa-local-zips.json');
  const local = JSON.parse(readFileSync(path, 'utf8'));
  table.zips = table.zips || {};
  for (const [z, r] of Object.entries({ ...(local.ny || {}), ...(local.pa || {}) })) table.zips[z] = r;
  table.source = table.source || {};
  table.source.localZips = [local.source?.ny, local.source?.pa].filter(Boolean).join(' ');
  return table;
}

export function applyVehicleRates(table) {
  table.vehicle = VEHICLE_RATES;
  if (table.states) {
    for (const [st, packed] of Object.entries(STATE_BASE_FIXES)) table.states[st] = packed;
  }
  applyLocalVehicleZips(table);
  table.source = table.source || {};
  table.source.vehicle = `${VEHICLE_TAX_SOURCE} Vehicle-rate table as of ${VEHICLE_TAX_AS_OF}.`;
  return table;
}
