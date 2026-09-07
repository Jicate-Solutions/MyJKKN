// app/api/whats-new/route.ts
//
// Serves the What's New changelog data to SIGNED-IN users only.
//
// WHY THIS ROUTE EXISTS AT ALL — a real exposure, found live on production
// 2026-09-06. The data originally shipped as public/changelog/*.json. MyJKKN's
// proxy treats any path ending in `.json` as a public static asset:
//
//     proxy.ts:258
//     const STATIC_ASSET_PATTERN =
//       /^\/(_next|icons)|\.(?:js|css|png|ico|svg|json|xml|html|woff2?)$/;
//
// so `/changelog/recent.json` never reached the auth check. Verified against
// www.jkkn.ai with no session: all three files returned HTTP 200 (meta 7,977 B,
// recent 390,405 B, archive 319,877 B) — 4,753 internal change descriptions
// readable by anyone on the internet, including entries about Administration,
// AI Routines and Users & Roles.
//
// The Director's decision (2026-09-05) was "everyone who SIGNS IN". Widening the
// proxy's static-asset rule would change auth for the whole app, so the fix
// belongs here instead: the data is no longer under public/, and this route
// requires a session.
//
// KNOWN LIMIT, stated so nobody mistakes it for a guarantee: this gate is
// per-SESSION, not per-ROLE. Any signed-in user can request any part and receive
// the full set; the page then filters what it DISPLAYS by role. That matches the
// stated decision and the smart-guide precedent, but it means the role scoping is
// a presentation rule, not an access boundary.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const PARTS = ['meta', 'recent', 'archive'] as const;
type Part = (typeof PARTS)[number];

function isPart(v: string | null): v is Part {
  return v !== null && (PARTS as readonly string[]).includes(v);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const part = new URL(request.url).searchParams.get('part');
  if (!isPart(part)) {
    return NextResponse.json(
      { error: `part must be one of: ${PARTS.join(', ')}` },
      { status: 400 }
    );
  }

  // Imported per-part rather than all three at the top, so a request for `meta`
  // (8 KB) does not pull in the 710 KB of entries alongside it.
  const data =
    part === 'meta'
      ? (await import('@/lib/changelog/data/meta.json')).default
      : part === 'recent'
        ? (await import('@/lib/changelog/data/recent.json')).default
        : (await import('@/lib/changelog/data/archive.json')).default;

  return NextResponse.json(data, {
    headers: {
      // Private: this is now behind a session, so no shared cache may hold it.
      // The service worker keeps its own offline copy (app/sw.ts, NetworkFirst).
      'Cache-Control': 'private, no-cache, must-revalidate',
    },
  });
}
