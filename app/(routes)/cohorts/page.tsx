import { redirect } from 'next/navigation';

/**
 * /cohorts — hub landing for the Cohorts section.
 *
 * Next.js App Router only serves a URL that has its own page.tsx. Without this
 * file, /cohorts 404s even though /cohorts/coordinators exists underneath it
 * (the hub-page-404 class the "Hub Page Reachability" gate ratchets against).
 * Coordinators is the section's first and only screen, so this lands there.
 * The target page carries its own super-administrator guard.
 */
export default function CohortsHubPage() {
  redirect('/cohorts/coordinators');
}
