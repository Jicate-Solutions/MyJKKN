// lib/services/ai-pulse/policies-service.ts
// Created: 2026-05-04 — AI Pulse module v3 (Wave B.6 Policy Admin UI)
//
// Backs: app/(routes)/admin/config/ai-pulse/page.tsx
// Pairs with: ai_pulse_policies table (migration 20260502, PR #644)
// RLS:        ai_pulse_policies SELECT (active rows) — any authenticated user
//             ai_pulse_policies WRITE — super_admin only (PR #715)
//
// Pattern reference: lib/services/admin/staffing-alert-thresholds-service.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';

export interface AiPulsePolicyRow {
  id: string;
  config_key: string;
  display_name: string;
  description: string;
  value_jsonb: unknown; // typed as JSONB; coerce per data_type at consume site
  data_type: 'int' | 'float' | 'string' | 'bool' | 'time' | 'enum' | 'array' | 'jsonb';
  enum_options: string[] | null;
  min_value: number | null;
  max_value: number | null;
  locked_by_q: string | null;
  is_active: boolean;
  institution_id: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

const QUERY_KEY = ['admin', 'ai-pulse-policies'] as const;

export class AiPulsePoliciesService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /** List all 22 policy rows in display order. */
  static async listAll(): Promise<AiPulsePolicyRow[]> {
    const { data, error } = await (this.supabase as any)
      .from('ai_pulse_policies')
      .select(
        'id, config_key, display_name, description, value_jsonb, data_type, enum_options, min_value, max_value, locked_by_q, is_active, institution_id, created_at, updated_at, updated_by'
      )
      .order('config_key', { ascending: true });

    if (error) {
      console.error('[ai-pulse/policies] listAll failed:', error);
      return [];
    }
    return (data || []) as AiPulsePolicyRow[];
  }

  /** Update a single policy row's value_jsonb. Super-admin only (RLS-enforced). */
  static async updateValue(id: string, valueJsonb: unknown): Promise<void> {
    const { error } = await (this.supabase as any)
      .from('ai_pulse_policies')
      .update({
        value_jsonb: valueJsonb,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('[ai-pulse/policies] updateValue failed:', error);
      throw error;
    }
  }
}

// --- React Query hooks ---------------------------------------------------

export function useAiPulsePoliciesList() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => AiPulsePoliciesService.listAll(),
    staleTime: 30_000,
  });
}

export function useUpdateAiPulsePolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, valueJsonb }: { id: string; valueJsonb: unknown }) =>
      AiPulsePoliciesService.updateValue(id, valueJsonb),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
