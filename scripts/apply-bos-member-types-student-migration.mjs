#!/usr/bin/env node
/**
 * Applies 20260724_bos_member_types_student.sql via the Supabase Management API.
 * Same pattern as scripts/apply-bos-member-type-catalog-migration.mjs.
 *
 *   1. adds 'student' to bos_member_types_base_type_check
 *   2. seeds CET's "Student Members" + "Department Autonomous Coordinator"
 *
 * Safe to re-run: DROP/ADD CONSTRAINT + ON CONFLICT DO NOTHING.
 *
 * Usage: node scripts/apply-bos-member-types-student-migration.mjs
 */
import { readFileSync } from 'node:fs';

for (const rawLine of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith('#')) continue;
  const eq = line.indexOf('=');
  if (eq < 1) continue;
  const k = line.slice(0, eq).trim();
  let v = line.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[k]) process.env[k] = v;
}

const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (!accessToken || !supabaseUrl) {
  console.error('✗ SUPABASE_ACCESS_TOKEN / NEXT_PUBLIC_SUPABASE_URL missing from .env');
  process.exit(2);
}
const projectRef = supabaseUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1];
if (!projectRef) {
  console.error(`✗ Could not extract project ref from ${supabaseUrl}`);
  process.exit(2);
}
console.log(`Project: ${projectRef}\n`);

async function runSql(sql) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!r.ok) throw new Error(`SQL failed (${r.status}): ${await r.text()}`);
  return r.json();
}

const sql = readFileSync('supabase/migrations/20260724_bos_member_types_student.sql', 'utf8');

console.log('Applying 20260724_bos_member_types_student.sql …');
await runSql(sql);
console.log('✓ Migration applied\n');

// ── Verify ────────────────────────────────────────────────────────────────────
const chk = await runSql(`
  SELECT pg_get_constraintdef(oid) LIKE '%student%' AS has_student
  FROM pg_constraint
  WHERE conrelid = 'public.bos_member_types'::regclass
    AND conname = 'bos_member_types_base_type_check';
`);
console.log(chk[0]?.has_student ? "✓ base_type CHECK allows 'student'" : "✗ 'student' NOT in CHECK");

const cet = await runSql(`
  SELECT t.name, t.base_type, t.sort_order, t.is_active
  FROM public.bos_member_types t
  JOIN public.institutions i ON i.id = t.institutions_id
  WHERE i.counselling_code = 'CET'
  ORDER BY t.sort_order;
`);
console.log('\nCET member types now:');
console.table(cet);
