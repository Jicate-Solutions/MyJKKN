// __tests__/lib/id-cards/template-institution-filter.test.ts
// 2026-09-28 — /admin/id-cards/template is institution-first: the chosen
// institution scopes the template tiles and every tab. Pure helpers only.

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({}) as never
}));

import {
  ALL_INSTITUTIONS,
  UNASSIGNED_INSTITUTION,
  filterValueOf,
  templatesForInstitution
} from '@/components/admin/id-cards/template-selection';

const rows = [
  { id: 't1', institution_id: 'eng' },
  { id: 't2', institution_id: 'eng' },
  { id: 't3', institution_id: 'matric' },
  { id: 't4', institution_id: null }
];

describe('templatesForInstitution', () => {
  it('a real institution shows only its own templates', () => {
    expect(templatesForInstitution(rows, 'eng').map((r) => r.id)).toEqual(['t1', 't2']);
  });
  it('an institution with no templates shows none (not everything)', () => {
    expect(templatesForInstitution(rows, 'nursing')).toEqual([]);
  });
  it('"No institution assigned" shows only unassigned templates', () => {
    expect(templatesForInstitution(rows, UNASSIGNED_INSTITUTION).map((r) => r.id)).toEqual(['t4']);
  });
  it('"All institutions" and the not-yet-chosen state show everything', () => {
    expect(templatesForInstitution(rows, ALL_INSTITUTIONS).length).toBe(4);
    expect(templatesForInstitution(rows, '').length).toBe(4);
  });
});

describe('filterValueOf', () => {
  it('maps a template to the filter it lives under', () => {
    expect(filterValueOf({ institution_id: 'matric' })).toBe('matric');
    expect(filterValueOf({ institution_id: null })).toBe(UNASSIGNED_INSTITUTION);
  });
});
