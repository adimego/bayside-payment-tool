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
 */
export function applyTaxPercentToDeal(d, rawPercent) {
  const raw = String(rawPercent ?? '').trim();
  if (raw === '') d.taxOverride = null;
  else {
    const p = parseFloat(raw);
    d.taxOverride = Number.isFinite(p) ? p / 100 : null;
  }
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
  };
}

/** Compact percent for labels: 4, 6.50, 6.60, 0.10, 8.875, 8.975. */
export function formatTaxPct(rate) {
  const p = Number(rate) * 100;
  if (!Number.isFinite(p)) return '0';
  if (Math.abs(p - Math.round(p)) < 1e-8) return String(Math.round(p));
  const hundredths = Math.round(p * 100) / 100;
  if (Math.abs(p - hundredths) < 1e-8) return hundredths.toFixed(2);
  return p.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
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
  return `${jur.state} · ${pct}% ${how}, ${reg} registration (estimate).${extra}`;
}
