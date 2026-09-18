/**
 * Guards for the two SQL defects the blind critic found on PR #3829, read off
 * the migration files on disk. Both were invisible in review and silent at
 * runtime, and both are one deleted line away from coming back.
 *
 * WHY THESE LIVE UNDER __tests__/lib/
 *   Because `__tests__/lib/` is a directory-wide CI gate (lib-unit-suite.yml);
 *   `__tests__/ci/` files run only when a workflow names them one by one. The
 *   behaviour of these two functions is proven separately, against production,
 *   inside BEGIN … ROLLBACK (transcript on the PR). These assertions are the
 *   regression ratchet, not the proof.
 *
 * GAP 1 — "'not fixed' can silently leave the bug closed."
 *   fn_bug_feedback_answer reopened the bug inside ONE
 *   `BEGIN … EXCEPTION WHEN OTHERS THEN NULL` block that also held the system
 *   message, the group record and the fixer notification. PL/pgSQL makes such a
 *   block a subtransaction: a failure in any of the four rolled back all four,
 *   the reopen included — while v_reopened kept its value, because a caught
 *   error rolls back database work and never local variables. The function
 *   answered `reopened: 1` over a bug that was still 'resolved'.
 *
 * GAP 2 — "100 identical answers can display as 1 respondent."
 *   fn_notification_compliance_rollup counted `count(*)` over rows already
 *   grouped by answer, so it counted OPTIONS USED, not people. A whole college
 *   picking "Yes" showed as `Answers 1/900`.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

const MIGRATION_A = 'supabase/migrations/20261227090000_bug_feedback_gate_timing_snooze_reopen.sql';
const MIGRATION_B = 'supabase/migrations/20261227090100_notifications_must_answer.sql';

/** The plpgsql body of one function in a migration file. */
function functionBody(sql: string, fnName: string): string {
  const at = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fnName}`);
  if (at === -1) throw new Error(`function not found in migration: ${fnName}`);
  const end = sql.indexOf('\n$$;', at);
  if (end === -1) throw new Error(`unterminated body for ${fnName}`);
  return sql.slice(at, end);
}

type Block = { start: number; end: number; handler: boolean };

/**
 * The plpgsql BEGIN … END blocks of a body, in source order, each flagged with
 * whether it carries an EXCEPTION handler. `END IF;` / `END LOOP;` are not
 * block ends and are not matched.
 */
function blocksOf(body: string): { lines: string[]; blocks: Block[] } {
  const lines = body.split('\n');
  const open: Array<{ start: number; handler: boolean }> = [];
  const blocks: Block[] = [];
  lines.forEach((line, i) => {
    const t = line.trim();
    if (/^BEGIN\b/.test(t)) open.push({ start: i, handler: false });
    else if (/^EXCEPTION\b/.test(t) && open.length) open[open.length - 1].handler = true;
    else if (/^END\s*;/.test(t) && open.length) {
      const b = open.pop()!;
      blocks.push({ start: b.start, end: i, handler: b.handler });
    }
  });
  return { lines, blocks };
}

/** Does the innermost BEGIN block containing `needle` swallow its errors? */
function innermostBlockSwallowsErrors(body: string, needle: string): boolean {
  const { lines, blocks } = blocksOf(body);
  const target = lines.findIndex((l) => l.includes(needle));
  if (target === -1) throw new Error(`needle not found in body: ${needle}`);
  const containing = blocks
    .filter((b) => b.start < target && b.end > target)
    .sort((a, b) => b.start - a.start)[0];
  if (!containing) throw new Error(`no enclosing block for: ${needle}`);
  return containing.handler;
}

describe('gap 1 — the reopen on "not fixed" cannot be silently rolled back', () => {
  const body = functionBody(read(MIGRATION_A), 'fn_bug_feedback_answer');

  it('self-check: the block walker can see a handler where one exists', () => {
    // The fixer notification IS deliberately best-effort. If this reads false
    // the walker is broken and the assertion below would pass vacuously.
    expect(innermostBlockSwallowsErrors(body, 'INSERT INTO public.user_notifications')).toBe(true);
  });

  it('the bug_reports reopen is NOT inside an error-swallowing block', () => {
    expect(innermostBlockSwallowsErrors(body, "'reopened_by'")).toBe(false);
  });

  it('the three cosmetic side effects each sit in their own swallowing block', () => {
    // Each must be able to fail without taking the reopen down with it.
    expect(innermostBlockSwallowsErrors(body, 'INSERT INTO public.bug_report_messages')).toBe(true);
    expect(innermostBlockSwallowsErrors(body, 'UPDATE public.bug_clusters')).toBe(true);
    expect(innermostBlockSwallowsErrors(body, 'INSERT INTO public.notifications')).toBe(true);
  });

  it('reports the bug status read back from the table, not just a row count', () => {
    // The read-back happens after the UPDATE and its value is returned.
    expect(body).toMatch(
      /SELECT\s+status,\s*display_id\s+INTO\s+v_bug_status,\s*v_display\s+FROM public\.bug_reports/
    );
    expect(body).toMatch(/'bug_status',\s*v_bug_status/);
    expect(body.indexOf("'reopened_by'")).toBeLessThan(body.indexOf('INTO v_bug_status'));
  });

  it('never reports a fixer notification that its own handler rolled back', () => {
    // v_nid survives a caught error (locals are not rolled back), so the
    // handler must clear it or `fixer_notified` lies.
    expect(body).toMatch(/EXCEPTION WHEN OTHERS THEN[\s\S]{0,400}?v_nid := NULL;/);
    expect(body).toMatch(/'fixer_notified',\s*v_nid IS NOT NULL/);
  });

  it('reports whether the outcome ledger refresh actually landed', () => {
    expect(body).toMatch(/v_ledger_ok := COALESCE\(v_ledger ->> 'success', 'false'\) = 'true'/);
    expect(body).toMatch(/'ledger_recorded',\s*v_ledger_ok/);
  });

  it('reopens every closed status the bug_reports check constraint allows', () => {
    // Production constraint, read 2026-09-18: new | seen | in_progress |
    // resolved | wont_fix | duplicate. The three non-open ones must all flip.
    expect(body).toMatch(/b\.status IN \('resolved','duplicate','wont_fix'\)/);
  });
});

describe('gap 2 — the answer rollup counts respondents, not options', () => {
  const body = functionBody(read(MIGRATION_B), 'fn_notification_compliance_rollup');
  const rollup = body.slice(body.indexOf('answer_rollup AS ('), body.indexOf('by_notification AS ('));

  it('sums the per-option counts instead of counting the grouped rows', () => {
    expect(rollup).toMatch(/sum\(cnt\)::int AS answered/);
    expect(rollup).not.toMatch(/count\(\*\) AS answered/);
  });

  it('still groups the per-option breakdown by notification and answer', () => {
    expect(rollup).toMatch(/GROUP BY notification_id, answer/);
    expect(rollup).toMatch(/jsonb_object_agg\(answer, cnt\)/);
  });

  it('is safe to sum because a person can hold only one row per announcement', () => {
    expect(read(MIGRATION_B)).toMatch(
      /CONSTRAINT notification_answers_one_per_user UNIQUE \(notification_id, user_id\)/
    );
  });
});

describe('reconciled with the "still happening?" prompt kind (20261223000000, live 17 Sep)', () => {
  const a = read(MIGRATION_A);
  const c = read('supabase/migrations/20261227090200_get_blocking_items.sql');

  it('fn_bug_feedback_answer keeps the LIVE still_open branch: fixed resolves the report, not_fixed stamps it', () => {
    const body = functionBody(a, 'fn_bug_feedback_answer');
    expect(body).toMatch(/IF v_row\.kind = 'still_open' THEN/);
    expect(body).toMatch(/'resolved_by', 'reporter_still_open_prompt'/);
    // and names the reporter as resolved_by, or fn_bug_reports_enforce_resolved_by
    // (20261223093000) refuses the resolve — the live defect check 28 caught
    const fixedBranch = body.slice(body.indexOf("IF p_answer = 'fixed' THEN"), body.indexOf("ELSE", body.indexOf("IF p_answer = 'fixed' THEN")));
    expect(fixedBranch).toMatch(/resolved_by = v_row\.reporter_user_id/);
    expect(body).toMatch(/'still_open_confirmed_at'/);
    // and it returns before the fix-outcome ledger ever sees the row
    const branch = body.indexOf("IF v_row.kind = 'still_open'");
    const ledger = body.indexOf('fn_bug_fix_outcome_record(v_row.cluster_id)');
    expect(branch).toBeGreaterThan(-1);
    expect(branch).toBeLessThan(ledger);
    expect(body.slice(branch, ledger)).toMatch(/RETURN jsonb_build_object\('success', true, 'answer', p_answer, 'kind', 'still_open'\)/);
  });

  it('never changes the expires_at column DEFAULT (still_open rows live 14 days off it)', () => {
    expect(a).not.toMatch(/ALTER COLUMN expires_at SET DEFAULT/i);
  });

  it('the backfill, the drop, the release cap, the prepare cap and the index are all scoped to fix_check', () => {
    const backfills = a.split('UPDATE public.bug_fix_feedback_requests\nSET fix_live_at').length - 1;
    expect(backfills).toBe(2);
    expect((a.match(/AND kind = 'fix_check'/g) || []).length).toBeGreaterThanOrEqual(5);
    expect(functionBody(a, 'fn_bug_feedback_drop_gone_reporters')).toMatch(/r\.kind = 'fix_check'/);
    expect(functionBody(a, 'fn_bug_feedback_release_queued').match(/kind = 'fix_check'/g)?.length).toBe(2);
    expect(functionBody(a, 'fn_bug_feedback_prepare')).toMatch(/kind = 'fix_check'/);
    expect(a).toMatch(/WHERE status IN \('sent','delivered'\) AND kind = 'fix_check';/);
  });

  it('get_blocking_items never serves a still_open prompt on the blocking screen', () => {
    const bugBranch = c.slice(c.indexOf('FROM public.bug_fix_feedback_requests r'));
    expect(bugBranch).toMatch(/AND r\.kind = 'fix_check'/);
  });
});

describe('deep review 2026-09-17 — the findings that were real', () => {
  const a = read(MIGRATION_A);
  const b = read(MIGRATION_B);

  it('#2: a repeat "not fixed" that reopens nothing adds no message and notifies no fixer', () => {
    const body = functionBody(a, 'fn_bug_feedback_answer');
    const gate = body.indexOf('IF v_reopened > 0 THEN');
    const message = body.indexOf('INSERT INTO public.bug_report_messages');
    const notify = body.indexOf('INSERT INTO public.notifications');
    const close = body.indexOf('END IF;  -- v_reopened > 0');
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(message);
    expect(message).toBeLessThan(notify);
    expect(notify).toBeLessThan(close);
    // the reopen itself is NOT behind that gate (it is what sets v_reopened)
    expect(body.indexOf('WITH reopened AS')).toBeLessThan(gate);
  });

  it('#6: answers are readable by super admins only — the table has no institution column', () => {
    const policy = b.slice(b.indexOf('CREATE POLICY "notification_answers_select_admin"'));
    const using = policy.slice(0, policy.indexOf(';'));
    expect(using).toMatch(/USING \(is_super_admin\(\)\)/);
    expect(using).not.toMatch(/is_admin\(\)/);
  });
});

describe('critic round 1 (2026-09-18) — the problems that were real', () => {
  const a = read(MIGRATION_A);
  const body = functionBody(a, 'fn_bug_feedback_answer');

  it('reads bug_reports.resolved_by BEFORE the reopen (the trigger clears it) and prefers it as the fixer of record', () => {
    const readAt = body.indexOf('SELECT resolved_by INTO v_resolver');
    const reopenAt = body.indexOf('WITH reopened AS');
    const fixerAt = body.indexOf('SELECT COALESCE(\n               v_resolver,');
    expect(readAt).toBeGreaterThan(-1);
    expect(readAt).toBeLessThan(reopenAt);
    expect(fixerAt).toBeGreaterThan(reopenAt);
  });

  it('reports the ledger as NOT recorded when fn_bug_fix_outcome_record answers success=false, not only when it raises', () => {
    expect(body).toMatch(/v_ledger := public\.fn_bug_fix_outcome_record\(v_row\.cluster_id\)/);
    expect(body).toMatch(/v_ledger_ok := COALESCE\(v_ledger ->> 'success', 'false'\) = 'true'/);
  });

  it('every swallowed side effect leaves a WARNING in the database log', () => {
    const swallowed = body.split('EXCEPTION WHEN OTHERS THEN').length - 1;
    const warned = (body.match(/RAISE WARNING 'fn_bug_feedback_answer:/g) || []).length;
    expect(swallowed).toBeGreaterThanOrEqual(5);
    expect(warned).toBeGreaterThanOrEqual(swallowed); // at least one per handler
  });

  it('the three migrations sort after every migration that introduced what they read (kind, 20261223000000)', () => {
    for (const f of [MIGRATION_A, MIGRATION_B, 'supabase/migrations/20261227090200_get_blocking_items.sql']) {
      const v = f.split('/').pop()!.slice(0, 14);
      expect(v > '20261224120000').toBe(true);
    }
  });
});

