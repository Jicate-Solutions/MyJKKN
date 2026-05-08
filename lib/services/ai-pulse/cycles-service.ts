// ============================================================================
// AI PULSE CYCLES SERVICE — STUB.
//
// CONTEXT: Like anomaly-service.ts in the same folder, this file was missing
// when PR #732 (Champion Console — cycle management) merged on 2026-05-07.
// The Champion Console pages (`/ai-pulse/admin/cycles`) import 7 hooks + 2
// types from this module path; the file was never created.
//
// THIS STUB unblocks the build by exporting the named symbols with no-op
// runtime behavior:
//   - useAIPulseCycles → empty list, no loading, no error
//   - useAIPulseCycle → null cycle, no loading, no error
//   - useAIPulseFeaturedTools / useAIPulseHostCandidates → empty options
//   - useTriggerCycleGeneration / useCancelCycle / useUpdateCycleConfig →
//     throw on mutateAsync (Champion sees error toast, contacts AI Pulse owner)
//
// REPLACE THIS STUB with the real React Query hooks against
// ai_pulse_cycles + ai_pulse_featured_tools (PR #644 substrate).
// Permission: aiPulse:cycles.manage (PR #716).
// ============================================================================

'use client';

// ---------------------------------------------------------------------------
// Types — shape inferred from how cycle-edit-form.tsx / cycle-card.tsx use them.
// ---------------------------------------------------------------------------

export interface AIPulseCycleRow {
  id: string;
  cycle_number?: number | null;
  status: string;
  demo_date: string | null;
  featured_tool_id: string | null;
  featured_tool_name?: string | null;
  briefing_topic_id: string | null;
  briefing_topic_text: string | null;
  host_user_id: string | null;
  host_user_name?: string | null;
  meet_url: string | null;
  recording_url: string | null;
  external_judge_cycle: boolean;
  registrations_count?: number | null;
}

export interface UpdateCycleConfigInput {
  featured_tool_id: string | null;
  briefing_topic_id: string | null;
  briefing_topic_text: string | null;
  host_user_id: string | null;
  meet_url: string | null;
  recording_url: string | null;
  external_judge_cycle: boolean;
}

interface FeaturedToolOption {
  id: string;
  name: string;
}

interface HostCandidateOption {
  id: string;
  name: string;
  role_key: string | null;
}

// ---------------------------------------------------------------------------
// Read hooks — return empty/null safe defaults so consumers render graceful
// empty states. No crash, no loading spinner stuck.
// ---------------------------------------------------------------------------

interface UseAIPulseCyclesResult {
  data: AIPulseCycleRow[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: () => Promise<void>;
}

export function useAIPulseCycles(): UseAIPulseCyclesResult {
  return {
    data: [],
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: async () => {},
  };
}

interface UseAIPulseCycleResult {
  data: AIPulseCycleRow | null | undefined;
  isLoading: boolean;
  error: unknown;
  refetch: () => Promise<void>;
}

export function useAIPulseCycle(_cycleId: string): UseAIPulseCycleResult {
  return {
    data: null,
    isLoading: false,
    error: null,
    refetch: async () => {},
  };
}

export function useAIPulseFeaturedTools(): {
  data: FeaturedToolOption[] | undefined;
  isLoading: boolean;
  error: unknown;
} {
  return { data: [], isLoading: false, error: null };
}

export function useAIPulseHostCandidates(): {
  data: HostCandidateOption[] | undefined;
  isLoading: boolean;
  error: unknown;
} {
  return { data: [], isLoading: false, error: null };
}

// ---------------------------------------------------------------------------
// Mutation hooks — throw on mutateAsync so Champion sees "Failed" toast and
// the AI Pulse track owner is forced to replace the stub.
// ---------------------------------------------------------------------------

const STUB_ERROR = (op: string) =>
  new Error(
    `[cycles-service stub] ${op} not yet implemented. ` +
      'Replace lib/services/ai-pulse/cycles-service.ts with the real ' +
      'React Query mutations against ai_pulse_cycles.',
  );

export function useTriggerCycleGeneration(): {
  mutateAsync: () => Promise<void>;
  isPending: boolean;
} {
  return {
    mutateAsync: async () => {
      throw STUB_ERROR('useTriggerCycleGeneration');
    },
    isPending: false,
  };
}

export function useCancelCycle(): {
  mutateAsync: (vars: { id: string; reason?: string | null }) => Promise<void>;
  isPending: boolean;
} {
  return {
    mutateAsync: async () => {
      throw STUB_ERROR('useCancelCycle');
    },
    isPending: false,
  };
}

export function useUpdateCycleConfig(): {
  mutateAsync: (vars: { id: string; input: UpdateCycleConfigInput }) => Promise<void>;
  isPending: boolean;
} {
  return {
    mutateAsync: async () => {
      throw STUB_ERROR('useUpdateCycleConfig');
    },
    isPending: false,
  };
}
