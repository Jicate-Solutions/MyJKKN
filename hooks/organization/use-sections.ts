import { useState, useCallback } from 'react';
import { SectionService } from '@/lib/services/organization/section-service';
import type { Section, SectionFilters } from '@/types/organizations';

export function useSections(initialFilters: SectionFilters = {}) {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<SectionFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchSections = useCallback(
    async (newFilters?: SectionFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await SectionService.getSections(currentFilters);
        setSections(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching sections:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<SectionFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchSections(updatedFilters);
    },
    [filters, fetchSections]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchSections(updatedFilters);
    },
    [filters, fetchSections]
  );

  return {
    sections,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchSections
  };
}
