export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/cdc/drives/[id]/documents/[docId]  → streams one learner document out of Google Drive.
 *
 * The Drive file carries no public permission, so this proxy is the only way
 * to the bytes. Authorisation is asked through the CALLER'S OWN Supabase
 * client: cdc_drive_documents RLS returns the row only to CDC team members and to
 * the learner the document belongs to. A row the caller cannot read is
 * indistinguishable from one that does not exist (404). The Drive file id comes
 * from that row, never from the URL.
 */

import { NextResponse, connection } from 'next/server';
import type { NextRequest } from 'next/server';
import { Readable } from 'node:stream';
import { createClient } from '@/lib/supabase/server';
import { createDriveClient, isDriveConfigured } from '@/lib/google/drive-client';

const INLINE_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

function driveHeader(headers: unknown, name: string): string | null {
  const maybe = headers as Headers | Record<string, unknown> | null | undefined;
  if (maybe && typeof (maybe as Headers).get === 'function') return (maybe as Headers).get(name);
  const value = (maybe as Record<string, unknown> | null | undefined)?.[name];
  return typeof value === 'string' ? value : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  await connection();
  const { id, docId } = await params;
  if (!isDriveConfigured()) return NextResponse.json({ error: 'Drive not configured' }, { status: 503 });
  try {
    // The RLS-scoped read below IS the authorisation: without a valid session
    // auth.uid() is null, the policy matches nothing, and the answer is 404. A
    // separate auth.getUser() call only added a network round trip before every view.
    const supabase = await createClient();
    const { data: doc, error } = await supabase
      .from('cdc_drive_documents')
      .select('drive_file_id, file_name, mime_type')
      .eq('id', docId)
      .eq('drive_id', id)
      .maybeSingle();
    if (error) throw error;
    if (!doc?.drive_file_id) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const file = await createDriveClient().files.get(
      { fileId: doc.drive_file_id as string, alt: 'media', supportsAllDrives: true },
      { responseType: 'stream' }
    );
    const type = (driveHeader(file.headers, 'content-type') ?? (doc.mime_type as string | null) ?? '').split(';')[0].trim().toLowerCase();
    const inline = INLINE_TYPES.has(type) && request.nextUrl.searchParams.get('download') !== '1';
    const name = ((doc.file_name as string | null) || 'document').replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
    const headers: Record<string, string> = {
      'Content-Type': INLINE_TYPES.has(type) ? type : 'application/octet-stream',
      // A Drive file id is immutable (a new version is a new id), so the bytes
      // for this document never change — let the browser keep them for a day.
      'Cache-Control': 'private, max-age=86400, immutable',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${name}"`,
    };
    const len = driveHeader(file.headers, 'content-length');
    if (len) headers['Content-Length'] = len;
    return new NextResponse(Readable.toWeb(file.data as Readable) as ReadableStream, { status: 200, headers });
  } catch (err) {
    console.error('[cdc/drives/[id]/documents/[docId]] GET error:', err);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
