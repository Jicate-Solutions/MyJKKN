#!/usr/bin/env tsx
/**
 * scripts/backfill-sibling-bugs-from-central.ts
 *
 * Copies the OPEN bug reports that five college apps (Mentor, TMS, COE, Library;
 * Event Forms has none) already filed in the central bug reporter
 * (Supabase adakhqxgaoxaihtehfqw) into MyJKKN's own bug_reports, so that their
 * history sits next to the new reports the intake route
 * (app/api/v1/public/bug-reports, migration 20271010151437) files from now on.
 *
 * ── OPEN BUGS ONLY (Director, 10 Oct 2026 14:40) ───────────────────────────
 *   Only bugs whose central status is new, seen or in_progress are copied,
 *   with that status unchanged. Resolved, closed and wont_fix bugs stay in the
 *   central reporter as history and are never copied. This is the only mode.
 *   (It also means no copied row is 'resolved', so trg_bug_reports_resolved_by,
 *   which refuses a resolved row without resolved_by, never comes into play.)
 *   The COE TEST entry (central "jkkn-coe") is excluded too.
 *
 * ── ORDER ──────────────────────────────────────────────────────────────────
 *   1. Apply migration 20271010151437_sibling_app_bug_intake.sql (PR #4322).
 *      It creates sibling_apps and adds the NULL-reporter guard to
 *      add_bug_reporter_as_participant. Without the guard, every copied bug
 *      (all are filed with no reporter) fails its insert.
 *   2. Deploy.
 *   3. Run this with --apply, on the Director's word.
 *
 * ── MODES ──────────────────────────────────────────────────────────────────
 *   (default) --dry-run  Reads central and MyJKKN, prints what it would copy,
 *                        and writes NOTHING. If sibling_apps does not exist
 *                        yet it prints "sibling_apps missing: target mapping
 *                        simulated" and carries on.
 *   --apply              Inserts. Refused unless ALL of:
 *                          • BACKFILL_CONFIRM=copy-central-bugs-to-myjkkn
 *                          • sibling_apps exists with every target slug active
 *                          • every open row passes the checks (no blocked
 *                            rows)
 *
 * ── FLAGS ──────────────────────────────────────────────────────────────────
 *   --include-coe-test       Also copy central's "jkkn-coe" app, a TEST entry.
 *                            OFF by default, and the Director decided (10 Oct
 *                            2026) to keep it off: do not pass it.
 *   --batch-size=<n>         Rows per batch on --apply (default 10). Rows are
 *                            still inserted one request each, so one
 *                            display_id race cannot fail a whole batch.
 *   --verbose                Also list the unmatched reporter emails and the
 *                            ids of blocked rows.
 *
 * ── ENV (never printed) ────────────────────────────────────────────────────
 *   CENTRAL_SUPABASE_URL              optional; defaults to the central project
 *   CENTRAL_SUPABASE_READ_KEY         a key that can read the central tables.
 *                                     Vercel holds only central's service key,
 *                                     so in practice it is that key — this
 *                                     script only ever SELECTs with it.
 *   MYJKKN_SUPABASE_URL               MyJKKN project URL
 *   MYJKKN_SUPABASE_SERVICE_ROLE_KEY  MyJKKN service key (reads; inserts on
 *                                     --apply only)
 *   BACKFILL_CONFIRM                  --apply only (see above)
 *
 *   npx tsx scripts/backfill-sibling-bugs-from-central.ts
 *   BACKFILL_CONFIRM=copy-central-bugs-to-myjkkn npx tsx scripts/backfill-sibling-bugs-from-central.ts --apply
 *
 * ── HOW EACH FIELD IS CARRIED ──────────────────────────────────────────────
 *   status          only new, seen and in_progress bugs are copied, and every
 *                   copy is filed as 'unverified' (#4322's quarantine status,
 *                   read by no automation) until a person reads it and moves
 *                   it to 'new'. Their text came in on a public key. Every
 *                   other central status stays in central. The original is
 *                   kept in metadata.central_status.
 *   reporter        NEVER linked: reporter_user_id, institution_id and
 *                   department_id are NULL on every row, as on the intake
 *                   route (#4322 review). The central email came from a public
 *                   key, so it is a claim. Email and name stay in metadata
 *                   with reporter_verified false. The dry run still counts how
 *                   many emails match exactly one profile, for a later
 *                   verified-link step; nothing is written from that.
 *   screenshot_url  the central public URL as-is (bucket bug-attachments is
 *                   public; an unauthenticated GET returns the image).
 *   attachments     attachments[].url → attachment_urls (MyJKKN keeps an
 *                   array of URL strings); the full objects (filename, size,
 *                   type) → metadata.central_attachments. Same public bucket.
 *   page_url, description, category, console_logs, created_at, resolved_at
 *   (set only on a reopened bug), reopened_at     carried over. reopen_count and reopen_reason have no
 *                   MyJKKN column → metadata.
 *   display_id      never set: MyJKKN's set_bug_display_id trigger issues
 *                   BUG-xxxxxx. The central one is metadata.central_display_id.
 *   module_name     never set: a GENERATED column computed from page_url.
 *   title           no bug_reports column → metadata.title, like the intake.
 *
 * ── WHY THE THREAD AND STATUS HISTORY GO IN metadata.central_history ───────
 *   MyJKKN has no status-history table, and bug_report_messages.sender_id is
 *   NOT NULL, so a message must belong to a MyJKKN user — central's
 *   reporters and dashboard users mostly are not. On the day this was written
 *   central held 0 messages and 24 status events across these apps, so a
 *   compact { events, messages } object on the bug itself loses nothing and
 *   invents no users.
 *
 * ── IDEMPOTENCE ────────────────────────────────────────────────────────────
 *   Every copy carries metadata.source = 'central-backfill' and
 *   metadata.central_bug_id. bug_reports has no unique key that could hold
 *   that (the intake has none either), so before each batch the script
 *   re-reads the central_bug_id of every earlier copy and skips those.
 *   Running it twice copies nothing the second time. A partial unique index on
 *   (metadata->>'central_bug_id') would make that a database guarantee; the
 *   precedent is idx_bug_reports_metadata_ig_user_id. Not added here.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { pathToFileURL } from 'node:url';
import { argv, env, exit } from 'node:process';

// ─── The app mapping ─────────────────────────────────────────────────────────
// central applications.slug → MyJKKN sibling_apps.slug (seeded by migration
// 20271010151437: mentor, tms, coe, library, event-forms).
export const APP_MAP: ReadonlyArray<{
  central: string;
  sibling: string;
  testEntry?: true;
  note?: string;
}> = [
  { central: 'jkkn-mentor', sibling: 'mentor' },
  { central: 'tms', sibling: 'tms' },
  { central: 'transport-management-system', sibling: 'tms', note: 'older central entry for the same TMS product' },
  { central: 'jkkn-coe', sibling: 'coe', testEntry: true, note: 'TEST entry; copied only with --include-coe-test' },
  { central: 'jkkncoeproduction', sibling: 'coe' },
  { central: 'myjkkn-library', sibling: 'library' },
];

/** Names as seeded in sibling_apps; used only when the table is simulated. */
export const SIBLING_APP_NAMES: Readonly<Record<string, string>> = {
  mentor: 'Mentor',
  tms: 'TMS',
  coe: 'COE',
  library: 'Library',
  'event-forms': 'Event Forms',
};

