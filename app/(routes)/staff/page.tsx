import { redirect } from 'next/navigation';

/**
 * Staff landing — redirects to the default page.
 *
 * /staff previously 404'd because no page.tsx existed at the module
 * root. Added as part of the nav-landing-pages sweep (follow-up to #348).
 */
export default function StaffIndex() {
  redirect('/staff/dashboard');
}
