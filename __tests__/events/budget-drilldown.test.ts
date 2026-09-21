// __tests__/events/budget-drilldown.test.ts
//
// Cover for the event-budget drill-down substrate (2026-09-21).
//
// Why it exists: the tournament budget showed "Chess & Carrom — ₹1,52,300" as
// one unopenable row. Across the 15 events with a budget there were 41 lines
// and 33 distinct free-text category strings, including the same shopping list
// five times with three spellings of "refreshment", and a category literally
// named "Refree honorarium (1500/person)" — a unit rate written into a label
// because there was nowhere else to put it.
//
// Two things here are worth testing rather than trusting:
//
//  1. buildBudgetTree, because the obvious implementation loses money. A row
//     whose parent is not in the list (any filtered view produces these) is
//     dropped by a naive grouping, and the totals then quietly disagree with
//     the database.
//  2. The migration's invariants. A drill-down whose parent disagrees with its
//     children is worse than no drill-down at all, so the sums are held by the
//     database and the SQL is checked for the guards that hold them.

import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({}),
  createAdminClient: () => ({}),
  getSupabaseClient: () => ({}),
}));

import {
  buildBudgetTree,
  summariseBudget,
  type SummarisableLine,
} from '@/lib/services/events/shared/event-budget-service';
import type { MarathonBudgetItem } from '@/types/events-marathon';

const line = (over: Partial<MarathonBudgetItem> & { id: string }): MarathonBudgetItem =>
  ({
    event_id: 'e1',
    category: 'Miscellaneous',
    description: over.id,
    type: 'expense',
    estimated_amount: 0,
    actual_amount: 0,
    status: 'planned',
    approved_by: null,
    vendor: null,
    receipt_url: null,
    notes: null,
    institution_id: null,
    parent_id: null,
    created_at: '',
    updated_at: '',
    ...over,
  }) as MarathonBudgetItem;

