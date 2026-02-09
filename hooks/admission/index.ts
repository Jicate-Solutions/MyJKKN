// Admission Module Hooks
// Connected to LeadService for actual Supabase interactions

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LeadService } from '@/lib/services/admission/lead-service';
import { ApplicationService } from '@/lib/services/admission/application-service';
import type { LeadFilters, CreateLeadInput, UpdateLeadInput, FunnelStage, LeadPriority, CreateApplicationInput, UpdateApplicationInput, ApplicationStatus } from '@/types/admission';

// Re-export from use-consultants for convenience
export { useSourcePerformance } from './use-consultants';

// Re-export AI response hooks
export {
  useAIServiceStatus,
  useGenerateResponse,
  useSuggestedReplies,
  usePersonalizeTemplate,
  useAIResponses,
  useResponseIntents,
  useCommunicationChannels as useAICommunicationChannels,
  aiResponseKeys,
} from './use-ai-responses';

// Re-export scoring rules hooks
export {
  useScoringRules,
  useActiveScoringRule,
  useScoringRule,
  useScoringRuleMutations,
  useDefaultScoringConfig,
  useCalculateScore,
  scoringRulesKeys,
} from './use-scoring-rules';

// Re-export assignment rules hooks
export {
  useAssignmentRules,
  useActiveAssignmentRules,
  useAssignmentRule,
  useAssignmentStats,
  useAssignmentRuleMutations,
  assignmentRulesKeys,
} from './use-assignment-rules';

// Re-export communication templates hooks
export {
  useCommunicationTemplates,
  useActiveTemplates,
  useCommunicationTemplate,
  useTemplateStats,
  useTemplateMutations,
  useTemplateVariables,
  communicationTemplatesKeys,
} from './use-communication-templates';

// Re-export workflows hooks
export {
  useWorkflows,
  useActiveWorkflows,
  useWorkflow,
  useWorkflowStats,
  useWorkflowExecutions,
  useWorkflowMutations,
  useWorkflowHelpers,
  workflowsKeys,
} from './use-workflows';

// Re-export activity hooks
export {
  useLeadActivities,
  useEnhancedTimeline,
  useActivityStats,
  useActivityMutations,
  activityKeys,
} from './use-activities';

// Re-export campaign processor hooks
export {
  useQueuedSteps,
  usePendingSteps,
  useCampaignLogs,
  useQueueStats,
  useExecutionStatus,
  useCampaignProcessorMutations,
  useCampaignProcessorHelpers,
  useQueueRealtime,
  campaignProcessorKeys,
} from './use-campaign-processor';

// Re-export SMS campaign hooks
export {
  useSMSLogs,
  useLeadSMSLogs,
  useSMSDeliveryStatus,
  useSMSCampaignStats,
  useSMSMutations,
  useSMSTemplateHelpers,
  useSMSStatusBadge,
  smsCampaignKeys,
} from './use-sms-campaign';

// Re-export WhatsApp campaign hooks
export {
  useWhatsAppMessages,
  useLeadWhatsAppMessages,
  useWhatsAppMessageStatus,
  useWhatsAppCampaignStats,
  useWhatsAppCampaignMutations,
  useWhatsAppTemplateHelpers,
  useDeliveryStatusDisplay,
  whatsappCampaignKeys,
} from './use-whatsapp-campaign';

// Re-export lead scoring engine hooks
export {
  useLeadScore,
  useScoreBreakdown,
  useLeadsByScoreRange,
  useLeadsWithScores,
  useScoreStatistics,
  useScoreCalculation,
  useScoreCategoryDisplay,
  useScoreBreakdownFormatter,
  leadScoringKeys,
} from './use-lead-scoring';

// Re-export drip executor hooks
export {
  useActiveSequences,
  useDripStatus,
  useDripStats,
  useLeadSequences,
  useHasActiveSequence,
  useDripMutations,
  useDripExecutor,
  dripExecutorKeys,
} from './use-drip-executor';

