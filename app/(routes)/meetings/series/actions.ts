'use server';

// app/(routes)/meetings/series/actions.ts
//
// Server actions for the EAO's recurring-series configuration screen — piece 1
// of the Monthly Slate spec. Configuration ONLY: nothing here proposes a month,
// books a meeting or approves anything.
//
// Every read and write goes through the RLS-scoped anon client, so the answer
// to "may this person touch this series" is the migration's policy, not a check
// duplicated here. That policy already honours the EXISTING delegate link in
// meeting_host_delegates — the EAO is an active delegate of the Director, so no
// new permission model was invented for them.
//
// Companion:
//   page.tsx                        — server component, explicit auth gate
//   _components/series-manager.tsx  — 'use client' interactive manager
//   rules/                          — piece 2, the scheduling rules

import { createClient } from '@/lib/supabase/server';
import {
  isSeriesCadence,
  type CoverageMode,
  type SeriesCadence,
} from '@/lib/services/meetings/recurring-series-config';
import { labelInstitutions } from '@/lib/services/meetings/institution-labels';

// NOTE: repo compiles with strictNullChecks:false — flat optional-field shape,
// not a discriminated union (matches meetings/manage/actions.ts).
export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface SeriesUnit {
  institutionId: string;
  isExcluded: boolean;
  exclusionReason: string | null;
}

export interface SeriesAttendee {
  profileId: string;
  name: string;
  email: string | null;
  isRequired: boolean;
}

export interface RecurringSeries {
  id: string;
  name: string;
  description: string | null;
  hostProfileId: string;
  hostName: string | null;
  institutionId: string | null;
  cadence: SeriesCadence;
  preferredWeekday: number | null;
  preferredStartMinute: number | null;
  durationMin: number;
  mayBeOnline: boolean;
  coverageMode: CoverageMode;
  priority: number;
  isActive: boolean;
  units: SeriesUnit[];
  attendees: SeriesAttendee[];
}

export interface InstitutionOption {
  id: string;
  name: string;
}

export interface SeriesInput {
  name: string;
  description?: string | null;
  /** Defaults to the signed-in user when omitted. */
  hostProfileId?: string | null;
  institutionId?: string | null;
  cadence: SeriesCadence;
  preferredWeekday?: number | null;
  preferredStartMinute?: number | null;
  durationMin: number;
  mayBeOnline: boolean;
  coverageMode: CoverageMode;
  priority: number;
  isActive?: boolean;
}

const SERIES_COLUMNS =
  'id, name, description, host_profile_id, institution_id, cadence, preferred_weekday, ' +
  'preferred_start_minute, duration_min, may_be_online, coverage_mode, priority, is_active';

/** Rejects a payload the CHECK constraints would reject anyway, with a readable message. */
function validate(input: SeriesInput): string | null {
  if (!input.name || !input.name.trim()) return 'Give the series a name.';
  if (!isSeriesCadence(input.cadence)) return 'Pick how often the series repeats.';
  if (input.coverageMode !== 'all_institutions' && input.coverageMode !== 'listed_only') {
    return 'Pick which units the series covers.';
  }
  if (!(input.durationMin >= 5 && input.durationMin <= 1440)) {
    return 'Duration must be between 5 minutes and 24 hours.';
  }
  if (!(input.priority >= 1 && input.priority <= 1000)) {
    return 'Priority must be between 1 and 1000.';
  }
  if (
    input.preferredWeekday !== null &&
    input.preferredWeekday !== undefined &&
    !(input.preferredWeekday >= 0 && input.preferredWeekday <= 6)
  ) {
    return 'Preferred day is not a valid weekday.';
  }
  if (
    input.preferredStartMinute !== null &&
    input.preferredStartMinute !== undefined &&
    !(input.preferredStartMinute >= 0 && input.preferredStartMinute <= 1439)
  ) {
    return 'Preferred time is not a valid time of day.';
  }
  return null;
}

function toRow(input: SeriesInput, hostProfileId: string) {
  return {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    host_profile_id: hostProfileId,
    institution_id: input.institutionId || null,
    cadence: input.cadence,
    preferred_weekday: input.preferredWeekday ?? null,
    preferred_start_minute: input.preferredStartMinute ?? null,
    duration_min: input.durationMin,
    may_be_online: input.mayBeOnline,
    coverage_mode: input.coverageMode,
    priority: input.priority,
    is_active: input.isActive ?? true,
  };
}

