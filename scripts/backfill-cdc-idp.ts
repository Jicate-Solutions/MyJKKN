#!/usr/bin/env tsx
/* eslint-disable no-console */
/**
 * scripts/backfill-cdc-idp.ts
 *
 * One-shot backfill for CDC Individual Development Plan (IDP) responses
 * collected via Google Form (~297 historical rows) into cdc_idp_responses.
 *
 * Created 2026-05-19 — Workstream B1.
 *
 * Why standalone (Path B): PR #969 (cdc_idp_responses module + API routes
 * + service layer + types) has not yet merged to jicate/main. Building an
 * admin API route here would require duplicating types or waiting for the
 * upstream merge. This standalone script runs against the service-role
 * key locally (or in an ops shell) and is fully idempotent.
 *
 * Usage:
 *   # Dry run — no writes, prints what would happen:
 *   npm run backfill:cdc-idp -- --csv path/to/idp-responses.csv --dry-run
 *
 *   # Real apply:
 *   npm run backfill:cdc-idp -- --csv path/to/idp-responses.csv
 *
 *   # Specify cycle (default '2024-25'):
 *   npm run backfill:cdc-idp -- --csv path/to/idp-responses.csv --cycle 2025-26
 *
 * Idempotency contract:
 *   - Each row is matched on (learner_id, academic_year_label).
 *   - If a row exists with source='native_form', we SKIP (never overwrite
 *     a learner's own native submission with imported data).
 *   - If a row exists with source='google_form_migration', we UPDATE the
 *     payload (re-import safe).
 *   - If no row exists, we INSERT.
 *   - Running the script twice with the same CSV yields zero new inserts.
 *
 * CSV expectations:
 *   The script accepts the standard Google Forms export. We look for these
 *   column headers (case-insensitive, whitespace-tolerant):
 *     - "Email address" or "Email" — required, used for learner lookup
 *     - "Timestamp" or "Submission timestamp" — optional, becomes submitted_at
 *   All other CSV columns are preserved verbatim into the `responses` object
 *   nested under aspirations.google_form_raw (so they show up in admin UI).
 *
 *   Best-effort field mapping (case-insensitive header match):
 *     - "Interests" / "Your interests" → interests jsonb (split on ",")
 *     - "Aspiring companies" → aspirations.aspiring_companies (string[])
 *     - "Preferred sectors" → aspirations.preferred_sectors (string[])
 *     - "Club picks" / "Clubs" → club_picks text[] (split on ",")
 *     - "Three year plan" / "3 year plan" / "Plan" → three_year_plan.text
 *     - "Skills" → skills_self_attribution (parsed as [{ skill, level }])
 *     - "Notes" / "Free text" / "Anything else" → free_text_notes
 *
 *   Unrecognized columns are stored under aspirations.google_form_raw so
 *   no data is lost.
 *
 * Exit codes:
 *   0 success (with optional non-fatal per-row errors)
 *   1 configuration / fatal error
 *
 * Env vars required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { argv, exit } from 'node:process';

// ─── CLI parsing ─────────────────────────────────────────────────────────────

interface CliArgs {
  csvPath: string | null;
  cycle: string;
  dryRun: boolean;
  logPath: string;
}

function parseArgs(): CliArgs {
  const args = argv.slice(2);
  let csvPath: string | null = null;
  let cycle = '2024-25';
  let dryRun = false;
  let logPath = '';

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--csv' && args[i + 1]) csvPath = args[++i];
    else if (a === '--cycle' && args[i + 1]) cycle = args[++i];
    else if (a === '--dry-run') dryRun = true;
    else if (a === '--log' && args[i + 1]) logPath = args[++i];
    else if (a === '--help' || a === '-h') {
      console.log(USAGE);
      exit(0);
    }
  }

  if (!logPath) {
    const runId = new Date().toISOString().replace(/[:.]/g, '-');
    logPath = path.resolve(process.cwd(), `out/backfill-cdc-idp-${runId}.log`);
  }

  return { csvPath, cycle, dryRun, logPath };
}

const USAGE = `Usage: tsx scripts/backfill-cdc-idp.ts --csv <path> [--cycle 2024-25] [--dry-run] [--log <path>]

Backfills CDC IDP Google Form responses into cdc_idp_responses (idempotent).

Required:
  --csv <path>      CSV file exported from the Google Form

Optional:
  --cycle <label>   Academic year label (default: 2024-25)
  --dry-run         Don't write anything; just print what would happen
  --log <path>      Per-run log file (default: out/backfill-cdc-idp-<timestamp>.log)
  --help            Print this message
`;

// ─── CSV parser (RFC-4180 lite — handles quoted fields, embedded commas/quotes/newlines) ─

function parseCSV(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];

    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field);
        field = '';
      } else if (c === '\n') {
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
      } else if (c === '\r') {
        // ignore — handled by \n
      } else {
        field += c;
      }
    }
  }
  // Final field / row
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ─── Header normalization & column mapping ───────────────────────────────────

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}

const EMAIL_ALIASES = ['email address', 'email', 'e-mail', 'email id'];
const TIMESTAMP_ALIASES = ['timestamp', 'submission timestamp', 'submitted at', 'date'];
const INTERESTS_ALIASES = ['interests', 'your interests', 'areas of interest'];
const ASPIRING_COMPANIES_ALIASES = ['aspiring companies', 'dream companies', 'target companies'];
const SECTORS_ALIASES = ['preferred sectors', 'sectors', 'industry sectors'];
const CLUBS_ALIASES = ['club picks', 'clubs', 'club preferences', 'preferred clubs'];
const PLAN_ALIASES = ['three year plan', '3 year plan', 'plan', 'three-year plan'];
const SKILLS_ALIASES = ['skills', 'skill self-attribution', 'self skills'];
const NOTES_ALIASES = ['notes', 'free text', 'anything else', 'additional notes', 'remarks'];

function findColumnIndex(headers: string[], aliases: string[]): number {
  const normalised = headers.map(normHeader);
  for (const alias of aliases) {
    const idx = normalised.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

// Split a comma- or semicolon-separated list, trim, drop empties.
function splitList(value: string): string[] {
  if (!value) return [];
  return value
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Parse a "skills" cell like "Python:basic, SQL:intermediate" or just "Python, SQL"
// into [{ skill, level }]. Level defaults to 'basic' if not provided.
function parseSkills(value: string): Array<{ skill: string; level: string }> {
  if (!value) return [];
  return splitList(value).map((token) => {
    const [skill, level] = token.split(':').map((s) => s.trim());
    return { skill: skill, level: level || 'basic' };
  });
}

// ─── Supabase client ─────────────────────────────────────────────────────────

function supabaseServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required. ' +
        'Use: tsx --env-file=.env.local scripts/backfill-cdc-idp.ts ...'
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── Learner lookup ──────────────────────────────────────────────────────────

interface LearnerLookup {
  id: string;
  matchedColumn: 'college_email' | 'student_email';
}

async function lookupLearnerByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<LearnerLookup | null> {
  const normalised = email.toLowerCase().trim();
  if (!normalised) return null;

  // Try college_email first (canonical institutional email).
  const { data: byCollege, error: collegeErr } = await supabase
    .from('learners_profiles')
    .select('id')
    .ilike('college_email', normalised)
    .limit(1)
    .maybeSingle();

  if (collegeErr) {
    throw new Error(`learners_profiles college_email lookup failed: ${collegeErr.message}`);
  }
  if (byCollege?.id) return { id: byCollege.id, matchedColumn: 'college_email' };

  // Fall back to student_email (personal).
  const { data: byStudent, error: studentErr } = await supabase
    .from('learners_profiles')
    .select('id')
    .ilike('student_email', normalised)
    .limit(1)
    .maybeSingle();

  if (studentErr) {
    throw new Error(`learners_profiles student_email lookup failed: ${studentErr.message}`);
  }
  if (byStudent?.id) return { id: byStudent.id, matchedColumn: 'student_email' };

  return null;
}

// ─── Main ────────────────────────────────────────────────────────────────────

interface RowResult {
  status: 'inserted' | 'updated' | 'skipped' | 'error';
  reason?: string;
  rowIndex: number;
  email: string;
}

async function main() {
  const { csvPath, cycle, dryRun, logPath } = parseArgs();

  if (!csvPath) {
    console.error('Error: --csv <path> is required.');
    console.error(USAGE);
    exit(1);
  }
  if (!fs.existsSync(csvPath)) {
    console.error(`Error: CSV file not found: ${csvPath}`);
    exit(1);
  }

  // Set up log file
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const logStream = fs.createWriteStream(logPath, { flags: 'a' });
  const log = (line: string) => {
    console.log(line);
    logStream.write(line + '\n');
  };

  log(`[backfill-cdc-idp] Starting (DRY_RUN=${dryRun}, cycle=${cycle})`);
  log(`[backfill-cdc-idp] CSV: ${csvPath}`);
  log(`[backfill-cdc-idp] Log: ${logPath}`);

  const supabase = supabaseServiceClient();

  // Load + parse CSV
  const rawCsv = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCSV(rawCsv);
  if (rows.length < 2) {
    log('[backfill-cdc-idp] CSV is empty or has only a header row. Nothing to do.');
    exit(0);
  }

  const headers = rows[0];
  const dataRows = rows.slice(1).filter((r) => r.some((cell) => cell.trim().length > 0));
  log(`[backfill-cdc-idp] Parsed ${dataRows.length} data rows`);

  // Locate columns
  const emailIdx = findColumnIndex(headers, EMAIL_ALIASES);
  const timestampIdx = findColumnIndex(headers, TIMESTAMP_ALIASES);
  const interestsIdx = findColumnIndex(headers, INTERESTS_ALIASES);
  const aspiringIdx = findColumnIndex(headers, ASPIRING_COMPANIES_ALIASES);
  const sectorsIdx = findColumnIndex(headers, SECTORS_ALIASES);
  const clubsIdx = findColumnIndex(headers, CLUBS_ALIASES);
  const planIdx = findColumnIndex(headers, PLAN_ALIASES);
  const skillsIdx = findColumnIndex(headers, SKILLS_ALIASES);
  const notesIdx = findColumnIndex(headers, NOTES_ALIASES);

  if (emailIdx === -1) {
    log(
      `[backfill-cdc-idp] FATAL: no email column found. Tried: ${EMAIL_ALIASES.join(', ')}. ` +
        `Headers were: ${headers.join(' | ')}`
    );
    exit(1);
  }

  log(`[backfill-cdc-idp] Column map:`);
  log(`  - email: idx=${emailIdx} (${headers[emailIdx]})`);
  if (timestampIdx !== -1) log(`  - timestamp: idx=${timestampIdx} (${headers[timestampIdx]})`);
  if (interestsIdx !== -1) log(`  - interests: idx=${interestsIdx}`);
  if (aspiringIdx !== -1) log(`  - aspiring companies: idx=${aspiringIdx}`);
  if (sectorsIdx !== -1) log(`  - preferred sectors: idx=${sectorsIdx}`);
  if (clubsIdx !== -1) log(`  - club picks: idx=${clubsIdx}`);
  if (planIdx !== -1) log(`  - three year plan: idx=${planIdx}`);
  if (skillsIdx !== -1) log(`  - skills: idx=${skillsIdx}`);
  if (notesIdx !== -1) log(`  - notes: idx=${notesIdx}`);

  const results: RowResult[] = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const errors: Array<{ rowIndex: number; email: string; reason: string }> = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowIndex = i + 2; // 1-based + header offset (for log readability)
    const email = (row[emailIdx] ?? '').trim();

    if (!email) {
      log(`[skip] row ${rowIndex}: no email`);
      skipped++;
      results.push({ status: 'skipped', reason: 'no email', rowIndex, email: '' });
      continue;
    }

    // Look up learner
    let learner: LearnerLookup | null = null;
    try {
      learner = await lookupLearnerByEmail(supabase, email);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`[error] row ${rowIndex} (${email}): lookup failed: ${msg}`);
      errors.push({ rowIndex, email, reason: `lookup failed: ${msg}` });
      results.push({ status: 'error', reason: msg, rowIndex, email });
      continue;
    }

    if (!learner) {
      log(`[unmatched] row ${rowIndex}: no learner with email "${email}"`);
      errors.push({ rowIndex, email, reason: 'no matching learner' });
      results.push({ status: 'error', reason: 'no matching learner', rowIndex, email });
      continue;
    }

    // Build payload from row
    const interests = interestsIdx !== -1 ? splitList(row[interestsIdx] ?? '') : [];
    const aspiringCompanies =
      aspiringIdx !== -1 ? splitList(row[aspiringIdx] ?? '') : [];
    const preferredSectors = sectorsIdx !== -1 ? splitList(row[sectorsIdx] ?? '') : [];
    const clubPicks = clubsIdx !== -1 ? splitList(row[clubsIdx] ?? '') : [];
    const planText = planIdx !== -1 ? (row[planIdx] ?? '').trim() : '';
    const skills = skillsIdx !== -1 ? parseSkills(row[skillsIdx] ?? '') : [];
    const notes = notesIdx !== -1 ? (row[notesIdx] ?? '').trim() : '';
    const timestamp = timestampIdx !== -1 ? (row[timestampIdx] ?? '').trim() : '';

    // Stash the full original row into aspirations.google_form_raw so we
    // never lose data on column-name drift.
    const rawSnapshot: Record<string, string> = {};
    for (let h = 0; h < headers.length; h++) {
      const key = headers[h]?.trim();
      if (key) rawSnapshot[key] = (row[h] ?? '').trim();
    }

    const aspirations: Record<string, unknown> = {
      aspiring_companies: aspiringCompanies,
      preferred_sectors: preferredSectors,
      google_form_raw: rawSnapshot,
    };

    const threeYearPlan: Record<string, unknown> = planText ? { text: planText } : {};

    let submittedAt: string | null = null;
    if (timestamp) {
      const parsed = new Date(timestamp);
      if (!isNaN(parsed.getTime())) {
        submittedAt = parsed.toISOString();
      }
    }

    // Build a stable source_response_id so re-imports match the same row.
    // Form: <cycle>:<rowIndex>:<email-lowercased> (only used for tracing
    // when the (learner_id, academic_year_label) unique key matches).
    const sourceResponseId = `${cycle}:${rowIndex}:${email.toLowerCase()}`;

    const payload = {
      learner_id: learner.id,
      academic_year_label: cycle,
      interests,
      aspirations,
      club_picks: clubPicks,
      three_year_plan: threeYearPlan,
      skills_self_attribution: skills,
      free_text_notes: notes || null,
      source: 'google_form_migration',
      source_response_id: sourceResponseId,
      ...(submittedAt ? { submitted_at: submittedAt } : {}),
    };

    // Check if a row already exists for this (learner_id, cycle).
    const { data: existing, error: existingErr } = await supabase
      .from('cdc_idp_responses')
      .select('id, source')
      .eq('learner_id', learner.id)
      .eq('academic_year_label', cycle)
      .maybeSingle();

    if (existingErr) {
      log(`[error] row ${rowIndex} (${email}): existing-row check failed: ${existingErr.message}`);
      errors.push({ rowIndex, email, reason: `check failed: ${existingErr.message}` });
      results.push({ status: 'error', reason: existingErr.message, rowIndex, email });
      continue;
    }

    if (existing) {
      if (existing.source === 'native_form') {
        // Never overwrite a learner's own native submission.
        log(
          `[skip] row ${rowIndex} (${email}): native_form row already exists (id=${existing.id}); not overwriting`
        );
        skipped++;
        results.push({
          status: 'skipped',
          reason: 'native_form row exists; not overwritten',
          rowIndex,
          email,
        });
        continue;
      }

      // Existing google_form_migration row — UPDATE.
      if (dryRun) {
        log(`[dry-run] row ${rowIndex} (${email}): would UPDATE existing id=${existing.id}`);
        updated++;
        results.push({ status: 'updated', reason: 'dry-run', rowIndex, email });
        continue;
      }

      const { error: updErr } = await supabase
        .from('cdc_idp_responses')
        .update(payload)
        .eq('id', existing.id);

      if (updErr) {
        log(`[error] row ${rowIndex} (${email}): update failed: ${updErr.message}`);
        errors.push({ rowIndex, email, reason: `update failed: ${updErr.message}` });
        results.push({ status: 'error', reason: updErr.message, rowIndex, email });
        continue;
      }
      log(`[updated] row ${rowIndex} (${email}): id=${existing.id}`);
      updated++;
      results.push({ status: 'updated', rowIndex, email });
    } else {
      // No existing row — INSERT.
      if (dryRun) {
        log(`[dry-run] row ${rowIndex} (${email}): would INSERT for learner ${learner.id}`);
        inserted++;
        results.push({ status: 'inserted', reason: 'dry-run', rowIndex, email });
        continue;
      }

      const { data: insRow, error: insErr } = await supabase
        .from('cdc_idp_responses')
        .insert(payload)
        .select('id')
        .single();

      if (insErr) {
        log(`[error] row ${rowIndex} (${email}): insert failed: ${insErr.message}`);
        errors.push({ rowIndex, email, reason: `insert failed: ${insErr.message}` });
        results.push({ status: 'error', reason: insErr.message, rowIndex, email });
        continue;
      }
      log(`[inserted] row ${rowIndex} (${email}): id=${insRow?.id}`);
      inserted++;
      results.push({ status: 'inserted', rowIndex, email });
    }
  }

  // ─── Summary ─────────────────────────────────────────────────────────────
  log('');
  log('===========================================================');
  log(`[backfill-cdc-idp] Summary (DRY_RUN=${dryRun}):`);
  log(`  Inserted: ${inserted}`);
  log(`  Updated:  ${updated}`);
  log(`  Skipped:  ${skipped}`);
  log(`  Errors:   ${errors.length}`);
  log(`  Total rows processed: ${dataRows.length}`);
  log('===========================================================');

  if (errors.length > 0) {
    log('');
    log('[backfill-cdc-idp] Errors detail:');
    for (const e of errors) {
      log(`  row ${e.rowIndex} (${e.email}): ${e.reason}`);
    }
  }

  logStream.end();

  // Print machine-readable summary at end (handy for piping/asserting)
  const summary = JSON.stringify({
    inserted,
    updated,
    skipped,
    errors: errors.map((e) => ({ row: e.rowIndex, email: e.email, reason: e.reason })),
    total: dataRows.length,
    dryRun,
  });
  console.log('\n[backfill-cdc-idp] JSON summary:');
  console.log(summary);
}

main().catch((err) => {
  console.error('[backfill-cdc-idp] Fatal:', err);
  exit(1);
});
