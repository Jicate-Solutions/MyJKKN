import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * /rcltp/student/assessment — answers with a REAL HTTP 307 to /rcltp/student.
 *
 * Was a page.tsx calling `redirect('/rcltp/student')`. Because
 * app/(routes)/loading.tsx wraps every page in a Suspense boundary, the
 * root shell streams before the page renders and Next cannot turn that
 * `redirect()` into an HTTP redirect — it degrades to a ~363 KB shell
 * document carrying `<meta http-equiv="refresh" content="1;url=/rcltp/student">`:
 * a blank shell, a forced ~1 s wait, THEN the target loads as a second
 * full document. A Route Handler responds before any rendering, so the
 * browser gets a tiny 307 immediately. The proxy (auth + route permission
 * gate) still runs in front of this handler, and Next's client router
 * follows fetch redirects transparently, so sidebar
 * `<Link href="/rcltp/student/assessment">` navigation keeps working.
 *
 * 307 (not 308): matches the semantics of the old `redirect()` and stays
 * un-cacheable, so the landing target can change in a future deploy
 * without browsers pinning the old one. Full rationale + measurements:
 * app/(routes)/staff/route.ts (the first conversion of this class).
 *
 * Original page.tsx rationale (preserved):
 *   /rcltp/student/assessment has no index — a sitting is always opened by id at
 *   /rcltp/student/assessment/[id]. Redirect the bare URL back to the learner
 *   portal, where assessments are listed and started.
 *
 *   Hub-page guard: every App Router directory with child routes needs a page.tsx
 *   or the bare URL 404s in production (mirrors app/(routes)/faculty/page.tsx).
 */
export function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/rcltp/student', request.url), 307);
}
