'use server';

// app/(routes)/meetings/[uid]/agenda-actions.ts
//
// Host-side agenda mutations for a native booking (Meeting Agenda Engine PR1).
// Same auth model as cancelMyBooking (./actions.ts): resolve the signed-in user
// with the session client, then mutate through the SERVICE-ROLE client via
// MeetingAgendaService, which re-verifies the actor IS the booking's host before
// writing. The agenda tables have no client write grant — these server actions
// are the only write path.

import { revalidatePath } from 'next/cache';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import {
  MeetingAgendaService,
  type AgendaError,
} from '@/lib/services/meetings/meeting-agenda-service';

export interface AgendaActionResult {
  success: boolean;
  error?: string;
}

function messageFor(error?: AgendaError): string {
  switch (error) {
    case 'FORBIDDEN':
      return 'Only the meeting host can edit this agenda.';
    case 'NOT_FOUND':
      return 'Agenda item not found.';
    case 'INVALID':
      return 'Please enter a title (max 300 characters).';
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

export async function addAgendaItemAction(
  bookingId: string,
  uid: string,
  input: { title: string; body?: string },
): Promise<AgendaActionResult> {
  const user = await requireUser();
  if (!user) return { success: false, error: 'You are signed out. Please sign in and try again.' };
  if (!bookingId) return { success: false, error: 'Invalid meeting reference.' };

  const result = await MeetingAgendaService.addItem(serviceClient(), bookingId, user.id, {
    title: input.title,
    body: input.body,
  });
  if (!result.success) return { success: false, error: messageFor(result.error) };

  revalidatePath(`/meetings/${uid}`);
  return { success: true };
}

export async function updateAgendaItemAction(
  itemId: string,
  uid: string,
  input: { title: string; body?: string },
): Promise<AgendaActionResult> {
  const user = await requireUser();
  if (!user) return { success: false, error: 'You are signed out. Please sign in and try again.' };
  if (!itemId) return { success: false, error: 'Invalid agenda item.' };

  const result = await MeetingAgendaService.updateItem(serviceClient(), itemId, user.id, {
    title: input.title,
    body: input.body,
  });
  if (!result.success) return { success: false, error: messageFor(result.error) };

  revalidatePath(`/meetings/${uid}`);
  return { success: true };
}

export async function deleteAgendaItemAction(
  itemId: string,
  uid: string,
): Promise<AgendaActionResult> {
  const user = await requireUser();
  if (!user) return { success: false, error: 'You are signed out. Please sign in and try again.' };
  if (!itemId) return { success: false, error: 'Invalid agenda item.' };

  const result = await MeetingAgendaService.deleteItem(serviceClient(), itemId, user.id);
  if (!result.success) return { success: false, error: messageFor(result.error) };

  revalidatePath(`/meetings/${uid}`);
  return { success: true };
}

export async function moveAgendaItemAction(
  itemId: string,
  uid: string,
  direction: 'up' | 'down',
): Promise<AgendaActionResult> {
  const user = await requireUser();
  if (!user) return { success: false, error: 'You are signed out. Please sign in and try again.' };
  if (!itemId) return { success: false, error: 'Invalid agenda item.' };

  const result = await MeetingAgendaService.moveItem(serviceClient(), itemId, user.id, direction);
  if (!result.success) return { success: false, error: messageFor(result.error) };

  revalidatePath(`/meetings/${uid}`);
  return { success: true };
}
