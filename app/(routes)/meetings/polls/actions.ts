'use server';

// app/(routes)/meetings/polls/actions.ts
//
// Server actions for Meeting Polls (Universal Booking M5). CRUD on the
// meeting_polls / meeting_poll_options / meeting_poll_votes tables via the
// RLS server client — the meeting_polls.host_profile_id = auth.uid() policy
// scopes every operation to the signed-in host.
//
// Pattern: app/(routes)/meetings/manage/actions.ts (untypedClient TS2589
// defense, getCurrentUserId, ActionResult<T>).

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import {
  MeetingPollService,
  type CreatePollInput,
  type PollSummary,
  type PollDetail,
} from '@/lib/services/meetings/meeting-poll-service';

// repo compiles with strictNullChecks:false — flat optional-field shape.
export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// The poll tables aren't in generated types yet — untyped client (TS2589 class).
async function untypedClient(): Promise<SupabaseClient> {
  return (await createClient()) as unknown as SupabaseClient;
}

async function getCurrentUserId(supabase: SupabaseClient): Promise<string> {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error('You are signed out. Please sign in to MyJKKN and try again.');
  }
  return user.id;
}

async function getHostInstitutionId(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('profiles')
    .select('institution_id')
    .eq('id', userId)
    .maybeSingle();
  return (data?.institution_id as string | undefined) ?? null;
}

/** Create a poll owned by the current user. */
export async function createPollAction(
  input: CreatePollInput,
): Promise<ActionResult<{ pollId: string; slug: string }>> {
  try {
    const supabase = await untypedClient();
    const userId = await getCurrentUserId(supabase);
    const institutionId = await getHostInstitutionId(supabase, userId);

    const result = await MeetingPollService.createPoll(supabase, userId, institutionId, input);
    if (!result.success) return { success: false, error: result.error };

    revalidatePath('/meetings/polls');
    return { success: true, data: { pollId: result.pollId, slug: result.slug } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not create the poll.',
    };
  }
}

/** List the current user's polls (newest first, with tallies). */
export async function listMyPollsAction(): Promise<ActionResult<PollSummary[]>> {
  try {
    const supabase = await untypedClient();
    const userId = await getCurrentUserId(supabase);
    const polls = await MeetingPollService.listPollsForHost(supabase, userId);
    return { success: true, data: polls };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not load your polls.',
    };
  }
}

/** One poll's detail + per-option tallies (ownership enforced by RLS). */
export async function getPollDetailAction(
  pollId: string,
): Promise<ActionResult<PollDetail>> {
  if (!pollId || typeof pollId !== 'string') {
    return { success: false, error: 'Invalid poll reference.' };
  }
  try {
    const supabase = await untypedClient();
    await getCurrentUserId(supabase); // ensure signed in; RLS scopes the read
    const detail = await MeetingPollService.getPollDetail(supabase, pollId);
    if (!detail) return { success: false, error: 'That poll could not be found.' };
    return { success: true, data: detail };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not load the poll.',
    };
  }
}

/** Confirm a winning option → closes the poll + creates a confirmed booking. */
export async function confirmWinnerAction(
  pollId: string,
  winningOptionId: string,
): Promise<ActionResult<{ bookingUid: string }>> {
  if (!pollId || !winningOptionId) {
    return { success: false, error: 'Invalid poll or option reference.' };
  }
  try {
    const supabase = await untypedClient();
    await getCurrentUserId(supabase);
    const result = await MeetingPollService.closePoll(supabase, pollId, winningOptionId);
    if (!result.success) {
      const map: Record<string, string> = {
        NOT_FOUND: 'That poll could not be found.',
        ALREADY_CLOSED: 'This poll has already been confirmed.',
        INVALID_OPTION: 'That option does not belong to this poll.',
        SLOT_TAKEN: 'You are already booked over that time. Pick a different option.',
        INTERNAL: 'Could not confirm the winner. Please try again.',
      };
      return { success: false, error: map[result.error] ?? 'Could not confirm the winner.' };
    }
    revalidatePath('/meetings/polls');
    revalidatePath(`/meetings/polls/${pollId}`);
    return { success: true, data: { bookingUid: result.bookingUid } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not confirm the winner.',
    };
  }
}

/** Delete a poll the current user owns (cascade removes options + votes). */
export async function deletePollAction(
  pollId: string,
): Promise<ActionResult<{ id: string }>> {
  if (!pollId || typeof pollId !== 'string') {
    return { success: false, error: 'Invalid poll reference.' };
  }
  try {
    const supabase = await untypedClient();
    await getCurrentUserId(supabase);
    const result = await MeetingPollService.deletePoll(supabase, pollId);
    if (!result.success) return { success: false, error: result.error };
    revalidatePath('/meetings/polls');
    return { success: true, data: { id: pollId } };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not delete the poll.',
    };
  }
}
