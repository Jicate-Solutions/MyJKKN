'use client';

import { useMemo } from 'react';

import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { useHrOrgMappings } from '@/hooks/hr/use-hr-org-mappings';
import type { EntityType } from '@/types/organizations';

interface Options {
  isActive?: boolean;
  autoFetch?: boolean;
  entityType?: EntityType | 'all' | EntityType[];
}

/**
 * The institution list for HR screens.
 *
 * `useInstitutionsWithAccess` answers "which institutions may this user see",
 * which is a TENANT question and is shared with every other module. It knows
 * nothing about HR, so a page calling it directly still lists institutions that
 * have been excluded from the HR module — which is exactly what
 * hr_organizations.included_in_hr is supposed to prevent.
 *
 * This intersects that list with useHrOrgMappings(), whose RPC
 * (fn_hr_orgs_for_institutions) filters on included_in_hr. Any HR page that
 * picks an institution should use THIS hook, not the base one.
 *
 * PURELY A NARROWING. Options are passed through untouched, including the base
 * hook's entityType default of 'institution'. That default is arguably wrong for
 * HR — components/hr/hr-institution-select.tsx documents that it hides 5 of the
 * 14 organizations (244 active staff across company, school and admin_office
 * entity types) from non-super-admins, and passes 'all' for that reason. Fixing
 * that is a separate, wider behaviour change and is deliberately NOT bundled
 * here: this hook only ever removes institutions, never adds them.
 *
 * Same return shape as the base hook, so call sites swap one for one.
 */
export function useHrInstitutionsWithAccess(options: Options = {}) {
  const base = useInstitutionsWithAccess(options);
  const { orgIdByInstitution, isLoading: mappingsLoading } = useHrOrgMappings();

  const institutions = useMemo(
    () => base.institutions.filter((i) => orgIdByInstitution.get(i.id)),
    [base.institutions, orgIdByInstitution]
  );

  return {
    ...base,
    institutions,
    // Both sources must settle before the list is trustworthy. Reporting ready
    // while the mapping is still loading would flash the unfiltered list —
    // briefly showing institutions that are not in HR, which is the one thing
    // this hook exists to stop.
    loading: base.loading || mappingsLoading,
  };
}
