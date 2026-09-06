// __tests__/meetings/group-purposes.test.ts
//
// groupPurposes collapses a host's meeting types into the choices a booker
// actually makes. The behaviour under test here is the one the 2026-08-03
// booking spec calls out explicitly:
//
//   "Mixed lengths in one card: show the length next to each option. Never
//    show one number for two different lengths."
//
// The original implementation set the card's durationMin from whichever record
// happened to arrive first, so a "Quick question" card spanning 2/5/10/15
// advertised a single number that was wrong for three of its four options.

import { describe, it, expect } from 'vitest';
import {
  groupPurposes,
  purposeDurationLabel,
  type GroupablePurposeType,
  type PurposeLocationMode,
} from '@/lib/services/meetings/group-purposes';

function mt(
  id: string,
  title: string,
  durationMin: number,
  purposeGroup: string | null = null,
  description: string | null = null,
  locationMode: PurposeLocationMode = 'in_person',
): GroupablePurposeType {
  return { id, title, durationMin, purposeGroup, description, locationMode };
}

describe('groupPurposes', () => {
  it('keeps an ungrouped type standing alone under its own title', () => {
    const [choice] = groupPurposes([mt('a', 'Classroom Visits', 30)]);
    expect(choice.label).toBe('Classroom Visits');
    expect(choice.durationsMin).toEqual([30]);
    expect(choice.hasMixedDurations).toBe(false);
  });

  it('collapses types sharing a purposeGroup into ONE choice', () => {
    const choices = groupPurposes([
      mt('a', 'One to One 15 Minutes', 15, 'Quick question'),
      mt('b', 'Online One to One 15Mins', 15, 'Quick question'),
    ]);
    expect(choices).toHaveLength(1);
    expect(choices[0].label).toBe('Quick question');
    expect(choices[0].options).toHaveLength(2);
  });

  it('reports EVERY length a purpose spans, not just the first record seen', () => {
    // Deliberately out of order: the 15-minute record arrives first, so an
    // implementation that trusts the first record would advertise "15 min"
    // for a purpose that also offers 2, 5 and 10.
    const [quick] = groupPurposes([
      mt('d', 'One to One 15 Minutes', 15, 'Quick question'),
      mt('a', 'One to One 2 Minutes', 2, 'Quick question'),
      mt('c', 'One to One 10 Minutes', 10, 'Quick question'),
      mt('b', 'One to One 5 Minutes', 5, 'Quick question'),
    ]);
    expect(quick.durationsMin).toEqual([2, 5, 10, 15]);
    expect(quick.hasMixedDurations).toBe(true);
    expect(purposeDurationLabel(quick)).toBe('2 / 5 / 10 / 15 min');
  });

  it('de-duplicates lengths so two formats of one length read as one', () => {
    // In person and online at the same length is ONE length, two ways to meet.
    const [choice] = groupPurposes([
      mt('a', 'One to One 30 Minutes', 30, 'Discussion'),
      mt('b', 'Online One to One 30 Mins', 30, 'Discussion'),
      mt('c', 'One to One 45 Minutes', 45, 'Discussion'),
    ]);
    expect(choice.durationsMin).toEqual([30, 45]);
    expect(purposeDurationLabel(choice)).toBe('30 / 45 min');
  });

  it('sorts purposes by their SHORTEST length, so the quickest come first', () => {
    const choices = groupPurposes([
      mt('c', 'Full review 60', 60, 'Full review'),
      mt('d', 'Full review 45', 45, 'Full review'),
      mt('a', 'Quick 15', 15, 'Quick question'),
      mt('b', 'Quick 2', 2, 'Quick question'),
    ]);
    expect(choices.map((c) => c.label)).toEqual(['Quick question', 'Full review']);
    // The card sorts on 2, not on 15 — the first record of that group.
    expect(choices[0].durationMin).toBe(2);
  });

  it('treats a whitespace-only group as unset rather than a blank-labelled card', () => {
    const choices = groupPurposes([
      mt('a', 'Classroom Visits', 30, '   '),
      mt('b', 'Facilitator Appraisal', 30, '   '),
    ]);
    expect(choices).toHaveLength(2);
    expect(choices.map((c) => c.label).sort()).toEqual([
      'Classroom Visits',
      'Facilitator Appraisal',
    ]);
  });

  it('keeps the first non-empty description for a grouped card', () => {
    const [choice] = groupPurposes([
      mt('a', 'In person', 15, 'Quick question', null),
      mt('b', 'Online', 15, 'Quick question', 'A single decision or approval'),
    ]);
    expect(choice.description).toBe('A single decision or approval');
  });

  it('labels a single-length purpose without a slash', () => {
    const [choice] = groupPurposes([mt('a', 'Discussion', 30)]);
    expect(purposeDurationLabel(choice)).toBe('30 min');
  });

  // The card used to say only "N ways to meet", so a booker could not see that
  // online was on offer without clicking in — which is why the module read as
  // having no online option at all.
  describe('locationModes (what the purpose CARD advertises)', () => {
    it('reports every distinct format a purpose is offered in', () => {
      const [choice] = groupPurposes([
        mt('a', 'One to One 15 Minutes', 15, 'Quick question', null, 'in_person'),
        mt('b', 'Online One to One 15Mins', 15, 'Quick question', null, 'online'),
      ]);
      expect(choice.locationModes).toEqual(['in_person', 'online']);
      expect(choice.hasMixedLocations).toBe(true);
    });

    it('DEDUPES — four in-person lengths plus one online reads as two formats', () => {
      // The real "Quick question" group: 2/5/10/15 in person + 15 online.
      const [choice] = groupPurposes([
        mt('a', '2 Minutes', 2, 'Quick question', null, 'in_person'),
        mt('b', '5 Minutes', 5, 'Quick question', null, 'in_person'),
        mt('c', '10 Minutes', 10, 'Quick question', null, 'in_person'),
        mt('d', '15 Minutes', 15, 'Quick question', null, 'in_person'),
        mt('e', 'Online 15Mins', 15, 'Quick question', null, 'online'),
      ]);
      expect(choice.options).toHaveLength(5);
      expect(choice.locationModes).toEqual(['in_person', 'online']);
    });

    it('orders formats consistently regardless of the order types arrive in', () => {
      const choices = groupPurposes([
        mt('a', 'Online', 30, 'Discussion', null, 'online'),
        mt('b', 'In person', 30, 'Discussion', null, 'in_person'),
      ]);
      // Online arrived FIRST but in_person still leads — a card must not
      // reorder itself because the host added a type in a different order.
      expect(choices[0].locationModes).toEqual(['in_person', 'online']);
    });

    it('a single-format purpose is not mixed', () => {
      const [choice] = groupPurposes([
        mt('a', 'Monthly IQAC Meeting', 90, null, null, 'in_person'),
      ]);
      expect(choice.locationModes).toEqual(['in_person']);
      expect(choice.hasMixedLocations).toBe(false);
    });

    it('carries phone through as its own format', () => {
      const [choice] = groupPurposes([
        mt('a', 'Admission Counseling', 30, 'Counselling', null, 'phone'),
        mt('b', 'Counselling in person', 30, 'Counselling', null, 'in_person'),
      ]);
      expect(choice.locationModes).toEqual(['in_person', 'phone']);
    });
  });
});
