import { describe, it, expect } from 'vitest';
import {
  buildStaffSearchTokenGroups,
  resolveStaffFiltersForUser
} from '@/lib/utils/staff-search';
import type { StaffFilters } from '@/types/staff';

// Each group becomes its own .or() call, and PostgREST ANDs successive .or()s.
// So group count == number of words the row must satisfy.
describe('buildStaffSearchTokenGroups', () => {
  it('searches every column, not a hand-picked subset', () => {
    const [group] = buildStaffSearchTokenGroups('DCH001');
    const columns = group.map((c) => c.split('.')[0]);

    // staff_id and designation were OFF by default in the old UI, which is why
    // searching a staff ID used to return nothing.
    expect(columns).toEqual([
      'first_name',
      'last_name',
      'staff_id',
      'legacy_staff_id',
      'email',
      'institution_email',
      'designation',
      'phone'
    ]);
    expect(group[0]).toBe('first_name.ilike.%DCH001%');
  });

  it('emits one group per word so a full name can match across two columns', () => {
    // The whole point: no single column contains "DHINESHKUMAR B", so matching
    // the full string against each column individually finds nothing.
    const groups = buildStaffSearchTokenGroups('DHINESHKUMAR B');
    expect(groups).toHaveLength(2);
    expect(groups[0].every((c) => c.includes('%DHINESHKUMAR%'))).toBe(true);
    expect(groups[1].every((c) => c.includes('%B%'))).toBe(true);
  });

  it('is order-independent', () => {
    const forward = buildStaffSearchTokenGroups('DHINESHKUMAR B');
    const reverse = buildStaffSearchTokenGroups('B DHINESHKUMAR');
    expect(reverse[0]).toEqual(forward[1]);
    expect(reverse[1]).toEqual(forward[0]);
  });

  it('behaves exactly as before for a single word', () => {
    expect(buildStaffSearchTokenGroups('salem')).toHaveLength(1);
  });

  it('strips characters that would terminate the or() expression', () => {
    // "Kumar, S" used to splice a stray comma into the filter list and produce
    // a malformed query. Tokenising handles the intent correctly instead.
    const groups = buildStaffSearchTokenGroups('Kumar, S');
    expect(groups).toHaveLength(2);
    expect(groups.flat().join('|')).not.toMatch(/[,()"\\]%/);
    expect(groups[0][0]).toBe('first_name.ilike.%Kumar%');
  });

  it('keeps dots, so honorifics still match', () => {
    // The value is everything after the second dot, so "MR." is safe to pass
    // through and is needed to match names stored as "MR. DHINESHKUMAR".
    const [group] = buildStaffSearchTokenGroups('MR.');
    expect(group[0]).toBe('first_name.ilike.%MR.%');
  });

  it('caps the token count so a pasted sentence cannot build a giant URL', () => {
    expect(buildStaffSearchTokenGroups('a b c d e f g h')).toHaveLength(5);
  });

  it('returns nothing for blank or whitespace-only input', () => {
    expect(buildStaffSearchTokenGroups('')).toEqual([]);
    expect(buildStaffSearchTokenGroups('   ')).toEqual([]);
    expect(buildStaffSearchTokenGroups(',,,')).toEqual([]);
  });
});

describe('resolveStaffFiltersForUser', () => {
  it('pins a HOD to their own institution', () => {
    const base: StaffFilters = { department_id: 'dept-123', institution_id: 'inst-legacy' };
    const resolved = resolveStaffFiltersForUser(base, {
      role: 'hod',
      institution_id: 'inst-locked'
    });
    expect(resolved.institution_id).toBe('inst-locked');
    expect(resolved.department_id).toBe('dept-123');
  });

  it('leaves other roles alone', () => {
    const base: StaffFilters = { institution_id: 'inst-legacy' };
    expect(
      resolveStaffFiltersForUser(base, { role: 'principal', institution_id: 'inst-locked' })
        .institution_id
    ).toBe('inst-legacy');
  });
});
