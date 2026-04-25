import { redirect } from 'next/navigation';

/**
 * Admin LTI landing — redirects to the default sub-page.
 *
 * /admin/lti previously 404'd because no page.tsx existed here.
 * Redirects to /admin/lti/launches as the primary LTI workflow.
 *
 * Part of the nav-landing sweep (follow-up to #348).
 */
export default function AdminLtiIndex() {
  redirect('/admin/lti/launches');
}
