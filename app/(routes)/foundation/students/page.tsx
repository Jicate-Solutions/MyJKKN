import { redirect } from 'next/navigation';

/**
 * Foundation students landing — redirects to the faculty console.
 *
 * /foundation/students has only per-student pages at [id]/page.tsx; the bare
 * URL would 404. Individual student diagnostic pages are opened from the roster
 * in the Faculty console, so the hub redirects there. Added to satisfy the Hub
 * Page Reachability gate (PR #1812), mirroring app/(routes)/faculty/page.tsx.
 */
export default function FoundationStudentsIndex() {
  redirect('/foundation/console');
}
