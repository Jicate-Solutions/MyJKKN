// lib/services/hostel/curfew-policy-service.ts
//
// Service layer for the Hostel Curfew Policy module.
//
// Substrate: supabase/migrations/20260630000000_hostel_curfew_policies.sql
//   - Table  : public.hostel_curfew_policies
//   - RPC    : public.fn_get_curfew(uuid, text, smallint) → table(direction, curfew_time, source_row_id)
//
// Resolution semantics (handled in DB):
//   - 'entry' direction → strictest = MIN(curfew_time)
//   - 'exit'  direction → strictest = MAX(curfew_time)
//   - Rows with direction='both' participate in both lookups.
//   - NULL institution_id / NULL day_of_week act as wildcards.
//
// Spec lock: 2026-05-25 (chairperson + Director).

import type { SupabaseClient } from '@supabase/supabase-js';

// ---------------------------------------------------------------------------
// Envelope types (consistent with internships service layer)
// ---------------------------------------------------------------------------
export type ServiceResult<T> = { data: T | null; error: Error | null };
export type ServiceListResult<T> = { data: T[]; error: Error | null };

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------
export type CurfewGender = 'boys' | 'girls' | 'both';
export type CurfewDirection = 'entry' | 'exit' | 'both';
export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface CurfewPolicyRow {
  id: string;
  institution_id: string | null;
  gender: CurfewGender;
  day_of_week: DayOfWeek | null;
  direction: CurfewDirection;
  curfew_time: string; // HH:MM:SS
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface CurfewPolicyInput {
  institution_id?: string | null;
  gender: CurfewGender;
  day_of_week?: DayOfWeek | null;
  direction: CurfewDirection;
  curfew_time: string; // HH:MM or HH:MM:SS
  description?: string | null;
  is_active?: boolean;
}

export interface ResolvedCurfew {
  direction: 'entry' | 'exit';
  curfew_time: string; // HH:MM:SS
  source_row_id: string;
}

// ---------------------------------------------------------------------------
// Day-of-week labels (UI)
// ---------------------------------------------------------------------------
export const DOW_LABELS: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

export const ALL_DAYS: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 7];

// ---------------------------------------------------------------------------
// CRUD — list
// ---------------------------------------------------------------------------

/**
 * List ALL curfew rules (active + inactive). Admin UI consumes this.
 * Ordering: global first, then by institution, gender, day, direction.
 */
export async function listCurfewPolicies(
  supabase: SupabaseClient
): Promise<ServiceListResult<CurfewPolicyRow>> {
  const { data, error } = await supabase
    .from('hostel_curfew_policies')
    .select(
      'id, institution_id, gender, day_of_week, direction, curfew_time, description, is_active, created_at, updated_at, updated_by'
    )
    .order('institution_id', { ascending: true, nullsFirst: true })
    .order('gender', { ascending: true })
    .order('day_of_week', { ascending: true, nullsFirst: true })
    .order('direction', { ascending: true });

  if (error) {
    return { data: [], error: new Error(error.message) };
  }

  return { data: (data ?? []) as CurfewPolicyRow[], error: null };
}

// ---------------------------------------------------------------------------
// CRUD — create
// ---------------------------------------------------------------------------
export async function createCurfewPolicy(
  supabase: SupabaseClient,
  input: CurfewPolicyInput
): Promise<ServiceResult<CurfewPolicyRow>> {
  const payload = {
    institution_id: input.institution_id ?? null,
    gender: input.gender,
    day_of_week: input.day_of_week ?? null,
    direction: input.direction,
    curfew_time: normalizeTime(input.curfew_time),
    description: input.description ?? null,
    is_active: input.is_active ?? true,
  };

  const { data, error } = await supabase
    .from('hostel_curfew_policies')
    .insert(payload)
    .select(
      'id, institution_id, gender, day_of_week, direction, curfew_time, description, is_active, created_at, updated_at, updated_by'
    )
    .single();

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  return { data: data as CurfewPolicyRow, error: null };
}