/**
 * Every configured series, with its coverage rows and required people.
 *
 * Three queries rather than one nested select: the child tables carry their own
 * policies, and a PostgREST embed that RLS filters to nothing looks identical
 * to a series that genuinely has no exceptions.
 */
export async function listSeries(): Promise<ActionResult<RecurringSeries[]>> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'You are not signed in.' };

    const { data: rows, error } = await supabase
      .from('meeting_recurring_series')
      .select(SERIES_COLUMNS)
      .order('priority', { ascending: true })
      .order('name', { ascending: true });
    if (error) return { success: false, error: error.message };

    const seriesRows = (rows ?? []) as any[];
    const ids = seriesRows.map((r) => r.id as string);

    if (ids.length === 0) return { success: true, data: [] };

    const [unitsRes, attendeesRes, hostsRes] = await Promise.all([
      supabase
        .from('meeting_recurring_series_units')
        .select('series_id, institution_id, is_excluded, exclusion_reason')
        .in('series_id', ids),
      supabase
        .from('meeting_recurring_series_attendees')
        .select('series_id, profile_id, is_required')
        .in('series_id', ids),
      supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', Array.from(new Set(seriesRows.map((r) => r.host_profile_id as string)))),
    ]);
    if (unitsRes.error) return { success: false, error: unitsRes.error.message };
    if (attendeesRes.error) return { success: false, error: attendeesRes.error.message };

    const attendeeIds = Array.from(
      new Set(((attendeesRes.data ?? []) as any[]).map((a) => a.profile_id as string)),
    );
    const people = new Map<string, { name: string; email: string | null }>();
    for (const p of (hostsRes.data ?? []) as any[]) {
      people.set(p.id, { name: p.full_name ?? p.email ?? 'Unknown', email: p.email ?? null });
    }
    if (attendeeIds.length > 0) {
      const { data: attendeeProfiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', attendeeIds);
      for (const p of (attendeeProfiles ?? []) as any[]) {
        people.set(p.id, { name: p.full_name ?? p.email ?? 'Unknown', email: p.email ?? null });
      }
    }

    const unitsBySeries = new Map<string, SeriesUnit[]>();
    for (const u of (unitsRes.data ?? []) as any[]) {
      const list = unitsBySeries.get(u.series_id) ?? [];
      list.push({
        institutionId: u.institution_id,
        isExcluded: Boolean(u.is_excluded),
        exclusionReason: u.exclusion_reason ?? null,
      });
      unitsBySeries.set(u.series_id, list);
    }

    const attendeesBySeries = new Map<string, SeriesAttendee[]>();
    for (const a of (attendeesRes.data ?? []) as any[]) {
      const list = attendeesBySeries.get(a.series_id) ?? [];
      const person = people.get(a.profile_id);
      list.push({
        profileId: a.profile_id,
        name: person?.name ?? 'Unknown',
        email: person?.email ?? null,
        isRequired: Boolean(a.is_required),
      });
      attendeesBySeries.set(a.series_id, list);
    }

    const data: RecurringSeries[] = seriesRows.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description ?? null,
      hostProfileId: r.host_profile_id,
      hostName: people.get(r.host_profile_id)?.name ?? null,
      institutionId: r.institution_id ?? null,
      cadence: r.cadence,
      preferredWeekday: r.preferred_weekday ?? null,
      preferredStartMinute: r.preferred_start_minute ?? null,
      durationMin: r.duration_min,
      mayBeOnline: Boolean(r.may_be_online),
      coverageMode: r.coverage_mode,
      priority: r.priority,
      isActive: Boolean(r.is_active),
      units: unitsBySeries.get(r.id) ?? [],
      attendees: attendeesBySeries.get(r.id) ?? [],
    }));

    return { success: true, data };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Could not load the recurring series.' };
  }
}

/** Active institutions, for the coverage and exception pickers. */
export async function listInstitutionOptions(): Promise<ActionResult<InstitutionOption[]>> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('institutions')
      .select('id, name, display_name')
      .eq('is_active', true)
      .order('name', { ascending: true });
    if (error) return { success: false, error: error.message };
    return {
      success: true,
      data: labelInstitutions((data ?? []) as any[]),
    };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Could not load the list of colleges.' };
  }
}

