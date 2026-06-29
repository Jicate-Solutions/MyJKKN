/**
 * scripts/import/college-emails-for-induction.ts
 *
 * Populates learners_profiles.college_email for pre-onboarding (induction-only)
 * learners from an institution-provided spreadsheet, so they can sign in with
 * Google and auto-provision a student profile (the OAuth callback + the
 * auto_link_profile_to_approved_learner trigger both match on college_email).
 *
 * Spec: specs/pre-onboarding-induction-access-2026-06-29.md
 *
 * SAFE BY DEFAULT: dry-run unless --apply is passed. Idempotent — only fills
 * college_email where it is currently empty, and only for the 4 eligible statuses
 * (enquiry, enquiry_submitted, reserved, admitted). Never overwrites an existing
 * college_email and never touches active/graduated learners.
 *
 * The spreadsheet must have one column with a stable learner key and one with the
 * @jkkn.ac.in email. Match the key column to a learners_profiles column with
 * --key-field (default: student_email).
 *
 * Usage:
 *   tsx scripts/import/college-emails-for-induction.ts --file <path.xlsx> \
 *     [--sheet <name>] \
 *     [--key-col <header>]   (spreadsheet column holding the learner key; default auto-detect) \
 *     [--email-col <header>] (spreadsheet column holding the email;        default auto-detect) \
 *     [--key-field <col>]    (learners_profiles column to match on; default student_email) \
 *     [--apply]              (without this it only previews)
 *
 * Env (same as other scripts): NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL +
 *   SUPABASE_SERVICE_ROLE_KEY.
 *
 * Exit codes: 0 ok · 1 config/usage error
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';
import * as XLSX from 'xlsx';

const ELIGIBLE_STATUSES = ['enquiry', 'enquiry_submitted', 'reserved', 'admitted'];

// Learners_profiles columns we permit as the match key (allow-list, since the
// value is interpolated into a filter). student_email is the expected default.
const ALLOWED_KEY_FIELDS = new Set(['student_email', 'roll_number', 'application_id']);

// Header auto-detection candidates (lower-cased, non-alphanumerics stripped).
const KEY_HEADER_CANDIDATES = ['studentemail', 'rollnumber', 'rollno', 'registernumber', 'regno', 'applicationid', 'applicationno'];
const EMAIL_HEADER_CANDIDATES = ['collegeemail', 'institutionemail', 'jkknemail', 'email', 'emailid', 'officialemail'];

function parseArgs() {
  const args = argv.slice(2);
  const opts: Record<string, string | boolean> = { apply: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--apply') opts.apply = true;
    else if (a.startsWith('--')) opts[a.slice(2)] = args[++i];
  }
  return opts as {
    file?: string; sheet?: string; 'key-col'?: string; 'email-col'?: string;
    'key-field'?: string; apply: boolean;
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function detectColumn(headers: string[], candidates: string[]): string | undefined {
  const map = new Map(headers.map((h) => [norm(h), h]));
  for (const c of candidates) {
    if (map.has(c)) return map.get(c);
  }
  // Fallback: substring contains
  for (const h of headers) {
    if (candidates.some((c) => norm(h).includes(c))) return h;
  }
  return undefined;
}

async function main() {
  const opts = parseArgs();

  if (!opts.file) {
    console.error('[import-college-emails] Missing --file <path.xlsx>');
    exit(1);
  }
  const keyField = opts['key-field'] || 'student_email';
  if (!ALLOWED_KEY_FIELDS.has(keyField)) {
    console.error(`[import-college-emails] --key-field must be one of: ${[...ALLOWED_KEY_FIELDS].join(', ')}`);
    exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('[import-college-emails] Missing env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
    exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  // --- Read the spreadsheet ---
  const wb = XLSX.read(readFileSync(opts.file), { cellDates: true });
  const sheetName = opts.sheet || wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    console.error(`[import-college-emails] Sheet "${sheetName}" not found. Available: ${wb.SheetNames.join(', ')}`);
    exit(1);
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
  if (rows.length === 0) {
    console.error('[import-college-emails] No data rows found.');
    exit(1);
  }

  const headers = Object.keys(rows[0]);
  const keyCol = opts['key-col'] || detectColumn(headers, KEY_HEADER_CANDIDATES);
  const emailCol = opts['email-col'] || detectColumn(headers, EMAIL_HEADER_CANDIDATES);
  if (!keyCol || !emailCol) {
    console.error('[import-college-emails] Could not resolve columns.');
    console.error(`  Headers found: ${headers.join(' | ')}`);
    console.error('  Pass --key-col and --email-col explicitly.');
    exit(1);
  }

  console.log(`[import-college-emails] ${opts.apply ? 'APPLY' : 'DRY-RUN'} | sheet="${sheetName}" rows=${rows.length}`);
  console.log(`  key column "${keyCol}" -> learners_profiles.${keyField} | email column "${emailCol}"`);

  let updated = 0, alreadySet = 0, notFound = 0, notEligible = 0, badRow = 0;

  for (const row of rows) {
    const keyVal = String(row[keyCol] ?? '').trim();
    const email = String(row[emailCol] ?? '').trim().toLowerCase();
    if (!keyVal || !email || !email.includes('@')) { badRow++; continue; }

    // Find the learner by the chosen key. Surface eligibility + current email so
    // we can report precisely instead of silently skipping.
    const { data: matches, error } = await supabase
      .from('learners_profiles')
      .select('id, lifecycle_status, college_email')
      .ilike(keyField, keyVal);

    if (error) {
      console.error(`  ! query failed for ${keyVal}: ${error.message}`);
      badRow++;
      continue;
    }
    if (!matches || matches.length === 0) { notFound++; continue; }

    for (const m of matches) {
      if (!ELIGIBLE_STATUSES.includes(m.lifecycle_status)) { notEligible++; continue; }
      if (m.college_email && m.college_email.trim() !== '') { alreadySet++; continue; }

      if (opts.apply) {
        const { error: upErr } = await supabase
          .from('learners_profiles')
          .update({ college_email: email })
          .eq('id', m.id);
        if (upErr) {
          console.error(`  ! update failed for ${m.id} (${keyVal}): ${upErr.message}`);
          badRow++;
          continue;
        }
      }
      updated++;
      if (!opts.apply && updated <= 10) console.log(`  would set ${keyVal} (${m.lifecycle_status}) -> ${email}`);
    }
  }

  console.log('--- summary ---');
  console.log(`  ${opts.apply ? 'updated' : 'would update'}: ${updated}`);
  console.log(`  already had college_email: ${alreadySet}`);
  console.log(`  matched but not induction-eligible: ${notEligible}`);
  console.log(`  no learner matched key: ${notFound}`);
  console.log(`  skipped (blank/invalid row): ${badRow}`);
  if (!opts.apply) console.log('\nDry-run only. Re-run with --apply to write changes.');
}

main().catch((e) => {
  console.error('[import-college-emails] Fatal:', e);
  exit(1);
});
