#!/usr/bin/env node
// Convert a vAuto inventory report (.xlsx, .csv, or the AI Inventory Feed PDF)
// to data/inventory.json.
//   node scripts/import-vauto.mjs path/to/report.xlsx [data/inventory.json]
//   node scripts/import-vauto.mjs path/to/report.pdf  [data/inventory.json]
// Parsing rules live in src/vauto-parse.js so the email import and any later
// Supabase import reuse exactly the same logic.
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readXlsxRows } from './lib/xlsx.mjs';
import { normalizeVautoRows, parseCsv } from '../src/vauto-parse.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
let input = null;
let output = 'data/inventory.json';
let thumbsDir = 'assets/thumbs';
let skipThumbsExtract = false;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--skip-thumbs-extract') skipThumbsExtract = true;
  else if (a === '--thumbs-dir' && args[i + 1]) thumbsDir = args[++i];
  else if (a.startsWith('--thumbs-dir=')) thumbsDir = a.slice('--thumbs-dir='.length);
  else if (a.startsWith('-')) {
    console.error(`Unknown flag: ${a}`);
    process.exit(1);
  } else if (!input) input = a;
  else output = a;
}
if (!input) {
  console.error('Usage: node scripts/import-vauto.mjs <report.xlsx|report.csv|report.pdf> [out.json]');
  process.exit(1);
}

function resolve(p) {
  return isAbsolute(p) ? p : p;
}

let reportPath = resolve(input);
let pdfPath = null;
if (/\.pdf$/i.test(reportPath)) {
  pdfPath = reportPath;
  const csvPath = join(mkdtempSync(join(tmpdir(), 'vauto-pdf-')), 'report.csv');
  const py = join(root, 'scripts/parse-vauto-pdf.py');
  const r = spawnSync('python3', [py, pdfPath, '--csv', csvPath], { stdio: 'inherit', cwd: root });
  if (r.status) process.exit(r.status ?? 1);
  reportPath = csvPath;
}

const buf = readFileSync(reportPath);
const rows = /\.csv$/i.test(reportPath) ? parseCsv(buf.toString('utf8')) : readXlsxRows(buf);
const { vehicles, warnings } = normalizeVautoRows(rows);
// No photo column in this report? Keep any thumbnail already on disk
// (PDF extract or a previous import: assets/thumbs/STOCK.jpg).
for (const v of vehicles) {
  const thumb = `${thumbsDir.replace(/\/$/, '')}/${v.stock}.jpg`;
  if (!v.photo && /^[A-Za-z0-9_-]+$/.test(v.stock) && existsSync(thumb)) v.photo = thumb.startsWith('assets/') ? thumb : `assets/thumbs/${v.stock}.jpg`;
}
const source = pdfPath ? 'vAuto AI Inventory Feed' : 'vAuto report';
const out = { generatedAt: new Date().toISOString(), source, count: vehicles.length, vehicles };
writeFileSync(output, JSON.stringify(out, null, 2) + '\n');

if (pdfPath && !skipThumbsExtract) {
  const py = join(root, 'scripts/extract-pdf-thumbs.py');
  const r = spawnSync('python3', [py, pdfPath, '--out', thumbsDir, '--inventory', output], { stdio: 'inherit', cwd: root });
  if (r.status) process.exit(r.status ?? 1);
}

// Drop thumbnail files for stock numbers that are no longer in inventory.
if (existsSync(thumbsDir)) {
  const keep = new Set(vehicles.map((v) => v.stock));
  for (const name of readdirSync(thumbsDir)) {
    const m = name.match(/^([A-Za-z0-9_-]+)\.(jpe?g|png|webp)$/i);
    if (!m) continue;
    if (!keep.has(m[1])) unlinkSync(join(thumbsDir, name));
  }
}

const written = JSON.parse(readFileSync(output, 'utf8'));
const byType = (written.vehicles || vehicles).reduce((a, v) => ((a[v.type ?? 'Unknown'] = (a[v.type ?? 'Unknown'] || 0) + 1), a), {});
console.log(`Wrote ${written.count ?? vehicles.length} vehicles to ${output}`, byType);
for (const w of warnings) console.warn('warning:', w);
