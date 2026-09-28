// =====================================================================
// Meetings follow-up routine — "record ready" cards + weekly digest
// =====================================================================
// WHY. When a meeting ends and its Fireflies note is linked, the ingest
// (app/api/meetings/notes/ingest) turns the note's follow-ups into
// meeting_action_items and stamps meeting_notes.action_items_applied_at —
// and nothing reaches the host. The follow-ups sit on the meeting page until
// somebody happens to open it.
//
// ONLY STAMPED NOTES ARE SEEN. Pass A selects on action_items_applied_at. On
// main that stamp is set only when the ingest's calendar matcher links the
// note itself; a note a person links by hand (fn_link_meeting_note) is never
// stamped, so it never gets a card. PR #4049 makes the hand-link path apply
// the follow-ups and stamp the note — hand-linked meetings get a card once it
// lands, and not before.
//
// WHAT THIS DOES (rules-based, no model):
//   Pass A — record ready. One bell card per note applied since the floor:
//     "Meeting record ready — <note title>" / "<N> open follow-ups to review
//     on this meeting" (+ ", and mark whether it happened" while the meeting
//     still reads 'confirmed'). N counts every open follow-up on the meeting,
//     not only this note's. Linked to the meeting page, where the follow-ups
//     (Mark as done / Mark as open) and the outcome buttons live. Idempotency
//     key meetings:record-ready:<note_id>.
//   Pass B — weekly digest. One card per host per ISO week (IST) when the host
//     has follow-ups open longer than the stale window: how many, across how
//     many meetings, the oldest age, and the three oldest meetings by name.
//     Key meetings:followups:<host>:<ISO-week>, so the daily wake sends it
//     once.
//
// THE FLOOR (Pass A only). Pass A never cards a note applied before this
// routine's own ai_routine_schedules.created_at, so the first run cannot card
// the notes that existed before the routine did. If that row is missing the
// route sends NOTHING (both passes) and reports floorMissing — a missing row
// means the migration was never applied, and guessing a floor would be a
// silent choice.
//
// PASS B HAS NO FLOOR. It reads every follow-up still open and older than the
// stale window, however old. The first enabled run therefore sends each host
// ONE digest card covering every old open follow-up at once (read 28 Sep: 61
// open follow-ups older than 7 days, all under one host, oldest from 15 Sep).
// One card per host, not one per item — a summary, not a flood.
//
// TUNABLES ARE CONFIG ROWS. Stale window, record-ready lookback and the two
// card lifetimes are platform_policies rows 'meetings.followup_routine.*'
// (seeded by the same migration as the schedule row), read on every run; the
// values in lib/services/meetings/meeting-followup-routine.ts are fallbacks
// only. A row holding an unusable value is named in policy_ignored.
//
// SWITCHED OFF. The schedule row ships enabled=false. The dispatcher only fires
// enabled rows, and this route also refuses to write while the row is disabled,
// so a hand-run cannot send cards before the Director switches it on. ?dry=1
// always works and writes nothing. A run that writes nothing reports
// would_card / would_digest; only a run that writes reports carded / digests.
//
// Runs via the AI-routine dispatcher (ai_routine_schedules row
// 'meetings-followup-routine', daily 18:47 IST) — NOT a raw vercel.json cron,
// which has a hard 100-entry cap.
//
// Auth: CRON_SECRET via `Authorization: Bearer <secret>` or `?secret=`, both
// compared in constant time.
// =====================================================================

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { fanoutNotification } from '@/lib/services/_shared/notifications/notify';
import {
  DIGEST_CATEGORY,
  POLICY_PREFIX,
  RECORD_READY_CATEGORY,
  buildHostDigests,
  digestBody,
  digestKey,
  digestTitle,
  effectiveFloor,
  readPolicies,
  recordReadyBody,
  recordReadyKey,
  recordReadyTitle,
  selectRecordReadyNotes,
  type AppliedNote,
  type OpenItem,
  type PolicyRow,
} from '@/lib/services/meetings/meeting-followup-routine';

const ROUTINE_ID = 'meetings-followup-routine';
const DAY_MS = 86_400_000;

