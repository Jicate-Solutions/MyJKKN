#!/usr/bin/env node
/**
 * CET (JKKN College of Engineering and Technology) TA rate: ₹6 per km.
 *
 * CET has no rows in bos_ta_da_rates, so every CET claim currently falls back
 * to the flat SOP constants in lib/utils/bos/ta-da-rates.ts — external ₹1,500
 * sitting charge + ₹5/km round-trip travel. The institution's rate is ₹6/km,
 * and the rate table has no institution-wide row (it is keyed by
 * institutions_id + committee_name + member_type), so the rate is expressed as
 * one row per (council × travel-eligible member type).
 *
 * Scope — deliberately only the member types that can receive distance-based
 * travel at CET, all of which are uniformly expert-linked (external):
 *   Academic Expert · Alumni Member · Industry Expert · Subject Expert ·
 *   University Nominee · Student Members
 * Chairman / Faculty Members / Department Autonomous Coordinator are excluded
 * on purpose: those types are SPLIT between staff-linked members (₹1,000
 * internal) and expert-linked members (₹1,500 external), and a rate row can
 * only carry one sitting charge — configuring them would change honorarium for
 * one of the two groups. None of their members has a distance recorded, so
 * they receive no travel under any per-km rate.
 *
 * Honorarium is written at the value the SOP fallback already pays these types
 * (₹1,500 offline and online), so the ONLY behaviour change is ₹5/km → ₹6/km.
 * Existing claims are untouched — bos_ta_da_claims stores computed amounts, so
 * the new rate applies to claims generated after this runs.
 *
 * Idempotent: ON CONFLICT updates only the travel fields, never an honorarium
 * a super-admin may have since edited in the /bos/ta-da Rate Settings dialog.
 *
 * Usage:
 *   node scripts/seed-cet-ta-da-per-km.mjs           # dry run — prints the plan
 *   node scripts/seed-cet-ta-da-per-km.mjs --apply   # writes the rows
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

const APPLY = process.argv.includes('--apply');

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
  if (!r.ok) throw new Error(`SQL failed (${r.status}): ${await r.text()}`);
  return r.json();
}

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** The rate this script exists to set. */
const TA_PER_KM = 6;
/** Sitting charge the SOP fallback already pays these (external) types. */
const HONORARIUM = 1500;

/**
 * Member types that can receive distance-based travel at CET. Matched by NAME
 * against bos_member_types, because claim generation resolves a member's rate
 * through its catalog type name (20260710150000).
 */
const TARGET_TYPES = [
  'Academic Expert',
  'Alumni Member',
  'Industry Expert',
  'Subject Expert',
  'University Nominee',
  'Student Members',
];

console.log(`Project: ${projectRef}`);
console.log(`Mode:    ${APPLY ? 'APPLY' : 'DRY RUN (pass --apply to write)'}\n`);

// ── Resolve CET ───────────────────────────────────────────────────────────────
// counselling_code 'CET' is unique (no Aided/Self split, unlike CAS), so this
// is a single institution UUID — no sibling expansion needed.
const insts = await runSql(`
  SELECT id, name FROM institutions WHERE counselling_code = 'CET';
`);
if (insts.length !== 1) {
  console.error(`✗ Expected exactly 1 institution with counselling_code 'CET', got ${insts.length}`);
  process.exit(1);
}
const { id: institutionId, name: institutionName } = insts[0];
console.log(`Institution: ${institutionName}\n  ${institutionId}\n`);

// ── Councils: distinct committee NAMES (rates apply to a council kind across
// every composition's copy of it, so the ~8 copies collapse to one name). ─────
const councils = (
  await runSql(`
    SELECT DISTINCT trim(name) AS name
    FROM bos_committees
    WHERE institutions_id = ${q(institutionId)} AND is_active = true
    ORDER BY 1;
  `)
).map((r) => r.name);

