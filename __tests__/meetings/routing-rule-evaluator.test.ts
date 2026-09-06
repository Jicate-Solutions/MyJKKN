// __tests__/meetings/routing-rule-evaluator.test.ts
//
// Adversarial suite for the PURE routing evaluator (Routing Forms M1).
// Expected outcomes are reasoned out in comments — the tests encode the spec
// (first-match-wins, all/any, is/is_not/contains, multiselect, default fallback,
// no-destination), not the evaluator's own output.

import { describe, expect, it } from 'vitest';
import {
  evaluateCondition,
  evaluateRule,
  evaluateRouting,
  type RoutingRule,
  type RoutingAnswers,
} from '@/lib/services/meetings/routing-rule-evaluator';

// Helper to build a rule with sane defaults.
function rule(partial: Partial<RoutingRule>): RoutingRule {
  return {
    id: partial.id ?? 'r',
    order_index: partial.order_index ?? 0,
    match_logic: partial.match_logic ?? 'all',
    conditions: partial.conditions ?? [],
    destination_type: partial.destination_type ?? 'message',
    destination_value: partial.destination_value ?? { markdown: 'default' },
    is_default: partial.is_default ?? false,
  };
}

describe('evaluateCondition', () => {
  const answers: RoutingAnswers = {
    program: 'Engineering',
    interests: ['Robotics', 'AI'],
    note: 'I want a scholarship please',
  };

  it('is — exact, case-insensitive match', () => {
    expect(evaluateCondition({ field_key: 'program', operator: 'is', value: 'engineering' }, answers)).toBe(true);
    expect(evaluateCondition({ field_key: 'program', operator: 'is', value: 'Medicine' }, answers)).toBe(false);
  });

  it('is_not — true when value absent, false when present', () => {
    expect(evaluateCondition({ field_key: 'program', operator: 'is_not', value: 'Medicine' }, answers)).toBe(true);
    expect(evaluateCondition({ field_key: 'program', operator: 'is_not', value: 'ENGINEERING' }, answers)).toBe(false);
  });

  it('is_not — vacuously TRUE when the field was never answered', () => {
    // No "scholarship" key in answers → "is_not X" should hold (nothing to contradict).
    expect(evaluateCondition({ field_key: 'scholarship', operator: 'is_not', value: 'yes' }, answers)).toBe(true);
  });

  it('contains — substring, case-insensitive', () => {
    expect(evaluateCondition({ field_key: 'note', operator: 'contains', value: 'scholarship' }, answers)).toBe(true);
    expect(evaluateCondition({ field_key: 'note', operator: 'contains', value: 'SCHOLAR' }, answers)).toBe(true);
    expect(evaluateCondition({ field_key: 'note', operator: 'contains', value: 'hostel' }, answers)).toBe(false);
  });

  it('multiselect — "is" matches ANY selected option', () => {
    expect(evaluateCondition({ field_key: 'interests', operator: 'is', value: 'AI' }, answers)).toBe(true);
    expect(evaluateCondition({ field_key: 'interests', operator: 'is', value: 'Dance' }, answers)).toBe(false);
  });

  it('multiselect — "is_not" requires NONE of the selected options to equal value', () => {
    expect(evaluateCondition({ field_key: 'interests', operator: 'is_not', value: 'Dance' }, answers)).toBe(true);
    expect(evaluateCondition({ field_key: 'interests', operator: 'is_not', value: 'Robotics' }, answers)).toBe(false);
  });

  it('contains over a multiselect — true if any option contains the substring', () => {
    expect(evaluateCondition({ field_key: 'interests', operator: 'contains', value: 'robot' }, answers)).toBe(true);
  });

  it('unknown operator never matches', () => {
    // @ts-expect-error — intentionally invalid operator to prove defensive default.
    expect(evaluateCondition({ field_key: 'program', operator: 'startsWith', value: 'Eng' }, answers)).toBe(false);
  });
});

describe('evaluateRule — match_logic', () => {
  const answers: RoutingAnswers = { a: 'x', b: 'y' };

  it('all — every condition must be true', () => {
    const r = rule({
      match_logic: 'all',
      conditions: [
        { field_key: 'a', operator: 'is', value: 'x' },
        { field_key: 'b', operator: 'is', value: 'y' },
      ],
    });
    expect(evaluateRule(r, answers)).toBe(true);

    const r2 = rule({
      match_logic: 'all',
      conditions: [
        { field_key: 'a', operator: 'is', value: 'x' },
        { field_key: 'b', operator: 'is', value: 'WRONG' },
      ],
    });
    expect(evaluateRule(r2, answers)).toBe(false);
  });

  it('any — at least one condition true is enough', () => {
    const r = rule({
      match_logic: 'any',
      conditions: [
        { field_key: 'a', operator: 'is', value: 'WRONG' },
        { field_key: 'b', operator: 'is', value: 'y' },
      ],
    });
    expect(evaluateRule(r, answers)).toBe(true);

    const r2 = rule({
      match_logic: 'any',
      conditions: [
        { field_key: 'a', operator: 'is', value: 'WRONG1' },
        { field_key: 'b', operator: 'is', value: 'WRONG2' },
      ],
    });
    expect(evaluateRule(r2, answers)).toBe(false);
  });

  it('a non-default rule with zero conditions is a catch-all (always matches)', () => {
    expect(evaluateRule(rule({ conditions: [] }), answers)).toBe(true);
  });
});

