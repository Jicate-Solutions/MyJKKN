import { useState, useCallback } from 'react';
import type {
  DigitalSharingPolicy,
  DigitalSharingPolicyFilters
} from '@/types/digital-resources';
import { DigitalSharingPolicyService } from '@/lib/services/resource/digital/digital-sharing-policy-service';

export function useDigitalSharingPolicies(
  initialFilters: DigitalSharingPolicyFilters = {}
) {
  const [policies, setPolicies] = useState<DigitalSharingPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] =
    useState<DigitalSharingPolicyFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchPolicies = useCallback(
    async (newFilters?: DigitalSharingPolicyFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result =
          await DigitalSharingPolicyService.getDigitalSharingPolicies(
            currentFilters
          );
        setPolicies(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching digital sharing policies:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<DigitalSharingPolicyFilters>) => {
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
        await DigitalSharingPolicyService.createDigitalSharingPolicy(data);
        // Refresh the list
        fetchPolicies();
        return true;
      } catch (err) {
        console.error('Error creating digital sharing policy:', err);
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
        await DigitalSharingPolicyService.updateDigitalSharingPolicy(id, data);
        // Refresh the list
        fetchPolicies();
        return true;
      } catch (err) {
        console.error('Error updating digital sharing policy:', err);
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
        await DigitalSharingPolicyService.deleteDigitalSharingPolicy(id);
        // Refresh the list
        fetchPolicies();
        return true;
      } catch (err) {
        console.error('Error deleting digital sharing policy:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchPolicies]
  );

  const getApplicablePolicy = useCallback(
    async (categoryId: string, institutionId: string) => {
      try {
        setLoading(true);
        setError(null);
        const policy =
          await DigitalSharingPolicyService.getApplicableDigitalSharingPolicy(
            categoryId,
            institutionId
          );
        return policy;
      } catch (err) {
        console.error('Error fetching applicable digital sharing policy:', err);
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
