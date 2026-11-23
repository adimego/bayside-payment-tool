// Pure helpers for one-off custom vehicle quotes (staff form + shareable URL).
// Never writes inventory.json; the vehicle lives only in the URL / sessionStorage.
import { CURRENT_MODEL_YEAR } from './quote.js';

export const CUSTOM_FORM_PATH = 'custom';
export const CUSTOM_QUOTE_PATH = 'c';
export const CUSTOM_STORAGE_KEY = 'bayside.customVehicle.v1';
export const MIN_YEAR = 1990;
export const MAX_YEAR = CURRENT_MODEL_YEAR + 1;

export const VEHICLE_PARAM_KEYS = ['y', 'mk', 'md', 'tr', 'c', 'p', 'mi', 'st', 'vin'];

const MAX_PRICE = 10_000_000;
const MAX_MILES = 1_000_000;
const MAX_TEXT = 80;

function clip(s, n = MAX_TEXT) {
  return String(s ?? '').trim().slice(0, n);
}

function parseMoney(raw) {
  const s = String(raw ?? '').trim().replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

function normalizeCondition(raw) {
  const c = String(raw ?? '').trim().toLowerCase();
  if (c === 'new' || c === 'n') return 'New';
  if (c === 'used' || c === 'u' || c === 'pre-owned' || c === 'preowned') return 'Used';
  return null;
}

/** Build the display name: "2025 Jeep Compass Limited". */
export function customVehicleName({ year, make, model, trim } = {}) {
  return [year, make, model, trim].map((x) => String(x ?? '').trim()).filter(Boolean).join(' ');
}

export function isCustomVehicle(v) {
  return Boolean(v && v.custom);
}

/**
 * Validate staff-entered (or URL-encoded) custom vehicle fields.
 * Returns { ok, errors, vehicle }. On success, `vehicle` is a normalized
 * inventory-shaped record with custom: true (and no photo).
 */
export function validateCustomVehicle(raw = {}) {
  const errors = {};
  const year = Number.parseInt(String(raw.year ?? '').trim(), 10);
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    errors.year = `Enter a year between ${MIN_YEAR} and ${MAX_YEAR}.`;
  }
  const make = clip(raw.make);
  if (!make) errors.make = 'Enter the make.';
  const model = clip(raw.model);
  if (!model) errors.model = 'Enter the model.';
  const trim = clip(raw.trim);
  const condition = normalizeCondition(raw.condition);
  if (!condition) errors.condition = 'Choose New or Used.';
  const price = parseMoney(raw.price);
  if (!Number.isFinite(price) || price <= 0 || price > MAX_PRICE) {
    errors.price = 'Enter a selling price greater than 0.';
  }
  let odometer = null;
  if (raw.odometer != null && String(raw.odometer).trim() !== '') {
    const mi = Number.parseInt(String(raw.odometer).replace(/[^0-9]/g, ''), 10);
    if (!Number.isInteger(mi) || mi < 0 || mi > MAX_MILES) {
      errors.odometer = 'Enter mileage as a whole number.';
    } else {
      odometer = mi;
    }
  }
  const stock = clip(raw.stock, 32);
  const vin = clip(raw.vin, 17).toUpperCase();
  if (vin && !/^[A-HJ-NPR-Z0-9]+$/.test(vin)) {
    errors.vin = 'Enter a valid VIN (letters and numbers, no I, O, or Q).';
  }

  if (Object.keys(errors).length) return { ok: false, errors, vehicle: null };

  const vehicle = {
    year,
    make,
    model,
    trim,
    name: customVehicleName({ year, make, model, trim }),
    condition,
    price: Math.round(price * 100) / 100,
    odometer,
    stock,
    vin,
    certified: false,
    body: '',
    type: '',
    color: '',
    interiorColor: '',
    photo: null,
    custom: true,
  };
  return { ok: true, errors: {}, vehicle };
}

/** Encode a validated (or validatable) custom vehicle as query params (no deal fields). */
export function encodeCustomVehicle(vehicle) {
  const result = validateCustomVehicle(vehicle);
  if (!result.ok) return '';
  const v = result.vehicle;
  const p = new URLSearchParams();
  p.set('y', String(v.year));
  p.set('mk', v.make);
  p.set('md', v.model);
  if (v.trim) p.set('tr', v.trim);
  p.set('c', v.condition);
  p.set('p', String(v.price));
  if (v.odometer != null) p.set('mi', String(v.odometer));
  if (v.stock) p.set('st', v.stock);
  if (v.vin) p.set('vin', v.vin);
  return p.toString();
}

/** Parse custom vehicle fields out of a query string or URLSearchParams. */
export function parseCustomVehicle(search) {
  const p = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(String(search || '').replace(/^\?/, ''));
  return validateCustomVehicle({
    year: p.get('y'),
    make: p.get('mk'),
    model: p.get('md'),
    trim: p.get('tr') || '',
    condition: p.get('c'),
    price: p.get('p'),
    odometer: p.get('mi'),
    stock: p.get('st') || '',
    vin: p.get('vin') || '',
  });
}

/** Parse a hash like #/c?y=2025&mk=Jeep&md=Compass&c=Used&p=25000. */
export function parseCustomVehicleFromHash(hash) {
  const h = String(hash || '').replace(/^#/, '');
  const [path, query = ''] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] !== CUSTOM_QUOTE_PATH) {
    return { ok: false, errors: { _form: 'Not a custom vehicle link.' }, vehicle: null };
  }
  return parseCustomVehicle(query);
}

/** Shareable hash for a custom quote, with optional deal query string appended. */
export function customQuoteHash(vehicle, dealQuery = '') {
  const encoded = encodeCustomVehicle(vehicle);
  if (!encoded) return '#/';
  const extra = new URLSearchParams(String(dealQuery || '').replace(/^\?/, ''));
  for (const key of VEHICLE_PARAM_KEYS) extra.delete(key);
  const deal = extra.toString();
  return `#/${CUSTOM_QUOTE_PATH}?${encoded}${deal ? `&${deal}` : ''}`;
}

export function writeCustomVehicle(storage, vehicle) {
  if (!storage) return false;
  const result = validateCustomVehicle(vehicle);
  if (!result.ok) return false;
  try {
    storage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(result.vehicle));
    return true;
  } catch {
    return false;
  }
}

export function readCustomVehicle(storage) {
  if (!storage) return null;
  try {
    const raw = JSON.parse(storage.getItem(CUSTOM_STORAGE_KEY) || 'null');
    const result = validateCustomVehicle(raw || {});
    return result.ok ? result.vehicle : null;
  } catch {
    return null;
  }
}
