#!/usr/bin/env node
// Rebuild data/tax-rates.json from the public sources documented in the README.
// Usage: node scripts/build-tax-data.mjs

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'data', 'tax-rates.json');

const PREFIX_URL = 'https://raw.githubusercontent.com/alecperkins/zip-state/main/scripts/data/ranges.json';
const STATES_URL = 'https://raw.githubusercontent.com/receiptedit/us-sales-tax-2026/main/us-sales-tax-2026.json';
const DEEPCALC_ROWS = 'https://api.deepcalc.com/v1/workbooks/sht_01kypqf6rsfesvr2hp9m5gsp0q/tables/b_nwb12r2e/rows';

const US_STATES = new Set(['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']);
const STALE_AS_OF = new Set(['2008Q4', '2012Q4', '2018Q1', '2019Q2', '2023Q1']);
const UNIT = 100000;
const pack = (rate) => Math.round(Number(rate) * UNIT);

async function getJson(url, { params } = {}) {
  const u = new URL(url);
  if (params) for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v));
  const res = await fetch(u, { headers: { 'User-Agent': 'BaysidePaymentTool/1.0 (tax-data refresh)' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${u}`);
  return res.json();
}

function expandPrefixes(ranges) {
  const prefixes = {};
  for (const [st, rs] of Object.entries(ranges)) {
    if (st === 'null' || !US_STATES.has(st)) continue;
    for (const rng of rs) {
      const a = Number(rng[0]);
      const b = Number(rng[rng.length > 1 ? rng.length - 1 : 0]);
      for (let n = a; n <= b; n++) prefixes[String(n).padStart(3, '0')] = st;
    }
  }
  // USPS unique/government ZIPs 202-205 are Washington, DC (zip-state only lists 200).
  for (let n = 202; n <= 205; n++) prefixes[String(n)] = 'DC';
  return Object.fromEntries(Object.entries(prefixes).sort(([a], [b]) => a.localeCompare(b)));
}

async function allDeepCalcRows() {
  const rows = [];
  let offset = 0;
  const limit = 2000;
  for (;;) {
    const page = await getJson(DEEPCALC_ROWS, { ref: 'main', limit, offset });
    const batch = page.rows || [];
    rows.push(...batch);
    process.stderr.write(`DeepCalc ${rows.length}/${page.total ?? '?'}\n`);
    if (!batch.length || (page.total != null && rows.length >= page.total)) break;
    offset = typeof page.next === 'number' ? page.next : offset + batch.length;
  }
  return rows;
}

const ranges = await getJson(PREFIX_URL);
const receipt = await getJson(STATES_URL);
const prefixes = expandPrefixes(ranges);

const states = {};
for (const s of receipt.states) states[s.code] = pack(Number(s.salesTaxRate) / 100);
states.DC = pack(0.06); // DC Office of Tax and Revenue, 6.00% statewide
const statesOut = Object.fromEntries(Object.entries(states).sort(([a], [b]) => a.localeCompare(b)));

const zips = {};
for (const r of await allDeepCalcRows()) {
  if (STALE_AS_OF.has(r.as_of)) continue;
  const zip = String(r.zip ?? '').padStart(5, '0');
  if (!/^\d{5}$/.test(zip) || r.dominant_rate == null || !r.state) continue;
  const val = pack(r.dominant_rate);
  if (states[r.state] != null && val === states[r.state]) continue;
  zips[zip] = val;
}
const zipsOut = Object.fromEntries(Object.entries(zips).sort(([a], [b]) => a.localeCompare(b)));

const out = {
  asOf: '2026-Q3',
  source: {
    states: 'ReceiptEdit US State Sales Tax Dataset 2026.1 (https://github.com/receiptedit/us-sales-tax-2026), last updated 2026-06-17, MIT. District of Columbia 6.00% statewide rate from the DC Office of Tax and Revenue.',
    zips: 'DeepCalc US sales-tax ZIP table (https://deepcalc.com/data/us-sales-tax/zip), dominant combined rate; primarily 2026 Q3 (Ohio 2026 Q1, Iowa 2025 Q3, Nevada 2025 Q4). Only ZIPs that differ from the state base rate are stored.',
    prefixes: 'USPS ZIP Code prefixes via alecperkins/zip-state (CC0). Prefixes 202-205 are mapped to DC (USPS unique/government ZIPs).',
  },
  unit: UNIT,
  states: statesOut,
  prefixes,
  zips: zipsOut,
};

writeFileSync(OUT, JSON.stringify(out));
process.stderr.write(`Wrote ${OUT} (${prefixes && Object.keys(prefixes).length} prefixes, ${Object.keys(statesOut).length} states, ${Object.keys(zipsOut).length} ZIP overrides)\n`);