export const CENTRAL_PROJECT_REF = 'adakhqxgaoxaihtehfqw';
export const BACKFILL_SOURCE = 'central-backfill';
export const APPLY_CONFIRM_ENV = 'BACKFILL_CONFIRM';
export const APPLY_CONFIRM_VALUE = 'copy-central-bugs-to-myjkkn';

/** The categories the intake route accepts (no CHECK on the column itself). */
export const KNOWN_CATEGORIES = ['bug', 'feature_request', 'ui_design', 'performance', 'security', 'other'] as const;

/** The only central statuses copied (Director, 10 Oct 2026). */
export const OPEN_STATUSES = ['new', 'seen', 'in_progress'] as const;
const OPEN = new Set<string>(OPEN_STATUSES);
const MAX_NETWORK_TRACE = 50; // same cap as the intake route
const MAX_CONSOLE_LOGS = 200; // same cap as the intake route

/** The central apps this run reads. COE's TEST entry only on request. */
export function selectApps(opts: { includeCoeTest: boolean }) {
  return APP_MAP.filter((a) => opts.includeCoeTest || !a.testEntry);
}

/**
 * central status → MyJKKN status for an OPEN bug (unchanged), or null when the
 * bug is not open (resolved, closed, wont_fix, anything else): it stays in
 * central and is not copied.
 */
export function mapStatus(central: string | null | undefined): string | null {
  const s = (central ?? '').trim().toLowerCase();
  return OPEN.has(s) ? s : null;
}

