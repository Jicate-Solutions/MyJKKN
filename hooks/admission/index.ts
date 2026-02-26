// Admission Module Hooks
// Connected to LeadService for actual Supabase interactions

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { LeadService } from '@/lib/services/admission/lead-service';
import { ApplicationService } from '@/lib/services/admission/application-service';
import { CommunicationTemplatesService } from '@/lib/services/admission/communication-templates-service';
import { SMSCampaignService } from '@/lib/services/admission/sms-campaign-service';
import { WhatsAppCampaignService } from '@/lib/services/admission/whatsapp-campaign-service';
import { createClientSupabaseClient } from '@/lib/supabase/client';
import type { LeadFilters, CreateLeadInput, UpdateLeadInput, FunnelStage, CreateApplicationInput, UpdateApplicationInput, ApplicationStatus } from '@/types/admission';

// Re-export reminders hooks
export {
  useFollowUpReminders,
  useCompleteReminder,
  useSnoozeReminder,
  useRescheduleReminder,
  useDismissReminder,
  useCreateReminder,
  useSearchLeadsForReminder,
  remindersKeys,
} from './use-reminders';

// Re-export from use-consultants for convenience
export { useSourcePerformance } from './use-consultants';

// Re-export re-engagement hooks
export {
  useMarkLeadAsHot,
  reEngagementKeys,
} from './use-re-engagement';

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

// Re-export counselor daily view hooks
export {
  useCounselorDailyView,
  useUnassignedLeads,
  useCounselorsList,
  useCounselorActions,
  useCounselorProfiles,
  counselorDailyViewKeys,
} from './use-counselor-daily-view';

// Re-export activity hooks
export {
  useLeadActivities,
  useEnhancedTimeline,
  useActivityStats,
  useActivityMutations,
  activityKeys,
} from './use-activities';


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


// Re-export activity alerts hooks (Phase 4.1)
export {
  useAlertRules,
  useAlertHistory,
  useEventTypes,
  useAlertMutations,
  activityAlertKeys,
} from './use-activity-alerts';

// Re-export campaign ROI hooks (Phase 4.2)
export {
  useCampaignROI,
  useROISummary,
  useChannelComparison,
  useConversionFunnel,
  campaignROIKeys,
} from './use-campaign-roi';


// Re-export communication cost hooks (Phase 4.9)
export {
  useCostDashboard,
  useCostEntries,
  useMonthlyCosts,
  useChannelCosts,
  useCostMutations,
  useCostHelpers,
  communicationCostKeys,
} from './use-communication-costs';

// Re-export telephony / call log hooks
export {
  useCallLogs,
  useLeadCallLogs,
  useCallStatusDisplay,
  useCallDispositionDisplay,
  callLogsKeys,
} from './use-call-logs';
export type {
  CallLog,
  CallLogFilters,
  PaginatedCallLogs,
  CallStatus,
  CallDisposition,
  CallDirection,
} from './use-call-logs';

export {
  useCallMutations,
} from './use-call-mutations';

