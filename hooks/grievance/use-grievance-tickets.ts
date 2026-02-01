'use client';

// hooks/grievance/use-grievance-tickets.ts
// F004: Grievance Ticketing System - Ticket Hooks

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { GrievanceService } from '@/lib/services/grievance/grievance-service';
import type {
  GrievanceTicket,
  GrievanceTicketFilters,
  CreateGrievanceTicketDto,
  UpdateGrievanceTicketDto,
  GrievanceStatus
} from '@/types/grievance';

// Query keys
export const grievanceTicketKeys = {
  all: ['grievance-tickets'] as const,
  lists: () => [...grievanceTicketKeys.all, 'list'] as const,
  list: (filters: GrievanceTicketFilters) => [...grievanceTicketKeys.lists(), filters] as const,
  detail: (id: string) => [...grievanceTicketKeys.all, 'detail', id] as const,
  byNumber: (ticketNumber: string) => [...grievanceTicketKeys.all, 'byNumber', ticketNumber] as const,
  my: (filters: GrievanceTicketFilters) => [...grievanceTicketKeys.all, 'my', filters] as const,
  assigned: (filters: GrievanceTicketFilters) => [...grievanceTicketKeys.all, 'assigned', filters] as const
};

/**
 * Hook to fetch tickets with filters
 */
export function useGrievanceTickets(filters: GrievanceTicketFilters) {
  return useQuery({
    queryKey: grievanceTicketKeys.list(filters),
    queryFn: () => GrievanceService.getTickets(filters),
    staleTime: 30 * 1000 // 30 seconds - tickets need to be fresh
  });
}

/**
 * Hook to fetch a single ticket by ID
 */
export function useGrievanceTicket(id: string) {
  return useQuery({
    queryKey: grievanceTicketKeys.detail(id),
    queryFn: () => GrievanceService.getTicket(id),
    enabled: !!id,
    staleTime: 30 * 1000
  });
}

/**
 * Hook to fetch a ticket by ticket number
 */
export function useGrievanceTicketByNumber(ticketNumber: string) {
  return useQuery({
    queryKey: grievanceTicketKeys.byNumber(ticketNumber),
    queryFn: () => GrievanceService.getTicketByNumber(ticketNumber),
    enabled: !!ticketNumber,
    staleTime: 30 * 1000
  });
}

/**
 * Hook to fetch my tickets
 */
export function useMyGrievanceTickets(filters: GrievanceTicketFilters) {
  return useQuery({
    queryKey: grievanceTicketKeys.my(filters),
    queryFn: () => GrievanceService.getMyTickets(filters),
    staleTime: 30 * 1000
  });
}

/**
 * Hook to fetch assigned tickets
 */
export function useAssignedGrievanceTickets(filters: GrievanceTicketFilters) {
  return useQuery({
    queryKey: grievanceTicketKeys.assigned(filters),
    queryFn: () => GrievanceService.getAssignedTickets(filters),
    staleTime: 30 * 1000
  });
}

/**
 * Hook to create a ticket
 */
export function useCreateGrievanceTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateGrievanceTicketDto) =>
      GrievanceService.createTicket(data),
    onSuccess: (ticket) => {
      toast.success(`Ticket ${ticket.ticket_number} created successfully`);
      queryClient.invalidateQueries({
        queryKey: grievanceTicketKeys.lists()
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create ticket');
    }
  });
}

/**
 * Hook to update a ticket
 */
export function useUpdateGrievanceTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateGrievanceTicketDto }) =>
      GrievanceService.updateTicket(id, data),
    onSuccess: (ticket) => {
      toast.success('Ticket updated successfully');
      queryClient.invalidateQueries({
        queryKey: grievanceTicketKeys.detail(ticket.id)
      });
      queryClient.invalidateQueries({
        queryKey: grievanceTicketKeys.lists()
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update ticket');
    }
  });
}

/**
 * Hook to assign a ticket
 */
export function useAssignGrievanceTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ticketId,
      assigneeId,
      departmentId
    }: {
      ticketId: string;
      assigneeId: string;
      departmentId?: string;
    }) => GrievanceService.assignTicket(ticketId, assigneeId, departmentId),
    onSuccess: (ticket) => {
      toast.success('Ticket assigned successfully');
      queryClient.invalidateQueries({
        queryKey: grievanceTicketKeys.detail(ticket.id)
      });
      queryClient.invalidateQueries({
        queryKey: grievanceTicketKeys.lists()
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to assign ticket');
    }
  });
}

/**
 * Hook to resolve a ticket
 */
export function useResolveGrievanceTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ticketId,
      resolution,
      resolvedBy
    }: {
      ticketId: string;
      resolution: string;
      resolvedBy: string;
    }) => GrievanceService.resolveTicket(ticketId, resolution, resolvedBy),
    onSuccess: (ticket) => {
      toast.success('Ticket resolved successfully');
      queryClient.invalidateQueries({
        queryKey: grievanceTicketKeys.detail(ticket.id)
      });
      queryClient.invalidateQueries({
        queryKey: grievanceTicketKeys.lists()
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to resolve ticket');
    }
  });
}

/**
 * Hook to update ticket status
 */
export function useUpdateGrievanceTicketStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ticketId,
      status,
      note
    }: {
      ticketId: string;
      status: GrievanceStatus;
      note?: string;
    }) => GrievanceService.updateStatus(ticketId, status, note),
    onSuccess: (ticket) => {
      toast.success('Ticket status updated');
      queryClient.invalidateQueries({
        queryKey: grievanceTicketKeys.detail(ticket.id)
      });
      queryClient.invalidateQueries({
        queryKey: grievanceTicketKeys.lists()
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update status');
    }
  });
}

/**
 * Hook to rate satisfaction
 */
export function useRateGrievanceSatisfaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ticketId,
      rating,
      feedback
    }: {
      ticketId: string;
      rating: number;
      feedback?: string;
    }) => GrievanceService.rateSatisfaction(ticketId, rating, feedback),
    onSuccess: (ticket) => {
      toast.success('Thank you for your feedback!');
      queryClient.invalidateQueries({
        queryKey: grievanceTicketKeys.detail(ticket.id)
      });
      queryClient.invalidateQueries({
        queryKey: grievanceTicketKeys.lists()
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to submit rating');
    }
  });
}

/**
 * Hook to reopen a ticket
 */
export function useReopenGrievanceTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ticketId,
      reason
    }: {
      ticketId: string;
      reason: string;
    }) => GrievanceService.reopenTicket(ticketId, reason),
    onSuccess: (ticket) => {
      toast.success('Ticket reopened');
      queryClient.invalidateQueries({
        queryKey: grievanceTicketKeys.detail(ticket.id)
      });
      queryClient.invalidateQueries({
        queryKey: grievanceTicketKeys.lists()
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to reopen ticket');
    }
  });
}
