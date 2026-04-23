import { redirect } from 'next/navigation';

/**
 * Solutions Settings landing — redirects to the default sub-page.
 *
 * /solutions/settings previously 404'd because no page.tsx existed here.
 * Redirects to /solutions/settings/types (the only child).
 *
 * Part of the nav-landing sweep (follow-up to #348).
 */
export default function SolutionsSettingsIndex() {
  redirect('/solutions/settings/types');
}
