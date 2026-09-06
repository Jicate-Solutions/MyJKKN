import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * /pde/admin/compliance — answers with a REAL HTTP 307 to /pde/admin/compliance/per-college.
 *
 * Was a page.tsx calling `redirect('/pde/admin/compliance/per-college')`. Because
 * app/(routes)/loading.tsx wraps every page in a Suspense boundary, the
 * root shell streams before the page renders and Next cannot turn that
 * `redirect()` into an HTTP redirect — it degrades to a ~363 KB shell
 * document carrying `<meta http-equiv="refresh" content="1;url=/pde/admin/compliance/per-college">`:
 * a blank shell, a forced ~1 s wait, THEN the target loads as a second
 * full document. A Route Handler responds before any rendering, so the
 * browser gets a tiny 307 immediately. The proxy (auth + route permission
 * gate) still runs in front of this handler, and Next's client router
 * follows fetch redirects transparently, so sidebar
 * `<Link href="/pde/admin/compliance">` navigation keeps working.
 *
 * 307 (not 308): matches the semantics of the old `redirect()` and stays
 * un-cacheable, so the landing target can change in a future deploy
 * without browsers pinning the old one. Full rationale + measurements:
 * app/(routes)/staff/route.ts (the first conversion of this class).
 *
 * Original page.tsx rationale (preserved):
 *   =====================================================================
 *   /pde/admin/compliance — parent landing
 *   =====================================================================
 *   The compliance area currently has a single live view: per-college.
 *   Send the user straight there so the nav entry doesn't dead-end at
 *   an empty index.
 *   =====================================================================
 */
/**
 * navMeta — restored verbatim from the pre-#2777 page.tsx. The manifest
 * generator (scripts/generate-route-manifest.ts) reads this from route.ts
 * landings that have no page.tsx; without it the hub degraded to the
 * title-case fallback "Compliance"/FileText. Extra named exports from a
 * Route Handler are legal and ignored by the Next.js runtime.
 */
export const navMeta = {
  label: 'PDE Compliance',
  icon: 'ShieldCheck',
} as const;

export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/pde/admin/compliance/per-college', request.url), 307);
}
