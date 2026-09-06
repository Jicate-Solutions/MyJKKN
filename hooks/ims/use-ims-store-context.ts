'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '@/hooks/use-store';
import { useImsActiveStore } from './use-ims-active-store';
import { useImsStore, useImsStoreByInstitution } from './use-ims-stores';
import { useImsCartStore } from '@/lib/stores/ims-cart-store';
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
  const reconciledAssignedStoreId = useStore(
    useImsActiveStore,
    (s) => s.reconciledAssignedStoreId
  );
  const setActiveStore = useImsActiveStore((s) => s.setActiveStore);
  const clearActiveStore = useImsActiveStore((s) => s.clearActiveStore);

  const queryClient = useQueryClient();
  const clearCart = useImsCartStore((s) => s.clearCart);
  const setCartStoreScope = useImsCartStore((s) => s.setStoreScope);

  // Validate the persisted storeId against the current DB. If it no longer
  // exists (e.g. stale UUID from a different Supabase project), clear it so
  // Priority 2 / Priority 3 auto-resolve fires on the next render cycle.
  const { data: persistedStoreData, isLoading: isValidatingStore } = useImsStore(
    storeId ?? ''
  );
  useEffect(() => {
    if (storeId && !isValidatingStore && !persistedStoreData) {
      clearActiveStore();
    }
  }, [storeId, isValidatingStore, persistedStoreData, clearActiveStore]);

  // A user is "store-admin-like" — i.e. eligible to see the store-picker
  // (Gate D) instead of the dead-end "No Store Assigned" (Gate C) — only when
  // they can actually MANAGE stores. Tightened 2026-04-27 from the previous
  // coarse `key.startsWith('ims')` check, which incorrectly let a sales-only
  // operator (ims.sales.create) into the picker UI. The new gate keys off
  // either the legacy `store_admin` role OR the explicit
  // `ims.settings.stores.manage` permission grant.
  //
  // Why this matters: cashiers / POS operators should be auto-assigned their
  // store via assigned_store_id (Priority 2 below); if that fails, they
  // should see Gate C ("contact administrator"), NOT a picker that exposes
  // every other institution's store.
  const isStoreAdmin =
    userProfile?.role === 'store_admin' ||
    userRoles.some(
      (r) =>
        r.role_key === 'store_admin' ||
        (r.permissions != null &&
          (r.permissions as Record<string, unknown>)['ims.settings.stores.manage'] === true)
    );

  const userInstitutionId = userProfile?.institution_id ?? null;

  // ── Priority 2: DB-assigned store (written during role allocation) ──────────
  // If the admin explicitly assigned a store to this user when granting store_admin,
  // skip the institution first-match fallback and go directly to the correct store.
  const assignedStoreId = userProfile?.assigned_store_id ?? null;
  const shouldUseAssigned = !storeId && !isSuperAdmin && !!assignedStoreId;

  // ── Priority 1.5: reconcile a NEW allocation against a persisted choice ────
  // Priority 1 (localStorage) outranks the DB assignment, so without this an
  // admin re-allocating a user's store would have no effect until that user
  // cleared their site data. We only override when the assignment differs from
  // what this browser last reconciled against — so a store admin who then
  // deliberately switches stores is not snapped back on every render.
  const needsReconcile =
    !!storeId &&
    !!assignedStoreId &&
    !isSuperAdmin &&
    storeId !== assignedStoreId &&
    reconciledAssignedStoreId !== assignedStoreId;

  const { data: assignedStore, isLoading: isAssignedLoading } = useImsStore(
    shouldUseAssigned || needsReconcile ? assignedStoreId! : ''
  );

  // Force the new allocation exactly once, then mark it reconciled.
  useEffect(() => {
    if (!needsReconcile || !assignedStore) return;

    // Store scope is changing under the user — a cart built against the old
    // store would post lines to the wrong inventory.
    clearCart();
    setCartStoreScope(assignedStore.id);
    setActiveStore(
      assignedStore.id,
      assignedStore.institution_id ?? '',
      assignedStore.name,
      assignedStoreId
    );
    queryClient.invalidateQueries({
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === 'string' && key.startsWith('ims-');
      },
    });
  }, [
    needsReconcile,
    assignedStore,
    assignedStoreId,
    setActiveStore,
    clearCart,
    setCartStoreScope,
    queryClient,
  ]);

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
        assignedStore.name,
        assignedStoreId
      );
    } else if (shouldAutoResolve && autoStore) {
      setActiveStore(
        autoStore.id,
        autoStore.institution_id ?? '',
        autoStore.name
      );
    }
  }, [
    shouldUseAssigned,
    assignedStore,
    assignedStoreId,
    shouldAutoResolve,
    autoStore,
    setActiveStore,
  ]);

  const isStoreSelected = !!storeId;

  return {
    storeId: storeId ?? null,
    institutionId: institutionId ?? userInstitutionId ?? '',
    storeName: storeName ?? null,
    isStoreSelected,
    isResolving:
      (!!storeId && isValidatingStore) ||
      ((shouldUseAssigned || needsReconcile) && isAssignedLoading) ||
      (shouldAutoResolve && isAutoResolving),
    isSuperAdmin,
    isStoreAdmin,
    userProfile,
  };
}
