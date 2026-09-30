#!/usr/bin/env tsx
/**
 * Bring the OLD InstaSolver site's history into MyJKKN.
 *
 *   npx tsx scripts/instasolver/import-old-site.ts --export-dir <path>            # dry run (default)
 *   INSTASOLVER_IMPORT_CONFIRM=yes \
 *     npx tsx scripts/instasolver/import-old-site.ts --export-dir <path> --apply   # writes
 *
 * Director rulings, 30 Sep 2026 (see scripts/instasolver/lib/old-site-mapping.ts):
 *   1. every old record goes into legacy_instasolver_issues /
 *      legacy_instasolver_requirements (upsert on legacy_id — safe to re-run);
 *   2. every UNFINISHED old job also becomes a Campus Walk task through
 *      createWalkTask, the same engine the InstaSolver "broken" form uses, and
 *      the task id is written back on the history row. A row that already has
 *      a task — or whose task exists but was never written back — never gets a
 *      second one.
 *
 * PRIVACY. The export holds names, emails and mobile numbers. This script
 * prints COUNTS ONLY (plus old college names, which are not personal), never
 * a row. Mobile numbers and emails are not written anywhere; emails are used
 * in memory only, to match reporters to MyJKKN profiles.
 *
 * DATABASE. The dry run reads the database only when SUPABASE_SERVICE_ROLE_KEY
 * and NEXT_PUBLIC_SUPABASE_URL are in the environment, and then only to match
 * reporter emails to profiles. Without them it runs fully offline and says the
 * reporter match was not checked. --apply is refused unless
 * INSTASOLVER_IMPORT_CONFIRM=yes is also set.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createTasks } from './lib/create-tasks';
import {
  APPLY_CONFIRM_ENV,
  ISSUE_IMPORT_NEVER_WRITES,
  REQUIREMENT_IMPORT_NEVER_WRITES,
  ageInDays,
  assertApplyAllowed,
  buildIssueRow,
  buildRequirementRow,
  mapInstitution,
  normaliseKey,
  parseArgs,
  type CleanCategories,
  type CleanPlaces,
  type InstitutionMapFile,
  type MappingContext,
  type OldAdminNote,
  type OldIssue,
  type OldRequirement,
} from './lib/old-site-mapping';

const out = (line = '') => process.stdout.write(`${line}\n`);
const err = (line: string) => process.stderr.write(`${line}\n`);

const BATCH = 200;
const PENDING_MD = 'Pending MD Approval';

function readJson<T>(dir: string, file: string): T {
  return JSON.parse(readFileSync(join(dir, file), 'utf8')) as T;
}

function tally(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function printTally(title: string, map: Map<string, number>) {
  out(title);
  if (map.size === 0) out('  (none)');
  for (const [k, v] of [...map.entries()].sort((a, b) => b[1] - a[1])) out(`  ${k}: ${v}`);
}

async function matchProfiles(
  db: SupabaseClient,
  emails: string[]
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH);
    const { data, error } = await db.from('profiles').select('id, email').in('email', batch);
    if (error) throw new Error(`profile match failed: ${error.message}`);
    for (const p of (data ?? []) as Array<{ id: string; email: string | null }>) {
      const key = normaliseKey(p.email);
      if (key && !found.has(key)) found.set(key, p.id);
    }
  }
  return found;
}

function stripNeverWrites<T extends Record<string, unknown>>(row: T, keys: readonly string[]): T {
  const copy = { ...row };
  for (const k of keys) delete (copy as Record<string, unknown>)[k];
  return copy;
}

async function upsertAll(
  db: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[]
): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await db
      .from(table)
      .upsert(rows.slice(i, i + BATCH), { onConflict: 'legacy_id' });
    if (error) throw new Error(`${table} upsert failed at batch ${i / BATCH + 1}: ${error.message}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.exportDir) {
    err('Usage: tsx scripts/instasolver/import-old-site.ts --export-dir <path> [--dry-run | --apply]');
    process.exit(2);
  }
  try {
    assertApplyAllowed(args, process.env);
  } catch (e) {
    err(e instanceof Error ? e.message : String(e));
    process.exit(1);
  }

  const dir = args.exportDir;
  const issues = readJson<OldIssue[]>(dir, 'issues.json');
  const requirements = readJson<OldRequirement[]>(dir, 'requirements.json');
  const adminNotes = readJson<OldAdminNote[]>(dir, 'admin_notes.json');
  const oldProfiles = readJson<Array<{ email_id?: string | null; full_name?: string | null }>>(
    dir,
    'profiles.json'
  );
  const places = readJson<CleanPlaces>(dir, 'clean-places.json');
  const categories = readJson<CleanCategories>(dir, 'clean-categories.json');
  const institutions = JSON.parse(
    readFileSync(join(__dirname, 'institution-map.json'), 'utf8')
  ) as InstitutionMapFile;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const db = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;

  const emails = [
    ...new Set([...issues, ...requirements].map((r) => normaliseKey(r.email_id)).filter(Boolean)),
  ];
  // Query the lower-cased AND the as-typed spelling of every address: `.in()`
  // is an exact match, and profiles.email may hold mixed-case addresses.
  // (Not `.ilike`: `_` in an email would be a LIKE wildcard.)
  const spellings = [
    ...new Set(
      [...issues, ...requirements]
        .flatMap((r) => [String(r.email_id ?? '').trim(), normaliseKey(r.email_id)])
        .filter(Boolean)
    ),
  ];
  const profileIdByEmail = db ? await matchProfiles(db, spellings) : new Map<string, string>();

  const notesByIssue = new Map<number, OldAdminNote[]>();
  const notesByRequirement = new Map<number, OldAdminNote[]>();
  for (const n of adminNotes) {
    if (n.issue_id != null) notesByIssue.set(n.issue_id, [...(notesByIssue.get(n.issue_id) ?? []), n]);
    if (n.requirement_id != null)
      notesByRequirement.set(n.requirement_id, [...(notesByRequirement.get(n.requirement_id) ?? []), n]);
  }

  const ctx: MappingContext = {
    institutions,
    places,
    categories,
    profileIdByEmail,
    oldNameByEmail: new Map(
      oldProfiles
        .filter((p) => p.email_id && p.full_name)
        .map((p) => [String(p.email_id).toLowerCase(), String(p.full_name)])
    ),
    notesByIssue,
    notesByRequirement,
    now: new Date(),
  };

  const issueRows = issues.map((r) => buildIssueRow(r, ctx));
  const requirementRows = requirements.map((r) => buildRequirementRow(r, ctx));
  const openRows = issueRows.filter((r) => r.is_open);

  // ── Counts (no personal data) ───────────────────────────────────────────
  out(`Old InstaSolver import — ${args.apply ? 'APPLY' : 'DRY RUN (nothing written)'}`);
  out(`legacy_instasolver_issues rows: ${issueRows.length}`);
  out(`legacy_instasolver_requirements rows: ${requirementRows.length}`);
  out(`admin notes attached: ${adminNotes.length}`);
  if (db) {
    const matched = emails.filter((e) => profileIdByEmail.has(e)).length;
    out(`reporters (distinct emails): ${emails.length} — matched to a MyJKKN profile: ${matched}, unmatched: ${emails.length - matched}`);
  } else {
    out(`reporters (distinct emails): ${emails.length} — match to MyJKKN profiles: NOT CHECKED (no service-role key in the environment)`);
  }
  out(`open jobs -> Campus Walk tasks: ${openRows.length} (of which 'Check if still broken': ${openRows.filter((r) => r.needs_still_broken_check).length})`);

  const tasksByCollege = new Map<string, number>();
  const unmapped = new Map<string, number>();
  const review = new Map<string, number>();
  for (const r of openRows) {
    tally(tasksByCollege, mapInstitution(r.legacy_institution, institutions).code);
  }
  for (const raw of [...issues.map((r) => r.institution), ...requirements.map((r) => r.institution)]) {
    const m = mapInstitution(raw, institutions);
    if (!m.mapped) tally(unmapped, JSON.stringify(String(raw ?? '')));
    else if (m.review) tally(review, `${String(raw ?? '').trim()} -> ${m.code}`);
  }
  printTally('tasks that would be created, per college:', tasksByCollege);
  printTally('unmapped old college names (sent to Main Office):', unmapped);
  printTally('mapped but flagged for review:', review);

  const pending = requirementRows.filter((r) => r.legacy_status === PENDING_MD);
  const olderThan2y = pending.filter((r) => (ageInDays(r.requested_at, ctx.now) ?? 0) > 730).length;
  out(`purchase requests at '${PENDING_MD}' (Director screen): ${pending.length} — older than 2 years: ${olderThan2y}`);
  out(`issue rows whose report date is the 23 Nov 2024 bulk load: ${issueRows.filter((r) => r.reported_at_is_bulk_load).length}`);

  if (!args.apply) {
    out(`Dry run only. To write: ${APPLY_CONFIRM_ENV}=yes ... --apply`);
    return;
  }
  if (!db) throw new Error('unreachable: --apply without a database client');

  await upsertAll(
    db,
    'legacy_instasolver_issues',
    issueRows.map((r) => stripNeverWrites(r, ISSUE_IMPORT_NEVER_WRITES))
  );
  await upsertAll(
    db,
    'legacy_instasolver_requirements',
    requirementRows.map((r) => stripNeverWrites(r, REQUIREMENT_IMPORT_NEVER_WRITES))
  );
  out('history upserted.');

  const t = await createTasks(db, openRows);
  out(`tasks: created ${t.created}, already linked ${t.alreadyLinked}, re-linked ${t.relinked}, failed ${t.failed}`);
  if (t.failed > 0) process.exitCode = 1;
}

main().catch((e) => {
  err(`[instasolver-import] ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
