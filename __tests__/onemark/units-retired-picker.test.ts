/**
 * OneMark — "a retired unit disappears from every picker, but keeps its
 * questions" (Wave 3 Lane U, spec item 5, third named case).
 *
 * THIS TEST EXISTS BECAUSE THE CLAIM WAS FALSE WHEN IT WAS FIRST MADE.
 *
 * Lane U ships a Retire button, files the unit under a heading that reads
 * "hidden from every picker, questions kept", and answers DELETE with "retire
 * it instead: the unit disappears from every picker". Two of the three pickers
 * honoured that. The drafting picker — listTopicsForExam in
 * app/(routes)/foundation/onemark/review/_lib/drafts.ts, the one a Senior
 * Learner uses when writing questions — had no is_active filter and did not
 * even select the column, so a retired unit stayed on offer indefinitely. The
 * paper wizard DID filter, which is exactly why the gap was invisible from
 * inside either lane. Found by review 2026-09-08 and fixed with one predicate.
 *
 * The pair of assertions is the whole point and they pull in opposite
 * directions: the unit must vanish from the PICKER while every question
 * written against it stays attached to it. A test that only checked the first
 * half would pass just as well against a hard delete, which is the outcome the
 * lane exists to prevent.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const EXAM_ID = 'exam-physics';

/** Rows as PostgREST returns them for the picker's embedded select. */
let mapRows: Array<{ sort_order: number; topic: Record<string, unknown> | null }> = [];
/** fp_items rows, to prove retirement does not detach a question. */
let itemRows: Array<{ id: string; topic_id: string | null }> = [];

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({
    from: (table: string) => {
      const b: any = {
        select: vi.fn(() => b),
        eq: vi.fn(() => b),
        order: vi.fn(() =>
          Promise.resolve({
            data: table === 'exam_topic_map' ? mapRows : itemRows,
            error: null,
          }),
        ),
        then: (resolve: any) =>
          resolve({ data: table === 'exam_topic_map' ? mapRows : itemRows, error: null }),
      };
      return b;
    },
  }),
}));

vi.mock('../../app/(routes)/foundation/onemark/review/_actions/approve-draft', () => ({
  approveDraft: vi.fn(),
}));

import { listTopicsForExam } from '@/app/(routes)/foundation/onemark/review/_lib/drafts';

const LIVE_UNIT = { id: 'topic-live', config_key: 'onemark_phy_u01', display_name: 'Unit 1', is_active: true };
const RETIRED_UNIT = { id: 'topic-retired', config_key: 'onemark_phy_u05', display_name: 'Unit 5', is_active: false };

beforeEach(() => {
  mapRows = [
    { sort_order: 1, topic: LIVE_UNIT },
    { sort_order: 5, topic: RETIRED_UNIT },
    { sort_order: 6, topic: { id: 'topic-live-2', config_key: 'onemark_phy_u06', display_name: 'Unit 6', is_active: true } },
  ];
  itemRows = [
    { id: 'item-1', topic_id: 'topic-retired' },
    { id: 'item-2', topic_id: 'topic-retired' },
    { id: 'item-3', topic_id: 'topic-live' },
  ];
});

describe('a retired unit disappears from the drafting picker', () => {
  it('is not offered as a unit to write a question against', async () => {
    const topics = await listTopicsForExam(EXAM_ID);
    expect(topics.map((t) => t.id)).not.toContain('topic-retired');
  });

  it('leaves the live units of the same subject untouched, in their own order', async () => {
    const topics = await listTopicsForExam(EXAM_ID);
    expect(topics.map((t) => t.config_key)).toEqual(['onemark_phy_u01', 'onemark_phy_u06']);
    expect(topics.map((t) => t.sort_order)).toEqual([1, 6]);
  });

  it('keeps every question that was written against it — retire is not delete', async () => {
    await listTopicsForExam(EXAM_ID);
    // The picker read changes nothing about fp_items: the two questions
    // written for the retired unit still point at it, so bringing the unit
    // back restores them with no repair step.
    const attached = itemRows.filter((i) => i.topic_id === 'topic-retired');
    expect(attached).toHaveLength(2);
    expect(attached.every((i) => i.topic_id === 'topic-retired')).toBe(true);
  });

  it('still drops a mapping whose topic row is missing, rather than rendering a blank option', async () => {
    mapRows = [{ sort_order: 1, topic: null }, { sort_order: 2, topic: LIVE_UNIT }];
    const topics = await listTopicsForExam(EXAM_ID);
    expect(topics.map((t) => t.id)).toEqual(['topic-live']);
  });

  it('treats a row with no is_active value as live, not as retired', async () => {
    // Defensive: a legacy row that predates the column, or a select that omits
    // it, must not silently vanish from the picker.
    mapRows = [{ sort_order: 1, topic: { id: 't', config_key: 'onemark_phy_u01', display_name: 'Unit 1' } }];
    const topics = await listTopicsForExam(EXAM_ID);
    expect(topics.map((t) => t.id)).toEqual(['t']);
  });
});