describe('evaluateRouting — first match wins + default fallback', () => {
  const ENG = { type: 'event_link', value: { url: '/book/eng' } };
  const MED = { type: 'url', value: { url: 'https://med.example/apply' } };
  const FALLBACK = { type: 'message', value: { markdown: 'We will contact you.' } };

  const rules: RoutingRule[] = [
    rule({
      id: 'eng',
      order_index: 0,
      conditions: [{ field_key: 'program', operator: 'is', value: 'Engineering' }],
      destination_type: 'event_link',
      destination_value: { url: '/book/eng' },
    }),
    rule({
      id: 'med',
      order_index: 1,
      conditions: [{ field_key: 'program', operator: 'is', value: 'Medicine' }],
      destination_type: 'url',
      destination_value: { url: 'https://med.example/apply' },
    }),
    rule({
      id: 'default',
      is_default: true,
      destination_type: 'message',
      destination_value: { markdown: 'We will contact you.' },
    }),
  ];

  it('routes Engineering to the first rule', () => {
    const res = evaluateRouting({ program: 'Engineering' }, rules);
    expect(res.rule?.id).toBe('eng');
    expect(res.destination).toEqual(ENG);
  });

  it('routes Medicine to the second rule', () => {
    const res = evaluateRouting({ program: 'Medicine' }, rules);
    expect(res.rule?.id).toBe('med');
    expect(res.destination).toEqual(MED);
  });

  it('falls back to the default rule when nothing matches', () => {
    const res = evaluateRouting({ program: 'Law' }, rules);
    expect(res.rule?.id).toBe('default');
    expect(res.destination).toEqual(FALLBACK);
  });

  it('FIRST match wins when two non-default rules both match (lower order_index)', () => {
    // Both rules match program=Engineering; order_index 0 must win over 5.
    const overlapping: RoutingRule[] = [
      rule({
        id: 'second',
        order_index: 5,
        conditions: [{ field_key: 'program', operator: 'is', value: 'Engineering' }],
        destination_value: { url: '/book/second' },
        destination_type: 'event_link',
      }),
      rule({
        id: 'first',
        order_index: 0,
        conditions: [{ field_key: 'program', operator: 'is', value: 'Engineering' }],
        destination_value: { url: '/book/first' },
        destination_type: 'event_link',
      }),
    ];
    const res = evaluateRouting({ program: 'Engineering' }, overlapping);
    expect(res.rule?.id).toBe('first');
  });

  it('the default rule is never chosen over a matching non-default rule, regardless of array order', () => {
    // Put the default FIRST in the array — it must still lose to a matching rule.
    const res = evaluateRouting({ program: 'Engineering' }, [rules[2], rules[0], rules[1]]);
    expect(res.rule?.id).toBe('eng');
  });

  it('returns null destination when nothing matches and there is NO default', () => {
    const noDefault = rules.filter((r) => !r.is_default);
    const res = evaluateRouting({ program: 'Law' }, noDefault);
    expect(res.rule).toBeNull();
    expect(res.destination).toBeNull();
  });

  it('handles empty/garbage rule lists without throwing', () => {
    expect(evaluateRouting({ program: 'x' }, [])).toEqual({ rule: null, destination: null });
    // @ts-expect-error — non-array input is tolerated defensively.
    expect(evaluateRouting({ program: 'x' }, null)).toEqual({ rule: null, destination: null });
  });

  it('multi-condition all-logic rule routes correctly', () => {
    const composite: RoutingRule[] = [
      rule({
        id: 'eng-scholarship',
        order_index: 0,
        match_logic: 'all',
        conditions: [
          { field_key: 'program', operator: 'is', value: 'Engineering' },
          { field_key: 'need', operator: 'contains', value: 'scholarship' },
        ],
        destination_type: 'event_link',
        destination_value: { url: '/book/eng-scholarship' },
      }),
      rule({ id: 'default', is_default: true }),
    ];
    // Both conditions satisfied → eng-scholarship.
    expect(
      evaluateRouting({ program: 'Engineering', need: 'I need a scholarship' }, composite).rule?.id,
    ).toBe('eng-scholarship');
    // Program matches but no scholarship → default.
    expect(
      evaluateRouting({ program: 'Engineering', need: 'just curious' }, composite).rule?.id,
    ).toBe('default');
  });
});
