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

export { earningsService, EarningsService } from './earnings-service';
export type {
  EarningsWithPayment,
  EarningsFilters,
  EarningsSummary,
  RecipientTotalEarnings,
} from './earnings-service';

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
