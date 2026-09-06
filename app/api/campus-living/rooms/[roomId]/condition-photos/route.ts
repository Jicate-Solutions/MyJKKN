export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isDriveConfigured } from '@/lib/google/drive-client';
import { uploadRoomConditionPhoto } from '@/lib/google/drive-upload';
import {
  learnerFacingError,
  logWithReference,
} from '@/lib/services/campus-living/error-sanitize';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ roomId: string }> }
) {
  if (!isDriveConfigured()) {
    return NextResponse.json({ error: 'File storage is not configured.' }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { roomId } = await params;

  const { data: room, error: roomErr } = await supabase
    .from('hostel_rooms')
    .select('room_number, hostel_blocks(name)')
    .eq('id', roomId)
    .maybeSingle();
  if (roomErr || !room) return NextResponse.json({ error: 'Room not found' }, { status: 404 });

  // Pre-flight permission check — avoids uploading to Drive before confirming
  // the DB insert would even be allowed. INSERT RLS re-validates server-side too.
  const { data: canEdit } = await supabase.rpc('user_has_permission', {
    permission_name: 'campus_living.rooms.edit',
  });
  if (!canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const form = await request.formData();
  const file = form.get('file');
  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, and WebP images are supported.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File size must be under 8 MB.' }, { status: 400 });
  }

  try {
    const blockName = (room as { hostel_blocks?: { name?: string } | null }).hostel_blocks?.name ?? 'Unknown Block';
    const uploaded = await uploadRoomConditionPhoto({
      blockName,
      roomNumber: room.room_number,
      file,
    });

    const { data: photo, error: insertErr } = await supabase
      .from('hostel_room_condition_photos')
      .insert({
        room_id: roomId,
        drive_file_id: uploaded.driveFileId,
        file_url: uploaded.url,
        file_name: file.name,
        file_size_bytes: file.size,
        mime_type: file.type,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;
    return NextResponse.json(photo);
  } catch (err) {
    // The insertErr rethrow above can carry raw Postgres text (constraint
    // names, SQLSTATE prose) — log full server-side, return a plain sentence
    // + reference (2026-08-07).
    const reference = logWithReference('campus-living', 'condition-photo upload error', err);
    return NextResponse.json(
      { error: learnerFacingError('uploading the room photo', reference), reference },
      { status: 500 }
    );
  }
}
