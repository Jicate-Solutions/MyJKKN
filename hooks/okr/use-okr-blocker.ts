// hooks/okr/use-okr-blocker.ts
// Global OKR blocker hook - enforces weekly check-in compliance
// CRITICAL: Users who miss Sunday 5PM deadline are BLOCKED from key actions

import { useIsUserBlocked, useMyComplianceStatus } from './use-compliance';
import { useCurrentCheckIn } from './use-check-ins';
import { useAuth } from '../use-auth';

interface OKRBlockerState {
  // Is the user currently blocked from actions?
  isBlocked: boolean;
  // Is the check still loading?
  isLoading: boolean;
  // Human-readable message explaining the block
  blockMessage: string;
  // URL to resolve the block (check-in page)
  checkInUrl: string;
  // How many days overdue (0 if not overdue)
  daysOverdue: number;
  // User's current badge color
  badgeColor: 'green' | 'yellow' | 'red' | 'blocked';
  // Has the user completed this week's check-in?
  hasCompletedThisWeek: boolean;
  // Is the current week's deadline passed? (Sunday 5 PM)
  isDeadlinePassed: boolean;
}

/**
 * Calculate if the Sunday 5 PM deadline has passed for the current week
 */
function isWeeklyDeadlinePassed(): boolean {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
  const hours = now.getHours();

  // Deadline is Sunday at 5 PM (17:00)
  // If it's Sunday and past 5 PM, or if it's Monday-Saturday (new week started), deadline passed
  if (dayOfWeek === 0 && hours >= 17) {
    // It's Sunday after 5 PM - deadline passed
    return true;
  }

  // Note: Days 1-6 (Mon-Sat) are BEFORE next Sunday's deadline
  // So the deadline hasn't passed yet for the current week
  return false;
}

/**
 * Calculate days since the last Sunday 5 PM deadline
 */
function calculateDaysOverdue(): number {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const hours = now.getHours();

  // Find the most recent Sunday 5 PM
  const lastSunday = new Date(now);

  if (dayOfWeek === 0) {
    // Today is Sunday
    if (hours < 17) {
      // Before 5 PM - last deadline was last Sunday
      lastSunday.setDate(lastSunday.getDate() - 7);
    }
    // else: after 5 PM today IS the deadline day
  } else {
    // Go back to last Sunday
    lastSunday.setDate(lastSunday.getDate() - dayOfWeek);
  }

  lastSunday.setHours(17, 0, 0, 0);

  const diffMs = now.getTime() - lastSunday.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
}

/**
 * Main OKR Blocker Hook
 *
 * Use this hook in any component where you need to block actions
 * for users who haven't completed their weekly OKR check-in.
 *
 * @example
 * ```tsx
 * function LeaveApplicationForm() {
 *   const { isBlocked, isLoading, blockMessage, checkInUrl } = useOKRBlocker();
 *
 *   if (isLoading) return <Loading />;
 *
 *   if (isBlocked) {
 *     return <BlockedAlert message={blockMessage} actionUrl={checkInUrl} />;
 *   }
 *
 *   return <YourFormHere />;
 * }
 * ```
 */
export function useOKRBlocker(): OKRBlockerState {
  const { profile, isLoading: authLoading } = useAuth();

  // Check if user is marked as blocked in the system
  const { data: isUserBlocked, isLoading: blockedLoading } = useIsUserBlocked();

  // Get user's compliance status (badge, history, etc.)
  const { data: complianceStatus, isLoading: complianceLoading } = useMyComplianceStatus();

  // Get current week's check-in
  const { data: currentCheckIn, isLoading: checkInLoading } = useCurrentCheckIn();

  const isLoading = authLoading || blockedLoading || complianceLoading || checkInLoading;

  // Calculate deadline status
  const isDeadlinePassed = isWeeklyDeadlinePassed();
  const daysOverdue = calculateDaysOverdue();

  // Determine if check-in is completed for this week
  const hasCompletedThisWeek = currentCheckIn?.is_completed ?? false;

  // User is BLOCKED if:
  // 1. They are marked as blocked in the system (badge = 'blocked'), OR
  // 2. The weekly deadline has passed AND they haven't completed this week's check-in
  const isBlocked =
    isUserBlocked === true ||
    (isDeadlinePassed && !hasCompletedThisWeek);

  // Determine badge color
  let badgeColor: OKRBlockerState['badgeColor'] = 'green';
  if (complianceStatus?.current_badge) {
    badgeColor = complianceStatus.current_badge as OKRBlockerState['badgeColor'];
  } else if (isBlocked) {
    badgeColor = 'blocked';
  } else if (isDeadlinePassed && !hasCompletedThisWeek) {
    badgeColor = 'red';
  } else if (!hasCompletedThisWeek) {
    badgeColor = 'yellow';
  }

  // Generate appropriate message
  let blockMessage = '';
  if (isBlocked) {
    if (badgeColor === 'blocked') {
      blockMessage = `You are BLOCKED due to ${complianceStatus?.consecutive_missed_weeks || 'multiple'} consecutive missed OKR check-ins. Complete your check-in immediately to restore access.`;
    } else if (daysOverdue > 0) {
      blockMessage = `Your weekly OKR check-in is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue. Complete your check-in to continue using this feature.`;
    } else {
      blockMessage = 'You must complete your weekly OKR check-in before proceeding.';
    }
  }

  return {
    isBlocked: !authLoading && isBlocked,
    isLoading,
    blockMessage,
    checkInUrl: '/okr/check-in',
    daysOverdue,
    badgeColor,
    hasCompletedThisWeek,
    isDeadlinePassed
  };
}

/**
 * Lightweight version that only checks if blocked
 * Use when you just need the boolean, not all the details
 */
export function useIsOKRBlocked(): { isBlocked: boolean; isLoading: boolean } {
  const { isBlocked, isLoading } = useOKRBlocker();
  return { isBlocked, isLoading };
}

/**
 * Hook to get deadline information
 */
export function useOKRDeadline() {
  const isDeadlinePassed = isWeeklyDeadlinePassed();
  const daysOverdue = calculateDaysOverdue();

  // Calculate next deadline (next Sunday at 5 PM)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const nextSunday = new Date(now);

  if (dayOfWeek === 0 && now.getHours() < 17) {
    // Today is Sunday before 5 PM - deadline is today
    nextSunday.setHours(17, 0, 0, 0);
  } else {
    // Next Sunday
    const daysUntilSunday = (7 - dayOfWeek) % 7 || 7;
    nextSunday.setDate(nextSunday.getDate() + daysUntilSunday);
    nextSunday.setHours(17, 0, 0, 0);
  }

  const hoursUntilDeadline = Math.max(0,
    Math.floor((nextSunday.getTime() - now.getTime()) / (1000 * 60 * 60))
  );

  return {
    isDeadlinePassed,
    daysOverdue,
    nextDeadline: nextSunday,
    hoursUntilDeadline,
    deadlineString: nextSunday.toLocaleString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  };
}
