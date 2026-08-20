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
// widen: a college labels teaching it receives, and the write policy scopes that
// to `role_has_institution_access(receiver_institution_id)`. Putting the write
// behind a definer function would mean re-implementing that scope inside a
// function body, which is one more place for it to be wrong.
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
// `types/supabase.ts` is generated from the LIVE catalog. `shared_teaching_labels`
// and `fn_shared_teaching_relationships` are not in it, because the migration
// that creates them is Director-gated and deliberately unapplied — so the typed
// client rejects both names. Regenerating types against a database that does not
// have the objects yet is not possible, and inventing entries by hand in a
// 110,000-line generated file is drift nobody would find later.
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
  label: SharedTeachingLabel;
}

/**
 * Set — or change — one relationship's label.
 *
 * An upsert on the relationship's unique key, so pressing the other value
 * replaces the answer instead of filing a second opinion beside the first.
 * `set_by` and `set_at` are re-stamped on every write: the question is who says
 * this NOW, not who said it first.
 */
export function useSetSharedTeachingLabel(
  institutionId: string | null | undefined
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SetSharedTeachingLabelInput) => {
      const typed = createClientSupabaseClient();
      const {
        data: { user }
      } = await typed.auth.getUser();

      const supabase = typed as unknown as UntypedSupabaseHandle;
      const { error } = await supabase
        .from('shared_teaching_labels')
        .upsert(
          {
            giver_institution_id: input.giverInstitutionId,
            receiver_institution_id: input.receiverInstitutionId,
            academic_year_id: input.academicYearId,
            label: input.label,
            set_by: user?.id ?? null,
            set_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            onConflict:
              'giver_institution_id,receiver_institution_id,academic_year_id'
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
