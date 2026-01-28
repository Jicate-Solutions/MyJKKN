/**
 * Leave/OnDuty React Query Hooks
 *
 * Provides hooks for:
 * - Learner operations (create, view, cancel applications)
 * - Approver operations (view pending, process approvals)
 * - Admin operations (manage flows, view reports)
 *
 * @module hooks/academic/use-leave-onduty
 * @created 2026-01-28
 */

import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { LeaveOndutyApplicationService } from '@/lib/services/academic/leave-onduty-application-service';
import { LeaveOndutyApprovalService } from '@/lib/services/academic/leave-onduty-approval-service';
import { LeaveOndutyFlowService } from '@/lib/services/academic/leave-onduty-flow-service';
import { LeaveOndutyAttendanceIntegrationService } from '@/lib/services/academic/leave-onduty-attendance-integration-service';
import {
  LeaveOndutyApplication,
  ApplicationFormData,
  ApplicationFilters,
  ApprovalActionData,
  FlowCreationData,
  FlowFilters,
  LeaveOndutyApprovalFlow,
  LeaveOndutyApproval,
  ApprovalTimelineStep,
  UpdateFlowInput,
} from '@/types/leave-onduty';
import toast from 'react-hot-toast';

// =====================================================
// QUERY KEYS
// =====================================================

const KEYS = {
  all: ['leave-onduty'] as const,
  applications: {
    all: ['leave-onduty', 'applications'] as const,
    lists: () => [...KEYS.applications.all, 'list'] as const,
    list: (filters: ApplicationFilters) =>
      [...KEYS.applications.lists(), filters] as const,
    details: () => [...KEYS.applications.all, 'detail'] as const,
    detail: (id: string) => [...KEYS.applications.details(), id] as const,
    learner: (learnerId: string) =>
      [...KEYS.applications.all, 'learner', learnerId] as const,
    approver: (approverId: string) =>
      [...KEYS.applications.all, 'approver', approverId] as const,
  },
  approvals: {
    all: ['leave-onduty', 'approvals'] as const,
    lists: () => [...KEYS.approvals.all, 'list'] as const,
    pending: (approverId: string) =>
      [...KEYS.approvals.all, 'pending', approverId] as const,
    timeline: (applicationId: string) =>
      [...KEYS.approvals.all, 'timeline', applicationId] as const,
    stats: (approverId: string) =>
      [...KEYS.approvals.all, 'stats', approverId] as const,
  },
  flows: {
    all: ['leave-onduty', 'flows'] as const,
    lists: () => [...KEYS.flows.all, 'list'] as const,
    list: (institutionId: string, filters?: FlowFilters) =>
      [...KEYS.flows.lists(), institutionId, filters] as const,
    details: () => [...KEYS.flows.all, 'detail'] as const,
    detail: (id: string) => [...KEYS.flows.details(), id] as const,
    stats: (institutionId: string) =>
      [...KEYS.flows.all, 'stats', institutionId] as const,
  },
  attendance: {
    all: ['leave-onduty', 'attendance'] as const,
    updates: (applicationId: string) =>
      [...KEYS.attendance.all, 'updates', applicationId] as const,
    impact: (applicationId: string) =>
      [...KEYS.attendance.all, 'impact', applicationId] as const,
  },
};

// =====================================================
// LEARNER HOOKS
// =====================================================

/**
 * Create a new leave/onduty application
 */
export function useCreateLeaveOndutyApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      data,
      learnerId,
      institutionId,
    }: {
      data: ApplicationFormData;
      learnerId: string;
      institutionId: string;
    }) => {
      return await LeaveOndutyApplicationService.createApplication(
        data,
        learnerId,
        institutionId
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: KEYS.applications.learner(variables.learnerId),
      });
      queryClient.invalidateQueries({ queryKey: KEYS.applications.lists() });
      toast.success('Application submitted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to submit application: ${error.message}`);
    },
  });
}

/**
 * Get applications by learner
 */
export function useMyLeaveOndutyApplications(
  learnerId: string,
  filters?: Partial<ApplicationFilters>,
  options?: Omit<UseQueryOptions<LeaveOndutyApplication[], Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: KEYS.applications.learner(learnerId),
    queryFn: () =>
      LeaveOndutyApplicationService.getApplicationsByLearner(learnerId, filters),
    ...options,
  });
}

/**
 * Get application details
 */
