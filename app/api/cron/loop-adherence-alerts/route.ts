// =============================================================================
// LOOP ADHERENCE ALERTS — a loop that runs but is not WORKED is not a loop
// =============================================================================
// Daily (dispatcher row 'loop-adherence', 09:41 IST): two sweeps over induction
// loop plumbing that generates work but has no escalation when the humans stop
// doing it. One notification if anything is lapsed, silence when healthy.
// Companion to /api/cron/loop-watchdog: the watchdog watches the ROUTINES (did
// the cron fire); this watches the PEOPLE the routines hand work to (did the
// mentor check in, did the desk work the lead).
//
//   SWEEP A — MISSED MENTOR CHECK-INS. The induction system generates monthly
//     mentor check-in "beats" (event_sessions kind='mentor_checkin', one shared
//     row per month per event, made by fn_induction_generate_monthly_checkins).
//     A mentor's proof of doing the check-in is an event_session_attendance row
//     they marked (marked_by = their auth uid; identity resolves auth uid →
//     profiles.learner_id → induction_feedback_volunteers.learner_id, the exact
//     join fn_induction_mentor_helpfulness_crosscheck uses). MISSED = a past
//     beat with no attendance marked by that mentor. Threshold (craft): a mentor
//     is surfaced only when their MOST RECENT past beat is unmarked (currently
//     lapsed, not recovered) AND they have >= 2 consecutive most-recent missed
//     beats — one miss is life, two is a pattern. Population: active + trained +
//     not-ended mentors only. Untrained mentors CANNOT mark attendance
//     (fn_induction_volunteer_mark_attendance gates on is_trained), so flagging
//     them would blame an org training gap, not mentor adherence — a different
//     problem, a different wire. (Today all 19 active mentors are trained, so
//     this guard narrows nothing; it protects the future.) Correctly DARK until
//     the first beat comes due 2026-08-15 — a cadence loop with no past beat has
//     nothing to be lapsed on, and that is honest, not broken.
//
//   SWEEP B — QUIET REFERRAL DESK. Induction referrals land in admission_leads
//     (source='referral') assigned to a "desk" via assigned_counselor_id (the
//     profiles lane — NOT counselor_id, which FKs admission_counselors). The
//     referral-desk owner is a config row (platform_policies
//     'admission.referral_desk.owner_id'); this sweep does not hardcode it —
//     it watches EVERY assigned_counselor_id that owns open referral leads, so
//     it catches the configured desk AND any historically-assigned owner sitting
//     on unworked referrals. QUIET = a desk with >= 1 OPEN referral lead
//     (funnel_stage not resolved) whose most recent activity across those leads
//     is older than 7 days. Activity = last_activity_at (96% filled on referral
//     leads) coalesced to updated_at → created_at for the ~4% NULLs (a NULL that
//     defaulted to "now" would silently hide a genuinely dead desk). The nearest
//     existing wire alerts the counselor lane and MISSES this desk lane entirely.
//
// Cadence: DAILY UNTIL FIXED (Director-ratified 2026-07-13). The idempotency key
// folds the day + a fingerprint of the finding SET, so a re-run over the same
// lapses dedups, but the same desk STILL pages again tomorrow while it stays
// quiet, and a newly-lapsed mentor the same day pages immediately.
//
// Auth: CRON_SECRET Bearer only — the dispatcher and the AI Routines manual
// trigger both send the header; secrets never sit in URLs.
// Created: 2026-07-13 (Director interview: "build both and activate").

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';
import { findingsFingerprint, staleThresholdMs } from '@/lib/ai-routines/loop-governance';

// 2026-08-09 expiry — see the fanout below. Derived, not literal: this routine's
// schedule lives in ai_routine_schedules and is editable on /admin/ai-routines
// with no deploy, so a hardcoded 36h would silently invert the safety margin the
// moment someone slowed the cadence down.
// 1.5x absorbs a LATE run (up to half a cycle of slip still overlaps the
// previous row). It does NOT cover a fully skipped cycle: emissions would then
// be 2 cycles apart while the surviving row dies at 1.5, leaving a half-cycle
// window with no live row. Accepted — the cost is a bounded under-count of the
// bell on a day the routine did not run at all, and the findings themselves
// live on /admin/ai-routines, not in the notification.
// NB (corrected 2026-08-10): this does NOT "cap the stack at 2" for THIS
// routine. That reasoning holds only for purely per-day keys (digest, hr_brief,
// accreditation). Here the idempotency key is
// `loop-adherence:<istDay>:<findingsFingerprint>`, so N distinct finding-sets in
// one day produce N independently-expiring rows. The TTL bounds each row's
// lifetime, not the count per day.
const TTL_CYCLE_MULTIPLIER = 1.5;
const OWN_ROUTINE_ID = 'loop-adherence';

