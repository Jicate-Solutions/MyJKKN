// hooks/admission/use-counselor-team-data.ts
// Centralised data fetch for the /admission/counselors/team 5-tab page.
// Follows the service institution_id convention:
//   - signature: institutionId: string | undefined
//   - guard:     if (institutionId) query = query.eq('institution_id', institutionId)
//   - caller:    isSuperAdmin ? undefined : profile?.institution_id

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CounselorTeamMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  designation: string | null;
  institution_id: string | null;
  is_active: boolean;
  current_leads: number;
  max_leads: number;
  // Optional columns added by future migrations (Phase 7+)
  category?: string | null;
  emergency_off?: boolean | null;
  user_id?: string | null;
  created_at: string;
}

export interface CounselorScheduleRow {
  id: string;
  counselor_id: string;
  day_of_week: number;        // 0=Sun … 6=Sat
  is_available: boolean;
  start_time?: string | null;
  end_time?: string | null;
  created_at?: string;
}

export interface CounselorInstitutionRow {
  id: string;
  counselor_id: string;
  institution_id: string;
  created_at?: string;
}

export interface CounselorSourceRow {
  id: string;
  counselor_id: string;
  source: string;
  created_at?: string;
}

export interface AssignmentRule {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  priority: number;
  is_active: boolean;
  criteria: unknown;
  action: unknown;
  created_at: string;
  updated_at: string;
}

export interface CascadeHistoryRow {
  id: string;
  lead_id: string;
  from_counselor_id: string | null;
  to_counselor_id: string | null;
  reason: string | null;
  created_at: string;
  from_counselor?: { name: string } | null;
  to_counselor?: { name: string } | null;
  lead?: { full_name: string; phone: string } | null;
}

// ─── Query keys ───────────────────────────────────────────────────────────────

export const counselorTeamKeys = {
  all: ['counselor-team'] as const,
  members: (instId: string | undefined) => [...counselorTeamKeys.all, 'members', instId] as const,
  schedules: (instId: string | undefined) => [...counselorTeamKeys.all, 'schedules', instId] as const,
  institutions: (instId: string | undefined) => [...counselorTeamKeys.all, 'institutions', instId] as const,
  sources: (instId: string | undefined) => [...counselorTeamKeys.all, 'sources', instId] as const,
  cascade: (instId: string | undefined) => [...counselorTeamKeys.all, 'cascade', instId] as const,
  rules: (instId: string | undefined) => [...counselorTeamKeys.all, 'rules', instId] as const,
};

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * 1. Members tab — list all counselors (filtered by institution for non-super-admins).
 */
export function useCounselorMembers(institutionId: string | undefined) {
  return useQuery({
    queryKey: counselorTeamKeys.members(institutionId),
    queryFn: async (): Promise<CounselorTeamMember[]> => {
      const supabase = createClientSupabaseClient();
      let query = (supabase as any)
        .from('admission_counselors')
        .select('id, name, email, phone, designation, institution_id, is_active, current_leads, max_leads, user_id, created_at, category, emergency_off')
        .order('name', { ascending: true });

      // institution_id guard per service convention
      if (institutionId) query = query.eq('institution_id', institutionId);

      const { data, error } = await query;
      if (error) {
        // "category" or "emergency_off" column may not exist yet — retry without them
        if (error.code === '42703') {
          let fallback = (supabase as any)
            .from('admission_counselors')
            .select('id, name, email, phone, designation, institution_id, is_active, current_leads, max_leads, user_id, created_at')
            .order('name', { ascending: true });
          if (institutionId) fallback = fallback.eq('institution_id', institutionId);
          const { data: fb, error: fbErr } = await fallback;
          if (fbErr) throw new Error(fbErr.message);
          return (fb ?? []) as CounselorTeamMember[];
        }
        throw new Error(error.message);
      }
      return (data ?? []) as CounselorTeamMember[];
    },
    staleTime: 30_000,
  });
}

/**
 * 2. Roster tab — 7-day schedule grid per counselor.
 * Reads admission_counselor_schedules (may be empty until Phase 7 seeds).
 */
export function useCounselorSchedules(institutionId: string | undefined) {
  return useQuery({
    queryKey: counselorTeamKeys.schedules(institutionId),
    queryFn: async (): Promise<CounselorScheduleRow[]> => {
      const supabase = createClientSupabaseClient();
      // Join via counselor to filter by institution
      const { data, error } = await (supabase as any)
        .from('admission_counselor_schedules')
        .select('id, counselor_id, day_of_week, is_available, start_time, end_time, created_at, counselor:admission_counselors!counselor_id(institution_id)')
        .order('day_of_week', { ascending: true });

      if (error) {
        // Table may not exist yet if Phase 7 hasn't run
        if (error.code === '42P01' || error.code === '42703') return [];
        throw new Error(error.message);
      }

      // Filter client-side by institution when needed
      const rows = (data ?? []) as Array<CounselorScheduleRow & { counselor?: { institution_id: string } | null }>;
      if (!institutionId) return rows;
      return rows.filter((r) => r.counselor?.institution_id === institutionId);
    },
    staleTime: 60_000,
  });
}

