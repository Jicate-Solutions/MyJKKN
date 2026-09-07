// app/api/campus-walk/scoreboard/steps/route.ts
// ============================================================================
// Campus Walk D12 — the door a daily step reading comes in through.
//
// Spec: specs/campus-walk-2026-08-17.md, D12 ("steps + area coverage recorded,
// shown against the 20,000-step goal") and §5.
//
// ── THIS IS A DOOR. NOTHING IS KNOCKING ON IT YET. ──────────────────────────
// As of 2026-09-03 nothing sends step readings to MyJKKN and shipping this
// route does not change that. Every reading that has ever existed was written
// by a sync job running on the Director's own machine into a local Obsidian
// vault. MyJKKN is a deployed web application — it cannot read that machine,
// that vault, or the wearable's API. A sender has to POST here. Writing that
// sender is a separate piece of work and is deliberately not in this change,
// because a stub that invented numbers would be worse than an empty board.
//
// The coverage screen says all of this in plain words rather than drawing a
// flat line and letting it be read as "he did not walk".
//
// ── AND THE GAP IS NOT A BROKEN JOB ─────────────────────────────────────────
// Verified 2026-09-03: that sync job is alive — it ran that morning, its token
// is valid, it cached fresh API responses for 2026-09-01/02/03, and its own
// log line is "0 written, 3 days with no ring data". There has been no reading
// since 2026-04-18 because the wearable stopped producing them. Nothing in
// this file, or in any message it returns, may describe that as a failure of
// software.
//
// ── WHAT IT WILL AND WILL NOT STORE ─────────────────────────────────────────
// A date and a step count. Nothing else. Spec §5: body measurements, lab
// values, heart rate, sleep and diet plans live in the Director's private
// vault and must never be written into MyJKKN.
//
// A day with no reading is an ABSENT ROW. Zero is refused at intake (see
// MIN_ACCEPTED_STEPS) because a stored zero is a claim that somebody walked
// nowhere, and it is indistinguishable from nobody having measured.
// ============================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getCampusWalkReporters, isCampusWalkReporter } from '@/lib/campus-walk/reporters';
import { describeStepFeed, type StepDay } from '@/lib/campus-walk/scoreboard';

/** How many days back GET returns. A month is what the board plots. */
const READ_WINDOW_DAYS = 60;

/**
 * Zero is refused. It is the exact shape of "the wearable was not worn", and
 * storing it would render on the board as a day walked to no distance. A
 * sender with no reading for a day must send nothing for that day.
 */
const MIN_ACCEPTED_STEPS = 1;

/**
 * Sanity ceiling. ~150 km on foot in one day; past this the number is a unit
 * mistake or a bad parse, and a single absurd row would distort the median for
 * every day around it.
 */
const MAX_ACCEPTED_STEPS = 200_000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function bad(status: number, error: string, message: string) {
  return NextResponse.json({ success: false, error, message }, { status });
}

/**
 * Who this request is allowed to record steps for, as a profiles.id.
 *
 * Two doors, both narrow:
 *
 *   1. A SIGNED-IN REPORTER. The same gate the rest of the module uses —
 *      lib/campus-walk/reporters.ts, resolved from the platform_policies row
 *      and failing CLOSED to the Director alone. Records for themselves only;
 *      the body cannot name somebody else.
 *
 *   2. A MACHINE HOLDING CRON_SECRET. An automated sender has no browser
 *      session, so it authenticates the way every job in app/api/cron/* on
 *      this platform already does. It MUST also name an `email`, and that
 *      email must be a configured reporter — so this door can only write
 *      steps for the one person D2 permits, never for an arbitrary profile.
 *      Reusing the deployed secret rather than minting a new environment
 *      variable keeps this shippable without a config change; it is strictly
 *      less powerful than what that secret already triggers.
 *
 * Returns null when neither door opens. Never falls through to "allow".
 */
async function resolveWriteTarget(
  request: NextRequest,
  bodyEmail: string | null
): Promise<{ profileId: string; via: 'session' | 'machine' } | null> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (user?.id && (await isCampusWalkReporter(user.email))) {
    return { profileId: user.id, via: 'session' };
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return null;
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) return null;

  const email = (bodyEmail ?? '').trim().toLowerCase();
  if (!email) return null;

  const reporters = await getCampusWalkReporters();
  if (!reporters.map((r) => r.toLowerCase()).includes(email)) return null;

  const admin = createServiceRoleClient();
  const { data: profile, error } = await admin
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle();

  if (error) {
    console.error('[campus-walk/steps] profile lookup failed:', error.message);
    return null;
  }
  if (!profile?.id) return null;

  return { profileId: profile.id as string, via: 'machine' };
}

