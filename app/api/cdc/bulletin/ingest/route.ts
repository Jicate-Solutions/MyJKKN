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
 *      One in-app notification fanned out to leadership roles via the shared
 *      fanoutNotification() helper. Idempotent per calendar date; expires
 *      after 48h so briefs never pile up unread.
 *
 * UPSTREAM CONTRACT: the pusher is expected to be human-gated — a person
 * approves each day's items before anything is POSTed here. This route does
 * no editorial judgement; it validates shape and writes.
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
  'super_admin',
  'administrator',
  'admin',
  'cao',
  'principal',
] as const;

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
    return NextResponse.json(
      { error: "Unknown type — expected 'scholarships' or 'brief'" },
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

  // Role targeting — same resolution findTargetUsers() applies for a
  // role-only `target_roles` audience.
  const { data: recipients, error: recipientsErr } = await supabase
    .from('profiles')
    .select('id')
    .in('role', LEADERSHIP_ROLES as unknown as string[])
    .eq('is_active', true);

  if (recipientsErr) throw recipientsErr;

  const userIds = ((recipients ?? []) as Array<{ id: string }>)
    .map((r) => r.id)
    .filter(Boolean);

  if (userIds.length === 0) {
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
    targeting: { target_roles: [...LEADERSHIP_ROLES] },
    metadata: { date, roles: [...LEADERSHIP_ROLES] },
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
