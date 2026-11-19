// ZIP-based sales tax and out-of-state registration lookup.
// The site is static, so all rates ship in data/tax-rates.json (no API keys).

export const VA_TAX_RATE = 0.0425;
export const VA_BUSINESS_TAX_RATE = 0.001; // 0.10% local business tax, already included in the 4.25% VA rate
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

function unitOf(data) {
  return data?.unit || 100000;
}

function packedToRate(n, data = table) {
  return Math.round(Number(n)) / unitOf(data);
}

function rateToPacked(rate, data = table) {
  return Math.round(Number(rate) * unitOf(data));
}

function vehicleRule(state, data) {
  return data?.vehicle?.[state] || null;
}

function statePortion(state, vehicle, data) {
  if (vehicle?.rate != null) return packedToRate(vehicle.rate, data);
  if (state && data.states && data.states[state] != null) return packedToRate(data.states[state], data);
  return null;
}

function splitResult(taxRate, taxSource, vehicle, state, data) {
  const useLocal = Boolean(vehicle?.useLocal);
  const stateRate = statePortion(state, vehicle, data);
  const localRate = (useLocal && taxRate != null && stateRate != null)
    ? packedToRate(Math.max(0, rateToPacked(taxRate, data) - rateToPacked(stateRate, data)), data)
    : 0;
  return {
    taxRate,
    taxSource,
    vehicle,
    stateRate,
    localRate,
    localMayApply: useLocal && taxSource === 'state',
  };
}

function lookedUpRate(zip, state, data) {
  const vehicle = vehicleRule(state, data);
  if (vehicle) {
    if (vehicle.useLocal) {
      let packed = null;
      let taxSource = 'none';
      if (data.zips && data.zips[zip] != null) {
        packed = data.zips[zip];
        taxSource = 'zip';
      } else if (state && data.states && data.states[state] != null) {
        packed = data.states[state];
        taxSource = 'state';
      }
      if (packed != null) {
        if (vehicle.subtractFromCombined) packed = Math.max(0, packed - vehicle.subtractFromCombined);
        return splitResult(packedToRate(packed, data), taxSource, vehicle, state, data);
      }
    } else if (vehicle.rate != null) {
      return splitResult(packedToRate(vehicle.rate, data), 'vehicle', vehicle, state, data);
    }
  }
  if (data.zips && data.zips[zip] != null) {
    return splitResult(packedToRate(data.zips[zip], data), 'zip', vehicle, state, data);
  }
  if (state && data.states && data.states[state] != null) {
    return splitResult(packedToRate(data.states[state], data), 'state', vehicle, state, data);
  }
  return splitResult(null, 'none', vehicle, state, data);
}

function vehicleExtras(vehicle) {
  if (!vehicle) {
    return { taxCap: null, taxName: null, unmodeled: false, vehicleNotes: [] };
  }
  return {
    taxCap: vehicle.cap != null ? vehicle.cap : null,
    taxName: vehicle.name || null,
    unmodeled: Boolean(vehicle.unmodeled),
    vehicleNotes: vehicle.notes || [],
  };
}

/** True only for a real numeric override. null, undefined, and '' are not overrides.
 *  Number(null) is 0, so a loose Number() check would treat "no override" as 0% tax. */
