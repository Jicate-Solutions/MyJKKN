'use server';

// app/(public)/book/cancel/[uid]/actions.ts
//
// Attendee-side cancel for a native booking (Phase N3a). No login — the
// booking's cancel_token IS the authorisation, verified inside
// NativeSchedulingService.cancelBooking (token mismatch → FORBIDDEN).
// The service also sends the cancellation emails to both parties.
//
// Pattern: app/(routes)/meetings/[uid]/actions.ts (host-side twin).

import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NativeSchedulingService } from '@/lib/services/meetings/native-scheduling-service';

export interface AttendeeCancelResult {
  success: boolean;
  error?: string;
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
