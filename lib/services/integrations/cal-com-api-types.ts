// lib/services/integrations/cal-com-api-types.ts
//
// TypeScript types for Cal.com v2 NestJS REST API (jicate-booking self-host).
//
// These shapes reflect the v2 response envelope and controller DTOs verified
// against jicate-booking v6.2.0 source at:
//   apps/api/v2/src/ee/event-types/event-types_2024_06_14/
//   apps/api/v2/src/ee/schedules/schedules_2024_06_11/
//   apps/api/v2/src/ee/me/me.controller.ts
//   apps/api/v2/src/modules/api-keys/controllers/api-keys.controller.ts
//
// Companion: lib/services/integrations/cal-com-api-client.ts
// Spec: specs/cal-com-rest-api-for-path-w.md

// ============================================================================
// ENVELOPE — all v2 responses wrap data in { status, data }
// ============================================================================

export interface CalComV2Response<T> {
  status: 'success' | 'error';
  data: T;
  /** Populated when status === 'error' */
  error?: {
    code: string;
    message: string;
  };
}

// ============================================================================
// ERRORS — typed error classes thrown by CalComApiClient
// ============================================================================

export class CalComApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'CalComApiError';
  }
}

export class CalAuthError extends CalComApiError {
  constructor(body: unknown) {
    super('Cal.com API key is invalid or expired (401)', 401, body);
    this.name = 'CalAuthError';
  }
}

export class CalNotFoundError extends CalComApiError {
  constructor(path: string, body: unknown) {
    super(`Cal.com resource not found: ${path} (404)`, 404, body);
    this.name = 'CalNotFoundError';
  }
}

export class CalRateLimitError extends CalComApiError {
  constructor(body: unknown) {
    super('Cal.com rate limit exceeded (429); retry after 60s', 429, body);
    this.name = 'CalRateLimitError';
  }
}

export class CalServerError extends CalComApiError {
  constructor(status: number, body: unknown) {
    super(`Cal.com server error (${status})`, status, body);
    this.name = 'CalServerError';
  }
}

// ============================================================================
// USER — /v2/me
// ============================================================================

/**
 * Minimal Cal.com user shape returned by GET /v2/me and the provisioning
 * path.  Only fields actually used by Path W are typed; the full Prisma
 * model has 40+ columns.
 */
export interface CalComUser {
  /** Cal.com numeric user ID (stored as profiles.cal_user_id) */
  id: number;
  email: string;
  username: string;
  name?: string;
  /** IANA timezone, e.g. "Asia/Kolkata" */
  timeZone: string;
  /** ID of the user's current default schedule, if set */
  defaultScheduleId?: number | null;
  weekStart?: string;
}

// ============================================================================
// EVENT TYPES — /v2/event-types
// ============================================================================

/**
 * A location entry on an EventType.
 * v2 uses plain type strings ("cal-video", "address") unlike v1 prefix form
 * ("integrations:daily", "link", etc.).
 */
export interface CalComEventTypeLocation {
  type: string;
  /** Physical address, populated when type === "address" */
  address?: string;
  /** Custom video link, populated when type === "link" */
  link?: string;
}

/**
 * A custom booking field on an EventType.  We store the full shape but only
 * use `name`, `type`, `required` in the Path W UI — extra fields are
 * round-tripped opaquely.
 */
export interface CalComBookingField {
  name: string;
  type: string;
  label?: string;
  placeholder?: string;
  required?: boolean;
  /** Any other Cal.com field properties */
  [key: string]: unknown;
}

/**
 * Scheduling settings sub-object returned by GET /v2/event-types.
 * The full DTO in apps/api/v2 has additional fields; only Path W–relevant
 * ones are typed here.
 */
export interface CalComEventTypeScheduling {
  type?: string;
  minimumBookingNotice?: number;
  beforeEventBuffer?: number;
  afterEventBuffer?: number;
  periodType?: string;
  periodDays?: number;
}

/**
 * Full EventType row as returned by GET /v2/event-types and
 * POST /PATCH /v2/event-types/:id.
 */
export interface CalComEventType {
  id: number;
  title: string;
  slug: string;
  lengthInMinutes: number;
  hidden: boolean;
  description?: string | null;
  /** The schedule this event-type uses; null means user's default schedule */
  scheduleId?: number | null;
  locations: CalComEventTypeLocation[];
  bookingFields: CalComBookingField[];
  /** Cal.com numeric user ID that owns this event-type */
  ownerId?: number;
  userId?: number;
  teamId?: number | null;
  /** parent event-type ID for managed events */
  parentId?: number | null;
  metadata: Record<string, unknown>;
  scheduling?: CalComEventTypeScheduling;
  /** ISO 8601 */
  createdAt?: string;
  /** ISO 8601 */
  updatedAt?: string;
}