describe('buildBudgetTree', () => {
  it('nests sub-lines under the line they itemise', () => {
    const tree = buildBudgetTree([
      line({ id: 'chess', estimated_amount: 152300 }),
      line({ id: 'trophies', parent_id: 'chess', estimated_amount: 40000 }),
      line({ id: 'referees', parent_id: 'chess', estimated_amount: 18000 }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].line.id).toBe('chess');
    expect(tree[0].children.map((c) => c.id)).toEqual(['trophies', 'referees']);
  });

  it('keeps an orphan visible instead of losing its money', () => {
    // Filtering to one committee or one type routinely leaves a child whose
    // parent is not in the list. Dropping it would make the rendered total
    // disagree with the database.
    const tree = buildBudgetTree([line({ id: 'referees', parent_id: 'absent', estimated_amount: 18000 })]);
    expect(tree).toHaveLength(1);
    expect(tree[0].line.id).toBe('referees');
    expect(tree[0].children).toEqual([]);
  });

  it('does not lose a row that claims to be its own parent', () => {
    const tree = buildBudgetTree([line({ id: 'x', parent_id: 'x', estimated_amount: 500 })]);
    expect(tree.map((n) => n.line.id)).toEqual(['x']);
  });

  it('preserves the order it was given', () => {
    const tree = buildBudgetTree([
      line({ id: 'b' }),
      line({ id: 'a' }),
      line({ id: 'a2', parent_id: 'a' }),
      line({ id: 'a1', parent_id: 'a' }),
    ]);
    expect(tree.map((n) => n.line.id)).toEqual(['b', 'a']);
    expect(tree[1].children.map((c) => c.id)).toEqual(['a2', 'a1']);
  });

  it('returns nothing for an empty budget', () => {
    expect(buildBudgetTree([])).toEqual([]);
  });

  it('every input row appears exactly once somewhere in the tree', () => {
    const rows = [
      line({ id: 'p1' }),
      line({ id: 'c1', parent_id: 'p1' }),
      line({ id: 'p2' }),
      line({ id: 'orphan', parent_id: 'gone' }),
      line({ id: 'self', parent_id: 'self' }),
    ];
    const tree = buildBudgetTree(rows);
    const seen = tree.flatMap((n) => [n.line.id, ...n.children.map((c) => c.id)]);
    expect(seen.sort()).toEqual(rows.map((r) => r.id).sort());
  });
});

describe('the drill-down migration', () => {
  // The prose above the SQL quotes the very strings and guards being asserted,
  // so strip comments before searching or the commentary passes for the code.
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20270101090000_event_budget_drilldown_substrate.sql'),
    'utf8'
  )
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');

  it('adds all five columns to a budget line', () => {
    for (const col of ['parent_id', 'quantity', 'unit_rate', 'committee_id', 'category_id']) {
      expect(sql, `${col} not added`).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\b`));
    }
  });

  it('holds the parent total in the database, not in the UI', () => {
    const fn = sql.slice(sql.indexOf('fn_event_budget_rollup_parent'));
    expect(fn).toContain('sum(estimated_amount)');
    expect(fn).toContain('sum(coalesce(actual_amount,0))');
    expect(sql).toMatch(/CREATE TRIGGER trg_event_budget_rollup_parent[\s\S]*?AFTER INSERT OR DELETE OR UPDATE/);
  });

  it('refuses a second level, a cross-event parent and a mismatched type', () => {
    const guard = sql.slice(
      sql.indexOf('FUNCTION public.fn_event_budget_child_guard'),
      sql.indexOf('DROP TRIGGER IF EXISTS trg_event_budget_child_guard')
    );
    expect(guard).toContain('one level deep only');
    expect(guard).toContain('same event as its parent');
    expect(guard).toContain('same type');
  });

  it('computes quantity x unit_rate rather than trusting a typed figure', () => {
    const fn = sql.slice(
      sql.indexOf('FUNCTION public.fn_event_budget_compute_line'),
      sql.indexOf('DROP TRIGGER IF EXISTS trg_event_budget_compute_line')
    );
    expect(fn).toMatch(/estimated_amount\s*:=\s*NEW\.quantity \* NEW\.unit_rate/);
  });

  it('locks the new catalogue table away from the public key', () => {
    expect(sql).toMatch(/REVOKE ALL\s+ON TABLE public\.event_budget_categories FROM anon, PUBLIC;/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
  });

  it('makes a duplicate category name impossible', () => {
    // Trophies/Trophy and Refreshments/refreshments are why this exists, so the
    // uniqueness has to be case-insensitive.
    expect(sql).toMatch(/CREATE UNIQUE INDEX[\s\S]*?lower\(name\), kind/);
  });

  it('leaves every existing line alone — nothing added is required', () => {
    const added = sql.slice(sql.indexOf('ALTER TABLE public.event_budget_items\n  ADD COLUMN'));
    const decl = added.slice(0, added.indexOf(';'));
    expect(decl).not.toMatch(/NOT NULL/);
  });
});

describe('summariseBudget', () => {
  const row = (over: Partial<SummarisableLine> & { id: string }): SummarisableLine => ({
    parent_id: null,
    category: 'Miscellaneous',
    type: 'expense',
    estimated_amount: 0,
    actual_amount: 0,
    status: 'planned',
    ...over,
  });

  it('does NOT count an itemised line and its items twice', () => {
    // The whole reason this function exists. A parent equals the sum of its
    // children, so adding every row over-states the budget by the itemised
    // part of it — silently, and by a plausible-looking number.
    const s = summariseBudget([
      row({ id: 'chess', estimated_amount: 58000 }),
      row({ id: 'trophies', parent_id: 'chess', estimated_amount: 40000 }),
      row({ id: 'referees', parent_id: 'chess', estimated_amount: 18000 }),
    ]);
    expect(s.total_estimated_expense).toBe(58000);
  });

  it('totals a budget that has never been itemised exactly as before', () => {
    const s = summariseBudget([
      row({ id: 'a', estimated_amount: 50000, type: 'income', category: 'Registration fees' }),
      row({ id: 'b', estimated_amount: 152300, category: 'Sports & event materials' }),
    ]);
    expect(s.total_estimated_income).toBe(50000);
    expect(s.total_estimated_expense).toBe(152300);
    expect(s.estimated_balance).toBe(-102300);
  });

  it('breaks down by the items, not by the line that holds them', () => {
    // "trophies 40,000" is a useful figure across events. "sports materials
    // 1,52,300" is the thing the organisers were already trying to escape.
    const s = summariseBudget([
      row({ id: 'chess', category: 'Sports & event materials', estimated_amount: 58000 }),
      row({ id: 't', parent_id: 'chess', category: 'Prizes, trophies & mementos', estimated_amount: 40000 }),
      row({ id: 'r', parent_id: 'chess', category: 'Officials & honorarium', estimated_amount: 18000 }),
    ]);
    expect(s.by_category.map((c) => c.category).sort()).toEqual([
      'Officials & honorarium',
      'Prizes, trophies & mementos',
    ]);
  });

  it('rolls actuals up without double counting either', () => {
    const s = summariseBudget([
      row({ id: 'p', estimated_amount: 100, actual_amount: 90 }),
      row({ id: 'c', parent_id: 'p', estimated_amount: 100, actual_amount: 90 }),
    ]);
    expect(s.total_actual_expense).toBe(90);
  });

  it('still ignores a cancelled line', () => {
    const s = summariseBudget([
      row({ id: 'a', estimated_amount: 1000 }),
      row({ id: 'b', estimated_amount: 9999, status: 'cancelled' }),
    ]);
    expect(s.total_estimated_expense).toBe(1000);
  });

  it('counts an item whose parent is not in the list rather than dropping it', () => {
    const s = summariseBudget([row({ id: 'orphan', parent_id: 'gone', estimated_amount: 18000 })]);
    expect(s.total_estimated_expense).toBe(18000);
  });
});

describe('the close-the-books migration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/20270102090000_event_budget_close_the_books.sql'),
    'utf8'
  )
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('--'))
    .join('\n');

  it('asks only about leaf lines — an itemised line is answered by its items', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.fn_event_budget_unsettled'));
    expect(fn.slice(0, fn.indexOf('$$;'))).toMatch(
      /NOT EXISTS \(SELECT 1 FROM public\.event_budget_items c WHERE c\.parent_id = b\.id\)/
    );
  });

  it('refuses to close while a line is unanswered, and NAMES the lines', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.fn_close_event_budget'));
    const body = fn.slice(0, fn.indexOf('$$;'));
    expect(body).toContain('IF open_count > 0 THEN');
    // A refusal with no list is a wall, not an answer.
    expect(body).toMatch(/string_agg\(description/);
    expect(body).toMatch(/still have no final figure/);
  });

  it('will not settle a line that is made up of items', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.fn_settle_event_budget_line'));
    expect(fn.slice(0, fn.indexOf('$$;'))).toContain('settle those instead');
  });

  it('records who closed the books, separately from who approved the plan', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS closed_by uuid/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS closed_at timestamptz/);
    const fn = sql.slice(sql.indexOf('FUNCTION public.fn_close_event_budget'));
    expect(fn.slice(0, fn.indexOf('$$;'))).toMatch(/closed_by = auth\.uid\(\)/);
  });

  it('locks all three new functions away from the public key', () => {
    for (const fn of [
      'fn_event_budget_unsettled\\(uuid\\)',
      'fn_close_event_budget\\(uuid\\)',
      'fn_settle_event_budget_line\\(uuid, numeric, boolean\\)',
    ]) {
      expect(sql, `${fn} not revoked from anon`).toMatch(
        new RegExp(`REVOKE EXECUTE ON FUNCTION public\\.${fn} FROM anon, PUBLIC;`)
      );
      expect(sql, `${fn} not granted to authenticated`).toMatch(
        new RegExp(`GRANT\\s+EXECUTE ON FUNCTION public\\.${fn} TO authenticated;`)
      );
    }
  });

  it('writes "nothing spent" as cancelled, not as a zero that looks unanswered', () => {
    const fn = sql.slice(sql.indexOf('FUNCTION public.fn_settle_event_budget_line'));
    const body = fn.slice(0, fn.indexOf('$$;'));
    expect(body).toMatch(/status\s*=\s*CASE WHEN p_nothing_spent THEN 'cancelled' ELSE 'spent' END/);
  });
});
