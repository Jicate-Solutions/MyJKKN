// lib/services/solutions/index.ts
// Solutions Hub Service Layer - Exports all services

// ============================================
// TYPE EXPORTS
// ============================================
export * from './types';

// ============================================
// CORE SERVICES
// ============================================
export { solutionsService, SolutionsService } from './solutions-service';
export type {
  SolutionWithClient,
  SolutionFilters,
  UpdateSolutionInput,
  SolutionStats,
} from './solutions-service';

export { phasesService, PhasesService, PHASE_STATUSES } from './phases-service';
export type {
  PhaseWithDetails,
  PhaseFilters,
  UpdatePhaseInput,
  CreateIterationInput,
  CreateBugReportInput,
  CreateDeploymentInput,
} from './phases-service';

export { clientsService, ClientsService } from './clients-service';
export type {
  ClientFilters,
  UpdateClientInput,
  ClientStats,
} from './clients-service';

// ============================================
// SOFTWARE MODULE SERVICES
// ============================================
export { buildersService, BuildersService, APPROVAL_THRESHOLDS } from './builders-service';
export type {
  BuilderWithDetails,
  BuilderAssignmentWithPhase,
  BuilderFilters,
  UpdateBuilderInput,
  AddSkillInput,
  CreateAssignmentInput as CreateBuilderAssignmentInput,
  ApprovalResult,
} from './builders-service';

export { builderPortalService, BuilderPortalService } from './builder-portal-service';
export type {
  BuilderWithDetails as BuilderPortalProfile,
  BuilderAssignmentWithPhase as BuilderPortalAssignment,
  AvailablePhase,
  BuilderEarningsSummary,
  PortalOverview,
} from './builder-portal-service';

export { iterationsService, IterationsService } from './iterations-service';
export type {
  IterationWithBugs,
  IterationFilters,
  CreateIterationInput as CreateIterationServiceInput,
  UpdateIterationInput,
} from './iterations-service';

export { bugsService, BugsService, BUG_SEVERITY_LABELS, BUG_STATUS_LABELS } from './bugs-service';
export type {
  BugSeverity,
  BugStatus,
  BugWithDetails,
  BugFilters,
  CreateBugInput,
  UpdateBugInput,
} from './bugs-service';

export {
  deploymentsService,
  DeploymentsService,
  DEPLOYMENT_ENVIRONMENTS,
  DEPLOYMENT_STATUS_LABELS,
} from './deployments-service';
export type {
  DeploymentEnvironment,
  DeploymentStatus,
  DeploymentWithPhase,
  DeploymentFilters,
  CreateDeploymentInput as CreateDeploymentServiceInput,
  UpdateDeploymentInput as UpdateDeploymentServiceInput,
} from './deployments-service';

// ============================================
// TRAINING MODULE SERVICES
// ============================================
export {
  trainingService,
  TrainingService,
  PROGRAM_TYPE_LABELS,
  TRACK_LABELS,
  LOCATION_PREFERENCE_LABELS,
  SESSION_STATUS_INFO,
} from './training-service';
export type {
  TrainingProgramWithDetails,
  TrainingSessionWithDetails,
  TrainingProgramFilters,
  TrainingSessionFilters,
  CreateTrainingProgramInput,
  UpdateTrainingProgramInput,
  CreateTrainingSessionInput,
  UpdateTrainingSessionInput,
} from './training-service';

export { cohortService, CohortService, COHORT_LEVELS, LEVEL_COLORS } from './cohort-service';
export type {
  CohortMemberWithDetails,
  CohortMemberFilters,
  CreateCohortMemberInput,
  UpdateCohortMemberInput,
} from './cohort-service';

// ============================================
// CONTENT MODULE SERVICES
// ============================================
export {
  contentService,
  ContentService,
  getApprovalLevel,
  shouldFlagToMD,
} from './content-service';
export type {
  ContentOrderWithSolution,
  ContentDeliverableWithDetails,
  ContentOrderFilters,
  DeliverableFilters,
  CreateContentOrderInput,
  UpdateContentOrderInput,
  CreateDeliverableInput,
  UpdateDeliverableInput,
} from './content-service';

export { productionService, ProductionService, canSelfClaim } from './production-service';
export type {
  ProductionLearnerWithAssignments,
  ProductionAssignmentWithDetails,
  ProductionLearnerFilters,
  CreateProductionLearnerInput,
  UpdateProductionLearnerInput,
  CreateProductionAssignmentInput,
} from './production-service';

