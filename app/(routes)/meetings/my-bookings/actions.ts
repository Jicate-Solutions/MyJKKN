'use server';

// app/(routes)/meetings/my-bookings/actions.ts
//
// The read behind /meetings/my-bookings.
//
// Auth model is the same two-step the rest of this module uses (see
// [uid]/actions.ts): resolve the signed-in user with the SESSION client, then
// read through the service-role client with a predicate pinned to that
// server-resolved id. The session client cannot do this read on its own —
// mb_host_select is host-only, so a meeting you are merely attending returns
// zero rows no matter how it is queried.
//
// Signed out is a RESULT, never a redirect (rule #27): the page renders an
// explicit notice. Bouncing to /dashboard would give a loop nobody can
// diagnose from the outside.

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import {
  buildParticipantOr,
  resolveFilter,
  viewerRole,
  type ViewerRole,
} from '@/lib/services/meetings/my-bookings-query';

export interface MyBookingRow {
  id: string;
  uid: string;
  status: string;
  start_time: string;
  end_time: string;
  attendee_name: string | null;
  attendee_email: string | null;
  video_url: string | null;
  /** Whether the viewer is hosting this meeting or attending it. */
  role: ViewerRole;
  /** Meeting type title, when the type still exists. */
  typeTitle: string | null;
  /** Host display name — what an attendee needs; null on rows you host. */
  hostName: string | null;
  hostEmail: string | null;
}

export interface MyBookingsSuccess {
  ok: true;
  rows: MyBookingRow[];
}

export interface MyBookingsFailure {
  ok: false;
  reason: 'signed-out' | 'error';
  message: string;
}

// tsconfig has strictNullChecks:false, which switches OFF discriminated-union
// narrowing: inside `if (!result.ok)` TypeScript still sees the success arm and
// rejects result.reason. Callers use the explicit failure-alias idiom
// (`const failure = result as MyBookingsFailure`) rather than relying on a
// narrowing that this compiler configuration never performs.
export type MyBookingsResult = MyBookingsSuccess | MyBookingsFailure;

const ROW_LIMIT = 100;

export async function listMyBookings(filterKey?: string): Promise<MyBookingsResult> {
  const session = await createClient();
  const {
    data: { user },
    error: authError,
  } = await session.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      reason: 'signed-out',
      message: 'You are signed out, so there is nothing to show yet. Sign in to see your meetings.',
    };
  }

  let participantOr: string;
  try {
    participantOr = buildParticipantOr(user.id);
  } catch {
    return {
      ok: false,
      reason: 'error',
      message: 'Your account could not be identified. Please sign out and sign in again.',
    };
  }

  const filter = resolveFilter(filterKey);

  // Service-role: mb_host_select would drop every row you are only attending.
  // The participant predicate below is the access control for this read.
  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  ) as unknown as SupabaseClient;

  let query = service
    .from('meeting_bookings')
    .select(
      'id, uid, status, start_time, end_time, attendee_name, attendee_email, video_url, host_profile_id, attendee_profile_id, meeting_type_id',
    )
    .or(participantOr)
    .order('start_time', { ascending: filter.ascending })
    .limit(ROW_LIMIT);

  if (filter.statuses) {
    query = query.in('status', filter.statuses as unknown as string[]);
  }
  if (filter.when) {
    const nowIso = new Date().toISOString();
    query =
      filter.when === 'future' ? query.gte('start_time', nowIso) : query.lt('start_time', nowIso);
  }

  const { data, error } = await query;

  if (error) {
    return { ok: false, reason: 'error', message: error.message };
  }

  const bookings = data ?? [];
  if (bookings.length === 0) {
    return { ok: true, rows: [] };
  }

  // Two small lookups rather than one embedded select: meeting_type_id is
  // nullable (types can be soft-deleted) and an embedded join would drop those
  // rows or need an explicit left join anyway.
  const typeIds = Array.from(
    new Set(bookings.map((b) => b.meeting_type_id).filter((v): v is string => !!v)),
  );
  const hostIds = Array.from(
    new Set(
      bookings
        .filter((b) => b.host_profile_id !== user.id)
        .map((b) => b.host_profile_id)
        .filter((v): v is string => !!v),
    ),
  );

  const [typesRes, hostsRes] = await Promise.all([
    typeIds.length
      ? service.from('meeting_types').select('id, title').in('id', typeIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string | null }> }),
    hostIds.length
      ? service.from('profiles').select('id, full_name, email').in('id', hostIds)
      : Promise.resolve({
          data: [] as Array<{ id: string; full_name: string | null; email: string | null }>,
        }),
  ]);

  const titleById = new Map<string, string | null>(
    (typesRes.data ?? []).map((t) => [t.id, t.title ?? null]),
  );
  const hostById = new Map<string, { full_name: string | null; email: string | null }>(
    (hostsRes.data ?? []).map((h) => [h.id, { full_name: h.full_name, email: h.email }]),
  );

  const rows: MyBookingRow[] = [];
  for (const b of bookings) {
    const role = viewerRole(b, user.id);
    // Defence in depth: the predicate already excludes non-participants, so a
    // row landing here without a role means the query returned something it
    // was not asked for. Drop it rather than render it.
    if (!role) continue;
    const host = b.host_profile_id ? hostById.get(b.host_profile_id) : undefined;
    rows.push({
      id: b.id,
      uid: b.uid,
      status: b.status,
      start_time: b.start_time,
      end_time: b.end_time,
      attendee_name: b.attendee_name ?? null,
      attendee_email: b.attendee_email ?? null,
      video_url: b.video_url ?? null,
      role,
      typeTitle: b.meeting_type_id ? (titleById.get(b.meeting_type_id) ?? null) : null,
      hostName: host?.full_name ?? null,
      hostEmail: host?.email ?? null,
    });
  }

  return { ok: true, rows };
}
