'use client';

/**
 * Loads the learners a practical batch can be built from.
 *
 * Added: 2026-08-17, extracted from practical-period-config-form.tsx while
 * fixing the picker that sat on "Loading learners..." forever.
 *
 * The original effect cancelled its own request:
 *
 *   useEffect(() => {
 *     if (!enabled || state !== 'idle') return;   // guard on its own state
 *     let cancelled = false;
 *     setState('loading');                        // ...which is also a dep
 *     fetch().then(r => { if (!cancelled) ... });
 *     return () => { cancelled = true };          // ...so this fires and kills it
 *   }, [enabled, state, ...]);
 *
 * Setting 'loading' changed a dependency, React re-ran the effect, and the
 * previous run's cleanup discarded the response that would have set 'loaded'.
 * The re-run then failed the `!== 'idle'` guard, so nothing replaced it: the
 * state machine parks on 'loading' with no request in flight and no error to
 * show. StrictMode (on by default in Next 15) makes it certain rather than a
 * race — both mount invocations pass the guard while the closure still reads
 * 'idle', both get cancelled, and the guard blocks any third attempt.
 *
 * Two changes fix it, and both matter:
 *
 *   1. The effect no longer depends on state it sets. Dedupe moved to a ref
 *      keyed by scope, so re-running is harmless and cannot bounce.
 *   2. Cleanup no longer cancels. There is nothing to cancel — the scope is in
 *      the dependency list, so a stale response can only belong to a scope the
 *      ref has already moved past, and the ref check below drops it.
 *
 * The rule this encodes: never guard an effect on state the effect assigns.
 * Track "already started" somewhere that does not trigger a re-render.
 */

import { useEffect, useRef, useState } from 'react';

export interface BatchLearner {
  id: string;
  name: string;
  roll_number: string;
  section_name: string;
}

export type BatchLearnersState = 'idle' | 'loading' | 'loaded' | 'error';

export interface UseBatchLearnersResult {
  learners: BatchLearner[];
  state: BatchLearnersState;
}

function scopeKeyOf(programId?: string | null, semesterId?: string | null): string {
  return `${programId ?? ''}|${semesterId ?? ''}`;
}

export function useBatchLearners(params: {
  /** False until some batch is set to manual — most practical periods never need this. */
  enabled: boolean;
  programId?: string | null;
  semesterId?: string | null;
}): UseBatchLearnersResult {
  const { enabled, programId, semesterId } = params;

  const [learners, setLearners] = useState<BatchLearner[]>([]);
  const [state, setState] = useState<BatchLearnersState>('idle');

  /**
   * The scope whose request has already been issued. A ref, not state, so the
   * effect can read it without listing it as a dependency — which is the whole
   * reason the previous version deadlocked.
   */
  const requestedScopeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!programId && !semesterId) return;

    const scopeKey = scopeKeyOf(programId, semesterId);
    if (requestedScopeRef.current === scopeKey) return;
    requestedScopeRef.current = scopeKey;

    setState('loading');

    const load = async () => {
      try {
        const { LearnerProfileService } = await import(
          '@/lib/services/learner-profile-service'
        );
        const response = await LearnerProfileService.getLearnerProfiles({
          ...(programId ? { program_id: programId } : {}),
          ...(semesterId ? { semester_id: semesterId } : {}),
          // Graduated and discontinued learners keep their section — one sits in
          // the I B.SC CHEMISTRY cohort this was built for. Offering them would
          // let a batch be authored against somebody who can never appear on the
          // marking roster.
          lifecycle_status: 'active',
          limit: 1000
        } as any);

        // A response for a scope the picker has already moved past is stale;
        // dropping it here is what makes cancelling on cleanup unnecessary.
        if (requestedScopeRef.current !== scopeKey) return;

        setLearners(
          (response?.data || []).map((learner: any) => ({
            id: learner.id,
            name:
              `${learner.first_name || ''} ${learner.last_name || ''}`.trim() ||
              learner.roll_number ||
              'Unnamed learner',
            roll_number: learner.roll_number || '',
            section_name: learner.section?.section_name || ''
          }))
        );
        setState('loaded');
      } catch {
        if (requestedScopeRef.current !== scopeKey) return;
        // Clear the ref so the next render can retry. Reporting 'error' rather
        // than an empty list matters: "no active learners found" reads as a
        // data problem and sends the author to the office instead of retrying.
        requestedScopeRef.current = null;
        setState('error');
      }
    };

    load();
  }, [enabled, programId, semesterId]);

  return { learners, state };
}
