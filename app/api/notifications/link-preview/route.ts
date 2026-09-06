// app/api/notifications/link-preview/route.ts
//
// POST /api/notifications/link-preview   body: { "url": "<what the sender typed>" }
// →  { videoId, title, author, thumbnailUrl, degraded? }
//
// Resolves a YouTube link into a preview card payload so the compose form can
// store it on notifications.metadata.link_preview. Added 2026-08-13.
//
// Why a server route at all: YouTube's oEmbed endpoint does not reliably send
// CORS headers, so the browser cannot read the response itself.
//
// ── SSRF ────────────────────────────────────────────────────────────────────
// A route that fetches a caller-supplied URL is the textbook SSRF shape: hand it
// http://169.254.169.254/latest/meta-data/ and a naive implementation will read
// cloud instance credentials and hand them back over the wire.
//
// The defence here is NOT a blocklist of bad hosts — blocklists lose to
// redirects, DNS rebinding, IPv6 forms and decimal-encoded IPs. Instead, the
// caller's string is never fetched at all. It is parsed down to an 11-character
// video id, and the only URL that ever reaches fetch() is REBUILT from that id
// against a hard-coded youtube.com origin (buildYouTubeOEmbedUrl). Input that
// does not yield an id is rejected with 400 before any network call happens, and
// input that does yield one contributes nothing to the request but 11 characters
// drawn from [A-Za-z0-9_-].
//
// Redirects: fetch() follows redirects by default, but the only origin we can
// reach is youtube.com, so a redirect would have to be YouTube's own.
// ────────────────────────────────────────────────────────────────────────────

export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, connection } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  parseYouTubeId,
  youTubeThumbnailUrl,
  buildYouTubeOEmbedUrl
} from '@/lib/media/youtube';

/** Keep compose responsive — a slow oEmbed must not stall sending. */
const OEMBED_TIMEOUT_MS = 4000;

export async function POST(request: NextRequest) {
  await connection();
  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Being logged in is not enough. This route's ONLY caller is the compose
    // form at /notifications/admin/new, which is itself wrapped in
    // <PermissionGuard module='notifications' action='create'>. Without the same
    // gate here, every learner with a session could POST to us and use the
    // server as a YouTube metadata fetcher. Same key as the form, so nobody who
    // can open compose is refused. (super-admin/admin bypass is built into
    // user_has_permission.)
    const { data: canCreateNotifications } = await supabase.rpc(
      'user_has_permission',
      { permission_name: 'notifications.create' }
    );

    if (canCreateNotifications !== true) {
      return NextResponse.json(
        {
          error:
            'You do not have permission to use the notification link preview tool'
        },
        { status: 403 }
      );
    }

    let body: { url?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const raw = typeof body?.url === 'string' ? body.url : null;

    // THE guard. Everything past this line uses `videoId`; `raw` is dead.
    const videoId = parseYouTubeId(raw);
    if (!videoId) {
      return NextResponse.json(
        { error: 'Not a YouTube link' },
        { status: 400 }
      );
    }

    // Derived from the id alone — no network call, so it is the floor a
    // degraded response can always stand on.
    const thumbnailUrl = youTubeThumbnailUrl(videoId);

    try {
      const response = await fetch(buildYouTubeOEmbedUrl(videoId), {
        signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS),
        headers: { accept: 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`oEmbed responded ${response.status}`);
      }

      const data = await response.json();

      return NextResponse.json({
        videoId,
        title: typeof data?.title === 'string' ? data.title : null,
        author: typeof data?.author_name === 'string' ? data.author_name : null,
        thumbnailUrl:
          typeof data?.thumbnail_url === 'string'
            ? data.thumbnail_url
            : thumbnailUrl
      });
    } catch (lookupError) {
      // Degraded but still useful: the card renders from the id alone. Sending
      // must never be blocked by a preview lookup.
      console.warn(
        '[notifications/link-preview] oEmbed lookup failed, returning id-only preview:',
        lookupError instanceof Error ? lookupError.message : lookupError
      );
      return NextResponse.json({
        videoId,
        title: null,
        author: null,
        thumbnailUrl,
        degraded: true
      });
    }
  } catch (error: any) {
    console.error('[notifications/link-preview] Unexpected error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
