import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * /hr/payroll — answers with a REAL HTTP 307 to /hr/payroll/organisation.
 *
 * Was a page.tsx calling `redirect('/hr/payroll/organisation')`. Because
 * app/(routes)/loading.tsx wraps every page in a Suspense boundary, the
 * root shell streams before the page renders and Next cannot turn that
 * `redirect()` into an HTTP redirect — it degrades to a ~363 KB shell
 * document carrying `<meta http-equiv="refresh" content="1;url=/hr/payroll/organisation">`:
 * a blank shell, a forced ~1 s wait, THEN the target loads as a second
 * full document. A Route Handler responds before any rendering, so the
 * browser gets a tiny 307 immediately. The proxy (auth + route permission
 * gate) still runs in front of this handler, and Next's client router
 * follows fetch redirects transparently, so sidebar
 * `<Link href="/hr/payroll">` navigation keeps working.
 *
 * 307 (not 308): matches the semantics of the old `redirect()` and stays
 * un-cacheable, so the landing target can change in a future deploy
 * without browsers pinning the old one. Full rationale + measurements:
 * app/(routes)/staff/route.ts (the first conversion of this class).
 *
 * Original page.tsx rationale (preserved):
 *   Payroll landing — forwards to the only page under it today.
 *
 *   Next.js App Router needs a page.tsx at every directory meant to be reachable,
 *   so without this /hr/payroll 404s. The hub-page-404 class has reached
 *   production three times in 2026, which is why a CI gate now blocks it.
 *
 *   Permissions are unaffected: RoutePermissionGuard in app/(routes)/hr/layout.tsx
 *   resolves by longest prefix, so this path falls through to '/hr' → 'hr.view'
 *   and the redirect target enforces the real gate
 *   ('/hr/payroll/organisation' → 'hr.payroll.institution.view'). Anyone without
 *   that key is stopped at the destination, not here.
 */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/hr/payroll/organisation', request.url), 307);
}
