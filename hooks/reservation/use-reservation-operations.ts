// hooks/reservation/use-reservation-operations.ts
// React Query hooks for reservation mutations (create, update, delete, approve, etc.)

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
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

      toast.success(
        data.status === 'pending'
          ? '🎉 Reservation Created!\nYour reservation is pending approval. You will be notified once it is reviewed.'
          : '✅ Reservation Confirmed!\nYour reservation has been successfully confirmed.',
        {
          duration: 6000, // Show for 6 seconds
          style: {
            background: '#10b981',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '500',
            padding: '16px',
            borderRadius: '8px',
            maxWidth: '500px'
          },
          iconTheme: {
            primary: '#fff',
            secondary: '#10b981'
          }
        }
      );

      router.push(`/resource-management/reservations/${data.id}`);
    },
    onError: (error: any) => {
      console.error('Error creating reservation:', error);
      toast.error(
        `❌ Failed to Create Reservation\n${
          error.message || 'An unexpected error occurred. Please try again.'
        }`,
        {
          duration: 5000,
          style: {
            background: '#ef4444',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '500',
            padding: '16px',
            borderRadius: '8px',
            maxWidth: '500px'
          },
          iconTheme: {
            primary: '#fff',
            secondary: '#ef4444'
          }
        }
      );
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

      toast.success(
        '✅ Reservation Updated!\nYour reservation has been updated successfully.',
        {
          duration: 4000,
          style: {
            background: '#10b981',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '500',
            padding: '16px',
            borderRadius: '8px'
          }
        }
      );
    },
    onError: (error: any) => {
      console.error('Error updating reservation:', error);
      toast.error(
        `❌ Update Failed\n${error.message || 'An unexpected error occurred'}`,
        {
          duration: 4000,
          style: {
            background: '#ef4444',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '500',
            padding: '16px',
            borderRadius: '8px'
          }
        }
      );
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

      toast.success(
        '🗑️ Reservation Deleted\nThe reservation has been deleted successfully.',
        {
          duration: 4000,
          style: {
            background: '#10b981',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '500',
            padding: '16px',
            borderRadius: '8px'
          }
        }
      );

      router.push('/resource-management/reservations');
    },
    onError: (error: any) => {
      console.error('Error deleting reservation:', error);
      toast.error(
        `❌ Delete Failed\n${error.message || 'An unexpected error occurred'}`,
        {
          duration: 4000,
          style: {
            background: '#ef4444',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '500',
            padding: '16px',
            borderRadius: '8px'
          }
        }
      );
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

      toast.success(
        '✅ Reservation Approved!\nThe reservation has been approved successfully.',
        {
          duration: 5000,
          style: {
            background: '#10b981',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '500',
            padding: '16px',
            borderRadius: '8px'
          }
        }
      );
    },
    onError: (error: any) => {
      console.error('Error approving reservation:', error);
      toast.error(
        `❌ Approval Failed\n${
          error.message || 'An unexpected error occurred'
        }`,
        {
          duration: 4000,
          style: {
            background: '#ef4444',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '500',
            padding: '16px',
            borderRadius: '8px'
          }
        }
      );
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

      toast.success(
        '✅ Reservation Rejected!\nThe reservation has been rejected successfully.',
        {
          duration: 5000,
          style: {
            background: '#10b981',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '500',
            padding: '16px',
            borderRadius: '8px'
          }
        }
      );
    },
    onError: (error: any) => {
      console.error('Error rejecting reservation:', error);
      toast.error(
        `❌ Rejection Failed\n${
          error.message || 'An unexpected error occurred'
        }`,
        {
          duration: 4000,
          style: {
            background: '#ef4444',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '500',
            padding: '16px',
            borderRadius: '8px'
          }
        }
      );
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

      toast.success(
        '✅ Reservation Cancelled!\nYour reservation has been cancelled successfully.',
        {
          duration: 5000,
          style: {
            background: '#10b981',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '500',
            padding: '16px',
            borderRadius: '8px'
          }
        }
      );
    },
    onError: (error: any) => {
      console.error('Error cancelling reservation:', error);
      toast.error(
        `❌ Cancellation Failed\n${
          error.message || 'An unexpected error occurred'
        }`,
        {
          duration: 4000,
          style: {
            background: '#ef4444',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '500',
            padding: '16px',
            borderRadius: '8px'
          }
        }
      );
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

      toast.success('✅ Checked In!\nYou have been checked in successfully.', {
        duration: 5000,
        style: {
          background: '#10b981',
          color: '#fff',
          fontSize: '14px',
          fontWeight: '500',
          padding: '16px',
          borderRadius: '8px'
        }
      });
    },
    onError: (error: any) => {
      console.error('Error checking in:', error);
      toast.error(
        `❌ Check-in Failed\n${
          error.message || 'An unexpected error occurred'
        }`,
        {
          duration: 4000,
          style: {
            background: '#ef4444',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '500',
            padding: '16px',
            borderRadius: '8px'
          }
        }
      );
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

      toast.success(
        '✅ Checked Out!\nYou have been checked out successfully.',
        {
          duration: 5000,
          style: {
            background: '#10b981',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '500',
            padding: '16px',
            borderRadius: '8px'
          }
        }
      );
    },
    onError: (error: any) => {
      console.error('Error checking out:', error);
      toast.error(
        `❌ Check-out Failed\n${
          error.message || 'An unexpected error occurred'
        }`,
        {
          duration: 4000,
          style: {
            background: '#ef4444',
            color: '#fff',
            fontSize: '14px',
            fontWeight: '500',
            padding: '16px',
            borderRadius: '8px'
          }
        }
      );
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
