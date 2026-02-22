// Admission Services Index

export { AdmissionService } from './admission-service';
export { AdmissionAIService } from './admission-ai-service';
export { ConsultantService } from './consultant-service';
export { ScoringRulesService } from './scoring-rules-service';
export type {
  ScoringRule,
  ScoringRuleConfig,
  ScoringCriterion,
  ScoreRange,
  CreateScoringRuleInput,
  UpdateScoringRuleInput,
} from './scoring-rules-service';
export { AssignmentRulesService } from './assignment-rules-service';
export type {
  AssignmentRule,
  AssignmentRuleType,
  AssignmentCriterion,
  AssignmentAction,
  AssignmentStats,
  CreateAssignmentRuleInput,
  UpdateAssignmentRuleInput,
} from './assignment-rules-service';
export { CommunicationTemplatesService } from './communication-templates-service';
export type {
  CommunicationTemplate,
  TemplateType,
  TemplateVariable,
  TemplateFilters,
  TemplateStats,
  CreateTemplateInput,
  UpdateTemplateInput,
} from './communication-templates-service';
export { WorkflowsService } from './workflows-service';
export type {
  Workflow,
  WorkflowTrigger,
  WorkflowTriggerType,
  WorkflowCondition,
  WorkflowAction,
  WorkflowActionType,
  WorkflowExecution,
  WorkflowExecutionStatus,
  WorkflowStats,
  CreateWorkflowInput,
  UpdateWorkflowInput,
} from './workflows-service';
export { ActivityService } from './activity-service';
export type {
  ActivityType,
  LeadActivity,
  StageHistoryEntry,
  TimelineEntry,
  CreateActivityInput,
  ActivityStats,
} from './activity-service';
export { CampaignProcessorService } from './campaign-processor-service';
export type {
  CampaignStepStatus,
  CampaignStepType,
  CampaignStepConfig,
  CampaignCondition,
  CampaignLogType,
  QueuedStep,
  CampaignLog,
  QueueStepInput,
  QueueStats,
  QueueFilters,
  LogFilters,
} from './campaign-processor-service';
export { SMSCampaignService } from './sms-campaign-service';
export type {
  SMSProvider,
  SMSDeliveryStatus,
  SMSLog,
  SendSMSInput,
  BulkSMSInput,
  SMSSendResult,
  SMSBulkResult,
  SMSWebhookPayload,
  SMSCampaignStats,
  SMSLogFilters,
} from './sms-campaign-service';
export { WhatsAppCampaignService } from './whatsapp-campaign-service';
export type {
  WhatsAppDeliveryStatus,
  WhatsAppMessage,
  SendCampaignMessageInput,
  SendCampaignMessageResult,
  WhatsAppMessageFilters,
  WhatsAppCampaignStats,
  WebhookPayload,
} from './whatsapp-campaign-service';
export { DripExecutorService } from './drip-executor-service';
export type {
  DripSequenceStatus,
  DripStepStatus,
  DripSequence,
  DripScheduleStep,
  DripExecutionLog,
  StartDripSequenceInput,
  DripSequenceFilters,
  DripSequenceStats,
  PendingDripStep,
} from './drip-executor-service';
export { CampaignMonitoringService } from './campaign-monitoring-service';
export type {
  CampaignStats,
  DeliveryMetrics,
  ActiveSequence,
  ExecutionLog,
  CampaignDetail,
  SequenceStep,
  RealtimeUpdate,
} from './campaign-monitoring-service';
export { AIResponseService } from './ai-response-service';
export type {
  CommunicationChannel,
  ResponseIntent,
  LeadContext,
  LeadInteraction,
  GenerateResponseInput,
  SuggestedResponse,
  GenerateResponseResult,
  PersonalizeTemplateInput,
  PersonalizedTemplate,
} from './ai-response-service';
export { LeadScoringEngineService } from './lead-scoring-engine-service';
export type {
  LeadScore,
  ScoreBreakdown,
  EngagementBreakdownItem,
  QualityBreakdownItem,
  ScoreFactors,
  CalculateScoreResult,
  LeadScoreFilters,
  BulkScoreResult,
} from './lead-scoring-engine-service';
export { DailyBriefingService } from './daily-briefing-service';
export type {
  DailyBriefing,
  BriefingContent,
  BriefingPriority,
  BriefingHotLead,
  BriefingScheduledItem,
  BriefingMetrics,
  BriefingYesterdayRecap,
  TeamPerformance,
  InstitutionMetrics,
  BriefingRole,
} from './daily-briefing-service';
export { BriefingDeliveryService } from './briefing-delivery-service';
export type {
  BriefingNotification,
  BriefingMetadata,
  ActionItem,
  Briefing,
  BriefingContent as DeliveryBriefingContent,
  CreateBriefingInput,
  DeliverBriefingInput,
  BriefingNotificationFilters,
} from './briefing-delivery-service';
export { InsightActionsService } from './insight-actions-service';
export type {
  InsightActionType,
  ActionStatus,
  ActionParams,
  ActionContext,
  AvailableAction,
  ActionExecution,
  ActionResult,
  ActionResultDetail,
  ActionArtifact,
  BulkActionInput,
  ActionFilters,
} from './insight-actions-service';
export { AIInsightsService } from './ai-insights-service';
export type {
  InsightType,
  InsightPriority,
  InsightAction,
  AIInsight,
  InsightFilters,
  TrendData,
  Recommendation,
  Anomaly,
} from './ai-insights-service';
export { AgenticQueryService } from './agentic-query-service';
export type {
  QueryIntent,
  QueryFilter,
  TimeRange,
  OrderBy,
  QueryStep,
  AgenticQueryResult,
  QueryHistoryEntry,
} from './agentic-query-service';

export { GDPIService } from './gdpi-service';
export type {
  GDPISession,
  GDPIEvaluator,
  GDPICandidate,
  GDPIScore,
  GDPISessionType,
  GDPISessionStatus,
  GDPICandidateStatus,
  GDPIRecommendation,
  GDPIEvaluatorRole,
  GDPISessionFilters,
  GDPIStats,
  CreateSessionInput,
  UpdateSessionInput,
  ScoreInput,
} from './gdpi-service';
export { GD_CRITERIA, PI_CRITERIA } from './gdpi-service';

// Simple DateRange type for admission services
export interface DateRange {
  from: string;
  to: string;
  label?: string;
}
