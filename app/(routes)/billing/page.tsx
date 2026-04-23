import { redirect } from 'next/navigation';

/**
 * Billing landing — redirects to the default page.
 *
 * /billing previously 404'd because no page.tsx existed at the module
 * root. Added as part of the nav-landing-pages sweep (follow-up to #348).
 */
export default function BillingIndex() {
  redirect('/billing/invoices');
}
