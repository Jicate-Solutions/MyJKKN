export const dynamic = 'force-dynamic';

/**
 * POST /api/cdc/bulletin/ingest
 *
 * Ingest endpoint for an EXTERNAL daily-intelligence pipeline that runs off
 * platform (on the owner's machine) and pushes already-approved content in.
 * There is no cron here and no scraping here — MyJKKN is the receiver.
 *
 * Auth: x-api-key header (HINDU_INTEL_API_KEY env var), following the same
 * shape as app/api/learn/notify/route.ts, with two hardenings:
 *   - constant-time comparison (crypto.timingSafeEqual) so the key can't be
 *     recovered byte-by-byte from response timing;
 *   - DORMANT MODE: when HINDU_INTEL_API_KEY is unset the route answers 503
 *     and does nothing. That is the shipped state — this endpoint is inert
 *     until the Director sets the env var in Vercel.
 *
 * Payload is a single JSON body discriminated by `type`:
 *
 *   A. { type: 'scholarships', items: [...] }
 *      Idempotent insert into cdc_external_opportunities on the existing
 *      natural key (title, source_organisation) — the same NOT EXISTS idiom
 *      used by migration 20260704090000_cdc_govt_jobs_readiness_content_and_columns.sql.
 *      Max 25 items per request.
 *
 *   B. { type: 'brief', date, title, body, url? }
 *      One in-app notification fanned out to the pilot audience via the shared
 *      fanoutNotification() helper. Idempotent per calendar date; expires
 *      after 48h so briefs never pile up unread.
 *
 *   C. { type: 'problems', items: [...] }
 *      Newspaper-reported real-world problems for learner innovation teams.
 *      Idempotent insert into the EXISTING Startup Studio problem bank
 *      (ss_problem_bank, migration 20260227185501) on the natural key
 *      (title, source_type='newspaper'). Live on arrival — Director decision
 *      2026-08-04: no draft state; rows carry source_type='newspaper' so the
 *      bank always shows their provenance. Max 10 items per request.
 *
 * UPSTREAM CONTRACT (updated 2026-08-04, Director decision): the pusher is
 * FULLY AUTOMATED — the daily-intelligence engine pushes each day's items
 * without a per-day human approval step. The quality controls live upstream
 * (every date/amount must be quote-backed from the paper; items carry a
 * "verify details before applying" line) and in the platform's staff/owner
 * visibility. This route does no editorial judgement; it validates shape and
 * writes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { connection } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';
import { BULLETIN_CATEGORIES } from '@/types/cdc/bulletin';

const VALID_API_KEY = process.env.HINDU_INTEL_API_KEY;

/** Hard cap on a single scholarships push. Bigger payloads are rejected. */
const MAX_ITEMS = 25;

/** Hard cap on the brief body. Longer bodies are rejected. */
const MAX_BODY_CHARS = 4000;

/** Brief TTL — self-obsoleting, same mechanism sunday-wrap uses (expires_at). */
const BRIEF_TTL_MS = 48 * 60 * 60 * 1000;

/** Hard cap on a single problems push — a day's paper yields at most a handful. */
const MAX_PROBLEM_ITEMS = 10;

/**
 * The engine's free-text sector words → ss_problem_theme enum values
 * (CREATE TYPE ss_problem_theme in migration 20260227185501). The original
 * sector word is preserved in sub_theme, so no fidelity is lost by mapping.
 */
// Null-prototype Map, NOT an object literal: a plain literal inherits from
// Object.prototype, so a payload with sector "constructor" / "toString" would
// resolve to a FUNCTION — truthy, so a `?? 'other'` fallback never fires — and
// JSON.stringify would then drop `theme` from the row entirely.
const SECTOR_TO_THEME = new Map<string, ProblemTheme>([
  ['waste', 'environment'],
  ['water', 'environment'],
  ['energy', 'environment'],
  ['agriculture', 'agriculture'],
  ['health', 'healthcare'],
  ['education', 'education'],
  ['transport', 'community'],
  ['civic', 'community'],
  ['other', 'other'],
]);

/** Values of the ss_problem_theme enum (migration 20260227185501). */
type ProblemTheme =
  | 'healthcare'
  | 'education'
  | 'agriculture'
  | 'environment'
  | 'community'
  | 'operations'
  | 'productivity'
  | 'other';

