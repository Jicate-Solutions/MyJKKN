import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * /ai-pulse/submit — answers with a REAL HTTP 307 to /ai-pulse/submit/publication.
 *
 * Was a page.tsx calling `redirect('/ai-pulse/submit/publication')`. Because
 * app/(routes)/loading.tsx wraps every page in a Suspense boundary, the
 * root shell streams before the page renders and Next cannot turn that
 * `redirect()` into an HTTP redirect — it degrades to a ~363 KB shell
 * document carrying `<meta http-equiv="refresh" content="1;url=/ai-pulse/submit/publication">`:
 * a blank shell, a forced ~1 s wait, THEN the target loads as a second
 * full document. A Route Handler responds before any rendering, so the
 * browser gets a tiny 307 immediately. The proxy (auth + route permission
 * gate) still runs in front of this handler, and Next's client router
 * follows fetch redirects transparently, so sidebar
 * `<Link href="/ai-pulse/submit">` navigation keeps working.
 *
 * 307 (not 308): matches the semantics of the old `redirect()` and stays
 * un-cacheable, so the landing target can change in a future deploy
 * without browsers pinning the old one. Full rationale + measurements:
 * app/(routes)/staff/route.ts (the first conversion of this class).
 *
 * Original page.tsx rationale (preserved):
 *   AI Pulse "Submit" segment root — no content of its own. The AutoTabNav
 *   surfaces `/ai-pulse/submit` as a chip (flat manifest render); without this
 *   page that chip 404s. Redirect to the publication submit page so the chip
 *   is functional. Per-page permission is enforced by the target.
 */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/ai-pulse/submit/publication', request.url), 307);
}
