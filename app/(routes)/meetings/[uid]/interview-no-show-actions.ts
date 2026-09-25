'use server';

// app/(routes)/meetings/[uid]/interview-no-show-actions.ts
//
// The host says a candidate did not turn up, and can take it back (#10).
//
// The mark is what lets a later booking by the same person show "Did not turn
// up last time" on its meeting page. The undo exists because a mis-click on
// the wrong meeting would otherwise follow that candidate into every later
// interview; the HR workspace's "Candidate No-show" button is the other way in.
//
// AUTH. The SESSION client, so the UPDATE policy on hr_recruitment_interviews
// (super admin, admin, or hr.recruitment.edit) is the gate. RLS answers a
// refused UPDATE with zero rows and no error — indistinguishable from "the row
// had already moved on" — so the row and the permission are read FIRST, and the
// two reasons get two different messages.
//
// WHY NOT RecruitmentInterviewsService.updateOutcome. It checks the status and
// then updates by id alone, so a change landing in between is overwritten; and
// its `.single()` throws on the zero rows RLS returns. The update below carries
// the expected status in its WHERE clause instead, and writes nothing else:
// outcome_summary is left as it is, which is what updateOutcome also does when
// no summary is given.

import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { viewerCanEditInterviews } from './interview-flags-data';

export interface InterviewNoShowResult {
  success: boolean;
  error?: string;
}

const NO_ACCESS = "You don't have access to change this interview — contact HR.";
const ALREADY_UPDATED = 'This interview has already been updated — refresh the page.';

type InterviewStatus = 'scheduled' | 'no_show';

async function moveStatus(
  interviewId: string,
  from: InterviewStatus,
  to: InterviewStatus,
): Promise<InterviewNoShowResult> {
  if (!interviewId || typeof interviewId !== 'string') {
    return { success: false, error: 'Invalid interview reference.' };
  }

  const supabase = (await createClient()) as unknown as SupabaseClient;

  const { data: row, error: readError } = await supabase
    .from('hr_recruitment_interviews')
    .select('id, status, scheduled_at')
    .eq('id', interviewId)
    .maybeSingle();
  if (readError) {
    console.error(`[meetings/interview-no-show] read failed for ${interviewId}:`, readError.message);
    return { success: false, error: 'Could not read this interview just now. Please try again.' };
  }
  // Not readable under RLS: to this viewer the row may as well not exist.
  if (!row) return { success: false, error: NO_ACCESS };
  if (!(await viewerCanEditInterviews(supabase))) return { success: false, error: NO_ACCESS };

  const current = row as { status: string; scheduled_at: string | null };
  if (current.status !== from) return { success: false, error: ALREADY_UPDATED };

  // You cannot miss an interview that has not happened yet (#10).
  if (
    to === 'no_show' &&
    (!current.scheduled_at || new Date(current.scheduled_at).getTime() > Date.now())
  ) {
    return {
      success: false,
      error: 'This interview has not started yet, so it cannot be marked as a no-show.',
    };
  }

  const { data: updated, error: updateError } = await supabase
    .from('hr_recruitment_interviews')
    .update({ status: to })
    .eq('id', interviewId)
    .eq('status', from)
    .select('id');
  if (updateError) {
    if (updateError.code === '42501') return { success: false, error: NO_ACCESS };
    console.error(
      `[meetings/interview-no-show] ${from} -> ${to} failed for ${interviewId}: ${updateError.code ?? 'no code'} ${updateError.message}`,
    );
    return {
      success: false,
      error: 'Could not update this interview. The reason has been logged for the team.',
    };
  }
  // Readable, permitted and in the expected status a moment ago, yet nothing
  // matched: somebody else changed it in between.
  if (!updated || updated.length === 0) return { success: false, error: ALREADY_UPDATED };

  revalidatePath('/meetings/[uid]', 'page');
  return { success: true };
}

export async function markInterviewNoShow(interviewId: string): Promise<InterviewNoShowResult> {
  return moveStatus(interviewId, 'scheduled', 'no_show');
}

export async function undoInterviewNoShow(interviewId: string): Promise<InterviewNoShowResult> {
  return moveStatus(interviewId, 'no_show', 'scheduled');
}