export function useLeaveOndutyApplicationDetails(applicationId: string) {
  return useQuery({
    queryKey: KEYS.applications.detail(applicationId),
    queryFn: () =>
      LeaveOndutyApplicationService.getApplicationDetails(applicationId),
    enabled: !!applicationId,
  });
}

/**
 * Cancel an application
 */
export function useCancelLeaveOndutyApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      applicationId,
      learnerId,
    }: {
      applicationId: string;
      learnerId: string;
    }) => {
      return await LeaveOndutyApplicationService.cancelApplication(
        applicationId,
        learnerId
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: KEYS.applications.learner(variables.learnerId),
      });
      queryClient.invalidateQueries({
        queryKey: KEYS.applications.detail(variables.applicationId),
      });
      toast.success('Application cancelled successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to cancel application: ${error.message}`);
    },
  });
}

/**
 * Validate application data
 */
export function useValidateApplicationData() {
  return useMutation({
    mutationFn: async ({
      data,
      sectionId,
    }: {
      data: ApplicationFormData;
      sectionId: string;
    }) => {
      return await LeaveOndutyApplicationService.validateApplicationData(
        data,
        sectionId
      );
    },
  });
}

/**
 * Get available dates for section
 */
export function useAvailableDatesForSection(
  sectionId: string,
  semesterId: string,
  startDate: string,
  endDate: string
) {
  return useQuery({
    queryKey: ['available-dates', sectionId, semesterId, startDate, endDate],
    queryFn: () =>
      LeaveOndutyApplicationService.getAvailableDatesForSection(
        sectionId,
        semesterId,
        startDate,
        endDate
      ),
    enabled: !!sectionId && !!semesterId && !!startDate && !!endDate,
  });
}

/**
 * Get periods for date
 */
export function usePeriodsForDate(
  sectionId: string,
  date: string,
  periodType: string
) {
  return useQuery({
    queryKey: ['periods-for-date', sectionId, date, periodType],
    queryFn: () =>
      LeaveOndutyApplicationService.getPeriodsForDate(sectionId, date, periodType),
    enabled: !!sectionId && !!date && !!periodType,
  });
}

// =====================================================
// APPROVER HOOKS
// =====================================================

/**
 * Get applications by approver
 */
export function useApplicationsByApprover(
  approverId: string,
  filters?: Partial<ApplicationFilters>
) {
  return useQuery({
    queryKey: KEYS.applications.approver(approverId),
    queryFn: () =>
      LeaveOndutyApplicationService.getApplicationsByApprover(approverId, filters),
    enabled: !!approverId,
  });
}

/**
 * Get pending approvals for approver
 */
export function usePendingApprovals(approverId: string) {
  return useQuery({
    queryKey: KEYS.approvals.pending(approverId),
    queryFn: () => LeaveOndutyApprovalService.getPendingApprovals(approverId),
    enabled: !!approverId,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

/**
 * Process an approval (approve/reject)
 */
export function useProcessApproval() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: ApprovalActionData) => {
      return await LeaveOndutyApprovalService.processApproval(data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: KEYS.approvals.all });
      queryClient.invalidateQueries({ queryKey: KEYS.applications.all });
      queryClient.invalidateQueries({
        queryKey: KEYS.applications.detail(variables.application_id),
      });
      toast.success(
        `Application ${variables.status === 'approved' ? 'approved' : 'rejected'} successfully`
      );
    },
    onError: (error: Error) => {
      toast.error(`Failed to process approval: ${error.message}`);
    },
  });
}

/**
 * Get approval timeline for application
 */
export function useApprovalTimeline(applicationId: string) {
  return useQuery({
    queryKey: KEYS.approvals.timeline(applicationId),
    queryFn: () => LeaveOndutyApprovalService.getApprovalTimeline(applicationId),
    enabled: !!applicationId,
  });
}

/**
 * Check approval permission
 */
export function useCheckApprovalPermission(
  approverId: string,
  applicationId: string
) {
  return useQuery({
    queryKey: ['approval-permission', approverId, applicationId],
    queryFn: () =>
      LeaveOndutyApprovalService.checkApprovalPermission(approverId, applicationId),
    enabled: !!approverId && !!applicationId,
  });
}

/**
 * Get approval statistics for approver
 */
export function useApprovalStatistics(
  approverId: string,
  startDate?: string,
  endDate?: string
) {
  return useQuery({
    queryKey: KEYS.approvals.stats(approverId),
    queryFn: () =>
      LeaveOndutyApprovalService.getApprovalStatistics(approverId, startDate, endDate),
    enabled: !!approverId,
  });
}

