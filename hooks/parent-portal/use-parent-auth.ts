// hooks/parent-portal/use-parent-auth.ts

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { ParentPortalService } from '@/lib/services/parent-portal/parent-portal-service';
import type {
  OTPRequest,
  OTPVerification,
  ParentRegistrationData,
} from '@/types/parent-portal';
import { parentProfileKeys } from './use-parent-profile';
import { parentDashboardKeys } from './use-parent-dashboard';

// ============================================================================
// MUTATION HOOKS
// ============================================================================

export function useRequestOTP() {
  return useMutation({
    mutationFn: (data: OTPRequest) => ParentPortalService.requestOTP(data),
    onSuccess: (data) => {
      if (data.success) {
        toast.success('OTP sent to your phone');
      } else {
        toast.error(data.message || 'Failed to send OTP');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send OTP');
    },
  });
}

export function useVerifyOTP() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: OTPVerification) => ParentPortalService.verifyOTP(data),
    onSuccess: (data) => {
      if (data.success) {
        if (data.parent?.id) {
          queryClient.invalidateQueries({
            queryKey: parentProfileKeys.detail(data.parent.id),
          });
          queryClient.invalidateQueries({
            queryKey: parentDashboardKeys.dashboard(data.parent.id),
          });
        }
        toast.success(data.message || 'Verification successful');
      } else {
        toast.error(data.message || 'Invalid OTP');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Verification failed');
    },
  });
}

export function useRegisterParent() {
  return useMutation({
    mutationFn: (data: ParentRegistrationData) =>
      ParentPortalService.registerParent(data),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Registration failed');
    },
  });
}

export function useCompleteRegistration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      userId,
      data,
    }: {
      userId: string;
      data: ParentRegistrationData;
    }) => ParentPortalService.completeRegistration(userId, data),
    onSuccess: (data) => {
      if (data.success && data.parent_id) {
        queryClient.invalidateQueries({
          queryKey: parentProfileKeys.detail(data.parent_id),
        });
        toast.success('Registration completed successfully');
      } else {
        toast.error(data.message);
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to complete registration');
    },
  });
}

export function useLogActivity() {
  return useMutation({
    mutationFn: (data: {
      parent_id: string;
      activity_type: string;
      description: string;
      metadata?: Record<string, unknown>;
    }) =>
      ParentPortalService.logActivity({
        parent_id: data.parent_id,
        activity_type: data.activity_type as any,
        description: data.description,
        metadata: data.metadata,
      }),
    // Silent - no toast for activity logging
  });
}
