import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * /foundation/onemark/results/learner — a real HTTP 307 to the results index.
 *
 * WHY IT EXISTS. `learner/[studentId]/page.tsx` makes
 * /foundation/onemark/results/learner/<uuid> a routable URL, which makes the
 * parent a routable URL too — and Next.js App Router 404s a directory that has
 * a page.tsx somewhere below it but nothing of its own. That is the hub-404 class
 * `Hub Page Reachability (PR-scoped)` ratchets, and this PR introduced a NEW
 * instance of it: run with the gate's own audit script, base 45 missing hubs,
 * head 46, the single new one being this directory. Draft status was hiding it;
 * the check would have failed the moment the PR was marked Ready.
 *
 * A ROUTE HANDLER, NOT A page.tsx, ON PURPOSE — two reasons:
 *   1. The workflow names this exact remedy ("A Route Handler exporting GET
 *      also serves the URL … redirect-only landings use route.ts because a
 *      page-body redirect() degrades under the (routes) Suspense boundary" —
 *      the measurement is in app/(routes)/staff/route.ts).
 *   2. `check-nav-reachability.ts` walks page.tsx files, so a hub PAGE here
 *      would have consumed a second slot of the shared, oversubscribed
 *      max-unreachable=58 budget that this PR already spends one of.
 *
 * A report is per learner AND per subject, so a bare /learner has no content of
 * its own; the index is where a name is picked. This is a URL with nothing to
 * show, not a refused permission — CLAUDE.md #27's "never a silent redirect"
 * governs the access failures, which the API answers with an explicit 403.
 */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/foundation/onemark/results', request.url), 307);
}
