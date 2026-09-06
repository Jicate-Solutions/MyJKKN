import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Staff landing — issues a REAL HTTP 307 to the default page.
 *
 * This was previously a page.tsx calling `redirect('/staff/dashboard')`
 * (added in the nav-landing-pages sweep, follow-up to #348). Because
 * app/(routes)/loading.tsx wraps every page in a Suspense boundary, the
 * root shell streams before the page renders, and Next can no longer turn
 * that `redirect()` into an HTTP redirect — it degrades to a full ~363 KB
 * shell document carrying
 * `<meta http-equiv="refresh" content="1;url=/staff/dashboard">`: the
 * browser renders a blank shell, waits ~1 s, THEN starts loading
 * /staff/dashboard as a second full document. Measured live: /staff TTFB
 * 1,356 ms — worst page on the platform — plus the 1 s forced delay plus
 * a second full document. (Hoisting the redirect into generateMetadata()
 * was tried and also degrades — metadata resolves inside the stream.)
 *
 * A Route Handler responds before any rendering, so the browser gets a
 * tiny 307 immediately and goes straight to /staff/dashboard. The proxy
 * (auth + route permission gate) still runs in front of this handler, and
 * Next's client router follows fetch redirects transparently, so sidebar
 * <Link href="/staff"> navigation keeps working.
 *
 * 307 (not 308): matches the semantics of the old `redirect()` and stays
 * un-cacheable, so the landing target can change in a future deploy
 * without browsers pinning the old one.
 */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/staff/dashboard', request.url), 307);
}
