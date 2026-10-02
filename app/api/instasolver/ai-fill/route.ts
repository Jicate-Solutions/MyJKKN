// app/api/instasolver/ai-fill/route.ts
// ============================================================================
// InstaSolver — "Fill it for me".
//
// Director rulings, 30 Sep 2026: the fastest way to report is to type it in
// ANY words (Tamil included). The AI picks the trade, the place and how
// urgent it is; when unsure it asks ONE question with tap-to-pick answers.
// The form fields it fills stay editable, and nothing is filed here — the
// person still presses Send on the normal form, which posts to
// app/api/instasolver/broken exactly as before.
//
// Director ruling, 1 Oct 2026: the fill runs on the Windows box's Claude Max
// lane, model Opus, at no API cost — never through a paid API key. So:
//   POST { text }        -> enqueues one `instasolver.ai_fill` job on the
//                           ai_jobs queue (fn_ai_enqueue_system, lane 'max')
//                           and answers at once with { job_id, status }.
//   GET  ?job=<job id>   -> the browser polls this until the job is done,
//                           then gets { fill } — validated here exactly as
//                           before (parseAiFill).
// The Max lane can be minutes behind batch work; the form stays usable by
// hand the whole time (broken-client.tsx).
//
// WHAT THIS ROUTE NEVER DOES
//   - It never receives a photo. The body is JSON `{ text }` only; the photo
//     stays in the browser until the person sends the report itself.
//   - It writes nothing but the queue row. Places are READ from `resources`
//     under the caller's own session, never service-role. What keeps them to
//     the person's own college is the explicit `institution_id` filter below —
//     NOT RLS: `resources` also has a permissive "any signed-in user may
//     read" SELECT policy (supabase/SQL_FILE_INDEX.md, 2026-09-12), so
//     `resources_select_institution` alone scopes nothing.
//   - It never shows one person another person's fill. The job is enqueued
//     by the service role (so requested_by is the seat owner, not the
//     person); the person's id rides in payload._ctx.requester and GET
//     answers 404 for anyone else.
//   - It never fails loudly. A queue error, a failed job or a reply that does
//     not parse returns `{ success:false, fallback:true }` with the plain-form
//     message, and the person picks the fields by hand as they could before.
//
// Dedupe: the same words (spaces collapsed) from the same person within 10
// minutes reuse the existing job instead of queueing another one.
//
// Same gate order as the broken route, BEFORE anything is queued, so a guest
// or an inactive account cannot load the queue: signed in -> has a profile ->
// profile active -> not a guest.
// ============================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 15;

import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { extractJobResultText } from '@/lib/services/platform/ai-jobs-lane';
import {
  AI_FILL_DEDUPE_WINDOW_MS,
  AI_FILL_FALLBACK_MESSAGE,
  AI_FILL_JOB_TYPE,
  AI_FILL_LIMITS,
  AI_FILL_LIMIT_PER_WINDOW,
  buildAiFillPlacesBlock,
  distinctPlaces,
  normalizeAiFillText,
  parseAiFill,
  takeAiFillSlot
} from '@/lib/instasolver/ai-fill';

const MAX_PLACE_ROWS = 800;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIVE_STATUSES = ['pending', 'claimed', 'running'] as const;

type Admin = ReturnType<typeof createServiceRoleClient>;

interface JobRow {
  id: string;
  status: string;
  result: unknown;
  payload: unknown;
}

function fail(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ success: false, error, ...extra }, { status });
}

function fallback(status: number, reason: string) {
  return NextResponse.json(
    { success: false, fallback: true, reason, error: AI_FILL_FALLBACK_MESSAGE },
    { status }
  );
}

/** instasolver-ai-fill:<user id>:<sha256 of the normalised text> */
function dedupeKey(userId: string, text: string): string {
  const hash = createHash('sha256').update(normalizeAiFillText(text)).digest('hex');
  return `instasolver-ai-fill:${userId}:${hash}`;
}

