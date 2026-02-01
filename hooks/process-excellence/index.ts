// hooks/process-excellence/index.ts
// Process Excellence module hooks - barrel export

// Process Definitions
export {
  processDefinitionKeys,
  useProcessDefinitions,
  useProcessDefinition,
  useCreateProcessDefinition,
  useUpdateProcessDefinition,
  useDeleteProcessDefinition,
  useActiveProcessDefinitions
} from './use-process-definitions';

// Process Instances
export {
  processInstanceKeys,
  useProcessInstances,
  useProcessInstance,
  useProcessInstanceByReference,
  useStartProcessInstance,
  useAdvanceStage,
  useCompleteProcess,
  useActiveProcessInstances,
  useSLABreachedInstances
} from './use-process-instances';

// Waste Incidents
export {
  wasteIncidentKeys,
  useWasteIncidents,
  useWasteIncident,
  useReportWaste,
  useUpdateWasteIncident,
  useResolveWasteIncident,
  useDeleteWasteIncident,
  useWasteAnalytics,
  useOpenWasteIncidents,
  useWasteIncidentsByCategory
} from './use-waste-incidents';

// Process Audits
export {
  processAuditKeys,
  useProcessAudits,
  useProcessAudit,
  useCreateProcessAudit,
  useUpdateProcessAudit,
  useFinalizeProcessAudit,
  useDeleteProcessAudit,
  useRecentProcessAudits,
  useProcessAuditsByRating,
  useDraftProcessAudits
} from './use-process-audits';

// Metrics & Dashboard
export {
  processMetricsKeys,
  useProcessMetrics,
  useProcessExcellenceDashboard,
  useProcessMetricsByCategory,
  useProcessMetricsForProcess,
  useProcessMetricsForPeriod
} from './use-process-metrics';
