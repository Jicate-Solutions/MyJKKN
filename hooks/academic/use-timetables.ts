import { useState, useCallback } from 'react';
import { TimetableService } from '@/lib/services/academic/timetable-service';
import type {
  Timetable,
  TimetableFilters,
  CreateTimetableDto,
  UpdateTimetableDto
} from '@/types/academics';

export function useTimetables(initialFilters: TimetableFilters = {}) {
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

  const fetchTimetables = useCallback(
    async (newFilters?: TimetableFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await TimetableService.getTimetables(currentFilters);
        setTimetables(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching timetables:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const updateFilters = useCallback(
    (newFilters: Partial<TimetableFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchTimetables(updatedFilters);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchTimetables]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchTimetables(updatedFilters);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchTimetables]
  );

  const createTimetable = useCallback(
    async (data: CreateTimetableDto) => {
      try {
        setLoading(true);
        setError(null);
        await TimetableService.createTimetable(data);
        // Refresh timetables list
        fetchTimetables();
        return true;
      } catch (err) {
        console.error('Error creating timetable:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetchTimetables]
  );

  const createFromTemplate = useCallback(
    async (templateId: string, timetableData: CreateTimetableDto) => {
      try {
        setLoading(true);
        setError(null);
        await TimetableService.createTimetableFromTemplate(
          templateId,
          timetableData
        );
        // Refresh timetables list
        fetchTimetables();
        return true;
      } catch (err) {
        console.error('Error creating timetable from template:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
