import { useState, useCallback, useRef } from 'react';
import { TimetableService } from '@/lib/services/academic/timetable-service';
import { usePermissions } from '@/hooks/use-permissions';
import type {
  Timetable,
  TimetableFilters,
  CreateTimetableDto,
  UpdateTimetableDto
} from '@/types/academics';

export function useTimetables(initialFilters: TimetableFilters = {}) {
  const { isSuperAdmin, userProfile } = usePermissions();
  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TimetableFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  // Use ref to track the current filters to avoid stale closures
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const fetchTimetables = useCallback(
    async (currentFilters?: TimetableFilters) => {
      try {
        setLoading(true);
        setError(null);
        const filtersToUse = currentFilters || filtersRef.current;

        // Apply institution filtering for non-super admin users
        const filtersWithInstitution = {
          ...filtersToUse,
          ...(!isSuperAdmin &&
            userProfile?.institution_id && {
              institution_id: userProfile.institution_id
            })
        };

        const result = await TimetableService.getTimetables(
          filtersWithInstitution
        );
        setTimetables(result.data);
        setMetadata(result.metadata);

        if (currentFilters) {
          setFilters(currentFilters);
        }
      } catch (err) {
        console.error('Error fetching timetables:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [isSuperAdmin, userProfile?.institution_id] // Removed filters from dependencies
  );

  const updateFilters = useCallback(
    (newFilters: Partial<TimetableFilters>) => {
      setFilters((currentFilters) => {
        const updatedFilters = {
          ...currentFilters,
          ...newFilters,
          page: 1 // Reset to first page when filters change
        };
        fetchTimetables(updatedFilters);
        return updatedFilters;
      });
    },
    [fetchTimetables]
  );

  const changePage = useCallback(
    (page: number) => {
      setFilters((currentFilters) => {
        const updatedFilters = { ...currentFilters, page };
        fetchTimetables(updatedFilters);
        return updatedFilters;
      });
    },
    [fetchTimetables]
  );

  const createTimetable = useCallback(
    async (data: CreateTimetableDto) => {
      try {
        setLoading(true);
        setError(null);
        const createdTimetable = await TimetableService.createTimetable(data);
        // Refresh timetables list
        fetchTimetables();
        return createdTimetable;
      } catch (err) {
        console.error('Error creating timetable:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [fetchTimetables]
  );

  const updateTimetable = useCallback(
    async (id: string, data: UpdateTimetableDto) => {
      try {
        setLoading(true);
        setError(null);
        await TimetableService.updateTimetable(id, data);
        // Refresh timetables list
        fetchTimetables();
        return true;
      } catch (err) {
        console.error('Error updating timetable:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchTimetables]
  );

  const deleteTimetable = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        setError(null);
        await TimetableService.deleteTimetable(id);
        // Refresh timetables list
        fetchTimetables();
        return true;
      } catch (err) {
        console.error('Error deleting timetable:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchTimetables]
  );

  const saveTimetableAsTemplate = useCallback(
    async (id: string, templateName: string) => {
      try {
        setLoading(true);
        setError(null);
        await TimetableService.saveTimetableAsTemplate(id, templateName);
        // Refresh timetables list
        fetchTimetables();
        return true;
      } catch (err) {
        console.error('Error saving timetable as template:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchTimetables]
  );

  const createFromTemplate = useCallback(
    async (templateId: string, timetableData: CreateTimetableDto) => {
      try {
        setLoading(true);
        setError(null);
        const createdTimetable = await TimetableService.createTimetableFromTemplate(
          templateId,
          timetableData
        );
        // Refresh timetables list
        fetchTimetables();
        return createdTimetable;
      } catch (err) {
        console.error('Error creating timetable from template:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [fetchTimetables]
  );

  return {
    timetables,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchTimetables,
    createTimetable,
    updateTimetable,
    deleteTimetable,
    saveTimetableAsTemplate,
    createFromTemplate
  };
}
