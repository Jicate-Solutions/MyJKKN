// scripts/instasolver/build-suggested-places.ts
//
// Rebuilds data/instasolver/suggested-places.json from the old InstaSolver
// export's clean-places.json (a local file on the Director's Mac — it is not
// in the repo, and it must not be). Only the aggregate is written:
// { institution, place, report_count } per place — see
// lib/instasolver/suggested-places.ts for what is kept and why.
//
// Usage:
//   npx tsx scripts/instasolver/build-suggested-places.ts [path/to/clean-places.json]
// Default source: ~/.config/obsidian/old-instasolver-export/clean-places.json

import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { aggregateSuggestedPlaces } from '../../lib/instasolver/suggested-places';

const source =
  process.argv[2] ?? join(homedir(), '.config/obsidian/old-instasolver-export/clean-places.json');
const target = join(__dirname, '../../data/instasolver/suggested-places.json');

const raw = JSON.parse(readFileSync(source, 'utf8')) as { mapping?: Record<string, unknown> };
if (!raw.mapping || typeof raw.mapping !== 'object') {
  throw new Error(`${source} has no "mapping" object`);
}
const places = aggregateSuggestedPlaces(raw.mapping as Parameters<typeof aggregateSuggestedPlaces>[0]);
writeFileSync(target, `${JSON.stringify(places, null, 2)}\n`);
process.stdout.write(`wrote ${places.length} suggested places to ${target}\n`);
