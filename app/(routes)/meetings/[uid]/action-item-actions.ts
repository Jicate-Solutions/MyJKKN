'use server';

// app/(routes)/meetings/[uid]/action-item-actions.ts
//
// Host-side action-item mutations for a native booking (Meeting Agenda Engine
// PR2 — the loop). Same auth model as agenda-actions.ts: resolve the signed-in
// user with the session client, then mutate through the SERVICE-ROLE client via
// MeetingActionItemService, which re-verifies the actor IS the booking's host
// before writing. The action-item table has no client write grant.

import { revalidatePath } from 'next/cache';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import {
  MeetingActionItemService,
  type ActionItemError,
  type ActionItemInput,
} from '@/lib/services/meetings/meeting-action-item-service';

export interface ActionItemActionResult {
  success: boolean;
  error?: string;
}

function messageFor(error?: ActionItemError): string {
  switch (error) {
    case 'FORBIDDEN':
      return 'Only the meeting host can edit these action items.';
    case 'NOT_FOUND':
      return 'Action item not found.';
    case 'INVALID':
      return 'Please enter an action (max 500 characters).';
    default:
      return 'Could not save the change. Please try again.';
  }
}

function serviceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireUser() {
  const session = await createClient();
  const {
    data: { user },
    error,
  } = await session.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function addActionItemAction(
  bookingId: string,
  uid: string,
  input: ActionItemInput,
): Promise<ActionItemActionResult> {
  const user = await requireUser();
  if (!user) return { success: false, error: 'You are signed out. Please sign in and try again.' };
  if (!bookingId) return { success: false, error: 'Invalid meeting reference.' };

  const result = await MeetingActionItemService.addItem(serviceClient(), bookingId, user.id, input);
  if (!result.success) return { success: false, error: messageFor(result.error) };

  revalidatePath(`/meetings/${uid}`);
  return { success: true };
}

export async function updateActionItemAction(
  itemId: string,
  uid: string,
  input: ActionItemInput,
): Promise<ActionItemActionResult> {
  const user = await requireUser();
  if (!user) return { success: false, error: 'You are signed out. Please sign in and try again.' };
  if (!itemId) return { success: false, error: 'Invalid action item.' };

  const result = await MeetingActionItemService.updateItem(serviceClient(), itemId, user.id, input);
  if (!result.success) return { success: false, error: messageFor(result.error) };

  revalidatePath(`/meetings/${uid}`);
  return { success: true };
}

export async function setActionItemStatusAction(
  itemId: string,
  uid: string,
  status: 'open' | 'done',
): Promise<ActionItemActionResult> {
  const user = await requireUser();
  if (!user) return { success: false, error: 'You are signed out. Please sign in and try again.' };
  if (!itemId) return { success: false, error: 'Invalid action item.' };

  const result = await MeetingActionItemService.setStatus(serviceClient(), itemId, user.id, status);
  if (!result.success) return { success: false, error: messageFor(result.error) };

  revalidatePath(`/meetings/${uid}`);
  return { success: true };
}

export async function deleteActionItemAction(
  itemId: string,
  uid: string,
): Promise<ActionItemActionResult> {
  const user = await requireUser();
  if (!user) return { success: false, error: 'You are signed out. Please sign in and try again.' };
  if (!itemId) return { success: false, error: 'Invalid action item.' };

  const result = await MeetingActionItemService.deleteItem(serviceClient(), itemId, user.id);
  if (!result.success) return { success: false, error: messageFor(result.error) };

  revalidatePath(`/meetings/${uid}`);
  return { success: true };
}
