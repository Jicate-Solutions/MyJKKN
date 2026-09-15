/**
 * Migration 20261202090000 widens fn_my_desk_waiting's `offer` branch and
 * restarts its clock when an offer is issued — and is only allowed to do that.
 *
 * WHY THIS IS A TEST AND NOT A PASTED DIFF. The migration is a CREATE OR REPLACE
 * of a function that computes SIX desk queues. Its predecessor's header made the
 * same promise in prose — "the five existing branches below are byte-for-byte the
 * applied text" — and prose cannot be re-checked after a later edit. This file
 * re-derives the claim from the files every time CI runs, so a future edit that
 * quietly changes the refund or leave branch while touching the offer one is
 * caught by name.
 *
 * ⚠️ WHICH PREDECESSOR — review round 1 (P4) found this file asserting against the
 * WRONG one, which let a real regression through. Version prefixes in this repo
 * are a SEQUENCE, not a date, and they do not match authorship order:
 *
 *   20261018030000_fn_my_desk_waiting_offer_source.sql   added 2026-09-03
 *   20260908170000_leave_approval_org_scope.sql          added 2026-09-08  ← newest
 *
 * 20260908170000 has the LOWER prefix but was authored five days LATER, and it is
 * itself a CREATE OR REPLACE of fn_my_desk_waiting: it adds the per-applicant
 * `fn_hr_leave_scope_admits` test to the LEAVE branch. Building this replace on
 * 20261018030000 dropped that test — widening whose leave applications an approver
 * sees, and re-opening the timeout its own header says once "rendered 0 records"
 * for 94 HODs. The baseline below is the newest body, and `keeps the leave
 * org-scope test` asserts the revert by name so it cannot come back silently.
 *
 * It reads file text only; nothing here connects to a database.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const DIR = path.join(process.cwd(), 'supabase', 'migrations');
/** The NEWEST authored CREATE OR REPLACE of this function — see the note above. */
const PREV = path.join(DIR, '20260908170000_leave_approval_org_scope.sql');
const NEXT = path.join(DIR, '20261202090000_fn_my_desk_waiting_offer_issued.sql');
const SETUP = path.join(process.cwd(), 'supabase', 'setup', '02_functions.sql');

const BRANCHES = [
  'recruitment',
  'refund',
  'leave',
  'meeting_trigger',
  'grievance',
  'offer',
  'everything',
] as const;

