/**
 * Seed Parent Portal accounts — ONE ROW PER STUDENT.
 *
 * For every learner in a school institution (institutions.entity_type='school'),
 * creates ONE pp_parent_accounts row keyed by learner_profile_id, with the shared
 * password JKKN@100 (scrypt, same format as lib/auth/parent-password.ts). Father
 * AND mother use this one account + password. Siblings resolve LIVE at login
 * (shared parent mobile) — no link rows needed.
 *
 * SAFE BY DEFAULT (dry run). Pass --commit to write.
 * On --commit it also CLEANS UP the old per-mobile model: deletes
 * pp_parent_learner_links and any pp_parent_accounts rows with a NULL
 * learner_profile_id (the previous per-parent-contact accounts).
 * IDEMPOTENT: existing per-student accounts are left untouched (ignoreDuplicates),
 * so a parent's changed password is never reset.
 *
 * Usage:
 *   node scripts/seed-parent-accounts.mjs            # dry run
 *   node scripts/seed-parent-accounts.mjs --commit   # write
 *
 * Prereq: migrations 20260618_create_parent_portal_auth_tables.sql +
 * 20260619_pp_accounts_per_student.sql applied.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { createClient } from '@supabase/supabase-js';
import { scrypt as _scrypt, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(_scrypt);

const DEFAULT_PASSWORD = 'JKKN@100';
const COMMIT = process.argv.includes('--commit');
const COST = 16384;
const KEYLEN = 64;
const PAGE = 1000;
const CHUNK = 500;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function hashPassword(pw) {
  const salt = randomBytes(16);
  const derived = await scrypt(pw, salt, KEYLEN, { N: COST });
  return `scrypt$${COST}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

async function main() {
  console.log(`\n=== Seed Parent Accounts — one row per student (${COMMIT ? 'COMMIT' : 'DRY RUN'}) ===\n`);

  const probe = await db.from('pp_parent_accounts').select('id').limit(1);
  if (probe.error) {
    console.error('pp_parent_accounts not found. Apply the migrations first.\n', probe.error.message);
    process.exit(1);
  }

  // 1. School institutions.
  const { data: schools, error: schoolErr } = await db
    .from('institutions')
    .select('id, name')
    .eq('entity_type', 'school');
  if (schoolErr) throw schoolErr;
  const schoolIds = (schools ?? []).map((s) => s.id);
  console.log(`School institutions: ${schoolIds.length}`);
  if (!schoolIds.length) return;

  // 2. Page through school learners (one account each).
  const learnerIds = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('learners_profiles')
      .select('id')
      .in('institution_id', schoolIds)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    learnerIds.push(...data.map((r) => r.id));
    if (data.length < PAGE) break;
  }
  console.log(`School learners (→ 1 account each): ${learnerIds.length}`);

  if (!COMMIT) {
    console.log('\nDry run complete. Re-run with --commit to write.\n');
    return;
  }

  // 3. Clean up the OLD per-mobile model.
  const delLinks = await db.from('pp_parent_learner_links').delete().not('id', 'is', null);
  if (delLinks.error) console.warn('links cleanup:', delLinks.error.message);
  const delOld = await db.from('pp_parent_accounts').delete().is('learner_profile_id', null);
  if (delOld.error) console.warn('old-account cleanup:', delOld.error.message);

  // 4. Upsert one account per student (don't clobber existing passwords).
  const password_hash = await hashPassword(DEFAULT_PASSWORD);
  const rows = learnerIds.map((id) => ({
    learner_profile_id: id,
    password_hash,
    is_active: true,
  }));

  let inserted = 0;
  for (const batch of chunk(rows, CHUNK)) {
    const { data, error } = await db
      .from('pp_parent_accounts')
      .upsert(batch, { onConflict: 'learner_profile_id', ignoreDuplicates: true })
      .select('id');
    if (error) throw error;
    inserted += data?.length ?? 0;
  }

  console.log(`\nStudent accounts inserted (new): ${inserted}`);
  console.log(`Default password: ${DEFAULT_PASSWORD}\n`);
}

main().catch((e) => {
  console.error('Seed failed:', e.message ?? e);
  process.exit(1);
});
