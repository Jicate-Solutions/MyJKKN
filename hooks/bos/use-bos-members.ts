import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BosMember,
  BosMemberRefreshResult,
  CreateBosMemberDto,
  UpdateBosMemberDto,
} from '@/types/bos';
import { BosMemberService } from '@/lib/services/bos/bos-member-service';
import { QUERY_CONFIG } from '@/lib/config/query-config';

export const bosMemberKeys = {
  all: ['bos-members'] as const,
  byComposition: (compositionId: string) =>
    [...bosMemberKeys.all, 'composition', compositionId] as const,
};

export function useBosMembersByComposition(compositionId: string | undefined) {
  return useQuery<BosMember[], Error>({
    queryKey: bosMemberKeys.byComposition(compositionId ?? ''),
    queryFn: () => BosMemberService.getMembers(compositionId!),
    enabled: !!compositionId,
    ...QUERY_CONFIG.SEMI_STABLE_DATA,
  });
}

export function useAddBosMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBosMemberDto) => BosMemberService.addMember(data),
    // onMutate fires the instant `.mutate()` is called — before the network
    // request. We push a placeholder row keyed by a temporary client id so
    // the list re-renders this tick. onSuccess then replaces it with the
    // server-authoritative row; onError rolls it back.
    onMutate: async (variables) => {
      const compositionId = variables.composition_id;
      const queryKey = bosMemberKeys.byComposition(compositionId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<BosMember[]>(queryKey);

      const optimisticId = `optimistic-${Date.now()}`;
      const placeholder = {
        id: optimisticId,
        composition_id: compositionId,
        institutions_id: variables.institutions_id,
        committee_id: variables.committee_id,
        member_type: variables.member_type,
        member_type_id: variables.member_type_id,
        staff_id: variables.staff_id,
        expert_id: variables.expert_id,
        display_name: variables.display_name,
        display_designation: variables.display_designation,
        display_department: variables.display_department,
        display_institution: variables.display_institution,
        email: variables.email,
        contact_no: variables.contact_no,
        is_active: variables.is_active ?? true,
        // The server appends the member (count + 1); we don't know that number
        // yet, so park the placeholder at the end rather than at 0 — otherwise
        // it visibly jumps to the top of the group and then moves.
        sort_order: variables.sort_order ?? Number.MAX_SAFE_INTEGER,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as unknown as BosMember;

      queryClient.setQueryData<BosMember[]>(queryKey, (old = []) => [
        ...old,
        placeholder,
      ]);
      return { previous, optimisticId, compositionId };
    },
    onError: (_err, _variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(
          bosMemberKeys.byComposition(context.compositionId),
          context.previous,
        );
      }
    },
    onSuccess: (newMember, variables, context) => {
      const compositionId = newMember.composition_id ?? variables.composition_id;
      const queryKey = bosMemberKeys.byComposition(compositionId);
      // Replace the optimistic placeholder with the server-confirmed row.
      queryClient.setQueryData<BosMember[]>(queryKey, (old = []) => {
        const withoutPlaceholder = context?.optimisticId
          ? old.filter((m) => m.id !== context.optimisticId)
          : old;
        if (withoutPlaceholder.some((m) => m.id === newMember.id)) {
          return withoutPlaceholder;
        }
        return [...withoutPlaceholder, newMember];
      });
      // NOTE: deliberately no invalidateQueries here. The POST response is the
      // authoritative new row and we've already written it into cache. A
      // follow-up GET adds no information and has been observed to return a
      // stale snapshot (the new row missing) — likely browser-cached or a
      // Supabase read-replica lag — which then replaces our good cache and
      // makes the just-added member visually disappear until the user hits
      // refresh. Cache will be refreshed naturally on remount via
      // `refetchOnMount: 'always'` (SEMI_STABLE_DATA) or on staleTime expiry.
    },
    // onSettled removed for the same reason as above — see onSuccess comment.
    // onError still rolls back via the onError handler defined above.
  });
}

