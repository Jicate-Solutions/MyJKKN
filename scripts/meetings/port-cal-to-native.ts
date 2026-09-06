/**
 * port-cal-to-native.ts — Phase N2 data port
 * ------------------------------------------
 * Copies the scheduling universe from the Cal.com self-host DB (jicate-booking
 * Supabase, CAL_BOOKING_DB_URL) into the native engine tables in MyJKKN's own
 * Supabase (migration 20260611190000):
 *
 *   Cal Schedule + Availability  → meeting_host_schedules + meeting_schedule_windows
 *   Cal EventType                → meeting_types
 *   jicate_booking_mirror        → meeting_bookings   (already MyJKKN-shaped,
 *                                  host_user_id resolved by the F4 webhook)
 *
 * Identity: cal users.id ↔ profiles.cal_user_id (set by Path W provisioning).
 * Day convention verified identical (0=Sunday…6=Saturday) by decoding the
 * director's known schedule live (Mon windows = {1}).
 *
 * Default schedule: users."defaultScheduleId" when set; else the host's first
 * schedule (Cal's own fallback for the counselor accounts).
 *
 * Status map (mirror → native CHECK): pending/rescheduled → confirmed.
 *
 * Idempotent: schedules matched by (host, name); event types by (host, slug);
 * bookings by uid. Safe to rerun.
 *
 * USAGE (from a checkout with node_modules):
 *   NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… CAL_BOOKING_DB_URL=… \
 *     npx tsx scripts/meetings/port-cal-to-native.ts [--dry-run]
 */

import { Client as PgClient } from 'pg';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`Missing env ${name}`); process.exit(2); }
  return v;
}
const SUPABASE_URL = requireEnv('NEXT_PUBLIC_SUPABASE_URL').replace(/\/$/, '');
const SERVICE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const CAL_DB_URL = requireEnv('CAL_BOOKING_DB_URL');
const DRY = process.argv.includes('--dry-run');

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status}: ${body.slice(0, 250)}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/** 'HH:MM:SS' → minutes since midnight. */
const toMinutes = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

