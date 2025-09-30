// hooks/resource-management/use-resources.ts

'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { ResourceService } from '@/lib/services/resource-management/resource-service';
import type {
  Resource,
  CreateResourceDto,
  UpdateResourceDto,
  ResourceFilters,
  ResourceListResponse,
  BulkOperationResult
} from '@/types/resource-management';
import { useAuth } from '@/hooks/use-auth';

// Hook for managing resources list with filters and pagination
export function useResources(initialFilters: ResourceFilters = {}) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });
  const [filters, setFilters] = useState<ResourceFilters>(initialFilters);

  const fetchResources = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await ResourceService.getResources(filters);
      setResources(response.data);
      setMetadata(response.metadata);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch resources';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const updateFilters = useCallback((newFilters: Partial<ResourceFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters, page: 1 }));
  }, []);

  const changePage = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  useEffect(() => {
    fetchResources();
  }, [fetchResources]);

  return {
    resources,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchResources
  };
}

// Hook for managing a single resource
export function useResource(id?: string) {
  const [resource, setResource] = useState<Resource | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchResource = useCallback(async () => {
    if (!id) return;

    try {
      setLoading(true);
      setError(null);
      const resourceData = await ResourceService.getResource(id);
      setResource(resourceData);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch resource';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      fetchResource();
    }
  }, [fetchResource]);

  return {
    resource,
    loading,
    error,
    fetchResource
  };
}

// Hook for resource operations (create, update, delete, bulk operations)
export function useResourceOperations() {
  const { profile, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);

  const createResource = useCallback(
    async (data: CreateResourceDto): Promise<Resource | null> => {
      if (authLoading) {
        toast.error('Please wait while we verify your authentication');
        return null;
      }

      if (!profile?.id) {
        toast.error('You must be logged in to create resources');
        return null;
      }

      try {
        setLoading(true);
        const newResource = await ResourceService.createResource(
          data,
          profile.id
        );
        toast.success('Resource created successfully');
        return newResource;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to create resource';
        toast.error(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [profile?.id, authLoading]
  );

  const updateResource = useCallback(
    async (id: string, data: UpdateResourceDto): Promise<Resource | null> => {
      if (authLoading) {
        toast.error('Please wait while we verify your authentication');
        return null;
      }

      if (!profile?.id) {
        toast.error('You must be logged in to update resources');
        return null;
      }

      try {
        setLoading(true);
        const updatedResource = await ResourceService.updateResource(
          id,
          data,
          profile.id
        );
        toast.success('Resource updated successfully');
        return updatedResource;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to update resource';
        toast.error(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [profile?.id, authLoading]
  );

  const deleteResource = useCallback(async (id: string): Promise<boolean> => {
    try {
      setLoading(true);
      const success = await ResourceService.deleteResource(id);
      if (success) {
        toast.success('Resource deleted successfully');
      }
      return success;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete resource';
      toast.error(errorMessage);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const bulkDeleteResources = useCallback(
    async (ids: string[]): Promise<BulkOperationResult> => {
      try {
        setLoading(true);
        const result = await ResourceService.bulkDeleteResources(ids);

        if (result.success) {
          toast.success(
            `Successfully deleted ${result.processedCount} resources`
          );
        } else {
          toast.error(
            `Deleted ${result.processedCount} resources, but ${result.errors.length} failed`
          );
        }

        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to delete resources';
        toast.error(errorMessage);
        return {
          success: false,
          processedCount: 0,
          errors: [{ id: 'unknown', error: errorMessage }]
        };
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const updateStockQuantity = useCallback(
    async (id: string, quantity: number): Promise<Resource | null> => {
      if (!profile?.id) {
        toast.error('You must be logged in to update stock');
        return null;
      }

      try {
        setLoading(true);
        const updatedResource = await ResourceService.updateStockQuantity(
          id,
          quantity,
          profile.id
        );
        toast.success('Stock quantity updated successfully');
        return updatedResource;
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : 'Failed to update stock quantity';
        toast.error(errorMessage);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [profile?.id]
  );

  return {
    loading,
    authLoading,
    createResource,
    updateResource,
    deleteResource,
    bulkDeleteResources,
    updateStockQuantity
  };
}

// Hook for checking resource availability
export function useResourceAvailability(resourceId?: string) {
  const [checking, setChecking] = useState(false);

  const checkAvailability = useCallback(
    async (
      startTime: string,
      endTime: string
    ): Promise<{
      available: boolean;
      conflictingReservations?: any[];
    } | null> => {
      if (!resourceId) return null;

      try {
        setChecking(true);
        const result = await ResourceService.checkAvailability(
          resourceId,
          startTime,
          endTime
        );
        return result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to check availability';
        toast.error(errorMessage);
        return null;
      } finally {
        setChecking(false);
      }
    },
    [resourceId]
  );

  return {
    checkAvailability,
    checking
  };
}

// Hook for getting resources for select/dropdown
export function useResourcesSelect(
  institutionId?: string,
  departmentId?: string
) {
  const [resources, setResources] = useState<
    Array<{ id: string; name: string; status: string }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchResourcesForSelect = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const resourcesData = await ResourceService.getResourcesForSelect(
        institutionId,
        departmentId
      );
      setResources(resourcesData);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch resources';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [institutionId, departmentId]);

  useEffect(() => {
    fetchResourcesForSelect();
  }, [fetchResourcesForSelect]);

  return {
    resources,
    loading,
    error,
    refetch: fetchResourcesForSelect
  };
}

// Hook for resource usage statistics
export function useResourceUsageStats(resourceId?: string) {
  const [stats, setStats] = useState<{
    totalReservations: number;
    completedReservations: number;
    cancelledReservations: number;
    noShowReservations: number;
    averageDuration: number;
    utilizationRate: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!resourceId) return;

    try {
      setLoading(true);
      setError(null);
      const statsData = await ResourceService.getResourceUsageStats(resourceId);
      setStats(statsData);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to fetch usage statistics';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [resourceId]);

  useEffect(() => {
    if (resourceId) {
      fetchStats();
    }
  }, [fetchStats]);

  return {
    stats,
    loading,
    error,
    refetch: fetchStats
  };
}

// Hook for searching resources
export function useResourceSearch() {
  const [searchResults, setSearchResults] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const searchResources = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const results = await ResourceService.searchResources(query);
      setSearchResults(results);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to search resources';
      setError(errorMessage);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearSearch = useCallback(() => {
    setSearchResults([]);
    setError(null);
  }, []);

  return {
    searchResults,
    loading,
    error,
    searchResources,
    clearSearch
  };
}