function secretMatches(presented: string | null | undefined, secret: string): boolean {
  const a = Buffer.from(presented ?? '');
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function isAuthorized(request: NextRequest, secret: string): boolean {
  const authHeader = request.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (bearer !== null && secretMatches(bearer, secret)) return true;
  const querySecret = request.nextUrl.searchParams.get('secret');
  if (querySecret !== null && secretMatches(querySecret, secret)) return true;
  return false;
}

type Svc = ReturnType<typeof createServiceRoleClient>;

async function existingKeys(svc: Svc, keys: string[]): Promise<Set<string>> {
  if (keys.length === 0) return new Set();
  const { data, error } = await svc
    .from('notifications')
    .select('idempotency_key')
    .in('idempotency_key', keys);
  if (error) throw new Error(`notifications key read failed: ${error.message}`);
  return new Set(
    ((data ?? []) as Array<{ idempotency_key: string | null }>)
      .map((r) => r.idempotency_key)
      .filter((k): k is string => !!k),
  );
}

export async function GET(request: NextRequest) {
  const started = Date.now();
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET not configured' }, { status: 500 });
  }
  if (!isAuthorized(request, cronSecret)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const dry = request.nextUrl.searchParams.get('dry') === '1';
  const now = new Date();
  const svc = createServiceRoleClient();

  try {
    // ── the floor ──────────────────────────────────────────────────────────
    const { data: sched, error: schedErr } = await svc
      .from('ai_routine_schedules')
      .select('created_at, enabled')
      .eq('routine_id', ROUTINE_ID)
      .maybeSingle();
    if (schedErr) throw new Error(`schedule read failed: ${schedErr.message}`);

    const schedRow = sched as { created_at: string; enabled: boolean } | null;
    if (!schedRow?.created_at) {
      // Nothing was looked at, so there is no would-send count to report either.
      return NextResponse.json({
        ok: true,
        floorMissing: true,
        wrote: false,
        examined: 0,
        floor: null,
        reason: `No ai_routine_schedules row '${ROUTINE_ID}' — nothing sent.`,
        elapsed_ms: Date.now() - started,
      });
    }

    // Disabled row: report what would happen, write nothing.
    const writes = !dry && schedRow.enabled === true;

    // ── the tunables (platform_policies rows) ──────────────────────────────
    const { data: policyRows, error: pErr } = await svc
      .from('platform_policies')
      .select('policy_key, value, is_active')
      .eq('scope_type', 'global')
      .like('policy_key', `${POLICY_PREFIX}%`);
    if (pErr) throw new Error(`platform_policies read failed: ${pErr.message}`);
    const { policies, ignored: policyIgnored } = readPolicies((policyRows ?? []) as PolicyRow[]);

    const floor = effectiveFloor(schedRow.created_at, now, policies.recordReadyLookbackDays);

    // ── Pass A: record ready ───────────────────────────────────────────────
    const { data: noteRows, error: notesErr } = await svc
      .from('meeting_notes')
      .select('id, booking_id, title, action_items_applied_at')
      .not('booking_id', 'is', null)
      .gte('action_items_applied_at', floor)
      .order('action_items_applied_at', { ascending: true })
      .limit(500);
    if (notesErr) throw new Error(`meeting_notes read failed: ${notesErr.message}`);

    const notes = selectRecordReadyNotes((noteRows ?? []) as AppliedNote[], floor);
    const bookingIds = [...new Set(notes.map((n) => n.booking_id as string))];

    const bookingById = new Map<
      string,
      { uid: string; host_profile_id: string; status: string | null }
    >();
    const openByBooking = new Map<string, number>();

    if (bookingIds.length > 0) {
      const { data: bookings, error: bErr } = await svc
        .from('meeting_bookings')
        .select('id, uid, host_profile_id, status, start_time')
        .in('id', bookingIds);
      if (bErr) throw new Error(`meeting_bookings read failed: ${bErr.message}`);
      for (const b of (bookings ?? []) as Array<{
        id: string;
        uid: string;
        host_profile_id: string;
        status: string | null;
      }>) {
        bookingById.set(b.id, { uid: b.uid, host_profile_id: b.host_profile_id, status: b.status });
      }

      const { data: open, error: oErr } = await svc
        .from('meeting_action_items')
        .select('booking_id')
        .eq('status', 'open')
        .in('booking_id', bookingIds);
      if (oErr) throw new Error(`meeting_action_items read failed: ${oErr.message}`);
      for (const r of (open ?? []) as Array<{ booking_id: string }>) {
        openByBooking.set(r.booking_id, (openByBooking.get(r.booking_id) ?? 0) + 1);
      }
    }

    const seenA = await existingKeys(svc, notes.map((n) => recordReadyKey(n.id)));
    let cardCount = 0;
    let duplicate = 0;
    let skippedNoHost = 0;
    const recordReadyExpires = new Date(
      now.getTime() + policies.recordReadyExpiryDays * DAY_MS,
    ).toISOString();

    for (const note of notes) {
      const booking = bookingById.get(note.booking_id as string);
      if (!booking?.host_profile_id) {
        // The note points at a booking that is gone, or one with no host:
        // there is nobody to tell. Counted, never dropped silently.
        skippedNoHost += 1;
        continue;
      }
      const key = recordReadyKey(note.id);
      if (seenA.has(key)) {
        duplicate += 1;
        continue;
      }
      if (!writes) {
        cardCount += 1;
        continue;
      }
      const res = await fanoutNotification(svc, {
        title: recordReadyTitle(note.title),
        body: recordReadyBody(openByBooking.get(note.booking_id as string) ?? 0, booking.status),
        userIds: [booking.host_profile_id],
        category: RECORD_READY_CATEGORY,
        kind: 'announcement',
        priority: 'normal',
        idempotencyKey: key,
        url: `/meetings/${booking.uid}`,
        source: ROUTINE_ID,
        metadata: { note_id: note.id, booking_id: note.booking_id },
        extraColumns: { expires_at: recordReadyExpires },
      });
      if (res.skipped === 'idempotent') duplicate += 1;
      else if (res.notified > 0) cardCount += 1;
    }

    // ── Pass B: weekly digest (NOT bounded by the floor — see header) ──────
    const staleCutoff = new Date(now.getTime() - policies.staleDays * DAY_MS).toISOString();
    const { data: items, error: iErr } = await svc
      .from('meeting_action_items')
      .select('host_profile_id, booking_id, created_at')
      .eq('status', 'open')
      .lt('created_at', staleCutoff)
      .limit(5000);
    if (iErr) throw new Error(`stale follow-ups read failed: ${iErr.message}`);

    const hostDigests = buildHostDigests((items ?? []) as OpenItem[], now, policies.staleDays);
    const labelIds = [...new Set(hostDigests.flatMap((d) => d.oldestBookingIds))];
    const labelById = new Map<string, { uid: string; title: string }>();

    if (labelIds.length > 0) {
      const { data: lb, error: lbErr } = await svc
        .from('meeting_bookings')
        .select('id, uid, attendee_name')
        .in('id', labelIds);
      if (lbErr) throw new Error(`meeting labels read failed: ${lbErr.message}`);
      const { data: ln, error: lnErr } = await svc
        .from('meeting_notes')
        .select('booking_id, title')
        .in('booking_id', labelIds);
      if (lnErr) throw new Error(`meeting note titles read failed: ${lnErr.message}`);
      const noteTitle = new Map<string, string>();
      for (const n of (ln ?? []) as Array<{ booking_id: string; title: string | null }>) {
        if (n.title?.trim() && !noteTitle.has(n.booking_id)) noteTitle.set(n.booking_id, n.title.trim());
      }
      for (const b of (lb ?? []) as Array<{ id: string; uid: string; attendee_name: string | null }>) {
        labelById.set(b.id, {
          uid: b.uid,
          title: noteTitle.get(b.id) ?? `Meeting with ${b.attendee_name?.trim() || 'a guest'}`,
        });
      }
    }

    const seenB = await existingKeys(svc, hostDigests.map((d) => digestKey(d.hostId, now)));
    let digestCount = 0;
    const digestExpires = new Date(now.getTime() + policies.digestExpiryDays * DAY_MS).toISOString();

    for (const d of hostDigests) {
      const key = digestKey(d.hostId, now);
      if (seenB.has(key)) {
        duplicate += 1;
        continue;
      }
      if (!writes) {
        digestCount += 1;
        continue;
      }
      const oldest = labelById.get(d.oldestBookingIds[0]);
      const res = await fanoutNotification(svc, {
        title: digestTitle(d),
        body: digestBody(
          d.oldestBookingIds.map((id) => labelById.get(id)?.title).filter((t): t is string => !!t),
        ),
        userIds: [d.hostId],
        category: DIGEST_CATEGORY,
        kind: 'announcement',
        priority: 'normal',
        idempotencyKey: key,
        url: oldest ? `/meetings/${oldest.uid}` : '/meetings/my-bookings',
        source: ROUTINE_ID,
        metadata: { item_count: d.itemCount, meeting_count: d.meetingCount },
        extraColumns: { expires_at: digestExpires },
      });
      if (res.skipped === 'idempotent') duplicate += 1;
      else if (res.notified > 0) digestCount += 1;
    }

    // A run that wrote nothing reports what it WOULD have sent under different
    // names, so a status line or summary that reads `carded` alone can never
    // mistake a dry or switched-off run for delivered cards.
    const sendCounts = writes
      ? { carded: cardCount, digests: digestCount }
      : { would_card: cardCount, would_digest: digestCount };

    return NextResponse.json({
      ok: true,
      dry,
      enabled: schedRow.enabled,
      wrote: writes,
      examined: notes.length,
      ...sendCounts,
      duplicate,
      skipped_no_host: skippedNoHost,
      floor,
      policies,
      ...(policyIgnored.length > 0 ? { policy_ignored: policyIgnored } : {}),
      elapsed_ms: Date.now() - started,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err), elapsed_ms: Date.now() - started },
      { status: 500 },
    );
  }
}
