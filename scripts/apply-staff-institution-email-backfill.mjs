#!/usr/bin/env node
/**
 * Backfills staff.institution_email where it is NULL.
 *
 * WHY: /hr/employees displays staff.institution_email (changed 2026-07-30).
 * That column has been nullable since 20260609150000, so some rows render '—'.
 * As of 2026-07-30 the live count is 5 rows NULL out of 856 staff.
 *
 * ── RULES (--rule=) ──────────────────────────────────────────────────────
 *   copy-personal   institution_email := email      (skips @nolog synthetics)
 *   phone-nolog     institution_email := <10 digits>@nolog.jkkn.local
 *   phone-jkkn      institution_email := <10 digits>@jkkn.ac.in
 *
 * ⚠ phone-jkkn PUTS FABRICATED ADDRESSES IN THE GOOGLE-OAUTH DOMAIN.
 *   synthetic-email.ts deliberately uses @nolog.jkkn.local because .local is a
 *   reserved TLD that can never be provisioned, keeping placeholder rows
 *   unreachable from login (Google auth is restricted to @jkkn.ac.in).
 *   @jkkn.ac.in is a REAL domain JKKN administers. Combined with the trigger
 *   below writing role=staff.role_key and is_pre_registered=true, any such
 *   address that is later created in Google Workspace becomes a working login
 *   that INHERITS THAT PROFILE AND ROLE. One of the 5 current rows is role=hod.
 *   Prefer phone-nolog (same shape, unownable domain) unless you specifically
 *   intend these people to be able to sign in.
 *
 * ⚠ SIDE EFFECT — not an inert column write. The BEFORE trigger
 * sync_staff_to_profiles() (20260515001001) gates on
 * `institution_email IS NOT NULL AND != ''` and will, per updated row:
 *   - UPDATE profiles.email for an already-linked profile, or
 *   - INSERT a new profiles row (is_pre_registered=true, role=staff.role_key).
 * The census counts both outcomes BEFORE anything is written.
 *
 * UNIQUE SAFETY: staff_institution_email_key is UNIQUE. Rows are skipped when
 * the value already exists in institution_email anywhere, or when two
 * candidates would produce the same value. The check is case-insensitive,
 * deliberately MORE conservative than the index — it may skip a row that would
 * have succeeded, but can never fail the batch.
 *
 * Usage:
 *   node scripts/apply-staff-institution-email-backfill.mjs --rule=phone-nolog
 *   node scripts/apply-staff-institution-email-backfill.mjs --rule=phone-nolog --apply
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
const APPLY = process.argv.includes('--apply');
const RULE = (process.argv.find((a) => a.startsWith('--rule='))?.split('=')[1]) ?? 'copy-personal';

// digits-only phone, last 10 — mirrors generateSyntheticEmail()'s slug rule.
const DIGITS = `right(regexp_replace(COALESCE(phone,''), '\\D', '', 'g'), 10)`;
const HAS_PHONE = `length(regexp_replace(COALESCE(phone,''), '\\D', '', 'g')) >= 10`;

const RULES = {
  'copy-personal': {
    value: 'email',
    eligible: `email IS NOT NULL AND btrim(email) <> '' AND email NOT LIKE '%@nolog.jkkn.local'`,
    note: 'copies the personal email verbatim (often @gmail.com)',
  },
  'phone-nolog': {
    value: `${DIGITS} || '@nolog.jkkn.local'`,
    eligible: HAS_PHONE,
    note: 'unownable domain — cannot ever become a login (recommended)',
  },
  'phone-jkkn': {
    value: `${DIGITS} || '@jkkn.ac.in'`,
    eligible: HAS_PHONE,
    note: '\x1b[31mREAL OAUTH DOMAIN — see the warning in this file\x1b[0m',
  },
};

const rule = RULES[RULE];
if (!rule) {
  console.error(`✗ Unknown --rule=${RULE}. Choose one of: ${Object.keys(RULES).join(', ')}`);
  process.exit(2);
}

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
  return (await r.json()).flat();
}

/**
 * Single source of truth for "candidate" and "safe to write". The census, the
 * sample and the UPDATE all reuse this verbatim, so the preview can never
 * disagree with what actually gets applied.
 */
const CTE = `
WITH candidates AS (
  SELECT id, staff_id, first_name, last_name, email, phone, login_enabled,
         profile_id, role_key,
         ${rule.value} AS proposed
  FROM staff
  WHERE institution_email IS NULL
    AND (${rule.eligible})
),
dupes AS (
  SELECT lower(proposed) AS k FROM candidates GROUP BY 1 HAVING COUNT(*) > 1
),
taken AS (
  SELECT DISTINCT lower(institution_email) AS k
  FROM staff WHERE institution_email IS NOT NULL
),
safe AS (
  SELECT c.* FROM candidates c
  WHERE lower(c.proposed) NOT IN (SELECT k FROM dupes)
    AND lower(c.proposed) NOT IN (SELECT k FROM taken)
),
skipped AS (
  SELECT c.*,
         CASE WHEN lower(c.proposed) IN (SELECT k FROM taken) THEN 'collides_with_existing'
              ELSE 'duplicate_within_batch' END AS reason
  FROM candidates c
  WHERE lower(c.proposed) IN (SELECT k FROM dupes)
     OR lower(c.proposed) IN (SELECT k FROM taken)
)`;

