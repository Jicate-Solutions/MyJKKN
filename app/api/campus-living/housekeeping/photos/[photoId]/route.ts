export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { deleteDriveFile } from '@/lib/google/drive-upload';
import { learnerFacingError, logWithReference } from '@/lib/services/campus-living/error-sanitize';

const LOG = 'campus-living/housekeeping-photo-delete';

/**
 * DELETE /api/campus-living/housekeeping/photos/[photoId]
 *
 * Removes one before/after photo — the "we uploaded a blurry one" case. A phase
 * holds several photos, so this is ordinary evidence correction, not an undo of
 * the cleaning.
 *
 * It deliberately does NOT roll the booking status back. started_at/finished_at
 * are stamped history: the cleaner really did start, and reverting would strand
 * a room that has already been told to rate. Hence the last-photo guard below.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ photoId: string }> }
) {
  const supabase = await createClient();
  // getUser(), never getSession(): getSession reads the cookie unverified.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { photoId } = await params;

  // Same key hk_photos_delete gates on, checked here so the Drive file is never
  // touched for a caller whose row delete would be refused anyway.
  const { data: canExecute } = await supabase.rpc('user_has_permission', {
    permission_name: 'campus_living.housekeeping.execute',
  });
  if (!canExecute) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // RLS scopes this read; a row the caller may not see comes back null.
  const { data: photo, error: photoErr } = await supabase
    .from('hostel_cleaning_booking_photos')
    .select('id, booking_id, phase, drive_file_id')
    .eq('id', photoId)
    .maybeSingle();
  if (photoErr || !photo) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
  }

  const { data: booking, error: bookingErr } = await supabase
    .from('hostel_cleaning_bookings')
    .select('id, status')
    .eq('id', photo.booking_id as string)
    .maybeSingle();
  if (bookingErr || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  // Last-photo guard. Once a booking has moved PAST a phase, that phase's
  // evidence is what justifies the move — removing the only one would leave a
  // job in awaiting_feedback with nothing for the room to look at. Extra photos
  // delete freely, and a replacement can be uploaded first.
  const phase = photo.phase as 'before' | 'after';
  const statusesPast: Record<'before' | 'after', string[]> = {
    before: ['in_progress', 'awaiting_feedback', 'completed'],
    after: ['awaiting_feedback', 'completed'],
  };
  if (statusesPast[phase].includes(booking.status as string)) {
    const { count, error: countErr } = await supabase
      .from('hostel_cleaning_booking_photos')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', photo.booking_id as string)
      .eq('phase', phase);
    if (countErr) {
      const ref = logWithReference(LOG, 'Failed to count the phase photos', countErr);
      return NextResponse.json(
        { error: learnerFacingError('checking the other photos', ref) },
        { status: 500 },
      );
    }
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        {
          error: `This is the only ${phase} photo and the cleaning has already moved on. Upload a replacement first, then remove this one.`,
        },
        { status: 409 },
      );
    }
  }

  // Row FIRST, Drive second. The other order can leave a row pointing at a
  // deleted file — a thumbnail that is broken forever. An orphaned Drive file is
  // invisible to the app, so losing that race is the cheap direction.
  const { error: deleteErr } = await supabase
    .from('hostel_cleaning_booking_photos')
    .delete()
    .eq('id', photoId);
  if (deleteErr) {
    const ref = logWithReference(LOG, 'Failed to delete the photo row', deleteErr);
    return NextResponse.json(
      { error: learnerFacingError('removing the photo', ref) },
      { status: 500 },
    );
  }

  // Best effort: the photo is already gone from the app's point of view, so a
  // Drive failure must not fail the request. deleteDriveFile returns false
  // rather than throwing (and true when the file was already gone), so this is
  // a log line, never a response.
  const driveDeleted = await deleteDriveFile(photo.drive_file_id as string);
  if (!driveDeleted) {
    logWithReference(
      LOG,
      `Photo row deleted but the Drive file remains (${photo.drive_file_id})`,
      null,
    );
  }

  return NextResponse.json({ ok: true, bookingId: photo.booking_id, phase });
}
