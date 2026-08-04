import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * /audit/care — answers with a REAL HTTP 307 to /audit/dashboard.
 *
 * Was a page.tsx calling `redirect('/audit/dashboard')`. Because
 * app/(routes)/loading.tsx wraps every page in a Suspense boundary, the
 * root shell streams before the page renders and Next cannot turn that
 * `redirect()` into an HTTP redirect — it degrades to a ~363 KB shell
 * document carrying `<meta http-equiv="refresh" content="1;url=/audit/dashboard">`:
 * a blank shell, a forced ~1 s wait, THEN the target loads as a second
 * full document. A Route Handler responds before any rendering, so the
 * browser gets a tiny 307 immediately. The proxy (auth + route permission
 * gate) still runs in front of this handler, and Next's client router
 * follows fetch redirects transparently, so sidebar
 * `<Link href="/audit/care">` navigation keeps working.
 *
 * 307 (not 308): matches the semantics of the old `redirect()` and stays
 * un-cacheable, so the landing target can change in a future deploy
 * without browsers pinning the old one. Full rationale + measurements:
 * app/(routes)/staff/route.ts (the first conversion of this class).
 *
 * Original page.tsx rationale (preserved):
 *   navMeta — reached by trimming a /audit/care/[cycleId] URL; canonical entry
 *   is the dashboard CARE section. Required by `scripts/assert-nav-coverage.mjs`.
 *
 *   app/(routes)/audit/care/page.tsx
 *   CARE hub — the CARE list lives on the audit dashboard (spec §5), so the
 *   bare /audit/care URL redirects there (hub pattern: app/(routes)/audit/page.tsx).
 */
/**
 * navMeta — restored verbatim from the pre-#2777 page.tsx (invokedFrom only;
 * no label/icon override). Kept so the declared "reached from the dashboard
 * CARE section" relationship survives the route.ts conversion and so the
 * manifest generator's route.ts scan (scripts/generate-route-manifest.ts)
 * has the same source of truth a page.tsx landing would carry. Extra named
 * exports from a Route Handler are legal and ignored by the Next.js runtime.
 */
export const navMeta = {
  invokedFrom: '/audit/dashboard',
} as const;

export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/audit/dashboard', request.url), 307);
}
