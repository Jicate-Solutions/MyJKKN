import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { OrganizationService } from '@/lib/services/organization/organization-service';

interface UseInstitutionsWithAccessOptions {
  isActive?: boolean;
  autoFetch?: boolean;
}

export function useInstitutionsWithAccess(
  options: UseInstitutionsWithAccessOptions = {}
) {
  const { isActive = true, autoFetch = true } = options;
  const { user } = useAuth();
  const { isSuperAdmin } = usePermissions();

  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string; counselling_code: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchInstitutions = useCallback(async () => {
    if (!user?.id) {
      setInstitutions([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      let institutionNames;

      if (isSuperAdmin) {
        // Super admin sees all institutions - don't pass userId to bypass filtering
        institutionNames = await OrganizationService.getInstitutionNames(
          isActive
        );
      } else {
        // Regular users see only accessible institutions - pass userId for filtering
        institutionNames = await OrganizationService.getInstitutionNames(
          isActive,
          user.id
        );
      }

      setInstitutions(institutionNames);
    } catch (err) {
      console.error('Error fetching institutions:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to fetch institutions'
      );
      setInstitutions([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, isSuperAdmin, isActive]);

  useEffect(() => {
    if (autoFetch) {
      fetchInstitutions();
    }
  }, [fetchInstitutions, autoFetch]);

  return {
    institutions,
    loading,
    error,
    refetch: fetchInstitutions
  };
}
