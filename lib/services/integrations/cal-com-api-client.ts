// lib/services/integrations/cal-com-api-client.ts
//
// Typed REST client for the Cal.com v2 NestJS API hosted on jicate-booking-api.
// Used exclusively by Path W server-side code (Route Handlers + Server Actions).
// NEVER import this from client components — the API key must not reach the
// browser.
//
// Auth: Authorization: Bearer <cal_api_key> + cal-api-version header.
// Transport: native fetch (Node 24 / Next.js 16 — no axios).
//
// Error hierarchy:
//   CalAuthError     (401) — key invalid/expired; caller should rotate
//   CalNotFoundError (404) — resource deleted or wrong ID
//   CalRateLimitError(429) — back-off 60 s and retry
//   CalServerError   (5xx) — jicate-booking-api is unhealthy
//
// Spec: specs/cal-com-rest-api-for-path-w.md (PR #676)
// Pattern: mirrors lib/services/integrations/jicate-booking-mirror-service.ts

import {
  type CalComUser,
  type CalComEventType,
  type CalComEventTypeCreateInput,
  type CalComSchedule,
  type CalComScheduleCreateInput,
  type CalComBooking,
  type CalComListBookingsOpts,
  type CalComApiKeyRefreshResponse,
  type CalComV2Response,
  CalAuthError,
  CalNotFoundError,
  CalRateLimitError,
  CalServerError,
  CalComApiError,
} from './cal-com-api-types';

export {
  CalComApiError,
  CalAuthError,
  CalNotFoundError,
  CalRateLimitError,
  CalServerError,
} from './cal-com-api-types';

export type {
  CalComUser,
  CalComEventType,
  CalComEventTypeCreateInput,
  CalComSchedule,
  CalComScheduleCreateInput,
  CalComBooking,
  CalComListBookingsOpts,
  CalComApiKeyRefreshResponse,
  CalComDayOfWeek,
  CalComScheduleAvailability,
  CalComScheduleOverride,
  CalComEventTypeLocation,
  CalComBookingField,
} from './cal-com-api-types';

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Default base URL: jicate-booking-api Vercel project (Phase 0 deployment).
 * Override via constructor param OR process.env.CAL_BOOKING_API_URL.
 *
 * Note: The v2 NestJS app lives at apps/api/v2 in the jicate-booking monorepo.
 * It is a separate Vercel project from apps/web (jicate-booking.vercel.app).
 * Until Phase 0 deploys it, every call will 404 or ECONNREFUSED.
 */
const DEFAULT_BASE_URL =
  process.env.CAL_BOOKING_API_URL ?? 'https://jicate-booking-api.vercel.app';

/**
 * Cal.com v2 API version pins.
 *
 * - Event-types: 2024-08-13 (latest; DTO UpdateEventTypeInput_2024_06_14 is in v2 source)
 * - Schedules:   2024-06-11 (spec §7 calls this out; the controller declares
 *                             [VERSION_2024_06_14, VERSION_2024_06_11] — pin to 06-11
 *                             until canary confirms 06-14 shape is stable on self-host)
 * - Me / Bookings / ApiKeys: 2024-08-13
 */
const API_VERSION_DEFAULT = '2024-08-13';
const API_VERSION_SCHEDULES = '2024-06-11';

const LOG_PREFIX = '[cal-com-api]';

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

