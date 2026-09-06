import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import { resolveParentScope } from '@/lib/utils/parent-access';
import { isDriveConfigured, createDriveClient } from '@/lib/google/drive-client';

export const runtime = 'nodejs';

const ID_RE = /^[\w-]+$/;

/**
 * GET /api/parent/attachment?fileId=<driveFileId>
 *
 * Streams a Google Drive file's bytes through our own origin so parent-portal
 * <img> tags can render it. Drive's thumbnail/preview hosts reject cross-origin
 * hotlinks (403 / CORS) even for "anyone with link" files, which is why a plain
 * <img src="drive.google.com/thumbnail?…"> shows a broken icon. We fetch with
 * the service-account client (which owns these uploads) and re-serve the bytes.
 *
 * Gated to authenticated parents; the browser sends the parent session cookie
 * automatically on the same-origin <img> request.
 */
export async function GET(req: NextRequest) {
  const scope = await resolveParentScope(req);
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const fileId = new URL(req.url).searchParams.get('fileId') ?? '';
  if (!ID_RE.test(fileId)) return NextResponse.json({ error: 'Bad fileId' }, { status: 400 });

  if (!isDriveConfigured()) {
    return NextResponse.json({ error: 'Drive not configured' }, { status: 503 });
  }

  try {
    const drive = createDriveClient();

    // Single round-trip: the media response already carries content-type /
    // -length in its headers, so we skip a separate metadata fetch. Stream the
    // bytes straight through instead of buffering the whole file first — the
    // browser starts painting as soon as data arrives.
    const file = await drive.files.get(
      { fileId, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    );

    const headers: Record<string, string> = {
      'Content-Type': (file.headers['content-type'] as string) || 'application/octet-stream',
      // File content for a given Drive id never changes → cache hard so repeat
      // views are instant. Per-user since the bytes require the session.
      'Cache-Control': 'private, max-age=86400, stale-while-revalidate=604800',
    };
    const len = file.headers['content-length'];
    if (len) headers['Content-Length'] = String(len);

    const webStream = Readable.toWeb(file.data as Readable) as ReadableStream;
    return new NextResponse(webStream, { status: 200, headers });
  } catch (err) {
    console.error('[parent attachment proxy] error:', err);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
