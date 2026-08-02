import { redirect } from 'next/navigation';

/**
 * Payroll landing — forwards to the only page under it today.
 *
 * Next.js App Router needs a page.tsx at every directory meant to be reachable,
 * so without this /hr/payroll 404s. The hub-page-404 class has reached
 * production three times in 2026, which is why a CI gate now blocks it.
 *
 * Permissions are unaffected: RoutePermissionGuard in app/(routes)/hr/layout.tsx
 * resolves by longest prefix, so this path falls through to '/hr' → 'hr.view'
 * and the redirect target enforces the real gate
 * ('/hr/payroll/organisation' → 'hr.payroll.institution.view'). Anyone without
 * that key is stopped at the destination, not here.
 */
export default function PayrollIndex() {
  redirect('/hr/payroll/organisation');
}
