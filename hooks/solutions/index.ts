/**
 * Solutions Hub Hooks Index
 * Purpose: Central export for all Solutions Hub React Query hooks
 *
 * This module provides comprehensive hooks for:
 * - Core: Solutions, Phases, Clients
 * - Software Module: Builders, Builder Portal, Assignments
 * - Training Module: Programs, Sessions, Cohort Members, Cohort Portal
 * - Content Module: Orders, Deliverables, Production Learners, Production Portal
 * - Discovery: Visits, Communications
 * - Financials: Payments, Earnings
 * - Publications: Publications, Contributors, Accreditation
 */

// ============================================
// CORE HOOKS
// ============================================

export {
  // Solutions
  useSolutions,
  useSolution,
  useSolutionStats,
  useCreateSolution,
  useUpdateSolution,
  useDeleteSolution,
  type SolutionFilters,
  type CreateSolutionInput,
  type UpdateSolutionInput,
} from './use-solutions';

export {
  // Phases
  usePhases,
  usePhase,
  useSolutionPhases,
  usePhaseStats,
  useNextPhaseNumber,
  useActivePhases,
  useCreatePhase,
  useUpdatePhase,
  useUpdatePhaseStatus,
  useDeletePhase,
  // Iterations (convenience wrappers)
  useCreateIteration,
  useUpdateIteration,
  // Bug Reports (convenience wrappers)
  useCreateBugReport,
  useUpdateBugReport,
  // Deployments (convenience wrappers)
  useCreateDeployment,
  // Constants
  PHASE_STATUSES,
  type PhaseStatus,
  type PhaseFilters,
  type PhaseWithDetails,
  type CreatePhaseInput,
  type UpdatePhaseInput,
  type CreateIterationInput,
  type CreateBugReportInput,
  type CreateDeploymentInput,
} from './use-phases';

export {
  // Iterations (full API)
  useIterations,
  useIteration,
  usePhaseIterations,
  useLatestIteration,
  useIterationStats,
  useNextVersionNumber,
  useCreateIteration as useCreateIterationFull,
  useUpdateIteration as useUpdateIterationFull,
  useCompleteIteration,
  useDeleteIteration,
  useAddIterationFeedback,
  type IterationFilters,
  type IterationWithBugs,
  type CreateIterationInput as CreateIterationServiceInput,
  type UpdateIterationInput,
} from './use-iterations';

export {
  // Bugs (full API)
  useBugs,
  useBug,
  usePhaseBugs,
  useIterationBugs,
  useBugStats,
  useOpenBugCount,
  useCreateBug,
  useUpdateBug,
  useResolveBug,
  useCloseBug,
  useReopenBug,
  useDeleteBug,
  useChangeBugSeverity,
  useChangeBugStatus,
  // Constants
  BUG_SEVERITY_LABELS,
  BUG_STATUS_LABELS,
  type BugFilters,
  type BugWithDetails,
  type BugSeverity,
  type BugStatus,
  type CreateBugInput,
  type UpdateBugInput,
} from './use-bugs';

export {
  // Deployments (full API)
  useDeployments,
  useDeployment,
  usePhaseDeployments,
  useLatestDeployment,
  useDeploymentStats,
  useActiveDeploymentUrl,
  useHasActiveDeployments,
  useCreateDeployment as useCreateDeploymentFull,
  useUpdateDeployment,
  useDeactivateDeployment,
  useRollbackDeployment,
  useDeleteDeployment,
  useDeployToStaging,
  useDeployToProduction,
  // Constants
  DEPLOYMENT_ENVIRONMENTS,
  DEPLOYMENT_STATUS_LABELS,
  type DeploymentFilters,
  type DeploymentWithPhase,
  type DeploymentEnvironment,
  type DeploymentStatus,
  type CreateDeploymentInput as CreateDeploymentServiceInput,
  type UpdateDeploymentInput as UpdateDeploymentServiceInput,
} from './use-deployments';

export {
  // Clients
  useClients,
  useClient,
  useClientIndustries,
  useCreateClient,
  useUpdateClient,
  useDeactivateClient,
  useReactivateClient,
  useIncrementReferralCount,
  type SourceType,
  type PartnerStatus,
  type ClientFilters,
  type CreateClientInput,
  type UpdateClientInput,
} from './use-clients';

// ============================================
// SOFTWARE MODULE HOOKS
// ============================================

