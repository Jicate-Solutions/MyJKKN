'use server';

// app/(routes)/meetings/schedule/actions.ts
//
// Server actions for "Schedule a meeting" — the host-initiated half of the
// meetings module. See lib/services/meetings/host-scheduling-service.ts for why
// this exists and how it reuses the accountability engine's proven shape.
//
// SECURITY NOTE. Every action here resolves the host from the SESSION and never
// from client input. A caller cannot schedule a meeting on somebody else's
// calendar by posting a different id, because no id is accepted. The
// service-role client is used only AFTER that identity is fixed.

import type { SupabaseClient } from '@supabase/supabase-js';

import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  HostSchedulingService,
  type HostMeetingLocationMode,
  type ScheduleAttendee,
} from '@/lib/services/meetings/host-scheduling-service';

export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PersonOption {
  profileId: string | null;
  name: string;
  email: string;
  /** Where this person came from — shown as a hint in the picker. */
  origin: 'jkkn' | 'contact';
  subtitle?: string | null;
}

export interface ScheduleMeetingInput {
  title: string;
  /** Local wall-clock the host typed, e.g. "2026-08-20T15:30" (no zone). */
  startLocal: string;
  durationMin: number;
  locationMode: HostMeetingLocationMode;
  locationText?: string | null;
  note?: string | null;
  attendees: ScheduleAttendee[];
}

export interface ScheduleMeetingResult {
  uid: string;
  videoUrl: string | null;
  startIso: string;
  warning: string | null;
}

async function currentUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error('You are signed out. Please sign in to MyJKKN and try again.');
  }
  return user.id;
}

/**
 * Convert the host's local wall-clock ("2026-08-20T15:30") into a real instant
 * in the campus timezone.
 *
 * Doing this with `new Date(localString)` would silently use the SERVER's zone,
 * which on Vercel is UTC — every meeting would land 5h30m off. We instead ask
 * Intl what the offset actually is at that moment, so DST or a future tz change
 * cannot skew it either.
 */
function localToInstant(local: string, timeZone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(local ?? '');
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  // Provisional instant, treating the wall-clock as if it were UTC.
  const guess = Date.UTC(+y, +mo - 1, +d, +h, +mi);
  // What wall-clock does that instant show in the target zone?
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(new Date(guess)).map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const shown = Date.UTC(
    +parts.year,
    +parts.month - 1,
    +parts.day,
    // Intl can render midnight as "24" in some locales/zones.
    +parts.hour % 24,
    +parts.minute,
  );
  // The zone is ahead of UTC by (shown - guess); subtract it to get the instant
  // whose local wall-clock is exactly what the host typed.
  return new Date(guess - (shown - guess)).toISOString();
}

/**
 * Whether this caller may see people from EVERY institution.
 *
 * Mirrors the first two checks of `role_has_institution_access()`: super admins
 * bypass, and any active role carrying `institution_scope = 'all'` grants
 * cross-institution reach. Everyone else is confined to their own institution.
 *
 * Deliberately fail-CLOSED — an error resolving the caller's roles returns
 * false, which narrows the search rather than widening it.
 */
async function callerInstitutionScope(
  db: SupabaseClient,
  userId: string,
): Promise<{ crossInstitution: boolean; institutionId: string | null }> {
  const { data: profile } = await db
    .from('profiles')
    .select('institution_id, is_super_admin')
    .eq('id', userId)
    .maybeSingle();

  const institutionId = ((profile as any)?.institution_id as string | null) ?? null;
  if ((profile as any)?.is_super_admin === true) {
    return { crossInstitution: true, institutionId };
  }

  const { data: roles, error } = await db
    .from('user_roles')
    .select('custom_roles!inner(institution_scope, is_active)')
    .eq('user_id', userId);
  if (error) return { crossInstitution: false, institutionId };

  const crossInstitution = (roles ?? []).some((r: any) => {
    const role = Array.isArray(r.custom_roles) ? r.custom_roles[0] : r.custom_roles;
    return role?.is_active !== false && role?.institution_scope === 'all';
  });
  return { crossInstitution, institutionId };
}

/**
 * People search across MyJKKN profiles — name or email, active accounts only.
 *
 * SCOPING (do not remove): `profiles_select_policy` is
 * `FOR SELECT USING (auth.uid() IS NOT NULL)`, so RLS does NOT scope this table
 * — every signed-in user can read all 6,000+ profiles across all 14
 * institutions. The institution filter below is therefore the ONLY thing
 * standing between a two-letter query and cross-tenant enumeration of names,
 * emails and designations. Switching to the anon/RLS client would not help.
 *
 * The search runs as two PARAMETERISED `.ilike()` queries rather than one
 * interpolated `.or()` string: PostgREST's `.or()` takes a filter grammar, so
 * `,` `(` `)` `.` in user input become operators and can widen the result set.
 * Escaping only `%` and `_` is not enough.
 */
