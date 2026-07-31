/**
 * Shared lifecycle-tab constants for the profiles list.
 *
 * Deliberately NOT a `'use client'` module: `page.tsx` is a Server Component
 * and calls isProfileTab() during render. Every export of a `'use client'`
 * module becomes a client reference, so a plain function exported from
 * profiles-status-tabs.tsx would arrive on the server as an uncallable stub
 * ("Attempted to call isProfileTab() from the server").
 *
 * Both the server page and the client tab bar import from here.
 */

export const PROFILE_TABS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'exited', label: 'Exited' }
] as const;

export type ProfileTab = (typeof PROFILE_TABS)[number]['value'];

export function isProfileTab(value: unknown): value is ProfileTab {
  return PROFILE_TABS.some((tab) => tab.value === value);
}
