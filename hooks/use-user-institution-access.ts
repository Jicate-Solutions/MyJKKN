import { useState, useEffect, useCallback } from 'react';
import {
  UserInstitutionAccessService,
  AccessibleInstitution
} from '@/lib/services/users/user-institution-access-service';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';

export interface InstitutionAccessHook {
  institutions: AccessibleInstitution[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  hasAccessToInstitution: (institutionId: string) => boolean;
  getAccessibleInstitutionIds: () => string[];
  canAccessAllInstitutions: boolean;
  createInstitutionFilter: <T extends { institution_id?: string }>(
    items: T[]
  ) => T[];
  getInstitutionFilterClause: () => string;
  isUserRestrictedToInstitutions: boolean;
}

export function useUserInstitutionAccess(): InstitutionAccessHook {
  const [institutions, setInstitutions] = useState<AccessibleInstitution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();

  const fetchAccessibleInstitutions = useCallback(async () => {
    if (!profile?.id) {
      setInstitutions([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const accessibleInstitutions =
        await UserInstitutionAccessService.getUserAccessibleInstitutions(
          profile.id
        );
      setInstitutions(accessibleInstitutions);
    } catch (err) {
      console.error('Error fetching accessible institutions:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to load accessible institutions'
      );
      setInstitutions([]);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    fetchAccessibleInstitutions();
  }, [fetchAccessibleInstitutions]);

  const hasAccessToInstitution = useCallback(
    (institutionId: string): boolean => {
      return institutions.some((inst) => inst.institution_id === institutionId);
    },
    [institutions]
  );

  const getAccessibleInstitutionIds = useCallback((): string[] => {
    return institutions.map((inst) => inst.institution_id);
  }, [institutions]);

  const canAccessAllInstitutions = useCallback((): boolean => {
    // Super admins and users with no primary institution (like accounts with null institution_id) can access all
    return isSuperAdmin || profile?.institution_id === null;
  }, [isSuperAdmin, profile?.institution_id]);

  const isUserRestrictedToInstitutions = useCallback((): boolean => {
    return !canAccessAllInstitutions();
  }, [canAccessAllInstitutions]);

  const createInstitutionFilter = useCallback(
    <T extends { institution_id?: string }>(items: T[]): T[] => {
      if (canAccessAllInstitutions()) {
        return items;
      }

      const accessibleIds = getAccessibleInstitutionIds();
      return items.filter(
        (item) =>
          item.institution_id && accessibleIds.includes(item.institution_id)
      );
    },
    [canAccessAllInstitutions, getAccessibleInstitutionIds]
  );

  const getInstitutionFilterClause = useCallback((): string => {
    if (canAccessAllInstitutions()) {
      return '1=1'; // No filtering needed
    }

    const accessibleIds = getAccessibleInstitutionIds();
    if (accessibleIds.length === 0) {
      return '1=0'; // No access to any institution
    }

    const quotedIds = accessibleIds.map((id) => `'${id}'`).join(',');
    return `institution_id IN (${quotedIds})`;
  }, [canAccessAllInstitutions, getAccessibleInstitutionIds]);

  return {
    institutions,
    loading,
    error,
    refresh: fetchAccessibleInstitutions,
    hasAccessToInstitution,
    getAccessibleInstitutionIds,
    canAccessAllInstitutions: canAccessAllInstitutions(),
    createInstitutionFilter,
    getInstitutionFilterClause,
    isUserRestrictedToInstitutions: isUserRestrictedToInstitutions()
  };
}