// =====================================================
// ADMIN/FLOW HOOKS
// =====================================================

/**
 * Get all applications with admin filters
 */
export function useAllLeaveOndutyApplications(filters: ApplicationFilters) {
  return useQuery({
    queryKey: KEYS.applications.list(filters),
    queryFn: () => LeaveOndutyApplicationService.getAllApplications(filters),
  });
}

/**
 * Get flows by institution
 */
export function useFlowsByInstitution(
  institutionId: string,
  filters?: FlowFilters
) {
  return useQuery({
    queryKey: KEYS.flows.list(institutionId, filters),
    queryFn: () => LeaveOndutyFlowService.getFlowsByInstitution(institutionId, filters),
    enabled: !!institutionId,
  });
}

/**
 * Get flow details
 */
export function useFlowDetails(flowId: string) {
  return useQuery({
    queryKey: KEYS.flows.detail(flowId),
    queryFn: () => LeaveOndutyFlowService.getFlowById(flowId),
    enabled: !!flowId,
  });
}

/**
 * Create a new approval flow
 */
export function useCreateFlow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      flowData,
      createdBy,
    }: {
      flowData: FlowCreationData;
      createdBy: string;
    }) => {
      return await LeaveOndutyFlowService.createFlow(flowData, createdBy);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.flows.all });
      toast.success('Approval flow created successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create flow: ${error.message}`);
    },
  });
}

/**
 * Update an existing flow
 */
export function useUpdateFlow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      flowId,
      updateData,
    }: {
      flowId: string;
      updateData: UpdateFlowInput;
    }) => {
      return await LeaveOndutyFlowService.updateFlow(flowId, updateData);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: KEYS.flows.all });
      queryClient.invalidateQueries({
        queryKey: KEYS.flows.detail(variables.flowId),
      });
      toast.success('Approval flow updated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update flow: ${error.message}`);
    },
  });
}

/**
 * Activate a flow
 */
export function useActivateFlow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (flowId: string) => {
      return await LeaveOndutyFlowService.activateFlow(flowId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.flows.all });
      toast.success('Flow activated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to activate flow: ${error.message}`);
    },
  });
}

/**
 * Deactivate a flow
 */
export function useDeactivateFlow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (flowId: string) => {
      return await LeaveOndutyFlowService.deactivateFlow(flowId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.flows.all });
      toast.success('Flow deactivated successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to deactivate flow: ${error.message}`);
    },
  });
}

/**
 * Delete a flow
 */
export function useDeleteFlow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (flowId: string) => {
      return await LeaveOndutyFlowService.deleteFlow(flowId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.flows.all });
      toast.success('Flow deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete flow: ${error.message}`);
    },
  });
}

/**
 * Get flow statistics
 */
export function useFlowStatistics(institutionId: string) {
  return useQuery({
    queryKey: KEYS.flows.stats(institutionId),
    queryFn: () => LeaveOndutyFlowService.getFlowStatistics(institutionId),
    enabled: !!institutionId,
  });
}

// =====================================================
// ATTENDANCE INTEGRATION HOOKS
// =====================================================

/**
 * Get affected attendance records
 */
export function useAffectedAttendanceRecords(applicationId: string) {
  return useQuery({
    queryKey: KEYS.attendance.updates(applicationId),
    queryFn: () =>
      LeaveOndutyAttendanceIntegrationService.getAffectedAttendanceRecords(
        applicationId
      ),
    enabled: !!applicationId,
  });
}

/**
 * Get attendance impact summary
 */
export function useAttendanceImpactSummary(applicationId: string) {
  return useQuery({
    queryKey: KEYS.attendance.impact(applicationId),
    queryFn: () =>
      LeaveOndutyAttendanceIntegrationService.getAttendanceImpactSummary(
        applicationId
      ),
    enabled: !!applicationId,
  });
}

/**
 * Revert attendance changes
 */
export function useRevertAttendanceChanges() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (applicationId: string) => {
      return await LeaveOndutyAttendanceIntegrationService.revertAttendanceChanges(
        applicationId
      );
    },
    onSuccess: (_, applicationId) => {
      queryClient.invalidateQueries({
        queryKey: KEYS.attendance.updates(applicationId),
      });
      queryClient.invalidateQueries({
        queryKey: KEYS.attendance.impact(applicationId),
      });
      toast.success('Attendance changes reverted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to revert attendance: ${error.message}`);
    },
  });
}
