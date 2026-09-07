import { describe, it, expect } from 'vitest';
import { ALLOWED_MANAGER_TRANSITIONS } from '@/app/(routes)/improvement-board/_components/board-constants';
import type { ImprovementIdeaStatus } from '@/lib/services/improvement/improvement-service';

// ---------------------------------------------------------------------------
// The UI's transition map and the RPC's transition guard are two copies of one
// rule, in two languages, and nothing linked them. They drifted: until
// 2026-09-01 the board offered `logged -> not_pursued` and
// `approved -> rejected`, both of which fn_improvement_set_status rejects with
// 'invalid transition'. A manager pressing either got an error, not a state
// change — and because the drift is silent, it survived from July.
//
// This file is the link. RPC_TRANSITIONS below mirrors the guard in
// supabase/migrations/20261101000000_improvement_activity_records_real_from_status.sql
// (itself carried forward verbatim from 20260723090000_mba_improvement_board.sql).
// Change one without the other and these tests fail.
// ---------------------------------------------------------------------------

/** The server's rule. Mirror of the IF NOT (...) guard in fn_improvement_set_status. */
const RPC_TRANSITIONS: Record<string, string[]> = {
  logged:       ['under_review', 'withdrawn', 'rejected'],
  under_review: ['approved', 'rejected', 'withdrawn', 'not_pursued'],
  approved:     ['applied', 'not_pursued'],
  applied:      ['verified', 'closed'],
  verified:     ['closed'],
  closed:       [],
  rejected:     [],
  withdrawn:    [],
  not_pursued:  [],
};

describe('the board never offers a move the server refuses', () => {
  it('every manager transition is permitted by the RPC', () => {
    const dead: string[] = [];
    for (const [from, tos] of Object.entries(ALLOWED_MANAGER_TRANSITIONS)) {
      for (const to of tos as string[]) {
        if (!RPC_TRANSITIONS[from]?.includes(to)) dead.push(`${from} -> ${to}`);
      }
    }
    // A failure here means a button that throws 'invalid transition' when pressed.
    expect(dead).toEqual([]);
  });

  it.each([
    ['logged', 'not_pursued'],
    ['approved', 'rejected'],
  ])('does not resurrect the dead button %s -> %s', (from, to) => {
    expect(ALLOWED_MANAGER_TRANSITIONS[from as ImprovementIdeaStatus]).not.toContain(to);
  });
});

describe('moves the server allows but the board deliberately withholds', () => {
  it('never offers withdrawn — that belongs to the author, not a manager', () => {
    // The RPC permits logged/under_review -> withdrawn, but its learner path
    // scopes it to the author pulling their OWN idea pre-approval. A manager
    // closing someone else's idea rejects or does-not-pursue it.
    for (const tos of Object.values(ALLOWED_MANAGER_TRANSITIONS)) {
      expect(tos as string[]).not.toContain('withdrawn');
    }
  });

  it('withholds nothing else — withdrawn is the only intentional omission', () => {
    const missing: string[] = [];
    for (const [from, tos] of Object.entries(RPC_TRANSITIONS)) {
      for (const to of tos) {
        if (to === 'withdrawn') continue;
        if (!(ALLOWED_MANAGER_TRANSITIONS[from as ImprovementIdeaStatus] as string[]).includes(to)) {
          missing.push(`${from} -> ${to}`);
        }
      }
    }
    // Until 2026-09-01 this caught `approved -> not_pursued` and
    // `applied -> closed`: valid moves a manager simply had no button for.
    expect(missing).toEqual([]);
  });
});

describe('the graph itself stays sane', () => {
  it('terminal statuses lead nowhere', () => {
    for (const s of ['closed', 'rejected', 'withdrawn', 'not_pursued'] as const) {
      expect(ALLOWED_MANAGER_TRANSITIONS[s]).toEqual([]);
    }
  });

  it('the happy path to verified is reachable one step at a time', () => {
    const path: ImprovementIdeaStatus[] = ['logged', 'under_review', 'approved', 'applied', 'verified'];
    for (let i = 0; i < path.length - 1; i++) {
      expect(ALLOWED_MANAGER_TRANSITIONS[path[i]]).toContain(path[i + 1]);
    }
  });
});
