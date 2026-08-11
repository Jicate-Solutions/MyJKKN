/**
 * Unified stage model for the job workspace Candidates tab.
 *
 * The tab merges two different record types into one list — screening rows from
 * hr_job_applications and pipeline rows from hr_recruitment_candidates — each
 * with its own status enum. Both are normalised to a single StageKey so one
 * badge/chip vocabulary can describe the whole pipeline.
 *
 * Lives in its own module (no React) so the mapping can be unit-tested without
 * mounting the tab. See __tests__/hr/recruitment-stage-model.test.ts.
 *
 * INVARIANT: every mapper must return a key that exists in STAGE_META. Callers
 * index STAGE_META directly, so a stage outside it is a render-time crash, not
 * a missing badge. Both mappers therefore end in a fallback rather than a cast.
 */

import type { CandidateStatus, JobApplicationStatus } from '@/types/hr-recruitment';

export type StageKey =
  | 'pending' | 'reviewed' | 'shortlisted' | 'in_approval'
  | 'approved' | 'joined' | 'rejected' | 'closed';

export const STAGE_META: Record<StageKey, { label: string; badge: string }> = {
  pending:     { label: 'Pending Review', badge: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300' },
  reviewed:    { label: 'Reviewed',       badge: 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300' },
  shortlisted: { label: 'Shortlisted',    badge: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-300' },
  in_approval: { label: 'In Approval',    badge: 'border-violet-200 bg-violet-50 text-violet-800 dark:border-violet-800 dark:bg-violet-950/60 dark:text-violet-300' },
  approved:    { label: 'Approved',       badge: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' },
  joined:      { label: 'Joined',         badge: 'border-emerald-300 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200' },
  rejected:    { label: 'Rejected',       badge: 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/60 dark:text-red-300' },
  closed:      { label: 'Closed',         badge: 'border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400' },
};

export const CHIP_ORDER: (StageKey | 'all')[] = [
  'all', 'pending', 'reviewed', 'shortlisted', 'in_approval', 'approved', 'joined', 'rejected', 'closed',
];

/** Always-safe STAGE_META lookup — never returns undefined. */
export function stageMeta(stage: StageKey): { label: string; badge: string } {
  return STAGE_META[stage] ?? STAGE_META.closed;
}

export function candidateStage(status: CandidateStatus): StageKey {
  if (status === 'submitted' || status === 'pending_approval') return 'in_approval';
  if (status === 'approved' || status === 'package_fixed' || status === 'offer_issued') return 'approved';
  if (status === 'joined') return 'joined';
  if (status === 'rejected') return 'rejected';
  return 'closed'; // withdrawn | offer_rescinded | no_show
}

/**
 * Screening-row stage. Four application statuses share a name with a StageKey,
 * which is why this was previously written as a bare `as StageKey` cast — but
 * 'promoted' has no StageKey of its own and took the page down when the first
 * application reached it. A promoted application is one whose candidate is in
 * the approval chain, matching JOB_APPLICATION_STATUS_LABELS.promoted
 * ('In Approval Pipeline'), so it maps to 'in_approval'.
 */
export function applicationStage(status: JobApplicationStatus): StageKey {
  switch (status) {
    case 'pending':
      return 'pending';
    case 'reviewed':
      return 'reviewed';
    case 'shortlisted':
      return 'shortlisted';
    case 'rejected':
      return 'rejected';
    case 'promoted':
      return 'in_approval';
    default:
      return 'closed';
  }
}
