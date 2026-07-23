// hooks/admission/use-team-activity.ts
// React Query hooks for the Team Activity Dashboard at
// /admission/counselors/team/activity.
//
// Backed by two SECURITY DEFINER RPCs added in migration
// 20260514120000_team_activity_rpcs.sql:
//   - get_team_activity_day(institution, date)
//   - get_team_activity_trend(institution, days)
//
// The RPCs bypass admission_lead_activities' RLS (which is scoped to the
// caller's own assigned leads) and re-gate explicitly on
// admission.counselors.team.view + role_has_institution_access — required
// because this is a *team-wide* view, not a per-counselor one.

import { useQuery } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

// ── Shared activity-type vocabulary ──────────────────────────────────────────
// Matches the activity_type enum used across admission_lead_activities +
// the synthetic 'cascade' value returned by the day RPC for the cascade
// UNION branch.
export type TeamActivityType =
  | 'call'
  | 'email'
  | 'meeting'
  | 'note'
  | 'sms'
  | 'whatsapp'
  | 'stage_change'
  | 'task'
  | 'cascade'
  | 'lead_created'
  | 'enquiry_submitted'
  | 'student_section_filled'
  | 'moved_to_account_verified'
  | 'moved_to_counselor'
  | 'manual_edit';

export const TEAM_ACTIVITY_TYPES: readonly TeamActivityType[] = [
  'call',
  'email',
  'meeting',
  'note',
  'sms',
  'whatsapp',
  'stage_change',
  'task',
  'cascade',
  'lead_created',
  'enquiry_submitted',
  'student_section_filled',
  'moved_to_account_verified',
  'moved_to_counselor',
  'manual_edit',
] as const;

// ── Day RPC row shape (one per event) ────────────────────────────────────────
export interface TeamActivityDayRow {
  activity_id: string;
  source: 'lead_activity' | 'cascade';
  activity_type: TeamActivityType;
  lead_id: string;
  lead_name: string;
  counselor_id: string | null;
  counselor_name: string;
  subject: string | null;
  description: string | null;
  outcome: string | null;
  created_at: string;
}

// ── Trend RPC row shape (one per (day, type)) ────────────────────────────────
export interface TeamActivityTrendRow {
  day: string;          // ISO date — 'YYYY-MM-DD' in IST
  activity_type: TeamActivityType;
  count: number;
}

// ── Query key factory ────────────────────────────────────────────────────────
export const teamActivityKeys = {
  all: ['team-activity'] as const,
  day: (institutionId: string | undefined, dateIso: string) =>
    [...teamActivityKeys.all, 'day', institutionId ?? 'all', dateIso] as const,
  trend: (institutionId: string | undefined, days: number) =>
    [...teamActivityKeys.all, 'trend', institutionId ?? 'all', days] as const,
};

// ── Date formatter — converts a Date to 'YYYY-MM-DD' in *local* zone. ────────
// The RPC interprets the date as IST internally, so we just pass the user's
// selected calendar date as a plain ISO date string — no time component.
function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. useTeamActivityDay — every event on the selected day
// ─────────────────────────────────────────────────────────────────────────────
export function useTeamActivityDay(
  institutionId: string | undefined,
  date: Date,
) {
  const dateIso = toIsoDate(date);

  return useQuery({
    queryKey: teamActivityKeys.day(institutionId, dateIso),
    queryFn: async (): Promise<TeamActivityDayRow[]> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any).rpc('get_team_activity_day', {
        p_institution_id: institutionId ?? null,
        p_date: dateIso,
      });

      if (error) {
        console.error('[team-activity] get_team_activity_day failed', error);
        throw new Error(error.message ?? 'Failed to load team activity');
      }

      return (data ?? []) as TeamActivityDayRow[];
    },
    // The RPC is moderately heavy (700+ rows/day at current volume); cache
    // for 60s so tab switches inside the team module are instant. Manual
    // date changes invalidate via the new dateIso in the query key.
    staleTime: 60_000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. useTeamActivityTrend — daily counts by type for the last N days
// ─────────────────────────────────────────────────────────────────────────────
export function useTeamActivityTrend(
  institutionId: string | undefined,
  days: number = 7,
) {
  return useQuery({
    queryKey: teamActivityKeys.trend(institutionId, days),
    queryFn: async (): Promise<TeamActivityTrendRow[]> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any).rpc('get_team_activity_trend', {
        p_institution_id: institutionId ?? null,
        p_days: days,
      });

      if (error) {
        console.error('[team-activity] get_team_activity_trend failed', error);
        throw new Error(error.message ?? 'Failed to load activity trend');
      }

      return (data ?? []) as TeamActivityTrendRow[];
    },
    // Trend data only changes once per day at midnight IST — 5 min stale is fine.
    staleTime: 5 * 60_000,
  });
}
