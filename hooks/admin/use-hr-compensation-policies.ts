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
import type { PayLadder } from '@/types/hr-pay-ladders';
import type { Json } from '@/types/supabase';

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

// Pay-scale editor only: the two seeded colleges plus Arts & Science, whose
// (empty) hr.pay_scales row is created by
// migrations/20271008200100_hr_pay_scales_arts_science_reference_row.sql.
// COMPENSATION_INSTITUTIONS is left unchanged because the allowances and
// motivation-fund editors use it and Arts & Science has no rows for those keys.
export const PAY_SCALE_INSTITUTIONS = [
  {
    id: '5de4fba1-4564-41ed-8c73-5d948b74b843',
    label: 'JKKN Engineering',
  },
  {
    id: 'e8fbe8aa-c44e-41aa-a44b-39dab2c8b9a5',
    label: 'JKKN Dental',
  },
  {
    id: 'b0b8a724-7c65-4f07-8047-2a38e8100ad5',
    label: 'JKKN Arts & Science (Self)',
  },
] as const;

export type PayScaleInstitutionId =
  (typeof PAY_SCALE_INSTITUTIONS)[number]['id'];

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
  /**
   * Year ladders (salary per year / step of service). REFERENCE ONLY —
   * nothing writes a salary from these. A college with no pay_matrix at all
   * reads its advisory band from them (Pay Band Check, salary suggestion,
   * raise warning; each labelled). Optional and additive: rows saved before
   * ladders existed simply do not carry the key.
   */
  ladders?: PayLadder[];
  /** Plain-English notes shown alongside the ladders. */
  ladder_notes?: string[];
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

/**
 * An UPDATE that matches no row is not an error to PostgREST — it returns an
 * empty array, and the screen used to say "Policy saved" while nothing was
 * stored (e.g. a college that has no hr.pay_scales row yet). Treat zero
 * affected rows as a failure. Pure so it can be unit-tested without React.
 */
export const NO_POLICY_ROW_MESSAGE =
  'No policy row exists for this college yet, so nothing was saved. Ask an administrator to create it.';

export function assertPolicyRowUpdated(rows: unknown[] | null | undefined): void {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error(NO_POLICY_ROW_MESSAGE);
  }
}

/**
 * Two people can have the same college's row open. Without a check the second
 * Save silently replaced the first one's work. When the screen passes the
 * `updated_at` it loaded, the UPDATE only matches while the row still carries
 * it; a row changed by someone else since then matches nothing and the save is
 * refused with this message instead.
 */
export const STALE_POLICY_MESSAGE =
  'Someone else just changed the pay scales. Reload and try again; nothing you entered here was saved.';

/**
 * A locked save that matched no row, where the row is still exactly as the
 * screen loaded it: the database refused the write for this account (only a
 * super administrator may change a pay row), not someone else's save.
 */
export const NOT_ALLOWED_POLICY_MESSAGE =
  'This account cannot save the pay scales (only a super administrator can). Nothing was saved.';

/** The saved row could not be re-read after a refused save, so the cause is unknown. */
export const NOT_SAVED_UNKNOWN_MESSAGE =
  'Nothing was saved, and the saved row could not be re-read to say why. Reload and try again.';

type BrowserSupabaseClient = ReturnType<typeof createClientSupabaseClient>;

/** What is saved now for one college's row: whether it exists, and its updated_at. */
export type SavedPolicyRow = { exists: boolean; updatedAt: string | null };

/**
 * Re-read one row through the same server route the screen loads it from (the
 * pay rows are not readable from the browser directly; see useCompensationPolicy).
 */
async function readSavedPolicyRow(
  policyKey: CompensationPolicyKey,
  institutionId: string
): Promise<SavedPolicyRow> {
  const params = new URLSearchParams({ key: policyKey, institutionId });
  const res = await fetch(`/api/hr/compensation-policies?${params.toString()}`);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const body = await res.json();
  const row = (body?.row ?? null) as { updated_at?: string | null } | null;
  return { exists: !!row, updatedAt: row?.updated_at ?? null };
}

function sameInstant(a: string | null, b: string | null): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  const ta = Date.parse(a);
  return Number.isFinite(ta) && ta === Date.parse(b);
}