export {
  // Builders
  useBuilders,
  useBuilder,
  useBuilderStats,
  useAvailableBuildersForPhase,
  useCreateBuilder,
  useUpdateBuilder,
  useDeleteBuilder,
  // Skills
  useAddBuilderSkill,
  useUpdateBuilderSkill,
  useRemoveBuilderSkill,
  // Assignments
  usePendingAssignmentRequests,
  useAssignmentsByStatus,
  useCheckAssignmentApproval,
  useRequestAssignment,
  useApproveAssignment,
  useStartAssignment,
  useCompleteAssignment,
  useWithdrawAssignment,
  type BuilderRole,
  type AssignmentStatus,
  type BuilderFilters,
  type CreateBuilderInput,
  type UpdateBuilderInput,
  type AddSkillInput,
  type CreateAssignmentInput,
} from './use-builders';

export {
  // Builder Portal
  useBuilderProfile,
  usePortalOverview,
  useMyAssignments,
  useAvailablePhases,
  useMySkills,
  useMyBuilderEarnings,
  useClaimPhase,
  useStartPhaseWork,
  useCompletePhaseWork,
  useWithdrawFromPhase,
  useAddMySkill,
  useUpdateMySkillProficiency,
  useRemoveMySkill,
} from './use-builder-portal';

// ============================================
// TRAINING MODULE HOOKS
// ============================================

export {
  // Training Programs
  useTrainingPrograms,
  useTrainingProgram,
  useTrainingProgramBySolution,
  useCreateTrainingProgram,
  useUpdateTrainingProgram,
  useDeleteTrainingProgram,
  // Training Sessions
  useTrainingSessions,
  useTrainingSession,
  useSessionsByProgram,
  useCanSelfClaimSession,
  useUpcomingTrainingSessions,
  useCreateTrainingSession,
  useUpdateTrainingSession,
  useDeleteTrainingSession,
  useClaimSession,
  useAssignSession,
  useRemoveAssignment,
  useCompleteSession,
  // Cohort Members
  useCohortMembers,
  useCohortMember,
  useCohortMemberByUser,
  useCohortMemberStats,
  useAvailableSessionsForMember,
  useCohortMemberAssignments,
  useCreateCohortMember,
  useUpdateCohortMember,
  useDeleteCohortMember,
  useLevelUpCohortMember,
  useAddCohortMemberEarnings,
  useUpdateCohortAssignment,
  // Helper functions
  getLevelInfo,
  getTrackDisplayLabel,
  getProgramTypeLabel,
  getSessionStatusInfo,
  // Constants
  PROGRAM_TYPE_LABELS,
  TRACK_LABELS,
  LOCATION_PREFERENCE_LABELS,
  SESSION_STATUS_INFO,
  COHORT_LEVELS,
  LEVEL_COLORS,
  // Types
  type ProgramType,
  type CohortLevel,
  type CohortRole,
  type SessionStatus,
  type TrainingProgramFilters,
  type CreateTrainingProgramInput,
  type UpdateTrainingProgramInput,
  type TrainingSessionFilters,
  type CreateTrainingSessionInput,
  type UpdateTrainingSessionInput,
  type CohortMemberFilters,
  type CreateCohortMemberInput,
  type UpdateCohortMemberInput,
} from './use-training';

export {
  // Cohort Portal
  useCohortProfile,
  useCohortMemberById,
  useAvailableSessions,
  useMySchedule,
  useUpcomingSessions,
  useCompletedSessions,
  useMyCohortEarnings,
  useLevelProgress,
  useDashboardStats,
  useClaimSessionMutation,
  useWithdrawFromSession,
  useRequestLevelUp,
} from './use-cohort-portal';

// ============================================
// CONTENT MODULE HOOKS
// ============================================

export {
  // Content Orders
  useContentOrders,
  useContentOrder,
  useContentOrderBySolution,
  useOrdersByDivision,
  useContentOrderStats,
  useCreateContentOrder,
  useUpdateContentOrder,
  useDeleteContentOrder,
  // Deliverables
  useDeliverables,
  useDeliverable,
  useDeliverablesByOrder,
  useCreateDeliverable,
  useUpdateDeliverable,
  useDeleteDeliverable,
  useSubmitForReview,
  useRequestRevision,
  useApproveDeliverable,
  useRejectDeliverable,
  useDeliverableStats,
  useMarkDelivered,
  type ContentOrderType,
  type ContentDivision,
  type DeliverableStatus,
  type ContentOrderFilters,
  type CreateContentOrderInput,
  type UpdateContentOrderInput,
  type DeliverableFilters,
  type CreateDeliverableInput,
  type UpdateDeliverableInput,
} from './use-content';

export {
  // Production Portal & Learners
  useLearnerByUserId,
  useProductionLearner,
  useProductionLearners,
  useMyStats,
  useProductionLearnerStats,
  useAvailableWork,
  useAllAvailableWork,
  useMyWork,
  useMyActiveWork,
  useMyProductionEarnings,
  useDeliverableForSubmission,
  useClaimWork,
  useSubmitWork,
  useCompleteAssignment as useCompleteProductionAssignment,
  useCreateProductionLearner,
  useUpdateProductionLearner,
  useDeleteProductionLearner,
  useAddLearnerEarnings,
  useUpdateLearnerSkillLevel,
  type ProductionLearnerFilters,
  type CreateProductionLearnerInput,
  type UpdateProductionLearnerInput,
  type SkillLevel,
} from './use-production-portal';

