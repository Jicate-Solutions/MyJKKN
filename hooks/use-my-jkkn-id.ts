/**
 * The SIGNED-IN person's own permanent JKKN ID, from one shared cache entry.
 *
 * Every global "show my QR" affordance (the mobile bottom-nav handle, the
 * desktop profile menu) resolves through THIS key, so the number is fetched
 * once per session window no matter how many of those surfaces are mounted.
 *
 * Backed by fn_jkkn_id_of (kind = 'profile'), which is open to every
 * authenticated user by design — the number is card-printed and non-secret,
 * and here the caller is asking only for their own.
 *
 * Fail-soft by contract: the service returns null on any RPC error, and every
 * consumer renders nothing when the value is null. Chrome must never break
 * because the identity register hiccupped.
 */
import { useQuery } from '@tanstack/react-query';
import { JkknIdentityService } from '@/lib/services/users/jkkn-identity-service';

/** A permanent number does not change — hold it for the whole session. */
export const MY_JKKN_ID_STALE_TIME = 60 * 60 * 1000;
export const MY_JKKN_ID_GC_TIME = 2 * 60 * 60 * 1000;

export const myJkknIdQueryKey = (userId: string) =>
  ['my-jkkn-id', userId] as const;

/**
 * @param userId profiles.id of the signed-in user (undefined while auth loads).
 */
export function useMyJkknId(userId: string | undefined) {
  return useQuery({
    queryKey: myJkknIdQueryKey(userId ?? ''),
    queryFn: (): Promise<string | null> =>
      JkknIdentityService.getIdOf('profile', userId as string),
    enabled: !!userId,
    staleTime: MY_JKKN_ID_STALE_TIME,
    gcTime: MY_JKKN_ID_GC_TIME,
    // The register is not a live feed; refetching on every window focus would
    // re-ask for a number that cannot have changed.
    refetchOnWindowFocus: false,
    retry: false
  });
}
