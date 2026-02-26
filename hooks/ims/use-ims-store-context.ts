'use client';

import { useEffect } from 'react';
import { useStore } from '@/hooks/use-store';
import { useImsActiveStore } from './use-ims-active-store';
import { useImsStoreByInstitution } from './use-ims-stores';
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

  // store_admin is an IMS-level administrator — treated like super_admin for gate purposes
  // Check BOTH profiles.role (primary) AND user_roles array (secondary assignments).
  // A student whose primary role is 'student' but has store_admin as a secondary role
  // should still be recognised as a store admin for IMS gate purposes.
  const isStoreAdmin =
    userProfile?.role === 'store_admin' ||
    userRoles.some((r) => r.role_key === 'store_admin');

  // For non-super-admins (including store_admin): auto-resolve their institution's store
  const userInstitutionId = userProfile?.institution_id ?? null;
  const shouldAutoResolve = !storeId && !isSuperAdmin && !!userInstitutionId;
  const { data: autoStore, isLoading: isAutoResolving } = useImsStoreByInstitution(
    shouldAutoResolve ? userInstitutionId : null
  );

  // Auto-select the resolved store for regular users and store_admins
  useEffect(() => {
    if (shouldAutoResolve && autoStore) {
      setActiveStore(
        autoStore.id,
        autoStore.institution_id ?? '',
        autoStore.name
      );
    }
  }, [shouldAutoResolve, autoStore, setActiveStore]);

  const isStoreSelected = !!storeId;

  return {
    storeId: storeId ?? null,
    institutionId: institutionId ?? userInstitutionId ?? '',
    storeName: storeName ?? null,
    isStoreSelected,
    isResolving: shouldAutoResolve && isAutoResolving,
    isSuperAdmin,
    isStoreAdmin,
    userProfile,
  };
}
