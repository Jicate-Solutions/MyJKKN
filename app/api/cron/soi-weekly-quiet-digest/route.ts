// app/api/cron/soi-weekly-quiet-digest/route.ts
// ============================================================================
// School of Influence — the weekly summary of who has gone quiet.
// Director decision 2026-08-02. Created: 2026-08-02.
//
// THE ENGINE STAYS IN DRY RUN. This route sends a message and nothing else.
// There is no branch here that changes a membership, reminds, pauses or removes
// anybody, and nothing here writes soi.inactivity.enabled. The summary it sends
// says so in plain words, every time, because a message that reads as though
// something was done to somebody is exactly the failure this whole section
// exists to prevent.
//
// WHY IT EXISTS AT ALL
//   The S7 evaluator records what it WOULD do and takes no action. But a
//   dry-run log nobody reads fails the same way an inert engine does — SF100
//   carried inactivity settings that never fired once and sat four months with
//   nobody noticing. So the finding is pushed to a human once a week instead of
//   waiting to be looked up.
//
// SILENCE IS NEVER THE ANSWER
//   If nobody has gone quiet, the summary says so. If there is no batch yet, or
//   the batches are empty, it says THAT instead — "nothing to evaluate yet" and
//   "everybody is fine" are different news and neither is a zero dressed up as
//   good news. As of 2026-08-01 there are no School of Influence memberships at
//   all, so the honest live answer today is one of the first two.
//
// WOKEN BY THE DISPATCHER, DAILY. Registered as ai_routine_schedules row
// 'soi-weekly-quiet-digest' (seeded by 20260808230100), fired by
// /api/cron/ai-routine-dispatcher — NOT a raw vercel.json cron, which holds 100
// entries and is the wrong place for a schedule a coordinator should be able to
// change. It is woken every day and SENDS only on soi.digest.weekday, so the day
// is one policy row and a release is never needed to move it.
//
// SERVICE ROLE, NOT THE CALLER. fn_soi_weekly_quiet_digest and
// fn_soi_digest_audience are granted to service_role only — EXECUTE is revoked
// from anon, PUBLIC and explicitly from authenticated, because the document
// names people across every batch and institution. This route holds the service
// key, so the secret check below is the real gate and it FAILS CLOSED when
// CRON_SECRET is absent: an unset variable must refuse the request, never skip
// the check.
//
// SAFE TO RUN REPEATEDLY. notifications.idempotency_key is
// soi_weekly_quiet_digest:<week_start>:<recipient>, so a retry, a manual poke
// and the scheduled run cannot deliver the same week's summary twice.
//
// NO ACKNOWLEDGEMENT REQUESTED. requires_acknowledgment is set false
// deliberately: this is an internal working summary, not a directive, and
// demanding a tick for it would train people to tick without reading.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` OR `?secret=`.
// `?ignore_weekday=1` sends outside the configured day for a deliberate manual
// run; it changes WHEN, never WHAT, and the idempotency key still prevents a
// second message for the same week.
// ============================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logger } from '@/lib/utils/enhanced-logger';

const JOB_NAME = 'soi-weekly-quiet-digest';

/** Where the summary points. The screen that already lists the verdicts. */
const LIFECYCLE_PATH = '/startup-studio/school-of-influence/admin/lifecycle';

/**
 * Lowercase v4-shaped uuid. Deliberately case-SENSITIVE — see buildTargeting.
 */
const UUID_LOWER_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** How many people the message names before it starts counting the rest. */
const NAMED_LIMIT = 8;

// ---------------------------------------------------------------------------
// Shapes returned by fn_soi_weekly_quiet_digest. Re-derived defensively below
// rather than trusted, in the same spirit as the lifecycle reader.
// ---------------------------------------------------------------------------

interface DigestMember {
  full_name?: string;
  membership_status?: string;
  verdict?: string;
  days_quiet?: number;
  sessions_missed?: number;
  threshold_days?: number | null;
}

interface DigestBatch {
  cohort_id?: string;
  batch_name?: string | null;
  source_event_id?: string | null;
  engine_armed?: boolean;
  members_total?: number;
  not_trackable?: number;
  listed_count?: number;
  runs_recorded?: number;
  listed_members?: DigestMember[];
}

interface DigestRecipient {
  profile_id?: string;
  full_name?: string;
  all_institutions?: boolean;
  cohort_ids?: string[];
}

interface DigestDocument {
  as_of?: string;
  digest_enabled?: boolean;
  weekday?: string;
  include_from?: string;
  is_digest_day?: boolean;
  week_start?: string;
  window_start?: string;
  state?: string;
  engine_armed_anywhere?: boolean;
  totals?: Record<string, number>;
  batches?: DigestBatch[];
  recipients?: DigestRecipient[];
}

