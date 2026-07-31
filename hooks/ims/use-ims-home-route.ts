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

export interface ImsHomeRoute {
  /** Where to send this user when they open IMS. */
  route: string;
  /** True when selling is the only thing they can do in IMS. */
  isTillOnly: boolean;
  /** False while permissions are still loading — do not redirect yet. */
  isReady: boolean;
}

export function useImsHomeRoute(): ImsHomeRoute {
  const { canAccess, isSuperAdmin, isLoading } = usePermissions();

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

  return {
    route: isTillOnly ? '/ims/sales' : '/ims/dashboard',
    isTillOnly,
    // canAccess returns false for EVERYTHING while permissions load, which would
    // read as "cannot run the store" and bounce an admin to the till for a frame.
    // Nothing may redirect until this is true.
    isReady: !isLoading,
  };
}
