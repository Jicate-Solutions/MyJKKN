// __tests__/events/form-visibility.test.ts
//
// The "show only when" evaluator is shared by the builder, both public forms
// and the public-register API. Pin the ops — especially `in` (is any of) and
// how multi-select answers match — and that required-field validation on the
// server skips hidden fields and hidden sections.

import { describe, it, expect } from 'vitest';
import {
  conditionHolds,
  parseConditionList,
  visibleFields,
} from '@/lib/services/events/registration/form-visibility';
import { validateCustomFields } from '@/lib/services/events/tournament/event-registration-form-service';
import type { EventRegistrationFormField } from '@/types/tournament';

const c = (op: any, value = '', field = 'cat') => ({ field, op, value });

describe('conditionHolds', () => {
  it('eq / neq compare a single answer, case-insensitively', () => {
    expect(conditionHolds(c('eq', 'industry'), { cat: 'industry' })).toBe(true);
    expect(conditionHolds(c('eq', 'Industry'), { cat: 'industry' })).toBe(true);
    expect(conditionHolds(c('eq', 'ngo'), { cat: 'industry' })).toBe(false);
    expect(conditionHolds(c('neq', 'ngo'), { cat: 'industry' })).toBe(true);
  });

  it('in matches when the answer is any of a comma list', () => {
    const rule = c('in', 'industry, hrrecruitment_vendors, mou_partners, ngo');
    expect(conditionHolds(rule, { cat: 'ngo' })).toBe(true);
    expect(conditionHolds(rule, { cat: 'mou_partners' })).toBe(true);
    expect(conditionHolds(rule, { cat: 'learners' })).toBe(false);
    expect(conditionHolds(rule, {})).toBe(false);
  });

  it('in / eq match a multi-select answer when any chosen option qualifies', () => {
    expect(conditionHolds(c('in', 'ngo, industry'), { cat: ['learners', 'ngo'] })).toBe(true);
    expect(conditionHolds(c('eq', 'ngo'), { cat: ['learners', 'ngo'] })).toBe(true);
    expect(conditionHolds(c('in', 'ngo'), { cat: ['learners'] })).toBe(false);
  });

  it('contains is a substring for one value, and "any of" for a comma list', () => {
    expect(conditionHolds(c('contains', 'vendor'), { cat: 'hrrecruitment_vendors' })).toBe(true);
    // The saved Townhall rule: contains + list must read as "is any of".
    const saved = c('contains', 'industry, hrrecruitment_vendors, mou_partners, ngo');
    expect(conditionHolds(saved, { cat: 'industry' })).toBe(true);
    expect(conditionHolds(saved, { cat: 'ngo' })).toBe(true);
    expect(conditionHolds(saved, { cat: 'learners' })).toBe(false);
  });

  it('not_empty / empty; a missing rule always holds', () => {
    expect(conditionHolds(c('not_empty'), { cat: 'x' })).toBe(true);
    expect(conditionHolds(c('not_empty'), { cat: [] })).toBe(false);
    expect(conditionHolds(c('empty'), {})).toBe(true);
    expect(conditionHolds(null, {})).toBe(true);
  });

  it('parseConditionList splits on comma, pipe or newline', () => {
    expect(parseConditionList('a, b |c\n d')).toEqual(['a', 'b', 'c', 'd']);
  });
});

const field = (over: Partial<EventRegistrationFormField>): EventRegistrationFormField =>
  ({
    id: over.field_key ?? 'f',
    section_id: 's1',
    form_id: 'form',
    event_id: 'ev',
    field_key: 'f',
    field_label: 'F',
    field_type: 'text',
    is_required: true,
    display_order: 0,
    placeholder: null,
    help_text: null,
    min_length: null,
    max_length: null,
    min_value: null,
    max_value: null,
    pattern: null,
    options: null,
    condition: null,
    media_url: null,
    prefill_source: null,
    created_at: '',
    updated_at: '',
    ...over,
  }) as EventRegistrationFormField;

describe('validateCustomFields honours show-when rules', () => {
  const fields = [
    field({ field_key: 'cat', field_label: 'Category', field_type: 'select', section_id: 's0' }),
    field({ field_key: 'org', field_label: 'ORGANIZATION / COMPANY', condition: c('in', 'industry, ngo') }),
    field({ field_key: 'roll', field_label: 'Roll number', section_id: 's2' }),
  ];
  const sections = [
    { id: 's0', condition: null },
    { id: 's1', condition: null },
    { id: 's2', condition: c('eq', 'learners') },
  ];

  it('a required field hidden by its own rule is not demanded', () => {
    expect(validateCustomFields(fields, { cat: 'learners', roll: '1' }, sections)).toBeNull();
    expect(validateCustomFields(fields, { cat: 'industry', org: 'ACME' }, sections)).toBeNull();
  });

  it('a required field in a hidden section is not demanded', () => {
    expect(validateCustomFields(fields, { cat: 'ngo', org: 'X' }, sections)).toBeNull();
  });

  it('a visible required field is still demanded', () => {
    expect(validateCustomFields(fields, { cat: 'industry' }, sections)).toBe(
      '"ORGANIZATION / COMPANY" is required',
    );
    expect(validateCustomFields(fields, { cat: 'learners' }, sections)).toBe(
      '"Roll number" is required',
    );
  });

  it('without sections (older callers) only field rules apply', () => {
    expect(validateCustomFields(fields, { cat: 'ngo', org: 'X' })).toBe('"Roll number" is required');
  });

  it('visibleFields applies section then field rules', () => {
    expect(visibleFields(fields, { cat: 'ngo' }, sections).map((f) => f.field_key)).toEqual(['cat', 'org']);
  });
});