/** Lower-cased address, or null when it is not one. */
export function normEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const e = raw.trim().toLowerCase();
  return e.includes('@') && e.length <= 320 ? e : null;
}

/** Escape LIKE wildcards so an email is matched literally (as the intake does). */
export function likeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** The idempotence key a copied row carries, read back from its metadata. */
export function centralIdOf(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  return m.source === BACKFILL_SOURCE && typeof m.central_bug_id === 'string' ? m.central_bug_id : null;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type CentralBug = {
  id: string;
  display_id: string | null;
  created_at: string;
  application_id: string;
  reporter_user_id: string | null;
  page_url: string | null;
  description: string | null;
  category: string | null;
  screenshot_url: string | null;
  console_logs: unknown;
  status: string | null;
  resolved_at: string | null;
  metadata: Record<string, unknown> | null;
  attachments: unknown;
  reopened_at: string | null;
  reopen_reason: string | null;
  reopen_count: number | null;
  reporter_email: string | null;
};

export type CentralEvent = {
  bug_report_id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  actor_kind: string | null;
  actor_label: string | null;
  created_at: string;
};

export type CentralMessage = {
  bug_report_id: string;
  message_text: string;
  message_type: string | null;
  is_internal: boolean | null;
  is_deleted: boolean | null;
  author_kind?: string | null;
  author_email?: string | null;
  attachment_url: string | null;
  created_at: string;
};

export type ProfileMatch = { id: string; institution_id: string | null; department_id: string | null };
/** Result of the email lookup: a single profile, or why there is none. */
export type ReporterLookup = ProfileMatch | 'none' | 'ambiguous';

export type SiblingApp = { id: string; slug: string; name: string; is_active: boolean };

export type PlannedRow = {
  centralApp: string;
  siblingSlug: string;
  centralId: string;
  centralDisplayId: string | null;
  centralStatus: string | null;
  status: string | null;
  /** stays-in-central = not open; never copied. */
  decision: 'insert' | 'skip-existing' | 'blocked' | 'stays-in-central';
  /** Would fail a constraint or trigger even after #4322's migration. */
  blockers: string[];
  /** Would fail only because #4322's migration is not applied yet. */
  needsMigration: string[];
  reporter: 'matched' | 'unmatched' | 'ambiguous' | 'no-email';
  reporterEmail: string | null;
  attachmentCount: number;
  row: Record<string, unknown>;
};

export type PlanInput = {
  bugs: Array<{ centralApp: string; bug: CentralBug }>;
  eventsByBug: Map<string, CentralEvent[]>;
  messagesByBug: Map<string, CentralMessage[]>;
  existingCentralIds: Set<string>;
  reporterByEmail: Map<string, ReporterLookup>;
  /** null = the sibling_apps table does not exist yet (mapping simulated). */
  siblingApps: Map<string, SiblingApp> | null;
  /** Copy central's jkkn-coe TEST entry too (default false). */
  includeCoeTest: boolean;
  now: string;
};

// ─── Planning (pure) ─────────────────────────────────────────────────────────

const INTAKE_METADATA_KEYS = new Set([
  'title',
  'reporter_email',
  'reporter_name',
  'browser_info',
  'system_info',
  'viewport',
  'screen_resolution',
  'timestamp',
  'network_trace',
]);

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

function attachmentsOf(raw: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(raw)) return [];
  return raw.filter((a): a is Record<string, unknown> => !!a && typeof a === 'object' && typeof (a as any).url === 'string');
}

export function compactHistory(events: CentralEvent[], messages: CentralMessage[]) {
  return {
    events: [...events]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((e) => ({
        from: e.from_status,
        to: e.to_status,
        at: e.created_at,
        actor_kind: e.actor_kind,
        actor: e.actor_label,
        ...(e.note ? { note: e.note } : {}),
      })),
    messages: [...messages]
      .filter((m) => !m.is_deleted)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((m) => ({
        at: m.created_at,
        type: m.message_type,
        author_kind: m.author_kind ?? null,
        author_email: m.author_email ?? null,
        internal: !!m.is_internal,
        text: m.message_text,
        ...(m.attachment_url ? { attachment_url: m.attachment_url } : {}),
      })),
  };
}

