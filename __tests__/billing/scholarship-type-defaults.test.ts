// Dynamic scholarship categories/types: the pure rules behind the Apply and
// Edit forms. The database enforces the same pairing with a composite FK
// (billing_scholarships → billing_scholarship_types(id, category_id)); this is the
// client-side mirror that gives the applier a readable message first.
import { describe, expect, it } from 'vitest';
import {
  selectableCategories,
  selectableTypes,
  slugifyCode,
  uniqueCode,
  validateScholarshipSelection
} from '@/lib/billing/scholarship-type-defaults';
import type {
  ScholarshipCategoryWithTypes,
  ScholarshipType
} from '@/types/billing-schedule';

const type = (over: Partial<ScholarshipType>): ScholarshipType => ({
  id: 't',
  category_id: 'c1',
  code: 'general',
  name: 'General',
  description: null,
  sort_order: 10,
  is_active: true,
  created_at: '',
  updated_at: '',
  ...over
});

const tree: ScholarshipCategoryWithTypes[] = [
  {
    id: 'c1',
    code: 'merit',
    name: 'Merit',
    description: null,
    sort_order: 10,
    is_active: true,
    created_at: '',
    updated_at: '',
    types: [
      type({ id: 't1', category_id: 'c1', name: 'Topper' }),
      type({ id: 't2', category_id: 'c1', name: 'Retired', is_active: false })
    ]
  },
  {
    id: 'c2',
    code: 'sports',
    name: 'Sports',
    description: null,
    sort_order: 20,
    is_active: false,
    created_at: '',
    updated_at: '',
    types: [type({ id: 't3', category_id: 'c2', name: 'State level' })]
  }
];

describe('selectableCategories / selectableTypes', () => {
  it('hides inactive categories unless one is already on the record', () => {
    expect(selectableCategories(tree).map((c) => c.id)).toEqual(['c1']);
    expect(selectableCategories(tree, 'c2').map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('lists only the chosen category’s active types, plus the record’s own', () => {
    expect(selectableTypes(tree, 'c1').map((t) => t.id)).toEqual(['t1']);
    expect(selectableTypes(tree, 'c1', 't2').map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('returns nothing before a category is chosen or for an unknown one', () => {
    expect(selectableTypes(tree, undefined)).toEqual([]);
    expect(selectableTypes(tree, 'nope')).toEqual([]);
  });
});

describe('validateScholarshipSelection', () => {
  it('accepts an active category with one of its active types', () => {
    expect(validateScholarshipSelection(tree, 'c1', 't1')).toBeNull();
  });

  it('asks for a category, then a type', () => {
    expect(validateScholarshipSelection(tree, undefined, undefined)).toMatch(/category/i);
    expect(validateScholarshipSelection(tree, 'c1', undefined)).toMatch(/type/i);
  });

  it('rejects a type that belongs to a different category', () => {
    expect(validateScholarshipSelection(tree, 'c1', 't3')).toMatch(/does not belong/i);
  });

  it('rejects inactive picks on a new selection but allows the record’s own on edit', () => {
    expect(validateScholarshipSelection(tree, 'c1', 't2')).toMatch(/inactive/i);
    expect(validateScholarshipSelection(tree, 'c2', 't3')).toMatch(/inactive/i);
    expect(
      validateScholarshipSelection(tree, 'c1', 't2', { allowInactiveTypeId: 't2' })
    ).toBeNull();
    expect(
      validateScholarshipSelection(tree, 'c2', 't3', { allowInactiveCategoryId: 'c2' })
    ).toBeNull();
  });
});

describe('slugifyCode / uniqueCode', () => {
  it('produces codes the database CHECK accepts', () => {
    expect(slugifyCode('  Merit Scholarship ')).toBe('merit_scholarship');
    expect(slugifyCode('Staff & Quota (2026)')).toBe('staff_quota_2026');
    expect(slugifyCode('பெயர்')).toBe('');
  });

  it('suffixes a clash until it is free', () => {
    expect(uniqueCode('merit', ['sports'])).toBe('merit');
    expect(uniqueCode('merit', ['merit'])).toBe('merit_2');
    expect(uniqueCode('merit', ['merit', 'merit_2'])).toBe('merit_3');
  });
});
