import { describe, it, expect } from 'vitest';
import { AI_ROUTINES } from '@/lib/ai-routines/registry';
import knownJobTypes from './known-job-types.json';

// ---------------------------------------------------------------------------
// Job types a routine legitimately references but which are NOT registered in
// production. Each entry is a KNOWN GAP with a reason — not permission to
// invent keys. Remove an entry the moment its migration is applied; the
// resolution test below then enforces it for good.
// ---------------------------------------------------------------------------
// Currently empty, and that is the healthy state. The first entry here was
// 'learner.360_verdict': its route shipped deployed while
// supabase/migrations/20260808110003_learner_360_verdict.sql had never been
// applied, so every enqueue would have answered with a silent
// {ok:false,'unknown or disabled job_type'}. The migration was applied to
// production on 2026-08-02 (2 tables, 2 SECDEF RPCs, the ai_job_types row and
// the 06:37 IST schedule row), the snapshot below was refreshed to 61 job
// types, and the entry was deleted — which is exactly what the staleness test
// at the bottom of this file exists to force.
const KNOWN_UNREGISTERED: Record<string, string> = {};

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

  // -------------------------------------------------------------------------
  // The assertion that crosses the boundary.
  //
  // The three tests above check the SHAPE of featureKey — present, non-blank,
  // not contradicted by a note. None of them checks that the string names a
  // job type that actually EXISTS. That gap is not hypothetical: the first
  // version of this suite shipped green while `learner.360_verdict` pointed at
  // a job type absent from production, because a fabricated key is still a
  // non-empty string.
  //
  // An in-file test can only prove the file agrees with itself. This one
  // resolves every key against a checked-in snapshot of production's
  // ai_job_types, so a typo or an unregistered link fails the build instead of
  // rendering as a silently-missing chip.
  // -------------------------------------------------------------------------
  it('resolves every featureKey to a registered job type (or a declared known gap)', () => {
    const registered = new Set<string>(knownJobTypes.jobTypes);

    const unresolvable = AI_ROUTINES.filter((r) => {
      const key = typeof r.featureKey === 'string' ? r.featureKey.trim() : '';
      if (!key) return false; // unlinked is covered by the first test
      return !registered.has(key) && !(key in KNOWN_UNREGISTERED);
    }).map(
      (r) =>
        `${r.id} -> featureKey '${r.featureKey}' is in neither ai_job_types ` +
        `(see known-job-types.json) nor KNOWN_UNREGISTERED. Either it is a typo, ` +
        `or its migration was never applied — add it to KNOWN_UNREGISTERED with ` +
        `the reason, or fix the key.`,
    );

    expect(unresolvable).toEqual([]);
  });

  it('keeps KNOWN_UNREGISTERED honest — every entry is still referenced and still unregistered', () => {
    const registered = new Set<string>(knownJobTypes.jobTypes);
    const referenced = new Set(
      AI_ROUTINES.map((r) => (typeof r.featureKey === 'string' ? r.featureKey.trim() : '')).filter(
        Boolean,
      ),
    );

    // A gap that is now registered, or no longer referenced by any routine, is
    // stale — deleting it is the whole point of tracking it here.
    const stale = Object.keys(KNOWN_UNREGISTERED).flatMap((k) => {
      if (registered.has(k))
        return [`'${k}' IS now registered — delete it from KNOWN_UNREGISTERED.`];
      if (!referenced.has(k))
        return [`'${k}' is no longer referenced by any routine — delete it from KNOWN_UNREGISTERED.`];
      return [];
    });

    expect(stale).toEqual([]);
  });
});
