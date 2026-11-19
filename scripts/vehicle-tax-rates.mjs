// Statewide motor-vehicle tax rules that differ from general retail sales tax.
// Rates are stored packed at unit 100000 (6.50% = 6500). Caps are in dollars.
// useLocal: false means ignore ZIP-level general sales-tax overrides.

export const VEHICLE_TAX_AS_OF = '2026-11';

export const VEHICLE_TAX_SOURCE = 'Official state DMV/DOR pages and statutes, corroborated by the Pennsylvania DOR Sales and Use Tax Credit Chart (REV-227, updated 2026-09-12). These are motor-vehicle titling/excise/highway-use rates, not general retail sales-tax rates.';

/** @type {Record<string, object>} */
export const VEHICLE_RATES = {
  AL: {
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
};

export function applyVehicleRates(table) {
  table.vehicle = VEHICLE_RATES;
  table.source = table.source || {};
  table.source.vehicle = `${VEHICLE_TAX_SOURCE} Vehicle-rate table as of ${VEHICLE_TAX_AS_OF}.`;
  return table;
}
