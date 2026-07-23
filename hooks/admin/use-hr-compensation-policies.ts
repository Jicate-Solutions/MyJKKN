'use client';
// hooks/admin/use-hr-compensation-policies.ts
//
// React Query wrapper for the 3 institution-scoped compensation platform_policies
// rows seeded by migrations/20260605_hr_compensation_seeds.sql (Wave 3 — M4):
//
//   1. hr.pay_scales                  (per institution)
//   2. hr.allowances_and_increments   (per institution)
//   3. hr.motivation_fund             (per institution)
//
// Director's framing (memory: reference_platform_policies_director_view_pattern.md):
//   3 layers — (1) platform_policies row, (2) fn_get_policy_* reader, (3) admin UI.
//   This file is layer 3's data adapter. UIs render English consequences.
//
// W3-M0 substrate (`classification`, `draft_value`, `publication_state` columns)
// is shipped by a sibling agent in parallel — this hook does NOT depend on those
// columns. Once M0 lands, a follow-up can wire draft/publish flow through here.

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { createClientSupabaseClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Canonical institution IDs (mirrors internship + telephony seeds).
// Engineering + Dental are the two seeded institutions for W3-M4.
// ---------------------------------------------------------------------------

export const COMPENSATION_INSTITUTIONS = [
  {
    id: '5de4fba1-4564-41ed-8c73-5d948b74b843',
    label: 'JKKN Engineering',
  },
  {
    id: 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5',
    label: 'JKKN Dental',
  },
] as const;

export type CompensationInstitutionId =
  (typeof COMPENSATION_INSTITUTIONS)[number]['id'];

// ---------------------------------------------------------------------------
// Policy keys
// ---------------------------------------------------------------------------

export const HR_COMPENSATION_KEYS = {
  PAY_SCALES: 'hr.pay_scales',
  ALLOWANCES_AND_INCREMENTS: 'hr.allowances_and_increments',
  MOTIVATION_FUND: 'hr.motivation_fund',
} as const;

export type CompensationPolicyKey =
  (typeof HR_COMPENSATION_KEYS)[keyof typeof HR_COMPENSATION_KEYS];

const PLATFORM_POLICIES_TABLE = 'platform_policies' as const;

// ---------------------------------------------------------------------------
// JSONB payload shapes — typed mirrors of spec §10 / §11 / §16
// ---------------------------------------------------------------------------

export interface PayMatrixRow {
  designation: string;
  qualification: string | null;
  basic_pay: number;
}

export interface PayScalesValue {
  pay_matrix: PayMatrixRow[];
  overrides: {
    net_set_basic: number | null;
  };
  fixation_basis: string[];
  selection_committee_authority: boolean;
  higher_pay_package_approver: string;
}

export interface AllowancesAndIncrementsValue {
  allowances: {
    hod: number | null;
    other_per_designation: Record<string, number>;
  };
  allowance_aicte_university_government_aligned: boolean;
  allowance_governing_body_decision_authority: boolean;
  increments: {
    annual_window_months: number;
    approver_default: string;
    approver_for_principal: string[];
    satisfactory_performance_required: boolean;
    head_of_dept_recommendation_required: boolean;
    withholding_triggers: string[];
  };
  yearly_increment_factors: string[];
  discretion: string;
}

export interface MotivationFundValue {
  epf: {
    employee_contribution_pct: number;
    employer_contribution_pct: number;
    deposit_to_govt_dept_timely: boolean;
  };
  awards: {
    categories: string[];
    variables: string[];
    forms: string[];
    top_ranks_at_university_level: boolean;
  };
  consultancy: {
    problems_referred_by: string[];
    uses_faculty_expertise_and_infra: boolean;
  };
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const hrCompensationPolicyKeys = {
  all: ['admin-hr-compensation-policies'] as const,
  byKey: (policyKey: CompensationPolicyKey, institutionId: string) =>
    [...hrCompensationPolicyKeys.all, policyKey, institutionId] as const,
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface RawPolicyRow<T> {
  policy_key: string;
  value: T;
  description: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

function unwrapValue<T>(v: unknown): T | null {
  if (v == null) return null;
  // Some seed shapes wrap as {value: {...}}; unwrap once if so.
  if (
    typeof v === 'object' &&
    v !== null &&
    'value' in v &&
    (v as { value?: unknown }).value &&
    typeof (v as { value: unknown }).value === 'object'
  ) {
    return (v as { value: T }).value;
  }
  return v as T;
}

// ---------------------------------------------------------------------------
// Generic typed reader + writer for an institution-scoped policy row
// ---------------------------------------------------------------------------

export function useCompensationPolicy<T>(
  policyKey: CompensationPolicyKey,
  institutionId: string
) {
  const supabase = createClientSupabaseClient();
  return useQuery({
    queryKey: hrCompensationPolicyKeys.byKey(policyKey, institutionId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from(PLATFORM_POLICIES_TABLE)
        .select('policy_key, value, description, updated_at, updated_by')
        .eq('policy_key', policyKey)
        .eq('scope_type', 'institution')
        .eq('scope_id', institutionId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const row = data as RawPolicyRow<unknown> | null;
      return {
        exists: !!row,
        value: row ? unwrapValue<T>(row.value) : null,
        description: row?.description ?? null,
        updatedAt: row?.updated_at ?? null,
      };
    },
    staleTime: 30 * 1000,
  });
}

export function useUpdateCompensationPolicy<T>(
  policyKey: CompensationPolicyKey,
  institutionId: string
) {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (value: T) => {
      const { error } = await supabase
        .from(PLATFORM_POLICIES_TABLE)
        .update({
          value: value as unknown as object,
          updated_at: new Date().toISOString(),
        })
        .eq('policy_key', policyKey)
        .eq('scope_type', 'institution')
        .eq('scope_id', institutionId);
      if (error) throw new Error(error.message);
      return value;
    },
    onSuccess: () => {
      toast.success('Policy saved');
      queryClient.invalidateQueries({
        queryKey: hrCompensationPolicyKeys.byKey(policyKey, institutionId),
      });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to save policy');
    },
  });
}
