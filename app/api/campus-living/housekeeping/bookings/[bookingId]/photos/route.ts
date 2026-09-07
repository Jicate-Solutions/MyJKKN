export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isDriveConfigured } from '@/lib/google/drive-client';
import { uploadHousekeepingPhoto } from '@/lib/google/drive-upload';
import { learnerFacingError, logWithReference } from '@/lib/services/campus-living/error-sanitize';

const LOG = 'campus-living/housekeeping-photos';
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 8 * 1024 * 1024;

/**
 * POST /api/campus-living/housekeeping/bookings/[bookingId]/photos
 *
 * multipart/form-data: `file` (image), `phase` ('before' | 'after').
 *
 * Uploads to Drive, records the row, and advances the booking status. The
 * status update is guarded on the CURRENT status, so a repeated upload is
 * idempotent and an out-of-order one changes nothing:
 *   before -> assigned    becomes in_progress
 *   after  -> in_progress becomes awaiting_feedback
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  if (!isDriveConfigured()) {
    return NextResponse.json({ error: 'File storage is not configured.' }, { status: 503 });
  }

  const supabase = await createClient();
  // getUser(), never getSession(): getSession reads the cookie unverified.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { bookingId } = await params;

  const { data: booking, error: bookingErr } = await supabase
    .from('hostel_cleaning_bookings')
    .select('id, institution_id, status, booking_date, room:hostel_rooms(room_number), block:hostel_blocks(name)')
    .eq('id', bookingId)
    .maybeSingle();
  if (bookingErr || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  // First line of every mutation entry point. RLS re-validates on INSERT too;
  // this exists so we never upload to Drive before knowing the write is allowed.
  const { data: canExecute } = await supabase.rpc('user_has_permission', {
    permission_name: 'campus_living.housekeeping.execute',
  });
  if (!canExecute) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const form = await request.formData();
  const file = form.get('file');
  const phase = form.get('phase');

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  if (phase !== 'before' && phase !== 'after') {
    return NextResponse.json({ error: 'phase must be "before" or "after"' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: 'Only JPEG, PNG, and WebP images are supported.' },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File size must be under 8 MB.' }, { status: 400 });
  }

  if (booking.status === 'completed' || booking.status === 'cancelled') {
    return NextResponse.json(
      { error: 'This booking is closed and no longer accepts photos.' },
      { status: 409 },
    );
  }

  // Ordering guard: an "after" photo is meaningless without a "before" to
  // compare it to. The status-guarded update below enforces this too; this
  // check exists to return an actionable message instead of a silent no-op.
  if (phase === 'after') {
    const { count, error: countErr } = await supabase
      .from('hostel_cleaning_booking_photos')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', bookingId)
      .eq('phase', 'before');
    if (countErr) {
      const ref = logWithReference(LOG, 'Failed to verify the before photo', countErr);
      return NextResponse.json(
        { error: learnerFacingError('checking the before photo', ref) },
        { status: 500 },
      );
    }
    if (!count) {
      return NextResponse.json({ error: 'Upload the before photo first.' }, { status: 409 });
    }
  }

  try {
    const blockName = (booking as any).block?.name ?? 'Unknown Block';
    const roomNumber = (booking as any).room?.room_number ?? 'Unknown Room';

    const uploaded = await uploadHousekeepingPhoto({
      blockName,
      roomNumber,
      bookingDate: booking.booking_date as string,
      phase,
      file,
    });

    const { error: insertErr } = await supabase.from('hostel_cleaning_booking_photos').insert({
      booking_id: bookingId,
      institution_id: booking.institution_id,
      phase,
      drive_file_id: uploaded.driveFileId,
      drive_url: uploaded.url,
      file_name: uploaded.name,
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: user.id,
    });
    if (insertErr) {
      const ref = logWithReference(LOG, 'Failed to record the photo row', insertErr);
      return NextResponse.json(
        { error: learnerFacingError('saving the photo', ref) },
        { status: 500 },
      );
    }

    const nextStatus = phase === 'before' ? 'in_progress' : 'awaiting_feedback';
    const requiredStatus = phase === 'before' ? 'assigned' : 'in_progress';
    const stamp = phase === 'before' ? 'started_at' : 'finished_at';

    const { error: statusErr } = await supabase
      .from('hostel_cleaning_bookings')
      .update({ status: nextStatus, [stamp]: new Date().toISOString() })
      .eq('id', bookingId)
      .eq('status', requiredStatus);
    if (statusErr) {
      const ref = logWithReference(LOG, 'Failed to advance the booking status', statusErr);
      return NextResponse.json(
        { error: learnerFacingError('updating the cleaning', ref) },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, phase, status: nextStatus });
  } catch (err) {
    const ref = logWithReference(LOG, 'Housekeeping photo upload failed', err);
    return NextResponse.json(
      { error: learnerFacingError('uploading the photo', ref) },
      { status: 500 },
    );
  }
}
