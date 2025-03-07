// hooks/resource/use-reservations.ts

import { useState, useCallback } from 'react';
import type { Reservation, ReservationFilters } from '@/types/resources';
import { ReservationService } from '@/lib/services/resource/reservation-service';

export function useReservations(initialFilters: ReservationFilters = {}) {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReservationFilters>(initialFilters);
  const [metadata, setMetadata] = useState({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0
  });

  const fetchReservations = useCallback(
    async (newFilters?: ReservationFilters) => {
      try {
        setLoading(true);
        setError(null);
        const currentFilters = newFilters || filters;

        const result = await ReservationService.getReservations(currentFilters);
        setReservations(result.data);
        setMetadata(result.metadata);

        if (newFilters) {
          setFilters(newFilters);
        }
      } catch (err) {
        console.error('Error fetching reservations:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [filters]
  );

  const updateFilters = useCallback(
    (newFilters: Partial<ReservationFilters>) => {
      const updatedFilters = {
        ...filters,
        ...newFilters,
        page: 1 // Reset to first page when filters change
      };
      setFilters(updatedFilters);
      fetchReservations(updatedFilters);
    },
    [filters, fetchReservations]
  );

  const changePage = useCallback(
    (page: number) => {
      const updatedFilters = { ...filters, page };
      setFilters(updatedFilters);
      fetchReservations(updatedFilters);
    },
    [filters, fetchReservations]
  );

  const createReservation = useCallback(
    async (data: any) => {
      try {
        setLoading(true);
        setError(null);
        await ReservationService.createReservation(data);
        // Refresh the list
        fetchReservations();
        return true;
      } catch (err) {
        console.error('Error creating reservation:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchReservations]
  );

  const updateReservation = useCallback(
    async (id: string, data: any) => {
      try {
        setLoading(true);
        setError(null);
        await ReservationService.updateReservation(id, data);
        // Refresh the list
        fetchReservations();
        return true;
      } catch (err) {
        console.error('Error updating reservation:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchReservations]
  );

  const deleteReservation = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        setError(null);
        await ReservationService.deleteReservation(id);
        // Refresh the list
        fetchReservations();
        return true;
      } catch (err) {
        console.error('Error deleting reservation:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchReservations]
  );

  const approveReservation = useCallback(
    async (id: string, approverId: string) => {
      try {
        setLoading(true);
        setError(null);
        await ReservationService.approveReservation(id, approverId);
        // Refresh the list
        fetchReservations();
        return true;
      } catch (err) {
        console.error('Error approving reservation:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchReservations]
  );

  const rejectReservation = useCallback(
    async (id: string, approverId: string, notes?: string) => {
      try {
        setLoading(true);
        setError(null);
        await ReservationService.rejectReservation(id, approverId, notes);
        // Refresh the list
        fetchReservations();
        return true;
      } catch (err) {
        console.error('Error rejecting reservation:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchReservations]
  );

  const cancelReservation = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        setError(null);
        await ReservationService.cancelReservation(id);
        // Refresh the list
        fetchReservations();
        return true;
      } catch (err) {
        console.error('Error canceling reservation:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchReservations]
  );

  const completeReservation = useCallback(
    async (id: string) => {
      try {
        setLoading(true);
        setError(null);
        await ReservationService.completeReservation(id);
        // Refresh the list
        fetchReservations();
        return true;
      } catch (err) {
        console.error('Error completing reservation:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return false;
      } finally {
        setLoading(false);
      }
    },
    [fetchReservations]
  );

  const fetchUserReservations = useCallback(async (userId: string) => {
    try {
      setLoading(true);
      setError(null);
      const userReservations = await ReservationService.getUserReservations(
        userId
      );
      setReservations(userReservations);
      return userReservations;
    } catch (err) {
      console.error('Error fetching user reservations:', err);
      setError(err instanceof Error ? err.message : 'An error occurred');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchResourceReservations = useCallback(
    async (resourceId: string, startDate: string, endDate: string) => {
      try {
        setLoading(true);
        setError(null);
        const resourceReservations =
          await ReservationService.getResourceReservations(
            resourceId,
            startDate,
            endDate
          );
        return resourceReservations;
      } catch (err) {
        console.error('Error fetching resource reservations:', err);
        setError(err instanceof Error ? err.message : 'An error occurred');
        return [];
      } finally {
        setLoading(false);
      }
    },
    []
  );

  return {
    reservations,
    loading,
    error,
    metadata,
    filters,
    updateFilters,
    changePage,
    fetchReservations,
    createReservation,
    updateReservation,
    deleteReservation,
    approveReservation,
    rejectReservation,
    cancelReservation,
    completeReservation,
    fetchUserReservations,
    fetchResourceReservations
  };
}
