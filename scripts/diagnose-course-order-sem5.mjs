#!/usr/bin/env node
/**
 * Diagnose COE course_order values for a given regulation + semester.
 *
 * Usage:
 *   node scripts/diagnose-course-order-sem5.mjs <coe-institutions-id> <regulation-code> [semester-code]
 *
 * Example:
 *   node scripts/diagnose-course-order-sem5.mjs <uuid> R-2024 V
 *
 * Reads COE credentials from .env (COE_API_URL, COE_API_KEY_ID, COE_API_SECRET).
 * Prints one row per mapping with course_code, course_order, program_code, semester_code.
 * Use this to confirm whether COE actually has course_order=1 saved for the rows
 * the user expects, or whether the value is still null on the server.
 */

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const COE_API_URL = process.env.COE_API_URL;
const COE_API_KEY_ID = process.env.COE_API_KEY_ID;
const COE_API_SECRET = process.env.COE_API_SECRET;

if (!COE_API_URL || !COE_API_KEY_ID || !COE_API_SECRET) {
  console.error('Missing COE credentials in .env (COE_API_URL, COE_API_KEY_ID, COE_API_SECRET)');
  process.exit(1);
}

const [coeInstId, regulationCode, semesterCode] = process.argv.slice(2);

if (!coeInstId || !regulationCode) {
  console.error('Usage: node scripts/diagnose-course-order-sem5.mjs <coe-institutions-id> <regulation-code> [semester-code]');
  process.exit(1);
}

const params = new URLSearchParams({
  institutions_id: coeInstId,
  regulation_code: regulationCode,
  is_active: 'true',
  details: 'false',
  limit: '500',
});
if (semesterCode) params.set('semester_code', semesterCode);

const url = `${COE_API_URL.replace(/\/$/, '')}/api/v1/course-mapping?${params}`;

const res = await fetch(url, {
  headers: {
    'X-API-Key-Id': COE_API_KEY_ID,
    'X-API-Secret': COE_API_SECRET,
  },
});

if (!res.ok) {
  console.error(`COE API responded ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const json = await res.json();
const rows = json?.data ?? [];

console.log(`\nFound ${rows.length} mappings for regulation=${regulationCode}${semesterCode ? ` sem=${semesterCode}` : ''}\n`);
console.log('course_code'.padEnd(18), 'order'.padEnd(8), 'sem'.padEnd(6), 'program');
console.log('-'.repeat(60));

for (const r of rows) {
  const code = String(r.course_code ?? '');
  const order = r.course_order == null ? '(null)' : String(r.course_order);
  const sem = String(r.semester_code ?? '-');
  const prog = String(r.program_code ?? '-');
  console.log(code.padEnd(18), order.padEnd(8), sem.padEnd(6), prog);
}

const nullCount = rows.filter((r) => r.course_order == null).length;
console.log('-'.repeat(60));
console.log(`Total: ${rows.length}, with course_order set: ${rows.length - nullCount}, null: ${nullCount}`);
