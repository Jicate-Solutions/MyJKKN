import { NextRequest, NextResponse } from 'next/server';
import { Readable } from 'stream';
import { createClient } from '@/lib/supabase/server';
import { isDriveConfigured, createDriveClient } from '@/lib/google/drive-client';

export const runtime = 'nodejs';

/**
 * GET /api/campus-living/rooms/[roomId]/condition-photos/[photoId]/image
 *
 * Streams a Drive-stored room condition photo through our own origin so
 * <img> tags can render it — Drive's thumbnail/preview hosts reject
 * cross-origin hotlinks even for anyone:reader files (same issue documented
 * in app/api/parent/attachment/route.ts). Gated on the same RLS as the
 * hostel_room_condition_photos row (rooms.view via fn_user_can_access_room /
 * role_has_block_access), not a raw fileId param.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string; photoId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { roomId, photoId } = await params;

  const { data: photo, error } = await supabase
    .from('hostel_room_condition_photos')
    .select('drive_file_id')
    .eq('id', photoId)
    .eq('room_id', roomId)
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

    const headers: Record<string, string> = {
      'Content-Type': (file.headers['content-type'] as string) || 'application/octet-stream',
      'Cache-Control': 'private, max-age=86400, stale-while-revalidate=604800',
    };
    const len = file.headers['content-length'];
    if (len) headers['Content-Length'] = String(len);

    const webStream = Readable.toWeb(file.data as Readable) as ReadableStream;
    return new NextResponse(webStream, { status: 200, headers });
  } catch (err) {
    console.error('[campus-living room condition photo proxy] error:', err);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