// SWEEP A: >= 2 consecutive most-recent missed beats = a pattern worth paging.
const MENTOR_LAPSE_ALARM = 2;
// SWEEP B: a desk with an open lead and no activity for this many days is quiet.
const DESK_QUIET_DAYS = 7;
const DESK_QUIET_MS = DESK_QUIET_DAYS * 24 * 3600_000;
// Referral funnel stages where the lead is RESOLVED (won or dead) — the desk
// owes it nothing further, so an old timestamp on it is not "quiet", it's done.
// Denylist (not an allowlist): an unrecognised/new stage counts as OPEN, so the
// wire fails toward surfacing an unworked lead rather than silently hiding it.
const CLOSED_STAGES = new Set([
  'lost', 'declined', 'withdrew', 'expired',
  'confirmed', 'token_paid', 'applied', 'application_submitted',
]);

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const nowMs = Date.now();
  const findings: string[] = [];
  let mentorsLapsed = 0;
  let quietDesks = 0;

  // ── SWEEP A: missed mentor check-ins ───────────────────────────────────────
  const { data: beats, error: beatsErr } = await admin
    .from('event_sessions')
    .select('id, event_id, start_at')
    .eq('kind', 'mentor_checkin')
    .lte('start_at', new Date(nowMs).toISOString())
    .order('start_at', { ascending: true });
  if (beatsErr) {
    return NextResponse.json({ ok: false, error: `beats: ${beatsErr.message}` }, { status: 500 });
  }

  type Beat = { id: string; event_id: string; start_at: string };
  const pastBeats = (beats ?? []) as Beat[];
  if (pastBeats.length > 0) {
    const beatIds = pastBeats.map((b) => b.id);
    const eventIds = Array.from(new Set(pastBeats.map((b) => b.event_id)));

    const { data: mentorsRaw, error: mentorsErr } = await admin
      .from('induction_feedback_volunteers')
      .select('id, learner_id, event_id')
      .in('event_id', eventIds)
      .eq('is_active', true)
      .eq('is_trained', true)
      .is('ended_at', null);
    if (mentorsErr) {
      return NextResponse.json({ ok: false, error: `mentors: ${mentorsErr.message}` }, { status: 500 });
    }
    type Mentor = { id: string; learner_id: string; event_id: string };
    const mentors = ((mentorsRaw ?? []) as Mentor[]).filter((m) => m.learner_id);

    const { data: attnRaw, error: attnErr } = await admin
      .from('event_session_attendance')
      .select('session_id, marked_by')
      .in('session_id', beatIds);
    if (attnErr) {
      return NextResponse.json({ ok: false, error: `attendance: ${attnErr.message}` }, { status: 500 });
    }
    type Attn = { session_id: string; marked_by: string | null };
    const attn = (attnRaw ?? []) as Attn[];

    // marked_by (auth uid) → profiles.learner_id — the mentor-identity resolution
    // fn_induction_mentor_helpfulness_crosscheck uses. Without it, a mentor's
    // check-in proof cannot be attributed and every mentor reads as lapsed.
    const markerIds = Array.from(new Set(attn.map((a) => a.marked_by).filter(Boolean))) as string[];
    const markerLearner = new Map<string, string>();
    if (markerIds.length > 0) {
      const { data: mp, error: mpErr } = await admin
        .from('profiles')
        .select('id, learner_id')
        .in('id', markerIds);
      if (mpErr) {
        return NextResponse.json({ ok: false, error: `marker-profiles: ${mpErr.message}` }, { status: 500 });
      }
      for (const p of (mp ?? []) as { id: string; learner_id: string | null }[]) {
        if (p.learner_id) markerLearner.set(p.id, p.learner_id);
      }
    }

    // session_id → set of mentor learner_ids that checked in on that beat.
    const checkedBySession = new Map<string, Set<string>>();
    for (const a of attn) {
      const lid = a.marked_by ? markerLearner.get(a.marked_by) : undefined;
      if (!lid) continue;
      let set = checkedBySession.get(a.session_id);
      if (!set) { set = new Set(); checkedBySession.set(a.session_id, set); }
      set.add(lid);
    }

    // Past beats per event, NEWEST FIRST, for the leading-consecutive walk.
    const beatsByEvent = new Map<string, Beat[]>();
    for (const b of pastBeats) {
      let arr = beatsByEvent.get(b.event_id);
      if (!arr) { arr = []; beatsByEvent.set(b.event_id, arr); }
      arr.push(b);
    }
    for (const arr of beatsByEvent.values()) {
      arr.sort((x, y) => y.start_at.localeCompare(x.start_at));
    }

    // Mentor display names.
    const mentorLearnerIds = Array.from(new Set(mentors.map((m) => m.learner_id)));
    const mentorName = new Map<string, string>();
    if (mentorLearnerIds.length > 0) {
      const { data: lp } = await admin
        .from('learners_profiles')
        .select('id, first_name, last_name')
        .in('id', mentorLearnerIds);
      for (const r of (lp ?? []) as { id: string; first_name: string | null; last_name: string | null }[]) {
        const nm = [r.first_name, r.last_name].filter(Boolean).join(' ').trim();
        mentorName.set(r.id, nm || r.id);
      }
    }

    for (const m of mentors) {
      const eventBeats = beatsByEvent.get(m.event_id) ?? []; // newest first
      if (eventBeats.length === 0) continue;
      // Count leading (most-recent-first) beats this mentor did NOT check in on.
      // A single checked-in beat ends the streak — a recovered mentor is not lapsed.
      let consecutive = 0;
      for (const b of eventBeats) {
        if (checkedBySession.get(b.id)?.has(m.learner_id)) break;
        consecutive++;
      }
      if (consecutive >= MENTOR_LAPSE_ALARM) {
        mentorsLapsed++;
        const name = mentorName.get(m.learner_id) ?? m.learner_id;
        findings.push(
          `MENTOR LAPSED: ${name} — ${consecutive} consecutive missed check-in beats (latest ${eventBeats[0].start_at.slice(0, 10)})`
        );
      }
    }
  }

  // ── SWEEP B: quiet referral desks ──────────────────────────────────────────
  const { data: leadsRaw, error: leadsErr } = await admin
    .from('admission_leads')
    .select('assigned_counselor_id, funnel_stage, last_activity_at, updated_at, created_at')
    .eq('source', 'referral')
    .not('assigned_counselor_id', 'is', null);
  if (leadsErr) {
    return NextResponse.json({ ok: false, error: `leads: ${leadsErr.message}` }, { status: 500 });
  }
  type Lead = {
    assigned_counselor_id: string;
    funnel_stage: string;
    last_activity_at: string | null;
    updated_at: string | null;
    created_at: string | null;
  };
  type DeskAgg = { open: number; lastActMs: number };
  const desks = new Map<string, DeskAgg>();
  for (const l of (leadsRaw ?? []) as Lead[]) {
    if (CLOSED_STAGES.has(l.funnel_stage)) continue;
    const actIso = l.last_activity_at ?? l.updated_at ?? l.created_at;
    const actMs = actIso ? new Date(actIso).getTime() : 0;
    let cur = desks.get(l.assigned_counselor_id);
    if (!cur) { cur = { open: 0, lastActMs: 0 }; desks.set(l.assigned_counselor_id, cur); }
    cur.open += 1;
    cur.lastActMs = Math.max(cur.lastActMs, actMs);
  }

  const quiet: { id: string; agg: DeskAgg }[] = [];
  for (const [id, agg] of desks) {
    if (agg.open >= 1 && nowMs - agg.lastActMs > DESK_QUIET_MS) {
      quiet.push({ id, agg });
    }
  }
  if (quiet.length > 0) {
    // Quietest desk first — most severe at the top of the (truncated) body.
    quiet.sort((a, b) => a.agg.lastActMs - b.agg.lastActMs);
    const { data: owners } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', quiet.map((q) => q.id));
    const ownerLabel = new Map<string, string>();
    for (const o of (owners ?? []) as { id: string; full_name: string | null; email: string | null }[]) {
      ownerLabel.set(o.id, o.full_name || o.email || o.id);
    }
    for (const { id, agg } of quiet) {
      quietDesks++;
      const days = Math.floor((nowMs - agg.lastActMs) / 86_400_000);
      const label = ownerLabel.get(id) ?? id;
      findings.push(
        `QUIET DESK: ${label} — ${agg.open} open referral lead${agg.open === 1 ? '' : 's'}, no activity for ${days}d`
      );
    }
  }

  // ── Notify (or stay silent) ────────────────────────────────────────────────
  let notified = 0;
  if (findings.length > 0) {
    // The audience lookup failing must FAIL the run, not silently fan out to
    // nobody (loop-watchdog r4 lesson): a 500 here lands in last_status via the
    // dispatcher, which the watchdog alarms on — the wire is watched in turn.
    const { data: supers, error: supersErr } = await admin
      .from('profiles')
      .select('id')
      .eq('is_super_admin', true);
    if (supersErr || !supers?.length) {
      return NextResponse.json(
        { ok: false, error: `super-admin lookup failed: ${supersErr?.message ?? 'no recipients'}`, findings },
        { status: 500 }
      );
    }
    const userIds = supers.map((s: { id: string }) => s.id);
    const istDay = new Date(nowMs + 19_800_000).toISOString().slice(0, 10);
    // Own cadence for the TTL below. Only queried on the paging path, so the
    // silent (healthy) run costs nothing extra. A missing row or a failed read
    // leaves days_of_week undefined, which staleThresholdMs treats as daily —
    // the same 25h it assumes elsewhere, so the fallback matches today's
    // behaviour rather than inventing one.
    const { data: ownSched } = await admin
      .from('ai_routine_schedules')
      .select('days_of_week')
      .eq('routine_id', OWN_ROUTINE_ID)
      .maybeSingle();
    const ownDays = (ownSched as { days_of_week: number[] | null } | null)?.days_of_week;
    const expiresMs = Math.round(staleThresholdMs(ownDays) * TTL_CYCLE_MULTIPLIER);
    const outcome = await fanoutNotification(admin, {
      title: `🔴 Loop adherence: ${findings.length} issue${findings.length === 1 ? '' : 's'} (${mentorsLapsed} mentor${mentorsLapsed === 1 ? '' : 's'} lapsed, ${quietDesks} quiet desk${quietDesks === 1 ? '' : 's'})`,
      body:
        findings.slice(0, 12).join(' · ') +
        (findings.length > 12 ? ` · …and ${findings.length - 12} more (see /admin/loops)` : ''),
      userIds,
      priority: 'high',
      category: 'loops',
      url: '/admin/loops',
      // Day + finding-set fingerprint: re-runs over the same lapses dedup, but a
      // still-quiet desk pages again tomorrow (new istDay) and a distinct new
      // lapse the same day pages immediately (different fingerprint).
      idempotencyKey: `loop-adherence:${istDay}:${findingsFingerprint(findings)}`,
      source: 'loop-adherence-cron',
      // 2026-08-09: this is a restatement of the current lapse set — a
      // still-quiet desk pages again next cycle under a new istDay. Without an
      // expiry every edition stayed unread forever (25 of the Director's 680).
      // TTL = own cadence x 1.5, read from this routine's dispatcher row rather
      // than hardcoded (today: daily -> 25h x 1.5 = 37.5h). That absorbs a LATE
      // run; it does NOT cover a fully skipped cycle, and it does NOT cap the
      // stack at 2 here — the key embeds a findings fingerprint, so N distinct
      // finding-sets in a day yield N rows (see TTL_CYCLE_MULTIPLIER above)
      // (see TTL_CYCLE_MULTIPLIER above). The point of deriving it is that the
      // margin follows a cadence edit made on /admin/ai-routines with no deploy.
      // Honoured by liveNotificationOrFilter() in the bell/inbox read path;
      // admin/manage/stats reads deliberately still show lapsed rows.
      extraColumns: {
        expires_at: new Date(nowMs + expiresMs).toISOString(),
      },
    });
    notified = outcome.notified;
  }

  return NextResponse.json({
    ok: true,
    mentors_lapsed: mentorsLapsed,
    quiet_desks: quietDesks,
    findings,
    notified,
  });
}
