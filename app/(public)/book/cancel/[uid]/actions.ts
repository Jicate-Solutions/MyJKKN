'use server';

// app/(public)/book/cancel/[uid]/actions.ts
//
// Attendee-side cancel for a native booking (Phase N3a). No login — the
// booking's cancel_token IS the authorisation, verified inside
// NativeSchedulingService.cancelBooking (token mismatch → FORBIDDEN).
// The service also sends the cancellation emails to both parties.
//
// Pattern: app/(routes)/meetings/[uid]/actions.ts (host-side twin).
//
// Interview-link bookings only: inside the last two hours (policy
// hr.recruitment.interview_booking.change_cutoff_min) the candidate cannot
// cancel here and is told to contact the office (#11). The check lives here,
// not in the service, because the host may still cancel their own meeting any
// time; on this path the actor is always the attendee.

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NativeSchedulingService } from '@/lib/services/meetings/native-scheduling-service';
import {
  CHANGE_CUTOFF_MESSAGE,
  getChangeCutoffMin,
  isInsideChangeCutoff,
  isInterviewLinkSource,
} from '@/lib/services/hr/interview-booking-service';

export interface AttendeeCancelResult {
  success: boolean;
  error?: string;
  /** Refused because the interview is inside the change cutoff (#11). */
  tooClose?: boolean;
}

export async function cancelAsAttendee(
  uid: string,
  token: string,
  reason?: string,
): Promise<AttendeeCancelResult> {
  if (!uid || typeof uid !== 'string' || !token || typeof token !== 'string') {
    return { success: false, error: 'Invalid cancellation link.' };
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  // #11 — re-checked here: the page may have been opened before the window
  // closed. Only once the token matches; a wrong link falls through to the
  // service, which refuses it exactly as before and reveals nothing.
  const { data: booking } = await service
    .from('meeting_bookings')
    .select('cancel_token, status, start_time, source')
    .eq('uid', uid)
    .maybeSingle();
  if (
    booking &&
    booking.cancel_token === token &&
    booking.status === 'confirmed' &&
    isInterviewLinkSource(booking.source as string | null) &&
    isInsideChangeCutoff(booking.start_time as string, await getChangeCutoffMin(service))
  ) {
    return { success: false, error: CHANGE_CUTOFF_MESSAGE, tooClose: true };
  }

  const result = await NativeSchedulingService.cancelBooking(
    service,
    uid,
    { cancelToken: token },
    reason?.trim().slice(0, 500) || 'Cancelled by attendee',
  );

  if (!result.success) {
    const message =
      result.error === 'FORBIDDEN' || result.error === 'NOT_FOUND'
        ? 'This cancellation link is not valid.'
        : result.error === 'NOT_CONFIRMED'
          ? 'This booking has already been cancelled.'
          : 'Could not cancel the booking. Please try again.';
    return { success: false, error: message };
  }

  return { success: true };
}
