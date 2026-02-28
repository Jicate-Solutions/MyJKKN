'use client';

import { useEffect } from 'react';
import { useStore } from '@/hooks/use-store';
import { useImsActiveStore } from './use-ims-active-store';
import { useImsStore, useImsStoreByInstitution } from './use-ims-stores';
import { usePermissions } from '@/hooks/use-permissions';

/**
 * Central hook that ALL IMS pages consume to get the current store scope.
 *
 * Behaviour:
 * - If a store is already persisted in Zustand (localStorage), use it.
 * - If the user is NOT a super admin and no store is selected,
 *   auto-resolve their institution's store and select it.
 * - If the user IS a super admin and no store is selected,
 *   return { isStoreSelected: false } so the UI can prompt them.
 */
export function useImsStoreContext() {
  const { isSuperAdmin, userProfile, userRoles } = usePermissions();

  // Read Zustand store via the SSR-safe hydration wrapper
  const storeId = useStore(useImsActiveStore, (s) => s.storeId);
  const institutionId = useStore(useImsActiveStore, (s) => s.institutionId);
  const storeName = useStore(useImsActiveStore, (s) => s.storeName);
  const setActiveStore = useImsActiveStore((s) => s.setActiveStore);

  // A user is treated as "store-admin-like" for IMS gate purposes if:
  // (a) their primary/legacy role is store_admin, OR
  // (b) any of their assigned roles has role_key === 'store_admin', OR
  // (c) any of their assigned roles has at least one IMS permission key
  //     (covers custom roles like pos_operator, ims_handler, etc.)
  const isStoreAdmin =
    userProfile?.role === 'store_admin' ||
    userRoles.some(
      (r) =>
        r.role_key === 'store_admin' ||
        (r.permissions != null &&
          Object.keys(r.permissions as Record<string, unknown>).some((k) =>
            k.startsWith('ims')
          ))
    );

  const userInstitutionId = userProfile?.institution_id ?? null;

  // ── Priority 2: DB-assigned store (written during role allocation) ──────────
  // If the admin explicitly assigned a store to this user when granting store_admin,
  // skip the institution first-match fallback and go directly to the correct store.
  const assignedStoreId = (userProfile?.assigned_store_id as string | null | undefined) ?? null;
  const shouldUseAssigned = !storeId && !isSuperAdmin && !!assignedStoreId;
  const { data: assignedStore, isLoading: isAssignedLoading } = useImsStore(
    shouldUseAssigned ? assignedStoreId! : ''
  );

  // ── Priority 3: Institution first-match fallback (original behaviour) ───────
  // Only fires when no explicit store assignment exists.
  // If assignedStoreId is set but the store was deleted, the user sees Gate D
  // rather than silently falling back to a different institution store.
  const shouldAutoResolve = !storeId && !isSuperAdmin && !assignedStoreId && !!userInstitutionId;
  const { data: autoStore, isLoading: isAutoResolving } = useImsStoreByInstitution(
    shouldAutoResolve ? userInstitutionId : null
  );

  // Auto-select: assigned store wins; institution fallback is second choice
  useEffect(() => {
    if (shouldUseAssigned && assignedStore) {
      setActiveStore(
        assignedStore.id,
        assignedStore.institution_id ?? '',
        assignedStore.name
      );
    } else if (shouldAutoResolve && autoStore) {
      setActiveStore(
        autoStore.id,
        autoStore.institution_id ?? '',
        autoStore.name
      );
    }
  }, [shouldUseAssigned, assignedStore, shouldAutoResolve, autoStore, setActiveStore]);

  const isStoreSelected = !!storeId;

  return {
    storeId: storeId ?? null,
    institutionId: institutionId ?? userInstitutionId ?? '',
    storeName: storeName ?? null,
    isStoreSelected,
    isResolving:
      (shouldUseAssigned && isAssignedLoading) ||
      (shouldAutoResolve && isAutoResolving),
    isSuperAdmin,
    isStoreAdmin,
    userProfile,
  };
}
