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
  useCreatePhase,
  useUpdatePhase,
  useDeletePhase,
  // Iterations
  useCreateIteration,
  useUpdateIteration,
  // Bug Reports
  useCreateBugReport,
  useUpdateBugReport,
  // Deployments
  useCreateDeployment,
  type PhaseStatus,
  type PhaseFilters,
  type CreatePhaseInput,
  type UpdatePhaseInput,
  type CreateIterationInput,
  type CreateBugReportInput,
  type CreateDeploymentInput,
} from './use-phases';

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
  useCreateCohortMember,
  useUpdateCohortMember,
  useDeleteCohortMember,
  useLevelUpCohortMember,
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
  // Production Portal
  useLearnerByUserId,
  useMyStats,
  useAvailableWork,
  useAllAvailableWork,
  useMyWork,
  useMyActiveWork,
  useMyProductionEarnings,
  useDeliverableForSubmission,
  useClaimWork,
  useSubmitWork,
} from './use-production-portal';

// ============================================
// DISCOVERY HOOKS
// ============================================

export {
  // Discovery Visits
  useDiscoveryVisits,
  useDiscoveryVisit,
  useClientDiscoveryVisits,
  useCreateDiscoveryVisit,
  useUpdateDiscoveryVisit,
  useDeleteDiscoveryVisit,
  useLinkVisitToResult,
  // Communications
  useCommunications,
  useCommunication,
  useClientCommunications,
  useCreateCommunication,
  useUpdateCommunication,
  useDeleteCommunication,
  type CommunicationType,
  type CommunicationDirection,
  type DiscoveryVisitFilters,
  type CreateDiscoveryVisitInput,
  type UpdateDiscoveryVisitInput,
  type CommunicationFilters,
  type CreateCommunicationInput,
  type UpdateCommunicationInput,
} from './use-discovery';

// ============================================
// FINANCIAL HOOKS
// ============================================

export {
  // Payments
  usePayments,
  usePayment,
  usePaymentStats,
  useMonthlyBatch,
  useCreatePayment,
  useUpdatePayment,
  useDeletePayment,
  useFlagPayment,
  useAutoProcessPayments,
  type PaymentType,
  type PaymentStatus,
  type PaymentFilters,
  type CreatePaymentInput,
  type UpdatePaymentInput,
} from './use-payments';

export {
  // Earnings
  useEarnings,
  useEarningsByRecipient,
  useEarningsSummary,
  useRecipientTotalEarnings,
  useDepartmentEarnings,
  useMonthlyEarningsReport,
  useUpdateEarningsStatus,
  useBulkUpdateEarningsStatus,
  useApprovePaymentEarnings,
  useMarkEarningsAsPaid,
  type RecipientType,
  type EarningsStatus,
  type EarningsFilters,
} from './use-earnings';

// ============================================
// PUBLICATIONS & ACCREDITATION HOOKS
// ============================================

export {
  // Publications
  usePublications,
  usePublication,
  usePublicationStats,
  useContributors,
  useCreatePublication,
  useUpdatePublication,
  useDeletePublication,
  useAddContributor,
  useRemoveContributor,
  // Accreditation
  useAccreditationMetrics,
  type PaperType,
  type JournalType,
  type PublicationStatus,
  type CreditType,
  type PublicationFilters,
  type CreatePublicationInput,
  type UpdatePublicationInput,
  type AddContributorInput,
  type AccreditationMetricFilters,
} from './use-publications';
