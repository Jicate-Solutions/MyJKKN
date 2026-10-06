import { describe, expect, it } from 'vitest';

/**
 * Regression tests for the "Assign Warden -> Staff Member" picker not listing
 * boyshostel@jkkn.ac.in (MAARIKANI GV, staff 21c233e9…, role_key 'warden').
 *
 * Root cause found in prod: the picker narrowed its staff search with
 * `.eq('institution_id', profile.institution_id)`. For a SUPER ADMIN that
 * column is not a scope — it is merely a "home" institution, and 13 of the 15
 * super admins have one set. The admin who reported this is scoped to Jicate
 * Solutions (479eac7f…) while the warden's staff row lives in JKKN Main Office
 * (b962527f…), so the row was filtered out client-side even though RLS
 * (staff_select_scope_aware -> is_super_admin()) returned it happily.
 *
 * Measured in prod at the time of the fix: the picker's own query matched the
 * staff row 1 time with no institution filter and 0 times with the Jicate
 * filter applied, and a super admin could reach only 12 of 872 staff rows.
 *
 * The sibling Block dropdown in the SAME dialog already had this fix
 * (useHostelBlocks: `isSuperAdmin ? undefined : institutionId`); only the
 * staff picker was left behind. Institution confinement for everyone else is
 * enforced by RLS, so dropping the filter for super admins widens nothing for
 * scoped users.
 */

import { resolveStaffSearchInstitutionId } from '@/lib/services/campus-living/staff-picker-scope';

describe('resolveStaffSearchInstitutionId', () => {
  it('applies no institution filter for a super admin who has a home institution set', () => {
    // The exact prod shape: janani.jicate@jkkn.ac.in, super_admin, Jicate Solutions.
    expect(
      resolveStaffSearchInstitutionId({
        isSuperAdmin: true,
        profileInstitutionId: '479eac7f-3e5b-479e-bd91-dee9e0186b9b',
      })
    ).toBeUndefined();
  });

  it('applies no institution filter for a super admin with no institution', () => {
    expect(
      resolveStaffSearchInstitutionId({ isSuperAdmin: true, profileInstitutionId: null })
    ).toBeUndefined();
  });

  it('still confines a non-super-admin to their own institution', () => {
    expect(
      resolveStaffSearchInstitutionId({
        isSuperAdmin: false,
        profileInstitutionId: 'b962527f-97ce-4238-89ce-7b532d7c2bc6',
      })
    ).toBe('b962527f-97ce-4238-89ce-7b532d7c2bc6');
  });

  it('applies no filter when a non-super-admin has no institution, leaving scoping to RLS', () => {
    // Matches the previous `if (institutionId)` behaviour — an empty string
    // must not become a literal `.eq('institution_id', '')`, which would be an
    // invalid uuid comparison and error the whole search out.
    expect(
      resolveStaffSearchInstitutionId({ isSuperAdmin: false, profileInstitutionId: '' })
    ).toBeUndefined();
    expect(
      resolveStaffSearchInstitutionId({ isSuperAdmin: false, profileInstitutionId: undefined })
    ).toBeUndefined();
  });
});
