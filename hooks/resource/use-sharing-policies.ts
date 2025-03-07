// hooks/resource/use-sharing-policies.ts

import { useState, useCallback } from 'react';
import type { SharingPolicy, SharingPolicyFilters } from '@/types/resources';
import { SharingPolicyService } from '@/lib/services/resource/sharing-policy-service';

export function useSharingPolicies(initialFilters: SharingPolicyFilters = {}) {
  const [policies, setPolicies] = useState<SharingPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<SharingPolicyFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchPolicies = useCallback(
    async (newFilters?: SharingPolicyFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await SharingPolicyService.getSharingPolicies(
          currentFilters
        );
        setPolicies(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching sharing policies:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<SharingPolicyFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchPolicies(updatedFilters);
    },
    [filters, fetchPolicies]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchPolicies(updatedFilters);
    },
    [filters, fetchPolicies]
  );

  const createPolicy = useCallback(
    async (data: any) => {
      try {
        setLoading(true);
        setError(null);
        await SharingPolicyService.createSharingPolicy(data);
        // Refresh the list
        fetchPolicies();
        return true;
      } catch (err) {
        console.error('Error creating sharing policy:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchPolicies]
  );

  const updatePolicy = useCallback(
    async (id: string, data: any) => {
      try {
        setLoading(true);
        setError(null);
        await SharingPolicyService.updateSharingPolicy(id, data);
        // Refresh the list
        fetchPolicies();
        return true;
      } catch (err) {
        console.error('Error updating sharing policy:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchPolicies]
  );

  const deletePolicy = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        setError(null);
        await SharingPolicyService.deleteSharingPolicy(id);
        // Refresh the list
        fetchPolicies();
        return true;
      } catch (err) {
        console.error('Error deleting sharing policy:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchPolicies]
  );

  const getApplicablePolicy = useCallback(
    async (resourceTypeId: string, institutionId: string) => {
      try {
        setLoading(true);
        setError(null);
        const policy = await SharingPolicyService.getApplicableSharingPolicy(
          resourceTypeId,
          institutionId
        );
        return policy;
      } catch (err) {
        console.error('Error fetching applicable sharing policy:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return null;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    policies,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchPolicies,
    createPolicy,
    updatePolicy,
    deletePolicy,
    getApplicablePolicy
  };
}