function buildHeaders(apiKey: string, apiVersion: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey}`,
    'cal-api-version': apiVersion,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

/**
 * Parse + throw typed errors from non-2xx responses.
 * Logs the path and status with [cal-com-api] prefix so Sentry picks it up.
 */
async function throwForStatus(
  response: Response,
  path: string,
): Promise<void> {
  if (response.ok) return;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = await response.text().catch(() => '(unreadable body)');
  }

  console.error(
    `${LOG_PREFIX} non-2xx ${response.status} on ${path}`,
    JSON.stringify(body),
  );

  switch (response.status) {
    case 401:
      throw new CalAuthError(body);
    case 404:
      throw new CalNotFoundError(path, body);
    case 429:
      throw new CalRateLimitError(body);
    default:
      if (response.status >= 500) throw new CalServerError(response.status, body);
      throw new CalComApiError(
        `Cal.com API error ${response.status} on ${path}`,
        response.status,
        body,
      );
  }
}

/**
 * Unwrap the `{ status, data }` v2 envelope. Throws if status === 'error'.
 */
function unwrap<T>(json: CalComV2Response<T>, path: string): T {
  if (json.status === 'error') {
    throw new CalComApiError(
      json.error?.message ?? `Cal.com returned status=error on ${path}`,
      0,
      json.error,
    );
  }
  return json.data;
}

// ============================================================================
// CLIENT CLASS
// ============================================================================

/**
 * Low-level Cal.com v2 REST client.
 *
 * One instance per request, scoped to a single user's API key.  Never share
 * an instance across requests.  Obtain via `getCalClientForUser()` factory
 * (implemented in the provisioning service, Phase 1 PR-C) which handles
 * decryption and lazy-provisioning.
 *
 * Example (server action):
 * ```ts
 * import { getCalClientForUser } from '@/lib/services/integrations/cal-com-provisioning-service'
 * const cal = await getCalClientForUser(supabaseUserId)
 * const eventTypes = await cal.listEventTypes(calUserId)
 * ```
 */
export class CalComApiClient {
  private readonly baseUrl: string;

  /**
   * @param apiKey   Plaintext Cal.com API key ("cal_...") for the user.
   *                 Retrieved from PgCrypto vault — never log this value.
   * @param baseUrl  Optional override.  Defaults to CAL_BOOKING_API_URL env
   *                 or https://jicate-booking-api.vercel.app
   */
  constructor(
    private readonly apiKey: string,
    baseUrl?: string,
  ) {
    this.baseUrl = (baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PRIVATE FETCH HELPERS
  // ──────────────────────────────────────────────────────────────────────────

  private async get<T>(path: string, apiVersion = API_VERSION_DEFAULT): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(this.apiKey, apiVersion),
      // Disable Next.js data-cache for all Cal.com reads — data is mutable.
      cache: 'no-store',
    });
    await throwForStatus(response, path);
    const json = (await response.json()) as CalComV2Response<T>;
    return unwrap(json, path);
  }

  private async post<T>(
    path: string,
    body: unknown,
    apiVersion = API_VERSION_DEFAULT,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(this.apiKey, apiVersion),
      body: JSON.stringify(body),
    });
    await throwForStatus(response, path);
    const json = (await response.json()) as CalComV2Response<T>;
    return unwrap(json, path);
  }

  private async patch<T>(
    path: string,
    body: unknown,
    apiVersion = API_VERSION_DEFAULT,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: buildHeaders(this.apiKey, apiVersion),
      body: JSON.stringify(body),
    });
    await throwForStatus(response, path);
    const json = (await response.json()) as CalComV2Response<T>;
    return unwrap(json, path);
  }

  private async delete(path: string, apiVersion = API_VERSION_DEFAULT): Promise<void> {
    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'DELETE',
      headers: buildHeaders(this.apiKey, apiVersion),
    });
    await throwForStatus(response, path);
    // DELETE responses from Cal.com v2 return 200 { status, data: null } or 204.
    // Both are fine; we discard the body.
  }

  // ──────────────────────────────────────────────────────────────────────────
  // USER
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /v2/me — smoke-test that the stored API key is still valid.
   * Use this as the health-check probe in the Path W cron.
   */
  async getMe(): Promise<CalComUser> {
    return this.get<CalComUser>('/v2/me');
  }

  /**
   * Idempotent user-bootstrap called by the provisioning service.
   * The provisioning service itself is responsible for the DB insert (direct
   * SQL into jicate-booking Supabase per spec §1a); this method provides the
   * post-insert verification step by calling GET /v2/me after the insert.
   *
   * When called with a NEWLY provisioned key the response is the user row;
   * when called for an existing user it confirms the key still works.
   *
   * The `input` param documents the intent for callers — the actual DB insert
   * is handled by the provisioning service, not this method.
   *
   * @param input   { email, name } — not sent to Cal.com; used for logging only.
   */
  async ensureUser(input: { email: string; name?: string }): Promise<CalComUser> {
    // After provisioning, /v2/me validates the API key and returns the user.
    console.info(`${LOG_PREFIX} ensureUser verification for ${input.email}`);
    return this.getMe();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // EVENT TYPES
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /v2/event-types
   * Returns all EventTypes owned by the Bearer-token user.
   * v2 scopes automatically to the authenticated user — no userId param needed
   * in the query string (differs from v1 where you passed ?userId=N).
   *
   * The `userId` parameter is accepted for API symmetry with the contract
   * declared by the orchestrating agents but is NOT forwarded to the API.
   */
  async listEventTypes(_userId?: number): Promise<CalComEventType[]> {
    return this.get<CalComEventType[]>('/v2/event-types');
  }

  /**
   * GET /v2/event-types/:eventTypeId
   * Returns a single EventType.  Throws CalNotFoundError if it doesn't exist
   * or belongs to a different user (Cal.com returns 404 in both cases).
   */
  async getEventType(eventTypeId: number): Promise<CalComEventType> {
    return this.get<CalComEventType>(`/v2/event-types/${eventTypeId}`);
  }

  /**
   * POST /v2/event-types
   * Creates an EventType owned by the Bearer-token user.
   * Required fields: title, slug, lengthInMinutes.
   */
  async createEventType(input: CalComEventTypeCreateInput): Promise<CalComEventType> {
    return this.post<CalComEventType>('/v2/event-types', input);
  }

  /**
   * PATCH /v2/event-types/:eventTypeId
   * Partial update — only pass fields you want to change.
   * Immutable post-create: id, userId, teamId, parentId.
   * slug IS mutable in v2 (verified in UpdateEventTypeInput_2024_06_14 DTO).
   */
  async updateEventType(
    eventTypeId: number,
    input: Partial<CalComEventTypeCreateInput>,
  ): Promise<CalComEventType> {
    return this.patch<CalComEventType>(`/v2/event-types/${eventTypeId}`, input);
  }

  /**
   * DELETE /v2/event-types/:eventTypeId
   * Cascades: deletes Booking rows with eventTypeId set to null, removes
   * webhooks linked to this EventType, removes hashed-link rows.
   */
  async deleteEventType(eventTypeId: number): Promise<void> {
    return this.delete(`/v2/event-types/${eventTypeId}`);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SCHEDULES
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /v2/schedules
   * Returns all Schedules owned by the Bearer-token user, including
   * availability windows and date overrides inline (no extra round-trip
   * unlike v1 which needed /availabilities separately).
   *
   * The `userId` parameter is accepted for API symmetry but is NOT forwarded.
   */
  async listSchedules(_userId?: number): Promise<CalComSchedule[]> {
    return this.get<CalComSchedule[]>('/v2/schedules', API_VERSION_SCHEDULES);
  }

  /**
   * GET /v2/schedules/:scheduleId
   * Returns a single Schedule with availability + overrides.
   */
  async getSchedule(scheduleId: number): Promise<CalComSchedule> {
    return this.get<CalComSchedule>(
      `/v2/schedules/${scheduleId}`,
      API_VERSION_SCHEDULES,
    );
  }

  /**
   * POST /v2/schedules
   * Creates a new schedule.  If isDefault: true, Cal.com automatically
   * unsets the previous default schedule.
   * Required: name, timeZone, availability (at least one window).
   */
  async createSchedule(input: CalComScheduleCreateInput): Promise<CalComSchedule> {
    return this.post<CalComSchedule>('/v2/schedules', input, API_VERSION_SCHEDULES);
  }

  /**
   * PATCH /v2/schedules/:scheduleId
   * Replace-semantics for availability: the `availability` array FULLY
   * replaces existing windows.  To remove a window, re-PATCH without it.
   * Overrides are date-specific exceptions (holidays, vacation days).
   * All-zero time = "closed all day": { startTime: "00:00", endTime: "00:00" }.
   *
   * Pinned to cal-api-version: 2024-06-11 per spec recommendation until a
   * canary confirms 2024-06-14 availability shape is stable on self-host v6.2.0.
   */
  async updateSchedule(
    scheduleId: number,
    input: Partial<CalComScheduleCreateInput>,
  ): Promise<CalComSchedule> {
    return this.patch<CalComSchedule>(
      `/v2/schedules/${scheduleId}`,
      input,
      API_VERSION_SCHEDULES,
    );
  }

  /**
   * DELETE /v2/schedules/:scheduleId
   * If deleted schedule was the user's default, Cal.com unsets
   * User.defaultScheduleId.  EventTypes that referenced this schedule fall
   * back to the user's new default (or null).
   *
   * Note: v2 properly guards via ApiAuthGuard + PermissionsGuard + SCHEDULE_WRITE;
   * v1 had no permission check (see spec §9 note).
   */
  async deleteSchedule(scheduleId: number): Promise<void> {
    return this.delete(`/v2/schedules/${scheduleId}`, API_VERSION_SCHEDULES);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BOOKINGS (read-only)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * GET /v2/bookings
   * Returns bookings for the Bearer-token user.
   *
   * PRIMARY SOURCE IS jicate_booking_mirror — use this only for:
   *   - Nightly reconciliation cron (already in jicate-booking-reconcile-service)
   *   - Drift-detection smoke tests (mirror count vs source count)
   *
   * Cal.com paginates at 100 rows; pass take/skip for full reconcile loops.
   *
   * The `userId` param is accepted for signature symmetry but ignored — v2
   * scopes to the Bearer-token user automatically.
   */
  async listBookings(
    _userId?: number,
    opts: CalComListBookingsOpts = {},
  ): Promise<CalComBooking[]> {
    const params = new URLSearchParams();
    if (opts.status) params.set('status', opts.status);
    if (opts.dateFrom) params.set('dateFrom', opts.dateFrom);
    if (opts.dateTo) params.set('dateTo', opts.dateTo);
    if (opts.take != null) params.set('take', String(opts.take));
    if (opts.skip != null) params.set('skip', String(opts.skip));

    const qs = params.toString();
    const path = qs ? `/v2/bookings?${qs}` : '/v2/bookings';
    return this.get<CalComBooking[]>(path);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // API KEY MANAGEMENT
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * POST /v2/api-keys/refresh
   * Rotate the current user's API key.  Called by the provisioning service
   * when a 401 response is received from any other method.
   *
   * The caller MUST:
   *   1. Store the new plaintext key (PgCrypto-encrypted) back in profiles.
   *   2. Update profiles.cal_api_key_hash with the new hash.
   *   3. Construct a new CalComApiClient instance with the new key.
   *
   * This client instance is invalidated after a successful rotation.
   */
  async refreshApiKey(): Promise<CalComApiKeyRefreshResponse> {
    return this.post<CalComApiKeyRefreshResponse>('/v2/api-keys/refresh', {});
  }
}

// ============================================================================
// FACTORY STUB — provisioning service implements the real version
// ============================================================================

/**
 * Factory: returns a CalComApiClient bound to the given MyJKKN Supabase user.
 *
 * The actual implementation lives in:
 *   lib/services/integrations/cal-com-provisioning-service.ts  (Phase 1 PR-C)
 *
 * That service:
 *   1. Reads profiles.cal_api_key_encrypted + profiles.cal_user_id
 *   2. On first call, runs the DB-insert provisioning flow and stores the key
 *   3. Decrypts the plaintext key via PgCrypto vault (Phase 1 PR-B)
 *   4. Returns a CalComApiClient instance bound to that key
 *
 * All Path W server-side code MUST use this factory.  Direct instantiation
 * of CalComApiClient is permitted ONLY in tests and the provisioning service
 * itself.
 *
 * @throws Error('NotImplemented') until Phase 1 PR-C is merged.
 */
export async function getCalClientForUser(
  _supabaseUserId: string,
): Promise<CalComApiClient> {
  // Implemented by Phase 1 Agent C (cal-com-provisioning-service.ts).
  // This stub satisfies TypeScript imports in sibling agents that code against
  // this contract before Phase 1 PR-C lands.
  throw new Error(
    'getCalClientForUser: NotImplemented — import from cal-com-provisioning-service once Phase 1 PR-C is merged.',
  );
}