export function planRow(
  centralApp: string,
  bug: CentralBug,
  input: Omit<PlanInput, 'bugs'>
): PlannedRow {
  const mapping = APP_MAP.find((a) => a.central === centralApp);
  if (!mapping) throw new Error(`No mapping for central app ${centralApp}`);
  const siblingSlug = mapping.sibling;

  const blockers: string[] = [];
  const needsMigration: string[] = [];

  // App
  let app: { id: string | null; name: string };
  if (input.siblingApps === null) {
    app = { id: null, name: SIBLING_APP_NAMES[siblingSlug] ?? siblingSlug };
    needsMigration.push('sibling_apps missing');
  } else {
    const found = input.siblingApps.get(siblingSlug);
    if (!found) {
      app = { id: null, name: siblingSlug };
      blockers.push(`sibling app '${siblingSlug}' not in sibling_apps`);
    } else {
      app = { id: found.id, name: found.name };
      if (!found.is_active) blockers.push(`sibling app '${siblingSlug}' is turned off`);
    }
  }

  // Status: open bugs only
  const status = mapStatus(bug.status);

  // NOT NULL columns
  if (!str(bug.page_url)) blockers.push('page_url is empty (NOT NULL)');
  if (!str(bug.description)) blockers.push('description is empty (NOT NULL)');

  // Reporter
  const md = (bug.metadata && typeof bug.metadata === 'object' ? bug.metadata : {}) as Record<string, unknown>;
  const reporterEmail = normEmail(bug.reporter_email) ?? normEmail(md.reporter_email);
  let reporter: PlannedRow['reporter'] = 'no-email';
  if (reporterEmail) {
    const hit = input.reporterByEmail.get(reporterEmail) ?? 'none';
    if (hit === 'none') reporter = 'unmatched';
    else if (hit === 'ambiguous') reporter = 'ambiguous';
    else reporter = 'matched';
  }
  if (input.siblingApps === null) {
    // Every row has reporter_user_id NULL. The live add_bug_reporter_as_participant
    // inserts it into a NOT NULL column; #4322's migration adds the NULL guard.
    needsMigration.push('reporter is NULL (participant trigger needs #4322 guard)');
  }

  const events = input.eventsByBug.get(bug.id) ?? [];
  const messages = input.messagesByBug.get(bug.id) ?? [];

  const attachments = attachmentsOf(bug.attachments);
  const extras = Object.fromEntries(Object.entries(md).filter(([k]) => !INTAKE_METADATA_KEYS.has(k)));
  const networkTrace = Array.isArray(md.network_trace) ? md.network_trace.slice(-MAX_NETWORK_TRACE) : null;
  const consoleLogs = Array.isArray(bug.console_logs)
    ? bug.console_logs.slice(-MAX_CONSOLE_LOGS)
    : (bug.console_logs ?? null);

  const metadata: Record<string, unknown> = {
    source: BACKFILL_SOURCE,
    central_bug_id: bug.id,
    central_display_id: bug.display_id,
    central_app_slug: centralApp,
    central_application_id: bug.application_id,
    central_status: bug.status,
    central_reporter_user_id: bug.reporter_user_id,
    source_app: siblingSlug,
    source_app_name: app.name,
    sibling_app_id: app.id,
    title: str(md.title),
    reporter_email: reporterEmail,
    reporter_name: str(md.reporter_name),
    reporter_verified: false,
    browser_info: md.browser_info ?? null,
    system_info: md.system_info ?? null,
    viewport: md.viewport ?? null,
    screen_resolution: md.screen_resolution ?? null,
    client_timestamp: md.timestamp ?? null,
    network_trace: networkTrace,
    central_history: compactHistory(events, messages),
    backfilled_at: input.now,
  };
  if (attachments.length) metadata.central_attachments = attachments;
  if (bug.reopen_count) metadata.central_reopen_count = bug.reopen_count;
  if (bug.reopen_reason) metadata.central_reopen_reason = bug.reopen_reason;
  if (Object.keys(extras).length) metadata.central_metadata_extra = extras;

  // Never display_id, module_name, sub_module_name or priority.
  const row: Record<string, unknown> = {
    application_id: app.id,
    // Never derived from the claimed email (see the header).
    reporter_user_id: null,
    institution_id: null,
    department_id: null,
    page_url: bug.page_url,
    description: bug.description,
    category: bug.category ?? 'bug',
    // Quarantine, like the intake route: no automation reads 'unverified'.
    status: status ? 'unverified' : null,
    console_logs: consoleLogs,
    screenshot_url: bug.screenshot_url,
    attachment_urls: attachments.map((a) => a.url as string),
    created_at: bug.created_at,
    resolved_at: bug.resolved_at,
    reopened_at: bug.reopened_at,
    metadata,
  };
  const already = input.existingCentralIds.has(bug.id);
  const decision: PlannedRow['decision'] = !status
    ? 'stays-in-central'
    : already
      ? 'skip-existing'
      : blockers.length
        ? 'blocked'
        : 'insert';
  return {
    centralApp,
    siblingSlug,
    centralId: bug.id,
    centralDisplayId: bug.display_id,
    centralStatus: bug.status,
    status,
    decision,
    blockers,
    needsMigration,
    reporter,
    reporterEmail,
    attachmentCount: attachments.length,
    row,
  };
}

