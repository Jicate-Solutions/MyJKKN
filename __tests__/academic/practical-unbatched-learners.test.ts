import { describe, it, expect } from 'vitest';
import { learnersInNoPracticalBatch } from '@/lib/utils/academic/practical-unbatched-learners';

const SEC = 'sec-chem';
const learner = (id: string, section_id: string | null = SEC) => ({ id, section_id });
const batch = (batch_id: string, student_ids: string[], section_ids: string[] = [SEC]) => ({
  batch_id,
  batch_name: batch_id,
  section_ids,
  student_ids
});

describe('learnersInNoPracticalBatch (BUG-006270 follow-up)', () => {
  const roster = [learner('a1'), learner('a2'), learner('b1'), learner('late')];

  it('lists a learner who joined after the batches were picked', () => {
    const out = learnersInNoPracticalBatch(roster, [batch('A', ['a1', 'a2']), batch('B', ['b1'])]);
    expect(out.map((l) => l.id)).toEqual(['late']);
  });

  it('lists nobody when every learner is in some batch', () => {
    const out = learnersInNoPracticalBatch(roster, [
      batch('A', ['a1', 'a2']),
      batch('B', ['b1', 'late'])
    ]);
    expect(out).toEqual([]);
  });

  it('does not list a learner who is in ANOTHER batch of the same slot', () => {
    // b1 is not in Batch A (the one being marked) but is in Batch B.
    const out = learnersInNoPracticalBatch(roster, [batch('A', ['a1', 'a2', 'late']), batch('B', ['b1'])]);
    expect(out).toEqual([]);
  });

  it('keeps existing behaviour for empty or missing batch config', () => {
    expect(learnersInNoPracticalBatch(roster, [])).toEqual([]);
    expect(learnersInNoPracticalBatch(roster, undefined)).toEqual([]);
    expect(learnersInNoPracticalBatch(roster, null)).toEqual([]);
  });

  it('stays quiet when no batch names any learner (whole-section batches)', () => {
    expect(learnersInNoPracticalBatch(roster, [batch('A', []), batch('B', [])])).toEqual([]);
    // Even when the roster is wider than the batches' sections (no-section
    // fallback) - that case already carries the "no learners assigned" notice.
    const wider = [...roster, learner('z', 'sec-other')];
    expect(learnersInNoPracticalBatch(wider, [batch('A', []), batch('B', [])])).toEqual([]);
  });

  it('treats a batch naming nobody as covering its sections', () => {
    const mixed = [learner('a1'), learner('x', 'sec-other'), learner('y', 'sec-third')];
    const out = learnersInNoPracticalBatch(mixed, [
      batch('A', ['a1']),
      batch('B', [], ['sec-other'])
    ]);
    expect(out.map((l) => l.id)).toEqual(['y']);
  });

  it('a batch with neither learners nor sections covers everybody', () => {
    expect(
      learnersInNoPracticalBatch(roster, [batch('A', ['a1']), batch('B', [], [])])
    ).toEqual([]);
  });
});
