// @vitest-environment jsdom
//
// The docblock, not vitest.config.js: `environmentMatchGlobs` is a no-op in
// Vitest 4 (this project is on 4.1.7), so the globs listed there silently do
// nothing and any test relying on them gets `document is not defined`.

/**
 * Regression tests for loading the learner list behind the practical-batch
 * picker.
 *
 * Reported 2026-08-17 against the BUG-005826 fix running on localhost: the
 * picker read its saved membership correctly ("Learners in this Batch (11
 * selected)", "Student Count (from selection) 11") but the list underneath was
 * stuck on "Loading learners..." forever, so nobody could change the selection.
 *
 * Root cause: the loading effect depended on the very state it sets, and
 * cancelled its own request on cleanup.
 *
 *   useEffect(() => {
 *     if (!needsLearners || learnersState !== 'idle') return;   // <- guard
 *     let cancelled = false;
 *     setLearnersState('loading');                              // <- changes a dep
 *     fetch().then(r => { if (!cancelled) ... });
 *     return () => { cancelled = true };                        // <- kills it
 *   }, [needsLearners, learnersState, ...]);
 *
 * Setting 'loading' changed a dependency, so React re-ran the effect; the
 * cleanup for the previous run set `cancelled = true`, discarding the in-flight
 * response that would have set 'loaded'; and the re-run then hit the
 * `!== 'idle'` guard and never issued a replacement. The state machine parks on
 * 'loading' with no request in flight and no error to show.
 *
 * React StrictMode (on by default in Next 15, hence dev-only) double-invokes
 * mount effects and makes it certain rather than a race. Both runs pass the
 * guard while the closure still reads 'idle', both get cancelled, and no third
 * attempt is allowed.
 *
 * These tests therefore render under StrictMode deliberately. A test that
 * skipped it would pass against the broken hook.
 */

import React, { StrictMode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const getLearnerProfiles = vi.fn();

vi.mock('@/lib/services/learner-profile-service', () => ({
  LearnerProfileService: {
    getLearnerProfiles: (...args: unknown[]) => getLearnerProfiles(...args)
  }
}));

import { useBatchLearners } from '@/hooks/use-batch-learners';

/** The real I B.SC CHEMISTRY cohort scope from BUG-005826. */
const SCOPE = {
  programId: '405fece5-b0f5-4a77-912e-ec53ce3afa51',
  semesterId: '21cf48c2-0219-4f30-a710-6fbb8e851360'
};

const ROWS = [
  {
    id: '3f371271-5b02-4bc6-a20a-464d78f9db7e',
    first_name: 'AKILA',
    last_name: 'N',
    roll_number: 'AUG26CH01',
    section: { section_name: 'A' }
  },
  {
    id: '3047b29d-dd6c-49ae-b5b0-89b949d191e4',
    first_name: 'ARCHANA',
    last_name: 'K',
    roll_number: 'AUG26CH02',
    section: { section_name: 'A' }
  }
];

beforeEach(() => {
  getLearnerProfiles.mockReset();
  getLearnerProfiles.mockResolvedValue({ data: ROWS });
});

describe('useBatchLearners', () => {
  it('loads the cohort under StrictMode instead of parking on "loading"', async () => {
    const { result } = renderHook(
      () => useBatchLearners({ enabled: true, ...SCOPE }),
      { wrapper: StrictMode }
    );

    await waitFor(() => expect(result.current.state).toBe('loaded'));
    expect(result.current.learners).toHaveLength(2);
    expect(result.current.learners[0]).toMatchObject({
      id: ROWS[0].id,
      name: 'AKILA N',
      roll_number: 'AUG26CH01'
    });
  });

  it('issues exactly one request despite the double-invoked mount effect', async () => {
    const { result } = renderHook(
      () => useBatchLearners({ enabled: true, ...SCOPE }),
      { wrapper: StrictMode }
    );

    await waitFor(() => expect(result.current.state).toBe('loaded'));
    // Two identical round trips for one picker is waste the roster query cannot
    // afford — getLearnerProfiles asks for count:'exact', an unbounded scan.
    expect(getLearnerProfiles).toHaveBeenCalledTimes(1);
  });

  it('scopes the query to the programme and semester, active learners only', async () => {
    const { result } = renderHook(
      () => useBatchLearners({ enabled: true, ...SCOPE }),
      { wrapper: StrictMode }
    );

    await waitFor(() => expect(result.current.state).toBe('loaded'));
    expect(getLearnerProfiles).toHaveBeenCalledWith(
      expect.objectContaining({
        program_id: SCOPE.programId,
        semester_id: SCOPE.semesterId,
        // A graduated learner sits in this very section. Offering one would let
        // a batch be authored against somebody who can never appear on the
        // marking roster.
        lifecycle_status: 'active'
      })
    );
  });

  it('does not query until a batch actually needs the list', async () => {
    const { result } = renderHook(
      () => useBatchLearners({ enabled: false, ...SCOPE }),
      { wrapper: StrictMode }
    );

    await waitFor(() => expect(result.current.state).toBe('idle'));
    expect(getLearnerProfiles).not.toHaveBeenCalled();
  });

  it('starts loading when a batch is switched to manual after mount', async () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useBatchLearners({ enabled, ...SCOPE }),
      { wrapper: StrictMode, initialProps: { enabled: false } }
    );

    expect(getLearnerProfiles).not.toHaveBeenCalled();

    rerender({ enabled: true });

    await waitFor(() => expect(result.current.state).toBe('loaded'));
    expect(result.current.learners).toHaveLength(2);
  });

  it('reports an error rather than pretending the cohort is empty', async () => {
    // "No active learners found" on a failed request would read as a data
    // problem and send the author to the office instead of to a retry.
    getLearnerProfiles.mockRejectedValue(new Error('statement timeout'));

    const { result } = renderHook(
      () => useBatchLearners({ enabled: true, ...SCOPE }),
      { wrapper: StrictMode }
    );

    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current.learners).toEqual([]);
  });

  it('stays idle when there is no scope to query', async () => {
    const { result } = renderHook(
      () => useBatchLearners({ enabled: true, programId: null, semesterId: null }),
      { wrapper: StrictMode }
    );

    await waitFor(() => expect(result.current.state).toBe('idle'));
    expect(getLearnerProfiles).not.toHaveBeenCalled();
  });

  it('refetches when the scope changes', async () => {
    const { result, rerender } = renderHook(
      ({ semesterId }) =>
        useBatchLearners({ enabled: true, programId: SCOPE.programId, semesterId }),
      { wrapper: StrictMode, initialProps: { semesterId: SCOPE.semesterId } }
    );

    await waitFor(() => expect(result.current.state).toBe('loaded'));
    expect(getLearnerProfiles).toHaveBeenCalledTimes(1);

    rerender({ semesterId: '11111111-1111-4111-8111-111111111111' });

    await waitFor(() => expect(getLearnerProfiles).toHaveBeenCalledTimes(2));
    expect(result.current.state).toBe('loaded');
  });
});
