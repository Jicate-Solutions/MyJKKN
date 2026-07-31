'use client';

// hooks/ims/use-ims-home-route.ts
//
// Where a given user's IMS "home" is.
//
// Most people who open IMS want the dashboard. Someone whose entire job is the
// counter does not — they want the till, and making them find it every shift is
// friction repeated hundreds of times a week.
//
// WHY THE RULE IS "TILL-ONLY" AND NOT "HAS THE POS ROLE". Permissions in this app
// are a UNION across every role a user holds — the DB function says so outright
// ("Multi-role system: check all assigned roles (OR logic)"). A store admin who
// also covers the counter therefore holds the POS role too, and keying off the
// role name would drag them to the till when their actual job is running the
// store. So the question is not "can they sell?" but "is selling ALL they can do?"
//
// Derived from capabilities rather than a list of role names, so it keeps working
// when someone gains or loses a role and nobody remembers to update a hardcoded
// list.

import { usePermissions } from '@/hooks/use-permissions';
import { useImsStoresForSelect } from '@/hooks/ims/use-ims-stores';
import { useImsActiveStore } from '@/hooks/ims/use-ims-active-store';
import { useStore } from '@/hooks/use-store';

export interface ImsHomeRoute {
  /** Where to send this user when they open IMS. */
  route: string;
  /** True when selling is the only thing they can do in IMS. */
  isTillOnly: boolean;
  /** True when the ACTIVE store actually has a selling counter. */
  isPosStore: boolean;
  /**
   * The condition the user asked for: "POS + store". Both halves must hold —
   * this person only works the till, AND the store they are in is a shop.
   */
  shouldOpenTill: boolean;
  /** False while permissions or stores are still loading — do not redirect yet. */
  isReady: boolean;
}

export function useImsHomeRoute(): ImsHomeRoute {
  const { canAccess, isSuperAdmin, isLoading } = usePermissions();

  const activeStoreId = useStore(useImsActiveStore, (s) => s.storeId);
  const { data: stores, isLoading: storesLoading } = useImsStoresForSelect();

  // Unknown store → assume it IS a counter. Every store was a counter before this
  // flag existed, so guessing "not a shop" while the list loads would bounce a
  // cashier to the inventory page for a frame and then correct itself.
  const activeStore = stores?.find((s) => s.id === activeStoreId);
  const isPosStore = activeStore ? activeStore.is_pos_store !== false : true;

  const canSell = isSuperAdmin || canAccess('ims.sales', 'create');

  // Anything that amounts to RUNNING the store rather than working the counter.
  // Holding any one of these means the dashboard is the more useful home.
  const canRunStore =
    isSuperAdmin ||
    canAccess('ims.inventory', 'edit') ||
    canAccess('ims.inventory', 'create') ||
    canAccess('ims.stock', 'adjust') ||
    canAccess('ims.stock.grn', 'receive') ||
    canAccess('ims.stock.grn', 'create') ||
    canAccess('ims.transfers', 'dispatch') ||
    canAccess('ims.transfers', 'receive') ||
    canAccess('ims.indents', 'approve') ||
    canAccess('ims.settings', 'view');

  const isTillOnly = !isLoading && canSell && !canRunStore;

  // BOTH halves, which is the point. A cashier who switches to the lab store is
  // not at a counter, so sending them to a till there would offer to sell from a
  // place that has nothing to sell — and the checkout would refuse anyway.
  const shouldOpenTill = isTillOnly && isPosStore;

  return {
    route: shouldOpenTill ? '/ims/sales' : '/ims/dashboard',
    isTillOnly,
    isPosStore,
    shouldOpenTill,
    // canAccess returns false for EVERYTHING while permissions load, which would
    // read as "cannot run the store" and bounce an admin to the till for a frame.
    // Nothing may redirect until this is true.
    isReady: !isLoading && !storesLoading,
  };
}