// ---------------------------------------------------------------------------
// Targeting — validated in code, because the database does not validate it.
//
// notifications.targeting is `JSONB NOT NULL` and NOTHING CHECKS ITS CONTENTS.
// The bell resolves a row through fn_notification_is_for_user, which matches
// with:
//
//     p_targeting -> 'user_ids' ? p_user_id::text
//
// Three properties of that expression are load-bearing and none of them are
// enforced by a constraint:
//   1. `?` tests membership of a jsonb ARRAY OF STRINGS. A uuid written as a
//      number, an object, or a nested array is simply not found.
//   2. `?` is byte-exact, and `uuid::text` renders LOWERCASE. An upper-case or
//      mixed-case uuid never matches.
//   3. An empty array matches nobody.
//
// In all three cases the INSERT succeeds, the row exists, no error is raised
// anywhere — and the recipient never sees it. That is a silent delivery
// failure, indistinguishable from "nothing happened this week", which is the
// exact class of silence this feature exists to remove. So the object is built
// in one place, normalised to lower case, checked against the uuid shape, and
// then re-tested for the membership the database will perform. A recipient that
// fails any check is COUNTED AND REPORTED in the response, never dropped
// quietly.
// ---------------------------------------------------------------------------

interface UserTargeting {
  type: 'user';
  user_ids: string[];
}

function buildTargeting(profileId: unknown): { targeting: UserTargeting; userId: string } | null {
  if (typeof profileId !== 'string') return null;
  const id = profileId.trim().toLowerCase();
  if (!UUID_LOWER_RE.test(id)) return null;

  const targeting: UserTargeting = { type: 'user', user_ids: [id] };

  // Re-run the database's own membership test on the object we are about to
  // write. Cheap, and it fails here — where it can be reported — instead of
  // silently at read time.
  const resolvable =
    Array.isArray(targeting.user_ids) &&
    targeting.user_ids.length > 0 &&
    targeting.user_ids.every((v) => typeof v === 'string' && UUID_LOWER_RE.test(v)) &&
    targeting.user_ids.includes(id);
  if (!resolvable) return null;

  return { targeting, userId: id };
}

// ---------------------------------------------------------------------------
// Plain-language body. Every branch says what was NOT done.
// ---------------------------------------------------------------------------

const VERDICT_WORD: Record<string, string> = {
  nudge: 'would get a reminder',
  pause: 'would have access paused',
  remove: 'would be removed from the batch',
};

/** The one sentence that must never be missing, whatever else the summary says. */
const NOTHING_WAS_DONE =
  'Nothing has been done to anybody. The engine that could remind, pause or remove people is switched off and this build has no action step at all, so this is a list for a person to decide on — not a record of something that happened.';

function batchLabel(b: DigestBatch): string {
  const name = typeof b.batch_name === 'string' && b.batch_name.trim().length > 0
    ? b.batch_name.trim()
    : 'Unnamed batch';
  return name;
}