/**
 * Leadership recipients for the daily brief.
 *
 * These are raw `profiles.role` values, matched exactly the way
 * findTargetUsers() in app/api/notifications/send/route.ts resolves its
 * `target_roles` key: `profiles.role IN (...) AND is_active = true`.
 * The spellings are the ones the platform actually stores — 'admin' /
 * 'administrator' / 'super_admin' are the Director bucket (see the role hints
 * in /admin/dashboard/widget-config and DIRECTOR_ROLES in
 * lib/services/dashboard/dashboard-role-service.ts), 'cao' is the
 * chief-academic-officer key used by lib/utils/question-papers/qp-scope.ts,
 * and 'principal' is the institution-head key.
 */
const LEADERSHIP_ROLES = [
  // The full leadership audience, kept here for the eventual widening.
  // NOT used while BRIEF_PILOT_PROFILE_IDS below is non-empty.
  'super_admin',
  'administrator',
  'admin',
  'cao',
  'principal',
] as const;

/**
 * PILOT recipients, by profile id — overrides LEADERSHIP_ROLES entirely.
 *
 * The Director asked for the brief to reach "just me first". The first
 * attempt expressed that as `role = 'super_admin'`, which READ like one
 * person and turned out to be **14 active profiles** — all 14 received the
 * 2026-08-08 brief before anyone noticed. A role is a job description, not a
 * person; the only way to say "one person" is to name them.
 *
 * Widening is deliberate and reviewable: empty this array to fall back to
 * LEADERSHIP_ROLES, or add further ids.
 */
const BRIEF_PILOT_PROFILE_IDS: readonly string[] = [
  'b2bcb548-6b4c-4c75-a6b3-72dd5e9a94f1', // Director
];

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface ScholarshipItem {
  title?: unknown;
  deadline_date?: unknown;
  apply_url?: unknown;
  eligibility_text?: unknown;
  source_organisation?: unknown;
  category?: unknown;
  description?: unknown;
  stipend_text?: unknown;
}

type ItemOutcome = {
  title: string;
  status: 'inserted' | 'skipped';
  reason?: string;
};

interface ProblemItem {
  title?: unknown;
  problem_statement?: unknown;
  who_affected?: unknown;
  where?: unknown;
  sector?: unknown;
  severity?: unknown;
  current_workaround?: unknown;
  page?: unknown;
  paper_date?: unknown;
  edition?: unknown;
}

