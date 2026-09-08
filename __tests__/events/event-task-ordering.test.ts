// __tests__/events/event-task-ordering.test.ts
//
// Cover for compareTasks — the ordering behind the event detail page's Pending
// Tasks card.
//
// It is worth a test because the obvious implementation is wrong twice over:
//
//  1. `ORDER BY priority` in SQL sorts the column ALPHABETICALLY — 'critical',
//     'high', 'low', 'medium' — which puts the least urgent tier second. The
//     column is free text, not an enum with a useful collation, so the ordering
//     has to happen in memory.
//  2. A task with no due date must sink, not float. `undefined < '2026-01-01'`
//     and a naive comparator both quietly lead the list with blank rows.

import { describe, it, expect, vi } from 'vitest';

// The service builds a Supabase client at module level; stub the factory so the
// module graph loads. Nothing here touches it — compareTasks is pure. Same
// workaround as event-logistics-tabs.test.ts.
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({}),
  createAdminClient: () => ({}),
  getSupabaseClient: () => ({}),
}));

import {
  compareTasks,
  OPEN_TASK_STATUSES,
  type EventTaskRow,
} from '@/lib/services/events/shared/event-task-service';

/** A task row with only the fields the comparator reads spelled out. */
const task = (over: Partial<EventTaskRow> & { title: string }): EventTaskRow =>
  ({
    id: over.title,
    committee_id: null,
    event_id: 'e1',
    description: null,
    status: 'pending',
    priority: 'medium',
    assigned_to: null,
    assigned_to_name: null,
    due_date: null,
    completed_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    committee_name: null,
    ...over,
  }) as EventTaskRow;

const order = (rows: EventTaskRow[]) => [...rows].sort(compareTasks).map((t) => t.title);

describe('compareTasks', () => {
  it('puts the soonest due date first', () => {
    expect(
      order([
        task({ title: 'later', due_date: '2026-09-20' }),
        task({ title: 'sooner', due_date: '2026-09-08' }),
        task({ title: 'middle', due_date: '2026-09-12' }),
      ]),
    ).toEqual(['sooner', 'middle', 'later']);
  });

  it('sinks undated tasks below every dated one', () => {
    expect(
      order([
        task({ title: 'undated-a' }),
        task({ title: 'dated', due_date: '2026-12-31' }),
        task({ title: 'undated-b' }),
      ])[0],
    ).toBe('dated');
  });

  it('ranks priority by urgency, not alphabetically', () => {
    // Alphabetically this is critical < high < low < medium, which would put
    // 'low' third and 'medium' last. Urgency order is the opposite.
    expect(
      order([
        task({ title: 'low', priority: 'low' }),
        task({ title: 'critical', priority: 'critical' }),
        task({ title: 'medium', priority: 'medium' }),
        task({ title: 'high', priority: 'high' }),
      ]),
    ).toEqual(['critical', 'high', 'medium', 'low']);
  });

  it('uses the due date before priority — a critical task next month waits', () => {
    expect(
      order([
        task({ title: 'critical-later', priority: 'critical', due_date: '2026-10-01' }),
        task({ title: 'low-tomorrow', priority: 'low', due_date: '2026-09-08' }),
      ]),
    ).toEqual(['low-tomorrow', 'critical-later']);
  });

  it('falls back to creation order when date and priority tie', () => {
    expect(
      order([
        task({ title: 'second', due_date: '2026-09-08', created_at: '2026-02-01T00:00:00Z' }),
        task({ title: 'first', due_date: '2026-09-08', created_at: '2026-01-01T00:00:00Z' }),
      ]),
    ).toEqual(['first', 'second']);
  });

  it('tolerates a priority the TS union does not list', () => {
    // events.event_type is free text in this schema and so is priority — a row
    // written by an import or an older client can carry anything. It must sort
    // last, not throw.
    const rows = [
      task({ title: 'known', priority: 'high' }),
      task({ title: 'junk', priority: 'urgent-ish' as never }),
    ];
    expect(() => order(rows)).not.toThrow();
    expect(order(rows)).toEqual(['known', 'junk']);
  });
});

describe('OPEN_TASK_STATUSES', () => {
  it('counts blocked work as outstanding but not cancelled work', () => {
    // The card splits on this list. 'blocked' still needs someone's attention;
    // 'cancelled' is neither pending nor an achievement and belongs in the
    // collapsed section next to 'completed'.
    expect(OPEN_TASK_STATUSES).toContain('pending');
    expect(OPEN_TASK_STATUSES).toContain('in_progress');
    expect(OPEN_TASK_STATUSES).toContain('blocked');
    expect(OPEN_TASK_STATUSES).not.toContain('completed');
    expect(OPEN_TASK_STATUSES).not.toContain('cancelled');
  });
});
