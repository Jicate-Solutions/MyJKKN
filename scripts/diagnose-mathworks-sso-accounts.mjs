#!/usr/bin/env node
/**
 * Verify that the MathWorks SAML SSO test accounts can actually complete a
 * SP-initiated login and produce a usable assertion.
 *
 *   node scripts/diagnose-mathworks-sso-accounts.mjs
 *   node scripts/diagnose-mathworks-sso-accounts.mjs a@jkkn.ac.in b@jkkn.ac.in
 *
 * WHY THIS ISN'T JUST "does a profiles row exist":
 * /api/saml/sso resolves the profile with `.eq('id', authUser.id)` — the
 * auth.users id, NOT the email. A profiles row that exists under a DIFFERENT
 * id (a pre-registered/orphan row that was never migrated) therefore fails the
 * lookup and the user gets AuthnFailed, even though the email "is in the
 * system". So we check BOTH sides and compare the ids.
 *
 * Read-only. Never writes.
 */

import { createClient } from '@supabase/supabase-js';
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const SUPA = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Mirrors MYJKKN_TO_MATHWORKS_AFFILIATION in types/saml.ts. Anything not listed
// falls back to 'student' — which is a silent downgrade for a faculty tester.
const AFFILIATION = {
  student: 'student', faculty: 'faculty', staff: 'staff',
  admin: 'employee', super_admin: 'employee', hod: 'faculty',
  principal: 'faculty', librarian: 'staff', accountant: 'staff',
};

const EMAILS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['student@jkkn.ac.in', 'faculty@jkkn.ac.in', 'boobalan.a@jkkn.ac.in', 'viswanathan.s@jkkn.ac.in'];