console.log(`Project: ${projectRef}`);
console.log(`Rule:    ${RULE} — ${rule.note}`);
console.log(`Mode:    ${APPLY ? '\x1b[31mAPPLY (writes)\x1b[0m' : 'PREVIEW (read-only)'}\n`);

const [row] = await runSql(`${CTE}
SELECT
  (SELECT COUNT(*) FROM staff)                                          AS staff_total,
  (SELECT COUNT(*) FROM staff WHERE institution_email IS NULL)          AS inst_email_null,
  (SELECT COUNT(*) FROM candidates)                                     AS candidates,
  (SELECT COUNT(*) FROM safe)                                           AS will_update,
  (SELECT COUNT(*) FROM skipped)                                        AS will_skip,
  (SELECT COUNT(*) FROM staff WHERE institution_email IS NULL
     AND NOT (${rule.eligible}))                                        AS ineligible,
  (SELECT COUNT(*) FROM safe s WHERE s.profile_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = s.profile_id))   AS profiles_relinked,
  (SELECT COUNT(*) FROM safe s WHERE NOT (
      s.profile_id IS NOT NULL AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = s.profile_id)
   ) AND NOT EXISTS (SELECT 1 FROM profiles p WHERE lower(p.email) = lower(s.proposed))) AS profiles_created`);

console.log('── Census ────────────────────────────────────────────');
console.log(`  staff rows total                  ${row.staff_total}`);
console.log(`  institution_email IS NULL         ${row.inst_email_null}`);
console.log(`  ineligible under this rule        ${row.ineligible}`);
console.log(`  \x1b[32mWILL UPDATE\x1b[0m                       ${row.will_update}`);
console.log(`  \x1b[33mWILL SKIP (UNIQUE unsafe)\x1b[0m         ${row.will_skip}`);
console.log('');
console.log('  \x1b[36mtrigger side effects\x1b[0m (sync_staff_to_profiles):');
console.log(`    existing profile re-stamped     ${row.profiles_relinked}`);
console.log(`    \x1b[31mNEW profiles INSERTed\x1b[0m           ${row.profiles_created}`);
console.log('');

const skipRows = await runSql(`${CTE}
SELECT reason, COUNT(*) AS n, min(proposed) AS example
FROM skipped GROUP BY reason ORDER BY n DESC`);
if (skipRows.length) {
  console.log('── Skipped (would violate staff_institution_email_key) ──');
  for (const s of skipRows) console.log(`  ${String(s.reason).padEnd(24)} ${String(s.n).padStart(4)}   e.g. ${s.example}`);
  console.log('');
}

const sampleRows = await runSql(`${CTE}
SELECT staff_id, first_name, last_name, role_key, proposed
FROM safe ORDER BY first_name LIMIT 20`);
if (sampleRows.length) {
  console.log('── Rows to update ──────────────────────────────────────');
  for (const s of sampleRows) {
    console.log(`  ${String(s.staff_id ?? '—').padEnd(9)} ${`${s.first_name} ${s.last_name ?? ''}`.trim().padEnd(22)} ${String(s.role_key).padEnd(8)} → ${s.proposed}`);
  }
  console.log('');
}

if (!APPLY) {
  console.log('\x1b[33mPREVIEW ONLY — nothing written.\x1b[0m');
  console.log(`Re-run with --apply to write. Each "NEW profile INSERTed" is a profiles`);
  console.log(`row carrying that staff member's role_key.`);
  process.exit(0);
}

if (RULE === 'phone-jkkn') {
  console.log('\x1b[31m⚠ phone-jkkn writes into the Google-OAuth domain @jkkn.ac.in.\x1b[0m');
  console.log('\x1b[31m  Any such address later created in Workspace becomes a working');
  console.log('  login inheriting the profile + role listed above.\x1b[0m\n');
}

console.log('\x1b[31mApplying…\x1b[0m');
await runSql(`${CTE}
UPDATE staff SET institution_email = safe.proposed, updated_at = NOW()
FROM safe WHERE staff.id = safe.id`);

const [after] = await runSql(
  `SELECT COUNT(*) AS still_null FROM staff WHERE institution_email IS NULL`);
console.log(`✓ Done. institution_email IS NULL is now ${after.still_null}`);
