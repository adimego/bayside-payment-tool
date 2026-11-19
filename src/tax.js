// ZIP-based sales tax and out-of-state registration lookup.
// The site is static, so all rates ship in data/tax-rates.json (no API keys).

export const VA_TAX_RATE = 0.0425;
export const VA_REGISTRATION = 153.5;
export const OUT_OF_STATE_REGISTRATION = 753.5;

export const OUT_OF_STATE_DISCLAIMER =
  'Out-of-state tax and registration are estimates; your state may calculate them differently.';

let table = null;

export function setTaxTable(t) {
  table = t || null;
}

export function getTaxTable() {
  return table;
}

/** Digits-only ZIP, blank, or invalid. ZIP+4 is reduced to five digits. */
export function normalizeZip(raw) {
  const original = String(raw ?? '').trim();
  const digits = original.replace(/\D/g, '');
  if (digits === '') return { zip: '', status: original ? 'invalid' : 'blank' };
  if (digits.length < 5) return { zip: digits, status: 'invalid' };
  return { zip: digits.slice(0, 5), status: 'ok' };
}

export function stateForZip(zip, data = table) {
  if (!data || !zip) return null;
  const prefix = String(zip).padStart(5, '0').slice(0, 3);
  return data.prefixes[prefix] ?? null;
}

function packedToRate(n, data = table) {
  const unit = data?.unit || 100000;
  return Number(n) / unit;
}

function lookedUpRate(zip, state, data) {
  if (data.zips && data.zips[zip] != null) {
    return { taxRate: packedToRate(data.zips[zip], data), taxSource: 'zip' };
  }
  if (state && data.states && data.states[state] != null) {
    return { taxRate: packedToRate(data.states[state], data), taxSource: 'state' };
  }
  return { taxRate: null, taxSource: 'none' };
}

/**
 * Resolve tax rate, registration, and state for a customer ZIP.
 * VA ZIPs and blank/invalid input keep the dealership's 4.25% tax and $153.50 registration.
 * Any other recognized US ZIP uses the ZIP or state combined rate and $753.50 registration.
 * taxOverride is a decimal rate (0.07 = 7%) and, when set, replaces the looked-up tax.
 */
export function lookupJurisdiction(zipInput, { taxOverride, taxTable } = {}) {
  const data = taxTable || table;
  const { zip, status } = normalizeZip(zipInput);
  const override = Number.isFinite(Number(taxOverride)) ? Number(taxOverride) : null;

  const vaResult = (st, src, extra = {}) => ({
    zip: status === 'blank' ? '' : zip,
    status: st,
    state: 'VA',
    taxRate: override != null ? override : VA_TAX_RATE,
    registration: VA_REGISTRATION,
    taxSource: override != null ? 'override' : src,
    outOfState: false,
    ...extra,
  });

  if (status === 'blank') return vaResult('blank', 'va');
  if (status === 'invalid') return vaResult('invalid', 'va');

  const state = stateForZip(zip, data);
  if (!state) return vaResult('invalid', 'va');
  if (state === 'VA') return vaResult('ok', 'va', { zip });

  const looked = data ? lookedUpRate(zip, state, data) : { taxRate: null, taxSource: 'none' };
  const taxRate = override != null ? override : (looked.taxRate ?? VA_TAX_RATE);
  const taxSource = override != null ? 'override' : (looked.taxSource === 'none' ? 'state' : looked.taxSource);
  return {
    zip,
    status: 'ok',
    state,
    taxRate,
    registration: OUT_OF_STATE_REGISTRATION,
    taxSource,
    outOfState: true,
  };
}

/** Label for the quote breakdown, e.g. "Tax (MD 6.00%)". */
export function taxLineLabel(jur) {
  const pct = (jur.taxRate * 100).toFixed(2);
  return jur.state ? `Tax (${jur.state} ${pct}%)` : `Tax (${pct}%)`;
}

export function zipHint(jur) {
  const reg = jur.registration.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const pct = (jur.taxRate * 100).toFixed(2);
  if (jur.status === 'invalid') {
    return 'That ZIP was not recognized. Virginia tax (4.25%) and $153.50 registration are being used. You can enter the tax rate manually.';
  }
  if (!jur.outOfState) {
    return `Virginia · ${pct}% tax, ${reg} registration. Leave the ZIP blank to keep these.`;
  }
  const how = jur.taxSource === 'zip' ? 'combined local rate' : jur.taxSource === 'override' ? 'rate you entered' : 'state sales tax rate';
  return `${jur.state} · ${pct}% ${how}, ${reg} registration (estimate).`;
}
