import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * /startup-studio/school-of-influence/admin — answers with a REAL HTTP 307 to /startup-studio/school-of-influence/admin/settings.
 *
 * Was a page.tsx calling `redirect('/startup-studio/school-of-influence/admin/settings')`. Because
 * app/(routes)/loading.tsx wraps every page in a Suspense boundary, the
 * root shell streams before the page renders and Next cannot turn that
 * `redirect()` into an HTTP redirect — it degrades to a ~363 KB shell
 * document carrying `<meta http-equiv="refresh" content="1;url=/startup-studio/school-of-influence/admin/settings">`:
 * a blank shell, a forced ~1 s wait, THEN the target loads as a second
 * full document. A Route Handler responds before any rendering, so the
 * browser gets a tiny 307 immediately. The proxy (auth + route permission
 * gate) still runs in front of this handler, and Next's client router
 * follows fetch redirects transparently, so sidebar
 * `<Link href="/startup-studio/school-of-influence/admin">` navigation keeps working.
 *
 * 307 (not 308): matches the semantics of the old `redirect()` and stays
 * un-cacheable, so the landing target can change in a future deploy
 * without browsers pinning the old one. Full rationale + measurements:
 * app/(routes)/staff/route.ts (the first conversion of this class).
 *
 * Original page.tsx rationale (preserved):
 *   School of Influence admin hub. Without a page.tsx here the URL 404s — the
 *   hub-page-404 class the "Hub Page Reachability" CI gate exists to catch.
 *
 *   Settings is the only admin surface today; the applications queue (S5) and the
 *   attendance tick-list (S6) land later and may move this landing target. Kept as
 *   a plain redirect so whichever section arrives first can change one line.
 */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/startup-studio/school-of-influence/admin/settings', request.url), 307);
}
