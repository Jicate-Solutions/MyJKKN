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
}

export function useUserInstitutionAccess(): InstitutionAccessHook {
  const [institutions, setInstitutions] = useState<AccessibleInstitution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { user } = useAuth();
  const { isSuperAdmin } = usePermissions();

  const fetchAccessibleInstitutions = useCallback(async () => {
    if (!user?.id) {
      setInstitutions([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const accessibleInstitutions =
        await UserInstitutionAccessService.getUserAccessibleInstitutions(
          user.id
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
  }, [user?.id]);

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
    return isSuperAdmin || user?.institution_id === null;
  }, [isSuperAdmin, user?.institution_id]);

  return {
    institutions,
    loading,
    error,
    refresh: fetchAccessibleInstitutions,
    hasAccessToInstitution,
    getAccessibleInstitutionIds,
    canAccessAllInstitutions: canAccessAllInstitutions()
  };
}
