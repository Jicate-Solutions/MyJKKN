'use client';

// ============================================================================
// Reading and setting the label a college puts on teaching it receives from a
// sibling college.
//
// TWO DIFFERENT ROUTES, ON PURPOSE.
//
// READ goes through `fn_shared_teaching_relationships`, a definer function. The
// giver of a cross-campus assignment is `profiles.institution_id` of the person
// behind the plan, and that join under the caller's own RLS returns the caller's
// slice of `profiles` — so a college would be handed a shorter list than its
// real one with no way to tell a hidden row from an absent one. The same failure
// was diagnosed on this estate on 2026-08-01 for the council's collaboration
// panel, where an own-scope member read 0 cross-campus bookings against a real 78.
//
// WRITE goes straight at `shared_teaching_labels` under RLS. There is nothing to
// widen: a college writes the row carrying its OWN id in
// `labelled_by_institution_id`, and the write policy scopes exactly that. Putting
// the write behind a definer function would mean re-implementing that scope
// inside a function body, which is one more place for it to be wrong.
//
// BOTH COLLEGES ANSWER (Director decision 5, 2026-08-18). Each side holds its
// own row, so a write here can never overwrite the other college's answer, and
// the two are read back side by side.
// ============================================================================

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type {
  SharedTeachingLabel,
  SharedTeachingRelationship,
  SharedTeachingRelationshipsPayload
} from '@/lib/academic/shared-teaching-label';

// ---------------------------------------------------------------------------
// WHY THE CLIENT IS NARROWED BY HAND HERE.
//
// `types/supabase.ts` is generated from the LIVE catalog, and it carries zero
// references to `shared_teaching_labels` or `fn_shared_teaching_relationships`
// (verified 2026-08-20) — so the typed client rejects both names. The objects
// themselves DO exist on production: 20260908010000 was applied, confirmed the
// same day by calling the function and getting its own 22023 message back while
// a deliberately fake function name on the same endpoint answered PGRST202. The
// gap is that types were never regenerated afterwards, and regenerating them is
// out of scope here — hand-editing a 110,000-line generated file is drift nobody
// would find later.
//
// So the two calls that touch the new objects go through this narrow handle,
// which is the same route `sh_proposals` takes today (`BaseService.supabase` is
// `any`) — narrowed to two methods instead of a whole service. When the
// migration is applied and types are regenerated, delete this and the two casts.
// ---------------------------------------------------------------------------
interface PostgrestFailure {
  message: string;
}

interface UntypedSupabaseHandle {
  rpc(
    fn: string,
    params: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: PostgrestFailure | null }>;
  from(table: string): {
    upsert(
      values: Record<string, unknown>,
      options: { onConflict: string }
    ): PromiseLike<{ error: PostgrestFailure | null }>;
  };
}

export const sharedTeachingLabelKeys = {
  all: ['academic', 'shared-teaching-labels'] as const,
  forInstitution: (institutionId: string | null | undefined) =>
    [...sharedTeachingLabelKeys.all, institutionId ?? 'none'] as const
};

const EMPTY_PAYLOAD: SharedTeachingRelationshipsPayload = {
  relationships: [],
  hub_assignments: 0
};

/**
 * Narrow the function's jsonb into the shape the screen expects.
 *
 * Anything unrecognised becomes the empty payload rather than a partially-filled
 * one — a half-read list of relationships would invite a college to label a
 * relationship that is not the one it thinks it is looking at.
 */
function parsePayload(raw: unknown): SharedTeachingRelationshipsPayload {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return EMPTY_PAYLOAD;
  }

  const obj = raw as Record<string, unknown>;
  const rows = Array.isArray(obj.relationships)
    ? (obj.relationships as SharedTeachingRelationship[])
    : [];
  const hub =
    typeof obj.hub_assignments === 'number' ? obj.hub_assignments : 0;

  return { relationships: rows, hub_assignments: hub };
}

/**
 * Cross-campus teaching relationships this institution is part of.
 *
 * Disabled until an institution is chosen — the function refuses a NULL
 * institution with 22023, and firing a request that is certain to be refused
 * puts an error on screen that says nothing useful.
 */
export function useSharedTeachingRelationships(
  institutionId: string | null | undefined
) {
  return useQuery({
    queryKey: sharedTeachingLabelKeys.forInstitution(institutionId),
    enabled: Boolean(institutionId),
    queryFn: async (): Promise<SharedTeachingRelationshipsPayload> => {
      const supabase =
        createClientSupabaseClient() as unknown as UntypedSupabaseHandle;
      const { data, error } = await supabase.rpc(
        'fn_shared_teaching_relationships',
        { p_institution_id: institutionId }
      );

      // Surfaced, never swallowed. A refusal here is 42501 with a message
      // naming what was refused; turning it into an empty list would render as
      // "this college shares no teaching", which is a different claim.
      if (error) throw new Error(error.message);

      return parsePayload(data);
    },
    // These rows move when a plan changes, not when this page is opened.
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false
  });
}

export interface SetSharedTeachingLabelInput {
  giverInstitutionId: string;
  receiverInstitutionId: string;
  academicYearId: string;
  /** Which of the two colleges is speaking — see `labellingInstitutionIdFor`. */
  labelledByInstitutionId: string;
  label: SharedTeachingLabel;
}

/**
 * Set — or change — THIS college's answer on one relationship.
 *
 * An upsert on the per-side unique key, so pressing the other value replaces
 * this college's answer instead of filing a second opinion beside it — while
 * leaving the other college's answer untouched, which is the whole point of
 * decision 5.
 *
 * NO AUTHORSHIP IS SENT FROM HERE, deliberately (decision 1). `set_by`,
 * `set_at`, `edited_at` and `updated_at` are all stamped by
 * `fn_shared_teaching_label_stamp_author`, a BEFORE INSERT OR UPDATE trigger
 * running SECURITY INVOKER so `auth.uid()` is the real caller. This write goes
 * straight at the table through PostgREST under the `authenticated` role's
 * table-level grant, so anything this client puts in `set_by` would be accepted
 * as written — including another person's id, on a row somebody else authored.
 * The trigger overwrites it rather than rejecting it, so there is nothing for a
 * caller here to get right or wrong. Sending it anyway would be dead weight that
 * reads like it still matters.
 */
export function useSetSharedTeachingLabel(
  institutionId: string | null | undefined
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SetSharedTeachingLabelInput) => {
      const supabase =
        createClientSupabaseClient() as unknown as UntypedSupabaseHandle;
      const { error } = await supabase
        .from('shared_teaching_labels')
        .upsert(
          {
            giver_institution_id: input.giverInstitutionId,
            receiver_institution_id: input.receiverInstitutionId,
            academic_year_id: input.academicYearId,
            labelled_by_institution_id: input.labelledByInstitutionId,
            label: input.label
          },
          {
            // All FOUR columns of shared_teaching_labels_unique_side. Omitting
            // the fourth would target the old per-relationship key, which no
            // longer exists — the upsert would 42P10 rather than quietly
            // overwrite the other college's answer, but it would still fail.
            onConflict:
              'giver_institution_id,receiver_institution_id,academic_year_id,labelled_by_institution_id'
          }
        );

      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: sharedTeachingLabelKeys.forInstitution(institutionId)
      });
    }
  });
}
