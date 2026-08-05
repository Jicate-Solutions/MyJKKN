import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * /hr/leave — answers with a REAL HTTP 307 to /hr/leave/requests.
 *
 * Was a page.tsx calling `redirect('/hr/leave/requests')`. Because
 * app/(routes)/loading.tsx wraps every page in a Suspense boundary, the
 * root shell streams before the page renders and Next cannot turn that
 * `redirect()` into an HTTP redirect — it degrades to a ~363 KB shell
 * document carrying `<meta http-equiv="refresh" content="1;url=/hr/leave/requests">`:
 * a blank shell, a forced ~1 s wait, THEN the target loads as a second
 * full document. A Route Handler responds before any rendering, so the
 * browser gets a tiny 307 immediately. The proxy (auth + route permission
 * gate) still runs in front of this handler, and Next's client router
 * follows fetch redirects transparently, so sidebar
 * `<Link href="/hr/leave">` navigation keeps working.
 *
 * 307 (not 308): matches the semantics of the old `redirect()` and stays
 * un-cacheable, so the landing target can change in a future deploy
 * without browsers pinning the old one. Full rationale + measurements:
 * app/(routes)/staff/route.ts (the first conversion of this class).
 *
 * Original page.tsx rationale (preserved):
 *   The hub of six tiles is superseded by the Time Off workspace, where Leave,
 *   Compensatory Off, Short Time Off and Approvals are tabs on one surface.
 *   Calendar and Encashment remain their own routes and are reachable from the
 *   HR nav.
 */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/hr/leave/requests', request.url), 307);
}
