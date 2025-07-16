import { useState, useEffect, useCallback, useMemo } from 'react';
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
  const { profile } = useAuth();
  const { isSuperAdmin } = usePermissions();

  const [institutions, setInstitutions] = useState<
    Array<{ id: string; name: string; counselling_code: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Memoize the fetch function dependencies to prevent unnecessary recreations
  const fetchInstitutions = useCallback(async () => {
    if (!profile?.id) {
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
          profile.id
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
  }, [profile?.id, isSuperAdmin, isActive]);

  // Memoize the effect dependencies to prevent unnecessary re-runs
  const shouldFetch = useMemo(
    () => autoFetch && profile?.id,
    [autoFetch, profile?.id]
  );

  useEffect(() => {
    if (shouldFetch) {
      fetchInstitutions();
    }
  }, [shouldFetch, fetchInstitutions]);

  return {
    institutions,
    loading,
    error,
    refetch: fetchInstitutions
  };
}
