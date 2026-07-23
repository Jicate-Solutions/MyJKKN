#!/usr/bin/env node
/**
 * Applies 20260516_bos_members_no_duplicates.sql via the Supabase Management
 * API. Same pattern as scripts/apply-pending-bos-migrations.mjs.
 *
 * Before running, this script first scans for pre-existing duplicate rows.
 * If any are found, the CREATE UNIQUE INDEX would fail, so we surface them
 * for cleanup instead of producing a misleading error.
 *
 * Safe to re-run: CREATE UNIQUE INDEX IF NOT EXISTS is idempotent.
 *
 * Usage:
 *   node scripts/apply-bos-members-dedup-migration.mjs
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
if (!accessToken) {
  console.error('✗ SUPABASE_ACCESS_TOKEN missing from .env');
  process.exit(2);
}
if (!supabaseUrl) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL missing from .env');
  process.exit(2);
}

const match = supabaseUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
if (!match) {
  console.error(`✗ Could not extract project ref from ${supabaseUrl}`);
  process.exit(2);
}
const projectRef = match[1];
console.log(`Project: ${projectRef}\n`);

async function runSql(sql) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`HTTP ${r.status}: ${text}`);
  }
  return r.json();
}

// ── Pre-flight: detect any existing duplicates that would block the index ─────
console.log('▸ Scanning bos_members for existing duplicates...');
const dupStaff = await runSql(`
  SELECT composition_id, staff_id, COUNT(*) AS n
  FROM bos_members
  WHERE staff_id IS NOT NULL
  GROUP BY composition_id, staff_id
  HAVING COUNT(*) > 1;
`);
const dupExpert = await runSql(`
  SELECT composition_id, expert_id, COUNT(*) AS n
  FROM bos_members
  WHERE expert_id IS NOT NULL
  GROUP BY composition_id, expert_id
  HAVING COUNT(*) > 1;
`);

const dupStaffRows = Array.isArray(dupStaff) ? dupStaff : (dupStaff?.result ?? []);
const dupExpertRows = Array.isArray(dupExpert) ? dupExpert : (dupExpert?.result ?? []);

if (dupStaffRows.length > 0 || dupExpertRows.length > 0) {
  console.log(`\n✗ Found ${dupStaffRows.length} duplicate staff pair(s) and ${dupExpertRows.length} duplicate expert pair(s).`);
  console.log('  The UNIQUE indexes will fail to create until these are cleaned up.');
  if (dupStaffRows.length > 0) {
    console.log('\n  Duplicate (composition_id, staff_id) groups:');
    for (const row of dupStaffRows.slice(0, 10)) {
      console.log(`    composition=${row.composition_id}  staff=${row.staff_id}  count=${row.n}`);
    }
  }
  if (dupExpertRows.length > 0) {
    console.log('\n  Duplicate (composition_id, expert_id) groups:');
    for (const row of dupExpertRows.slice(0, 10)) {
      console.log(`    composition=${row.composition_id}  expert=${row.expert_id}  count=${row.n}`);
    }
  }
  console.log('\n  Suggested cleanup query (keeps the oldest row per group):');
  console.log(`    DELETE FROM bos_members m1
    USING bos_members m2
    WHERE m1.composition_id = m2.composition_id
      AND m1.staff_id = m2.staff_id
      AND m1.staff_id IS NOT NULL
      AND m1.created_at > m2.created_at;`);
  process.exit(1);
}
console.log('  ✓ No duplicates found.\n');

// ── Apply the migration ──────────────────────────────────────────────────────
const file = '20260516_bos_members_no_duplicates.sql';
const path = resolve('supabase/migrations', file);
const sql = readFileSync(path, 'utf8');

console.log(`▸ Applying ${file} (${sql.length} bytes)`);
try {
  await runSql(sql);
  console.log('  ✓ Migration applied successfully.');
  console.log('\n  Verify:');
  console.log("    SELECT indexname FROM pg_indexes WHERE tablename='bos_members' AND indexname LIKE 'uniq_%';");
} catch (err) {
  console.log(`  ✗ FAILED: ${err.message}`);
  process.exit(1);
}
