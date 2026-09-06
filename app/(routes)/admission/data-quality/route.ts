import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * /admission/data-quality — answers with a REAL HTTP 307 to /admission/data-quality/data-profiling.
 *
 * Was a page.tsx calling `redirect('/admission/data-quality/data-profiling')`. Because
 * app/(routes)/loading.tsx wraps every page in a Suspense boundary, the
 * root shell streams before the page renders and Next cannot turn that
 * `redirect()` into an HTTP redirect — it degrades to a ~363 KB shell
 * document carrying `<meta http-equiv="refresh" content="1;url=/admission/data-quality/data-profiling">`:
 * a blank shell, a forced ~1 s wait, THEN the target loads as a second
 * full document. A Route Handler responds before any rendering, so the
 * browser gets a tiny 307 immediately. The proxy (auth + route permission
 * gate) still runs in front of this handler, and Next's client router
 * follows fetch redirects transparently, so sidebar
 * `<Link href="/admission/data-quality">` navigation keeps working.
 *
 * 307 (not 308): matches the semantics of the old `redirect()` and stays
 * un-cacheable, so the landing target can change in a future deploy
 * without browsers pinning the old one. Full rationale + measurements:
 * app/(routes)/staff/route.ts (the first conversion of this class).
 *
 * Original page.tsx rationale (preserved):
 *   Data Quality landing — redirects to the default sub-page (Data Profiling).
 *
 *   /admission/data-quality previously 404'd because no page.tsx existed.
 *   AdmissionNav's "Data Quality" tab now lands here and is forwarded.
 */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/admission/data-quality/data-profiling', request.url), 307);
}