function jobContext(payload: unknown): { requester: string | null; places: string[] } {
  const ctx =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)._ctx
      : undefined;
  if (!ctx || typeof ctx !== 'object') return { requester: null, places: [] };
  const c = ctx as Record<string, unknown>;
  return {
    requester: typeof c.requester === 'string' ? c.requester : null,
    places: Array.isArray(c.places)
      ? c.places.filter((p): p is string => typeof p === 'string')
      : []
  };
}

/** What the browser gets for one job, whatever state it is in. */
function jobResponse(job: JobRow) {
  if ((LIVE_STATUSES as readonly string[]).includes(job.status)) {
    return NextResponse.json(
      { success: true, status: 'pending', job_id: job.id },
      { status: 202 }
    );
  }
  if (job.status === 'done') {
    const text = extractJobResultText(job.result);
    const fill = text ? parseAiFill(text, jobContext(job.payload).places) : null;
    if (!fill) {
      console.warn('[instasolver/ai-fill] job reply did not parse — plain form fallback');
      return fallback(502, 'unparseable');
    }
    return NextResponse.json(
      { success: true, status: 'done', job_id: job.id, fill },
      { status: 200 }
    );
  }
  console.warn(`[instasolver/ai-fill] job ${job.id} ended as ${job.status} — plain form fallback`);
  return fallback(502, 'model_error');
}

/** The newest live-or-done job for this key in the dedupe window, or null. */
async function findRecentJob(admin: Admin, key: string): Promise<JobRow | null> {
  const since = new Date(Date.now() - AI_FILL_DEDUPE_WINDOW_MS).toISOString();
  const { data, error } = await admin
    .from('ai_jobs')
    .select('id, status, result, payload')
    .eq('job_type', AI_FILL_JOB_TYPE)
    .filter('payload->>_dedupe', 'eq', key)
    .in('status', [...LIVE_STATUSES, 'done'])
    .gte('requested_at', since)
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.warn('[instasolver/ai-fill] dedupe lookup failed:', error.message);
    return null;
  }
  return (data as JobRow | null) ?? null;
}

type Gate =
  | { ok: true; userId: string; institutionId: string | null; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; response: NextResponse };

async function gate(): Promise<Gate> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, response: fail('You need to be signed in to report something broken.', 401) };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, institution_id, is_active')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('[instasolver/ai-fill] profile lookup failed:', profileError.message);
    return { ok: false, response: fail('Could not check your account just now. Please try again.', 503) };
  }
  if (!profile) {
    return {
      ok: false,
      response: fail(
        'Your account has no profile on MyJKKN yet. Contact the office to have your profile set up.',
        403
      )
    };
  }
  if (profile.is_active !== true) {
    return {
      ok: false,
      response: fail(
        'Your account is not active, so it cannot file reports. Contact the office if this is wrong.',
        403
      )
    };
  }
  if (profile.role === 'guest') {
    return {
      ok: false,
      response: fail(
        'Guest accounts cannot report a fault yet. Ask the office to finish setting up your account, then try again.',
        403
      )
    };
  }
  return {
    ok: true,
    userId: user.id,
    institutionId: (profile.institution_id as string | null) ?? null,
    supabase
  };
}

function adminClient(): Admin | null {
  try {
    return createServiceRoleClient();
  } catch (e: unknown) {
    console.error(
      '[instasolver/ai-fill] no service-role client:',
      e instanceof Error ? e.message : e
    );
    return null;
  }
}

