// __tests__/lib/improvement-board/verified-value.test.ts
//
// 2026-09-06 — the Improvement Board's rupee value finally gets a writer.
//
// improvement_ideas has carried verified_value_inr / value_verified_at /
// value_holds since July 2026 with NO write path anywhere in the repo. On
// production this file's date: 55 ideas, 0 valued, 0 verified, 0 builders.
// Two finished features sat dead behind that gap — fn_case_study_start (which
// refuses unless `status='verified' AND value_holds IS TRUE`) and
// resident-promotion-service (which sums verified_value_inr).
//
// WHAT THIS FILE GUARDS
//   The rules live in TWO places by design: the SECURITY DEFINER RPC
//   fn_improvement_set_verified_value, and validateVerifiedValue() in
//   lib/services/improvement/improvement-value-service.ts, so a caller can
//   refuse a nonsense entry without a round-trip. Two copies of one rule drift.
//   They already did once in this exact module: the board's transition map and
//   fn_improvement_set_status's guard disagreed silently from July to
//   September 2026 (see manager-transitions.test.ts, the sibling of this file).
//
//   So the SQL is read off disk here and asserted against, rather than
//   transcribed. Edit one side without the other and these tests go red.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// The service reaches createClientSupabaseClient at module init, which throws
// without Supabase env vars. Captured so the RPC payload can be asserted.
const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
let rpcError: { message: string } | null = null;

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve({ data: null, error: rpcError });
    },
  }),
}));