// Re-export campaign monitoring hooks
export {
  useCampaignStats,
  useDeliveryMetrics,
  useActiveSequences as useMonitoringActiveSequences,
  useExecutionLogs,
  useRealtimeUpdates,
  useCampaigns,
  useCampaign,
  useCampaignMonitoringDashboard,
  campaignMonitoringKeys,
} from './use-campaign-monitoring';

// Re-export daily briefing hooks
export {
  useDailyBriefing,
  useLatestBriefing,
  useUnreadBriefings,
  useBriefingHistory,
  useBriefingMutations,
  useHasUnreadBriefingToday,
  useDailyBriefingDashboard,
  dailyBriefingKeys,
} from './use-daily-briefing';

// Re-export briefing notification hooks
export {
  useBriefingNotifications,
  useUnreadBriefingCount,
  useLatestUnreadBriefing,
  useBriefing,
  useLatestBriefing as useLatestInstitutionBriefing,
  useTodaysBriefing,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useDismissNotification,
  useBriefingBanner,
  useBriefingPopup,
  briefingNotificationsKeys,
} from './use-briefing-notifications';

// Re-export insight actions hooks
export {
  useAvailableActions,
  useActionMetadata,
  useExecuteAction,
  useBulkAction,
  useCancelAction,
  useActionHistory,
  useActionExecution,
  useActionButtonState,
  useLeadSelection,
  useActionStyles,
  useInsightActionMutations,
  insightActionsKeys,
} from './use-insight-actions';

// Re-export AI insights dashboard hooks
export {
  useInsights,
  useActiveInsights,
  useInsightsByType,
  useHighPriorityInsights,
  useRecommendations,
  useTrends,
  useAnomalies,
  useDismissInsight,
  useGenerateInsights,
  useAIInsightsDashboard,
  useInsightPriorityStyles,
  useInsightTypeStyles,
  aiInsightsKeys,
} from './use-ai-insights';

// Re-export agentic query hooks
export {
  useAgenticQuery,
  useAgenticQuerySync,
  useSuggestedQueries,
  useQueryHistory,
  useQueryTemplates,
  useQueryResultFormatter,
  agenticQueryKeys,
} from './use-agentic-query';
export type {
  QueryIntent,
  QueryFilter,
  TimeRange,
  QueryStep,
  AgenticQueryResult,
  QueryHistoryEntry,
} from './use-agentic-query';

// ============================================
// LEADS HOOKS
// ============================================

export function useAdmissionLeads(filters?: LeadFilters) {
  const query = useQuery({
    queryKey: ['admission-leads', filters],
    queryFn: async () => {
      return LeadService.getLeads(filters || {});
    },
    enabled: !!filters?.institution_id
  });

  return {
    leads: query.data?.data || [],
    total: query.data?.metadata?.total || 0,
    totalPages: query.data?.metadata?.totalPages || 0,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch
  };
}