// ============================================
// MOU HOOKS
// ============================================

export {
  // MOUs
  useMous,
  useMou,
  useMouBySolution,
  useCreateMou,
  useUpdateMou,
  useDeleteMou,
  useUpdateMouStatus,
  // Constants
  MOU_STATUS_LABELS,
  // Types
  type MouStatus,
  type MouFilters,
  type MouWithSolution,
  type CreateMouInput,
  type UpdateMouInput,
} from './use-mous';

// ============================================
// PROSPECTS & PIPELINE HOOKS
// ============================================

export {
  useProspects,
  useProspect,
  useProspectStats,
  usePipelineBoard,
  useProspectActivities,
  useCreateProspect,
  useUpdateProspect,
  useUpdatePipelineStage,
  useDeleteProspect,
  useLogProspectActivity,
  type ProspectFilters,
  type UpdateProspectInput,
} from './use-prospects';

// ============================================
// DISCOVERY HOOKS
// ============================================

export {
  // Discovery Visits
  useDiscoveryVisits,
  useDiscoveryVisit,
  useClientDiscoveryVisits,
  useRecentDiscoveryVisits,
  useDiscoveryVisitStats,
  useCreateDiscoveryVisit,
  useUpdateDiscoveryVisit,
  useDeleteDiscoveryVisit,
  useLinkVisitToResult,
  // Communications
  useCommunications,
  useCommunication,
  useClientCommunications,
  useSolutionCommunications,
  useCreateCommunication,
  useUpdateCommunication,
  useDeleteCommunication,
  // Constants
  COMMUNICATION_TYPE_LABELS,
  COMMUNICATION_DIRECTION_LABELS,
  type CommunicationType,
  type CommunicationDirection,
  type DiscoveryVisitFilters,
  type CreateDiscoveryVisitInput,
  type UpdateDiscoveryVisitInput,
  type CommunicationFilters,
  type CreateCommunicationInput,
  type UpdateCommunicationInput,
  type DiscoveryVisit,
  type ClientCommunication,
} from './use-discovery';

// ============================================
// FINANCIAL HOOKS
// ============================================

export {
  // Payments
  usePayments,
  usePayment,
  usePaymentsBySolution,
  usePaymentStats,
  useMonthlyBatch,
  useRevenueSplitModels,
  useCreatePayment,
  useUpdatePayment,
  useDeletePayment,
  useFlagPayment,
  useProcessAllPendingSplits,
  useCalculateAndDistributeSplits,
  useUpdateSplitModel,
  useCalculateRevenueSplits,
  useGetSplitType,
  type PaymentType,
  type PaymentStatus,
  type PaymentFilters,
  type PaymentStats,
  type PaymentWithDetails,
  type MonthlyBatchSummary,
  type SplitType,
  type CalculatedSplit,
  type CreatePaymentInput,
  type UpdatePaymentInput,
} from './use-payments';

export {
  // Earnings
  useEarnings,
  useEarningsByRecipient,
  useEarningsSummary,
  useEarningsStats,
  useRecipientTotalEarnings,
  useDepartmentEarnings,
  useMonthlyEarningsReport,
  useCreateEarningEntry,
  useUpdateEarningsStatus,
  useBulkUpdateEarningsStatus,
  useApprovePaymentEarnings,
  useMarkEarningsAsPaid,
  // Utility functions
  getRecipientTypeDisplayName,
  getEarningsStatusColor,
  formatEarningsAmount,
  type RecipientType,
  type EarningsStatus,
  type EarningsFilters,
  type CreateEarningInput,
  type EarningsStats,
  type DepartmentEarnings,
  type MonthlyEarningsReport,
  type EarningsWithPayment,
  type EarningsSummary,
  type RecipientTotalEarnings,
} from './use-earnings';

export {
  // Revenue Split Models
  useRevenueSplitModels as useAllRevenueSplitModels,
  useRevenueSplitModel,
  useDefaultRevenueSplitModel,
  useRevenueSplitModelByType,
  useSplitConfig,
  useCreateRevenueSplitModel,
  useUpdateRevenueSplitModel,
  useDeleteRevenueSplitModel,
  // Revenue Split Calculations
  useCalculateRevenueSplit,
  useCalculateRevenueSplitForSolution,
  useRevenueSplitPreview,
  useSplitTypeHelpers,
  // Utility functions
  formatSplitDescription,
  validatePercentages,
  // Constants
  DEFAULT_REVENUE_SPLITS,
  RECIPIENT_DISPLAY_NAMES,
  SPLIT_TYPE_LABELS,
  type SplitConfig,
  type CreateRevenueSplitModelInput,
  type UpdateRevenueSplitModelInput,
  type RevenueSplitCalculation,
  type RevenueSplitModel,
} from './use-revenue-splits';