export async function POST(request: NextRequest) {
  await connection();

  // Dormant until the Director provisions the key (activation step in the PR).
  if (!VALID_API_KEY) {
    return NextResponse.json(
      { error: 'Ingest not configured', dormant: true },
      { status: 503 }
    );
  }

  const apiKey = request.headers.get('x-api-key');
  if (!matchesKey(apiKey, VALID_API_KEY)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const type = body?.type;

  try {
    const supabase = createServiceRoleClient();

    if (type === 'scholarships') {
      return await handleScholarships(supabase, body);
    }
    if (type === 'brief') {
      return await handleBrief(supabase, body);
    }
    if (type === 'problems') {
      return await handleProblems(supabase, body);
    }
    return NextResponse.json(
      { error: "Unknown type — expected 'scholarships', 'brief' or 'problems'" },
      { status: 400 }
    );
  } catch (error) {
    console.error(`[cdc/bulletin/ingest/${String(type)}]`, error);
    return NextResponse.json(
      { error: 'Ingest failed', details: (error as Error).message },
      { status: 500 }
    );
  }
}

// ─── Auth ────────────────────────────────────────────────────────────────────

/**
 * Constant-time key comparison. timingSafeEqual throws when the two buffers
 * differ in length, so length is checked first — that leak (key length) is
 * not meaningfully exploitable, whereas a byte-wise early return is.
 */
function matchesKey(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// ─── A. Scholarships → cdc_external_opportunities ─────────────────────────────

/**
 * Idempotent bulk insert keyed on (title, source_organisation).
 *
 * `posted_by` is deliberately OMITTED: the column is nullable
 * (`posted_by uuid REFERENCES public.profiles(id)` in
 * supabase/migrations/20260518_cdc_substrate_02_domain_tables_rls.sql, and
 * `posted_by?: string | null` in the generated types/supabase.ts Insert type),
 * so an externally-pushed row simply has no human poster. No env var and no
 * migration are needed for this.
 */
async function handleScholarships(
  supabase: ReturnType<typeof createServiceRoleClient>,
  body: Record<string, unknown>
) {
  const rawItems = body.items;
  if (!Array.isArray(rawItems)) {
    return NextResponse.json(
      { error: 'scholarships requires an items array' },
      { status: 400 }
    );
  }
  if (rawItems.length === 0) {
    return NextResponse.json({ type: 'scholarships', inserted: 0, skipped: 0, results: [] });
  }
  if (rawItems.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `Too many items: ${rawItems.length} (max ${MAX_ITEMS})` },
      { status: 400 }
    );
  }

  const results: ItemOutcome[] = [];
  const candidates: Array<{ title: string; source_organisation: string; row: Record<string, unknown> }> = [];

  for (const raw of rawItems as ScholarshipItem[]) {
    const title = str(raw?.title);
    const sourceOrganisation = str(raw?.source_organisation);
    const category = str(raw?.category);
    const deadlineDate = str(raw?.deadline_date);

    if (!title || !sourceOrganisation) {
      results.push({
        title: title || '(untitled)',
        status: 'skipped',
        reason: 'title and source_organisation are required',
      });
      continue;
    }
    if (!category || !(BULLETIN_CATEGORIES as readonly string[]).includes(category)) {
      results.push({
        title,
        status: 'skipped',
        reason: `category must be one of: ${BULLETIN_CATEGORIES.join(', ')}`,
      });
      continue;
    }
    if (deadlineDate && !isCalendarDate(deadlineDate)) {
      results.push({ title, status: 'skipped', reason: 'deadline_date must be a valid YYYY-MM-DD' });
      continue;
    }
    // The row is written by an external pusher and later rendered as a link on
    // the bulletin board — only real web URLs are accepted.
    const applyUrl = str(raw?.apply_url);
    if (applyUrl && !/^https?:\/\//i.test(applyUrl)) {
      results.push({ title, status: 'skipped', reason: 'apply_url must be an http(s) URL' });
      continue;
    }

    candidates.push({
      title,
      source_organisation: sourceOrganisation,
      row: {
        title,
        source_organisation: sourceOrganisation,
        category,
        deadline_date: deadlineDate || null,
        eligibility_text: str(raw?.eligibility_text) || null,
        apply_url: applyUrl || null,
        description: str(raw?.description) || null,
        stipend_text: str(raw?.stipend_text) || null,
        is_active: true,
        posted_at: new Date().toISOString(),
      },
    });
  }

  if (candidates.length === 0) {
    return NextResponse.json({
      type: 'scholarships',
      inserted: 0,
      skipped: results.length,
      results,
    });
  }

  // Natural-key pre-check — the supabase-js equivalent of the migration's
  // `WHERE NOT EXISTS (SELECT 1 ... WHERE e.title = v.title AND e.source_organisation = v.source_organisation)`.
  // One exact-match probe per candidate (≤ MAX_ITEMS, issued in parallel);
  // an `.in('title', ...)` batch would mangle titles containing quotes/commas
  // in PostgREST's filter grammar.
  const probes = await Promise.all(
    candidates.map((c) =>
      supabase
        .from('cdc_external_opportunities')
        .select('id')
        .eq('title', c.title)
        .eq('source_organisation', c.source_organisation)
        .limit(1)
    )
  );

  const seen = new Set<string>();
  const toInsert: Record<string, unknown>[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const probe = probes[i];
    if (probe.error) throw probe.error;

    const key = naturalKey(candidate.title, candidate.source_organisation);
    // `seen` also guards against duplicates WITHIN one payload.
    if ((probe.data?.length ?? 0) > 0 || seen.has(key)) {
      results.push({ title: candidate.title, status: 'skipped', reason: 'already exists' });
      continue;
    }
    seen.add(key);
    toInsert.push(candidate.row);
    results.push({ title: candidate.title, status: 'inserted' });
  }

  if (toInsert.length > 0) {
    const { error: insertErr } = await supabase
      .from('cdc_external_opportunities')
      .insert(toInsert);
    if (insertErr) throw insertErr;
  }

  return NextResponse.json({
    type: 'scholarships',
    inserted: toInsert.length,
    skipped: results.length - toInsert.length,
    results,
  });
}

function naturalKey(title: string, sourceOrganisation: string): string {
  // Intra-payload dedupe key only; the authoritative duplicate check is the
  // exact-match DB probe above.
  return `${title}::${sourceOrganisation}`;
}

