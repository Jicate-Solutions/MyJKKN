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
/**
 * 2026-08-10: `reserved` and `admitted` promoted to first-class tabs.
 *
 * They were always reachable through "All Statuses", but only if you knew to
 * look — and 994 learners live in those two statuses (870 reserved, 124
 * admitted), the entire pre-enrolment pipeline. They sit BEFORE Active because
 * that is their order in the lifecycle: account → reserved → admitted → active.
 *
 * The default tab is still Active (see `resolveLifecycleTab`), so no existing
 * bookmark or workflow changes behaviour.
 */
export const LIFECYCLE_TABS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'reserved', label: 'Reserved' },
  { value: 'admitted', label: 'Admitted' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'exited', label: 'Exited' },
] as const;

export type LifecycleTabValue = (typeof LIFECYCLE_TABS)[number]['value'];

/**
 * The lifecycle statuses this page is allowed to list.
 *
 * 2026-08-11: "All Statuses" stopped meaning "no predicate at all".
 *
 * It used to omit the lifecycle_status filter entirely, so the tab returned
 * every label in the enum — 1,670 of 7,216 production rows were graduated
 * (1,106), enquiry_submitted (367), account (84), rejected (54), enquiry (52),
 * approved, withdrawal_pending and waitlisted learners. None of those belong on
 * an enrolled-learner roster, and each already has its own module:
 * /learners/enquiries, /learners/onboarding, /learners/alumni, /admission.
 *
 * DERIVED from LIFECYCLE_TABS rather than re-listed, so the two can never
 * drift: "All Statuses" is by construction the union of the other tabs. Add a
 * tab and it is included automatically.
 */
export const LIFECYCLE_TAB_STATUSES = LIFECYCLE_TABS.map((t) => t.value).filter(
  (v) => v !== 'all'
) as LifecycleStatus[];

export function isLifecycleTabValue(v: unknown): v is LifecycleTabValue {
  return LIFECYCLE_TABS.some((t) => t.value === v);
}

/** Narrow a raw `status` search param to a tab value, defaulting to Active. */
export function resolveLifecycleTab(raw: unknown): LifecycleTabValue {
  return isLifecycleTabValue(raw) ? raw : 'active';
}

/**
 * The lifecycle_status predicate for a tab.
 *
 * Returns ONE status for a status tab and the whole allowed SET for 'all', so
 * callers must handle both — `.eq()` for a string, `.in()` for an array.
 * Never returns undefined: this page always constrains lifecycle_status, which
 * is what keeps graduated / enquiry / rejected learners off it.
 *
 * MUST be used instead of casting the tab value: 'all' is not a member of the
 * lifecycle_status enum, and `.eq('lifecycle_status', 'all')` raises 22P02 —
 * which getLearnerProfiles catches and turns into an empty table, i.e. exactly
 * the silent failure this tab exists to remove.
 */
export function lifecycleFilterForTab(
  tab: LifecycleTabValue
): LifecycleStatus | LifecycleStatus[] {
  return tab === 'all' ? LIFECYCLE_TAB_STATUSES : (tab as LifecycleStatus);
}
