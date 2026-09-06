import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * /admin/id-cards — answers with a REAL HTTP 307 to /admin/id-cards/print-queue.
 *
 * Was a page.tsx calling `redirect('/admin/id-cards/print-queue')`. Because
 * app/(routes)/loading.tsx wraps every page in a Suspense boundary, the
 * root shell streams before the page renders and Next cannot turn that
 * `redirect()` into an HTTP redirect — it degrades to a ~363 KB shell
 * document carrying `<meta http-equiv="refresh" content="1;url=/admin/id-cards/print-queue">`:
 * a blank shell, a forced ~1 s wait, THEN the target loads as a second
 * full document. A Route Handler responds before any rendering, so the
 * browser gets a tiny 307 immediately. The proxy (auth + route permission
 * gate) still runs in front of this handler, and Next's client router
 * follows fetch redirects transparently, so sidebar
 * `<Link href="/admin/id-cards">` navigation keeps working.
 *
 * 307 (not 308): matches the semantics of the old `redirect()` and stays
 * un-cacheable, so the landing target can change in a future deploy
 * without browsers pinning the old one. Full rationale + measurements:
 * app/(routes)/staff/route.ts (the first conversion of this class).
 *
 * Original page.tsx rationale (preserved):
 *   app/(routes)/admin/id-cards/page.tsx
 *   ID Cards module hub — redirect to the print queue (the daily-driver page;
 *   its id_cards.jobs.view permission matches the sidebar entry's gate, so
 *   everyone who can see the nav item lands on a page they can use; policy is
 *   super-admin-only and reachable via its own tab).
 *   Required so /admin/id-cards itself never 404s (hub-page reachability gate).
 */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/admin/id-cards/print-queue', request.url), 307);
}