export function useUpdateBosMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBosMemberDto }) =>
      BosMemberService.updateMember(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({
        queryKey: bosMemberKeys.byComposition(updated.composition_id),
      });
    },
  });
}

/**
 * Manual "pull the latest details from the staff / expert record" action.
 *
 * Deliberately NOT a database trigger: bos_members.display_* is a point-in-time
 * snapshot, so an Assistant Professor promoted to Associate Professor must keep
 * reading "Assistant Professor" on last year's meeting papers. The operator
 * chooses which roster adopts the new details, and when.
 *
 * Pass `memberIds` to refresh one committee's members only; omit for the whole
 * composition.
 */
export function useRefreshBosMembers() {
  const queryClient = useQueryClient();
  return useMutation<
    BosMemberRefreshResult,
    Error,
    { compositionId: string; memberIds?: string[] }
  >({
    mutationFn: ({ compositionId, memberIds }) =>
      BosMemberService.refreshMembers(compositionId, memberIds),
    onSuccess: (result, variables) => {
      // Only refetch when something actually moved — a no-op refresh shouldn't
      // churn the list.
      if (result.updated > 0) {
        queryClient.invalidateQueries({
          queryKey: bosMemberKeys.byComposition(variables.compositionId),
        });
      }
    },
  });
}

/**
 * Persist the roster order into bos_members.sort_order.
 *
 * `orderedIds` is the whole composition in render order — see
 * BosMemberService.reorderMembers.
 */
export function useReorderBosMembers() {
  const queryClient = useQueryClient();
  return useMutation<
    { updated: number; total: number },
    Error,
    { compositionId: string; orderedIds: string[] },
    // Explicit context type — onMutate's return is what onError rolls back to.
    { previous: BosMember[] | undefined; compositionId: string }
  >({
    mutationFn: ({ compositionId, orderedIds }) =>
      BosMemberService.reorderMembers(compositionId, orderedIds),
    // Optimistic: the arrows must feel instant. We rewrite sort_order in the
    // cache to the new 1..n ranks so the list re-sorts on this tick.
    onMutate: async ({ compositionId, orderedIds }) => {
      const queryKey = bosMemberKeys.byComposition(compositionId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<BosMember[]>(queryKey);
      const rankById = new Map(orderedIds.map((id, idx) => [id, idx + 1]));
      queryClient.setQueryData<BosMember[]>(queryKey, (old = []) =>
        old.map((m) =>
          rankById.has(m.id)
            ? {
                ...m,
                sort_order: rankById.get(m.id)!,
                // group_position is recomputed server-side; clearing it makes
                // the card badge fall back to its rendered index for the few
                // hundred ms until the refetch lands, so the numbers stay
                // consistent with the order on screen instead of freezing.
                group_position: undefined,
              }
            : m,
        ),
      );
      return { previous, compositionId };
    },
    onError: (_err, _variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(
          bosMemberKeys.byComposition(context.compositionId),
          context.previous,
        );
      }
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({
        queryKey: bosMemberKeys.byComposition(variables.compositionId),
      });
    },
  });
}

export function useRemoveBosMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, compositionId }: { id: string; compositionId: string }) =>
      BosMemberService.removeMember(id).then(() => ({ compositionId })),
    // onMutate runs before the DELETE is sent so the row vanishes from the
    // list on click instead of after the server responds. onError restores it
    // if the request fails. cancelQueries prevents an in-flight refetch from
    // resurrecting the row.
    onMutate: async ({ id, compositionId }) => {
      const queryKey = bosMemberKeys.byComposition(compositionId);
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<BosMember[]>(queryKey);
      queryClient.setQueryData<BosMember[]>(queryKey, (old = []) =>
        old.filter((m) => m.id !== id),
      );
      return { previous, compositionId };
    },
    onError: (_err, _variables, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(
          bosMemberKeys.byComposition(context.compositionId),
          context.previous,
        );
      }
    },
    onSettled: (_data, _err, variables) => {
      queryClient.invalidateQueries({
        queryKey: bosMemberKeys.byComposition(variables.compositionId),
      });
    },
  });
}
