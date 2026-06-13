import { redirect } from 'next/navigation';

/**
 * Faculty PDE landing — redirects to the default sub-page.
 *
 * /pde/faculty previously 404'd because no page.tsx existed here.
 * Redirects to the PDE dashboard as the default landing.
 *
 * Part of the nav-landing sweep (follow-up to #348).
 */
export default function FacultyPdeIndex() {
  redirect('/pde/faculty/dashboard');
}
