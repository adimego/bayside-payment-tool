// Bayside payment tool: quote and payment math.
// Pure functions only (no DOM), so the same module runs in the browser,
// in Node tests, and later in a Supabase Edge Function (Deno).

export const PROCESSING_FEE = 995;      // added to the vAuto price (feed leaves it out)
export const TAX_RATE = 0.0425;         // on the full Total Selling Price, no trade credit
export const REGISTRATION = 153.5;      // flat VA title and registration
export const MILITARY_REBATE = 500;     // Military / First Responder, taken off AFTER tax

export const TERMS = [36, 48, 60, 72, 84];
export const TIERS = [
  { id: 'Poor', base: 20 },
  { id: 'Fair', base: 16 },
  { id: 'Good', base: 10 },
  { id: 'Great', base: 8 },
  { id: 'Excellent', base: 6 },
];
// Each extra 12 months beyond 36 adds this many APR points.
export const RATE_STEP_PER_12_MONTHS = 0.5;

export const DISCLAIMERS = [
  'Rates are subject to credit approval.',
  'Taxes may vary on rebate amounts.',
];

export const LINKS = {
  applyForFinancing: 'https://www.baysidecdjrva.com/apply-for-financing.htm',
  valueMyTrade: 'https://www.baysidecdjrva.com/trade-in-form.htm',
};

/** Round to cents. */
export function cents(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** APR (percent, e.g. 11.5) for a credit tier and term in months. */
export function aprFor(tier, term) {
  const t = TIERS.find((x) => x.id.toLowerCase() === String(tier).toLowerCase());
  if (!t) throw new Error(`Unknown credit tier: ${tier}`);
  if (!TERMS.includes(Number(term))) throw new Error(`Unsupported term: ${term}`);
  return t.base + ((Number(term) - 36) / 12) * RATE_STEP_PER_12_MONTHS;
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
 */
export function buildQuote(o) {
  if (o == null || o.vautoPrice == null || !Number.isFinite(Number(o.vautoPrice)) || Number(o.vautoPrice) <= 0) {
    return null; // no price -> Call for Price, no quote
  }
  const vautoPrice = num(o.vautoPrice);
  const down = Math.max(0, num(o.down));
  const tradeValue = Math.max(0, num(o.tradeValue));
  const tradePayoff = Math.max(0, num(o.tradePayoff));
  const tier = o.tier ?? 'Good';
  const term = Number(o.term ?? 72);
  const military = Boolean(o.military);

  const totalSellingPrice = cents(vautoPrice + PROCESSING_FEE);
  const tax = cents(totalSellingPrice * TAX_RATE);
  const militaryRebate = military ? MILITARY_REBATE : 0;
  const outTheDoor = cents(totalSellingPrice + tax + REGISTRATION - militaryRebate);
  const tradeEquity = cents(tradeValue - tradePayoff); // negative = owes more than it's worth
  const amountFinanced = Math.max(0, cents(outTheDoor - down - tradeEquity));
  const apr = aprFor(tier, term);
  const payment = monthlyPayment(amountFinanced, apr, term);

  return {
    vautoPrice,
    processingFee: PROCESSING_FEE,
    totalSellingPrice,
    taxRate: TAX_RATE,
    tax,
    registration: REGISTRATION,
    militaryRebate,
    outTheDoor,
    down,
    tradeValue,
    tradePayoff,
    tradeEquity,
    amountFinanced,
    tier,
    term,
    apr,
    payment,
    disclaimers: DISCLAIMERS,
  };
}

/**
 * Work the quote math backward: the highest vAuto price whose payment fits
 * the monthly goal with the given deal inputs. Returns 0 if nothing fits.
 */
export function maxVautoPriceForPayment(o) {
  const payment = num(o.payment);
  const tier = o.tier ?? 'Good';
  const term = Number(o.term ?? 72);
  const apr = aprFor(tier, term);
  const down = Math.max(0, num(o.down));
  const equity = Math.max(0, num(o.tradeValue)) - Math.max(0, num(o.tradePayoff));
  const militaryRebate = o.military ? MILITARY_REBATE : 0;

  const financed = principalForPayment(payment, apr, term);
  const outTheDoor = financed + down + equity;
  const tsp = (outTheDoor - REGISTRATION + militaryRebate) / (1 + TAX_RATE);
  const price = tsp - PROCESSING_FEE;
  // Floor to whole dollars so a vehicle at the ceiling never quotes over the goal
  // because of cent rounding; tests confirm the round trip.
  return price > 0 ? Math.floor(price) : 0;
}

/** Rate table rows for display: [{tier, rates:[{term, apr}]}]. */
export function rateTable() {
  return TIERS.map((t) => ({ tier: t.id, rates: TERMS.map((term) => ({ term, apr: aprFor(t.id, term) })) }));
}
