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
  SponsorActionInput,
} from '@/types/leave-onduty';
import toast from 'react-hot-toast';
import { logActivityClient, LearnerActivityTemplates } from '@/lib/utils/activity-logger-client';
import { createClientSupabaseClient } from '@/lib/supabase/client';

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
  sponsor: {
    all: ['leave-onduty', 'sponsor'] as const,
    pending: (sponsorId: string) =>
      [...KEYS.approvals.all, 'sponsor-pending', sponsorId] as const,
    search: (institutionId: string, query: string) =>
      [...KEYS.approvals.all, 'sponsor-search', institutionId, query] as const,
  },
  team: {
    all: ['leave-onduty', 'team'] as const,
    search: (institutionId: string, query: string) =>
      ['leave-onduty', 'team', 'search', institutionId, query] as const,
  },
};

// =====================================================
// SPONSOR APPROVAL HOOKS (Phase 2)
// =====================================================

/**
 * List applications awaiting the current user's sponsor approval.
 * Returns empty array when sponsorId is empty.
 */
export function useSponsorPendingApprovals(sponsorId: string | null | undefined) {
  return useQuery({
    queryKey: KEYS.sponsor.pending(sponsorId || ''),
    queryFn: () =>
      sponsorId
        ? LeaveOndutyApplicationService.getPendingSponsorApprovals(sponsorId)
        : Promise.resolve([]),
    enabled: !!sponsorId,
    staleTime: 30 * 1000,
  });
}

/**
 * Mutation — sponsor approves or rejects an application.
 * Invalidates both the sponsor queue and the general approvals queue
 * so the application disappears from the sponsor view and shows up in
 * the HOD view once approved.
 */
export function useProcessSponsorApproval() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SponsorActionInput) =>
      LeaveOndutyApplicationService.processSponsorApproval({
        application_id: input.application_id,
        sponsor_id: input.sponsor_id,
        decision: input.decision,
        comments: input.comments,
      }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: KEYS.sponsor.all });
      queryClient.invalidateQueries({ queryKey: KEYS.applications.all });
      queryClient.invalidateQueries({ queryKey: KEYS.approvals.all });
      toast.success(
        variables.decision === 'approved'
          ? 'Application approved and forwarded to HOD'
          : 'Application rejected'
      );
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to process sponsor action');
    },
  });
}

export interface EligibleSponsor {
  id: string;
  full_name: string;
  email: string;
  role: string;
  department_name?: string | null;
}

/**
 * Search eligible sponsors by name/email within the learner's institution.
 * Returns empty array when query is empty (picker decides whether to show).
 */
export function useEligibleSponsors(
  institutionId: string | null | undefined,
  searchQuery: string,
  enabled: boolean = true
) {
  return useQuery<EligibleSponsor[]>({
    queryKey: KEYS.sponsor.search(institutionId || '', searchQuery),
    queryFn: async () => {
      if (!institutionId) return [];
      return (await LeaveOndutyApplicationService.searchEligibleSponsors({
        institutionId,
        query: searchQuery,
      })) as EligibleSponsor[];
    },
    enabled: enabled && !!institutionId,
    staleTime: 60 * 1000,
  });
}

export interface TeamMemberSearchResult {
  id: string;
  first_name: string;
  last_name: string;
  roll_number: string | null;
  register_number: string | null;
  student_email: string | null;
  section_id: string | null;
  department_id: string | null;
}

/**
 * Search learners institution-wide for team OD roster selection.
 * Excludes the applicant themselves so they can't add themselves as a team-mate.
 */
export function useSearchTeamMembers(
  institutionId: string | null | undefined,
  searchQuery: string,
  applicantLearnerId: string | null | undefined,
  enabled: boolean = true
) {
  return useQuery<TeamMemberSearchResult[]>({
    queryKey: KEYS.team.search(institutionId || '', searchQuery),
    queryFn: async () => {
      if (!institutionId) return [];
      return await LeaveOndutyApplicationService.searchTeamMembers({
        institutionId,
        query: searchQuery,
        excludeLearnerId: applicantLearnerId || undefined,
      });
    },
    enabled: enabled && !!institutionId,
    staleTime: 60 * 1000,
  });
}

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

      // Activity logging (fire-and-forget)
      createClientSupabaseClient().auth.getUser().then(({ data: userData }) => {
        if (userData?.user?.id) {
          const duration = `${variables.data.start_date} to ${variables.data.end_date}`;
          const template = LearnerActivityTemplates.leaveApplied(
            userData.user.email || 'User',
            variables.data.category,
            duration
          );
          logActivityClient({
            userId: userData.user.id,
            actionType: template.actionType,
            resourceType: template.resourceType,
            description: template.description,
            metadata: {
              sub_type: template.sub_type,
              learner_id: variables.learnerId,
              institution_id: variables.institutionId,
              category: variables.data.category,
              sub_category: variables.data.sub_category,
              start_date: variables.data.start_date,
              end_date: variables.data.end_date,
              period_type: variables.data.period_type,
            },
            institutionId: variables.institutionId,
          });
        }
      });
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
    // Skip the query while profile is still loading — otherwise learnerId=''
    // fires .eq('learner_id', '') which Supabase rejects as "invalid input
    // syntax for type uuid", surfaced to users as "Failed to load applications".
    enabled: !!learnerId,
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

      // Activity logging (fire-and-forget)
      createClientSupabaseClient().auth.getUser().then(({ data: userData }) => {
        if (userData?.user?.id) {
          const template = LearnerActivityTemplates.leaveCancelled(
            userData.user.email || 'User'
          );
          logActivityClient({
            userId: userData.user.id,
            actionType: template.actionType,
            resourceType: template.resourceType,
            description: template.description,
            metadata: {
              sub_type: template.sub_type,
              learner_id: variables.learnerId,
              application_id: variables.applicationId,
            },
          });
        }
      });
    },
    onError: (error: Error) => {
      toast.error(`Failed to cancel application: ${error.message}`);
    },
  });
}