// ---------------------------------------------------------------------------
// CRUD — update
// ---------------------------------------------------------------------------
export async function updateCurfewPolicy(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<CurfewPolicyInput>
): Promise<ServiceResult<CurfewPolicyRow>> {
  const payload: Record<string, unknown> = {};
  if (patch.institution_id !== undefined) payload.institution_id = patch.institution_id;
  if (patch.gender !== undefined) payload.gender = patch.gender;
  if (patch.day_of_week !== undefined) payload.day_of_week = patch.day_of_week;
  if (patch.direction !== undefined) payload.direction = patch.direction;
  if (patch.curfew_time !== undefined) payload.curfew_time = normalizeTime(patch.curfew_time);
  if (patch.description !== undefined) payload.description = patch.description;
  if (patch.is_active !== undefined) payload.is_active = patch.is_active;

  const { data, error } = await supabase
    .from('hostel_curfew_policies')
    .update(payload)
    .eq('id', id)
    .select(
      'id, institution_id, gender, day_of_week, direction, curfew_time, description, is_active, created_at, updated_at, updated_by'
    )
    .single();

  if (error) {
    return { data: null, error: new Error(error.message) };
  }

  return { data: data as CurfewPolicyRow, error: null };
}

// ---------------------------------------------------------------------------
// CRUD — disable / enable (soft delete via is_active)
// ---------------------------------------------------------------------------
export async function setCurfewPolicyActive(
  supabase: SupabaseClient,
  id: string,
  isActive: boolean
): Promise<ServiceResult<CurfewPolicyRow>> {
  return updateCurfewPolicy(supabase, id, { is_active: isActive });
}

// ---------------------------------------------------------------------------
// RPC — fn_get_curfew (resolver)
// ---------------------------------------------------------------------------

/**
 * Resolves the strictest active curfew for a (institution, gender, day) tuple.
 * Returns 0-2 rows (one per direction). Caller may receive only an entry rule,
 * only an exit rule, both, or neither depending on what's seeded.
 */
export async function resolveCurfew(
  supabase: SupabaseClient,
  params: {
    institutionId: string | null;
    gender: CurfewGender;
    dayOfWeek: DayOfWeek;
  }
): Promise<ServiceListResult<ResolvedCurfew>> {
  const { data, error } = await supabase.rpc('fn_get_curfew', {
    p_institution_id: params.institutionId,
    p_gender: params.gender,
    p_day_of_week: params.dayOfWeek,
  });

  if (error) {
    return { data: [], error: new Error(error.message) };
  }

  return {
    data: (data ?? []) as ResolvedCurfew[],
    error: null,
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Accept HH:MM or HH:MM:SS; return HH:MM:SS.
 * Postgres `time` accepts both, but normalizing keeps DB rows uniform.
 */
function normalizeTime(t: string): string {
  if (!t) return t;
  if (/^\d{2}:\d{2}$/.test(t)) return `${t}:00`;
  return t;
}

/**
 * Pretty-print a curfew rule in English.
 * Examples:
 *   "Boys at All Institutions, Monday: must be inside by 22:00"
 *   "Girls at JKKN Dental College, Saturday: cannot leave before 06:00"
 *   "Everyone at All Institutions, every day: entry & exit by 22:00"
 */
export function describeCurfewRule(
  row: CurfewPolicyRow,
  institutionName?: string | null
): string {
  const who = row.gender === 'boys' ? 'Boys' : row.gender === 'girls' ? 'Girls' : 'Everyone';
  const where = row.institution_id ? institutionName ?? 'an institution' : 'All Institutions';
  const when = row.day_of_week ? DOW_LABELS[row.day_of_week] : 'every day';

  const time = row.curfew_time.slice(0, 5); // strip seconds
  let action: string;
  if (row.direction === 'entry') action = `must be inside by ${time}`;
  else if (row.direction === 'exit') action = `cannot leave before ${time}`;
  else action = `entry & exit at ${time}`;

  return `${who} at ${where}, ${when}: ${action}`;
}