/** Slice each `  <name> AS (` CTE out of a file's fn_my_desk_waiting, in file order. */
function ctes(file: string): Record<string, string> {
  const lines = readFileSync(file, 'utf8').split('\n');
  const starts: Array<[string, number]> = [];
  lines.forEach((ln, i) => {
    for (const n of BRANCHES) {
      if (ln === `  ${n} AS (` && !starts.some(([m]) => m === n)) starts.push([n, i]);
    }
  });
  starts.sort((a, b) => a[1] - b[1]);
  const out: Record<string, string> = {};
  starts.forEach(([n, s], idx) => {
    const e = idx + 1 < starts.length ? starts[idx + 1][1] : lines.length;
    // `everything` is the last CTE, so its slice runs to end-of-file and would
    // swallow the COMMENT ON FUNCTION string this migration deliberately
    // rewrites. Cut it at its own closing paren: what matters is the UNION list.
    out[n] = n === 'everything' ? lines.slice(s, e).join('\n').split('  )')[0] : lines.slice(s, e).join('\n');
  });
  return out;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

/**
 * Every `CREATE OR REPLACE FUNCTION public.fn_my_desk_waiting() … $$;`/`$function$;`
 * block in a file, WHOLE — signature, DECLARE, every CTE, the terminator.
 *
 * Whole blocks, not two hand-picked predicates: the round-1 mirror check counted
 * occurrences of the status predicate and passed while the COMMENT string beside it
 * still asserted that `offer_issued` "has never been used in production" and that
 * the candidate page "currently carries no control for it — a known product gap".
 * Both were false, and counting predicates could not see it.
 */
function fnBlocks(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  return [
    ...src.matchAll(
      /^CREATE OR REPLACE FUNCTION public\.fn_my_desk_waiting\(\)[\s\S]*?^(?:\$\$|\$function\$);$/gm,
    ),
  ].map((m) => m[0]);
}

/** The `COMMENT ON FUNCTION public.fn_my_desk_waiting() IS '…';` statement, whole. */
function fnComments(file: string): string[] {
  const src = readFileSync(file, 'utf8');
  return [
    ...src.matchAll(/^COMMENT ON FUNCTION public\.fn_my_desk_waiting\(\) IS\n {2}'[\s\S]*?';$/gm),
  ].map((m) => m[0]);
}

const prev = ctes(PREV);
const next = ctes(NEXT);

describe('fn_my_desk_waiting — 20261202090000 widens the offer branch and nothing else', () => {
  it('finds all seven CTEs in both files', () => {
    for (const n of BRANCHES) {
      expect(prev[n], `${n} missing from the predecessor`).toBeTruthy();
      expect(next[n], `${n} missing from the new migration`).toBeTruthy();
    }
  });

  it.each(['recruitment', 'refund', 'leave', 'meeting_trigger', 'grievance'] as const)(
    'the %s branch is byte-identical to the version it replaces',
    (name) => {
      expect(sha(next[name])).toBe(sha(prev[name]));
    },
  );

  it('keeps the leave org-scope test that a lower-numbered, later migration added', () => {
    // The regression this file exists to prevent. 20260908170000 added the
    // per-applicant scope call, wrapped in CASE so it stays off rows that already
    // failed the cheap set-based tests. A replace built on 20261018030000 silently
    // dropped it.
    expect(next.leave).toContain('public.fn_hr_leave_scope_admits(a.employee_id, m.scope_role)');
    expect(next.leave).toContain('AS scope_role');
    expect(next.leave).toContain('WHEN v_is_super THEN true');
  });

  it('the UNION list still selects the same six branches', () => {
    expect(sha(next.everything)).toBe(sha(prev.everything));
  });

  it('the offer branch DOES change — a no-op migration would be the other failure', () => {
    expect(sha(next.offer)).not.toBe(sha(prev.offer));
  });

  it('the only non-comment changes in the offer branch are the status predicate, one detail case and waiting_since', () => {
    const strip = (b: string) => b.split('\n').filter((l) => !l.trim().startsWith('--'));
    const before = strip(prev.offer);
    const after = strip(next.offer);

    expect(before.filter((l) => !after.includes(l))).toEqual([
      '      c.submitted_at                                       AS waiting_since,',
      "      AND c.status = 'package_fixed'",
    ]);
    expect(after.filter((l) => !before.includes(l))).toEqual([
      "        WHEN c.status = 'offer_issued'",
      "          THEN 'offer issued — waiting for them to join'",
      '      COALESCE(c.offer_issued_at, c.submitted_at)          AS waiting_since,',
      "      AND c.status IN ('package_fixed', 'offer_issued')",
    ]);
  });

  it('keeps the gate, the org scoping and both halves of isPostApproval', () => {
    expect(next.offer).toContain('WHERE v_has_recruit_edit');
    expect(next.offer).toContain('AND v_has_recruit_view');
    expect(next.offer).toContain('AND c.hr_organization_id = ANY (v_org_ids)');
    expect(next.offer).toContain("(c.role_specific_details->>'staff_record_id') IS NULL");
  });

  it('keeps age_days floored at 0', () => {
    const sql = readFileSync(NEXT, 'utf8');
    expect(sql).toContain('GREATEST(0, floor(extract(epoch FROM (now() - COALESCE(x.waiting_since, now()))) / 86400))::integer AS age_days');
  });

  it('adds the two offer-stamp columns in the SAME migration, nullable and not backfilled', () => {
    const sql = readFileSync(NEXT, 'utf8');
    expect(sql).toMatch(
      /ALTER TABLE public\.hr_recruitment_candidates\n {2}ADD COLUMN IF NOT EXISTS offer_issued_at timestamptz;/,
    );
    expect(sql).toMatch(
      /ALTER TABLE public\.hr_recruitment_candidates\n {2}ADD COLUMN IF NOT EXISTS offer_issued_by uuid REFERENCES public\.profiles\(id\);/,
    );
    // A backfill would stamp a false date on a real person's record.
    expect(sql).not.toMatch(/UPDATE public\.hr_recruitment_candidates[\s\S]{0,200}offer_issued_at/);
    expect(sql).not.toMatch(/offer_issued_at[^\n]*NOT NULL/);
  });

  it('re-asserts the anon revoke in the same file (CLAUDE.md rule for every SECDEF replace)', () => {
    const sql = readFileSync(NEXT, 'utf8');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.fn_my_desk_waiting\(\) FROM anon, PUBLIC;/,
    );
    expect(sql).toMatch(
      /GRANT {2}EXECUTE ON FUNCTION public\.fn_my_desk_waiting\(\) TO authenticated;/,
    );
  });
});

describe('fn_my_desk_waiting — the setup/02_functions.sql mirror is byte-identical', () => {
  const migBlocks = fnBlocks(NEXT);
  const setupBlocks = fnBlocks(SETUP);

  it('the migration declares the function exactly once', () => {
    expect(migBlocks).toHaveLength(1);
  });

  it('the setup file still carries TWO blocks of it — the later one wins on apply', () => {
    // Not a defect to fix here: the file has held two since 2026-09-08. What
    // matters is that neither is stale, so a reader diffing them sees no drift.
    expect(setupBlocks).toHaveLength(2);
  });

  it.each([0, 1])('setup block %i is byte-identical to the migration, comments included', (i) => {
    expect(sha(setupBlocks[i])).toBe(sha(migBlocks[0]));
  });

  it("the mirror's COMMENT ON FUNCTION is byte-identical to the migration's", () => {
    // This is the assertion round 1 lacked. The mirror kept the old COMMENT, which
    // still said `offer_issued` "has never been used in production" and that the
    // candidate page "carries no control for it — a known product gap". A whole-block
    // compare that stopped at $$; could not see a COMMENT that sits after it.
    const migComment = fnComments(NEXT);
    const setupComment = fnComments(SETUP);
    expect(migComment).toHaveLength(1);
    expect(setupComment).toHaveLength(1);
    expect(sha(setupComment[0])).toBe(sha(migComment[0]));
  });

  it('the rewritten COMMENT no longer asserts the three things this PR made false', () => {
    const c = fnComments(NEXT)[0];
    expect(c).not.toContain('has never been used in production');
    expect(c).not.toContain('a known product gap');
    expect(c).not.toContain('at status package_fixed (salary agreed');
    // and says what is true instead
    expect(c).toContain('package_fixed OR offer_issued');
    expect(c).toContain('COALESCE(offer_issued_at, submitted_at)');
  });

  it('mirrors the two new columns into supabase/setup/01_tables.sql', () => {
    const tables = readFileSync(
      path.join(process.cwd(), 'supabase', 'setup', '01_tables.sql'),
      'utf8',
    );
    expect(tables).toContain('offer_issued_at         timestamptz,');
    expect(tables).toContain('offer_issued_by         uuid REFERENCES public.profiles(id),');
  });
});
