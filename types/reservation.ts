// types/reservation.ts
// Reservation Module Types

// Use actual enums for values
export enum ReservationStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
  COMPLETED = 'completed',
  NO_SHOW = 'no_show'
}

export enum ReservationPriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3
}

// Core Reservation Interface
export interface Reservation {
  id: string;
  resource_id: string;
  user_id: string;
  purpose: string;
  start_time: string; // ISO datetime
  end_time: string; // ISO datetime
  quantity: number;
  status: ReservationStatus;
  priority: ReservationPriority;

  // Approval
  approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;

  // Check-in/out
  checked_in_at?: string;
  checked_out_at?: string;
  checked_in_by?: string;
  checked_out_by?: string;

  // Cancellation
  cancelled_at?: string;
  cancelled_by?: string;
  cancellation_reason?: string;

  // Additional
  notes?: string;
  attachments?: string[];

  // Recurring
  is_recurring?: boolean;
  recurring_config?: RecurringConfig;

  // Metadata
  created_at: string;
  updated_at: string;

  // Relations (populated by service)
  resource?: any; // Resource type from resource-management
  user?: any; // Profile type
  approver?: any; // Profile type
  checked_in_user?: any; // Profile type for check-in
  checked_out_user?: any; // Profile type for check-out
  cancelled_user?: any; // Profile type for cancellation
}

// Recurring Configuration
export interface RecurringConfig {
  frequency: 'daily' | 'weekly' | 'monthly';
  interval: number; // Every X days/weeks/months
  days_of_week?: number[]; // 0 = Sunday, 6 = Saturday
  end_date?: string;
  max_occurrences?: number;
  exceptions?: string[]; // Dates to skip
}

// DTOs for API
export interface CreateReservationDto {
  resource_id: string;
  purpose: string;
  start_time: string;
  end_time: string;
  quantity?: number;
  priority?: ReservationPriority;
  notes?: string;
  attachments?: string[];
  is_recurring?: boolean;
  recurring_config?: RecurringConfig;
}

export interface UpdateReservationDto {
  purpose?: string;
  start_time?: string;
  end_time?: string;
  quantity?: number;
  priority?: ReservationPriority;
  notes?: string;
  attachments?: string[];
}

export interface ApproveReservationDto {
  reservation_id: string;
  notes?: string;
}

export interface RejectReservationDto {
  reservation_id: string;
  rejection_reason: string;
}

export interface CancelReservationDto {
  reservation_id: string;
  user_id: string;
  cancellation_reason: string;
}

export interface CheckInDto {
  reservation_id: string;
  checked_in_by: string;
  notes?: string;
}

export interface CheckOutDto {
  reservation_id: string;
  checked_out_by: string;
  notes?: string;
}

// Filters
export interface ReservationFilters {
  resource_id?: string;
  user_id?: string;
  status?: ReservationStatus;
  start_date?: string;
  end_date?: string;
  priority?: ReservationPriority;
  is_recurring?: boolean;
}

// Availability Check
export interface AvailabilityCheckDto {
  resource_id: string;
  start_time: string;
  end_time: string;
  quantity?: number;
  exclude_reservation_id?: string; // For editing existing reservations
}

// Zod schema for form validation
import { z } from 'zod';

export const createReservationSchema = z.object({
  resource_id: z.string().uuid('Invalid resource'),
  purpose: z.string().min(10, 'Purpose must be at least 10 characters'),
  start_time: z.string(),
  end_time: z.string(),
  quantity: z.number().min(1).default(1),
  priority: z
    .nativeEnum(ReservationPriority)
    .default(ReservationPriority.NORMAL),
  notes: z.string().optional(),
  attachments: z.array(z.string()).optional(),
  is_recurring: z.boolean().optional().default(false),
  recurring_config: z
    .object({
      frequency: z.enum(['daily', 'weekly', 'monthly']),
      interval: z.number().min(1),
      days_of_week: z.array(z.number().min(0).max(6)).optional(),
      end_date: z.string().optional(),
      max_occurrences: z.number().optional(),
      exceptions: z.array(z.string()).optional()
    })
    .optional()
});

export interface AvailabilityResult {
  is_available: boolean;
  conflicting_reservations?: Reservation[];
  available_slots?: TimeSlot[];
  message?: string;
}

export interface TimeSlot {
  start_time: string;
  end_time: string;
  is_available: boolean;
  resource_id: string;
  existing_reservation_id?: string;
}

// Calendar View Data
export interface CalendarSlot {
  date: string;
  slots: TimeSlot[];
  is_fully_booked: boolean;
  is_partially_booked: boolean;
  is_available: boolean;
  is_maintenance: boolean;
}

export interface MonthCalendar {
  month: number;
  year: number;
  days: CalendarSlot[];
}

// Statistics
export interface ReservationStats {
  total_reservations: number;
  pending_approvals: number;
  approved_count: number;
  rejected_count: number;
  cancelled_count: number;
  completed_count: number;
  no_show_count: number;
  upcoming_reservations: number;
  overdue_reservations: number;
}

// User's Reservation Summary
export interface UserReservationSummary {
  total_reservations: number;
  active_reservations: number;
  pending_approvals: number;
  upcoming_bookings: number;
  past_bookings: number;
  cancellation_rate: number;
  no_show_rate: number;
}