// ─── B. Brief → one notification fanned out to leadership ─────────────────────

async function handleBrief(
  supabase: ReturnType<typeof createServiceRoleClient>,
  body: Record<string, unknown>
) {
  const date = str(body.date);
  const title = str(body.title);
  const text = str(body.body);
  const url = str(body.url);

  if (!date || !isCalendarDate(date)) {
    return NextResponse.json({ error: 'brief requires date as YYYY-MM-DD' }, { status: 400 });
  }
  if (!title || !text) {
    return NextResponse.json({ error: 'brief requires title and body' }, { status: 400 });
  }
  if (text.length > MAX_BODY_CHARS) {
    return NextResponse.json(
      { error: `body too long: ${text.length} chars (max ${MAX_BODY_CHARS})` },
      { status: 400 }
    );
  }
  // The URL is rendered as a click-through in the bell and on the dashboard
  // card — accept only an in-app path or a real web URL.
  if (url && !/^https?:\/\//i.test(url) && !(url.startsWith('/') && !url.startsWith('//'))) {
    return NextResponse.json(
      { error: 'url must be an http(s) URL or an in-app path' },
      { status: 400 }
    );
  }

  // Pilot ids win outright; otherwise fall back to role targeting, the same
  // resolution findTargetUsers() applies for a role-only audience.
  const pilot = BRIEF_PILOT_PROFILE_IDS.length > 0;
  const audience = pilot
    ? `profile ids [${BRIEF_PILOT_PROFILE_IDS.join(', ')}]`
    : `roles ${LEADERSHIP_ROLES.join(', ')}`;

  const query = supabase.from('profiles').select('id').eq('is_active', true);
  const { data: recipients, error: recipientsErr } = pilot
    ? await query.in('id', BRIEF_PILOT_PROFILE_IDS as string[])
    : await query.in('role', LEADERSHIP_ROLES as unknown as string[]);

  if (recipientsErr) throw recipientsErr;

  const userIds = ((recipients ?? []) as Array<{ id: string }>)
    .map((r) => r.id)
    .filter(Boolean);

  if (userIds.length === 0) {
    // Loud, not silent: a pilot id that is deactivated or mistyped would
    // otherwise swallow every brief behind a cheerful 200.
    console.error(
      `[cdc/bulletin/ingest/brief] no active recipients for ${audience} — brief for ${date} reached nobody`
    );
    return NextResponse.json({ type: 'brief', notified: 0, skipped: 'no_recipients' });
  }

  const result = await fanoutNotification(supabase, {
    title,
    body: text,
    userIds,
    category: 'daily-intel',
    kind: 'announcement',
    idempotencyKey: `daily-intel:${date}`,
    ...(url ? { url } : {}),
    // Record the audience that was ACTUALLY used, not the role list — an
    // audit trail that says "roles: super_admin" while the delivery went to
    // one named profile is worse than none.
    targeting: pilot
      ? { target_users: [...BRIEF_PILOT_PROFILE_IDS] }
      : { target_roles: [...LEADERSHIP_ROLES] },
    metadata: pilot
      ? { date, pilot_profile_ids: [...BRIEF_PILOT_PROFILE_IDS] }
      : { date, roles: [...LEADERSHIP_ROLES] },
    source: 'daily-intel-ingest',
    // fanoutNotification has no expiry option; expires_at is a real column on
    // notifications and the user-facing read path honours it (see
    // liveNotificationOrFilter in lib/services/notification/notification-service.ts).
    // 48h TTL keeps at most two briefs live at once on a daily cadence.
    extraColumns: { expires_at: new Date(Date.now() + BRIEF_TTL_MS).toISOString() },
  });

  return NextResponse.json({
    type: 'brief',
    date,
    notified: result.notified,
    notification_id: result.notificationId ?? null,
    skipped: result.skipped ?? null,
  });
}

// ─── C. Problems → ss_problem_bank (Startup Studio) ───────────────────────────

/**
 * Newspaper-reported problems become live problem-bank rows for learner
 * innovation teams. The bank and its learner visibility ALREADY exist
 * (table: 20260227185501; student startup_studio.problem_bank.view grant:
 * 20260305000002) — this handler only feeds the existing feature.
 *
 * Defaults left to the table: validation_status 'unvalidated', status 'open',
 * is_open_for_attempts true. `submitted_by` stays NULL (no human submitter);
 * provenance lives in source_type/source_event/metadata.
 */
