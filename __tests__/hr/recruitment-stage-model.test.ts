import { describe, expect, it } from 'vitest';

import {
  CANDIDATE_STATUS_LABELS,
  JOB_APPLICATION_STATUS_LABELS,
  type CandidateStatus,
  type JobApplicationStatus,
} from '@/types/hr-recruitment';
import {
  STAGE_META,
  applicationStage,
  candidateStage,
} from '@/app/(routes)/hr/recruitment/approvals/[jobId]/_components/stage-model';

/**
 * The Candidates tab does `STAGE_META[row.stage]` and dereferences the result
 * without a guard, so ANY status that maps outside STAGE_META takes the whole
 * page down with "Cannot read properties of undefined (reading 'badge')".
 *
 * That is exactly what shipped: the application branch cast a raw
 * JobApplicationStatus to StageKey, and 'promoted' is not a StageKey.
 *
 * These tests pin the invariant across EVERY member of both status enums —
 * derived from the label maps, so a newly added status is covered automatically
 * and fails here rather than in production.
 */
describe('recruitment stage model', () => {
  const applicationStatuses = Object.keys(
    JOB_APPLICATION_STATUS_LABELS,
  ) as JobApplicationStatus[];
  const candidateStatuses = Object.keys(
    CANDIDATE_STATUS_LABELS,
  ) as CandidateStatus[];

  it('covers every application status', () => {
    expect(applicationStatuses).toContain('promoted');
    expect(applicationStatuses.length).toBeGreaterThan(0);
  });

  it.each(applicationStatuses)(
    'application status "%s" maps into STAGE_META',
    (status) => {
      const meta = STAGE_META[applicationStage(status)];
      expect(meta).toBeDefined();
      expect(typeof meta.badge).toBe('string');
      expect(typeof meta.label).toBe('string');
    },
  );

  it.each(candidateStatuses)(
    'candidate status "%s" maps into STAGE_META',
    (status) => {
      const meta = STAGE_META[candidateStage(status)];
      expect(meta).toBeDefined();
      expect(typeof meta.badge).toBe('string');
      expect(typeof meta.label).toBe('string');
    },
  );

  it('treats a promoted application as being in the approval pipeline', () => {
    expect(applicationStage('promoted')).toBe('in_approval');
  });

  it('falls back to a real stage for an unknown status', () => {
    expect(
      STAGE_META[applicationStage('something_new' as JobApplicationStatus)],
    ).toBeDefined();
    expect(
      STAGE_META[candidateStage('something_new' as CandidateStatus)],
    ).toBeDefined();
  });
});
