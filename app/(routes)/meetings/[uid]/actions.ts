'use server';

// app/(routes)/meetings/[uid]/actions.ts
//
// Host-side cancel for a native booking (Phase N2 — replaces the external
// "Cancel on jicate-booking" deep-link). Auth model: resolve the signed-in
// user with the session client, then perform the cancel through the
// service-role client via NativeSchedulingService.cancelBooking, which
// verifies the actor IS the booking's host (admins use the host path too —
// out of scope v1). meeting_bookings has no UPDATE policy for authenticated
// on purpose: all mutations flow through server actions like this one.

import { revalidatePath } from 'next/cache';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { NativeSchedulingService } from '@/lib/services/meetings/native-scheduling-service';

export interface CancelResult {
  success: boolean;
  error?: string;
}

export async function cancelMyBooking(uid: string, reason?: string): Promise<CancelResult> {
  const session = await createClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) {
    return { success: false, error: 'You are signed out. Please sign in and try again.' };
  }
  if (!uid || typeof uid !== 'string') {
    return { success: false, error: 'Invalid booking reference.' };
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const result = await NativeSchedulingService.cancelBooking(
    service,
    uid,
    { actorProfileId: user.id },
    reason?.trim() || 'Cancelled by host',
  );

  if (!result.success) {
    const message =
      result.error === 'FORBIDDEN'
        ? 'Only the meeting host can cancel this booking.'
        : result.error === 'NOT_CONFIRMED'
          ? 'This booking is not in a cancellable state.'
          : result.error === 'NOT_FOUND'
            ? 'Booking not found.'
            : 'Could not cancel the booking. Please try again.';
    return { success: false, error: message };
  }

  revalidatePath(`/meetings/${uid}`);
  revalidatePath('/meetings/inbox');
  return { success: true };
}
