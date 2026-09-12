'use client';

import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import type { EntityType } from '@/types/organizations';

interface Options {
  isActive?: boolean;
  autoFetch?: boolean;
  entityType?: EntityType | 'all' | EntityType[];
}

/**
 * The institution list for RECRUITMENT screens.
 *
 * Recruitment runs group-wide and is NOT gated by
 * hr_organizations.included_in_hr. That flag switches an institution out of the
 * HR module proper — leave, payroll, attendance, staff records — and the 16
 * restrictive `hr_included_gate` RLS policies enforce it on exactly those
 * tables. No recruitment table carries one, because hiring for an institution
 * happens before (and independently of) its staff being administered in HR.
 *
 * So recruitment must NOT use useHrInstitutionsWithAccess: that hook intersects
 * with fn_hr_orgs_for_institutions, which filters on included_in_hr and would
 * hide institutions the module is meant to hire for.
 *
 * entityType defaults to 'all' for the same reason
 * components/hr/hr-institution-select.tsx passes it: the base hook's
 * 'institution' default hides 5 of the 14 organizations — 2 company, 2 school
 * and 1 admin_office — from every non-super-admin. Recruitment posts jobs in
 * all four entity types.
 *
 * Access is not widened. The base hook still intersects with the caller's
 * accessible institutions, and RLS remains the real gate.
 */
export function useRecruitmentInstitutions(options: Options = {}) {
  return useInstitutionsWithAccess({ entityType: 'all', ...options });
}
