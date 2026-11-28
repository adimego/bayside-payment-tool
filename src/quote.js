// Bayside payment tool: quote and payment math.
// Pure functions only (no DOM), so the same module runs in the browser,
// in Node tests, and later in a Supabase Edge Function (Deno).

import { lookupJurisdiction, taxLineLabel, stateTaxableBase, taxableAmountLabel, OUT_OF_STATE_DISCLAIMER, VA_TAX_RATE, VA_REGISTRATION } from './tax.js?v=4384cec';

export const PROCESSING_FEE = 995;      // added to the vAuto price (feed leaves it out)
export const TAX_RATE = VA_TAX_RATE;    // default VA rate on the full Total Selling Price, no trade credit
export const REGISTRATION = VA_REGISTRATION; // default VA title and registration
export const MILITARY_REBATE = 500;     // Military / First Responder, taken off AFTER tax

export const TERMS = [36, 48, 60, 72, 84];
export const TIERS = [
  { id: 'Poor', base: 19.5 },
  { id: 'Fair', base: 15.5 },
  { id: 'Good', base: 9.5 },
  { id: 'Great', base: 7.5 },
  { id: 'Excellent', base: 5.5 },
];
// The TIERS table is the 36-month APR for USED / pre-owned vehicles.
// NEW vehicles are this many percentage points lower at every term.
export const NEW_RATE_DISCOUNT = 0.5;
// Each extra 12 months beyond 36 adds this many APR points (new and used).
export const RATE_STEP_PER_12_MONTHS = 0.5;
// Dealership model-year reference for age and term caps. A constant of 2026
// (not derived from the calendar). Deriving with "calendar year + 1 from
// September" would be 2027 in November 2026 and would shift the stated
// boundaries (2021 = no cap, 2020 = 72, 2016 = 60).
export const CURRENT_MODEL_YEAR = 2026;

export const DISCLAIMERS = [
  'Rates are subject to credit approval.',
  'Taxes may vary on rebate amounts.',
];
export { OUT_OF_STATE_DISCLAIMER };

export const LINKS = {
  applyForFinancing: 'https://www.baysidecdjrva.com/apply-for-financing.htm',
  valueMyTrade: 'https://www.baysidecdjrva.com/trade-in-form.htm',
};

