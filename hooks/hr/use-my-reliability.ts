'use client';

/**
 * A team member's own 12-week record, and the Director's earned-trust view.
 * Migration 20271007161151.
 *
 * - useMyReliability: fn_hr_my_reliability() — takes no user, filters to
 *   auth.uid() in the database, so it can only ever return the caller's own
 *   numbers.
 * - useIsTheDirector: fn_is_the_director() — the named Director list, not
 *   is_super_admin().
 * - useTrustDirectorView: only fetched when the caller is the Director; every
 *   table it reads is also RLS-limited to the Director (suggestions, switch
 *   log) or to HR desk access (readings, which carry no person). The switch
 *   shows the policy row hr.harness.trust.suggestions_enabled itself; the log
 *   only says when it last changed.
 * - useTrustSwitch / useDecideTrustSuggestion: Director-only RPCs. Neither
 *   changes a role, a permission or an approval chain.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  DutyTowerReading,
  MyReliabilityRow,
  TrustDirectorView,
  TrustSuggestion,
} from '@/types/hr-reliability';

/**
 * The browser client, untyped: the tables and functions of 20271007161151 are
 * not in types/supabase.ts until that migration is applied and types regenerate.
 */
function db(): SupabaseClient {
  return createClientSupabaseClient() as unknown as SupabaseClient;
}

/** One hr_trust_suggestions row as selected, with the embedded profile name. */
type SuggestionRow = Omit<TrustSuggestion, 'person_name'> & {
  person: { full_name: string | null } | Array<{ full_name: string | null }> | null;
};

export const MY_RELIABILITY_KEYS = {
  mine: ['hr', 'my-reliability'] as const,
  isDirector: ['hr', 'my-reliability', 'is-director'] as const,
  director: ['hr', 'my-reliability', 'director-view'] as const,
};

export function useMyReliability(enabled = true) {
  return useQuery<MyReliabilityRow[]>({
    queryKey: MY_RELIABILITY_KEYS.mine,
    enabled,
    queryFn: async () => {
      const supabase = db();
      const { data, error } = await supabase.rpc('fn_hr_my_reliability');
      if (error) throw new Error(error.message);
      return (data ?? []) as MyReliabilityRow[];
    },
  });
}

export function useIsTheDirector(enabled = true) {
  return useQuery<boolean>({
    queryKey: MY_RELIABILITY_KEYS.isDirector,
    enabled,
    queryFn: async () => {
      const supabase = db();
      const { data, error } = await supabase.rpc('fn_is_the_director');
      if (error) throw new Error(error.message);
      return data === true;
    },
  });
}

export function useTrustDirectorView(enabled: boolean) {
  return useQuery<TrustDirectorView>({
    queryKey: MY_RELIABILITY_KEYS.director,
    enabled,
    queryFn: async () => {
      const supabase = db();

      const [policyRes, logRes, sugRes, weekRes] = await Promise.all([
        supabase
          .from('platform_policies')
          .select('value')
          .eq('policy_key', 'hr.harness.trust.suggestions_enabled')
          .eq('scope_type', 'global')
          .limit(1),
        supabase.from('hr_trust_switch_log').select('turned_on, at').order('at', { ascending: false }).limit(1),
        supabase
          .from('hr_trust_suggestions')
          .select('id, user_id, duty_code, evidence, status, created_at, person:profiles!hr_trust_suggestions_user_id_fkey(full_name)')
          .eq('status', 'proposed')
          .order('created_at', { ascending: true }),
        supabase.from('hr_duty_tower_readings').select('week_start').order('week_start', { ascending: false }).limit(1),
      ]);
      if (policyRes.error) throw new Error(policyRes.error.message);
      if (logRes.error) throw new Error(logRes.error.message);
      if (sugRes.error) throw new Error(sugRes.error.message);
      if (weekRes.error) throw new Error(weekRes.error.message);

      const weekStart = (weekRes.data?.[0]?.week_start as string | undefined) ?? null;
      let readings: TrustDirectorView['readings'] = [];
      if (weekStart) {
        const { data, error } = await supabase
          .from('hr_duty_tower_readings')
          .select('duty_code, institution_id, week_start, items, on_time, late, open_overdue, reversed, on_time_rate, reversal_rate')
          .eq('week_start', weekStart)
          .order('duty_code');
        if (error) throw new Error(error.message);
        const rows = (data ?? []) as DutyTowerReading[];
        const ids = [...new Set(rows.map((r) => r.institution_id).filter((v): v is string => !!v))];
        const names = new Map<string, string>();
        if (ids.length > 0) {
          const inst = await supabase.from('institutions').select('id, name').in('id', ids);
          if (inst.error) throw new Error(inst.error.message);
          for (const i of inst.data ?? []) names.set(i.id as string, i.name as string);
        }
        readings = rows.map((r) => ({
          ...r,
          institution_name: r.institution_id ? names.get(r.institution_id) ?? null : null,
        }));
      }

      const lastLog = logRes.data?.[0] as { turned_on: boolean; at: string } | undefined;
      const suggestions: TrustSuggestion[] = ((sugRes.data ?? []) as SuggestionRow[]).map((s) => ({
        id: s.id,
        user_id: s.user_id,
        duty_code: s.duty_code,
        evidence: s.evidence ?? {},
        status: s.status,
        created_at: s.created_at,
        person_name: (Array.isArray(s.person) ? s.person[0]?.full_name : s.person?.full_name) ?? null,
      }));
      const policyRow = policyRes.data?.[0] as { value: unknown } | undefined;

      return {
        switchOn: policyRow?.value === true,
        switchChangedAt: lastLog?.at ?? null,
        suggestions,
        weekStart,
        readings,
      };
    },
  });
}

export function useTrustSwitch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { on: boolean; note?: string }) => {
      const supabase = db();
      const { error } = await supabase.rpc('fn_hr_trust_switch', { p_on: input.on, p_note: input.note ?? null });
      if (error) throw new Error(error.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: MY_RELIABILITY_KEYS.director }),
  });
}

export function useDecideTrustSuggestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: 'noted' | 'declined'; note?: string }) => {
      const supabase = db();
      const { error } = await supabase.rpc('fn_hr_trust_suggestion_decide', {
        p_id: input.id,
        p_status: input.status,
        p_note: input.note ?? null,
      });
      if (error) throw new Error(error.message);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: MY_RELIABILITY_KEYS.director }),
  });
}