/**
 * Write one institution-scoped policy row. `expectedUpdatedAt` is the
 * `updated_at` the screen loaded: when given (string, or null for a row that
 * never had one), the write only lands if the row still carries it. Leave it
 * undefined to write unconditionally. Returns the row's new `updated_at`.
 *
 * A locked write that matches nothing is not assumed to be someone else's
 * save: the row is re-read, and the refusal says which it was. Changed since
 * loading: STALE. Gone: no row. Unchanged: the database refused this account
 * (RLS filters a refused UPDATE to zero rows, with no error).
 */
export async function updatePolicyRow(
  supabase: BrowserSupabaseClient,
  policyKey: CompensationPolicyKey,
  institutionId: string,
  value: unknown,
  expectedUpdatedAt?: string | null,
  readSaved: (key: CompensationPolicyKey, institutionId: string) => Promise<SavedPolicyRow> = readSavedPolicyRow
): Promise<string | null> {
  let query = supabase
    .from(PLATFORM_POLICIES_TABLE)
    .update({
      value: value as Json,
      updated_at: new Date().toISOString(),
    })
    .eq('policy_key', policyKey)
    .eq('scope_type', 'institution')
    .eq('scope_id', institutionId);
  if (expectedUpdatedAt !== undefined) {
    query =
      expectedUpdatedAt === null
        ? query.is('updated_at', null)
        : query.eq('updated_at', expectedUpdatedAt);
  }
  const { data, error } = await query.select('policy_key, updated_at');
  if (error) throw new Error(error.message);
  if (expectedUpdatedAt !== undefined && (!Array.isArray(data) || data.length === 0)) {
    let saved: SavedPolicyRow;
    try {
      saved = await readSaved(policyKey, institutionId);
    } catch {
      throw new Error(NOT_SAVED_UNKNOWN_MESSAGE);
    }
    if (!saved.exists) throw new Error(NO_POLICY_ROW_MESSAGE);
    if (!sameInstant(saved.updatedAt, expectedUpdatedAt)) throw new Error(STALE_POLICY_MESSAGE);
    throw new Error(NOT_ALLOWED_POLICY_MESSAGE);
  }
  assertPolicyRowUpdated(data);
  return (data[0] as { updated_at: string | null }).updated_at ?? null;
}

// ---------------------------------------------------------------------------
// Generic typed reader + writer for an institution-scoped policy row
// ---------------------------------------------------------------------------

/**
 * The READ goes through GET /api/hr/compensation-policies, which checks
 * hr.payroll.salary.view on the server. It used to query platform_policies from
 * the browser; migration 20270506090000 restricts the pay rows at the database,
 * and __tests__/hr/pay-policies-server-only-guard.test.ts fails if this file
 * goes back to reading them directly. A refusal surfaces as the route's error
 * message, never as an empty matrix.
 */
export function useCompensationPolicy<T>(
  policyKey: CompensationPolicyKey,
  institutionId: string
) {
  return useQuery({
    queryKey: hrCompensationPolicyKeys.byKey(policyKey, institutionId),
    queryFn: async () => {
      const params = new URLSearchParams({ key: policyKey, institutionId });
      const res = await fetch(`/api/hr/compensation-policies?${params.toString()}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      const row = (body?.row ?? null) as RawPolicyRow<unknown> | null;
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
  institutionId: string,
  /**
   * The `updated_at` of the row the screen is editing (from
   * useCompensationPolicy). When given, a save is refused if someone else has
   * changed the row since (STALE_POLICY_MESSAGE). Omit to save unconditionally.
   */
  lock?: { expectedUpdatedAt: string | null }
) {
  const supabase = createClientSupabaseClient();
  const queryClient = useQueryClient();
  const queryKey = hrCompensationPolicyKeys.byKey(policyKey, institutionId);

  return useMutation({
    mutationFn: async (value: T) => {
      const updatedAt = await updatePolicyRow(
        supabase,
        policyKey,
        institutionId,
        value,
        lock?.expectedUpdatedAt
      );
      return { value, updatedAt };
    },
    onSuccess: ({ value, updatedAt }) => {
      toast.success('Policy saved');
      // Carry the new updated_at straight away, so a second Save before the
      // refetch lands is not refused as someone else's change.
      queryClient.setQueryData(queryKey, (prev: unknown) =>
        prev && typeof prev === 'object' ? { ...prev, value, updatedAt } : prev
      );
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Failed to save policy');
    },
  });
}