function buildBody(doc: DigestDocument, batches: DigestBatch[]): string {
  const lines: string[] = [];
  const state = doc.state ?? 'no_batches';

  const members = batches.reduce((n, b) => n + (b.members_total ?? 0), 0);
  const listed = batches.reduce((n, b) => n + (b.listed_count ?? 0), 0);
  const untracked = batches.reduce((n, b) => n + (b.not_trackable ?? 0), 0);
  const runs = batches.reduce((n, b) => n + (b.runs_recorded ?? 0), 0);

  lines.push(`School of Influence — week ending ${doc.week_start ?? doc.as_of ?? 'today'}.`);

  if (state === 'no_batches' || batches.length === 0) {
    lines.push(
      'There is no School of Influence batch to look at yet, so there is nothing to evaluate. This note is sent every week even when there is nothing in it, so that a quiet week can never be confused with a check that stopped running.',
    );
  } else if (members === 0) {
    lines.push(
      `${batches.length} batch(es) exist and nobody has joined them yet, so there is nothing to evaluate. You are being told this rather than sent nothing, so that an empty week is never mistaken for a job that has stopped.`,
    );
  } else if (listed === 0) {
    lines.push(
      `${members} member(s) across ${batches.length} batch(es) were checked and nobody has gone quiet.`,
    );
  } else {
    lines.push(
      `${listed} of ${members} member(s) have gone quiet across ${batches.length} batch(es):`,
    );
    let named = 0;
    for (const b of batches) {
      const rows = Array.isArray(b.listed_members) ? b.listed_members : [];
      if (rows.length === 0) continue;
      for (const m of rows) {
        if (named >= NAMED_LIMIT) break;
        const word = VERDICT_WORD[m.verdict ?? ''] ?? 'is quiet';
        lines.push(
          `• ${m.full_name ?? 'Unnamed'} (${batchLabel(b)}) — quiet ${m.days_quiet ?? 0} day(s), missing ${m.sessions_missed ?? 0} held session(s); ${word}.`,
        );
        named += 1;
      }
      if (named >= NAMED_LIMIT) break;
    }
    if (listed > named) lines.push(`…and ${listed - named} more on the screen.`);
  }

  // Never folded into the quiet count, and always stated when present: a member
  // with no learner record cannot have an attendance mark, so they are outside
  // measurement rather than maximally inactive.
  if (untracked > 0) {
    lines.push(
      `${untracked} member(s) have no learner record, so no attendance can be recorded for them at all. They are reported as attendance-not-trackable and are never counted as quiet.`,
    );
  }

  // "The engine ran and found nothing" must not look like "the engine never
  // ran" — so say which one this is.
  if (runs === 0) {
    lines.push(
      'The daily dry-run has left no receipt this week, so these figures were worked out fresh when this summary was sent.',
    );
  }

  if (doc.engine_armed_anywhere) {
    lines.push(
      'Warning: the inactivity master switch is ON for at least one batch, but this build contains no action step — so nobody has been reminded, paused or removed regardless. Turn it back off, or ship the action step, so the setting and the behaviour agree.',
    );
  }

  lines.push(NOTHING_WAS_DONE);
  return lines.join(' ');
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest): Promise<NextResponse> {
  const startedAt = Date.now();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, job: JOB_NAME, error: 'CRON_SECRET not configured' },
      { status: 500 },
    );
  }
  const headerOk = request.headers.get('authorization') === `Bearer ${cronSecret}`;
  const queryOk = request.nextUrl.searchParams.get('secret') === cronSecret;
  if (!headerOk && !queryOk) {
    return NextResponse.json({ ok: false, job: JOB_NAME, error: 'Unauthorized' }, { status: 401 });
  }

  const ignoreWeekday = ['1', 'true', 'yes'].includes(
    (request.nextUrl.searchParams.get('ignore_weekday') ?? '').toLowerCase(),
  );

  try {
    const supabase = createServiceRoleClient() as any;

    const { data, error } = await supabase.rpc('fn_soi_weekly_quiet_digest', {
      p_as_of: null,
      p_ignore_weekday: ignoreWeekday,
    });

    if (error) {
      // Includes the deliberate abort the summary makes if it is ever handed an
      // actionable verdict for somebody whose attendance cannot be recorded.
      // The database writes these messages for a human, so the message is
      // passed through rather than replaced with a generic failure.
      logger.error('school-of-influence', 'weekly quiet summary refused by the database', error);
      return NextResponse.json(
        {
          ok: false,
          job: JOB_NAME,
          dry_run: true,
          actions_taken: 0,
          error: error.message ?? 'The weekly summary could not be worked out.',
        },
        { status: 500 },
      );
    }

    const doc = (data ?? {}) as DigestDocument;
    const weekStart = typeof doc.week_start === 'string' ? doc.week_start : null;

    if (doc.digest_enabled === false) {
      return NextResponse.json({
        ok: true,
        job: JOB_NAME,
        sent: 0,
        skipped: 0,
        reason: 'The weekly summary is switched off (soi.digest.enabled).',
        dry_run: true,
        actions_taken: 0,
        duration_ms: Date.now() - startedAt,
      });
    }

    if (doc.is_digest_day !== true) {
      return NextResponse.json({
        ok: true,
        job: JOB_NAME,
        sent: 0,
        skipped: 0,
        reason: `Not the configured day. The summary goes out on ${doc.weekday ?? 'monday'} (soi.digest.weekday).`,
        dry_run: true,
        actions_taken: 0,
        duration_ms: Date.now() - startedAt,
      });
    }

    if (!weekStart) {
      return NextResponse.json(
        {
          ok: false,
          job: JOB_NAME,
          error: 'The summary came back without a week, so it could not be delivered safely.',
        },
        { status: 500 },
      );
    }

    const allBatches = Array.isArray(doc.batches) ? doc.batches : [];
    const recipients = Array.isArray(doc.recipients) ? doc.recipients : [];

    const summary = {
      week_start: weekStart,
      state: doc.state ?? 'unknown',
      batches: allBatches.length,
      recipients_resolved: recipients.length,
      sent: 0,
      skipped_already_sent: 0,
      // Recipients who manage no School of Influence batch while batches exist.
      // Sending them "nothing to evaluate" would be untrue for them, not honest.
      skipped_no_batches_in_scope: 0,
      // Counted, never silent — see buildTargeting.
      skipped_unusable_recipient: 0,
      errors: [] as string[],
    };

    for (const r of recipients) {
      const built = buildTargeting(r.profile_id);
      if (!built) {
        summary.skipped_unusable_recipient += 1;
        summary.errors.push(
          `A recipient could not be targeted: their id is not a usable user id, so the message would have been written and never shown. Recipient name: ${r.full_name ?? 'unknown'}.`,
        );
        continue;
      }

      const scopedIds = new Set(Array.isArray(r.cohort_ids) ? r.cohort_ids : []);
      const scoped = allBatches.filter((b) => b.cohort_id && scopedIds.has(b.cohort_id));
      if (allBatches.length > 0 && scoped.length === 0) {
        summary.skipped_no_batches_in_scope += 1;
        continue;
      }

      const idempotencyKey = `soi_weekly_quiet_digest:${weekStart}:${built.userId}`;

      const { data: existing, error: existingErr } = await supabase
        .from('notifications')
        .select('id')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (existingErr) {
        summary.errors.push(`${built.userId}: idempotency check failed — ${existingErr.message}`);
        continue;
      }
      if (existing) {
        summary.skipped_already_sent += 1;
        continue;
      }

      const body = buildBody(doc, scoped);
      const firstBatch = scoped.find((b) => b.cohort_id);
      const url = firstBatch?.cohort_id
        ? `${LIFECYCLE_PATH}?batch=${firstBatch.cohort_id}${
            firstBatch.source_event_id ? `&event=${firstBatch.source_event_id}` : ''
          }`
        : LIFECYCLE_PATH;

      const { data: notification, error: notifErr } = await supabase
        .from('notifications')
        .insert({
          title: 'School of Influence — who has gone quiet this week',
          body,
          url,
          created_by: built.userId,
          targeting: built.targeting,
          priority: 'normal',
          category: 'school_of_influence',
          // work_item keeps a scheduled summary out of the announcement surface.
          kind: 'work_item',
          // An internal working summary, not a directive. Nobody is asked to tick.
          requires_acknowledgment: false,
          idempotency_key: idempotencyKey,
          metadata: {
            source: `cron:${JOB_NAME}`,
            week_start: weekStart,
            window_start: doc.window_start ?? null,
            state: doc.state ?? null,
            include_from: doc.include_from ?? null,
            batches: scoped.length,
            listed: scoped.reduce((n, b) => n + (b.listed_count ?? 0), 0),
            not_trackable: scoped.reduce((n, b) => n + (b.not_trackable ?? 0), 0),
            runs_recorded: scoped.reduce((n, b) => n + (b.runs_recorded ?? 0), 0),
            engine_armed_anywhere: doc.engine_armed_anywhere === true,
            dry_run: true,
            actions_taken: 0,
          },
        })
        .select('id')
        .single();

      if (notifErr || !notification) {
        summary.errors.push(`${built.userId}: ${notifErr?.message ?? 'insert failed'}`);
        continue;
      }

      // The bell reads `user_notifications !inner notifications` — the link row
      // is what actually surfaces the summary.
      const { error: linkErr } = await supabase
        .from('user_notifications')
        .insert({ notification_id: notification.id, user_id: built.userId });
      if (linkErr) {
        summary.errors.push(`${built.userId} link: ${linkErr.message}`);
        continue;
      }

      summary.sent += 1;
    }

    if (summary.errors.length > 0) {
      logger.warn('school-of-influence', 'weekly quiet summary finished with problems', summary);
    }

    return NextResponse.json({
      ok: true,
      job: JOB_NAME,
      ran_at: new Date().toISOString(),
      // Top-level numeric keys so the dispatcher's summarize() shows what this
      // run DID rather than a bare "HTTP 200".
      sent: summary.sent,
      skipped: summary.skipped_already_sent + summary.skipped_no_batches_in_scope,
      processed: summary.recipients_resolved,
      count: summary.batches,
      // Restated AFTER the payload deliberately: this handler has no action
      // path, so both are true regardless of what any flag or column says.
      dry_run: true,
      actions_taken: 0,
      note: 'A summary was sent. Nobody was reminded, paused or removed.',
      summary,
      duration_ms: Date.now() - startedAt,
    });
  } catch (err: any) {
    logger.error('school-of-influence', 'weekly quiet summary cron failed', err);
    return NextResponse.json(
      {
        ok: false,
        job: JOB_NAME,
        dry_run: true,
        actions_taken: 0,
        error: err?.message ?? 'Internal error',
      },
      { status: 500 },
    );
  }
}
