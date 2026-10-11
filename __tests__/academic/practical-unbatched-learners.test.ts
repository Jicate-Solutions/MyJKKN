import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';
import { learnersInNoPracticalBatch } from '@/lib/utils/academic/practical-unbatched-learners';
import { narrowRosterToPracticalBatch } from '@/lib/utils/academic/practical-batch-roster';

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
    const mixed = [learner('a1'), learner('a2'), learner('x', 'sec-other')];
    const out = learnersInNoPracticalBatch(mixed, [
      batch('A', ['a1']),
      batch('B', [], ['sec-other'])
    ]);
    expect(out.map((l) => l.id)).toEqual(['a2']);
  });

  // #4332 review (LOW 3): only the sections the batches list are checked.
  // Before the review `y` in sec-third WAS flagged, contradicting the PR's
  // "known limits"; a fallback roster wider than the batches must not fill
  // the notice with learners from unrelated sections.
  it('does not flag a learner in a section no batch lists', () => {
    const mixed = [learner('a1'), learner('x', 'sec-other'), learner('y', 'sec-third')];
    const out = learnersInNoPracticalBatch(mixed, [
      batch('A', ['a1']),
      batch('B', [], ['sec-other'])
    ]);
    expect(out).toEqual([]);
  });

  it('still flags an unbatched learner in a named batch\'s own section', () => {
    const mixed = [learner('a1'), learner('late'), learner('y', 'sec-third')];
    const out = learnersInNoPracticalBatch(mixed, [batch('A', ['a1'])]);
    expect(out.map((l) => l.id)).toEqual(['late']);
  });

  // #4332 review (LOW 4): fn_attendance_roster never matches a null section
  // under a section scope, so such a learner is skipped there...
  it('skips a learner with no section when the batches list sections', () => {
    const mixed = [learner('a1'), learner('nosec', null), learner('x', 'sec-other')];
    const out = learnersInNoPracticalBatch(mixed, [
      batch('A', ['a1']),
      batch('B', [], ['sec-other'])
    ]);
    expect(out).toEqual([]);
  });

  // ...but when no batch lists any section the roster came from the
  // programme/semester fallback, and every learner on it is checked.
  it('checks every learner when no batch lists a section', () => {
    const roster2 = [learner('a1', null), learner('nosec', null), learner('z', 'sec-z')];
    const out = learnersInNoPracticalBatch(roster2, [batch('A', ['a1'], [])]);
    expect(out.map((l) => l.id)).toEqual(['nosec', 'z']);
  });

  it('a batch with neither learners nor sections covers everybody', () => {
    expect(
      learnersInNoPracticalBatch(roster, [batch('A', ['a1']), batch('B', [], [])])
    ).toEqual([]);
  });
});

// #4332 review (LOW 6): the notice only works if it is given the section
// roster BEFORE the selected batch narrows it. Prove both halves: the helper
// finds nobody on a narrowed list, and the page feeds it the raw roster.
describe('unbatched notice reads the roster before batch narrowing', () => {
  const sectionRoster = [learner('a1'), learner('a2'), learner('b1'), learner('late')];
  const batches = [batch('A', ['a1', 'a2']), batch('B', ['b1'])];

  it('finds the late joiner only on the un-narrowed section roster', () => {
    expect(learnersInNoPracticalBatch(sectionRoster, batches).map((l) => l.id)).toEqual(['late']);
    const narrowed = narrowRosterToPracticalBatch(sectionRoster, ['a1', 'a2']).learners;
    expect(learnersInNoPracticalBatch(narrowed, batches)).toEqual([]);
  });

  it('the mark page stores the RPC roster before narrowRosterToPracticalBatch runs', () => {
    const page = readFileSync(
      path.join(__dirname, '../../app/(routes)/academic/attendance/mark/page.tsx'),
      'utf8'
    );
    const fetched = page.indexOf('const studentsData = await AttendanceService.getStudentsForAttendance(');
    const stored = page.indexOf('setRosterBeforeBatches(studentsData');
    const narrowed = page.indexOf('narrowRosterToPracticalBatch(');
    expect(fetched).toBeGreaterThan(-1);
    expect(stored).toBeGreaterThan(fetched);
    expect(narrowed).toBeGreaterThan(stored);
    // Nothing between the fetch and the store reassigns or filters the roster.
    const between = page.slice(fetched + 'const studentsData ='.length, stored);
    expect(between).not.toMatch(/\bstudentsData\s*=[^=]/);
    expect(between).not.toMatch(/studentsData\.filter\(/);
  });
});