export {
  useCallStats,
  formatDuration,
  callStatsKeys,
} from './use-call-stats';

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
      queryClient.invalidateQueries({ queryKey: ['admission-dashboard'] });
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
      queryClient.invalidateQueries({ queryKey: ['funnel-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['admission-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['counselor-daily-view'] });
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
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['admission-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['counselor-daily-view'] });
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
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['admission-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['lead-timeline'] });
      queryClient.invalidateQueries({ queryKey: ['counselor-daily-view'] });
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
      queryClient.invalidateQueries({ queryKey: ['counselor-daily-view'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update hot lead status');
    }
  });

  const togglePriority = useMutation({
    mutationFn: async ({ leadId, isPriority }: { leadId: string; isPriority: boolean }) => {
      // Use updateLead to only change is_priority without touching is_hot_lead
      return LeadService.updateLead(leadId, { is_priority: isPriority });
    },
    onSuccess: (_, variables) => {
      toast.success(variables.isPriority ? 'Marked as priority' : 'Removed priority status');
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
      queryClient.invalidateQueries({ queryKey: ['admission-lead'] });
      queryClient.invalidateQueries({ queryKey: ['funnel-summary'] });
      queryClient.invalidateQueries({ queryKey: ['admission-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['counselor-daily-view'] });
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
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
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
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
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
      // Toast is fired by the calling component's onSuccess callback — don't duplicate
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
      queryClient.invalidateQueries({ queryKey: ['funnel-summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['admission-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['counselor-daily-view'] });
      return data;
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create lead');
    }
  });

  const assignCounselor = useMutation({
    mutationFn: async ({ leadId, counselorId, profileId }: { leadId: string; counselorId: string; profileId?: string }) => {
      return LeadService.assignCounselor(leadId, counselorId, profileId);
    },
    onSuccess: () => {
      toast.success('Counselor assigned');
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
      queryClient.invalidateQueries({ queryKey: ['admission-lead'] });
      queryClient.invalidateQueries({ queryKey: ['counselor-performance'] });
      queryClient.invalidateQueries({ queryKey: ['counselor-daily-view'] });
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
      queryClient.invalidateQueries({ queryKey: ['counselor-daily-view'] });
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

export function useAdmissionApplication(applicationId: string) {
  const query = useQuery({
    queryKey: ['admission-application', applicationId],
    queryFn: async () => {
      return ApplicationService.getApplication(applicationId);
    },
    enabled: !!applicationId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(applicationId)
  });

  return {
    application: query.data || null,
    isLoading: query.isLoading,
    refetch: query.refetch,
    ...query
  };
}

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
    enabled: !!filters?.institutionId
  });

  return {
    applications: query.data?.data || [],
    total: query.data?.metadata?.total || 0,
    totalPages: query.data?.metadata?.totalPages || 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
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
      queryClient.invalidateQueries({ queryKey: ['admission-application'] });
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
      queryClient.invalidateQueries({ queryKey: ['admission-leads'] });
      queryClient.invalidateQueries({ queryKey: ['admission-lead'] });
      queryClient.invalidateQueries({ queryKey: ['admission-application'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      queryClient.invalidateQueries({ queryKey: ['admission-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['funnel-summary'] });
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
      if (!institutionId) return [];
      const supabase = createClientSupabaseClient();
      const { data, error } = await (supabase as any)
        .from('admission_communication_templates')
        .select('channel')
        .eq('institution_id', institutionId)
        .eq('is_active', true);
      if (error) throw new Error(error.message);
      // Extract distinct channels
      const channelSet = new Set<string>((data || []).map((d: any) => d.channel));
      return Array.from(channelSet).map(ch => ({ id: ch, name: ch, value: ch }));
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
      if (!filters?.institutionId && !filters?.institution_id) return { data: [], total: 0 };
      const institutionId = filters.institutionId || filters.institution_id;
      const templates = await CommunicationTemplatesService.getTemplates({
        institutionId,
        channel: filters?.channel || filters?.type,
        isActive: filters?.isActive,
        search: filters?.search,
      });
      return { data: templates, total: templates.length };
    },
    enabled: !!(filters?.institutionId || filters?.institution_id)
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
      const channel = data.channel || 'sms';
      if (channel === 'whatsapp') {
        return WhatsAppCampaignService.sendCampaignMessage({
          institution_id: data.institutionId || data.institution_id,
          lead_id: data.leadId || data.lead_id,
          template_id: data.templateId || data.template_id,
          recipient_phone: data.phone || data.recipient_phone,
          message_content: data.message || data.content,
          variables: data.variables,
        });
      }
      if (channel === 'email') {
        toast.info('Email sending is coming soon. Please use SMS or WhatsApp for now.');
        return { success: false, message: 'Email not yet available' };
      }
      if (channel !== 'sms') {
        throw new Error(`Unsupported communication channel: ${channel}`);
      }
      return SMSCampaignService.sendCampaignSMS({
        institutionId: data.institutionId || data.institution_id,
        leadId: data.leadId || data.lead_id,
        phoneNumber: data.phone || data.phoneNumber,
        templateId: data.templateId || data.template_id,
        messageContent: data.message || data.content,
        variables: data.variables,
      });
    },
    onSuccess: () => {
      toast.success('Message sent successfully');
      queryClient.invalidateQueries({ queryKey: ['lead-communication-history'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to send message');
    }
  });

  const scheduleMessage = useMutation({
    mutationFn: async (data: any) => {
      // Create a scheduled log entry - the campaign processor will pick it up
      const supabase = createClientSupabaseClient();
      const channel = data.channel || 'sms';
      if (channel === 'whatsapp') {
        const { data: log, error } = await (supabase as any)
          .from('admission_whatsapp_logs')
          .insert({
            institution_id: data.institutionId || data.institution_id,
            lead_id: data.leadId || data.lead_id,
            template_id: data.templateId || data.template_id || null,
            recipient_phone: data.phone || data.recipient_phone,
            message_content: data.message || data.content || '',
            delivery_status: 'pending',
            metadata: { scheduled_at: data.scheduledAt || data.scheduled_at },
          })
          .select()
          .single();
        if (error) throw new Error(error.message);
        return log;
      }
      // SMS scheduling
      const { data: log, error } = await (supabase as any)
        .from('admission_sms_logs')
        .insert({
          institution_id: data.institutionId || data.institution_id,
          lead_id: data.leadId || data.lead_id,
          template_id: data.templateId || data.template_id || null,
          phone_number: data.phone || data.phoneNumber,
          message_content: data.message || data.content || '',
          provider: 'msg91',
          status: 'pending',
          segments: Math.ceil((data.message || data.content || '').length / 160) || 1,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return log;
    },
    onSuccess: () => {
      toast.success('Message scheduled successfully');
      queryClient.invalidateQueries({ queryKey: ['lead-communication-history'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to schedule message');
    }
  });

  return { sendMessage, scheduleMessage };
}

// ============================================
// ANALYTICS HOOKS
// ============================================

export function useCounselorPerformance(institutionId?: string, dateRange?: any) {
  const { isSuperAdmin } = usePermissions();
  const query = useQuery({
    queryKey: ['counselor-performance', institutionId, isSuperAdmin, dateRange],
    queryFn: async () => {
      if (!isSuperAdmin && !institutionId) return [];
      const supabase = createClientSupabaseClient();
      // Get leads grouped by counselor
      let leadsQuery = (supabase as any)
        .from('admission_leads')
        .select('counselor_id, stage, funnel_stage, score, is_hot_lead, total_messages_sent, created_at, counselor:admission_counselors(id, name, email)')
        .not('counselor_id', 'is', null);
      if (institutionId) leadsQuery = leadsQuery.eq('institution_id', institutionId);
      if (dateRange?.from) leadsQuery = leadsQuery.gte('created_at', dateRange.from);
      if (dateRange?.to) leadsQuery = leadsQuery.lte('created_at', dateRange.to);
      const { data: leads, error } = await leadsQuery;
      if (error) throw new Error(error.message);
      // Aggregate by counselor
      const counselorMap: Record<string, any> = {};
      (leads || []).forEach((lead: any) => {
        const cId = lead.counselor_id;
        if (!counselorMap[cId]) {
          counselorMap[cId] = {
            counselorId: cId,
            counselorName: lead.counselor?.name || 'Unknown',
            counselorEmail: lead.counselor?.email || '',
            totalLeads: 0,
            convertedLeads: 0,
            hotLeads: 0,
            scoreSum: 0,
            messagesSent: 0,
          };
        }
        const c = counselorMap[cId];
        c.totalLeads++;
        const leadStage = lead.stage || lead.funnel_stage;
        if (leadStage === 'enrolled') c.convertedLeads++;
        if (lead.is_hot_lead) c.hotLeads++;
        c.scoreSum += lead.score || 0;
        c.messagesSent += lead.total_messages_sent || 0;
      });
      return Object.values(counselorMap).map((c: any) => ({
        counselorId: c.counselorId,
        counselorName: c.counselorName,
        counselorEmail: c.counselorEmail,
        leadsAssigned: c.totalLeads,
        conversions: c.convertedLeads,
        conversionRate: c.totalLeads > 0 ? Math.round((c.convertedLeads / c.totalLeads) * 100 * 10) / 10 : 0,
        messagesSent: c.messagesSent,
        hotLeads: c.hotLeads,
        averageScore: c.totalLeads > 0 ? Math.round(c.scoreSum / c.totalLeads) : 0,
        avgResponseTime: 0,
      }));
    },
    enabled: isSuperAdmin || !!institutionId
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
      const institutionId = filters?.institution_id || filters?.institutionId;
      if (!institutionId) return [];
      const supabase = createClientSupabaseClient();
      let query = (supabase as any)
        .from('admission_leads')
        .select('source, stage, funnel_stage')
        .eq('institution_id', institutionId);
      if (filters?.dateFrom) query = query.gte('created_at', filters.dateFrom);
      if (filters?.dateTo) query = query.lte('created_at', filters.dateTo);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      // Aggregate by source
      const sourceMap: Record<string, { source: string; totalLeads: number; converted: number }> = {};
      (data || []).forEach((lead: any) => {
        const src = lead.source || 'unknown';
        if (!sourceMap[src]) sourceMap[src] = { source: src, totalLeads: 0, converted: 0 };
        sourceMap[src].totalLeads++;
        const leadStage = lead.stage || lead.funnel_stage;
        if (leadStage === 'enrolled') sourceMap[src].converted++;
      });
      return Object.values(sourceMap).map(s => ({
        ...s,
        conversionRate: s.totalLeads > 0 ? Math.round((s.converted / s.totalLeads) * 100 * 10) / 10 : 0,
      }));
    },
    enabled: !!(filters?.institution_id || filters?.institutionId)
  });
}

// ============================================
// DASHBOARD HOOKS
// ============================================

export function useAdmissionDashboard(filtersOrId?: string | any) {
  // Support both string (institutionId) and object ({ institution_id }) arguments
  const institutionId = typeof filtersOrId === 'string'
    ? filtersOrId
    : filtersOrId?.institution_id;

  const { isSuperAdmin } = usePermissions();

  const query = useQuery({
    queryKey: ['admission-dashboard', institutionId],
    queryFn: async () => {
      if (!isSuperAdmin && !institutionId) {
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
        LeadService.getDashboardSummary(institutionId),
        LeadService.getFunnelSummary(institutionId)
      ]);

      return { summary, funnel: funnel.stages };
    },
    enabled: isSuperAdmin || !!institutionId
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
    isError: query.isError,
    error: query.error,
    refetchAll: query.refetch,
  };
}

export function useDashboardSummary(institutionId?: string) {
  const query = useQuery({
    queryKey: ['dashboard-summary', institutionId ?? '__all__'],
    queryFn: async () => LeadService.getDashboardSummary(institutionId),
    staleTime: 2 * 60 * 1000,
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
    queryKey: ['funnel-summary', institutionId ?? '__all__'],
    queryFn: async () => LeadService.getFunnelSummary(institutionId),
    staleTime: 2 * 60 * 1000,
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

export function useFunnelAnalyticsDashboard(filtersOrId?: string | any) {
  const institutionId = typeof filtersOrId === 'string'
    ? filtersOrId
    : filtersOrId?.institution_id || filtersOrId?.institutionId;

  const { isSuperAdmin } = usePermissions();

  const query = useQuery({
    queryKey: ['funnel-analytics-dashboard', institutionId],
    queryFn: async () => {
      if (!isSuperAdmin && !institutionId) return { enhanced: [], dropOff: [], stuckLeads: [], bottlenecks: [] };
      const supabase = createClientSupabaseClient();

      const STAGES = [
        'new', 'contacted', 'not_reachable', 'interested', 'follow_up_scheduled',
        'engaged', 'qualified', 'application_started', 'application_submitted',
        'documents_pending', 'documents_verified', 'offer_sent', 'offer_accepted', 'token_paid',
        'applied', 'offered', 'enrolled',
        'confirmed', 'declined', 'withdrew', 'expired'
      ];

      // Fetch leads with stage info
      let leadsQuery = (supabase as any)
        .from('admission_leads')
        .select('id, stage, funnel_stage, stage_changed_at, created_at, is_hot_lead, combined_score, counselor_id');
      if (institutionId) leadsQuery = leadsQuery.eq('institution_id', institutionId);
      const { data: leads } = await leadsQuery;

      // Fetch stuck leads from the view
      let stuckQuery = (supabase as any)
        .from('v_stuck_leads')
        .select('*')
        .order('days_in_stage', { ascending: false });
      if (institutionId) stuckQuery = stuckQuery.eq('institution_id', institutionId);
      const { data: stuckData, error: stuckError } = await stuckQuery;

      if (stuckError) {
        console.error('[admission] v_stuck_leads query failed:', stuckError);
      }

      const allLeads = leads || [];
      const totalLeads = allLeads.length || 1;

      // One week ago for WoW comparison
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      // Build enhanced funnel data per stage
      const enhanced = STAGES.map(stageKey => {
        const stageLeads = allLeads.filter((l: any) => (l.stage || l.funnel_stage) === stageKey);
        const leadCount = stageLeads.length;

        // Avg days in stage
        const now = Date.now();
        let totalDays = 0;
        stageLeads.forEach((l: any) => {
          const entered = l.stage_changed_at ? new Date(l.stage_changed_at).getTime() : new Date(l.created_at).getTime();
          totalDays += (now - entered) / (1000 * 60 * 60 * 24);
        });
        const avgDaysInStage = leadCount > 0 ? totalDays / leadCount : 0;

        // Stuck count (in stage > 14 days)
        const stuckCount = stageLeads.filter((l: any) => {
          const entered = l.stage_changed_at ? new Date(l.stage_changed_at).getTime() : new Date(l.created_at).getTime();
          return (now - entered) > 14 * 24 * 60 * 60 * 1000;
        }).length;

        // WoW: leads that entered this stage in the last week
        const recentLeads = stageLeads.filter((l: any) => {
          const changed = l.stage_changed_at ? new Date(l.stage_changed_at) : new Date(l.created_at);
          return changed >= oneWeekAgo;
        }).length;
        const wowChangePercent = leadCount > 0 ? (recentLeads / leadCount) * 100 : 0;

        // Alert level
        const alertLevel: 'normal' | 'warning' | 'critical' =
          avgDaysInStage > 21 || stuckCount > leadCount * 0.3 ? 'critical' :
          avgDaysInStage > 14 || stuckCount > leadCount * 0.15 ? 'warning' : 'normal';

        return {
          stage: stageKey,
          leadCount,
          avgDaysInStage,
          stuckCount,
          percentageOfTotal: (leadCount / totalLeads) * 100,
          wowChangePercent: Math.round(wowChangePercent),
          alertLevel,
        };
      });

      // Build drop-off data
      const dropOff = STAGES.map((stageKey, idx) => {
        const current = enhanced[idx]?.leadCount || 0;
        const previous = idx > 0 ? (enhanced[idx - 1]?.leadCount || 1) : totalLeads;
        const conversionRate = previous > 0 ? (current / previous) * 100 : 0;
        const dropOffRate = previous > 0 ? ((previous - current) / previous) * 100 : 0;
        const percentageReached = (current / totalLeads) * 100;
        return { stage: stageKey, conversionRate, dropOffRate, percentageReached };
      });

      // Map stuck leads from the view to expected format
      const stuckLeads = (stuckData || []).map((s: any) => ({
        leadId: s.lead_id,
        currentStage: s.current_stage,
        counselorName: s.counselor_name || null,
        daysInStage: s.days_in_stage || 0,
        combinedScore: s.combined_score || 0,
        isHotLead: s.is_hot_lead || false,
        urgencyLevel: s.urgency_level || 'low',
        suggestedAction: s.suggested_action || 'Follow up',
      }));

      // Build bottleneck alerts
      const bottlenecks = enhanced
        .filter(s => s.alertLevel !== 'normal')
        .map(s => ({
          stage: s.stage,
          issue: s.avgDaysInStage > 21 ? 'high_dwell_time' : 'high_stuck_rate',
          severity: s.alertLevel as 'warning' | 'critical',
          metric: s.avgDaysInStage > 21 ? s.avgDaysInStage : s.stuckCount,
          recommendation: s.avgDaysInStage > 21
            ? `Leads spend ${s.avgDaysInStage.toFixed(0)} days avg in ${s.stage}. Review follow-up cadence.`
            : `${s.stuckCount} leads stuck in ${s.stage}. Consider re-engagement or reassignment.`,
        }));

      return { enhanced, dropOff, stuckLeads, bottlenecks };
    },
    enabled: isSuperAdmin || !!institutionId
  });

  return {
    enhanced: query.data?.enhanced || [],
    dropOff: query.data?.dropOff || [],
    stuckLeads: query.data?.stuckLeads || [],
    bottlenecks: query.data?.bottlenecks || [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetchAll: query.refetch,
  };
}

// ============================================
// SINGLE LEAD HOOKS
// ============================================

// UUID format check to avoid querying with PPR/DRP placeholders
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useAdmissionLead(id: string) {
  const isValidId = !!id && UUID_REGEX.test(id);

  const query = useQuery({
    queryKey: ['admission-lead', id],
    queryFn: async () => {
      if (!id) return null;
      return LeadService.getLead(id);
    },
    enabled: isValidId
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
    enabled: !!leadId && UUID_REGEX.test(leadId)
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
      if (!leadId) return [];
      const supabase = createClientSupabaseClient();
      // Fetch SMS logs
      const { data: smsLogs } = await (supabase as any)
        .from('admission_sms_logs')
        .select('id, phone_number, message_content, status, sent_at, delivered_at, created_at')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(50);
      // Fetch WhatsApp logs
      const { data: waLogs } = await (supabase as any)
        .from('admission_whatsapp_logs')
        .select('id, recipient_phone, message_content, delivery_status, sent_at, delivered_at, read_at, created_at')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(50);
      // Merge and sort by created_at
      const combined = [
        ...(smsLogs || []).map((s: any) => ({
          id: s.id, channel: 'sms' as const, phone: s.phone_number, content: s.message_content,
          status: s.status, sentAt: s.sent_at, deliveredAt: s.delivered_at, createdAt: s.created_at,
        })),
        ...(waLogs || []).map((w: any) => ({
          id: w.id, channel: 'whatsapp' as const, phone: w.recipient_phone, content: w.message_content,
          status: w.delivery_status, sentAt: w.sent_at, deliveredAt: w.delivered_at, readAt: w.read_at, createdAt: w.created_at,
        })),
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      return combined;
    },
    enabled: !!leadId && UUID_REGEX.test(leadId)
  });

  return {
    history: query.data || [],
    isLoading: query.isLoading
  };
}

// useLeadAttributions is exported from use-consultants.ts — do not duplicate here

export function useFunnelHistory(filters?: any) {
  return useQuery({
    queryKey: ['funnel-history', filters],
    queryFn: async () => {
      const institutionId = filters?.institution_id || filters?.institutionId;
      const leadId = filters?.lead_id || filters?.leadId;
      if (!institutionId && !leadId) return [];
      const supabase = createClientSupabaseClient();
      let query = (supabase as any)
        .from('admission_lead_stage_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(filters?.limit || 100);
      if (leadId) query = query.eq('lead_id', leadId);
      if (filters?.from_stage) query = query.eq('from_stage', filters.from_stage);
      if (filters?.to_stage) query = query.eq('to_stage', filters.to_stage);
      if (filters?.dateFrom) query = query.gte('created_at', filters.dateFrom);
      if (filters?.dateTo) query = query.lte('created_at', filters.dateTo);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data || [];
    },
    enabled: !!(filters?.institution_id || filters?.institutionId || filters?.lead_id || filters?.leadId)
  });
}
