import { describe, it, expect } from 'vitest';
import {
  syntheticSlug,
  staffEmailConflictKind,
  describeStaffEmailConflict,
  generateSyntheticEmail
} from '@/lib/services/staff/synthetic-email';

describe('syntheticSlug', () => {
  it('prefers the ID, normalised', () => {
    expect(syntheticSlug('EMP-001', '9876543210')).toBe('emp001');
  });

  it('falls back to the last ten phone digits', () => {
    expect(syntheticSlug('', '+91 98765 43210')).toBe('9876543210');
  });

  it('is null when neither can supply one', () => {
    expect(syntheticSlug('', '')).toBeNull();
    expect(syntheticSlug(null, null)).toBeNull();
  });

  it('collides for IDs that differ only in punctuation — the reported failure', () => {
    expect(syntheticSlug('EMP-001', null)).toBe(syntheticSlug('emp 001', null));
    expect(generateSyntheticEmail('institution', 'EMP-001', null)).toBe(
      generateSyntheticEmail('institution', 'emp 001', null)
    );
  });
});

describe('staffEmailConflictKind', () => {
  it('reads the constraint name', () => {
    expect(
      staffEmailConflictKind(
        'duplicate key value violates unique constraint "staff_institution_email_key"'
      )
    ).toBe('institution');
    expect(
      staffEmailConflictKind('duplicate key value violates unique constraint "staff_email_key"')
    ).toBe('personal');
  });

  it('ignores every other error', () => {
    expect(staffEmailConflictKind('duplicate key ... "staff_biometric_uq"')).toBeNull();
    expect(staffEmailConflictKind(null)).toBeNull();
  });
});

describe('describeStaffEmailConflict', () => {
  it('blames the ID when the address was generated, not the blank email box', () => {
    const result = describeStaffEmailConflict({
      kind: 'institution',
      address: '',
      staffId: 'EMP-001',
      phone: '9876543210'
    });

    expect(result.field).toBe('staff_id');
    expect(result.toast).toContain('EMP-001');
    expect(result.toast).not.toMatch(/^"" is already registered/);
  });

  it('points at the phone when there is no ID to blame', () => {
    const result = describeStaffEmailConflict({
      kind: 'institution',
      address: null,
      staffId: '',
      phone: '9876543210'
    });

    expect(result.field).toBe('phone');
    expect(result.message).toContain('unique ID');
  });

  it('treats a synthetic address the same as a blank one', () => {
    const result = describeStaffEmailConflict({
      kind: 'personal',
      address: generateSyntheticEmail('personal', 'EMP-001', null),
      staffId: 'EMP-001',
      phone: '9876543210'
    });

    expect(result.field).toBe('staff_id');
  });

  it('names the typed address and its holder when the operator typed one', () => {
    const result = describeStaffEmailConflict({
      kind: 'institution',
      address: 'asha@jkkn.ac.in',
      staffId: 'EMP-002',
      phone: '9876543210',
      holder: { name: 'ASHA K', staff_id: 'EMP-001', institution: 'JKKN Dental' }
    });

    expect(result.field).toBe('institution_email');
    expect(result.message).toContain('ASHA K');
    expect(result.toast).toContain('asha@jkkn.ac.in');
    expect(result.toast).toContain('JKKN Dental');
  });

  it('still reports the address when the holder cannot be resolved', () => {
    const result = describeStaffEmailConflict({
      kind: 'personal',
      address: 'asha@gmail.com',
      staffId: 'EMP-002',
      phone: '9876543210',
      holder: null
    });

    expect(result.field).toBe('email');
    expect(result.toast).toContain('asha@gmail.com');
  });
});