/** GoTrue admin REST — supabase-js v2 has no getUserByEmail. */
async function findAuthUser(email) {
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
  );
  if (!res.ok) throw new Error(`admin/users ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return (body.users || []).find((u) => (u.email || '').toLowerCase() === email.toLowerCase()) || null;
}

let blockers = 0;
let warnings = 0;

console.log('\n══ MathWorks SAML SSO — test-account readiness ══');

for (const email of EMAILS) {
  console.log(`\n── ${email} ─────────────────────────────`);

  const authUser = await findAuthUser(email).catch((e) => {
    console.log('  auth lookup FAILED:', e.message);
    return undefined;
  });
  if (authUser === undefined) { blockers++; continue; }

  // profiles row keyed by EMAIL (what a human would look for)
  const { data: byEmail } = await SUPA
    .from('profiles')
    .select('id, email, full_name, role, is_active, is_pre_registered, profile_completed')
    .ilike('email', email)
    .maybeSingle();

  // profiles row keyed by AUTH ID (what /api/saml/sso actually queries)
  const byId = authUser
    ? (await SUPA
        .from('profiles')
        .select('id, email, full_name, role, is_active, is_pre_registered, profile_completed')
        .eq('id', authUser.id)
        .maybeSingle()).data
    : null;

  if (!authUser) {
    console.log('  auth.users        : ✗ MISSING');
    console.log('    → Never signed in via Google. The row is created on first');
    console.log('      OAuth login, so this alone is not fatal — but the Google');
    console.log('      Workspace mailbox MUST exist (check Google Admin).');
    if (byEmail) {
      console.log(`    → A profiles row DOES exist (id ${byEmail.id}, `
        + `is_pre_registered=${byEmail.is_pre_registered}). On first login the`);
      console.log('      callback migrates it via migrate_pre_registered_profile_to_auth.');
    } else {
      console.log('    → and NO profiles row either: first SAML login will reach');
      console.log('      /api/saml/sso with no profile → AuthnFailed. BLOCKER.');
      blockers++;
    }
    continue;
  }

  console.log(`  auth.users        : ✓ ${authUser.id}`);
  console.log(`    last_sign_in_at : ${authUser.last_sign_in_at || '(never)'}`);
  console.log(`    confirmed       : ${authUser.email_confirmed_at ? 'yes' : 'NO'}`);

  if (!byId) {
    console.log('  profiles (by id)  : ✗ MISSING  ← /api/saml/sso will raise AuthnFailed');
    blockers++;
    if (byEmail) {
      console.log(`    → but a row EXISTS under a different id: ${byEmail.id}`);
      console.log('      This is the orphan-profile split. The email looks "registered"');
      console.log('      while the SAML lookup (by auth id) finds nothing.');
    }
    continue;
  }

  console.log(`  profiles (by id)  : ✓ ${byId.id}`);
  if (byEmail && byEmail.id !== byId.id) {
    console.log(`    ⚠ a SECOND profiles row shares this email: ${byEmail.id}`);
    warnings++;
  }

  // Fields the assertion is built from
  const role = byId.role || '(null)';
  const affiliation = AFFILIATION[byId.role] || 'student';
  const mapped = Object.prototype.hasOwnProperty.call(AFFILIATION, byId.role);
  console.log(`  role              : ${role} → Affiliation "${affiliation}"`
    + (mapped ? '' : '  ⚠ UNMAPPED, silently defaulted to student'));
  if (!mapped) warnings++;

  const fullName = (byId.full_name || '').trim();
  if (!fullName) {
    console.log('  full_name         : ✗ EMPTY');
    console.log('    → displayName falls back to the profile UUID, and givenName/sn');
    console.log('      are sent empty. MathWorks may reject or show a UUID as the name.');
    warnings++;
  } else {
    // /api/saml/sso splits on the FIRST space, so a stored title prefix
    // ("Mr. Ranjith K") is emitted as givenName="Mr." — see TITLES below.
    const parts = fullName.split(/\s+/);
    const given = parts[0];
    const sn = parts.slice(1).join(' ');
    const TITLES = /^(mr|mrs|ms|miss|dr|prof|shri|smt|er|capt|rev)\.?$/i;
    const titled = TITLES.test(given);
    console.log(`  full_name         : ${titled ? '⚠' : '✓'} "${fullName}"  → givenName="${given}" sn="${sn}"`);
    if (titled) {
      console.log(`    → givenName is the TITLE, not the name. MathWorks receives`);
      console.log(`      givenName="${given}", sn="${sn}". Strip the prefix from`);
      console.log('      profiles.full_name, or teach the name split to skip titles.');
      warnings++;
    }
  }

  if (!byId.email) {
    console.log('  email             : ✗ NULL — this becomes the SAML NameID. BLOCKER.');
    blockers++;
  } else {
    console.log(`  email (NameID)    : ✓ ${byId.email}`);
  }

  if (byId.is_active === false) {
    console.log('  is_active         : ✗ FALSE');
    console.log('    → NOTE: /api/saml/sso does NOT check is_active, so this account');
    console.log('      STILL receives a valid assertion today (open finding #2).');
    warnings++;
  } else {
    console.log('  is_active         : ✓ true');
  }
}

console.log('\n── Registered SAML Service Providers ─────────');
const { data: sps, error: spErr } = await SUPA
  .from('saml_service_providers')
  .select('name, entity_id, assertion_consumer_service_url, is_active');

if (spErr) {
  console.log('  query error:', spErr.message);
  blockers++;
} else if (!sps?.length) {
  console.log('  ✗ none registered — every AuthnRequest fails "Unknown service provider". BLOCKER.');
  blockers++;
} else {
  for (const sp of sps) {
    console.log(`  ${sp.is_active ? '✓' : '✗'} ${sp.name}`);
    console.log(`      entity_id : ${sp.entity_id}`);
    console.log(`      ACS       : ${sp.assertion_consumer_service_url}`);
    if (!sp.is_active) { console.log('      ⚠ INACTIVE — AuthnRequests rejected'); warnings++; }
  }
}

console.log(`\n══ ${blockers} blocker(s), ${warnings} warning(s) ══`);
console.log('Not checkable from the DB: whether each address is a real Google');
console.log('Workspace mailbox with a usable 2SV method. Verify in Google Admin.\n');
process.exit(blockers ? 1 : 0);
