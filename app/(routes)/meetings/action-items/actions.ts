'use server';

// app/(routes)/meetings/action-items/actions.ts
//
// Status changes behind "My Follow-ups". Same two-step as the rest of the
// meetings module: resolve the signed-in user with the SESSION client, then
// write through the SERVICE-ROLE client via
// MeetingActionItemService.setStatusAsHostOrOwner, which re-checks that the
// actor is the booking's host OR the item's owner before touching the row.
// meeting_action_items has no client write grant.
//
// Only `status` ever changes here. Editing the text, owner or due date stays
// on the booking page (/meetings/[uid]) and stays host-only.

import { revalidatePath } from 'next/cache';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import {
  MeetingActionItemService,
  buildHostOrOwnerOr,
  type ActionItemError,
} from '@/lib/services/meetings/meeting-action-item-service';

export interface FollowUpActionResult {
  success: boolean;
  error?: string;
  /** How many items changed (markMeetingFollowUpsDoneAction only). */
  updated?: number;
}

const PAGE_PATH = '/meetings/action-items';

function messageFor(error?: ActionItemError): string {
  switch (error) {
    case 'FORBIDDEN':
      return 'Only the meeting host or the person this follow-up belongs to can change it.';
    case 'NOT_FOUND':
      return 'This follow-up no longer exists. Refresh the page.';
    case 'INVALID':
      return 'That change is not allowed.';
    default:
      return 'Could not save the change. Please try again.';
  }
}

async function requireUserId(): Promise<string | null> {
  const session = await createClient();
  const {
    data: { user },
    error,
  } = await session.auth.getUser();
  if (error || !user) return null;
  return user.id;
}

const SIGNED_OUT = 'You are signed out. Please sign in and try again.';

export async function setFollowUpStatusAction(
  itemId: string,
  status: 'open' | 'done',
): Promise<FollowUpActionResult> {
  const actorId = await requireUserId();
  if (!actorId) return { success: false, error: SIGNED_OUT };
  if (!itemId) return { success: false, error: 'Invalid follow-up.' };
  if (status !== 'open' && status !== 'done') return { success: false, error: messageFor('INVALID') };

  const result = await MeetingActionItemService.setStatusAsHostOrOwner(
    createServiceRoleClient(),
    itemId,
    actorId,
    status,
  );
  if (!result.success) return { success: false, error: messageFor(result.error) };

  revalidatePath(PAGE_PATH);
  return { success: true };
}

/**
 * Close every OPEN follow-up of one meeting that the viewer may close: all of
 * them for the host, only their own for an owner. Each item goes through the
 * same host-or-owner check as a single toggle.
 */
export async function markMeetingFollowUpsDoneAction(
  bookingId: string,
): Promise<FollowUpActionResult> {
  const actorId = await requireUserId();
  if (!actorId) return { success: false, error: SIGNED_OUT };
  if (!bookingId) return { success: false, error: 'Invalid meeting reference.' };

  let hostOrOwner: string;
  try {
    hostOrOwner = buildHostOrOwnerOr(actorId);
  } catch {
    return { success: false, error: 'Your account could not be identified. Please sign in again.' };
  }

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from('meeting_action_items')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('status', 'open')
    .or(hostOrOwner);
  if (error) return { success: false, error: messageFor('DB_ERROR') };

  const ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  let updated = 0;
  let firstError: ActionItemError | undefined;
  for (const id of ids) {
    const res = await MeetingActionItemService.setStatusAsHostOrOwner(service, id, actorId, 'done');
    if (res.success) updated += 1;
    else if (!firstError) firstError = res.error;
  }

  revalidatePath(PAGE_PATH);
  if (firstError) {
    return {
      success: false,
      updated,
      error: `${updated} of ${ids.length} marked done. ${messageFor(firstError)}`,
    };
  }
  return { success: true, updated };
}