export function planBackfill(input: PlanInput): PlannedRow[] {
  // Defence in depth: even if a caller passes the TEST entry's bugs, they are
  // dropped unless includeCoeTest is set.
  const allowed = new Set(selectApps({ includeCoeTest: input.includeCoeTest }).map((a) => a.central));
  return input.bugs
    .filter(({ centralApp }) => allowed.has(centralApp))
    .map(({ centralApp, bug }) => planRow(centralApp, bug, input));
}

// ─── I/O ─────────────────────────────────────────────────────────────────────

type Args = {
  apply: boolean;
  includeCoeTest: boolean;
  batchSize: number;
  verbose: boolean;
};

export function parseArgs(args: string[]): Args {
  const out: Args = { apply: false, includeCoeTest: false, batchSize: 10, verbose: false };
  for (const a of args) {
    if (a === '--apply') out.apply = true;
    else if (a === '--dry-run') out.apply = false;
    else if (a === '--include-coe-test') out.includeCoeTest = true;
    else if (a === '--verbose') out.verbose = true;
    else if (a.startsWith('--batch-size=')) {
      const n = Number(a.slice('--batch-size='.length));
      if (!Number.isInteger(n) || n < 1 || n > 50) throw new Error('--batch-size must be 1..50');
      out.batchSize = n;
    } else throw new Error(`Unknown argument: ${a}`);
  }
  if (args.includes('--apply') && args.includes('--dry-run')) throw new Error('Pick one of --apply and --dry-run');
  return out;
}

function need(name: string): string {
  const v = env[name]?.trim();
  if (!v) {
    console.error(`✗ ${name} is not set.`);
    exit(1);
  }
  return v;
}

function projectRef(url: string): string {
  try {
    return new URL(url).host.split('.')[0];
  } catch {
    return '';
  }
}

async function readAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const out: T[] = [];
  const page = 500;
  for (let from = 0; ; from += page) {
    const { data, error } = await build(from, from + page - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < page) return out;
  }
}

function chunk<T>(xs: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
}

async function readExistingCentralIds(db: SupabaseClient): Promise<Set<string>> {
  const rows = await readAll<{ metadata: unknown }>((from, to) =>
    db
      .from('bug_reports')
      .select('metadata')
      .eq('metadata->>source', BACKFILL_SOURCE)
      .order('id')
      .range(from, to)
  );
  return new Set(rows.map((r) => centralIdOf(r.metadata)).filter((x): x is string => !!x));
}

/** Map of slug → app, or null when the table does not exist yet. */
async function readSiblingApps(db: SupabaseClient): Promise<Map<string, SiblingApp> | null> {
  const { data, error } = await db.from('sibling_apps').select('id, slug, name, is_active');
  if (error) {
    const missing =
      (error as { code?: string }).code === '42P01' ||
      (error as { code?: string }).code === 'PGRST205' ||
      /does not exist|could not find the table/i.test(error.message);
    if (missing) return null;
    throw new Error(`sibling_apps read failed: ${error.message}`);
  }
  return new Map((data ?? []).map((a: SiblingApp) => [a.slug, a]));
}

async function lookupProfiles(db: SupabaseClient, emails: string[]): Promise<Map<string, ReporterLookup>> {
  const out = new Map<string, ReporterLookup>();
  for (const email of emails) {
    const { data, error } = await db
      .from('profiles')
      .select('id, institution_id, department_id')
      .ilike('email', likeLiteral(email))
      .limit(2);
    if (error) throw new Error(`profile lookup failed: ${error.message}`);
    out.set(email, !data || data.length === 0 ? 'none' : data.length > 1 ? 'ambiguous' : (data[0] as ProfileMatch));
  }
  return out;
}

function pad(s: string | number, n: number) {
  return String(s).padEnd(n);
}

