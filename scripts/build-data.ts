/**
 * Validates and normalizes imorte/passport-index-data's passport-index.json
 * into src/data/visa.json.
 *
 * Usage: npm run build:data -- <path/to/passport-index.json> [snapshot-date]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeEntry } from '../src/data/codec.ts';
import type { Entry, Status, VisaFile } from '../src/data/types.ts';

const STATUS_MAP: Record<string, Status> = {
  'visa free': 'visa-free',
  eta: 'eta',
  'visa on arrival': 'voa',
  'e-visa': 'e-visa',
  'visa required': 'required',
  'no admission': 'blocked',
};

// Intl.DisplayNames gives good short names; these few are awkward.
const NAME_OVERRIDES: Record<string, string> = {
  PS: 'Palestine',
  HK: 'Hong Kong',
  MO: 'Macao',
  CD: 'DR Congo',
  CG: 'Congo',
  CI: 'Ivory Coast',
  CV: 'Cape Verde',
  SZ: 'Eswatini',
  MK: 'North Macedonia',
  CZ: 'Czech Republic',
  TL: 'East Timor',
};

function fail(message: string): never {
  console.error(`build-data: ${message}`);
  process.exit(1);
}

const [inputArg, snapshotArg] = process.argv.slice(2);
if (!inputArg) fail('missing input path (passport-index.json)');

const raw = JSON.parse(readFileSync(resolve(inputArg), 'utf8')) as Record<
  string,
  Record<string, { status: string; days?: number }>
>;

const codes = Object.keys(raw).sort();
const codeSet = new Set(codes);
const counts: Record<string, number> = {};
let entries = 0;
let droppedDays = 0;
const data: VisaFile['data'] = {};

for (const passport of codes) {
  const row = raw[passport];
  const destinations = Object.keys(row).sort();
  data[passport] = {};

  if (passport in row) fail(`${passport} has an entry for itself`);
  if (destinations.length !== codes.length - 1) {
    fail(`${passport} has ${destinations.length} destinations, expected ${codes.length - 1}`);
  }

  for (const dest of destinations) {
    if (!codeSet.has(dest)) fail(`${passport} -> ${dest}: unknown destination code`);
    const cell = row[dest];
    const status = STATUS_MAP[cell.status];
    if (!status) fail(`${passport} -> ${dest}: unknown status "${cell.status}"`);

    const entry: Entry = { status };
    if (cell.days != null) {
      if (!Number.isInteger(cell.days) || cell.days <= 0) {
        fail(`${passport} -> ${dest}: bad days value ${String(cell.days)}`);
      }
      if (status === 'required' || status === 'blocked') droppedDays++;
      else entry.days = cell.days;
    }

    data[passport][dest] = encodeEntry(entry);
    counts[status] = (counts[status] ?? 0) + 1;
    entries++;
  }
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const names: Record<string, string> = {};
for (const code of codes) {
  names[code] = NAME_OVERRIDES[code] ?? regionNames.of(code) ?? code;
  if (names[code] === code) console.warn(`build-data: no display name for ${code}`);
}

const output: VisaFile = {
  meta: {
    source: 'https://github.com/imorte/passport-index-data',
    license: 'MIT',
    snapshot: snapshotArg ?? 'unknown',
  },
  names,
  codes,
  data,
};

const outPath = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/visa.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(output));

console.log(`build-data: ${codes.length} passports, ${entries} entries`);
console.log('build-data: status counts', counts);
console.log(`build-data: dropped days on ${droppedDays} required/blocked entries`);
console.log(`build-data: wrote ${outPath}`);
