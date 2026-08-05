import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * /ai-pulse/admin — answers with a REAL HTTP 307 to /ai-pulse/admin/cycles.
 *
 * Was a page.tsx calling `redirect('/ai-pulse/admin/cycles')`. Because
 * app/(routes)/loading.tsx wraps every page in a Suspense boundary, the
 * root shell streams before the page renders and Next cannot turn that
 * `redirect()` into an HTTP redirect — it degrades to a ~363 KB shell
 * document carrying `<meta http-equiv="refresh" content="1;url=/ai-pulse/admin/cycles">`:
 * a blank shell, a forced ~1 s wait, THEN the target loads as a second
 * full document. A Route Handler responds before any rendering, so the
 * browser gets a tiny 307 immediately. The proxy (auth + route permission
 * gate) still runs in front of this handler, and Next's client router
 * follows fetch redirects transparently, so sidebar
 * `<Link href="/ai-pulse/admin">` navigation keeps working.
 *
 * 307 (not 308): matches the semantics of the old `redirect()` and stays
 * un-cacheable, so the landing target can change in a future deploy
 * without browsers pinning the old one. Full rationale + measurements:
 * app/(routes)/staff/route.ts (the first conversion of this class).
 *
 * Original page.tsx rationale (preserved):
 *   AI Pulse "Admin" segment root — no content of its own. The AutoTabNav
 *   surfaces `/ai-pulse/admin` as a chip (flat manifest render); without this
 *   page that chip 404s. Redirect to the first admin sub-page so the chip is
 *   functional. Per-page permission is enforced by the target (cycles console).
 */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/ai-pulse/admin/cycles', request.url), 307);
}
