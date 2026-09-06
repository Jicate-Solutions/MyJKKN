import { describe, it, expect } from 'vitest';
import {
  collidesWithExisting,
  type ExistingStructureKey,
} from '@/lib/services/admission/fee-structure-bulk-diff';
import type { BulkUpsertPayload } from '@/lib/utils/mappings/fee-structure-excel-mappings';

// The Validate step predicts the database's overlap trigger
// (_fee_structure_community_no_overlap) so a CREATE row that duplicates a stored
// structure is named BEFORE Apply. These pin the key to the trigger's, column
// for column: if the trigger changes, change both, and these tell you which.

const ids = {
  inst: 'inst-1', deg: 'deg-1', dept: 'dept-1', prog: 'prog-1', year: 'ay-2026',
  quotaMQ: 'quota-mq', quotaGQ: 'quota-gq',
  dayScholar: 'acc-ds', hostel: 'acc-hostel',
  bc: 'comm-bc', mbc: 'comm-mbc', sc: 'comm-sc',
};

const create = (over: Partial<BulkUpsertPayload> = {}): BulkUpsertPayload => ({
  structure_id: null,
  institution_id: ids.inst, degree_id: ids.deg, department_id: ids.dept, programme_id: ids.prog,
  admission_year_id: ids.year, quota_id: ids.quotaGQ, gender: null, accommodation_type_id: ids.dayScholar,
  hostel_category_id: null, mess_category_id: null,
  community_category_ids: [ids.bc, ids.mbc],
  name: 'BSC AECT - GQ - DS - 2026', status: 'active', notes: null, effective_from: null, effective_to: null,
  items: [],
  ...over,
});

const stored = (over: Partial<ExistingStructureKey> = {}): ExistingStructureKey => ({
  id: 'existing-1', name: 'BSC AECT - GQ - DS - 2026', created_at: '2026-09-03T10:59:38Z', status: 'active',
  institution_id: ids.inst, degree_id: ids.deg, department_id: ids.dept, programme_id: ids.prog,
  quota_id: ids.quotaGQ, admission_year_id: ids.year, accommodation_type_id: ids.dayScholar, gender: null,
  communities: [{ community_category_id: ids.bc }, { community_category_id: ids.sc }],
  ...over,
});

describe('collidesWithExisting — the Validate step predicts the overlap trigger', () => {
  it('the same dimensions with one community in common is a collision', () => {
    expect(collidesWithExisting(create(), stored())).toBe(true);
  });

  it('a different quota is a different structure — GQ beside MQ is fine', () => {
    expect(collidesWithExisting(create(), stored({ quota_id: ids.quotaMQ }))).toBe(false);
  });

  it('a different accommodation is a different structure, and null only equals null', () => {
    expect(collidesWithExisting(create(), stored({ accommodation_type_id: ids.hostel }))).toBe(false);
    expect(collidesWithExisting(create({ accommodation_type_id: null }), stored())).toBe(false);
    expect(collidesWithExisting(create({ accommodation_type_id: null }), stored({ accommodation_type_id: null }))).toBe(true);
  });

  it('no community in common is no collision', () => {
    expect(collidesWithExisting(create({ community_category_ids: [ids.mbc] }), stored())).toBe(false);
  });

  it('a structure with no communities at all is never a collision', () => {
    expect(collidesWithExisting(create(), stored({ communities: null }))).toBe(false);
    expect(collidesWithExisting(create(), stored({ communities: [] }))).toBe(false);
  });

  it('an archived structure never blocks a create', () => {
    expect(collidesWithExisting(create(), stored({ status: 'archived' }))).toBe(false);
  });

  it('gender: "Any" on either side collides, two different genders do not', () => {
    expect(collidesWithExisting(create({ gender: 'FEMALE' }), stored({ gender: null }))).toBe(true);
    expect(collidesWithExisting(create({ gender: null }), stored({ gender: 'MALE' }))).toBe(true);
    expect(collidesWithExisting(create({ gender: 'MALE' }), stored({ gender: 'MALE' }))).toBe(true);
    expect(collidesWithExisting(create({ gender: 'FEMALE' }), stored({ gender: 'MALE' }))).toBe(false);
  });

  it('hostel and mess categories are NOT part of the key, exactly like the trigger', () => {
    expect(
      collidesWithExisting(
        create({ accommodation_type_id: ids.hostel, hostel_category_id: 'room-classic', mess_category_id: 'mess-classic' }),
        stored({ accommodation_type_id: ids.hostel }),
      ),
    ).toBe(true);
  });

  it('every other dimension is part of the key', () => {
    for (const k of ['institution_id', 'degree_id', 'department_id', 'programme_id', 'admission_year_id'] as const) {
      expect(collidesWithExisting(create(), stored({ [k]: 'something-else' }))).toBe(false);
    }
  });
});