// ============================================
// PUBLICATIONS & ACCREDITATION HOOKS
// ============================================

export {
  // Publications
  usePublications,
  usePublication,
  usePublicationsBySolution,
  usePublicationStats,
  useContributors,
  useCreatePublication,
  useUpdatePublication,
  useDeletePublication,
  useAddContributor,
  useRemoveContributor,
  // Accreditation
  useAccreditationMetrics,
  useNIRFMetrics,
  useNAACCriteria,
  // Constants
  PAPER_TYPE_LABELS,
  PAPER_TYPE_CONFIG,
  JOURNAL_TYPE_LABELS,
  PUBLICATION_STATUS_LABELS,
  PUBLICATION_STATUS_CONFIG,
  type PaperType,
  type JournalType,
  type PublicationStatus,
  type CreditType,
  type PublicationFilters,
  type CreatePublicationInput,
  type UpdatePublicationInput,
  type AddContributorInput,
  type AccreditationMetricFilters,
  type Publication,
  type PublicationContributor,
  type PublicationWithSolution,
  type PublicationStats,
  type NIRFMetrics,
  type NAACCriteria,
  type AccreditationMetric,
} from './use-publications';

// ============================================
// CLIENT PORTAL HOOKS
// ============================================

export {
  // Client Profile
  useClientProfile,
  useCurrentClient,
  // Dashboard
  useClientDashboardStats,
  // Solutions
  useClientSolutions,
  useClientSolution,
  // Deliverables
  useClientDeliverables,
  // Payments
  useClientPayments,
  useClientPaymentSummary,
  // Communications
  useClientCommunicationsQuery,
  // Mutations
  useApproveClientDeliverable,
  useRequestClientDeliverableRevision,
  useSendClientMessage,
  // Types
  type ClientPortalProfile,
  type ClientDashboardStats,
  type ClientSolutionWithDetails,
  type ClientDeliverableWithOrder,
  type PaymentWithSolution,
} from './use-client-portal';

// ============================================
// UNIFIED EARNINGS HOOKS
// ============================================

export {
  // Unified Earnings
  useUnifiedEarnings,
  useEarningsSummary as useUnifiedEarningsSummary,
  usePayoutHistory,
  // Helper functions
  getTalentTypeLabel,
  getTalentTypeColor,
  getTalentTypeIcon,
  formatEarningsAmount as formatUnifiedEarningsAmount,
  getEarningsStatusVariant,
  getEarningsStatusLabel,
  // Types
  type TalentType,
  type UnifiedEarningsFilters,
  type UnifiedEarningsEntry,
  type EarningsSummary as UnifiedEarningsSummaryType,
  type PayoutHistoryEntry,
} from './use-unified-earnings';

// ============================================
// PRODUCTS & TRL HOOKS
// ============================================

export {
  // Products
  useProducts,
  useProduct,
  useProductStats,
  useRetainedIPSolutions,
  useTRLHistory,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useArchiveProduct,
  useUpdateProductStatus,
  // TRL Management
  useUpdateTRL,
  // Validations
  useProductValidations,
  useAddValidation,
  useUpdateValidation,
  useDeleteValidation,
  // RDIF
  useRDIFPrerequisites,
  useRDIFReadinessScore,
  useThreeYearBridgeStatus,
  useNextRDIFMilestones,
  useUpdatePrerequisite,
  // Constants
  PRODUCT_STATUSES,
  TRL_LEVELS,
  DOMAIN_LABELS,
  PATENT_STATUS_LABELS,
  VALIDATION_TYPE_LABELS,
  RDIF_PREREQUISITE_KEYS,
  BRIDGE_YEAR_THRESHOLDS,
  // Types
  type ProductFilters,
  type ProductWithValidations,
  type SHProduct,
  type SHProductValidation,
  type SHRDIFPrerequisite,
  type ProductStats,
  type ProductStatus,
  type ProductDomain,
  type RDIFSector,
  type PatentStatus,
  type ValidationType,
  type ValidationStatus,
  type RDIFReadinessResult,
  type ThreeYearBridgeStatus,
  type RDIFMilestone,
  type CreateProductInput,
  type UpdateProductInput,
  type CreateValidationInput,
  type UpdateValidationInput,
  type UpdatePrerequisiteInput,
} from './use-products';
