// ============================================================================
// OKR Services Index
// Central export for all OKR-related services
// ============================================================================

export { OKRObjectiveService } from './okr-objective-service';
export { OKRKeyResultService } from './okr-key-result-service';
export { OKRCheckInService } from './okr-check-in-service';
export { OKRComplianceService } from './okr-compliance-service';
export { OKRComplianceAdminService } from './okr-compliance-admin-service';
export { OKRTeamService } from './okr-team-service';
export { OKRLearnerService } from './okr-learner-service';
export { OKRAutoTrackService } from './okr-auto-track-service';
export { OKRDependencyService, OKRTaskService, OKRRiskService } from './okr-tier1-service';
export { OKRNotificationService } from './okr-notification-service';
export { OKRSocialService } from './okr-social-service';
export { OKRAnalyticsService } from './okr-analytics-service';

// Badge Calculator - Smart badge calculation based on progress vs. time
export {
  BadgeCalculator,
  calculateBadge,
  getQuickBadgeStatus,
  getBadgeDisplayInfo,
  getCurrentWeek,
  getWeekStart,
  getTimeProgressPercent,
  isCheckInOverdue,
  getDaysUntilDeadline,
  calculateOverallProgress,
  calculateExpectedProgress
} from './okr-badge-calculator';

export type {
  BadgeCalculationInput,
  BadgeCalculationResult,
  WeekInfo
} from './okr-badge-calculator';
