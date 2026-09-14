import { redirect } from 'next/navigation';

/**
 * /foundation/onemark/results — hub landing for the OneMark results section.
 *
 * Next.js App Router only serves a URL that has its own page.tsx. Without this
 * file, /foundation/onemark/results 404s even though
 * /foundation/onemark/results/sources exists underneath it (the hub-page-404
 * class the "Hub Page Reachability" gate ratchets against).
 *
 * Wave 3 Lane A (#3338) owns the real results index and replaces this file
 * with it — when that lands, keep Lane A's version. Until then, source
 * analytics is the section's only screen, so this lands there. The target
 * page carries its own foundation.assessments.manage guard.
 */
export default function OneMarkResultsHubPage() {
  redirect('/foundation/onemark/results/sources');
}
