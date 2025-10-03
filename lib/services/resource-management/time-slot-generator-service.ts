// lib/services/resource-management/time-slot-generator-service.ts
// Time Slot Generator Service - Generates time slots for resources

import type { TimeSlotConfig, CustomTimeSlot } from '@/types/resource-management';

export interface GeneratedTimeSlot {
  start_time: string; // ISO datetime string
  end_time: string; // ISO datetime string
  is_available: boolean;
  resource_id: string;
  slot_name?: string;
  max_capacity?: number;
}

/**
 * Service for generating time slots based on configuration
 */
export class TimeSlotGeneratorService {
  /**
   * Generate time slots for a specific date
   */
  static generateSlotsForDate(
    config: TimeSlotConfig | undefined,
    date: string,
    resourceId: string
  ): GeneratedTimeSlot[] {
    if (!config) {
      // Return default slots if no config
      return this.generateDefaultSlots(date, resourceId);
    }

    const dayOfWeek = new Date(date).getDay();

    // Check if there's a day-specific schedule
    const daySchedule = config.day_specific_schedules?.find(
      (s) => s.day_of_week === dayOfWeek
    );

    if (daySchedule?.is_closed) {
      return []; // Resource is closed on this day
    }

    // Use day-specific slots if available
    if (daySchedule?.custom_slots) {
      return this.generateFromCustomSlots(
        daySchedule.custom_slots,
        date,
        resourceId
      );
    }

    // Use configured slot generation
    if (config.slot_generation === 'custom' && config.custom_slots) {
      // Filter custom slots by day of week
      const applicableSlots = config.custom_slots.filter(
        (slot) =>
          slot.is_active &&
          (!slot.days_of_week ||
            slot.days_of_week.length === 0 ||
            slot.days_of_week.includes(dayOfWeek))
      );
      return this.generateFromCustomSlots(applicableSlots, date, resourceId);
    }

    // Use automatic slot generation
    return this.generateAutomaticSlots(config, date, resourceId, daySchedule);
  }

  /**
   * Generate automatic slots based on configuration
   */
  private static generateAutomaticSlots(
    config: TimeSlotConfig,
    date: string,
    resourceId: string,
    daySchedule?: any
  ): GeneratedTimeSlot[] {
    const slots: GeneratedTimeSlot[] = [];

    // Get operating hours (day-specific or default)
    const opHours = daySchedule?.operating_hours || config.operating_hours.default;
    const startHour = parseInt(opHours.start.split(':')[0]);
    const startMinute = parseInt(opHours.start.split(':')[1] || '0');
    const endHour = parseInt(opHours.end.split(':')[0]);
    const endMinute = parseInt(opHours.end.split(':')[1] || '0');

    // Get slot configuration
    const slotDuration = config.automatic_config?.slot_duration || 60; // minutes
    const bufferTime = config.automatic_config?.buffer_time || 0; // minutes
    const breakTimes = config.automatic_config?.break_times || [];

    // Convert operating hours to minutes
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;

    let currentMinutes = startMinutes;

    while (currentMinutes + slotDuration <= endMinutes) {
      const slotStartHour = Math.floor(currentMinutes / 60);
      const slotStartMin = currentMinutes % 60;
      const slotEndMinutes = currentMinutes + slotDuration;
      const slotEndHour = Math.floor(slotEndMinutes / 60);
      const slotEndMin = slotEndMinutes % 60;

      const slotStartTime = `${slotStartHour.toString().padStart(2, '0')}:${slotStartMin.toString().padStart(2, '0')}`;
      const slotEndTime = `${slotEndHour.toString().padStart(2, '0')}:${slotEndMin.toString().padStart(2, '0')}`;

      // Check if this slot overlaps with any break time
      const isBreakTime = breakTimes.some((breakTime) => {
        const breakStart = this.timeToMinutes(breakTime.start_time);
        const breakEnd = this.timeToMinutes(breakTime.end_time);
        return currentMinutes < breakEnd && slotEndMinutes > breakStart;
      });

      if (!isBreakTime) {
        slots.push({
          start_time: `${date}T${slotStartTime}:00`,
          end_time: `${date}T${slotEndTime}:00`,
          is_available: true,
          resource_id: resourceId
        });
      }

      // Move to next slot (including buffer time)
      currentMinutes += slotDuration + bufferTime;
    }

    return slots;
  }

