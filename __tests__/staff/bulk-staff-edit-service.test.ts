import { describe, it, expect, vi } from 'vitest';

// BaseService builds its Supabase singleton in a module-level static initializer, which
// runs the moment bulk-staff-edit-service.ts is imported — before any test in this file
// runs, and with no real Supabase env vars available under Vitest. These tests only
// exercise pure functions (none touch `this.supabase`), so a minimal stub is enough to let
// the import succeed.
vi.mock('@/lib/supabase/client', () => ({
  createClientSupabaseClient: () => ({})
}));

import { summariseRows, claimUniqueValues, scopesToInstitutions } from '@/lib/services/staff/bulk-staff-edit-service';
import type { BulkEditRow } from '@/lib/services/staff/bulk-staff-edit-service';

const mk = (status: BulkEditRow['status'], n: number): BulkEditRow[] =>
  Array.from({ length: n }, (_, i) => ({
    rowNumber: i + 2,
    institutionEmail: `s${i}@jkkn.ac.in`,
    name: `S ${i}`,
    status,
    changes: status === 'change' ? [{ field: 'Phone', from: '1', to: '2' }] : [],
    issues: status === 'error' ? [{ field: 'Phone', message: 'bad', kind: 'format' as const }] : []
  }));

describe('summariseRows', () => {
  it('counts written, skipped and failed separately', () => {
    const counts = summariseRows([...mk('change', 3), ...mk('nochange', 2), ...mk('error', 4)]);
    expect(counts).toEqual({ updated: 3, skipped: 2, failed: 4 });
  });

  it('reports an all-clean batch', () => {
    expect(summariseRows(mk('change', 5))).toEqual({ updated: 5, skipped: 0, failed: 0 });
  });

  it('reports a no-changes-needed batch', () => {
    expect(summariseRows(mk('nochange', 5))).toEqual({ updated: 0, skipped: 5, failed: 0 });
  });

  it('handles an empty batch', () => {
    expect(summariseRows([])).toEqual({ updated: 0, skipped: 0, failed: 0 });
  });
});

// Two rows of the SAME upload both claiming one new value is invisible to the per-row
// validator — neither value exists in the database yet. Without claimUniqueValues the
// second row validates clean and then 23505s at write time.
describe('claimUniqueValues', () => {
  const INST = 'inst-1';
  const ctx = () => ({
    staffByEmail: new Map(),
    departmentsByInstitution: new Map(),
    categoriesByName: new Map(),
    institutionsByName: new Map(),
    emailOwner: new Map<string, string>(),
    biometricOwner: new Map<string, string>()
  }) as any;

  const staff = (id: string, over: Record<string, unknown> = {}) => ({
    id,
    institution_id: INST,
    institution_email: `${id}@jkkn.ac.in`,
    biometric_id: null,
    biometric_institution_id: null,
    ...over
  }) as any;

  it('claims a new personal email so a later row collides', () => {
    const c = ctx();
    claimUniqueValues(c, staff('s1'), { email: 'New@JKKN.ac.in' });
    expect(c.emailOwner.get('new@jkkn.ac.in')).toBe('s1');
  });

  it('claims a biometric code normalised, against the new machine', () => {
    const c = ctx();
    claimUniqueValues(c, staff('s1'), { biometric_id: '00002', biometric_institution_id: INST });
    expect(c.biometricOwner.get(`${INST}|2`)).toBe('s1');
  });

  it('falls back to the machine already on file when only the code changed', () => {
    const c = ctx();
    claimUniqueValues(c, staff('s1', { biometric_institution_id: INST }), { biometric_id: '7' });
    expect(c.biometricOwner.get(`${INST}|7`)).toBe('s1');
  });

  it('falls back to the code already on file when only the machine changed', () => {
    const c = ctx();
    claimUniqueValues(c, staff('s1', { biometric_id: '0009' }), { biometric_institution_id: INST });
    expect(c.biometricOwner.get(`${INST}|9`)).toBe('s1');
  });

  it('claims nothing when the row changed no unique field', () => {
    const c = ctx();
    claimUniqueValues(c, staff('s1'), { phone: '9000000001' });
    expect(c.emailOwner.size).toBe(0);
    expect(c.biometricOwner.size).toBe(0);
  });
});

// createApiInstitutionFilter (lib/auth/api-institution-filter.ts) returns an EMPTY array
// for super-admin / admission-global bypass, meaning "all institutions" — not "none". A
// buildContext that filtered unconditionally would `.in('institution_id', [])`, matching
// zero rows, and make the feature look completely broken for exactly those callers.
describe('scopesToInstitutions', () => {
  it('does not scope when the list is empty (super-admin / admission-global bypass)', () => {
    expect(scopesToInstitutions([])).toBe(false);
  });

  it('scopes when the list is non-empty', () => {
    expect(scopesToInstitutions(['inst-1'])).toBe(true);
    expect(scopesToInstitutions(['inst-1', 'inst-2'])).toBe(true);
  });
});
