// hooks/reservation/use-reservation-operations.ts
// React Query hooks for reservation mutations (create, update, delete, approve, etc.)

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from '@/hooks/use-toast';
import { ReservationService } from '@/lib/services/reservation/reservation-service';
import { useAuth } from '@/hooks/use-auth';
import type {
  CreateReservationDto,
  UpdateReservationDto,
  ApproveReservationDto,
  RejectReservationDto,
  CancelReservationDto,
  CheckInDto,
  CheckOutDto
} from '@/types/reservation';

export function useReservationOperations() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { profile: user } = useAuth();

  // Create reservation
  const createReservation = useMutation({
    mutationFn: (dto: CreateReservationDto) => {
      if (!user?.id) throw new Error('User not authenticated');
      return ReservationService.createReservation(dto, user.id);
    },
    onSuccess: (data) => {
      // Invalidate all reservation-related queries
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['my-reservations'] });
      queryClient.invalidateQueries({ queryKey: ['resource-availability'] });
      queryClient.invalidateQueries({ queryKey: ['reservation-stats'] });
      queryClient.invalidateQueries({ queryKey: ['approval-stats'] });
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });

      // Invalidate analytics queries for real-time dashboard updates
      queryClient.invalidateQueries({ queryKey: ['resourceAnalytics'] });
      queryClient.invalidateQueries({ queryKey: ['reservationAnalytics'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });

      toast({
        title: 'Reservation created',
        description:
          data.status === 'pending'
            ? 'Your reservation is pending approval'
            : 'Your reservation has been confirmed',
        variant: 'default'
      });

      router.push(`/resource-management/reservations/${data.id}`);
    },
    onError: (error: any) => {
      console.error('Error creating reservation:', error);
      toast({
        title: 'Failed to create reservation',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive'
      });
    }
  });

  // Update reservation
  const updateReservation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateReservationDto }) =>
      ReservationService.updateReservation(id, dto),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['reservation', data.id] });
      queryClient.invalidateQueries({ queryKey: ['my-reservations'] });
      queryClient.invalidateQueries({ queryKey: ['resource-availability'] });

      toast({
        title: 'Reservation updated',
        description: 'Your reservation has been updated successfully',
        variant: 'default'
      });
    },
    onError: (error: any) => {
      console.error('Error updating reservation:', error);
      toast({
        title: 'Failed to update reservation',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive'
      });
    }
  });

  // Delete reservation
  const deleteReservation = useMutation({
    mutationFn: (id: string) => ReservationService.deleteReservation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['my-reservations'] });
      queryClient.invalidateQueries({ queryKey: ['resource-availability'] });
      queryClient.invalidateQueries({ queryKey: ['reservation-stats'] });

      toast({
        title: 'Reservation deleted',
        description: 'The reservation has been deleted successfully',
        variant: 'default'
      });

      router.push('/resource-management/reservations');
    },
    onError: (error: any) => {
      console.error('Error deleting reservation:', error);
      toast({
        title: 'Failed to delete reservation',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive'
      });
    }
  });

  // Approve reservation
  const approveReservation = useMutation({
    mutationFn: (dto: ApproveReservationDto) => {
      if (!user?.id) throw new Error('User not authenticated');
      return ReservationService.approveReservation(dto, user.id);
    },
    onSuccess: (data) => {
      // Invalidate reservation queries
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['reservation', data.id] });
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['reservation-stats'] });
      queryClient.invalidateQueries({ queryKey: ['approval-stats'] });

      // Invalidate analytics queries for real-time dashboard updates
      queryClient.invalidateQueries({ queryKey: ['resourceAnalytics'] });
      queryClient.invalidateQueries({ queryKey: ['reservationAnalytics'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });

      toast({
        title: 'Reservation approved',
        description: 'The reservation has been approved successfully',
        variant: 'default'
      });
    },
    onError: (error: any) => {
      console.error('Error approving reservation:', error);
      toast({
        title: 'Failed to approve reservation',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive'
      });
    }
  });

  // Reject reservation
  const rejectReservation = useMutation({
    mutationFn: (dto: RejectReservationDto) => {
      if (!user?.id) throw new Error('User not authenticated');
      return ReservationService.rejectReservation(dto, user.id);
    },
    onSuccess: (data) => {
      // Invalidate reservation queries
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['reservation', data.id] });
      queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      queryClient.invalidateQueries({ queryKey: ['reservation-stats'] });
      queryClient.invalidateQueries({ queryKey: ['approval-stats'] });

      // Invalidate analytics queries for real-time dashboard updates
      queryClient.invalidateQueries({ queryKey: ['resourceAnalytics'] });
      queryClient.invalidateQueries({ queryKey: ['reservationAnalytics'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardSummary'] });

      toast({
        title: 'Reservation rejected',
        description: 'The reservation has been rejected',
        variant: 'default'
      });
    },
    onError: (error: any) => {
      console.error('Error rejecting reservation:', error);
      toast({
        title: 'Failed to reject reservation',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive'
      });
    }
  });

  // Cancel reservation
  const cancelReservation = useMutation({
    mutationFn: (dto: CancelReservationDto) => {
      if (!user?.id) throw new Error('User not authenticated');
      return ReservationService.cancelReservation(dto, user.id);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['reservation', data.id] });
      queryClient.invalidateQueries({ queryKey: ['my-reservations'] });
      queryClient.invalidateQueries({ queryKey: ['resource-availability'] });
      queryClient.invalidateQueries({ queryKey: ['reservation-stats'] });

      toast({
        title: 'Reservation cancelled',
        description: 'Your reservation has been cancelled',
        variant: 'default'
      });
    },
    onError: (error: any) => {
      console.error('Error cancelling reservation:', error);
      toast({
        title: 'Failed to cancel reservation',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive'
      });
    }
  });

  // Check in
  const checkIn = useMutation({
    mutationFn: (dto: CheckInDto) => {
      if (!user?.id) throw new Error('User not authenticated');
      return ReservationService.checkIn(dto, user.id);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['reservation', data.id] });
      queryClient.invalidateQueries({ queryKey: ['my-reservations'] });

      toast({
        title: 'Checked in',
        description: 'You have been checked in successfully',
        variant: 'default'
      });
    },
    onError: (error: any) => {
      console.error('Error checking in:', error);
      toast({
        title: 'Failed to check in',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive'
      });
    }
  });

  // Check out
  const checkOut = useMutation({
    mutationFn: (dto: CheckOutDto) => {
      if (!user?.id) throw new Error('User not authenticated');
      return ReservationService.checkOut(dto, user.id);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['reservations'] });
      queryClient.invalidateQueries({ queryKey: ['reservation', data.id] });
      queryClient.invalidateQueries({ queryKey: ['my-reservations'] });
      queryClient.invalidateQueries({ queryKey: ['reservation-stats'] });
      queryClient.invalidateQueries({ queryKey: ['resource-availability'] });

      toast({
        title: 'Checked out',
        description: 'You have been checked out successfully',
        variant: 'default'
      });
    },
    onError: (error: any) => {
      console.error('Error checking out:', error);
      toast({
        title: 'Failed to check out',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive'
      });
    }
  });

  return {
    createReservation,
    updateReservation,
    deleteReservation,
    approveReservation,
    rejectReservation,
    cancelReservation,
    checkIn,
    checkOut
  };
}

// Individual hook exports for convenience
export function useCreateReservation() {
  return useReservationOperations().createReservation;
}

export function useUpdateReservation() {
  return useReservationOperations().updateReservation;
}

export function useDeleteReservation() {
  return useReservationOperations().deleteReservation;
}

export function useApproveReservation() {
  return useReservationOperations().approveReservation;
}

export function useRejectReservation() {
  return useReservationOperations().rejectReservation;
}

export function useCancelReservation() {
  return useReservationOperations().cancelReservation;
}

export function useCheckInReservation() {
  return useReservationOperations().checkIn;
}

export function useCheckOutReservation() {
  return useReservationOperations().checkOut;
}