/**
 * Fields accepted by POST /v2/event-types.
 * Required: title, slug, lengthInMinutes.
 * All others are optional — Cal.com fills defaults.
 */
export interface CalComEventTypeCreateInput {
  title: string;
  slug: string;
  lengthInMinutes: number;
  description?: string;
  scheduleId?: number;
  locations?: CalComEventTypeLocation[];
  bookingFields?: CalComBookingField[];
  minimumBookingNotice?: number;
  beforeEventBuffer?: number;
  afterEventBuffer?: number;
  hidden?: boolean;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// SCHEDULES — /v2/schedules
// ============================================================================

/**
 * Day-of-week string as used by Cal.com v2 (differs from v1's numeric 0–6).
 */
export type CalComDayOfWeek =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday';

/**
 * A recurring availability window within a schedule.
 * startTime / endTime are "HH:mm" strings (24h, no seconds).
 */
export interface CalComScheduleAvailability {
  days: CalComDayOfWeek[];
  /** "HH:mm" 24h time, e.g. "09:00" */
  startTime: string;
  /** "HH:mm" 24h time, e.g. "17:00" */
  endTime: string;
}

/**
 * A date-specific override (holiday / half-day).
 * Set startTime === endTime === "00:00" to mark the date as fully closed.
 */
export interface CalComScheduleOverride {
  /** ISO 8601 date string "YYYY-MM-DD" */
  date: string;
  startTime: string;
  endTime: string;
}

/**
 * Full Schedule row as returned by GET /v2/schedules and
 * POST /PATCH /v2/schedules/:id.
 * v2 returns availability + overrides inline (no extra round-trip).
 */
export interface CalComSchedule {
  id: number;
  name: string;
  /** IANA timezone */
  timeZone: string;
  isDefault: boolean;
  /** Cal.com numeric user ID that owns this schedule */
  ownerId?: number;
  availability: CalComScheduleAvailability[];
  overrides: CalComScheduleOverride[];
}

/**
 * Fields accepted by POST /v2/schedules.
 * Required: name, timeZone, availability.
 */
export interface CalComScheduleCreateInput {
  name: string;
  timeZone: string;
  isDefault?: boolean;
  availability: CalComScheduleAvailability[];
  overrides?: CalComScheduleOverride[];
}

// ============================================================================
// BOOKINGS — /v2/bookings (read-only; mirror table is canonical for UI)
// ============================================================================

/**
 * Booking status values in Cal.com v2.
 */
export type CalComBookingStatus =
  | 'upcoming'
  | 'past'
  | 'cancelled'
  | 'recurring';

/**
 * Attendee shape inside a booking row.
 */
export interface CalComBookingAttendee {
  email: string;
  name?: string;
  timeZone?: string;
  locale?: string;
}

/**
 * Booking row as returned by GET /v2/bookings.
 * We only use this for reconciliation crons, not for UI rendering
 * (jicate_booking_mirror is the primary read surface).
 */
export interface CalComBooking {
  id: number;
  uid: string;
  title: string;
  /** ISO 8601 */
  startTime: string;
  /** ISO 8601 */
  endTime: string;
  status: string;
  eventTypeId?: number | null;
  organizer?: {
    email: string;
    name?: string;
    timeZone?: string;
  };
  attendees: CalComBookingAttendee[];
  cancellationReason?: string | null;
  /** Cal.com uid of the booking that this one rescheduled FROM */
  rescheduledFromUid?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Optional filters for listBookings().
 */
export interface CalComListBookingsOpts {
  /** Filter by booking lifecycle status */
  status?: 'upcoming' | 'past' | 'cancelled' | 'recurring';
  /** ISO 8601 date-time lower bound */
  dateFrom?: string;
  /** ISO 8601 date-time upper bound */
  dateTo?: string;
  /** Pagination: max rows to return (default 100, max 100 per Cal.com) */
  take?: number;
  /** Pagination: rows to skip */
  skip?: number;
}

// ============================================================================
// API KEY REFRESH — /v2/api-keys/refresh
// ============================================================================

/**
 * Response from POST /v2/api-keys/refresh — used for key rotation on 401.
 * The new plaintext key must be re-encrypted and stored in profiles.
 */
export interface CalComApiKeyRefreshResponse {
  /** New API key plaintext — store encrypted, never log */
  apiKey: string;
  /** SHA-256 hash stored in Cal.com's ApiKey table */
  hashedKey: string;
}