  /**
   * Generate slots from custom slot definitions
   */
  private static generateFromCustomSlots(
    customSlots: CustomTimeSlot[],
    date: string,
    resourceId: string
  ): GeneratedTimeSlot[] {
    return customSlots.map((slot) => ({
      start_time: `${date}T${slot.start_time}:00`,
      end_time: `${date}T${slot.end_time}:00`,
      is_available: true,
      resource_id: resourceId,
      slot_name: slot.name,
      max_capacity: slot.max_capacity
    }));
  }

  /**
   * Generate default slots (9 AM - 5 PM, hourly)
   */
  private static generateDefaultSlots(
    date: string,
    resourceId: string
  ): GeneratedTimeSlot[] {
    const slots: GeneratedTimeSlot[] = [];

    for (let hour = 9; hour < 17; hour++) {
      slots.push({
        start_time: `${date}T${hour.toString().padStart(2, '0')}:00:00`,
        end_time: `${date}T${(hour + 1).toString().padStart(2, '0')}:00:00`,
        is_available: true,
        resource_id: resourceId
      });
    }

    return slots;
  }

  /**
   * Validate time slot against configuration
   */
  static validateTimeSlot(
    config: TimeSlotConfig | undefined,
    startTime: string,
    endTime: string,
    date: string
  ): { valid: boolean; reason?: string } {
    if (!config) return { valid: true };

    const startDate = new Date(startTime);
    const endDate = new Date(endTime);

    // Check if end is after start
    if (endDate <= startDate) {
      return { valid: false, reason: 'End time must be after start time' };
    }

    const dayOfWeek = startDate.getDay();

    // Check day-specific schedule
    const daySchedule = config.day_specific_schedules?.find(
      (s) => s.day_of_week === dayOfWeek
    );

    if (daySchedule?.is_closed) {
      return { valid: false, reason: 'Resource is closed on this day' };
    }

    // Get operating hours
    const opHours = daySchedule?.operating_hours || config.operating_hours.default;
    const [opStartHour, opStartMin] = opHours.start.split(':').map(Number);
    const [opEndHour, opEndMin] = opHours.end.split(':').map(Number);

    const startHour = startDate.getHours();
    const startMin = startDate.getMinutes();
    const endHour = endDate.getHours();
    const endMin = endDate.getMinutes();

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    const opStartMinutes = opStartHour * 60 + opStartMin;
    const opEndMinutes = opEndHour * 60 + opEndMin;

    // Check if within operating hours
    if (startMinutes < opStartMinutes || endMinutes > opEndMinutes) {
      return {
        valid: false,
        reason: `Booking must be within operating hours (${opHours.start} - ${opHours.end})`
      };
    }

    // Check break times
    if (config.automatic_config?.break_times) {
      for (const breakTime of config.automatic_config.break_times) {
        const breakStart = this.timeToMinutes(breakTime.start_time);
        const breakEnd = this.timeToMinutes(breakTime.end_time);

        if (startMinutes < breakEnd && endMinutes > breakStart) {
          return {
            valid: false,
            reason: `Booking conflicts with break time (${breakTime.reason || 'break period'})`
          };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Convert HH:MM time string to minutes
   */
  private static timeToMinutes(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Get slot duration in minutes
   */
  static getSlotDuration(slot: GeneratedTimeSlot): number {
    const start = new Date(slot.start_time);
    const end = new Date(slot.end_time);
    return (end.getTime() - start.getTime()) / (1000 * 60);
  }

  /**
   * Format slot time for display
   */
  static formatSlotTime(slot: GeneratedTimeSlot): string {
    const start = new Date(slot.start_time);
    const end = new Date(slot.end_time);

    const formatTime = (date: Date) => {
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      });
    };

    if (slot.slot_name) {
      return `${slot.slot_name} (${formatTime(start)} - ${formatTime(end)})`;
    }

    return `${formatTime(start)} - ${formatTime(end)}`;
  }
}
