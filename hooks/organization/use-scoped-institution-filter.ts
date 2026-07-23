import { useEffect } from 'react';
import { usePermissions } from '@/hooks/use-permissions';
import { useInstitutionsWithAccess } from './use-institutions-with-access';

interface UseScopedInstitutionFilterOptions {
  /** The institution_id currently applied in the URL/search params. */
  selectedInstitutionId: string | undefined;
  /** Filter setter from the page's filter-client wrapper. */
  onFilterChange: (key: string, value: string | undefined) => void;
}

/**
 * Shared logic for organization list-page institution filters.
 *
 * - Super admins get every institution plus an "All Institutions" option
 *   (caller renders that option behind the returned `isSuperAdmin` flag).
 * - Normal users get only their own accessible institutions and NO "All"
 *   option; this hook auto-selects their institution so the dropdown (and the
 *   list it scopes) never sits on a cross-institution "all" they can't have.
 *
 * `entityType: 'all'` keeps schools in the list (the access filter still
 * scopes normal users) — see the entity_type drift fix in project memory.
 */
export function useScopedInstitutionFilter({
  selectedInstitutionId,
  onFilterChange
}: UseScopedInstitutionFilterOptions) {
  const { isSuperAdmin } = usePermissions();
  const { institutions, loading } = useInstitutionsWithAccess({
    isActive: true,
    entityType: 'all'
  });

  useEffect(() => {
    // Once the scoped list resolves, a normal user with nothing chosen is
    // defaulted to their own institution. Self-healing: if the selection is
    // ever cleared, this re-applies so the dropdown is never left blank.
    if (
      !isSuperAdmin &&
      !loading &&
      !selectedInstitutionId &&
      institutions.length > 0
    ) {
      onFilterChange('institution_id', institutions[0].id);
    }
  }, [isSuperAdmin, loading, selectedInstitutionId, institutions, onFilterChange]);

  return { institutions, loading, isSuperAdmin };
}