export function isTaxOverride(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Apply a customer ZIP to a deal object: always clear any tax override and
 * look up the rate for the new ZIP. The caller should write the looked-up
 * percent into the tax field.
 */
export function applyZipToDeal(d, zipValue) {
  d.zip = zipValue == null ? '' : String(zipValue);
  d.taxOverride = null;
  return lookupJurisdiction(d.zip);
}

/**
 * Apply a value typed into the tax % field. This is the only way a deal
 * gets a taxOverride — pre-filled looked-up rates must not count as one.
 * If the entered percent is the same as the looked-up total (after rounding
 * to four decimal places), leave the override cleared so the display value
 * cannot change the computed rate or drop the 0.10% / trade-credit split.
 */
export function applyTaxPercentToDeal(d, rawPercent) {
  const raw = String(rawPercent ?? '').trim();
  if (raw === '') {
    d.taxOverride = null;
    return lookupJurisdiction(d.zip);
  }
  const p = parseFloat(raw);
  if (!Number.isFinite(p)) {
    d.taxOverride = null;
    return lookupJurisdiction(d.zip);
  }
  const entered = p / 100;
  const looked = lookupJurisdiction(d.zip);
  if (Math.round(entered * 1e6) === Math.round(looked.taxRate * 1e6)) {
    d.taxOverride = null;
    return looked;
  }
  d.taxOverride = entered;
  return lookupJurisdiction(d.zip, { taxOverride: d.taxOverride });
}

/**
 * Resolve tax rate, registration, and state for a customer ZIP.
 * VA ZIPs and blank/invalid input keep the dealership's 4.25% tax and $153.50 registration.
 * Any other recognized US ZIP uses the motor-vehicle rate for that state when one is on
 * file, otherwise the ZIP or state combined general sales rate, plus Virginia's 0.10%
 * local business tax, and $753.50 registration. Virginia quotes stay at 4.25%, which
 * already includes the business tax.
 * taxOverride is a decimal rate (0.07 = 7%) and, when set, replaces the total tax
 * (it is not increased by the 0.10%).
 * null/undefined is not an override (Number(null) is 0 and must not be treated as 0% tax).
 */
export function lookupJurisdiction(zipInput, { taxOverride, taxTable } = {}) {
  const data = taxTable || table;
  const { zip, status } = normalizeZip(zipInput);
  const override = isTaxOverride(taxOverride) ? taxOverride : null;

  const vaResult = (st, src, extra = {}) => ({
    zip: status === 'blank' ? '' : zip,
    status: st,
    state: 'VA',
    taxRate: override != null ? override : VA_TAX_RATE,
    registration: VA_REGISTRATION,
    taxSource: override != null ? 'override' : src,
    outOfState: false,
    taxCap: null,
    taxName: null,
    unmodeled: false,
    vehicleNotes: [],
    stateRate: override != null ? override : VA_TAX_RATE,
    localRate: 0,
    localMayApply: false,
    baseTaxRate: override != null ? override : VA_TAX_RATE,
    vaBusinessRate: 0,
    ...tradeCreditFields('VA', data),
    ...extra,
  });

  if (status === 'blank') return vaResult('blank', 'va');
  if (status === 'invalid') return vaResult('invalid', 'va');

  const state = stateForZip(zip, data);
  if (!state) return vaResult('invalid', 'va');
  if (state === 'VA') return vaResult('ok', 'va', { zip });

  const looked = data ? lookedUpRate(zip, state, data) : { taxRate: null, taxSource: 'none', vehicle: null, stateRate: null, localRate: 0, localMayApply: false };
  const extras = vehicleExtras(looked.vehicle);
  const taxSource = override != null ? 'override' : (looked.taxSource === 'none' ? 'state' : looked.taxSource);
  const baseTaxRate = override != null ? override : (looked.taxRate ?? VA_TAX_RATE);
  const vaBusinessRate = override != null ? 0 : VA_BUSINESS_TAX_RATE;
  const taxRate = override != null
    ? override
    : packedToRate(rateToPacked(baseTaxRate + vaBusinessRate, data), data);
  return {
    zip,
    status: 'ok',
    state,
    taxRate,
    baseTaxRate,
    vaBusinessRate,
    registration: OUT_OF_STATE_REGISTRATION,
    taxSource,
    outOfState: true,
    stateRate: looked.stateRate,
    localRate: looked.localRate,
    localMayApply: taxSource === 'override' ? false : Boolean(looked.localMayApply),
    ...extras,
    ...tradeCreditFields(state, data),
  };
}


function tradeCreditFields(state, data) {
  const row = data?.tradeCredit?.[state] || { rule: state === 'VA' ? 'none' : 'full' };
  return {
    tradeCredit: row.rule || (state === 'VA' ? 'none' : 'full'),
    tradeCreditCap: row.cap != null ? row.cap : null,
    tradeCreditNoCreditRate: row.noCreditPacked != null ? packedToRate(row.noCreditPacked, data) : null,
    tradeCreditPortionRate: row.creditPacked != null ? packedToRate(row.creditPacked, data) : null,
    tradeCreditNote: row.note || null,
  };
}

export function isTruckType(type) {
  const t = String(type || '').trim().toLowerCase();
  if (!t) return false;
  return t === 'truck' || t.includes('crew cab') || t.includes('double cab');
}

export function formatMoney(n) {
  return (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

/**
 * Taxable base for the out-of-state (or VA) vehicle-tax portion.
 * Uses trade VALUE, not equity; payoff is ignored. Credit is 0 for VA and
 * no-credit states. Michigan caps the credit. Ohio is new-only. Rhode Island
 * skips trucks. Oklahoma split is still reduced for the credit portion.
 */
export function stateTaxableBase(totalSellingPrice, jur, { tradeValue = 0, condition, type } = {}) {
  const tsp = Math.max(0, Number(totalSellingPrice) || 0);
  const trade = Math.max(0, Number(tradeValue) || 0);
  const rule = jur.tradeCredit || (jur.outOfState ? 'full' : 'none');
  let credit = 0;
  if (jur.outOfState && rule !== 'none' && rule !== 'n/a') {
    const c = String(condition ?? '').trim().toLowerCase();
    const isUsed = c === 'used' || c === 'u' || c === 'pre-owned' || c === 'preowned';
    if (rule === 'new-only' && isUsed) credit = 0;
    else if (rule === 'not-truck' && isTruckType(type)) credit = 0;
    else if (rule === 'capped') credit = Math.min(trade, Number(jur.tradeCreditCap) || 0);
    else credit = trade; // full, new-only (new), not-truck (non-truck), split
  }
  credit = Math.min(credit, tsp);
  return { rule, credit, taxable: Math.max(0, tsp - credit) };
}

export function taxableAmountLabel(jur, { taxable, credit, rule } = {}) {
  if (!(credit > 0)) return '';
  if (rule === 'capped' && jur.tradeCreditCap != null) {
    return `Taxable amount ${formatMoney(taxable)} (trade credit applied, ${jur.state} cap ${formatMoney(jur.tradeCreditCap)})`;
  }
  if (rule === 'split' && jur.tradeCreditPortionRate != null && jur.tradeCreditNoCreditRate != null) {
    return `Taxable amount ${formatMoney(taxable)} (trade credit on ${formatTaxPct(jur.tradeCreditPortionRate)}% ${jur.state} sales tax; ${formatTaxPct(jur.tradeCreditNoCreditRate)}% excise on full price)`;
  }
  return `Taxable amount ${formatMoney(taxable)} (trade credit applied)`;
}

/** Percent rounded to four decimal places: 8.975, not 8.974999… */
export function roundedTaxPercent(rate) {
  return Math.round(Number(rate) * 1e6) / 1e4;
}

/** Compact percent for labels and the tax field: 4, 6.50, 6.60, 0.10, 8.875, 8.975. */
export function formatTaxPct(rate) {
  const p = roundedTaxPercent(rate);
  if (!Number.isFinite(p)) return '0';
  if (Math.abs(p - Math.round(p)) < 1e-8) return String(Math.round(p));
  const hundredths = Math.round(p * 100) / 100;
  if (Math.abs(p - hundredths) < 1e-8) return hundredths.toFixed(2);
  return p.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

/** Tax % field value: same rounding and trailing-zero rules as the breakdown labels. */
export function formatTaxInputPct(rate) {
  return formatTaxPct(rate);
}

/** Label for the quote breakdown, e.g. "Tax (MD 6.60%: MD 6.50% + VA business 0.10%)". */
export function taxLineLabel(jur) {
  const st = jur.state ? `${jur.state} ` : '';
  if (jur.taxSource === 'override' || !(jur.vaBusinessRate > 0)) {
    if (jur.localMayApply && jur.taxSource !== 'override') {
      return `Tax (${st}${formatTaxPct(jur.taxRate)}%, state rate only; local tax may apply)`;
    }
    const pct = (jur.taxRate * 100).toFixed(2);
    const est = jur.unmodeled && jur.taxSource !== 'override' ? ' est.' : '';
    const cap = jur.taxCap != null
      ? `, ${jur.taxCap.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} cap`
      : '';
    return `Tax (${st}${pct}%${est}${cap})`;
  }
  const total = formatTaxPct(jur.taxRate);
  const base = formatTaxPct(jur.baseTaxRate);
  const biz = formatTaxPct(jur.vaBusinessRate);
  const est = jur.unmodeled ? ' est.' : '';
  const cap = jur.taxCap != null
    ? ` capped at ${jur.taxCap.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`
    : '';
  const localNote = jur.localMayApply ? ', state rate only; local tax may apply' : '';
  if (jur.taxCap != null) {
    return `Tax (${st}${base}%${est}${cap} + VA business ${biz}%${localNote})`;
  }
  return `Tax (${st}${total}%${est}: ${jur.state} ${base}% + VA business ${biz}%${localNote})`;
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
  if (jur.localMayApply && jur.taxSource !== 'override') {
    const biz = jur.vaBusinessRate > 0 ? ` plus ${formatTaxPct(jur.vaBusinessRate)}% VA business tax` : '';
    return `${jur.state} · ${formatTaxPct(jur.baseTaxRate ?? jur.taxRate)}% state rate only${biz}; local tax may apply. ${reg} registration (estimate). Enter the combined rate for your locality if you know it.`;
  }
  const how = jur.taxSource === 'override'
    ? 'rate you entered'
    : jur.vaBusinessRate > 0
      ? `${formatTaxPct(jur.baseTaxRate)}% out-of-state + ${formatTaxPct(jur.vaBusinessRate)}% VA business tax`
      : jur.localRate > 1e-8 && jur.stateRate != null
        ? `combined (${formatTaxPct(jur.stateRate)}% state + ${formatTaxPct(jur.localRate)}% local)`
        : jur.taxName
          ? jur.taxName
          : jur.taxSource === 'zip'
            ? 'combined local rate'
            : 'state sales tax rate';
  const notes = (jur.vehicleNotes || []).filter((n) => n.modeled === false || n.kind === 'variable-rate' || jur.unmodeled).map((n) => n.text);
  const extra = notes.length ? ' ' + notes[0] : '';
  let creditNote = '';
  if (jur.taxSource !== 'override') {
    if (jur.tradeCredit === 'full') creditNote = ' A trade-in reduces the out-of-state taxable amount (the 0.10% VA business tax stays on the full price).';
    else if (jur.tradeCredit === 'capped') creditNote = ` A trade-in reduces the out-of-state taxable amount, capped at ${formatMoney(jur.tradeCreditCap)} (the 0.10% VA business tax stays on the full price).`;
    else if (jur.tradeCredit === 'split') creditNote = ' A trade-in reduces only part of the out-of-state tax; see the breakdown.';
    else if (jur.tradeCredit === 'new-only') creditNote = ' A trade-in reduces the out-of-state taxable amount on new vehicles only.';
    else if (jur.tradeCredit === 'not-truck') creditNote = ' A trade-in reduces the out-of-state taxable amount except on trucks.';
    else if (jur.tradeCredit === 'none') creditNote = ' A trade-in does not reduce this state’s tax.';
  }
  return `${jur.state} · ${pct}% ${how}, ${reg} registration (estimate).${creditNote}${extra}`;
}
