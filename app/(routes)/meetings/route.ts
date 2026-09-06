import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * /meetings — answers with a REAL HTTP 307 to /meetings/inbox.
 *
 * Was a page.tsx calling `redirect('/meetings/inbox')`. Because
 * app/(routes)/loading.tsx wraps every page in a Suspense boundary, the
 * root shell streams before the page renders and Next cannot turn that
 * `redirect()` into an HTTP redirect — it degrades to a ~363 KB shell
 * document carrying `<meta http-equiv="refresh" content="1;url=/meetings/inbox">`:
 * a blank shell, a forced ~1 s wait, THEN the target loads as a second
 * full document. A Route Handler responds before any rendering, so the
 * browser gets a tiny 307 immediately. The proxy (auth + route permission
 * gate) still runs in front of this handler, and Next's client router
 * follows fetch redirects transparently, so sidebar
 * `<Link href="/meetings">` navigation keeps working.
 *
 * 307 (not 308): matches the semantics of the old `redirect()` and stays
 * un-cacheable, so the landing target can change in a future deploy
 * without browsers pinning the old one. Full rationale + measurements:
 * app/(routes)/staff/route.ts (the first conversion of this class).
 *
 * Original page.tsx rationale (preserved):
 *   /meetings has no first-class landing — redirect to the inbox view that
 *   counselors and staff actually use. Required by sidebar-health gate
 *   because lib/sidebarMenuLink.ts (commit 8b2e4d7) links the sidebar to
 *   /meetings; without this file the link 404s and the build fails.
 */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/meetings/inbox', request.url), 307);
}