async function handleProblems(
  supabase: ReturnType<typeof createServiceRoleClient>,
  body: Record<string, unknown>
) {
  const rawItems = body.items;
  if (!Array.isArray(rawItems)) {
    return NextResponse.json(
      { error: 'problems requires an items array' },
      { status: 400 }
    );
  }
  if (rawItems.length === 0) {
    return NextResponse.json({ type: 'problems', inserted: 0, skipped: 0, results: [] });
  }
  if (rawItems.length > MAX_PROBLEM_ITEMS) {
    return NextResponse.json(
      { error: `Too many items: ${rawItems.length} (max ${MAX_PROBLEM_ITEMS})` },
      { status: 400 }
    );
  }

  const results: ItemOutcome[] = [];
  const candidates: Array<{ title: string; row: Record<string, unknown> }> = [];

  for (const raw of rawItems as ProblemItem[]) {
    const title = str(raw?.title);
    const statement = str(raw?.problem_statement);
    const sector = str(raw?.sector).toLowerCase();
    const paperDate = str(raw?.paper_date);

    if (!title || !statement) {
      results.push({
        title: title || '(untitled)',
        status: 'skipped',
        reason: 'title and problem_statement are required',
      });
      continue;
    }
    if (paperDate && !isCalendarDate(paperDate)) {
      results.push({ title, status: 'skipped', reason: 'paper_date must be a valid YYYY-MM-DD' });
      continue;
    }

    // severity is optional; the column CHECK demands 1-10, so anything else
    // becomes NULL rather than failing the whole insert.
    const severityNum = Number(raw?.severity);
    const severity =
      Number.isInteger(severityNum) && severityNum >= 1 && severityNum <= 10
        ? severityNum
        : null;

    const edition = str(raw?.edition);
    const pageNum = Number(raw?.page);

    candidates.push({
      title,
      row: {
        title,
        problem_statement: statement,
        who_affected: str(raw?.who_affected) || null,
        where_occurs: str(raw?.where) || null,
        theme: SECTOR_TO_THEME.get(sector) ?? 'other',
        sub_theme: sector || null,
        severity_rating: severity,
        current_workaround: str(raw?.current_workaround) || null,
        source_type: 'newspaper',
        source_year: paperDate ? Number(paperDate.slice(0, 4)) : null,
        source_event: `The Hindu${edition ? ` (${edition})` : ''}${paperDate ? ` ${paperDate}` : ''}`,
        metadata: {
          engine: 'hindu-intel',
          ...(paperDate ? { paper_date: paperDate } : {}),
          ...(edition ? { edition } : {}),
          ...(Number.isInteger(pageNum) && pageNum > 0 ? { page: pageNum } : {}),
        },
      },
    });
  }

  if (candidates.length === 0) {
    return NextResponse.json({
      type: 'problems',
      inserted: 0,
      skipped: results.length,
      results,
    });
  }

  // Natural-key pre-check on (title, source_type='newspaper') — same
  // per-candidate exact-match probe idiom as scholarships (see the note there
  // on why `.in(...)` batching is avoided).
  const probes = await Promise.all(
    candidates.map((c) =>
      supabase
        .from('ss_problem_bank')
        .select('id')
        .eq('title', c.title)
        .eq('source_type', 'newspaper')
        .limit(1)
    )
  );

  const seen = new Set<string>();
  const toInsert: Record<string, unknown>[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    const probe = probes[i];
    if (probe.error) throw probe.error;

    if ((probe.data?.length ?? 0) > 0 || seen.has(candidate.title)) {
      results.push({ title: candidate.title, status: 'skipped', reason: 'already exists' });
      continue;
    }
    seen.add(candidate.title);
    toInsert.push(candidate.row);
    results.push({ title: candidate.title, status: 'inserted' });
  }

  if (toInsert.length > 0) {
    const { error: insertErr } = await supabase
      .from('ss_problem_bank')
      .insert(toInsert);
    if (insertErr) throw insertErr;
  }

  return NextResponse.json({
    type: 'problems',
    inserted: toInsert.length,
    skipped: results.length - toInsert.length,
    results,
  });
}

// ─── Utils ───────────────────────────────────────────────────────────────────

/** Coerce an unknown field to a trimmed string; non-strings become ''. */
function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** YYYY-MM-DD shape AND a real calendar date (rejects 2026-13-45). */
function isCalendarDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