/**
 * 3a. Allocation tab — institution mapping per counselor.
 * Reads admission_counselor_institutions (junction, seeded by Phase 7).
 */
export function useCounselorInstitutions(institutionId: string | undefined) {
  return useQuery({
    queryKey: counselorTeamKeys.institutions(institutionId),
    queryFn: async (): Promise<CounselorInstitutionRow[]> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('admission_counselor_institutions')
        .select('id, counselor_id, institution_id, created_at');

      if (error) {
        if (error.code === '42P01' || error.code === '42703') return [];
        throw new Error(error.message);
      }
      return (data ?? []) as CounselorInstitutionRow[];
    },
    staleTime: 60_000,
  });
}

/**
 * 3b. Allocation tab — source mapping per counselor.
 * Reads admission_counselor_sources (junction, seeded by Phase 7).
 */
export function useCounselorSources(institutionId: string | undefined) {
  return useQuery({
    queryKey: counselorTeamKeys.sources(institutionId),
    queryFn: async (): Promise<CounselorSourceRow[]> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('admission_counselor_sources')
        .select('id, counselor_id, source, created_at');

      if (error) {
        if (error.code === '42P01' || error.code === '42703') return [];
        throw new Error(error.message);
      }
      return (data ?? []) as CounselorSourceRow[];
    },
    staleTime: 60_000,
  });
}

/**
 * 4. Rules tab — read assignment rules (CRUD lives at /admission/settings/assignment-rules).
 */
export function useCounselorTeamRules(institutionId: string | undefined) {
  return useQuery({
    queryKey: counselorTeamKeys.rules(institutionId),
    queryFn: async (): Promise<AssignmentRule[]> => {
      const supabase = createClientSupabaseClient();
      let query = (supabase as any)
        .from('admission_assignment_rules')
        .select('id, institution_id, name, description, priority, is_active, criteria, action, created_at, updated_at')
        .order('priority', { ascending: true });

      if (institutionId) query = query.eq('institution_id', institutionId);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as AssignmentRule[];
    },
    staleTime: 60_000,
  });
}

/**
 * 5. Activity tab — last 50 cascade events.
 * Reads admission_lead_cascade_history (may be empty until leads cascade).
 */
export function useCounselorCascadeHistory(institutionId: string | undefined) {
  return useQuery({
    queryKey: counselorTeamKeys.cascade(institutionId),
    queryFn: async (): Promise<CascadeHistoryRow[]> => {
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('admission_lead_cascade_history')
        .select(`
          id, lead_id, from_counselor_id, to_counselor_id, reason, created_at,
          from_counselor:admission_counselors!from_counselor_id(name),
          to_counselor:admission_counselors!to_counselor_id(name),
          lead:admission_leads!lead_id(full_name, phone)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        if (error.code === '42P01' || error.code === '42703') return [];
        throw new Error(error.message);
      }
      return (data ?? []) as CascadeHistoryRow[];
    },
    staleTime: 30_000,
  });
}

/**
 * Mutation: toggle counselor is_active.
 * Admin-only; RLS enforces this at DB level.
 */
export function useToggleCounselorActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const supabase = createClientSupabaseClient();
      const { error } = await (supabase as any)
        .from('admission_counselors')
        .update({ is_active: isActive })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: counselorTeamKeys.all });
      toast.success('Counselor status updated');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update status'),
  });
}

/**
 * Mutation: toggle schedule slot on/off for a counselor + day.
 */
export function useToggleScheduleSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      counselorId,
      dayOfWeek,
      isAvailable,
    }: {
      counselorId: string;
      dayOfWeek: number;
      isAvailable: boolean;
    }) => {
      const supabase = createClientSupabaseClient();
      // Upsert on (counselor_id, day_of_week)
      const { error } = await (supabase as any)
        .from('admission_counselor_schedules')
        .upsert(
          { counselor_id: counselorId, day_of_week: dayOfWeek, is_available: isAvailable },
          { onConflict: 'counselor_id,day_of_week' }
        );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: counselorTeamKeys.all });
      toast.success('Schedule updated');
    },
    onError: (err: Error) => toast.error(err.message || 'Failed to update schedule'),
  });
}
