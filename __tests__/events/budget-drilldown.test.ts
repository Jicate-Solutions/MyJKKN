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

import { buildBudgetTree } from '@/lib/services/events/shared/event-budget-service';
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