/**
 * Delete a cancelled application
 */
export function useDeleteLeaveOndutyApplication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      applicationId,
      learnerId,
    }: {
      applicationId: string;
      learnerId: string;
    }) => {
      return await LeaveOndutyApplicationService.deleteApplication(
        applicationId,
        learnerId
      );
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: KEYS.applications.learner(variables.learnerId),
      });
      toast.success('Application deleted successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete application: ${error.message}`);
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
      semesterId,
    }: {
      data: ApplicationFormData;
      sectionId: string;
      semesterId: string;
    }) => {
      return await LeaveOndutyApplicationService.validateApplicationData(
        data,
        sectionId,
        semesterId
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
  semesterId: string,
  date: string,
  periodType: string
) {
  return useQuery({
    queryKey: ['periods-for-date', sectionId, semesterId, date, periodType],
    queryFn: () =>
      LeaveOndutyApplicationService.getPeriodsForDate(sectionId, semesterId, date, periodType),
    enabled: !!sectionId && !!semesterId && !!date && !!periodType,
    staleTime: 5 * 60 * 1000, // 5 min — timetable doesn't change mid-session
    refetchOnWindowFocus: false, // Prevent refetch when returning from file picker on mobile
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
export function usePendingApprovals(approverId: string, enabled: boolean = true) {
  return useQuery({
    queryKey: KEYS.approvals.pending(approverId),
    queryFn: () => LeaveOndutyApprovalService.getPendingApprovals(approverId),
    enabled: enabled && !!approverId,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

/**
 * Get ALL applications for super admin by status (across all institutions)
 */
export function useAllApplicationsForSuperAdminByStatus(
  status: string = 'pending',
  enabled: boolean = true
) {
  return useQuery({
    queryKey: [...KEYS.approvals.all, 'super-admin', status],
    queryFn: () => LeaveOndutyApprovalService.getAllApplicationsForSuperAdminByStatus(status),
    enabled,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

/**
 * Get ALL pending applications for super admin (across all institutions)
 * @deprecated Use useAllApplicationsForSuperAdminByStatus instead
 */
export function useAllPendingApplicationsForSuperAdmin(enabled: boolean = true) {
  return useAllApplicationsForSuperAdminByStatus('pending', enabled);
}

/**
 * Get approval statistics for super admin
 */
export function useSuperAdminApprovalStatistics(enabled: boolean = true) {
  return useQuery({
    queryKey: [...KEYS.approvals.all, 'super-admin-stats'],
    queryFn: () => LeaveOndutyApprovalService.getSuperAdminApprovalStatistics(),
    enabled,
  });
}

/**
 * Get applications by status filtered by institution and department
 * Used for HOD, Principal, and other institutional roles
 */
export function useApplicationsByStatusForInstitution(
  status: string = 'pending',
  institutionId: string | null,
  departmentId?: string | null,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: [...KEYS.approvals.all, 'institution', institutionId, departmentId, status],
    queryFn: () => {
      if (!institutionId) {
        throw new Error('Institution ID is required');
      }
      return LeaveOndutyApprovalService.getApplicationsByStatusForInstitution(
        status,
        institutionId,
        departmentId || undefined
      );
    },
    enabled: enabled && !!institutionId,
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

      // Activity logging (fire-and-forget)
      createClientSupabaseClient().auth.getUser().then(({ data: userData }) => {
        if (userData?.user?.id) {
          const template = LearnerActivityTemplates.leaveApprovalProcessed(
            userData.user.email || 'Approver',
            'Learner',
            variables.status
          );
          logActivityClient({
            userId: userData.user.id,
            actionType: template.actionType,
            resourceType: template.resourceType,
            description: template.description,
            metadata: {
              sub_type: template.sub_type,
              application_id: variables.application_id,
              decision: variables.status,
              comments: variables.comments,
            },
          });
        }
      });
    },
    onError: (error: Error) => {
      toast.error(`Failed to process approval: ${error.message}`);
    },
  });
}

/**
 * Forward a pending approval to another staff member (v2, 2026-04-21).
 *
 * Accepts the same query-invalidation pattern as useProcessApproval so the
 * approvals dashboard refreshes immediately and the forwarded-to staff sees
 * the new pending row.
 */
export function useProcessForward() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      application_id: string;
      approver_id: string;
      forward_to_id: string;
      comments: string;
    }) => {
      return await LeaveOndutyApprovalService.processForward(data);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: KEYS.approvals.all });
      queryClient.invalidateQueries({ queryKey: KEYS.applications.all });
      queryClient.invalidateQueries({
        queryKey: KEYS.applications.detail(variables.application_id),
      });
      toast.success('Application forwarded successfully');
    },
    onError: (error: Error) => {
      toast.error(`Failed to forward: ${error.message}`);
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
  endDate?: string,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: KEYS.approvals.stats(approverId),
    queryFn: () =>
      LeaveOndutyApprovalService.getApprovalStatistics(approverId, startDate, endDate),
    enabled: enabled && !!approverId,
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
  institutionId: string | null | undefined,
  filters?: FlowFilters
) {
  return useQuery({
    queryKey: KEYS.flows.list(institutionId || 'all', filters),
    queryFn: () => LeaveOndutyFlowService.getFlowsByInstitution(institutionId, filters),
    // Always enabled - allow fetching all flows for super admin (when institutionId is null/empty)
    enabled: true,
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