// ============================================
// MOU SERVICES
// ============================================
export { mouService, MouService, MOU_STATUS_LABELS } from './mou-service';
export type {
  MouWithSolution,
  MouFilters,
} from './mou-service';

// ============================================
// PROSPECTS & PIPELINE
// ============================================
export {
  prospectsService,
  ProspectsService,
  PIPELINE_STAGE_LABELS,
  PIPELINE_STAGE_COLORS,
  ACTIVE_STAGES,
} from './prospects-service';
export type {
  ProspectFilters,
  UpdateProspectInput,
} from './prospects-service';

// ============================================
// SUPPORT SERVICES
// ============================================
export {
  discoveryService,
  DiscoveryService,
  COMMUNICATION_TYPE_LABELS,
  COMMUNICATION_DIRECTION_LABELS,
} from './discovery-service';
export type {
  DiscoveryVisitFilters,
  CommunicationFilters,
  CreateDiscoveryVisitInput,
  UpdateDiscoveryVisitInput,
  CreateCommunicationInput,
  UpdateCommunicationInput,
} from './discovery-service';

export {
  paymentsService,
  PaymentsService,
  REVENUE_SPLIT_CONFIGS,
  RECIPIENT_NAMES,
} from './payments-service';
export type {
  PaymentWithDetails,
  PaymentFilters,
  UpdatePaymentInput,
  MonthlyBatchSummary,
  SplitType,
  CalculatedSplit,
  RevenueSplitResult,
} from './payments-service';

export { earningsService, EarningsService, getRecipientDisplayName } from './earnings-service';
export type {
  EarningsWithPayment,
  EarningsFilters,
  EarningsSummary,
  RecipientTotalEarnings,
} from './earnings-service';

export { unifiedEarningsService, UnifiedEarningsService } from './unified-earnings-service';
export type {
  TalentType,
  UnifiedEarningsEntry,
  EarningsSummary as UnifiedEarningsSummary,
  PayoutHistoryEntry,
  UnifiedEarningsFilters,
} from './unified-earnings-service';

export {
  revenueSplitService,
  RevenueSplitService,
  DEFAULT_REVENUE_SPLITS,
  RECIPIENT_DISPLAY_NAMES,
} from './revenue-split-service';
export type {
  SplitConfig,
  CreateRevenueSplitModelInput,
  UpdateRevenueSplitModelInput,
  CalculatedSplit as RevenueSplitCalculatedSplit,
  RevenueSplitCalculation,
} from './revenue-split-service';

export { publicationsService, PublicationsService } from './publications-service';
export type {
  PublicationWithSolution,
  PublicationFilters,
  CreatePublicationInput,
  UpdatePublicationInput,
  AddContributorInput,
  PublicationStats,
  NIRFMetrics,
  NAACCriteria,
} from './publications-service';

export { notificationsService, NotificationsService } from './notifications-service';
export type {
  NotificationFilters,
  CreateNotificationInput,
} from './notifications-service';

// ============================================
// PRODUCTS & TRL MODULE SERVICES
// ============================================
export {
  productsService,
  ProductsService,
  PRODUCT_STATUSES,
  TRL_LEVELS,
  DOMAIN_LABELS,
  PATENT_STATUS_LABELS,
  VALIDATION_TYPE_LABELS,
} from './products-service';
export type {
  ProductDomain,
  RDIFSector,
  PatentStatus,
  ProductStatus,
  ValidationStatus,
  ValidationType,
  SHProduct,
  SHProductValidation,
  SHRDIFPrerequisite,
  ProductWithValidations,
  ProductFilters,
  CreateProductInput,
  UpdateProductInput,
  CreateValidationInput,
  UpdateValidationInput,
  UpdatePrerequisiteInput,
  ProductStats,
} from './products-service';

export {
  rdifService,
  RDIFService,
  RDIF_PREREQUISITE_KEYS,
  BRIDGE_YEAR_THRESHOLDS,
} from './rdif-service';
export type {
  RDIFReadinessResult,
  ThreeYearBridgeStatus,
  RDIFMilestone,
} from './rdif-service';

// ============================================
// COMPLIANCE / GRADUATION GATE
// ============================================
export { ComplianceService } from './compliance-service';

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format currency in INR
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format date in Indian format
 */
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(date));
}

/**
 * Format date with time
 */
export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}
