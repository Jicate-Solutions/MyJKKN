import { describe, it, expect } from 'vitest';
import { AI_ROUTINES } from '@/lib/ai-routines/registry';

// ---------------------------------------------------------------------------
// featureKey coverage invariant.
//
// AIRoutine.featureKey is the ONLY bridge between the static routine registry
// (lib/ai-routines/*.ts, what /admin/ai-routines renders) and the ai_job_types
// registry table (what /admin/ai-models renders, joined by job_type ===
// feature_key). A routine with no featureKey silently vanishes from any join
// between the two pages — and before this file existed, 34 of them did, with
// no way to tell "deliberately unlinked" from "somebody forgot".
//
// Director decision 2026-08-01: do NOT guess a job_type. Where the routine's
// own code path does not make the link unambiguous — it is rules-based SQL, it
// enqueues more than one job type, or its model runs outside ai_model_config —
// the honest answer is an explicit null PLUS a featureKeyNote saying why.
//
// So the invariant every routine must satisfy is exactly one of:
//   (a) featureKey is a non-empty string, or
//   (b) featureKey is null/undefined AND featureKeyNote is a non-empty string.
//
// This makes unlinked-and-unexplained impossible to add later without the
// author being told, at test time, to write one sentence about why.
// ---------------------------------------------------------------------------

describe('AI routine registry — featureKey coverage', () => {
  it('either links every routine to a job type or explains why it is unlinked', () => {
    const unexplained = AI_ROUTINES.filter((r) => {
      const linked = typeof r.featureKey === 'string' && r.featureKey.trim().length > 0;
      if (linked) return false;
      return !(typeof r.featureKeyNote === 'string' && r.featureKeyNote.trim().length > 0);
    }).map((r) => `${r.id} (no featureKey and no featureKeyNote)`);

    expect(unexplained).toEqual([]);
  });

  it('never carries an empty-string featureKey (unlinked must be null, not "")', () => {
    // '' is falsy everywhere the UI checks it, so it renders like "unlinked"
    // while reading like "linked" in the source — the worst of both.
    const blanks = AI_ROUTINES.filter(
      (r) => typeof r.featureKey === 'string' && r.featureKey.trim().length === 0,
    ).map((r) => r.id);

    expect(blanks).toEqual([]);
  });

  it('does not attach a featureKeyNote to a routine that IS linked', () => {
    // A note beside a live key is a contradiction: one of the two is stale.
    const contradictory = AI_ROUTINES.filter(
      (r) =>
        typeof r.featureKey === 'string' &&
        r.featureKey.trim().length > 0 &&
        typeof r.featureKeyNote === 'string' &&
        r.featureKeyNote.trim().length > 0,
    ).map((r) => `${r.id} (featureKey='${r.featureKey}' AND a featureKeyNote)`);

    expect(contradictory).toEqual([]);
  });
});
