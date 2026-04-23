import { redirect } from 'next/navigation';

/**
 * Organizations landing — redirects to the default page.
 *
 * /organizations previously 404'd because no page.tsx existed at the module
 * root. Added as part of the nav-landing-pages sweep (follow-up to #348).
 */
export default function OrganizationsIndex() {
  redirect('/organizations/dashboard');
}
