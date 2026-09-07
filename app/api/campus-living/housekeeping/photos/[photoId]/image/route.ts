import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import { createClient } from '@/lib/supabase/server';
import { isDriveConfigured, createDriveClient } from '@/lib/google/drive-client';

export const runtime = 'nodejs';

/**
 * GET /api/campus-living/housekeeping/photos/[photoId]/image
 *
 * Streams a Drive-stored before/after cleaning photo through our own origin so
 * <img> tags can render it — Drive's thumbnail/preview hosts reject
 * cross-origin hotlinks even for anyone:reader files, and these files are not
 * link-shared at all.
 *
 * Authorization is the RLS on hostel_cleaning_booking_photos, reached by
 * selecting the row as the caller: a warden with campus_living.housekeeping.view
 * in the institution, or a learner allocated to the booking's room (roommates
 * must see the evidence they are being asked to rate). We never accept a raw
 * Drive fileId param.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ photoId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { photoId } = await params;

  // RLS decides visibility here; a row the caller may not see comes back null.
  const { data: photo, error } = await supabase
    .from('hostel_cleaning_booking_photos')
    .select('drive_file_id, mime_type')
    .eq('id', photoId)
    .maybeSingle();
  if (error || !photo) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!isDriveConfigured()) {
    return NextResponse.json({ error: 'Drive not configured' }, { status: 503 });
  }

  try {
    const drive = createDriveClient();
    const file = await drive.files.get(
      { fileId: photo.drive_file_id, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    );

    // gaxios 7 returns a fetch `Headers`, so `file.headers['content-type']` is
    // silently undefined — which would fall back to octet-stream and make the
    // browser DOWNLOAD the photo instead of rendering it in the <img>. Use
    // .get(), and fall back to the mime type we recorded at upload time.
    const driveHeaders = file.headers as unknown as Headers;
    const contentType =
      (typeof driveHeaders?.get === 'function' ? driveHeaders.get('content-type') : null) ??
      photo.mime_type ??
      'application/octet-stream';
    const contentLength =
      typeof driveHeaders?.get === 'function' ? driveHeaders.get('content-length') : null;

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      // private: this is an authenticated response. A service worker or shared
      // cache holding it would leak one room's photos to another user.
      'Cache-Control': 'private, max-age=86400, stale-while-revalidate=604800',
    };
    if (contentLength) headers['Content-Length'] = contentLength;

    const webStream = Readable.toWeb(file.data as Readable) as ReadableStream;
    return new NextResponse(webStream, { status: 200, headers });
  } catch (err) {
    console.error('[campus-living housekeeping photo proxy] error:', err);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
