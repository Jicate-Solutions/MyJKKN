#!/usr/bin/env node
/**
 * Applies 20260729_bos_renumber_member_order.sql via the Supabase Management
 * API and smoke-tests the function against the largest composition.
 *
 * Safe to re-run: CREATE OR REPLACE + idempotent GRANTs, and the function
 * itself is a no-op when the roster is already contiguous.
 *
 * Usage: node scripts/apply-bos-renumber-member-order.mjs
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

console.log('Applying 20260729_bos_renumber_member_order.sql …');
await runSql(readFileSync('supabase/migrations/20260729_bos_renumber_member_order.sql', 'utf8'));
console.log('✓ Migration applied\n');

// ── Verify the function exists with the right grants ─────────────────────────
const fn = await runSql(`
  SELECT p.proname, p.prosecdef AS security_definer,
         has_function_privilege('service_role', p.oid, 'EXECUTE')  AS service_role_can_exec,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_exec
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'bos_renumber_member_order';
`);
console.log('Function:', JSON.stringify(fn[0]));
if (fn[0]?.authenticated_can_exec) {
  console.log('✗ WARNING: `authenticated` can execute — should be service_role only');
}

// ── Smoke test: idempotence on the largest composition ───────────────────────
const target = await runSql(`
  SELECT composition_id FROM bos_members GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;
`);
const compId = target[0].composition_id;
const first = await runSql(`SELECT public.bos_renumber_member_order('${compId}') AS changed;`);
const second = await runSql(`SELECT public.bos_renumber_member_order('${compId}') AS changed;`);
console.log(
  `\nSmoke test on ${compId}: first call changed ${first[0].changed} row(s), ` +
    `second changed ${second[0].changed} (expect 0 — idempotent)`,
);

// ── Global contiguity check ──────────────────────────────────────────────────
const gaps = await runSql(`
  SELECT composition_id, count(*) AS members, max(sort_order) AS max_rank
  FROM bos_members
  GROUP BY composition_id
  HAVING max(sort_order) <> count(*) OR min(sort_order) <> 1
  ORDER BY members DESC
  LIMIT 10;
`);
console.log(
  gaps.length === 0
    ? '✓ sort_order: every composition numbered 1..n with no gaps'
    : `Compositions not yet contiguous (${gaps.length} shown): ${JSON.stringify(gaps)}`,
);

// group_position must restart at 1 per (committee, member-type group).
const groupGaps = await runSql(`
  SELECT count(*) AS bad_groups FROM (
    SELECT m.composition_id,
           coalesce(m.committee_id::text, 'general') AS ck,
           coalesce(lower(btrim(t.name)), 'legacy:' || m.member_type) AS gk,
           count(*) AS n, min(m.group_position) AS lo, max(m.group_position) AS hi,
           count(DISTINCT m.group_position) AS distinct_n
    FROM bos_members m
    LEFT JOIN bos_member_types t ON t.id = m.member_type_id
    GROUP BY 1, 2, 3
  ) g
  WHERE lo <> 1 OR hi <> n OR distinct_n <> n;
`);
console.log(
  groupGaps[0].bad_groups === 0
    ? '✓ group_position: every group numbered 1..n, no gaps or duplicates'
    : `✗ ${groupGaps[0].bad_groups} group(s) with a broken group_position sequence`,
);

// Show the numbering for the Faculty Members group of a real board.
const sample = await runSql(`
  SELECT cm.name AS committee, coalesce(t.name, m.member_type) AS grp,
         m.group_position, m.sort_order, m.display_name
  FROM bos_members m
  LEFT JOIN bos_committees cm ON cm.id = m.committee_id
  LEFT JOIN bos_member_types t ON t.id = m.member_type_id
  WHERE lower(coalesce(t.name, '')) LIKE '%faculty%'
  ORDER BY m.composition_id, m.sort_order
  LIMIT 8;
`);
console.log('\nSample "Faculty Members" group (group_position / sort_order):');
for (const r of sample) {
  console.log(
    `  #${r.group_position}  (rank ${String(r.sort_order).padStart(2)})  ` +
      `${r.committee} / ${r.grp} — ${r.display_name}`,
  );
}
