'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { EmergencyContactsService } from '@/lib/services/campus-living/emergency-contacts-service';
import { usePermissions } from '@/hooks/use-permissions';
import type { HostelEmergencyContact } from '@/types/campus-living';

// Query key factory
export const hostelEmergencyContactsKeys = {
  all: ['hostel-emergency-contacts'] as const,
  list: (filters: Record<string, unknown>) =>
    ['hostel-emergency-contacts', 'list', filters] as const,
  detail: (id: string) => ['hostel-emergency-contacts', 'detail', id] as const,
};

// --- Query hooks ---

export function useHostelEmergencyContacts(
  institutionId: string | undefined,
  filters?: Record<string, unknown>
) {
  const { isSuperAdmin } = usePermissions();
  return useQuery({
    queryKey: hostelEmergencyContactsKeys.list({ institutionId, ...filters }),
    queryFn: () =>
      EmergencyContactsService.getContacts(isSuperAdmin ? undefined : institutionId, filters),
    enabled: isSuperAdmin || !!institutionId,
  });
}

export function useHostelEmergencyContact(id: string) {
  return useQuery({
    queryKey: hostelEmergencyContactsKeys.detail(id),
    queryFn: () => EmergencyContactsService.getContact(id),
    enabled: !!id,
  });
}

// --- Mutation hooks ---

export function useCreateHostelEmergencyContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      payload: Omit<HostelEmergencyContact, 'id' | 'created_at' | 'updated_at'>
    ) => EmergencyContactsService.createContact(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelEmergencyContactsKeys.all });
      toast.success('Emergency contact created');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create emergency contact: ${error.message}`);
    },
  });
}

export function useUpdateHostelEmergencyContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<HostelEmergencyContact>;
    }) => EmergencyContactsService.updateContact(id, payload),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: hostelEmergencyContactsKeys.all });
      queryClient.invalidateQueries({
        queryKey: hostelEmergencyContactsKeys.detail(variables.id),
      });
      toast.success('Emergency contact updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update emergency contact: ${error.message}`);
    },
  });
}

export function useDeleteHostelEmergencyContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => EmergencyContactsService.deleteContact(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hostelEmergencyContactsKeys.all });
      toast.success('Emergency contact deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete emergency contact: ${error.message}`);
    },
  });
}
