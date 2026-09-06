import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * /health/admin — answers with a REAL HTTP 307 to /health/admin/programs.
 *
 * Was a page.tsx calling `redirect('/health/admin/programs')`. Because
 * app/(routes)/loading.tsx wraps every page in a Suspense boundary, the
 * root shell streams before the page renders and Next cannot turn that
 * `redirect()` into an HTTP redirect — it degrades to a ~363 KB shell
 * document carrying `<meta http-equiv="refresh" content="1;url=/health/admin/programs">`:
 * a blank shell, a forced ~1 s wait, THEN the target loads as a second
 * full document. A Route Handler responds before any rendering, so the
 * browser gets a tiny 307 immediately. The proxy (auth + route permission
 * gate) still runs in front of this handler, and Next's client router
 * follows fetch redirects transparently, so sidebar
 * `<Link href="/health/admin">` navigation keeps working.
 *
 * 307 (not 308): matches the semantics of the old `redirect()` and stays
 * un-cacheable, so the landing target can change in a future deploy
 * without browsers pinning the old one. Full rationale + measurements:
 * app/(routes)/staff/route.ts (the first conversion of this class).
 *
 * Original page.tsx rationale (preserved):
 *   /health/admin — hub redirect.
 *
 *   The Wellness Programs admin lives at /health/admin/programs. Without a
 *   page.tsx at this level the bare /health/admin URL 404s (the hub-page-404
 *   class — caught by the PR-scoped reachability gate). Redirect to the only
 *   child today; expand to a hub menu if more /health/admin/* surfaces are added.
 */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/health/admin/programs', request.url), 307);
}
