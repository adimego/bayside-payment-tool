#!/usr/bin/env node
// Convert a vAuto inventory report (.xlsx or .csv) to data/inventory.json.
//   node scripts/import-vauto.mjs path/to/report.xlsx [data/inventory.json]
// Parsing rules live in src/vauto-parse.js so the Supabase import (later
// phase) reuses exactly the same logic.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { readXlsxRows } from './lib/xlsx.mjs';
import { normalizeVautoRows, parseCsv } from '../src/vauto-parse.js';

const [input, output = 'data/inventory.json'] = process.argv.slice(2);
if (!input) {
  console.error('Usage: node scripts/import-vauto.mjs <report.xlsx|report.csv> [out.json]');
  process.exit(1);
}
const buf = readFileSync(input);
const rows = /\.csv$/i.test(input) ? parseCsv(buf.toString('utf8')) : readXlsxRows(buf);
const { vehicles, warnings } = normalizeVautoRows(rows);
// No photo column in this report? Keep any thumbnail already pulled from the
// PDF version (scripts/extract-pdf-thumbs.py -> assets/thumbs/STOCK.jpg).
for (const v of vehicles) {
  const thumb = `assets/thumbs/${v.stock}.jpg`;
  if (!v.photo && /^[A-Za-z0-9_-]+$/.test(v.stock) && existsSync(thumb)) v.photo = thumb;
}
const out = { generatedAt: new Date().toISOString(), source: 'vAuto report', count: vehicles.length, vehicles };
writeFileSync(output, JSON.stringify(out, null, 2) + '\n');
const byType = vehicles.reduce((a, v) => ((a[v.type ?? 'Unknown'] = (a[v.type ?? 'Unknown'] || 0) + 1), a), {});
console.log(`Wrote ${vehicles.length} vehicles to ${output}`, byType);
for (const w of warnings) console.warn('warning:', w);