export async function createSeries(input: SeriesInput): Promise<ActionResult<{ id: string }>> {
  try {
    const problem = validate(input);
    if (problem) return { success: false, error: problem };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'You are not signed in.' };

    const { data, error } = await supabase
      .from('meeting_recurring_series')
      .insert({
        ...toRow(input, input.hostProfileId || user.id),
        created_by: user.id,
      })
      .select('id')
      .single();
    if (error) return { success: false, error: error.message };
    return { success: true, data: { id: (data as any).id } };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Could not create the series.' };
  }
}

export async function updateSeries(
  id: string,
  input: SeriesInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const problem = validate(input);
    if (problem) return { success: false, error: problem };

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'You are not signed in.' };

    const { error } = await supabase
      .from('meeting_recurring_series')
      .update(toRow(input, input.hostProfileId || user.id))
      .eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true, data: { id } };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Could not save the series.' };
  }
}

export async function deleteSeries(id: string): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from('meeting_recurring_series').delete().eq('id', id);
    if (error) return { success: false, error: error.message };
    return { success: true, data: null };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Could not delete the series.' };
  }
}

/**
 * Replace a series' coverage rows in one go.
 *
 * Delete-then-insert rather than a diff: the whole set is small (a handful of
 * exceptions), and a partial diff that half-applies would leave a series
 * covering a college nobody chose.
 */
export async function setSeriesUnits(
  seriesId: string,
  units: SeriesUnit[],
): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();

    const { error: delError } = await supabase
      .from('meeting_recurring_series_units')
      .delete()
      .eq('series_id', seriesId);
    if (delError) return { success: false, error: delError.message };

    const seen = new Set<string>();
    const rows = units
      .filter((u) => {
        if (!u.institutionId || seen.has(u.institutionId)) return false;
        seen.add(u.institutionId);
        return true;
      })
      .map((u) => ({
        series_id: seriesId,
        institution_id: u.institutionId,
        is_excluded: Boolean(u.isExcluded),
        exclusion_reason: u.exclusionReason?.trim() || null,
      }));

    if (rows.length > 0) {
      const { error } = await supabase.from('meeting_recurring_series_units').insert(rows);
      if (error) return { success: false, error: error.message };
    }
    return { success: true, data: null };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Could not save the coverage list.' };
  }
}

/** Replace a series' required-attendee list. Same delete-then-insert reasoning. */
export async function setSeriesAttendees(
  seriesId: string,
  attendees: { profileId: string; isRequired: boolean }[],
): Promise<ActionResult<null>> {
  try {
    const supabase = await createClient();

    const { error: delError } = await supabase
      .from('meeting_recurring_series_attendees')
      .delete()
      .eq('series_id', seriesId);
    if (delError) return { success: false, error: delError.message };

    const seen = new Set<string>();
    const rows = attendees
      .filter((a) => {
        if (!a.profileId || seen.has(a.profileId)) return false;
        seen.add(a.profileId);
        return true;
      })
      .map((a) => ({
        series_id: seriesId,
        profile_id: a.profileId,
        is_required: a.isRequired !== false,
      }));

    if (rows.length > 0) {
      const { error } = await supabase.from('meeting_recurring_series_attendees').insert(rows);
      if (error) return { success: false, error: error.message };
    }
    return { success: true, data: null };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Could not save the people list.' };
  }
}

export interface SeriesPersonOption {
  profileId: string;
  name: string;
  email: string;
  subtitle: string | null;
}

/**
 * People search for the required-attendee picker.
 *
 * Deliberately a thin wrapper over the meetings module's existing searchPeople,
 * which already carries the institution scoping that stops a two-letter query
 * enumerating 6,000+ profiles across 14 institutions. Re-implementing it here
 * would mean re-implementing that guard.
 */
export async function searchSeriesPeople(
  query: string,
): Promise<ActionResult<SeriesPersonOption[]>> {
  const { searchPeople } = await import('../schedule/actions');
  const result = await searchPeople(query);
  if (!result.success) return { success: false, error: result.error };
  return {
    success: true,
    data: (result.data ?? [])
      .filter((p) => Boolean(p.profileId))
      .map((p) => ({
        profileId: p.profileId as string,
        name: p.name,
        email: p.email,
        subtitle: p.subtitle ?? null,
      })),
  };
}