async function main() {
  const pg = new PgClient({ connectionString: CAL_DB_URL });
  await pg.connect();

  // ── identity map: cal user id → profile id ────────────────────────────────
  const profiles = await rest<Array<{ id: string; cal_user_id: number }>>(
    '/rest/v1/profiles?select=id,cal_user_id&cal_user_id=not.is.null',
  );
  const profileByCalId = new Map(profiles.map((p) => [p.cal_user_id, p.id]));
  console.log(`identity map: ${profileByCalId.size} cal users ↔ profiles`);

  // institution per host (for counselors)
  const counselors = await rest<Array<{ user_id: string; institution_id: string }>>(
    '/rest/v1/admission_counselors?select=user_id,institution_id&is_active=eq.true',
  );
  const institutionByProfile = new Map(counselors.map((c) => [c.user_id, c.institution_id]));

  // ── 1. schedules + windows ────────────────────────────────────────────────
  const calSchedules = await pg.query(
    `SELECT s.id, s."userId", s.name, s."timeZone", u."defaultScheduleId"
       FROM "Schedule" s JOIN users u ON u.id = s."userId" ORDER BY s.id`,
  );
  const calAvail = await pg.query(
    `SELECT "scheduleId", days, "startTime"::text AS st, "endTime"::text AS et FROM "Availability"`,
  );
  const availBySchedule = new Map<number, Array<{ days: number[]; st: string; et: string }>>();
  for (const a of calAvail.rows) {
    const list = availBySchedule.get(a.scheduleId) ?? [];
    list.push(a);
    availBySchedule.set(a.scheduleId, list);
  }

  // first-schedule fallback for hosts without defaultScheduleId
  const firstScheduleByUser = new Map<number, number>();
  for (const s of calSchedules.rows) {
    if (!firstScheduleByUser.has(s.userId)) firstScheduleByUser.set(s.userId, s.id);
  }

  const existingScheds = await rest<Array<{ id: string; host_profile_id: string; name: string }>>(
    '/rest/v1/meeting_host_schedules?select=id,host_profile_id,name',
  );
  const schedKey = (host: string, name: string) => `${host}::${name}`;
  const nativeSchedByKey = new Map(existingScheds.map((s) => [schedKey(s.host_profile_id, s.name), s.id]));
  /** cal schedule id → native schedule id */
  const schedMap = new Map<number, string>();

  let sNew = 0, sSkip = 0, sNoProfile = 0;
  for (const s of calSchedules.rows) {
    const host = profileByCalId.get(s.userId);
    if (!host) { sNoProfile++; continue; }
    const key = schedKey(host, s.name);
    const isDefault = s.defaultScheduleId
      ? s.defaultScheduleId === s.id
      : firstScheduleByUser.get(s.userId) === s.id;

    let nativeId = nativeSchedByKey.get(key);
    if (nativeId) { schedMap.set(s.id, nativeId); sSkip++; continue; }
    if (DRY) { console.log(`would create schedule: ${s.name} (host ${host})${isDefault ? ' [default]' : ''}`); sNew++; continue; }

    const created = await rest<Array<{ id: string }>>('/rest/v1/meeting_host_schedules', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        host_profile_id: host,
        institution_id: institutionByProfile.get(host) ?? null,
        name: s.name,
        timezone: s.timeZone || 'Asia/Kolkata',
        is_default: isDefault,
      }),
    });
    nativeId = created[0].id;
    nativeSchedByKey.set(key, nativeId);
    schedMap.set(s.id, nativeId);
    sNew++;

    const windows = (availBySchedule.get(s.id) ?? []).flatMap((a) =>
      (a.days ?? []).map((weekday: number) => ({
        schedule_id: nativeId,
        weekday,
        start_minute: toMinutes(a.st),
        end_minute: toMinutes(a.et),
      })),
    );
    if (windows.length) {
      await rest('/rest/v1/meeting_schedule_windows', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify(windows),
      });
    }
  }
  console.log(`schedules: created=${sNew} existing=${sSkip} unmapped-user=${sNoProfile}`);

  // ── 2. event types ────────────────────────────────────────────────────────
  const calEts = await pg.query(
    `SELECT id, "userId", title, slug, length, hidden, "scheduleId", description
       FROM "EventType" ORDER BY id`,
  );
  const existingTypes = await rest<Array<{ id: string; host_profile_id: string; slug: string }>>(
    '/rest/v1/meeting_types?select=id,host_profile_id,slug',
  );
  const typeKey = (host: string, slug: string) => `${host}::${slug}`;
  const nativeTypeByKey = new Map(existingTypes.map((t) => [typeKey(t.host_profile_id, t.slug), t.id]));
  /** cal event type id → native meeting type id (for booking linkage) */
  const typeMap = new Map<number, string>();

  let tNew = 0, tSkip = 0, tNoProfile = 0;
  for (const et of calEts.rows) {
    const host = profileByCalId.get(et.userId);
    if (!host) { tNoProfile++; continue; }
    const key = typeKey(host, et.slug);
    const existingId = nativeTypeByKey.get(key);
    if (existingId) { typeMap.set(et.id, existingId); tSkip++; continue; }
    if (DRY) { tNew++; continue; }

    const created = await rest<Array<{ id: string }>>('/rest/v1/meeting_types', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        host_profile_id: host,
        institution_id: institutionByProfile.get(host) ?? null,
        title: et.title,
        slug: et.slug,
        description: et.description ?? null,
        duration_min: et.length,
        schedule_id: et.scheduleId ? schedMap.get(et.scheduleId) ?? null : null,
        hidden: !!et.hidden,
        is_active: true,
      }),
    });
    nativeTypeByKey.set(key, created[0].id);
    typeMap.set(et.id, created[0].id);
    tNew++;
  }
  console.log(`event types: created=${tNew} existing=${tSkip} unmapped-user=${tNoProfile}`);

  // ── 3. bookings (from the mirror — already MyJKKN-shaped) ────────────────
  const mirror = await rest<Array<Record<string, unknown>>>(
    '/rest/v1/jicate_booking_mirror?select=cal_booking_uid,cal_event_type_id,host_user_id,attendee_name,attendee_email,attendee_phone,start_time,end_time,status,cancellation_reason,created_at&order=start_time.asc',
  );
  const existingBookings = await rest<Array<{ uid: string }>>(
    '/rest/v1/meeting_bookings?select=uid',
  );
  const haveUid = new Set(existingBookings.map((b) => b.uid));

  const STATUS_MAP: Record<string, string> = {
    confirmed: 'confirmed', pending: 'confirmed', rescheduled: 'confirmed',
    completed: 'completed', no_show: 'no_show', cancelled: 'cancelled',
  };

  let bNew = 0, bSkip = 0, bFail = 0;
  for (const m of mirror) {
    const uid = m.cal_booking_uid as string;
    if (!uid || haveUid.has(uid)) { bSkip++; continue; }
    if (!m.host_user_id) { bFail++; console.warn(`  unresolved host on ${uid} — skipped`); continue; }
    if (DRY) { bNew++; continue; }
    try {
      await rest('/rest/v1/meeting_bookings', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          uid,
          meeting_type_id: m.cal_event_type_id ? typeMap.get(m.cal_event_type_id as number) ?? null : null,
          host_profile_id: m.host_user_id,
          attendee_name: m.attendee_name ?? '(unknown)',
          attendee_email: m.attendee_email ?? 'unknown@jkkn.ai',
          attendee_phone: m.attendee_phone ?? null,
          start_time: m.start_time,
          end_time: m.end_time,
          status: STATUS_MAP[m.status as string] ?? 'confirmed',
          cancellation_reason: m.cancellation_reason ?? null,
          source: 'ported-from-cal',
        }),
      });
      bNew++;
    } catch (e) {
      bFail++;
      console.warn(`  booking ${uid} failed: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`bookings: ported=${bNew} existing=${bSkip} failed=${bFail}`);

  await pg.end();
}

main().catch((e) => { console.error('Fatal:', e); process.exit(1); });
