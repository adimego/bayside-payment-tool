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

function vehicleRule(state, data) {
  return data?.vehicle?.[state] || null;
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
        return { taxRate: packedToRate(packed, data), taxSource, vehicle };
      }
    } else if (vehicle.rate != null) {
      return { taxRate: packedToRate(vehicle.rate, data), taxSource: 'vehicle', vehicle };
    }
  }
  if (data.zips && data.zips[zip] != null) {
    return { taxRate: packedToRate(data.zips[zip], data), taxSource: 'zip', vehicle };
  }
  if (state && data.states && data.states[state] != null) {
    return { taxRate: packedToRate(data.states[state], data), taxSource: 'state', vehicle };
  }
  return { taxRate: null, taxSource: 'none', vehicle };
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
 * file, otherwise the ZIP or state combined general sales rate, and $753.50 registration.
 * taxOverride is a decimal rate (0.07 = 7%) and, when set, replaces the looked-up tax.
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
    ...extra,
  });

  if (status === 'blank') return vaResult('blank', 'va');
  if (status === 'invalid') return vaResult('invalid', 'va');

  const state = stateForZip(zip, data);
  if (!state) return vaResult('invalid', 'va');
  if (state === 'VA') return vaResult('ok', 'va', { zip });

  const looked = data ? lookedUpRate(zip, state, data) : { taxRate: null, taxSource: 'none', vehicle: null };
  const extras = vehicleExtras(looked.vehicle);
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
    ...extras,
  };
}

/** Label for the quote breakdown, e.g. "Tax (MD 6.50%)". */
export function taxLineLabel(jur) {
  const pct = (jur.taxRate * 100).toFixed(2);
  const est = jur.unmodeled && jur.taxSource !== 'override' ? ' est.' : '';
  const cap = jur.taxCap != null
    ? `, ${jur.taxCap.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} cap`
    : '';
  const inner = jur.state ? `${jur.state} ${pct}%${est}${cap}` : `${pct}%${est}${cap}`;
  return `Tax (${inner})`;
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
  const how = jur.taxSource === 'override'
    ? 'rate you entered'
    : jur.taxName
      ? jur.taxName
      : jur.taxSource === 'zip'
        ? 'combined local rate'
        : 'state sales tax rate';
  const notes = (jur.vehicleNotes || []).filter((n) => n.modeled === false || n.kind === 'variable-rate' || jur.unmodeled).map((n) => n.text);
  const extra = notes.length ? ' ' + notes[0] : '';
  return `${jur.state} · ${pct}% ${how}, ${reg} registration (estimate).${extra}`;
}
