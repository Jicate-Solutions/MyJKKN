import { redirect } from 'next/navigation';

/**
 * Billing Payment landing — redirects to the default sub-page.
 *
 * /billing/payment previously 404'd because no page.tsx existed here.
 * payment/ only holds success/failed callback pages, so we redirect to
 * /billing/invoices as the safe default entry point.
 *
 * Part of the nav-landing sweep (follow-up to #348).
 */
export default function BillingPaymentIndex() {
  redirect('/billing/invoices');
}
