import { redirect } from 'next/navigation';

/**
 * OKR Admin landing — redirects to the default sub-page.
 *
 * /okr/admin previously 404'd because no page.tsx existed here.
 * Redirects to /okr/admin/compliance (the only child).
 *
 * Part of the nav-landing sweep (follow-up to #348).
 */
export default function OkrAdminIndex() {
  redirect('/okr/admin/compliance');
}