/** Round to cents. */
export function cents(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** True when the vehicle is new. Accepts "New", "N", or "n". */
export function isNewVehicle(condition) {
  const c = String(condition ?? '').trim().toLowerCase();
  return c === 'new' || c === 'n';
}

/** Four-digit model year at the start of a Vehicle string, or null. */
export function yearFromVehicleName(name) {
  const m = String(name ?? '').trim().match(/^(\d{4})\b/);
  return m ? Number(m[1]) : null;
}

/** Age in model years: CURRENT_MODEL_YEAR minus the vehicle's model year. */
export function vehicleAge(year, referenceYear = CURRENT_MODEL_YEAR) {
  const y = Number(year);
  if (!Number.isFinite(y) || y <= 0) return 0;
  return referenceYear - y;
}

/**
 * Longest allowed term in months.
 * Age > 5 (2020 and older) caps at 72; age >= 10 (2016 and older) caps at 60.
 * Unknown year: no cap (84).
 */
export function maxTermForYear(year, referenceYear = CURRENT_MODEL_YEAR) {
  if (year == null || year === '' || !Number.isFinite(Number(year))) return 84;
  const age = vehicleAge(year, referenceYear);
  if (age >= 10) return 60;
  if (age > 5) return 72;
  return 84;
}

/** Snap a requested term down to the vehicle's cap; returns a value in TERMS. */
export function clampTerm(term, year, referenceYear = CURRENT_MODEL_YEAR) {
  const max = maxTermForYear(year, referenceYear);
  const t = Number(term);
  if (TERMS.includes(t) && t <= max) return t;
  return [...TERMS].reverse().find((n) => n <= max);
}

/** Short UI note when a term cap applies, or an empty string. */
export function termCapNote(year, referenceYear = CURRENT_MODEL_YEAR) {
  const max = maxTermForYear(year, referenceYear);
  if (max === 60) return `Max term for ${referenceYear - 10} and older: 60 months`;
  if (max === 72) return `Max term for ${referenceYear - 6} and older: 72 months`;
  return '';
}

/** APR (percent, e.g. 11.5) for a credit tier, term, and new/used condition. */
export function aprFor(tier, term, condition) {
  const t = TIERS.find((x) => x.id.toLowerCase() === String(tier).toLowerCase());
  if (!t) throw new Error(`Unknown credit tier: ${tier}`);
  if (!TERMS.includes(Number(term))) throw new Error(`Unsupported term: ${term}`);
  const base = isNewVehicle(condition) ? t.base - NEW_RATE_DISCOUNT : t.base;
  return base + ((Number(term) - 36) / 12) * RATE_STEP_PER_12_MONTHS;
}

/** Standard amortized monthly payment. apr is a percent (11.5 = 11.5%). */
export function monthlyPayment(principal, apr, term) {
  if (principal <= 0) return 0;
  const i = apr / 100 / 12;
  if (i === 0) return cents(principal / term);
  return cents((principal * i) / (1 - Math.pow(1 + i, -term)));
}

/** Largest principal a monthly payment can carry (inverse of monthlyPayment). */
export function principalForPayment(payment, apr, term) {
  if (payment <= 0) return 0;
  const i = apr / 100 / 12;
  if (i === 0) return payment * term;
  return (payment * (1 - Math.pow(1 + i, -term))) / i;
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** True when the vehicle (or a New/Used filter) is used. Accepts "Used", "U", or "u". */
export function isUsedVehicle(condition) {
  const c = String(condition ?? '').trim().toLowerCase();
  return c === 'used' || c === 'u';
}

/**
 * Build a full quote.
 * @param {object} o
 * @param {number} o.vautoPrice  price from the vAuto feed (rebates already off on new units)
 * @param {number} [o.down=0]
 * @param {number} [o.tradeValue=0]
 * @param {number} [o.tradePayoff=0]
 * @param {string} [o.tier='Good']
 * @param {number} [o.term=72]
 * @param {boolean} [o.military=false]
 * @param {string} [o.condition]  "New"/"N" or "Used"/"U". The $500 Military / First Responder
 *   rebate applies only to new vehicles; it is ignored when the vehicle is used.
 *   New vehicles also get a 0.5 point lower APR than used.
 * @param {number} [o.year]  model year; used to cap the term. Falls back to o.name.
 * @param {string} [o.name]  vehicle string, used only to parse a year if o.year is missing.
 * @param {string} [o.zip]  optional customer ZIP. VA or blank keeps 4.25% tax and $153.50 registration.
 * @param {number} [o.taxOverride]  optional decimal tax rate entered by the customer.
 */
/**
 * State/local vehicle tax may use a reduced base (trade VALUE, not equity).
 * The 0.10% VA business tax is always charged on the full TSP when it applies,
 * because Virginia itself does not allow a trade-in credit. A manual override
 * is the total rate on the same taxable base the state rule would use (for
 * Oklahoma's split, the override is applied to the full TSP). Caps such as
 * SC $500 apply only to the out-of-state portion after any trade credit.
 */
export function computeTax(totalSellingPrice, jur, deal = {}) {
  const { rule, credit, taxable } = stateTaxableBase(totalSellingPrice, jur, deal);
  if (jur.taxSource === 'override') {
    // Split states have two bases; an override is a single rate on the full TSP.
    const base = rule === 'split' ? totalSellingPrice : taxable;
    const tax = cents(base * jur.taxRate);
    const usedCredit = rule === 'split' ? 0 : credit;
    return {
      tax,
      taxable: base,
      credit: usedCredit,
      taxableLabel: taxableAmountLabel(jur, { taxable: base, credit: usedCredit, rule }),
    };
  }
  let stateTax;
  if (rule === 'split' && jur.tradeCreditNoCreditRate != null) {
    const creditRate = jur.tradeCreditPortionRate || 0;
    stateTax = cents(totalSellingPrice * jur.tradeCreditNoCreditRate + taxable * creditRate);
  } else {
    const baseRate = jur.baseTaxRate ?? jur.taxRate;
    stateTax = cents(taxable * baseRate);
    if (jur.taxCap != null) stateTax = Math.min(stateTax, jur.taxCap);
  }
  const biz = jur.vaBusinessRate > 0 ? cents(totalSellingPrice * jur.vaBusinessRate) : 0;
  return {
    tax: cents(stateTax + biz),
    taxable,
    credit,
    taxableLabel: taxableAmountLabel(jur, { taxable, credit, rule }),
  };
}

function invertTsp(outTheDoor, jur, deal = {}, militaryRebate = 0) {
  const net = outTheDoor - jur.registration + militaryRebate;
  const tradeValue = Math.max(0, Number(deal.tradeValue) || 0);
  const { rule, credit } = stateTaxableBase(1e12, jur, deal); // credit allowance before the min(TSP) floor
  const creditAmt = credit;
  const bizRate = jur.taxSource === 'override' ? 0 : (jur.vaBusinessRate || 0);

  if (jur.taxSource === 'override') {
    const rate = jur.taxRate;
    if (rule === 'split' || creditAmt === 0) return net / (1 + rate);
    let tsp = (net + rate * creditAmt) / (1 + rate);
    if (tsp < creditAmt) tsp = net; // taxable 0
    return tsp;
  }

  if (rule === 'split' && jur.tradeCreditNoCreditRate != null) {
    const noC = jur.tradeCreditNoCreditRate;
    const cR = jur.tradeCreditPortionRate || 0;
    let tsp = (net + cR * creditAmt) / (1 + noC + cR + bizRate);
    if (tsp < creditAmt) tsp = net / (1 + noC + bizRate);
    return tsp;
  }

  const baseRate = jur.baseTaxRate ?? jur.taxRate;
  if (creditAmt === 0) {
    let tsp = net / (1 + baseRate + bizRate);
    if (jur.taxCap != null && tsp * baseRate > jur.taxCap) tsp = (net - jur.taxCap) / (1 + bizRate);
    return tsp;
  }
  let tsp = (net + baseRate * creditAmt) / (1 + baseRate + bizRate);
  if (tsp < creditAmt) tsp = net / (1 + bizRate);
  else if (jur.taxCap != null && (tsp - creditAmt) * baseRate > jur.taxCap) {
    tsp = (net - jur.taxCap) / (1 + bizRate);
  }
  return tsp;
}

export function buildQuote(o) {
  if (o == null || o.vautoPrice == null || !Number.isFinite(Number(o.vautoPrice)) || Number(o.vautoPrice) <= 0) {
    return null; // no price -> Call for Price, no quote
  }
  const vautoPrice = num(o.vautoPrice);
  const down = Math.max(0, num(o.down));
  const tradeValue = Math.max(0, num(o.tradeValue));
  const tradePayoff = Math.max(0, num(o.tradePayoff));
  const tier = o.tier ?? 'Good';
  const year = o.year ?? yearFromVehicleName(o.name ?? o.vehicle);
  const maxTerm = maxTermForYear(year);
  const term = clampTerm(o.term ?? 72, year);
  const military = Boolean(o.military);

  const jur = lookupJurisdiction(o.zip, { taxOverride: o.taxOverride, taxTable: o.taxTable });
  const taxRate = jur.taxRate;
  const registration = jur.registration;

  const totalSellingPrice = cents(vautoPrice + PROCESSING_FEE);
  const dealTax = { tradeValue, condition: o.condition, type: o.type || o.body };
  const computed = computeTax(totalSellingPrice, jur, dealTax);
  const tax = computed.tax;
  const militaryRebate = military && !isUsedVehicle(o.condition) ? MILITARY_REBATE : 0;
  const outTheDoor = cents(totalSellingPrice + tax + registration - militaryRebate);
  const tradeEquity = cents(tradeValue - tradePayoff); // negative = owes more than it's worth
  const amountFinanced = Math.max(0, cents(outTheDoor - down - tradeEquity));
  const apr = aprFor(tier, term, o.condition);
  const payment = monthlyPayment(amountFinanced, apr, term);

  return {
    vautoPrice,
    processingFee: PROCESSING_FEE,
    totalSellingPrice,
    taxRate,
    tax,
    taxState: jur.state,
    taxSource: jur.taxSource,
    taxLabel: taxLineLabel(jur),
    taxableAmount: computed.taxable,
    tradeTaxCredit: computed.credit,
    taxableLabel: computed.taxableLabel || '',
    zip: jur.zip,
    zipStatus: jur.status,
    outOfState: jur.outOfState,
    registration,
    militaryRebate,
    outTheDoor,
    down,
    tradeValue,
    tradePayoff,
    tradeEquity,
    amountFinanced,
    tier,
    term,
    year: year ?? null,
    maxTerm,
    apr,
    payment,
    disclaimers: jur.outOfState ? [...DISCLAIMERS, OUT_OF_STATE_DISCLAIMER] : DISCLAIMERS,
  };
}

/**
 * Work the quote math backward: the highest vAuto price whose payment fits
 * the monthly goal with the given deal inputs. Returns 0 if nothing fits.
 */
export function maxVautoPriceForPayment(o) {
  const payment = num(o.payment);
  const tier = o.tier ?? 'Good';
  const year = o.year ?? yearFromVehicleName(o.name ?? o.vehicle);
  const term = clampTerm(o.term ?? 72, year);
  const apr = aprFor(tier, term, o.condition);
  const down = Math.max(0, num(o.down));
  const equity = Math.max(0, num(o.tradeValue)) - Math.max(0, num(o.tradePayoff));
  const jur = lookupJurisdiction(o.zip, { taxOverride: o.taxOverride, taxTable: o.taxTable });
  const militaryRebate = o.military && !isUsedVehicle(o.condition) ? MILITARY_REBATE : 0;

  const financed = principalForPayment(payment, apr, term);
  const outTheDoor = financed + down + equity;
  const tsp = invertTsp(outTheDoor, jur, { tradeValue: o.tradeValue, condition: o.condition, type: o.type || o.body }, militaryRebate);
  const price = tsp - PROCESSING_FEE;
  // Floor to whole dollars so a vehicle at the ceiling never quotes over the goal
  // because of cent rounding; tests confirm the round trip.
  return price > 0 ? Math.floor(price) : 0;
}

/** Rate table rows for display: [{tier, rates:[{term, apr}]}]. */
export function rateTable(condition) {
  return TIERS.map((t) => ({ tier: t.id, rates: TERMS.map((term) => ({ term, apr: aprFor(t.id, term, condition) })) }));
}
