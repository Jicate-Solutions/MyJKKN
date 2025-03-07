// hooks/resource/use-resource-requests.ts

import { useState, useCallback } from 'react';
import type {
  ResourceRequest,
  ResourceRequestFilters
} from '@/types/resources';
import { ResourceRequestService } from '@/lib/services/resource/resource-request-service';

export function useResourceRequests(
  initialFilters: ResourceRequestFilters = {}
) {
  const [requests, setRequests] = useState<ResourceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] =
    useState<ResourceRequestFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchRequests = useCallback(
    async (newFilters?: ResourceRequestFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await ResourceRequestService.getResourceRequests(
          currentFilters
        );
        setRequests(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching resource requests:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<ResourceRequestFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchRequests(updatedFilters);
    },
    [filters, fetchRequests]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchRequests(updatedFilters);
    },
    [filters, fetchRequests]
  );

  const createRequest = useCallback(
    async (data: any) => {
      try {
        setLoading(true);
        setError(null);
        await ResourceRequestService.createResourceRequest(data);
        // Refresh the list
        fetchRequests();
        return true;
      } catch (err) {
        console.error('Error creating resource request:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchRequests]
  );

  const updateRequest = useCallback(
    async (id: string, data: any) => {
      try {
        setLoading(true);
        setError(null);
        await ResourceRequestService.updateResourceRequest(id, data);
        // Refresh the list
        fetchRequests();
        return true;
      } catch (err) {
        console.error('Error updating resource request:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchRequests]
  );

  const deleteRequest = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        setError(null);
        await ResourceRequestService.deleteResourceRequest(id);
        // Refresh the list
        fetchRequests();
        return true;
      } catch (err) {
        console.error('Error deleting resource request:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchRequests]
  );

  const approveRequest = useCallback(
    async (id: string, approverId: string, notes?: string) => {
      try {
        setLoading(true);
        setError(null);
        await ResourceRequestService.approveResourceRequest(
          id,
          approverId,
          notes
        );
        // Refresh the list
        fetchRequests();
        return true;
      } catch (err) {
        console.error('Error approving resource request:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchRequests]
  );

  const rejectRequest = useCallback(
    async (id: string, approverId: string, notes?: string) => {
      try {
        setLoading(true);
        setError(null);
        await ResourceRequestService.rejectResourceRequest(
          id,
          approverId,
          notes
        );
        // Refresh the list
        fetchRequests();
        return true;
      } catch (err) {
        console.error('Error rejecting resource request:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchRequests]
  );

  const markAsAcquired = useCallback(
    async (id: string, notes?: string) => {
      try {
        setLoading(true);
        setError(null);
        await ResourceRequestService.markResourceRequestAsAcquired(id, notes);
        // Refresh the list
        fetchRequests();
        return true;
      } catch (err) {
        console.error('Error marking resource request as acquired:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchRequests]
  );

  const fetchUserRequests = useCallback(async (userId: string) => {
    try {
      setLoading(true);
      setError(null);
      const userRequests = await ResourceRequestService.getUserResourceRequests(
        userId
      );
      setRequests(userRequests);
      return userRequests;
    } catch (err) {
      console.error('Error fetching user resource requests:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    requests,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchRequests,
    createRequest,
    updateRequest,
    deleteRequest,
    approveRequest,
    rejectRequest,
    markAsAcquired,
    fetchUserRequests
  };
}
