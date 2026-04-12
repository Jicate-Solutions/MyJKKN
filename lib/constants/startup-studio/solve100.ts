// Solve for 100 — Weekly Tracking System Constants

export const SOLVE100_WEEKS = 44 // 10 months
export const CHECKIN_DEADLINE_DAY = 4 // Thursday (0=Sun, 4=Thu)
export const CHECKIN_DEADLINE_HOUR = 23 // 11:59 PM
export const CHECKIN_DEADLINE_MINUTE = 59

export const PAID_USER_BRACKETS = ['0', '1-5', '6-10', '11-25', '26-50', '51-100', '100+'] as const

export const APP_STATUS_OPTIONS = [
  { value: 'live', label: 'Live', color: 'green' },
  { value: 'needs_fixes', label: 'Needs Fixes', color: 'yellow' },
  { value: 'building', label: 'Building', color: 'blue' },
  { value: 'pivoting', label: 'Pivoting', color: 'orange' },
] as const

// Re-export the canonical type from types/startup-studio.ts to avoid shadowing
export type { Solve100AppStatus as AppStatus } from '@/types/startup-studio'

export const VALIDATION_STATUS_OPTIONS = [
  { value: 'yes_in_person', label: 'Yes — talked in person', color: 'green' },
  { value: 'yes_phone', label: 'Yes — talked on phone', color: 'green' },
  { value: 'no_watched', label: 'No — but observed them', color: 'yellow' },
  { value: 'no_guessing', label: 'No — just guessing', color: 'red' },
] as const

export type ValidationStatus = 'yes_in_person' | 'yes_phone' | 'no_watched' | 'no_guessing'

/**
 * Calculate the current week number based on event start date.
 * Week 1 starts on the event's start_date.
 */
export function getCurrentWeekNumber(eventStartDate: string): number {
  const start = new Date(eventStartDate)
  const now = new Date()
  const diffMs = now.getTime() - start.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  const week = Math.floor(diffDays / 7) + 1
  return Math.max(1, Math.min(week, SOLVE100_WEEKS))
}

/**
 * Check if the weekly check-in deadline has passed for a given week.
 */
export function isCheckinDeadlinePassed(eventStartDate: string, weekNumber: number): boolean {
  const start = new Date(eventStartDate)
  // Deadline is Thursday 11:59 PM of the given week
  const weekStart = new Date(start.getTime() + (weekNumber - 1) * 7 * 24 * 60 * 60 * 1000)
  // Find next Thursday from week start
  const dayOfWeek = weekStart.getDay()
  const daysUntilThursday = (CHECKIN_DEADLINE_DAY - dayOfWeek + 7) % 7
  const deadline = new Date(weekStart.getTime() + daysUntilThursday * 24 * 60 * 60 * 1000)
  deadline.setHours(CHECKIN_DEADLINE_HOUR, CHECKIN_DEADLINE_MINUTE, 59, 999)
  return new Date() > deadline
}