export async function POST(request: NextRequest) {
  const g = await gate();
  if ('response' in g) return g.response;

  let text = '';
  try {
    const body = (await request.json()) as unknown;
    if (body && typeof body === 'object' && typeof (body as { text?: unknown }).text === 'string') {
      text = (body as { text: string }).text.trim();
    }
  } catch {
    return fail('Expected a JSON body with the text.', 400);
  }
  if (text.length < AI_FILL_LIMITS.inputMin || text.length > AI_FILL_LIMITS.inputMax) {
    return fail(
      `Tell us what is wrong — between ${AI_FILL_LIMITS.inputMin} and ${AI_FILL_LIMITS.inputMax} characters.`,
      400
    );
  }

  const admin = adminClient();
  if (!admin) return fallback(503, 'queue_unavailable');

  // Same words, same person, last 10 minutes -> the same job. Checked before
  // the hourly cap so a repeat tap does not use up a slot.
  const key = dedupeKey(g.userId, text);
  const existing = await findRecentJob(admin, key);
  if (existing) return jobResponse(existing);

  if (!takeAiFillSlot(g.userId)) {
    return fail(
      `You've used "Fill it for me" ${AI_FILL_LIMIT_PER_WINDOW} times in the last hour. Please fill the form below by hand, or try again later.`,
      429,
      { fallback: true }
    );
  }

  // Places at the reporter's own college. A failure here is not fatal: the
  // model simply works from the person's own words. Most `resources` rows are
  // equipment with no building or block, so only rows that name one are read,
  // in a stable order — otherwise the row cap returns a random, partial list
  // and real block chips are silently dropped.
  let knownPlaces: string[] = [];
  if (g.institutionId) {
    try {
      const { data: rows, error: placesError } = await g.supabase
        .from('resources')
        .select('building_number, block_number')
        .eq('institution_id', g.institutionId)
        .or('building_number.not.is.null,block_number.not.is.null')
        .order('building_number', { ascending: true, nullsFirst: false })
        .order('block_number', { ascending: true, nullsFirst: false })
        .limit(MAX_PLACE_ROWS);
      if (placesError) {
        console.warn('[instasolver/ai-fill] places read failed:', placesError.message);
      } else {
        knownPlaces = distinctPlaces(rows ?? []);
      }
    } catch (e: unknown) {
      console.warn(
        '[instasolver/ai-fill] places read threw:',
        e instanceof Error ? e.message : e
      );
    }
  }

  // Payload keys `text` and `places` match the job type's input_schema and
  // prompt_template; `_ctx` is for this route only (who asked, which places
  // the question chips may name).
  const { data: enq, error: enqError } = await admin.rpc('fn_ai_enqueue_system', {
    p_job_type: AI_FILL_JOB_TYPE,
    p_payload: {
      text,
      places: buildAiFillPlacesBlock(knownPlaces),
      _ctx: { requester: g.userId, places: knownPlaces }
    },
    p_dedupe_key: key
  });
  const r = enq as { ok?: boolean; job_id?: string; error?: string } | null;

  if (!enqError && r?.ok && typeof r.job_id === 'string') {
    return NextResponse.json(
      { success: true, status: 'pending', job_id: r.job_id },
      { status: 202 }
    );
  }

  // Another tap with the same words got there first: use that job.
  if (!enqError && r?.error === 'in_flight') {
    const racer = await findRecentJob(admin, key);
    if (racer) return jobResponse(racer);
  }

  console.warn(
    '[instasolver/ai-fill] enqueue failed — plain form fallback:',
    enqError?.message ?? r?.error ?? 'unknown'
  );
  return fallback(503, 'queue_unavailable');
}

export async function GET(request: NextRequest) {
  const g = await gate();
  if ('response' in g) return g.response;

  const jobId = request.nextUrl.searchParams.get('job');
  if (!jobId || !UUID_RE.test(jobId)) {
    return fail('A valid job id is required.', 400);
  }

  const admin = adminClient();
  if (!admin) return fallback(503, 'queue_unavailable');

  const { data, error } = await admin
    .from('ai_jobs')
    .select('id, status, result, payload')
    .eq('id', jobId)
    .eq('job_type', AI_FILL_JOB_TYPE)
    .maybeSingle();

  if (error) {
    console.warn('[instasolver/ai-fill] job read failed:', error.message);
    // A read hiccup is not the job failing: keep the browser waiting.
    return NextResponse.json({ success: true, status: 'pending', job_id: jobId }, { status: 202 });
  }

  const job = data as JobRow | null;
  if (!job || jobContext(job.payload).requester !== g.userId) {
    return fail('Not found.', 404);
  }
  return jobResponse(job);
}
