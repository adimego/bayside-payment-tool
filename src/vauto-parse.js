// vAuto report -> normalized vehicle records.
// Pure functions (no file or DOM access) so the same logic can run in the
// repo's import script today and in the Supabase import function later
// (Postmark inbound email -> Edge Function -> inventory table).

export const VEHICLE_TYPES = ['Car', 'Truck', 'SUV', 'Van'];

// vAuto "Body" value -> vehicle type. Matching is by keyword so new variants
// (e.g. "2D Crew Cab", "4D Wagon") still land somewhere sensible.
const BODY_RULES = [
  { type: 'Van', test: /\b(van|minivan)\b/i },
  { type: 'Truck', test: /\b(crew cab|double cab|quad cab|extended cab|regular cab|king cab|access cab|supercrew|supercab|pickup|cab)\b/i },
  { type: 'SUV', test: /\b(sport utility|suv|crossover)\b/i },
  { type: 'Car', test: /\b(sedan|coupe|hatchback|convertible|wagon)\b/i },
];

export function vehicleTypeFromBody(body) {
  if (!body) return null;
  const rule = BODY_RULES.find((r) => r.test.test(String(body)));
  return rule ? rule.type : null;
}

// Makes with more than one word, checked before the one-word default.
const MULTI_WORD_MAKES = ['Land Rover', 'Alfa Romeo', 'Aston Martin', 'Mercedes-Benz', 'Rolls-Royce'];
// Models with more than one word; longest first so "Grand Cherokee L" wins over "Grand Cherokee".
const MULTI_WORD_MODELS = [
  'Grand Cherokee L', 'Grand Cherokee', 'Grand Wagoneer', 'Grand Caravan', 'Wagoneer S',
  'Encore GX', 'Trax Crossover',
  '2 Series', '3 Series', '4 Series', '5 Series', '7 Series', '8 Series',
  'Silverado 1500', 'Silverado 2500HD', 'Silverado 3500HD',
  'Sierra 1500', 'Sierra 2500HD', 'Sierra 3500HD',
  'Santa Fe', 'Santa Cruz', 'Grand Highlander', 'Model 3', 'Model Y', 'Range Rover Sport', 'Range Rover',
].sort((a, b) => b.length - a.length);

/** "2026 Jeep Grand Cherokee L Altitude" -> {year, make, model, trim} */
export function parseVehicleName(name) {
  const s = String(name ?? '').trim().replace(/\s+/g, ' ');
  const m = s.match(/^(\d{4})\s+(.*)$/);
  if (!m) return { year: null, make: '', model: '', trim: s };
  const year = Number(m[1]);
  let rest = m[2];
  let make = MULTI_WORD_MAKES.find((mk) => rest.toLowerCase().startsWith(mk.toLowerCase() + ' '));
  if (!make) make = rest.split(' ')[0];
  rest = rest.slice(make.length).trim();
  let model = MULTI_WORD_MODELS.find((md) => rest.toLowerCase() === md.toLowerCase() || rest.toLowerCase().startsWith(md.toLowerCase() + ' '));
  if (!model) model = rest.split(' ')[0] || '';
  const trim = rest.slice(model.length).trim();
  return { year, make, model, trim };
}

function clean(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function toNumber(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// Header text -> field name. Headers are compared lowercased with spaces collapsed.
const HEADER_MAP = {
  'stock #': 'stock', 'stock': 'stock', 'stock number': 'stock',
  'vehicle': 'vehicle',
  'certified': 'certified',
  'vin': 'vin',
  'new/used': 'newUsed', 'new/used n/u': 'newUsed', 'n/u': 'newUsed',
  'odometer': 'odometer', 'miles': 'odometer', 'mileage': 'odometer',
  'body': 'body',
  'color': 'color', 'exterior color': 'color',
  'interior color': 'interiorColor',
  'price': 'price',
};

function headerKey(h) {
  return String(h ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Normalize a table of rows (first row = headers) from the vAuto report.
 * @param {Array<Array<any>>} rows
 * @returns {{vehicles: object[], warnings: string[]}}
 */
export function normalizeVautoRows(rows) {
  const warnings = [];
  if (!rows || rows.length < 2) return { vehicles: [], warnings: ['Report has no data rows'] };
  const header = rows[0].map((h) => HEADER_MAP[headerKey(h)] ?? null);
  for (const need of ['stock', 'vehicle', 'price', 'body']) {
    if (!header.includes(need)) warnings.push(`Missing column: ${need}`);
  }
  const vehicles = [];
  const seen = new Set();
  for (let r = 1; r < rows.length; r++) {
    const raw = {};
    rows[r].forEach((v, c) => { if (header[c]) raw[header[c]] = v; });
    const stock = clean(raw.stock);
    if (!stock) continue; // blank line
    if (seen.has(stock)) { warnings.push(`Duplicate stock # ${stock} skipped`); continue; }
    seen.add(stock);
    const vehicle = clean(raw.vehicle) ?? '';
    const { year, make, model, trim } = parseVehicleName(vehicle);
    const body = clean(raw.body);
    const type = vehicleTypeFromBody(body);
    if (!type) warnings.push(`${stock}: unknown body "${body}"`);
    const price = toNumber(raw.price);
    const condition = String(clean(raw.newUsed) ?? '').toUpperCase().startsWith('U') ? 'Used' : 'New';
    vehicles.push({
      stock,
      vin: clean(raw.vin),
      name: vehicle,
      year, make, model, trim,
      condition,
      certified: /^(y|yes|true|1)$/i.test(String(clean(raw.certified) ?? '')),
      odometer: toNumber(raw.odometer),
      body,
      type,
      color: clean(raw.color),
      interiorColor: clean(raw.interiorColor),
      price: price && price > 0 ? price : null, // null -> Call for Price
    });
  }
  return { vehicles, warnings };
}

/** Minimal RFC 4180 CSV parser (vAuto can also send CSV). */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  const s = String(text).replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}
