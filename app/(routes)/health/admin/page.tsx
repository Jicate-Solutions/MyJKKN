import { redirect } from 'next/navigation';

/**
 * /health/admin — hub redirect.
 *
 * The Wellness Programs admin lives at /health/admin/programs. Without a
 * page.tsx at this level the bare /health/admin URL 404s (the hub-page-404
 * class — caught by the PR-scoped reachability gate). Redirect to the only
 * child today; expand to a hub menu if more /health/admin/* surfaces are added.
 */
export default function HealthAdminIndex() {
  redirect('/health/admin/programs');
}
