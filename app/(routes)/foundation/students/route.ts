import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * /foundation/students — answers with a REAL HTTP 307 to /foundation/console.
 *
 * Was a page.tsx calling `redirect('/foundation/console')`. Because
 * app/(routes)/loading.tsx wraps every page in a Suspense boundary, the
 * root shell streams before the page renders and Next cannot turn that
 * `redirect()` into an HTTP redirect — it degrades to a ~363 KB shell
 * document carrying `<meta http-equiv="refresh" content="1;url=/foundation/console">`:
 * a blank shell, a forced ~1 s wait, THEN the target loads as a second
 * full document. A Route Handler responds before any rendering, so the
 * browser gets a tiny 307 immediately. The proxy (auth + route permission
 * gate) still runs in front of this handler, and Next's client router
 * follows fetch redirects transparently, so sidebar
 * `<Link href="/foundation/students">` navigation keeps working.
 *
 * 307 (not 308): matches the semantics of the old `redirect()` and stays
 * un-cacheable, so the landing target can change in a future deploy
 * without browsers pinning the old one. Full rationale + measurements:
 * app/(routes)/staff/route.ts (the first conversion of this class).
 *
 * Original page.tsx rationale (preserved):
 *   Foundation students landing — redirects to the faculty console.
 *
 *   /foundation/students has only per-learner pages at [id]/page.tsx; the bare
 *   URL would 404. Individual learner diagnostic pages are opened from the roster
 *   in the Faculty console, so the hub redirects there. Added to satisfy the Hub
 *   Page Reachability gate (PR #1812), mirroring app/(routes)/faculty/page.tsx.
 */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/foundation/console', request.url), 307);
}