export async function searchPeople(query: string): Promise<ActionResult<PersonOption[]>> {
  try {
    const userId = await currentUserId();
    const term = (query ?? '').trim();
    if (term.length < 2) return { success: true, data: [] };

    const db = createServiceRoleClient() as unknown as SupabaseClient;
    const { crossInstitution, institutionId } = await callerInstitutionScope(db, userId);

    // Fail closed: a caller with no institution and no cross-institution role
    // gets no results rather than everyone's.
    if (!crossInstitution && !institutionId) return { success: true, data: [] };

    // Only LIKE wildcards need escaping now that the term is passed as a value.
    const pattern = `%${term.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

    const base = () => {
      let q = db
        .from('profiles')
        .select('id, full_name, email, designation')
        .eq('is_active', true)
        .not('email', 'is', null);
      if (!crossInstitution) q = q.eq('institution_id', institutionId as string);
      return q;
    };

    const [byName, byEmail] = await Promise.all([
      base().ilike('full_name', pattern).limit(15),
      base().ilike('email', pattern).limit(15),
    ]);
    if (byName.error) return { success: false, error: byName.error.message };
    if (byEmail.error) return { success: false, error: byEmail.error.message };

    const seen = new Set<string>();
    const merged: PersonOption[] = [];
    for (const r of [...(byName.data ?? []), ...(byEmail.data ?? [])] as any[]) {
      const email = (r.email as string | null)?.trim();
      if (!email || seen.has(email.toLowerCase())) continue;
      seen.add(email.toLowerCase());
      merged.push({
        profileId: r.id as string,
        name: (r.full_name as string) || email,
        email,
        origin: 'jkkn',
        subtitle: (r.designation as string | null) ?? null,
      });
      if (merged.length >= 15) break;
    }
    return { success: true, data: merged };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Could not search people.' };
  }
}

/** Everyone who has booked this host before — the "past contacts" source. */
export async function listPastContacts(): Promise<ActionResult<PersonOption[]>> {
  try {
    const userId = await currentUserId();
    const db = createServiceRoleClient() as unknown as SupabaseClient;

    const { data, error } = await db
      .from('meeting_bookings')
      .select('attendee_email, attendee_name, attendee_profile_id, start_time')
      .eq('host_profile_id', userId)
      .not('attendee_email', 'is', null)
      .order('start_time', { ascending: false })
      .limit(200);

    if (error) return { success: false, error: error.message };

    // Most recent wins for the display name; the list stays in recency order.
    const seen = new Map<string, PersonOption>();
    for (const r of (data ?? []) as any[]) {
      const email = (r.attendee_email as string).trim().toLowerCase();
      if (!email || seen.has(email)) continue;
      seen.set(email, {
        profileId: (r.attendee_profile_id as string | null) ?? null,
        name: (r.attendee_name as string) || email,
        email,
        origin: 'contact',
        subtitle: 'Booked you before',
      });
    }
    return { success: true, data: [...seen.values()].slice(0, 50) };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Could not load your contacts.' };
  }
}

/** Book the meeting. The host is always the signed-in user. */
export async function scheduleMeeting(
  input: ScheduleMeetingInput,
): Promise<ActionResult<ScheduleMeetingResult>> {
  try {
    const userId = await currentUserId();

    const startIso = localToInstant(input.startLocal, 'Asia/Kolkata');
    if (!startIso) {
      return { success: false, error: 'Pick a date and time for the meeting.' };
    }

    const db = createServiceRoleClient() as unknown as SupabaseClient;
    const outcome = await HostSchedulingService.scheduleDirect(db, {
      hostProfileId: userId,
      title: input.title,
      startIso,
      durationMin: input.durationMin,
      locationMode: input.locationMode,
      locationText: input.locationText ?? null,
      note: input.note ?? null,
      attendees: input.attendees ?? [],
    });

    if (!outcome.ok) return { success: false, error: outcome.error.message };

    return {
      success: true,
      data: {
        uid: outcome.data.uid,
        videoUrl: outcome.data.videoUrl,
        startIso: outcome.data.startIso,
        warning: outcome.data.warning,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'The meeting could not be scheduled.' };
  }
}
