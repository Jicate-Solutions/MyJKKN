import { describe, it, expect } from 'vitest';
import {
  BULK_EDIT_COLUMNS,
  EDITABLE_COLUMNS,
  MATCH_KEY_HEADER,
  GENDERS,
  MARITAL_STATUSES,
  BLOOD_GROUPS
} from '@/lib/services/staff/staff-bulk-edit-columns';

describe('BULK_EDIT_COLUMNS', () => {
  it('has unique headers', () => {
    const headers = BULK_EDIT_COLUMNS.map(c => c.header);
    expect(new Set(headers).size).toBe(headers.length);
  });

  it('starts with the match key', () => {
    expect(BULK_EDIT_COLUMNS[0].header).toBe(MATCH_KEY_HEADER);
  });

  it('never writes through a locked column', () => {
    const locked = BULK_EDIT_COLUMNS.filter(c => c.field === null).map(c => c.header);
    expect(locked).toEqual([
      'Institution Email',
      'Staff ID (current)',
      'Name',
      'Institution'
    ]);
  });

  it('maps every editable column to a distinct staff field', () => {
    const fields = EDITABLE_COLUMNS.map(c => c.field);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it('excludes tenancy and access-control fields', () => {
    const fields = EDITABLE_COLUMNS.map(c => c.field as string);
    for (const forbidden of ['institution_id', 'role_key', 'is_active', 'login_enabled', 'employment_type']) {
      expect(fields).not.toContain(forbidden);
    }
  });

  it('exposes Staff ID twice — locked for identity, editable for correction', () => {
    expect(BULK_EDIT_COLUMNS.find(c => c.header === 'Staff ID (current)')?.field).toBeNull();
    expect(BULK_EDIT_COLUMNS.find(c => c.header === 'Staff ID (new)')?.field).toBe('staff_id');
  });

  it('carries the DB CHECK vocabularies verbatim', () => {
    expect(GENDERS).toEqual(['male', 'female', 'bigender']);
    expect(MARITAL_STATUSES).toEqual(['single', 'married', 'divorced', 'widow']);
    expect(BLOOD_GROUPS).toEqual(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'A1+', 'A1B']);
  });

  it('gives every enum column its values', () => {
    for (const col of EDITABLE_COLUMNS.filter(c => c.kind === 'enum')) {
      expect(col.enumValues && col.enumValues.length).toBeGreaterThan(0);
    }
  });
});
