/**
 * BUG-006276 (2026-10-10, JKKN Matric Higher Secondary School faculty):
 * "I need alphabet order name boys and girls in attendance mark register".
 * Tamil Nadu school registers list boys A-Z, then girls A-Z. The marking screen
 * gains a display-only order; marks stay keyed by learner id.
 */
import { describe, it, expect } from 'vitest';
import {
  orderRoster,
  isRosterOrder
} from '@/lib/utils/academic/attendance-roster-order';

const L = (id: string, student_name: string, roll_number: string | null = null) => ({
  id,
  student_name,
  roll_number
});

const roster = [
  L('g1', 'priya K', '03'),
  L('b1', 'S. Ponnaiyan', '10'),
  L('u1', 'Arun', null),
  L('b2', 'arjun M', '2'),
  L('g2', 'Anitha', '01'),
  L('b3', 'Karthik', '11')
];

const genders = new Map<string, string | null>([
  ['g1', 'Female'],
  ['g2', 'Female'],
  ['b1', 'Male'],
  ['b2', 'Male'],
  ['b3', 'Male'],
  ['u1', '']
]);

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('orderRoster (BUG-006276)', () => {
  it('default keeps today\'s order exactly', () => {
    expect(ids(orderRoster(roster, 'default', genders))).toEqual(ids(roster));
  });

  it('name order is case-insensitive and uses the visible name ("S. Ponnaiyan" under S)', () => {
    expect(ids(orderRoster(roster, 'name'))).toEqual(['g2', 'b2', 'u1', 'b3', 'g1', 'b1']);
  });

  it('boys A-Z, then girls A-Z, unknown gender last', () => {
    expect(ids(orderRoster(roster, 'boys_then_girls', genders))).toEqual([
      'b2', // arjun M
      'b3', // Karthik
      'b1', // S. Ponnaiyan
      'g2', // Anitha
      'g1', // priya K
      'u1' // blank gender
    ]);
  });

  it('a learner missing from the gender map counts as unknown and goes last', () => {
    const partial = new Map(genders);
    partial.delete('b2');
    // Both unknowns go after the girls, A-Z among themselves.
    expect(ids(orderRoster(roster, 'boys_then_girls', partial)).slice(-2)).toEqual(['b2', 'u1']);
  });

  it('with no genders at all (function not applied yet) it falls back to name order', () => {
    expect(ids(orderRoster(roster, 'boys_then_girls', new Map()))).toEqual(
      ids(orderRoster(roster, 'name'))
    );
  });

  it('roll number order is numeric-aware, no roll number last', () => {
    expect(ids(orderRoster(roster, 'roll'))).toEqual(['g2', 'b2', 'g1', 'b1', 'b3', 'u1']);
  });

  it('never mutates the loaded roster and returns the same learner objects', () => {
    const before = ids(roster);
    const ordered = orderRoster(roster, 'boys_then_girls', genders);
    expect(ids(roster)).toEqual(before);
    for (const row of ordered) expect(roster).toContain(row);
  });

  it('a mark made on a re-ordered card lands on that learner id, not on the row at that index', () => {
    // The page renders the ordered list and toggles by learner.id.
    const attendance: Record<string, 'Present' | 'Absent'> = {};
    const ordered = orderRoster(roster, 'boys_then_girls', genders);
    const clicked = ordered[0]; // first card on screen: arjun M (b2)
    attendance[clicked.id] = 'Absent';

    expect(clicked.id).toBe('b2');
    expect(attendance).toEqual({ b2: 'Absent' });
    // The learner at index 0 of the loaded roster (what is saved) is untouched.
    expect(attendance[roster[0].id]).toBeUndefined();
  });

  it('only accepts the known order values from storage', () => {
    expect(isRosterOrder('boys_then_girls')).toBe(true);
    expect(isRosterOrder('gender')).toBe(false);
    expect(isRosterOrder(null)).toBe(false);
  });
});
