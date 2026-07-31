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

export const LIFECYCLE_TABS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'exited', label: 'Exited' },
] as const;

export type LifecycleTabValue = (typeof LIFECYCLE_TABS)[number]['value'];

export function isLifecycleTabValue(v: unknown): v is LifecycleTabValue {
  return LIFECYCLE_TABS.some((t) => t.value === v);
}

/** Narrow a raw `status` search param to a tab value, defaulting to Active. */
export function resolveLifecycleTab(raw: unknown): LifecycleStatus {
  return (isLifecycleTabValue(raw) ? raw : 'active') as LifecycleStatus;
}
