/**
 * What the head of department may do with one appraisal on the team board,
 * and the plain line that says where it is when they may do nothing.
 *
 * The board lists every appraisal in the department, not only the ones
 * waiting for the head. Before this, opening a draft or an appraisal already
 * passed to the committee still offered "Submit to SEDC", and a click came
 * back as the service's raw "Invalid review status transition" error. The
 * controls now appear only where the database would accept them: the
 * appraisal is self_submitted AND the round is open.
 */

import type { ReviewStatus } from '@/lib/services/hr/performance-review-service';

export interface HeadStep {
  /** Offer "Submit to SEDC" and "Send back to the person". */
  canReview: boolean;
  /** Where the appraisal is, when the head cannot act on it. */
  note: string | null;
}

export const HEAD_STEP_NOTES = {
  draft: 'Still a draft — the person has not submitted it yet.',
  lockedRound:
    'This round is locked, so the appraisal can no longer be reviewed or sent back. ' +
    'Ask HR to reopen the round if something still needs to change.',
  supervisor_reviewed: 'You reviewed this — it is with the committee now.',
  sedc_reviewed: 'The committee has reviewed this — it is with the Director for sign-off.',
  final_approved: 'Signed off by the Director — this appraisal is closed.',
} as const;

export function headStep(status: ReviewStatus, roundStatus: string | null | undefined): HeadStep {
  if (status === 'self_submitted') {
    return roundStatus === 'open'
      ? { canReview: true, note: null }
      : { canReview: false, note: HEAD_STEP_NOTES.lockedRound };
  }
  if (status === 'draft') return { canReview: false, note: HEAD_STEP_NOTES.draft };
  if (status === 'supervisor_reviewed') {
    return { canReview: false, note: HEAD_STEP_NOTES.supervisor_reviewed };
  }
  if (status === 'sedc_reviewed') return { canReview: false, note: HEAD_STEP_NOTES.sedc_reviewed };
  if (status === 'final_approved') return { canReview: false, note: HEAD_STEP_NOTES.final_approved };
  return { canReview: false, note: 'This appraisal cannot be changed from here.' };
}

/** Shown when the appraisal moved on after the board was loaded. */
export const MOVED_ON_MESSAGE =
  'This appraisal has moved on since the board was loaded. The board has been refreshed to show where it is now.';

/**
 * The service's state-machine refusals are written for developers. If one
 * still reaches the head (the appraisal changed underneath an open board),
 * say what happened instead.
 */
export function isMovedOnError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  return /^Invalid review status transition/.test(msg) || /^A send-back must go one step back/.test(msg);
}

/** A person on the board: name when it can be read, otherwise a neutral label. */
export interface TeamPerson {
  name: string | null;
  department: string | null;
}

export const UNNAMED_PERSON = 'Team member';

export function personName(people: Record<string, TeamPerson>, staffId: string): string {
  return people[staffId]?.name || UNNAMED_PERSON;
}
