#!/usr/bin/env node
/**
 * Applies 20260729_bos_members_backfill_sort_order.sql via the Supabase
 * Management API — persists each composition's roster order into
 * bos_members.sort_order.
 *
 * Runs a PREVIEW first (what would change, for one sample composition) unless
 * --apply is passed. Idempotent: re-running after a manual reorder is a no-op.
 *
 * Usage:
 *   node scripts/apply-bos-members-backfill-sort-order.mjs           # preview
 *   node scripts/apply-bos-members-backfill-sort-order.mjs --apply   # write
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

const migration = readFileSync(
  'supabase/migrations/20260729_bos_members_backfill_sort_order.sql',
  'utf8',
);

// The ORDER BY block is the contract between this backfill and buildRoster().
// Reuse the migration's own CTE for the preview so they can never drift.
const orderedCte = migration.slice(
  migration.indexOf('WITH ordered AS ('),
  migration.indexOf('UPDATE bos_members AS b'),
);

const apply = process.argv.includes('--apply');

// ── Preview ──────────────────────────────────────────────────────────────────
const pending = await runSql(`
  ${orderedCte}
  SELECT count(*) AS n
  FROM bos_members b JOIN ordered o ON o.id = b.id
  WHERE b.sort_order IS DISTINCT FROM o.rank;
`);
console.log(`Rows whose rank would change: ${pending[0].n}\n`);

const sample = await runSql(`
  ${orderedCte}
  SELECT c.composition_title,
         coalesce(cm.name, 'General') AS committee,
         coalesce(t.name, m.member_type) AS member_group,
         m.display_name,
         m.sort_order AS before,
         o.rank       AS after
  FROM bos_members m
  JOIN ordered o           ON o.id = m.id
  JOIN bos_compositions c  ON c.id = m.composition_id
  LEFT JOIN bos_committees cm   ON cm.id = m.committee_id
  LEFT JOIN bos_member_types t  ON t.id = m.member_type_id
  WHERE m.composition_id = (
    SELECT composition_id FROM bos_members GROUP BY 1 ORDER BY count(*) DESC LIMIT 1
  )
  ORDER BY o.rank;
`);
console.log(`Sample — largest composition ("${sample[0]?.composition_title ?? '?'}"):`);
for (const r of sample) {
  console.log(
    `  ${String(r.after).padStart(3)}  (was ${String(r.before).padStart(3)})  ` +
      `${r.committee} / ${r.member_group} — ${r.display_name}`,
  );
}
console.log('');

if (!apply) {
  console.log('Preview only. Re-run with --apply to write.');
  process.exit(0);
}

// ── Apply ────────────────────────────────────────────────────────────────────
console.log('Applying 20260729_bos_members_backfill_sort_order.sql …');
await runSql(migration);
console.log('✓ Migration applied\n');

// ── Verify ───────────────────────────────────────────────────────────────────
const left = await runSql(`
  ${orderedCte}
  SELECT count(*) AS n
  FROM bos_members b JOIN ordered o ON o.id = b.id
  WHERE b.sort_order IS DISTINCT FROM o.rank;
`);
console.log(`Rows still out of order: ${left[0].n} (expect 0)`);

const dist = await runSql(`
  SELECT count(*) FILTER (WHERE sort_order = 0) AS unordered,
         count(*) FILTER (WHERE sort_order > 0) AS ordered,
         count(*) AS total
  FROM bos_members;
`);
console.log(`sort_order distribution: ${JSON.stringify(dist[0])}`);

const dupes = await runSql(`
  SELECT composition_id, sort_order, count(*) AS n
  FROM bos_members
  GROUP BY 1, 2 HAVING count(*) > 1
  ORDER BY n DESC LIMIT 5;
`);
console.log(
  dupes.length === 0
    ? '✓ No duplicate ranks within any composition'
    : `✗ Duplicate ranks found: ${JSON.stringify(dupes)}`,
);
