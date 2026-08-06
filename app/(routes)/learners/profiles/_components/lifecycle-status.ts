/**
 * Lifecycle tab values shared by the server page and the client tab bar.
 *
 * Deliberately NOT in `lifecycle-tabs.tsx`: that file is 'use client', and every
 * export of a 'use client' module becomes a client REFERENCE. The server
 * component can render such a module's components, but calling a plain function
 * from one throws "Attempted to call resolveLifecycleTab() from the server".
 * Pure helpers therefore have to live in a module with no 'use client'.
 */

import type { LifecycleStatus } from '@/types/learner-profile';

/**
 * `all` is deliberately FIRST and is NOT a lifecycle_status enum value.
 *
 * The three status tabs only cover active / inactive / exited, but
 * learners_profiles.lifecycle_status has fifteen labels. Every learner in the
 * other twelve (graduated, reserved, admitted, enquiry_submitted, account,
 * rejected, …) was unreachable from this page: the server ANDs
 * `lifecycle_status = <tab>` into the query, so filtering by
 * institution/degree/department/programme for, say, a graduated learner
 * returned "No results" with no way to switch the predicate off. That was 2,632
 * of 7,183 rows on production.
 */
export const LIFECYCLE_TABS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'exited', label: 'Exited' },
] as const;

export type LifecycleTabValue = (typeof LIFECYCLE_TABS)[number]['value'];

export function isLifecycleTabValue(v: unknown): v is LifecycleTabValue {
  return LIFECYCLE_TABS.some((t) => t.value === v);
}

/** Narrow a raw `status` search param to a tab value, defaulting to Active. */
export function resolveLifecycleTab(raw: unknown): LifecycleTabValue {
  return isLifecycleTabValue(raw) ? raw : 'active';
}

/**
 * The lifecycle_status predicate for a tab, or undefined for "no predicate".
 *
 * MUST be used instead of casting the tab value: 'all' is not a member of the
 * lifecycle_status enum, and `.eq('lifecycle_status', 'all')` raises 22P02 —
 * which getLearnerProfiles catches and turns into an empty table, i.e. exactly
 * the silent failure this tab exists to remove.
 */
export function lifecycleFilterForTab(
  tab: LifecycleTabValue
): LifecycleStatus | undefined {
  return tab === 'all' ? undefined : (tab as LifecycleStatus);
}