function printPlan(plan: PlannedRow[], args: Args, simulated: boolean) {
  const apps = [...new Set(plan.map((p) => p.centralApp))];
  const statuses = [...OPEN_STATUSES];

  console.log('\n── Per app: open bugs copied, the rest stays in central ────────────');
  console.log(
    pad('central app', 30) +
      pad('→', 9) +
      statuses.map((s) => pad(s, 13)).join('') +
      pad('open total', 12) +
      pad('stays in central', 18) +
      'central total'
  );
  for (const a of apps) {
    const rows = plan.filter((p) => p.centralApp === a);
    const cells = statuses.map((s) => pad(rows.filter((r) => r.status === s).length, 13));
    console.log(
      pad(a, 30) +
        pad(rows[0]?.siblingSlug ?? '', 9) +
        cells.join('') +
        pad(rows.filter((r) => r.status).length, 12) +
        pad(rows.filter((r) => r.decision === 'stays-in-central').length, 18) +
        rows.length
    );
  }

  const stays = new Map<string, number>();
  for (const p of plan.filter((x) => x.decision === 'stays-in-central'))
    stays.set(String(p.centralStatus), (stays.get(String(p.centralStatus)) ?? 0) + 1);
  console.log(`\nStays in central (not copied): ${[...stays].sort().map(([k, v]) => `${k} ${v}`).join(' · ') || 'none'}`);

  const open = plan.filter((p) => p.decision !== 'stays-in-central');
  console.log('\n── Open bugs: decision, reporters, extras ──────────────────────────');
  console.log(
    pad('central app', 30) +
      pad('insert', 8) +
      pad('skip', 6) +
      pad('blocked', 9) +
      pad('matched', 9) +
      pad('unmatched', 11) +
      pad('ambig', 7) +
      pad('no-email', 10) +
      pad('attach', 8) +
      'hist-events'
  );
  for (const a of apps) {
    const rows = open.filter((p) => p.centralApp === a);
    const n = (f: (p: PlannedRow) => boolean) => rows.filter(f).length;
    const events = rows.reduce(
      (s, r) => s + ((r.row.metadata as any).central_history.events.length as number),
      0
    );
    console.log(
      pad(a, 30) +
        pad(n((p) => p.decision === 'insert'), 8) +
        pad(n((p) => p.decision === 'skip-existing'), 6) +
        pad(n((p) => p.decision === 'blocked'), 9) +
        pad(n((p) => p.reporter === 'matched'), 9) +
        pad(n((p) => p.reporter === 'unmatched'), 11) +
        pad(n((p) => p.reporter === 'ambiguous'), 7) +
        pad(n((p) => p.reporter === 'no-email'), 10) +
        pad(n((p) => p.attachmentCount > 0), 8) +
        events
    );
  }

  const unmatched = new Map<string, number>();
  for (const p of open)
    if ((p.reporter === 'unmatched' || p.reporter === 'ambiguous') && p.reporterEmail)
      unmatched.set(p.reporterEmail, (unmatched.get(p.reporterEmail) ?? 0) + 1);
  console.log(
    `\nReporters: every row is filed with reporter_user_id NULL (a claimed email is never linked). ` +
      `${open.filter((p) => p.reporter === 'matched').length} open rows have an email matching exactly one profile ` +
      `(for a later verified link); ${open.filter((p) => p.reporter !== 'matched').length} do not ` +
      `(${unmatched.size} distinct emails; ${open.filter((p) => p.reporter === 'no-email').length} rows with no email).`
  );
  if (args.verbose) for (const [e, c] of [...unmatched].sort()) console.log(`    ${e}  ×${c}`);

  const blockerCounts = new Map<string, number>();
  for (const p of open) if (p.decision !== 'skip-existing') for (const b of p.blockers) blockerCounts.set(b, (blockerCounts.get(b) ?? 0) + 1);
  console.log('\n── Open rows that would fail a constraint or trigger ───────────────');
  if (!blockerCounts.size) console.log('  none');
  for (const [b, c] of blockerCounts) console.log(`  ${pad(c, 5)} ${b}`);
  if (args.verbose)
    for (const p of plan.filter((x) => x.decision === 'blocked'))
      console.log(`    ${p.centralApp} ${p.centralDisplayId ?? p.centralId}: ${p.blockers.join('; ')}`);

  const migCounts = new Map<string, number>();
  for (const p of open) if (p.decision !== 'skip-existing') for (const b of p.needsMigration) migCounts.set(b, (migCounts.get(b) ?? 0) + 1);
  console.log('\n── Would fail only until #4322 migration is applied ────────────────');
  if (!simulated && !migCounts.size) console.log('  none (migration present)');
  for (const [b, c] of migCounts) console.log(`  ${pad(c, 5)} ${b}`);
}

