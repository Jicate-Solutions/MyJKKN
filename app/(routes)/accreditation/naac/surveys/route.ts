import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * /accreditation/naac/surveys — answers with a REAL HTTP 307 to /accreditation/naac/surveys/consent.
 *
 * Was a page.tsx calling `redirect('/accreditation/naac/surveys/consent')`. Because
 * app/(routes)/loading.tsx wraps every page in a Suspense boundary, the
 * root shell streams before the page renders and Next cannot turn that
 * `redirect()` into an HTTP redirect — it degrades to a ~363 KB shell
 * document carrying `<meta http-equiv="refresh" content="1;url=/accreditation/naac/surveys/consent">`:
 * a blank shell, a forced ~1 s wait, THEN the target loads as a second
 * full document. A Route Handler responds before any rendering, so the
 * browser gets a tiny 307 immediately. The proxy (auth + route permission
 * gate) still runs in front of this handler, and Next's client router
 * follows fetch redirects transparently, so sidebar
 * `<Link href="/accreditation/naac/surveys">` navigation keeps working.
 *
 * 307 (not 308): matches the semantics of the old `redirect()` and stays
 * un-cacheable, so the landing target can change in a future deploy
 * without browsers pinning the old one. Full rationale + measurements:
 * app/(routes)/staff/route.ts (the first conversion of this class).
 *
 * Original page.tsx rationale (preserved):
 *   NAAC Surveys landing — redirects to the default sub-page.
 *
 *   /accreditation/naac/surveys previously 404'd because no page.tsx existed here.
 *   Redirects to /accreditation/naac/surveys/consent — DPDPA consent is the
 *   mandatory entry point for all survey participation.
 *
 *   Part of the nav-landing sweep (follow-up to #348).
 *
 *
 *   navMeta — this URL is a redirect target (e.g. from a "Surveys" CTA on the
 *   NAAC dashboard or stale bookmarks) that bounces to /surveys/consent. Nav-
 *   coverage detector (`scripts/assert-nav-coverage.mjs`) reads this to pass
 *   discoverability without requiring a visible chip for the redirect landing.
 */
/**
 * navMeta — restored verbatim from the pre-#2777 page.tsx (invokedFrom only;
 * no label/icon override). Kept so the declared "redirect target reached from
 * the NAAC dashboard" relationship survives the route.ts conversion and so
 * the manifest generator's route.ts scan (scripts/generate-route-manifest.ts)
 * has the same source of truth a page.tsx landing would carry. Extra named
 * exports from a Route Handler are legal and ignored by the Next.js runtime.
 */
export const navMeta = {
  invokedFrom: '/accreditation/naac',
} as const;

export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/accreditation/naac/surveys/consent', request.url), 307);
}