// ── Member types present in CET's catalog ─────────────────────────────────────
const types = (
  await runSql(`
    SELECT trim(name) AS name, base_type
    FROM bos_member_types
    WHERE institutions_id = ${q(institutionId)} AND is_active = true
      AND trim(name) IN (${TARGET_TYPES.map(q).join(', ')})
    ORDER BY 1;
  `)
).map((r) => r.name);

const missing = TARGET_TYPES.filter(
  (t) => !types.some((n) => n.toLowerCase() === t.toLowerCase()),
);
if (missing.length > 0) {
  console.log(`⚠ Not in CET's member-type catalog (skipped): ${missing.join(', ')}\n`);
}

console.log(`Councils (${councils.length}):    ${councils.join(', ')}`);
console.log(`Member types (${types.length}): ${types.join(', ')}`);
console.log(`\nRows to write: ${councils.length * types.length}`);
console.log(
  `  honorarium ₹${HONORARIUM} offline / ₹${HONORARIUM} online · travel basis 'distance' · ₹${TA_PER_KM}/km\n`,
);

if (councils.length === 0 || types.length === 0) {
  console.error('✗ Nothing to write — no active councils or no matching member types.');
  process.exit(1);
}

const values = [];
for (const council of councils) {
  for (const type of types) {
    values.push(
      `(${q(institutionId)}, ${q(council)}, ${q(type)}, ${HONORARIUM}, ${HONORARIUM}, 'distance', ${TA_PER_KM}, 0, true)`,
    );
  }
}

// ON CONFLICT touches only the travel fields. A council whose sitting charges
// were customised in the UI keeps them; this script owns the per-km rate only.
const upsertSql = `
  INSERT INTO bos_ta_da_rates (
    institutions_id, committee_name, member_type,
    honorarium_amount, honorarium_amount_online,
    travel_basis, ta_per_km, travel_flat_amount, is_active
  ) VALUES
  ${values.join(',\n  ')}
  ON CONFLICT (institutions_id, committee_name, member_type) DO UPDATE SET
    travel_basis = EXCLUDED.travel_basis,
    ta_per_km    = EXCLUDED.ta_per_km,
    is_active    = true,
    updated_at   = now();
`;

if (!APPLY) {
  console.log('── SQL (not executed) ──');
  console.log(upsertSql.trim().slice(0, 1200) + (upsertSql.length > 1200 ? '\n  …' : ''));
  console.log('\nDry run complete. Re-run with --apply to write.');
  process.exit(0);
}

await runSql(upsertSql);
console.log('✓ Rates written\n');

// ── Verify ────────────────────────────────────────────────────────────────────
const back = await runSql(`
  SELECT committee_name, count(*) AS types,
         min(ta_per_km) AS min_per_km, max(ta_per_km) AS max_per_km,
         min(honorarium_amount) AS min_honorarium, max(honorarium_amount) AS max_honorarium
  FROM bos_ta_da_rates
  WHERE institutions_id = ${q(institutionId)} AND is_active = true
  GROUP BY 1 ORDER BY 1;
`);
console.table(back);

const offRate = await runSql(`
  SELECT count(*) AS n FROM bos_ta_da_rates
  WHERE institutions_id = ${q(institutionId)} AND is_active = true
    AND travel_basis = 'distance' AND ta_per_km <> ${TA_PER_KM};
`);
console.log(
  Number(offRate[0].n) === 0
    ? `✓ every active CET distance-basis rate is ₹${TA_PER_KM}/km`
    : `✗ ${offRate[0].n} active CET distance-basis rate(s) are NOT ₹${TA_PER_KM}/km`,
);

// Other institutions must be untouched — CAS keeps whatever it had configured.
const others = await runSql(`
  SELECT i.name AS institution, count(*) AS active_rates
  FROM bos_ta_da_rates r JOIN institutions i ON i.id = r.institutions_id
  WHERE r.is_active = true AND r.institutions_id <> ${q(institutionId)}
  GROUP BY 1 ORDER BY 1;
`);
console.log('\nOther institutions (unchanged):');
console.table(others);
