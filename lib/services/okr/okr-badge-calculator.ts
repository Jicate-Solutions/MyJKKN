// ============================================================================
// OKR Badge Calculator
// Smart badge calculation based on progress vs. expected progress
// ============================================================================

import type { UserBadge, OKRObjective, OKRUserStatus } from '@/types/okr';

// ============================================================================
// TYPES
// ============================================================================

export interface BadgeCalculationInput {
  lastCheckInDate: Date | null;
  objectives: OKRObjective[];
  consecutiveMissedWeeks: number;
}

export interface BadgeCalculationResult {
  badge: UserBadge;
  reason: string;
  details: {
    timeProgress: number;
    actualProgress: number;
    delta: number;
    isCheckInOverdue: boolean;
    daysUntilDeadline: number | null;
  };
}

export interface WeekInfo {
  weekNumber: number;
  year: number;
  weekStart: Date;
  weekEnd: Date;
  checkInDeadline: Date;
  isDeadlinePassed: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Badge thresholds (delta = actual progress - expected progress)
const BADGE_THRESHOLDS = {
  GREEN: -5,    // Within 5% of expected = Green
  YELLOW: -15,  // 5-15% behind = Yellow
  RED: -30,     // 15-30% behind = Red
  BLOCKED: -30  // >30% behind or critical = Blocked
} as const;

// Check-in deadline: Sunday 5:00 PM local time
const CHECK_IN_DEADLINE_DAY = 0; // Sunday
const CHECK_IN_DEADLINE_HOUR = 17; // 5 PM

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get current week information including deadline
 */
export function getCurrentWeek(): WeekInfo {
  const now = new Date();
  const year = now.getFullYear();

  // Get start of week (Monday)
  const weekStart = new Date(now);
  const dayOfWeek = weekStart.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Monday is start
  weekStart.setDate(weekStart.getDate() + diff);
  weekStart.setHours(0, 0, 0, 0);

  // Get end of week (Sunday)
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  // Check-in deadline is Sunday 5 PM
  const checkInDeadline = new Date(weekEnd);
  checkInDeadline.setHours(CHECK_IN_DEADLINE_HOUR, 0, 0, 0);

  // Calculate week number
  const startOfYear = new Date(year, 0, 1);
  const diff2 = weekStart.getTime() - startOfYear.getTime();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const weekNumber = Math.ceil((diff2 + startOfYear.getDay() * 24 * 60 * 60 * 1000) / oneWeek);

  return {
    weekNumber,
    year,
    weekStart,
    weekEnd,
    checkInDeadline,
    isDeadlinePassed: now > checkInDeadline
  };
}

/**
 * Get week start date (Monday) for any given date
 */
export function getWeekStart(date: Date): Date {
  const result = new Date(date);
  const dayOfWeek = result.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Calculate time progress percentage (how much time has elapsed)
 */
export function getTimeProgressPercent(startDate: Date, endDate: Date): number {
  const now = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Handle edge cases
  if (now < start) return 0;
  if (now > end) return 100;

  const total = end.getTime() - start.getTime();
  const elapsed = now.getTime() - start.getTime();

  if (total <= 0) return 100;

  return Math.min(100, Math.max(0, (elapsed / total) * 100));
}

/**
 * Check if check-in is overdue for current week
 */
export function isCheckInOverdue(lastCheckIn: Date | null): boolean {
  const week = getCurrentWeek();
  const now = new Date();

  // If never checked in, they're overdue after first deadline passes
  if (!lastCheckIn) {
    return week.isDeadlinePassed;
  }

  const lastCheckInDate = new Date(lastCheckIn);
  const currentWeekStart = week.weekStart;

  // If past deadline and no check-in this week
  if (week.isDeadlinePassed && lastCheckInDate < currentWeekStart) {
    return true;
  }

  return false;
}

/**
 * Calculate days until next check-in deadline
 */
export function getDaysUntilDeadline(): number {
  const week = getCurrentWeek();
  const now = new Date();

  if (week.isDeadlinePassed) {
    // Calculate days until next week's deadline
    const nextDeadline = new Date(week.checkInDeadline);
    nextDeadline.setDate(nextDeadline.getDate() + 7);
    const diffMs = nextDeadline.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  const diffMs = week.checkInDeadline.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Calculate average progress across all active objectives
 */
export function calculateOverallProgress(objectives: OKRObjective[]): number {
  const activeObjectives = objectives.filter(
    obj => obj.status === 'active' && obj.key_results && obj.key_results.length > 0
  );

  if (activeObjectives.length === 0) return 100; // No objectives = no issues

  const totalProgress = activeObjectives.reduce(
    (sum, obj) => sum + (obj.overall_progress || 0),
    0
  );

  return Math.round(totalProgress / activeObjectives.length);
}

/**
 * Calculate expected progress based on objective dates
 */
export function calculateExpectedProgress(objectives: OKRObjective[]): number {
  const activeObjectives = objectives.filter(
    obj => obj.status === 'active'
  );

  if (activeObjectives.length === 0) return 0;

  const timeProgresses = activeObjectives.map(obj => {
    const start = new Date(obj.start_date);
    const end = new Date(obj.end_date);
    return getTimeProgressPercent(start, end);
  });

  const avgTimeProgress = timeProgresses.reduce((a, b) => a + b, 0) / timeProgresses.length;
  return Math.round(avgTimeProgress);
}

// ============================================================================
// MAIN BADGE CALCULATION
// ============================================================================

/**
 * Calculate user badge based on progress and check-in status
 */
export function calculateBadge(input: BadgeCalculationInput): BadgeCalculationResult {
  const { lastCheckInDate, objectives, consecutiveMissedWeeks } = input;

  // 1. Check if check-in is overdue (immediate block check)
  const checkInOverdue = isCheckInOverdue(lastCheckInDate);

  // 2. If 3+ consecutive missed weeks, blocked regardless of progress
  if (consecutiveMissedWeeks >= 3) {
    return {
      badge: 'blocked',
      reason: `Blocked: ${consecutiveMissedWeeks} consecutive weeks without check-in`,
      details: {
        timeProgress: calculateExpectedProgress(objectives),
        actualProgress: calculateOverallProgress(objectives),
        delta: 0,
        isCheckInOverdue: true,
        daysUntilDeadline: null
      }
    };
  }

  // 3. Calculate expected vs actual progress
  const timeProgress = calculateExpectedProgress(objectives);
  const actualProgress = calculateOverallProgress(objectives);
  const delta = actualProgress - timeProgress;
  const daysUntilDeadline = getDaysUntilDeadline();

  // 4. Check-in overdue after deadline = blocked (if severe)
  if (checkInOverdue && consecutiveMissedWeeks >= 2) {
    return {
      badge: 'blocked',
      reason: 'Blocked: Check-in overdue with multiple missed weeks',
      details: {
        timeProgress,
        actualProgress,
        delta,
        isCheckInOverdue: checkInOverdue,
        daysUntilDeadline
      }
    };
  }

  // 5. Severely behind (>30% off expected) = blocked
  if (delta <= BADGE_THRESHOLDS.BLOCKED) {
    return {
      badge: 'blocked',
      reason: `Critical: ${Math.abs(delta).toFixed(0)}% behind expected progress`,
      details: {
        timeProgress,
        actualProgress,
        delta,
        isCheckInOverdue: checkInOverdue,
        daysUntilDeadline
      }
    };
  }

  // 6. Check-in overdue (first miss) = yellow or red based on progress
  if (checkInOverdue) {
    const badge: UserBadge = delta < BADGE_THRESHOLDS.YELLOW ? 'red' : 'yellow';
    return {
      badge,
      reason: `Check-in overdue - submit by next deadline`,
      details: {
        timeProgress,
        actualProgress,
        delta,
        isCheckInOverdue: checkInOverdue,
        daysUntilDeadline
      }
    };
  }

  // 7. Determine badge based on delta
  let badge: UserBadge;
  let reason: string;

  if (delta >= BADGE_THRESHOLDS.GREEN) {
    badge = 'green';
    reason = 'On track: Progress matches or exceeds expected';
  } else if (delta >= BADGE_THRESHOLDS.YELLOW) {
    badge = 'yellow';
    reason = `At risk: ${Math.abs(delta).toFixed(0)}% behind expected progress`;
  } else {
    badge = 'red';
    reason = `Behind: ${Math.abs(delta).toFixed(0)}% below expected progress`;
  }

  return {
    badge,
    reason,
    details: {
      timeProgress,
      actualProgress,
      delta,
      isCheckInOverdue: checkInOverdue,
      daysUntilDeadline
    }
  };
}

/**
 * Quick badge check for user status display
 */
export function getQuickBadgeStatus(
  userStatus: OKRUserStatus | null,
  objectives: OKRObjective[]
): UserBadge {
  if (!userStatus) return 'green'; // No status = new user, start green

  const result = calculateBadge({
    lastCheckInDate: userStatus.last_check_in_date
      ? new Date(userStatus.last_check_in_date)
      : null,
    objectives,
    consecutiveMissedWeeks: userStatus.consecutive_missed_weeks || 0
  });

  return result.badge;
}

/**
 * Get badge display information
 */
export function getBadgeDisplayInfo(badge: UserBadge): {
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
  icon: string;
  description: string;
} {
  switch (badge) {
    case 'green':
      return {
        color: 'text-green-700',
        bgColor: 'bg-green-100',
        borderColor: 'border-green-500',
        label: 'On Track',
        icon: '🟢',
        description: 'Progress is on track with time elapsed'
      };
    case 'yellow':
      return {
        color: 'text-yellow-700',
        bgColor: 'bg-yellow-100',
        borderColor: 'border-yellow-500',
        label: 'At Risk',
        icon: '🟡',
        description: 'Slightly behind expected progress'
      };
    case 'red':
      return {
        color: 'text-red-700',
        bgColor: 'bg-red-100',
        borderColor: 'border-red-500',
        label: 'Behind',
        icon: '🔴',
        description: 'Significantly behind expected progress'
      };
    case 'blocked':
      return {
        color: 'text-gray-900',
        bgColor: 'bg-gray-300',
        borderColor: 'border-gray-700',
        label: 'Blocked',
        icon: '⛔',
        description: 'Check-in overdue or severely behind'
      };
    default:
      return {
        color: 'text-gray-700',
        bgColor: 'bg-gray-100',
        borderColor: 'border-gray-500',
        label: 'Unknown',
        icon: '❓',
        description: 'Status unknown'
      };
  }
}

// ============================================================================
// EXPORT ALL
// ============================================================================

export const BadgeCalculator = {
  calculate: calculateBadge,
  getQuickStatus: getQuickBadgeStatus,
  getDisplayInfo: getBadgeDisplayInfo,
  getCurrentWeek,
  getWeekStart,
  getTimeProgress: getTimeProgressPercent,
  isCheckInOverdue,
  getDaysUntilDeadline,
  calculateOverallProgress,
  calculateExpectedProgress
};
