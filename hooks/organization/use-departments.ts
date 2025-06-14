// hooks/use-departments.ts

import { useState, useCallback } from 'react';
import { DepartmentService } from '@/lib/services/organization/department-service';
import type { Department, DepartmentFilters } from '@/types/organizations';

export function useDepartments(initialFilters: DepartmentFilters = {}) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [paginationLoading, setPaginationLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<DepartmentFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchDepartments = useCallback(
    async (newFilters?: DepartmentFilters, isPagination = false) => {
      try {
        if (isPagination) {
          setPaginationLoading(true);
        } else {
          setLoading(true);
        }
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await DepartmentService.getDepartments(currentFilters);
        setDepartments(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching departments:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        if (isPagination) {
          setPaginationLoading(false);
        } else {
          setLoading(false);
        }
      }
    },
    [filters]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<DepartmentFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchDepartments(updatedFilters);
    },
    [filters, fetchDepartments]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchDepartments(updatedFilters, true); // Mark as pagination
    },
    [filters, fetchDepartments]
  );

  const changePageSize = useCallback(
    (limit: number) => {
      const updatedFilters = { ...filters, limit, page: 1 }; // Reset to first page when page size changes
      setFilters(updatedFilters);
      fetchDepartments(updatedFilters, true); // Mark as pagination
    },
    [filters, fetchDepartments]
  );

  return {
    departments,
    loading,
    paginationLoading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    changePageSize,
    fetchDepartments
  };
}
