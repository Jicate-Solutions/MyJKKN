import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * /admission/marketing/automations — answers with a REAL HTTP 307 to /admission/marketing/automations/monitoring.
 *
 * Was a page.tsx calling `redirect('/admission/marketing/automations/monitoring')`. Because
 * app/(routes)/loading.tsx wraps every page in a Suspense boundary, the
 * root shell streams before the page renders and Next cannot turn that
 * `redirect()` into an HTTP redirect — it degrades to a ~363 KB shell
 * document carrying `<meta http-equiv="refresh" content="1;url=/admission/marketing/automations/monitoring">`:
 * a blank shell, a forced ~1 s wait, THEN the target loads as a second
 * full document. A Route Handler responds before any rendering, so the
 * browser gets a tiny 307 immediately. The proxy (auth + route permission
 * gate) still runs in front of this handler, and Next's client router
 * follows fetch redirects transparently, so sidebar
 * `<Link href="/admission/marketing/automations">` navigation keeps working.
 *
 * 307 (not 308): matches the semantics of the old `redirect()` and stays
 * un-cacheable, so the landing target can change in a future deploy
 * without browsers pinning the old one. Full rationale + measurements:
 * app/(routes)/staff/route.ts (the first conversion of this class).
 *
 * Original page.tsx rationale (preserved):
 *   Automations landing — redirects to Monitoring (the first child tab).
 *
 *   The `/admission/marketing/automations` directory has 3 child routes
 *   (monitoring, roi, segments) but no root page.tsx, so AdmissionNav's
 *   "Automations" entry 404'd. Nav-config audit (PR #876) gated this.
 *   Mirrors the pattern used by /admission/marketing/page.tsx.
 */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/admission/marketing/automations/monitoring', request.url), 307);
}
