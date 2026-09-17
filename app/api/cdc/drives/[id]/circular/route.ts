export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET    /api/cdc/drives/[id]/circular  → streams the drive circular out of Google Drive
 * DELETE /api/cdc/drives/[id]/circular  → removes the reference from the drive (staff)
 *
 * WHY A PROXY AND NOT A LINK. uploadCdcDriveCircular() grants the Drive file no
 * public permission, so the bytes must come through here, after MyJKKN has
 * authorised the viewer. Authorisation = "can the caller read this drive row"
 * asked through the caller's own Supabase client (cdc_drives_read RLS: any
 * signed-in user — coordinators, heads, and the learners the drive targets).
 * The file id is never taken from the URL; it is read off the drive row, so
 * holding a Drive id alone reveals nothing.
 *
 * Header handling mirrors app/api/hr/leave/documents/[fileId]/route.ts.
 */

import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { Readable } from 'node:stream';
import { createClient } from '@/lib/supabase/server';
import { createDriveClient, isDriveConfigured } from '@/lib/google/drive-client';
import { CdcDriveService } from '@/lib/services/cdc/drive-service';

const INLINE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

function driveHeader(headers: unknown, name: string): string | null {
  const maybe = headers as Headers | Record<string, unknown> | null | undefined;
  if (maybe && typeof (maybe as Headers).get === 'function') {
    return (maybe as Headers).get(name);
  }
  const value = (maybe as Record<string, unknown> | null | undefined)?.[name];
  return typeof value === 'string' ? value : null;
}

function contentDispositionFilename(name: string): string {
  const ascii = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  const { id } = await params;
  if (!isDriveConfigured()) {
    return NextResponse.json({ error: 'Drive not configured' }, { status: 503 });
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // RLS decides visibility of the drive row; an unreadable drive and a
    // missing circular are both a 404.
    const { data: drive, error } = await supabase
      .from('cdc_drives')
      .select('id, circular_drive_file_id, circular_file_name, circular_mime_type')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!drive?.circular_drive_file_id) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const drive_ = createDriveClient();
    const file = await drive_.files.get(
      { fileId: drive.circular_drive_file_id as string, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    );

    const upstreamType = (driveHeader(file.headers, 'content-type') ?? drive.circular_mime_type ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    const download = request.nextUrl.searchParams.get('download') === '1';
    const fileName = (drive.circular_file_name as string | null) || 'circular';

    const headers: Record<string, string> = {
      'Content-Type': INLINE_TYPES.has(upstreamType) ? upstreamType : 'application/octet-stream',
      'Cache-Control': 'private, max-age=3600',
      'Content-Disposition': `${download || !INLINE_TYPES.has(upstreamType) ? 'attachment' : 'inline'}; ${contentDispositionFilename(fileName)}`,
    };
    const len = driveHeader(file.headers, 'content-length');
    if (len) headers['Content-Length'] = len;

    const webStream = Readable.toWeb(file.data as Readable) as ReadableStream;
    return new NextResponse(webStream, { status: 200, headers });
  } catch (err) {
    console.error('[cdc/drives/[id]/circular] GET error:', err);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connection();
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: canEdit } = await supabase.rpc('user_has_permission', {
      permission_name: 'cdc.drives.edit',
    });
    if (canEdit !== true) {
      return NextResponse.json({ error: 'Forbidden — cdc.drives.edit required' }, { status: 403 });
    }

    // Reference removed from the drive; the Drive file itself is left in place
    // (audit trail — an announced circular may already have been read).
    const { drive: updated } = await CdcDriveService.updateDrive(supabase, id, { circular: null }, user.id);
    return NextResponse.json({ data: updated });
  } catch (err) {
    console.error('[cdc/drives/[id]/circular] DELETE error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    );
  }
}