async function main(): Promise<void> {
  let args: Args;
  try {
    args = parseArgs(argv.slice(2));
  } catch (e) {
    console.error(`✗ ${(e as Error).message}`);
    exit(1);
  }

  const centralUrl = env.CENTRAL_SUPABASE_URL?.trim() || `https://${CENTRAL_PROJECT_REF}.supabase.co`;
  const centralKey = need('CENTRAL_SUPABASE_READ_KEY');
  const targetUrl = need('MYJKKN_SUPABASE_URL');
  const targetKey = need('MYJKKN_SUPABASE_SERVICE_ROLE_KEY');

  if (projectRef(centralUrl) !== CENTRAL_PROJECT_REF) {
    console.error(`✗ CENTRAL_SUPABASE_URL is not the central reporter (${CENTRAL_PROJECT_REF}).`);
    exit(1);
  }
  if (projectRef(targetUrl) === CENTRAL_PROJECT_REF || !projectRef(targetUrl)) {
    console.error('✗ MYJKKN_SUPABASE_URL must be the MyJKKN project, not central.');
    exit(1);
  }

  console.log(`Mode: ${args.apply ? 'APPLY' : 'DRY RUN (writes nothing)'}`);
  console.log(`Source: central ${CENTRAL_PROJECT_REF} (read-only) → target MyJKKN ${projectRef(targetUrl)}`);

  const central = createClient(centralUrl, centralKey, { auth: { persistSession: false } });
  const target = createClient(targetUrl, targetKey, { auth: { persistSession: false } });

  // ── Central (SELECT only) ───────────────────────────────────────────────
  const selected = selectApps({ includeCoeTest: args.includeCoeTest });
  const skippedApps = APP_MAP.filter((a) => !selected.includes(a));
  const { data: appRows, error: appErr } = await central
    .from('applications')
    .select('id, slug')
    .in('slug', selected.map((a) => a.central));
  if (appErr) throw new Error(`central applications read failed: ${appErr.message}`);
  const missingApps = selected.filter((a) => !(appRows ?? []).some((r) => r.slug === a.central));
  if (missingApps.length) throw new Error(`central has no app ${missingApps.map((a) => a.central).join(', ')}`);

  const bugs: PlanInput['bugs'] = [];
  for (const app of appRows ?? []) {
    const rows = await readAll<CentralBug>((from, to) =>
      central
        .from('bug_reports')
        .select(
          'id, display_id, created_at, application_id, reporter_user_id, page_url, description, category, screenshot_url, console_logs, status, resolved_at, metadata, attachments, reopened_at, reopen_reason, reopen_count, reporter_email'
        )
        .eq('application_id', app.id)
        .order('created_at')
        .range(from, to)
    );
    for (const bug of rows) bugs.push({ centralApp: app.slug, bug });
  }

  const eventsByBug = new Map<string, CentralEvent[]>();
  const messagesByBug = new Map<string, CentralMessage[]>();
  for (const ids of chunk(bugs.map((b) => b.bug.id), 50)) {
    const ev = await central
      .from('bug_status_events')
      .select('bug_report_id, from_status, to_status, note, actor_kind, actor_label, created_at')
      .in('bug_report_id', ids);
    if (ev.error) throw new Error(`central bug_status_events read failed: ${ev.error.message}`);
    for (const e of ev.data ?? []) eventsByBug.set(e.bug_report_id, [...(eventsByBug.get(e.bug_report_id) ?? []), e]);
    const ms = await central
      .from('bug_report_messages')
      .select('bug_report_id, message_text, message_type, is_internal, is_deleted, author_kind, author_email, attachment_url, created_at')
      .in('bug_report_id', ids);
    if (ms.error) throw new Error(`central bug_report_messages read failed: ${ms.error.message}`);
    for (const m of ms.data ?? []) messagesByBug.set(m.bug_report_id, [...(messagesByBug.get(m.bug_report_id) ?? []), m]);
  }

  console.log(
    `Central: ${bugs.length} bugs in ${selected.length} apps; ` +
      `${[...eventsByBug.values()].reduce((s, x) => s + x.length, 0)} status events; ` +
      `${[...messagesByBug.values()].reduce((s, x) => s + x.length, 0)} messages`
  );
  for (const a of skippedApps) {
    const { count } = await central
      .from('bug_reports')
      .select('id', { count: 'exact', head: true })
      .eq(
        'application_id',
        (await central.from('applications').select('id').eq('slug', a.central).maybeSingle()).data?.id ??
          '00000000-0000-0000-0000-000000000000'
      );
    console.log(`Excluded: ${a.central} (${count ?? '?'} bugs) — ${a.note ?? ''}`);
  }

  // ── MyJKKN (reads) ──────────────────────────────────────────────────────
  const siblingApps = await readSiblingApps(target);
  const simulated = siblingApps === null;
  if (simulated) console.log('sibling_apps missing: target mapping simulated');

  const existingCentralIds = await readExistingCentralIds(target);
  const emails = [
    ...new Set(
      bugs
        .filter(({ bug }) => mapStatus(bug.status)) // only open bugs are copied
        .map(({ bug }) => normEmail(bug.reporter_email) ?? normEmail(bug.metadata?.reporter_email))
        .filter((e): e is string => !!e)
    ),
  ];
  const reporterByEmail = await lookupProfiles(target, emails);

  const plan = planBackfill({
    bugs,
    eventsByBug,
    messagesByBug,
    existingCentralIds,
    reporterByEmail,
    siblingApps,
    includeCoeTest: args.includeCoeTest,
    now: new Date().toISOString(),
  });

  printPlan(plan, args, simulated);

  const toInsert = plan.filter((p) => p.decision === 'insert');
  const blocked = plan.filter((p) => p.decision === 'blocked');
  console.log(
    `\nSummary: ${plan.length} read · ${plan.filter((p) => p.decision === 'stays-in-central').length} stay in central (not open) · ` +
      `${toInsert.length} open would insert · ` +
      `${plan.filter((p) => p.decision === 'skip-existing').length} already copied · ${blocked.length} blocked`
  );

  if (!args.apply) {
    console.log('\nDry run: nothing was written.');
    return;
  }

  // ── APPLY gates ─────────────────────────────────────────────────────────
  if (env[APPLY_CONFIRM_ENV] !== APPLY_CONFIRM_VALUE) {
    console.error(`✗ --apply needs ${APPLY_CONFIRM_ENV}=${APPLY_CONFIRM_VALUE}. Nothing written.`);
    exit(1);
  }
  if (simulated) {
    console.error('✗ sibling_apps does not exist. Apply migration 20271010151437 first. Nothing written.');
    exit(1);
  }
  const needSlugs = [...new Set(selected.map((a) => a.sibling))];
  const badSlugs = needSlugs.filter((s) => !siblingApps!.get(s)?.is_active);
  if (badSlugs.length) {
    console.error(`✗ sibling_apps lacks an active row for: ${badSlugs.join(', ')}. Nothing written.`);
    exit(1);
  }
  if (blocked.length) {
    console.error(`✗ ${blocked.length} rows are blocked (see above). Fix those first. Nothing written.`);
    exit(1);
  }

  const totals = { inserted: 0, skipped: 0, failed: 0 };
  for (const batch of chunk(toInsert, args.batchSize)) {
    const fresh = await readExistingCentralIds(target); // someone may have run it meanwhile
    for (const p of batch) {
      if (fresh.has(p.centralId)) {
        totals.skipped++;
        continue;
      }
      let ok = false;
      let lastError = '';
      for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
        const { error } = await target.from('bug_reports').insert(p.row).select('id').single();
        if (!error) {
          ok = true;
          break;
        }
        lastError = error.message;
        if (!lastError.includes('bug_reports_display_id_key')) break; // same race the intake retries
        await new Promise((r) => setTimeout(r, 100 * attempt));
      }
      if (ok) totals.inserted++;
      else {
        totals.failed++;
        console.error(`  ✗ ${p.centralApp} ${p.centralDisplayId ?? p.centralId}: ${lastError}`);
      }
    }
    console.log(`  … inserted ${totals.inserted}, skipped ${totals.skipped}, failed ${totals.failed}`);
  }

  console.log('\n── Done ───────────────────────────────────────────────');
  console.log(`inserted  ${totals.inserted}`);
  console.log(`skipped   ${totals.skipped} (copied by an earlier run)`);
  console.log(`failed    ${totals.failed}`);
  if (totals.failed > 0) exit(2);
}

// Only run when invoked directly; the test imports the pure functions above.
const invokedDirectly = argv[1] !== undefined && import.meta.url === pathToFileURL(argv[1]).href;

if (invokedDirectly) {
  main().catch((err) => {
    console.error('✗ fatal:', err instanceof Error ? err.message : String(err));
    exit(1);
  });
}
