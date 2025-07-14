// hooks/use-degrees.ts

import { useState, useCallback, useEffect } from 'react';
import { DegreeService } from '@/lib/services/organization/degree-service';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import type { Degree, DegreeFilters } from '@/types/organizations';

export function useDegrees(initialFilters: DegreeFilters = {}) {
  const { user, isLoading: authLoading } = useAuth();
  const { isSuperAdmin, isLoading: permissionsLoading } = usePermissions();
  const [degrees, setDegrees] = useState<Degree[]>([]);
  const [loading, setLoading] = useState(true);
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DegreeFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchDegrees = useCallback(
    async (newFilters?: DegreeFilters, isPagination = false) => {
      try {
        // Don't fetch if auth or permissions are still loading
        if (authLoading || permissionsLoading) {
          console.log(
            'useDegrees: Skipping fetch - auth or permissions still loading'
          );
          return;
        }

        console.log(
          'useDegrees: Starting fetch with filters:',
          newFilters || filters,
          'User ID:',
          user?.id,
          'Super Admin:',
          isSuperAdmin
        );

        if (isPagination) {
          setPaginationLoading(true);
        } else {
          setLoading(true);
        }
        setError(null);

        const currentFilters = {
          ...(newFilters || filters),
          userId: user?.id,
          bypassInstitutionFilter: isSuperAdmin
        };

        console.log(
          'useDegrees: Calling DegreeService.getDegrees with filters:',
          currentFilters
        );
        const result = await DegreeService.getDegrees(currentFilters);
        console.log('useDegrees: Got result:', result);
        setDegrees(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('[useDegrees] Fetch Error:', err);
        setError(
          err instanceof Error
            ? err.message
            : 'An error occurred while fetching degrees.'
        );
      } finally {
        if (isPagination) {
          setPaginationLoading(false);
        } else {
          setLoading(false);
        }
      }
    },
    [filters, user?.id, isSuperAdmin, authLoading, permissionsLoading]
  );

  // Auto-fetch degrees when user data becomes available
  useEffect(() => {
    console.log(
      'useDegrees: Auth loading:',
      authLoading,
      'Permissions loading:',
      permissionsLoading,
      'User:',
      user?.id
    );

    // Only fetch if authentication and permissions are loaded
    if (!authLoading && !permissionsLoading) {
      console.log(
        'useDegrees: Both auth and permissions loaded, fetching degrees...'
      );
      fetchDegrees();
    }
  }, [authLoading, permissionsLoading, fetchDegrees, user?.id]);

  const updateFilters = useCallback(
    (newFilters: Partial<DegreeFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchDegrees(updatedFilters);
    },
    [filters, fetchDegrees]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchDegrees(updatedFilters, true); // Mark as pagination
    },
    [filters, fetchDegrees]
  );

  const changePageSize = useCallback(
    (limit: number) => {
      const updatedFilters = { ...filters, limit, page: 1 }; // Reset to first page when page size changes
      setFilters(updatedFilters);
      fetchDegrees(updatedFilters, true); // Mark as pagination
    },
    [filters, fetchDegrees]
  );

  return {
    degrees,
    loading,
    paginationLoading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    changePageSize,
    fetchDegrees
  };
}