vi.mock('@/lib/utils/enhanced-logger', () => ({
  logger: { dev: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  VALUE_RECORDABLE_STATUSES,
  canRecordVerifiedValue,
  validateVerifiedValue,
  recordVerifiedValue,
} from '@/lib/services/improvement/improvement-value-service';

const MIGRATION = path.join(
  process.cwd(),
  'supabase/migrations/20261111000000_improvement_record_verified_value.sql'
);
const sql = fs.readFileSync(MIGRATION, 'utf8');

/** Every status in the enum, from 20260723090000. */
const ALL_STATUSES = [
  'logged',
  'under_review',
  'approved',
  'applied',
  'verified',
  'closed',
  'rejected',
  'withdrawn',
  'not_pursued',
] as const;

// ---------------------------------------------------------------------------
// 1. The mirror matches the migration
// ---------------------------------------------------------------------------
describe('the TypeScript guard and the SQL guard are the same rule', () => {
  it('the statuses this service allows are exactly the ones the RPC allows', () => {
    // The guard reads:
    //   IF v_status NOT IN ('applied'::…, 'verified'::…) THEN RAISE …
    const guard = sql.match(
      /IF v_status NOT IN \(([\s\S]*?)\) THEN/
    );
    expect(guard, 'the status guard is no longer recognisable in the migration').not.toBeNull();

    const sqlStatuses = [...guard![1].matchAll(/'([a-z_]+)'::/g)].map((m) => m[1]).sort();
    expect(sqlStatuses).toEqual([...VALUE_RECORDABLE_STATUSES].sort());
  });

  it('records at applied as well as verified — the case-study RPC depends on it', () => {
    // fn_case_study_start (20260809011500, LIVE in production) carries an error
    // branch for "value was checked and it did hold, but the idea itself is
    // <status>, not verified". That branch is unreachable dead code unless a
    // value can be recorded before the status moves. Proven on production
    // 2026-09-06 by driving exactly that state.
    expect(canRecordVerifiedValue('applied')).toBe(true);
    expect(canRecordVerifiedValue('verified')).toBe(true);
  });

  it('refuses every other status, closed included', () => {
    const refused = ALL_STATUSES.filter((s) => !canRecordVerifiedValue(s));
    expect(refused).toEqual([
      'logged',
      'under_review',
      'approved',
      'closed',
      'rejected',
      'withdrawn',
      'not_pursued',
    ]);
  });

  it('the RPC never moves status — that stays fn_improvement_set_status', () => {
    const body = sql.slice(sql.indexOf('UPDATE public.improvement_ideas SET'));
    const updateStmt = body.slice(0, body.indexOf('RETURNING'));
    expect(updateStmt).not.toMatch(/\bstatus\s*=/);
    expect(updateStmt).not.toMatch(/verified_by\s*=/);
    expect(updateStmt).not.toMatch(/estimated_value_inr\s*=/);
    // …and writes exactly the three columns it exists for.
    expect(updateStmt).toMatch(/verified_value_inr\s*=/);
    expect(updateStmt).toMatch(/value_holds\s*=/);
    expect(updateStmt).toMatch(/value_verified_at\s*=/);
  });
});

// ---------------------------------------------------------------------------
// 2. The mandatory ACL shape (CLAUDE.md: Supabase grants anon EXECUTE on every
//    new function by default, separately from PUBLIC)
// ---------------------------------------------------------------------------
describe('the new RPC is not reachable by anon', () => {
  const SIG = 'public.fn_improvement_set_verified_value(uuid, numeric, boolean, text)';

  it('revokes EXECUTE from anon AND PUBLIC', () => {
    expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION ${SIG} FROM anon, PUBLIC;`);
  });

  it('grants EXECUTE only to authenticated', () => {
    expect(sql).toContain(`GRANT  EXECUTE ON FUNCTION ${SIG} TO authenticated;`);
    expect(sql).not.toMatch(/GRANT\s+EXECUTE[^;]*TO[^;]*\banon\b/);
  });

  it('asserts the grants at apply time rather than hoping', () => {
    expect(sql).toMatch(/has_function_privilege\(\s*'anon'/);
    expect(sql).toMatch(/has_function_privilege\(\s*'authenticated'/);
  });

  it('is SECURITY DEFINER with a pinned search_path', () => {
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public/);
  });

  it('checks the caller is a board manager, failing closed on a NULL probe', () => {
    expect(sql).toContain("user_has_permission('improvement.board.manage')");
    // COALESCE matters: fn_improvement_set_status assigns the three probes bare
    // into a boolean and tests `IF NOT v_is_manager`, where a NULL takes
    // neither branch and falls through as though the caller were a manager.
    expect(sql).toMatch(/COALESCE\(\s*is_super_admin\(\),\s*false\s*\)/);
    expect(sql).toMatch(/COALESCE\(\s*user_has_permission\('improvement\.board\.manage'\),\s*false\s*\)/);
  });
});

// ---------------------------------------------------------------------------
// 3. The constraint that survives a direct PATCH
// ---------------------------------------------------------------------------
describe('a rejected value cannot carry a figure, even without the RPC', () => {
  it('adds the table CHECK, because the UPDATE policy lets managers PATCH directly', () => {
    // improvement_ideas_update grants a board.manage holder USING/WITH CHECK
    // true with NO column restriction (verified in pg_policies on production),
    // so guarding this in the function alone would leave the hole open.
    expect(sql).toContain('improvement_ideas_value_holds_figure_chk');
    expect(sql).toMatch(
      /CHECK \(value_holds IS DISTINCT FROM false OR verified_value_inr IS NULL\)/
    );
  });

  it('asserts the constraint exists AND is validated at apply time', () => {
    expect(sql).toMatch(/conname\s*=\s*'improvement_ideas_value_holds_figure_chk'/);
    expect(sql).toMatch(/AND convalidated/);
  });
});

// ---------------------------------------------------------------------------
// 4. validateVerifiedValue — the rules themselves
// ---------------------------------------------------------------------------
describe('validateVerifiedValue', () => {
  it('accepts a figure that holds at applied and at verified', () => {
    for (const s of VALUE_RECORDABLE_STATUSES) {
      expect(validateVerifiedValue(s, { valueHolds: true, verifiedValueInr: 42500.5 })).toBeNull();
    }
  });

  it('accepts zero — a fix worth nothing measurable still measured', () => {
    expect(validateVerifiedValue('applied', { valueHolds: true, verifiedValueInr: 0 })).toBeNull();
  });

  it('accepts "it did not hold" with no figure', () => {
    expect(validateVerifiedValue('applied', { valueHolds: false })).toBeNull();
    expect(validateVerifiedValue('applied', { valueHolds: false, verifiedValueInr: null })).toBeNull();
  });

  it.each(['logged', 'under_review', 'approved', 'closed', 'rejected', 'withdrawn', 'not_pursued'])(
    'refuses status %s and names it back to the user',
    (status) => {
      const why = validateVerifiedValue(status, { valueHolds: true, verifiedValueInr: 100 });
      expect(why).toContain('once the fix has been applied');
      expect(why).toContain(`"${status}"`);
    }
  );

  it('refuses a value that holds with no figure', () => {
    expect(validateVerifiedValue('applied', { valueHolds: true })).toMatch(/needs a figure/);
    expect(validateVerifiedValue('applied', { valueHolds: true, verifiedValueInr: null })).toMatch(
      /needs a figure/
    );
  });

  it('refuses NaN — Postgres numeric accepts it and sorts it ABOVE every number', () => {
    // On production: 'NaN'::numeric < 0 is FALSE and 'NaN'::numeric > 999999 is
    // TRUE, so a bare `< 0` test on either side lets NaN into a stipend figure.
    expect(validateVerifiedValue('applied', { valueHolds: true, verifiedValueInr: NaN })).toMatch(
      /not a number/
    );
  });

  it('refuses Infinity for the same reason', () => {
    expect(
      validateVerifiedValue('applied', { valueHolds: true, verifiedValueInr: Infinity })
    ).toMatch(/not a number/);
  });

  it('refuses a negative figure', () => {
    expect(validateVerifiedValue('applied', { valueHolds: true, verifiedValueInr: -1 })).toMatch(
      /cannot be negative/
    );
  });

  it('refuses a figure attached to a value that does NOT hold', () => {
    // The load-bearing one. resident-promotion-service sums verified_value_inr
    // for every verified idea without consulting value_holds, so this row would
    // credit a learner with a number a manager just rejected.
    expect(validateVerifiedValue('verified', { valueHolds: false, verifiedValueInr: 5000 })).toMatch(
      /does not hold cannot carry a figure/
    );
  });

  it('refuses an unanswered verdict — NULL means "not yet checked", not a verdict', () => {
    const why = validateVerifiedValue('applied', {
      valueHolds: null as unknown as boolean,
      verifiedValueInr: 100,
    });
    expect(why).toMatch(/Say whether the value holds/);
  });
});

// ---------------------------------------------------------------------------
// 5. recordVerifiedValue — what actually goes over the wire
// ---------------------------------------------------------------------------
describe('recordVerifiedValue', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    rpcError = null;
  });

  it('calls the RPC with the four named parameters', async () => {
    await recordVerifiedValue('idea-1', {
      valueHolds: true,
      verifiedValueInr: 60000,
      note: '  recount  ',
    });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe('fn_improvement_set_verified_value');
    expect(rpcCalls[0].args).toEqual({
      p_idea_id: 'idea-1',
      p_verified_value_inr: 60000,
      p_value_holds: true,
      p_note: 'recount',
    });
  });

  it('sends NULL rather than a stale figure when the value does not hold', async () => {
    // Guards the UI shape where a manager types a number, then flips the
    // verdict to "did not hold" without clearing the box. Sending that figure
    // is refused by the RPC anyway — this stops the round-trip being wasted,
    // and stops the number reaching a row if the guard is ever loosened.
    await recordVerifiedValue('idea-1', { valueHolds: false, verifiedValueInr: 5000 });
    expect(rpcCalls[0].args.p_verified_value_inr).toBeNull();
    expect(rpcCalls[0].args.p_value_holds).toBe(false);
  });

  it('sends NULL for a blank note rather than an empty string', async () => {
    await recordVerifiedValue('idea-1', { valueHolds: true, verifiedValueInr: 1, note: '   ' });
    expect(rpcCalls[0].args.p_note).toBeNull();
  });

  it('throws the server refusal verbatim, so the manager reads the real reason', async () => {
    rpcError = {
      message:
        'A verified value can only be recorded once the fix has been applied. This idea is "logged", not "applied" or "verified".',
    };
    await expect(
      recordVerifiedValue('idea-1', { valueHolds: true, verifiedValueInr: 1 })
    ).rejects.toThrow(/This idea is "logged"/);
  });
});
