// lib/services/resource-management/date-availability-service.ts
// Date Availability Service - Handles date validation for resource bookings

import type { DateAvailabilityConfig } from '@/types/resource-management';

/**
 * Service for checking date availability based on configuration
 */
export class DateAvailabilityService {
  /**
   * Check if a specific date is available for booking
   */
  static isDateAvailable(
    config: DateAvailabilityConfig | undefined,
    date: string
  ): boolean {
    // If no config, all dates are available
    if (!config) return true;

    const checkDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if date is in the past
    if (checkDate < today) return false;

    // Check advance booking limit
    if (config.advance_booking_limit) {
      const maxDate = new Date(today);
      maxDate.setDate(maxDate.getDate() + config.advance_booking_limit);
      if (checkDate > maxDate) return false;
    }

    // Check same day booking
    if (config.same_day_booking === false) {
      if (checkDate.toDateString() === today.toDateString()) return false;
    }

    // Check blackout dates first (highest priority)
    if (config.blackout_dates && config.blackout_dates.length > 0) {
      const isBlackedOut = config.blackout_dates.some(
        (blackout) => blackout.date === date
      );
      if (isBlackedOut) return false;
    }

    // Check based on mode
    switch (config.mode) {
      case 'all_dates':
        return true;

      case 'custom_dates':
        return this.isDateInCustomRanges(date, config.custom_date_ranges);

      case 'weekly_pattern':
        return this.isDateInWeeklyPattern(checkDate, config.weekly_pattern);

      default:
        return true;
    }
  }

  /**
   * Check if date falls within custom date ranges
   */
  private static isDateInCustomRanges(
    date: string,
    ranges?: Array<{ start_date: string; end_date: string }>
  ): boolean {
    if (!ranges || ranges.length === 0) return false;

    const checkDate = new Date(date);

    return ranges.some((range) => {
      const startDate = new Date(range.start_date);
      const endDate = new Date(range.end_date);

      return checkDate >= startDate && checkDate <= endDate;
    });
  }

  /**
   * Check if date matches weekly pattern
   */
  private static isDateInWeeklyPattern(
    date: Date,
    pattern?: { days_of_week: number[]; exclude_holidays: boolean }
  ): boolean {
    if (!pattern || !pattern.days_of_week || pattern.days_of_week.length === 0) {
      return true;
    }

    const dayOfWeek = date.getDay(); // 0 = Sunday, 6 = Saturday

    return pattern.days_of_week.includes(dayOfWeek);
  }

  /**
   * Get all available dates for a month
   */
  static getAvailableDatesForMonth(
    config: DateAvailabilityConfig | undefined,
    month: number,
    year: number
  ): string[] {
    const daysInMonth = new Date(year, month, 0).getDate();
    const availableDates: string[] = [];

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${month.toString().padStart(2, '0')}-${day
        .toString()
        .padStart(2, '0')}`;

      if (this.isDateAvailable(config, dateStr)) {
        availableDates.push(dateStr);
      }
    }

    return availableDates;
  }

  /**
   * Validate date against all rules and return detailed result
   */
  static validateDate(
    config: DateAvailabilityConfig | undefined,
    date: string
  ): { valid: boolean; reason?: string } {
    if (!config) return { valid: true };

    const checkDate = new Date(date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if date is in the past
    if (checkDate < today) {
      return { valid: false, reason: 'Cannot book dates in the past' };
    }

    // Check advance booking limit
    if (config.advance_booking_limit) {
      const maxDate = new Date(today);
      maxDate.setDate(maxDate.getDate() + config.advance_booking_limit);
      if (checkDate > maxDate) {
        return {
          valid: false,
          reason: `Cannot book more than ${config.advance_booking_limit} days in advance`
        };
      }
    }

    // Check same day booking
    if (config.same_day_booking === false) {
      if (checkDate.toDateString() === today.toDateString()) {
        return { valid: false, reason: 'Same-day booking is not allowed' };
      }
    }

    // Check blackout dates
    if (config.blackout_dates && config.blackout_dates.length > 0) {
      const blackout = config.blackout_dates.find((b) => b.date === date);
      if (blackout) {
        return {
          valid: false,
          reason: blackout.reason || 'Date is not available (blackout date)'
        };
      }
    }

    // Check based on mode
    switch (config.mode) {
      case 'all_dates':
        return { valid: true };

      case 'custom_dates':
        const inRange = this.isDateInCustomRanges(
          date,
          config.custom_date_ranges
        );
        if (!inRange) {
          return {
            valid: false,
            reason: 'Date is outside the allowed booking periods'
          };
        }
        return { valid: true };

      case 'weekly_pattern':
        const matchesPattern = this.isDateInWeeklyPattern(
          checkDate,
          config.weekly_pattern
        );
        if (!matchesPattern) {
          return {
            valid: false,
            reason: 'Date does not match the weekly availability pattern'
          };
        }
        return { valid: true };

      default:
        return { valid: true };
    }
  }

  /**
   * Get a human-readable description of the availability configuration
   */
  static getAvailabilityDescription(
    config: DateAvailabilityConfig | undefined
  ): string {
    if (!config) return 'Available all dates';

    switch (config.mode) {
      case 'all_dates':
        return 'Available all dates';

      case 'custom_dates':
        if (!config.custom_date_ranges || config.custom_date_ranges.length === 0) {
          return 'No available dates configured';
        }
        return `Available on ${config.custom_date_ranges.length} custom date range(s)`;

      case 'weekly_pattern':
        if (
          !config.weekly_pattern ||
          !config.weekly_pattern.days_of_week ||
          config.weekly_pattern.days_of_week.length === 0
        ) {
          return 'No days configured';
        }
        const days = config.weekly_pattern.days_of_week
          .map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d])
          .join(', ');
        return `Available on: ${days}`;

      default:
        return 'Custom availability';
    }
  }
}