export function useLeadMutations() {
  const queryClient = useQueryClient();

  const createLead = useMutation({
    mutationFn: async (data: CreateLeadInput) => {
      return LeadService.createLead(data);
    },
    onSuccess: (data) => {
      toast.success('Lead created successfully');
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
      queryClient.invalidateQueries({ queryKey: ['funnel-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      return data;
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create lead');
    }
  });

  const updateLead = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<UpdateLeadInput> }) => {
      return LeadService.updateLead(id, data);
    },
    onSuccess: () => {
      toast.success('Lead updated successfully');
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
      queryClient.invalidateQueries({ queryKey: ['admission-lead'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update lead');
    }
  });

  const deleteLead = useMutation({
    mutationFn: async (id: string) => {
      return LeadService.deleteLead(id);
    },
    onSuccess: () => {
      toast.success('Lead deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
      queryClient.invalidateQueries({ queryKey: ['funnel-summary'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete lead');
    }
  });

  const updateStage = useMutation({
    mutationFn: async ({ leadId, stage, notes }: { leadId: string; stage: FunnelStage; notes?: string }) => {
      return LeadService.updateStage(leadId, stage, notes);
    },
    onSuccess: () => {
      toast.success('Lead stage updated');
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
      queryClient.invalidateQueries({ queryKey: ['admission-lead'] });
      queryClient.invalidateQueries({ queryKey: ['funnel-summary'] });
      queryClient.invalidateQueries({ queryKey: ['lead-timeline'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update stage');
    }
  });

  const toggleHotLead = useMutation({
    mutationFn: async ({ leadId, isHot }: { leadId: string; isHot: boolean }) => {
      return LeadService.toggleHotLead(leadId, isHot);
    },
    onSuccess: (_, variables) => {
      toast.success(variables.isHot ? 'Marked as hot lead' : 'Removed hot lead status');
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
      queryClient.invalidateQueries({ queryKey: ['admission-lead'] });
      queryClient.invalidateQueries({ queryKey: ['funnel-summary'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update hot lead status');
    }
  });

  const togglePriority = useMutation({
    mutationFn: async ({ leadId, isPriority }: { leadId: string; isPriority: boolean }) => {
      return LeadService.updatePriority(leadId, isPriority ? 'warm' : 'cold');
    },
    onSuccess: (_, variables) => {
      toast.success(variables.isPriority ? 'Marked as priority' : 'Removed priority status');
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
      queryClient.invalidateQueries({ queryKey: ['admission-lead'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update priority');
    }
  });

  const addTag = useMutation({
    mutationFn: async ({ leadId, tag }: { leadId: string; tag: string }) => {
      return LeadService.addTag(leadId, tag);
    },
    onSuccess: () => {
      toast.success('Tag added');
      queryClient.invalidateQueries({ queryKey: ['admission-lead'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add tag');
    }
  });

  const removeTag = useMutation({
    mutationFn: async ({ leadId, tag }: { leadId: string; tag: string }) => {
      return LeadService.removeTag(leadId, tag);
    },
    onSuccess: () => {
      toast.success('Tag removed');
      queryClient.invalidateQueries({ queryKey: ['admission-lead'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove tag');
    }
  });

  const createLeadWithProfile = useMutation({
    mutationFn: async (data: CreateLeadInput) => {
      // Create lead - profile creation will be handled separately if needed
      return LeadService.createLead(data);
    },
    onSuccess: (data) => {
      toast.success('Lead created successfully');
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
      queryClient.invalidateQueries({ queryKey: ['funnel-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      return data;
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create lead');
    }
  });

  const assignCounselor = useMutation({
    mutationFn: async ({ leadId, counselorId }: { leadId: string; counselorId: string }) => {
      return LeadService.assignCounselor(leadId, counselorId);
    },
    onSuccess: () => {
      toast.success('Counselor assigned');
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
      queryClient.invalidateQueries({ queryKey: ['admission-lead'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to assign counselor');
    }
  });

  const scheduleFollowup = useMutation({
    mutationFn: async ({ leadId, followupDate, notes }: { leadId: string; followupDate: string; notes?: string }) => {
      return LeadService.scheduleFollowup(leadId, followupDate, notes);
    },
    onSuccess: () => {
      toast.success('Followup scheduled');
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
      queryClient.invalidateQueries({ queryKey: ['admission-lead'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to schedule followup');
    }
  });

  return {
    createLead,
    updateLead,
    deleteLead,
    updateStage,
    toggleHotLead,
    togglePriority,
    addTag,
    removeTag,
    createLeadWithProfile,
    assignCounselor,
    scheduleFollowup
  };
}

// ============================================
// APPLICATIONS HOOKS
// ============================================

export function useAdmissionApplications(filters?: any) {
  const query = useQuery({
    queryKey: ['admission-applications', filters],
    queryFn: async () => {
      return ApplicationService.getApplications({
        institutionId: filters?.institutionId,
        leadId: filters?.leadId,
        status: filters?.status,
        search: filters?.search,
        page: filters?.page || 1,
        limit: filters?.limit || 10,
      });
    },
    enabled: true
  });

  return {
    applications: query.data?.data || [],
    total: query.data?.metadata?.total || 0,
    totalPages: query.data?.metadata?.totalPages || 0,
    isLoading: query.isLoading,
    refetch: query.refetch,
    ...query
  };
}

export function useApplicationMutations() {
  const queryClient = useQueryClient();

  const createApplication = useMutation({
    mutationFn: async (data: CreateApplicationInput) => {
      return ApplicationService.createApplicationFromLead(data);
    },
    onSuccess: () => {
      toast.success('Application created successfully');
      queryClient.invalidateQueries({ queryKey: ['admission-applications'] });
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
      queryClient.invalidateQueries({ queryKey: ['admission-lead'] });
      queryClient.invalidateQueries({ queryKey: ['lead-timeline'] });
      queryClient.invalidateQueries({ queryKey: ['lead-activities'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create application');
    }
  });

  const updateApplication = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<UpdateApplicationInput> }) => {
      return ApplicationService.updateApplication(id, data);
    },
    onSuccess: () => {
      toast.success('Application updated successfully');
      queryClient.invalidateQueries({ queryKey: ['admission-applications'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update application');
    }
  });

  const updateApplicationStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ApplicationStatus }) => {
      return ApplicationService.updateStatus(id, status);
    },
    onSuccess: () => {
      toast.success('Application status updated');
      queryClient.invalidateQueries({ queryKey: ['admission-applications'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update application status');
    }
  });

  return { createApplication, updateApplication, updateApplicationStatus };
}

// ============================================
// COMMUNICATION HOOKS
// ============================================

export function useCommunicationChannels(institutionId?: string) {
  const query = useQuery({
    queryKey: ['communication-channels', institutionId],
    queryFn: async () => {
      // TODO: Implement
      return [];
    },
    enabled: !!institutionId
  });

  return {
    channels: query.data || [],
    isLoading: query.isLoading
  };
}

export function useMessageTemplates(filters?: any) {
  const query = useQuery({
    queryKey: ['message-templates', filters],
    queryFn: async () => {
      // TODO: Implement
      return { data: [], total: 0 };
    }
  });

  return {
    templates: query.data?.data || [],
    total: query.data?.total || 0,
    isLoading: query.isLoading,
    refetch: query.refetch
  };
}

export function useCommunicationMutations() {
  const queryClient = useQueryClient();

  const sendMessage = useMutation({
    mutationFn: async (data: any) => {
      const { CommunicationService } = await import('@/lib/services/admission/communication-service');
      return CommunicationService.sendMessage(data);
    },
    onSuccess: () => {
      toast.success('Message sent successfully');
      queryClient.invalidateQueries({ queryKey: ['lead-communication-history'] });
    }
  });

  const scheduleMessage = useMutation({
    mutationFn: async (data: any) => {
      const { CommunicationService } = await import('@/lib/services/admission/communication-service');
      return CommunicationService.scheduleMessage(data);
    },
    onSuccess: () => {
      toast.success('Message scheduled successfully');
      queryClient.invalidateQueries({ queryKey: ['lead-communication-history'] });
    }
  });

  return { sendMessage, scheduleMessage };
}

// ============================================
// ANALYTICS HOOKS
// ============================================

export function useCounselorPerformance(institutionId?: string, dateRange?: any) {
  const query = useQuery({
    queryKey: ['counselor-performance', institutionId, dateRange],
    queryFn: async () => {
      // TODO: Implement
      return [];
    },
    enabled: !!institutionId
  });

  // Destructure to avoid spread overwriting custom error
  const { error: queryError, ...restQuery } = query;

  return {
    ...restQuery,
    counselors: query.data || [],
    isLoading: query.isLoading,
    error: queryError?.message || null,
    refetch: query.refetch
  };
}

export function useSourceROI(filters?: any) {
  return useQuery({
    queryKey: ['source-roi', filters],
    queryFn: async () => {
      // TODO: Implement
      return [];
    }
  });
}

// ============================================
// DASHBOARD HOOKS
// ============================================

export function useAdmissionDashboard(filters?: any) {
  const query = useQuery({
    queryKey: ['admission-dashboard', filters],
    queryFn: async () => {
      if (!filters?.institution_id) {
        return {
          summary: {
            totalLeads: 0,
            newLeads: 0,
            convertedLeads: 0,
            pendingFollowups: 0,
            todayFollowups: 0,
            conversionRate: 0
          },
          funnel: []
        };
      }

      const [summary, funnel] = await Promise.all([
        LeadService.getDashboardSummary(filters.institution_id),
        LeadService.getFunnelSummary(filters.institution_id)
      ]);

      return { summary, funnel: funnel.stages };
    },
    enabled: !!filters?.institution_id
  });

  return {
    summary: query.data?.summary || {
      totalLeads: 0,
      newLeads: 0,
      convertedLeads: 0,
      pendingFollowups: 0,
      todayFollowups: 0,
      conversionRate: 0
    },
    funnel: query.data?.funnel || [],
    isLoading: query.isLoading,
    refetchAll: query.refetch,
    ...query
  };
}

export function useDashboardSummary(institutionId?: string) {
  const query = useQuery({
    queryKey: ['dashboard-summary', institutionId],
    queryFn: async () => {
      if (!institutionId) {
        return {
          totalLeads: 0,
          newLeads: 0,
          convertedLeads: 0,
          pendingFollowups: 0,
          todayFollowups: 0,
          conversionRate: 0
        };
      }
      return LeadService.getDashboardSummary(institutionId);
    },
    enabled: !!institutionId
  });

  return {
    summary: query.data || {
      totalLeads: 0,
      newLeads: 0,
      convertedLeads: 0,
      pendingFollowups: 0,
      todayFollowups: 0,
      conversionRate: 0
    },
    isLoading: query.isLoading,
    refetch: query.refetch
  };
}

export function useFunnelSummary(institutionId?: string) {
  const query = useQuery({
    queryKey: ['funnel-summary', institutionId],
    queryFn: async () => {
      if (!institutionId) {
        return {
          total: 0,
          byStage: {} as Record<string, number>,
          hotLeads: 0,
          priorityLeads: 0,
          stages: []
        };
      }
      return LeadService.getFunnelSummary(institutionId);
    },
    enabled: !!institutionId
  });

  return {
    funnel: query.data || {
      total: 0,
      byStage: {} as Record<string, number>,
      hotLeads: 0,
      priorityLeads: 0,
      stages: []
    },
    isLoading: query.isLoading
  };
}

export function useFunnelAnalyticsDashboard(filters?: any) {
  const query = useQuery({
    queryKey: ['funnel-analytics-dashboard', filters],
    queryFn: async () => {
      // TODO: Implement
      return {
        enhanced: [],
        dropOff: [],
        stuckLeads: [],
        bottlenecks: []
      };
    }
  });

  return {
    enhanced: query.data?.enhanced || [],
    dropOff: query.data?.dropOff || [],
    stuckLeads: query.data?.stuckLeads || [],
    bottlenecks: query.data?.bottlenecks || [],
    isLoading: query.isLoading,
    refetchAll: query.refetch,
    ...query
  };
}

// ============================================
// SINGLE LEAD HOOKS
// ============================================

export function useAdmissionLead(id: string) {
  const query = useQuery({
    queryKey: ['admission-lead', id],
    queryFn: async () => {
      if (!id) return null;
      return LeadService.getLead(id);
    },
    enabled: !!id
  });

  return {
    lead: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch
  };
}

export function useLeadTimeline(leadId: string) {
  const query = useQuery({
    queryKey: ['lead-timeline', leadId],
    queryFn: async () => {
      if (!leadId) return [];
      return LeadService.getTimeline(leadId);
    },
    enabled: !!leadId
  });

  return {
    timeline: query.data || [],
    isLoading: query.isLoading
  };
}

export function useLeadCommunicationHistory(leadId: string) {
  const query = useQuery({
    queryKey: ['lead-communication-history', leadId],
    queryFn: async () => {
      // TODO: Implement with CommunicationService
      return [];
    },
    enabled: !!leadId
  });

  return {
    history: query.data || [],
    isLoading: query.isLoading
  };
}

export function useLeadAttributions(leadId: string) {
  return useQuery({
    queryKey: ['lead-attributions', leadId],
    queryFn: async () => {
      // TODO: Implement
      return [];
    },
    enabled: !!leadId
  });
}

export function useFunnelHistory(filters?: any) {
  return useQuery({
    queryKey: ['funnel-history', filters],
    queryFn: async () => {
      // TODO: Implement
      return [];
    }
  });
}