/**
 * POST — record one day's reading.
 *
 * Body: { date: 'YYYY-MM-DD', steps: number, source?: string, email?: string }
 *
 * Re-sending a date CORRECTS it (upsert on the one-per-person-per-day unique
 * constraint) rather than stacking a second row that would silently double a
 * total. One day at a time, deliberately: a batch endpoint is a backfill
 * endpoint, and backfilling step history from anywhere would manufacture
 * activity data that nobody measured.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return bad(400, 'invalid_json', 'The request body was not valid JSON.');
  }

  const target = await resolveWriteTarget(
    request,
    typeof body.email === 'string' ? body.email : null
  );
  if (!target) {
    return bad(
      403,
      'not_permitted',
      'You are not permitted to record step readings for Campus Walk. Recording is limited to the named people in the campus walk reporters policy.'
    );
  }

  const date = typeof body.date === 'string' ? body.date.trim() : '';
  if (!DATE_RE.test(date)) {
    return bad(400, 'invalid_date', 'Send the day as a date in YYYY-MM-DD form, for example 2026-09-03.');
  }
  // Reject a date the calendar does not have (2026-02-31 matches the regex).
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return bad(400, 'invalid_date', `${date} is not a real date.`);
  }

  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  if (date > todayISO) {
    return bad(
      400,
      'future_date',
      'That day has not happened yet, so there is nothing to record for it.'
    );
  }

  const stepsRaw = body.steps;
  const steps = typeof stepsRaw === 'number' ? stepsRaw : Number(stepsRaw);
  if (!Number.isFinite(steps) || !Number.isInteger(steps)) {
    return bad(400, 'invalid_steps', 'Send the step count as a whole number.');
  }
  if (steps < MIN_ACCEPTED_STEPS) {
    return bad(
      400,
      'zero_steps',
      'A reading of zero is not recorded. A day with no reading is left blank on purpose — blank means nobody measured, whereas zero would read as having walked nowhere. Send nothing for a day that has no reading.'
    );
  }
  if (steps > MAX_ACCEPTED_STEPS) {
    return bad(
      400,
      'implausible_steps',
      `${steps.toLocaleString('en-IN')} steps in one day is not plausible, so it has not been recorded in case the number arrived in the wrong units.`
    );
  }

  const source =
    typeof body.source === 'string' && body.source.trim()
      ? body.source.trim().slice(0, 60)
      : target.via === 'machine'
        ? 'automated'
        : 'manual';

  const admin = createServiceRoleClient();
  const { error } = await admin.from('campus_walk_step_days').upsert(
    {
      profile_id: target.profileId,
      step_date: date,
      steps,
      source
    },
    { onConflict: 'profile_id,step_date' }
  );

  if (error) {
    console.error('[campus-walk/steps] upsert failed:', error.message);
    return bad(
      500,
      'save_failed',
      'The reading could not be saved. Nothing has changed — please try again.'
    );
  }

  return NextResponse.json({ success: true, date, steps, source });
}

/**
 * GET — what MyJKKN actually holds, plus an honest description of the feed.
 *
 * Exists so ingestion can be verified without database access: with no sender
 * built yet, "did my POST land?" is a question somebody will need to answer
 * from a phone. Signed-in reporters only — a machine may write its own
 * reading, but reading a person's activity history needs that person.
 */
export async function GET(): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user?.id || !(await isCampusWalkReporter(user.email))) {
    return bad(
      403,
      'not_permitted',
      'You are not permitted to see Campus Walk step readings.'
    );
  }

  const since = new Date(Date.now() - READ_WINDOW_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from('campus_walk_step_days')
    .select('step_date, steps, source, recorded_at')
    .eq('profile_id', user.id)
    .gte('step_date', since)
    .order('step_date', { ascending: true });

  if (error) {
    console.error('[campus-walk/steps] read failed:', error.message);
    return bad(500, 'read_failed', 'The readings could not be loaded. Please try again.');
  }

  const days = (data ?? []) as StepDay[];
  return NextResponse.json({
    success: true,
    days,
    feed: describeStepFeed(days)
  });
}
