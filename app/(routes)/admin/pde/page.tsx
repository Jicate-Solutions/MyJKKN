import { redirect } from 'next/navigation';

/**
 * Admin PDE landing — redirects to the default sub-page.
 *
 * /admin/pde previously 404'd because no page.tsx existed here.
 * admin/pde has no dashboard/ child; redirects to /admin/pde/assessments
 * as the primary admin PDE workflow.
 *
 * Part of the nav-landing sweep (follow-up to #348).
 */
export default function AdminPdeIndex() {
  redirect('/admin/pde/assessments');
}
