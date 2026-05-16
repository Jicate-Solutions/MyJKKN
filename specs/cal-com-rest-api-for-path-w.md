# Cal.com REST API Spec for Path W

**Author:** Path-W research agent (research-only)
**Date:** 2026-05-03
**Companion to:** `specs/cal-com-embed-sso.md` (Agent F — embed/SSO research)
**Implementer-agent batch:** PRs #663–#674 (Path W rebuild fan-out)

---

## TL;DR (5 bullets)

1. **Use the v2 (Platform) NestJS API on the jicate-booking codebase, not v1.** v1 was deprecated by Cal.com cloud and shut down 8 April 2026; the v1 source still exists in our v6.2.0 self-host monorepo, but staying on v1 means writing the integration against a Cal.com-marked-deprecated surface. v2 supports raw API-key auth without OAuth/atoms (verified in `apps/api/v2/src/modules/auth/strategies/api-auth/api-auth.strategy.ts`).
2. **The v2 API is a separate NestJS app that is NOT currently deployed.** `https://jicate-booking.vercel.app/api/v2/event-types` returns 404 today. The web app's `next.config.ts` rewrites `/api/v2/:path*` to `process.env.NEXT_PUBLIC_API_V2_URL` — that env var is unset in production. **Path W cannot start until a second Vercel project (`jicate-booking-api`) is deployed**. This is the load-bearing risk for Director.
3. **Auth: Bearer `cal_<random>` API key per user, header `Authorization: Bearer cal_xxx` plus `cal-api-version: 2024-08-13`.** Each MyJKKN user gets their own key on first auto-provision and we store the SHA-256 hash on a new `profiles.cal_api_key_hash` column (Cal.com stores only hashes anyway). The plaintext key is stored encrypted in a separate Supabase secret column or kept in an HTTP-only cookie minted server-side per session — never reaches the browser.
4. **Auto-provisioning has no clean self-host endpoint.** v1 `POST /v1/users` exists but requires admin scope; v2 `POST /v2/oauth-clients/:clientId/users` is for OAuth/atoms managed users only and is marked Deprecated in the controller. **Recommendation: provision via direct Supabase SQL into the Cal.com DB** (`fkihmsuwruohdgsqvnxg`) using a service-account approach already proven by jicate-booking-deploy skill. This is the spec's biggest scope decision; alternative B (deploy v1 alongside v2 just for `/v1/users` + `/v1/api-keys`) is documented as a fallback.
5. **9 endpoints documented + 1 nice-to-have.** EventTypes CRUD (4), Schedules CRUD (4), Me (1), Bookings list (read-only nice-to-have, mostly served by mirror table). Two gaps that need workarounds: (a) no `POST /users` for self-host without admin key — solved via DB insert; (b) v1 schedule PATCH only edits name/timezone, availability windows are managed via the separate /availabilities endpoints — v2 collapses both into one PATCH on /v2/schedules/:id which is another reason to choose v2.

---

## Auth model — recommendation

### v1 vs v2 — choose v2

| Dimension | v1 | v2 (chosen) |
|---|---|---|
| Cal.com cloud status | **Shut down 8 April 2026** ([cal.com docs](https://cal.com/docs/api-reference/v2/v1-v2-differences)) | Active, current |
| Self-host status (jicate v6.2.0) | Source present at `apps/api/v1`, runnable | Source present at `apps/api/v2`, runnable |
| Auth | `?apiKey=cal_xxx` query param | `Authorization: Bearer cal_xxx` header + `cal-api-version: 2024-08-13` |
| Stack | Next.js Pages Router | NestJS |
| Schedule PATCH | Only `name` + `timeZone`; availability via separate `/availabilities` | Single PATCH on `/v2/schedules/:id` covers both |
| EventType `length` field | `length` (integer) | `lengthInMinutes` (integer) |
| Location types | Prefixed `integrations:daily` etc. | Plain `cal-video`, `address` etc. |
| Response wrapper | Resource-named (`{event_type: ...}`) | Standard `{status, data}` envelope |
| Rate limit | 120 rpm (Cal.com cloud) | 120 rpm baseline (raisable to 800) |
| License key check | `CALCOM_LICENSE_KEY` env required | Same |
| OAuth client / atoms | Not supported | First-class (we don't use it) |

**Why v2 even though our v6.2.0 still has v1 source:** v1 will eventually rot upstream. Future jicate-booking version bumps will at some point delete `apps/api/v1`. v2 is the long-lived surface. v2 also matches the schedules+availability shape that the native UI needs (one PATCH instead of orchestrated three-way edits across `/schedules` and `/availabilities`).

### Per-user API keys vs admin service-key — choose per-user

A single admin key would mean every MyJKKN→Cal.com call runs as the global admin. Cal.com's permission model then hides the actual MyJKKN user identity, so EventType ownership, Booking ownership, and audit logs all collapse to one Cal user. This is the wrong shape for a 5000-user institution.

**Recommendation:** one Cal.com user per MyJKKN user, one API key per Cal.com user, key generated at first auto-provision. Storage:
- `profiles.cal_user_id` (integer) — Cal.com numeric user ID
- `profiles.cal_api_key_encrypted` (text) — PGCrypto-encrypted plaintext API key (Cal.com only stores SHA-256 hash; we need plaintext to send `Bearer ...` headers)
- `profiles.cal_api_key_hash` (text, unique, indexed) — for fast verification + future rotation

Rotation: on first failed `401 Unauthorized` from Cal.com, re-provision a key via `POST /v2/api-keys/refresh` (existing v2 endpoint). On user role change inside MyJKKN, no rotation needed — Cal.com permissions are independent.

### Where the API key lives in MyJKKN

- **Storage:** `profiles` table columns above (Supabase project_ref `<MyJKKN-ref>`, NOT `fkihmsuwruohdgsqvnxg` which is jicate-booking).
- **Server-side only:** plaintext key NEVER reaches the browser. Calls are made from MyJKKN's Next.js Route Handlers (`app/api/meetings/**`) which read the encrypted key, decrypt with the MyJKKN service role, attach the Bearer header, and proxy the response back to the React client.
- **Service-role env:** `CAL_DB_SERVICE_KEY` — used ONLY for the auto-provisioning DB insert (Phase 2). Never used for user-scoped reads/writes after provisioning.

---

## Endpoint inventory — what MyJKKN's Path W needs

All paths assume the API is mounted at `https://api.jicate-booking.vercel.app` (the second Vercel project — see Risks section). All requests include both headers below; only `Authorization` is shown in examples after this paragraph for brevity:

```
Authorization: Bearer cal_<plaintext>
cal-api-version: 2024-08-13
```

All v2 responses use the envelope `{ "status": "success" | "error", "data": <payload> }`.

### 1. User auto-provisioning

**The hard one.** Three paths, ordered by recommendation:

#### 1a. (Recommended) Direct DB insert via Supabase MCP

```sql
-- Run inside MyJKKN server action with service-role connection to fkihmsuwruohdgsqvnxg
WITH new_user AS (
  INSERT INTO "users" (
    email, username, name,
    "timeZone", "weekStart", locale, theme,
    "emailVerified", "createdDate"
  )
  VALUES ($1, slugify($2), $3, 'Asia/Kolkata', 'Monday', 'en', 'light', NOW(), NOW())
  ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email -- no-op for idempotency
  RETURNING id, email
),
new_key AS (
  INSERT INTO "ApiKey" (id, "userId", note, "hashedKey", "createdAt")
  SELECT gen_random_uuid()::text, id, 'MyJKKN auto-provisioned',
         encode(digest($4, 'sha256'), 'hex'), NOW()
  FROM new_user
  WHERE NOT EXISTS (
    SELECT 1 FROM "ApiKey" WHERE "userId" = new_user.id AND note = 'MyJKKN auto-provisioned'
  )
)
SELECT id FROM new_user;
```

The application generates the random plaintext key via `crypto.randomBytes(16).toString("hex")` (matching Cal.com's own `generateUniqueAPIKey`) and stores BOTH the SHA-256 hash in Cal.com's `ApiKey` table AND the encrypted plaintext in MyJKKN's `profiles.cal_api_key_encrypted`. Reference: `packages/features/ee/api-keys/lib/apiKeys.ts` lines 1-10.

**Pros:** Atomic, no Cal.com API call needed, idempotent on email, works with current jicate-booking deployment shape (no v1/v2 API server required for provisioning).
**Cons:** Couples MyJKKN to Cal.com's internal Prisma schema. Schema changes upstream become silent breaks. Mitigated by: pin to v6.2.0, add a smoke-test cron that does a no-op `GET /v2/me` daily and Sentry-alerts on schema mismatch.

#### 1b. (Fallback) `POST /v1/users` — admin scope required

```bash
POST /v1/users?apiKey=cal_<ADMIN_KEY>
Content-Type: application/json

{
  "email": "user@jkkn.ac.in",
  "username": "user-jkkn",
  "weekStart": "Monday",
  "timeZone": "Asia/Kolkata",
  "locale": "en"
}
```

Response:
```json
{ "user": { "id": 12345, "email": "user@jkkn.ac.in", "username": "user-jkkn", ... } }
```

Requires `apps/api/v1` deployed AND a system-wide admin API key. Idempotency: returns 409 conflict if email already exists — caller must catch and `GET /v1/users?email=...` to fetch existing.

#### 1c. (Reject) `POST /v2/oauth-clients/:clientId/users`

This is the v2 "managed user" endpoint. Marked `@DocsTags("Deprecated: Platform / Managed Users")` in the controller. Requires an OAuth client (Platform/atoms territory) which Agent F already rejected for cost reasons. Don't use.

---

### 2. List user's EventTypes

```
GET /v2/event-types
Authorization: Bearer cal_<user-key>
cal-api-version: 2024-08-13
```

Response:
```json
{
  "status": "success",
  "data": [
    {
      "id": 4567,
      "title": "30-min consultation",
      "slug": "consult-30",
      "lengthInMinutes": 30,
      "hidden": false,
      "scheduleId": 89,
      "locations": [{ "type": "cal-video" }],
      "bookingFields": [...],
      "ownerId": 1234,
      "userId": 1234,
      "teamId": null,
      "metadata": {},
      "scheduling": { "type": "default", "minimumBookingNotice": 120, ... }
    }
  ]
}
```

Filters: none required for our use case (v2 scopes by Bearer-token user automatically). Pagination: not paginated for personal event-types in v2 (v1 returns all rows in `event_types` array; v2 same). For users with > 200 event-types we'd need to revisit, but a single MyJKKN user typically has < 10.

---

### 3. Create EventType

```
POST /v2/event-types
Authorization: Bearer cal_<user-key>
cal-api-version: 2024-08-13
Content-Type: application/json

{
  "title": "30-min Counseling Session",
  "slug": "counseling-30",
  "lengthInMinutes": 30,
  "description": "One-on-one academic counseling.",
  "scheduleId": 89,
  "locations": [{ "type": "cal-video" }],
  "bookingFields": [],
  "minimumBookingNotice": 120,
  "metadata": {}
}
```

Required: `title`, `slug`, `lengthInMinutes`. Ownership scoped automatically to bearer-token user. Response wraps the created EventType in `{status, data}`.

---

### 4. Update EventType

```
PATCH /v2/event-types/:eventTypeId
Authorization: Bearer cal_<user-key>
cal-api-version: 2024-08-13
Content-Type: application/json

{
  "lengthInMinutes": 45,
  "minimumBookingNotice": 240
}
```

Partial payload accepted (all fields optional in `UpdateEventTypeInput_2024_06_14`). **Immutable post-create:** `id`, `userId`/`teamId`, `parentId` (managed events). `slug` IS mutable in v2 (verified in input DTO).

---

### 5. Delete EventType

```
DELETE /v2/event-types/:eventTypeId
Authorization: Bearer cal_<user-key>
cal-api-version: 2024-08-13
```

Cascade: deletes associated `Booking` rows where `Booking.eventTypeId = :id` and the eventType is set to null on past bookings (Prisma `onDelete: SetNull`). Webhooks linked to the eventType are deleted. Hashed-link rows cascade-delete.

---

### 6. List user's Schedules

```
GET /v2/schedules
Authorization: Bearer cal_<user-key>
cal-api-version: 2024-08-13
```

Response:
```json
{
  "status": "success",
  "data": [
    {
      "id": 89,
      "ownerId": 1234,
      "name": "Working Hours",
      "timeZone": "Asia/Kolkata",
      "isDefault": true,
      "availability": [
        {
          "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          "startTime": "09:00",
          "endTime": "17:00"
        }
      ],
      "overrides": []
    }
  ]
}
```

Shape note: v2 returns `availability` AND `overrides` arrays inline (one round-trip). v1 required calling `/v1/schedules/:id` then `/v1/availabilities?scheduleId=...` separately. This is the second strong reason to use v2.

---

### 7. Create Schedule (Mon–Fri 9–5)

```
POST /v2/schedules
Authorization: Bearer cal_<user-key>
cal-api-version: 2024-06-11
Content-Type: application/json

{
  "name": "Working Hours",
  "timeZone": "Asia/Kolkata",
  "isDefault": true,
  "availability": [
    {
      "days": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      "startTime": "09:00",
      "endTime": "17:00"
    }
  ]
}
```

`isDefault: true` sets this as the user's `defaultScheduleId` — used by all EventTypes that don't override. Only one schedule per user can be default; setting another `isDefault: true` automatically unsets the previous one.

---

### 8. Update Schedule (add/remove availability windows)

```
PATCH /v2/schedules/:scheduleId
Authorization: Bearer cal_<user-key>
cal-api-version: 2024-06-11
Content-Type: application/json

{
  "availability": [
    { "days": ["Monday", "Tuesday", "Wednesday", "Thursday"], "startTime": "09:00", "endTime": "17:00" },
    { "days": ["Friday"], "startTime": "09:00", "endTime": "13:00" }
  ],
  "overrides": [
    { "date": "2026-12-25", "startTime": "00:00", "endTime": "00:00" }
  ]
}
```

Replace-semantics: the `availability` array fully replaces existing windows for the schedule. To "remove a window" you re-PATCH without it. Overrides are date-specific exceptions (holidays, vacation days). All-zero start/end = "closed all day."

---

### 9. Delete Schedule

```
DELETE /v2/schedules/:scheduleId
Authorization: Bearer cal_<user-key>
cal-api-version: 2024-06-11
```

If the deleted schedule was the user's default, Cal.com unsets `User.defaultScheduleId`. EventTypes whose `scheduleId` referenced this schedule fall back to the user's new default (or null). **Beware:** v1 `_delete.ts` had no permission check (read the source: `apps/api/v1/pages/api/schedules/[id]/_delete.ts` lines 36-48 — no `checkPermissions(req)` call). v2 properly guards via `ApiAuthGuard + PermissionsGuard + SCHEDULE_WRITE`. Another v2 vote.

---

### 10. (Optional) Get current user — `/v2/me`

```
GET /v2/me
Authorization: Bearer cal_<user-key>
cal-api-version: 2024-08-13
```

Response:
```json
{
  "status": "success",
  "data": {
    "id": 1234,
    "email": "user@jkkn.ac.in",
    "username": "user-jkkn",
    "name": "Jane Doe",
    "timeZone": "Asia/Kolkata",
    "defaultScheduleId": 89,
    "weekStart": "Monday"
  }
}
```

Use this as the smoke test in the Path W health-check route — proves the stored API key is still valid for that user. v1 equivalent was `GET /v1/users/{userId}` which required knowing the userId in advance; v2's `/me` is cleaner.

---

### 11. (Read-only nice-to-have) List user's Bookings

```
GET /v2/bookings?status=upcoming
Authorization: Bearer cal_<user-key>
cal-api-version: 2024-08-13
```

We **mostly do not need this** — the `jicate_booking_mirror` table (PR #648) is the canonical read source for `/meetings/inbox`. Only call this endpoint for:
- One-off reconcile cron (already implemented in `lib/services/integrations/jicate-booking-reconcile-service.ts`)
- Drift-detection smoke test that compares mirror count vs source count

Filters: `status` (`upcoming|past|cancelled|recurring`), `dateFrom`, `dateTo`, `attendeeEmail`, `eventTypeIds`. Pagination via `take` + `skip` query params (default 100).

---

## Sample TypeScript interface (the MINIMAL contract for our API client)

```typescript
// lib/services/integrations/cal-com-api-client.ts

export interface CalEventType {
  id: number;
  title: string;
  slug: string;
  lengthInMinutes: number;
  hidden: boolean;
  description?: string;
  scheduleId?: number;
  locations: Array<{ type: string; address?: string; link?: string }>;
  minimumBookingNotice: number;
  metadata: Record<string, unknown>;
}

export interface CalEventTypeInput {
  title: string;
  slug: string;
  lengthInMinutes: number;
  description?: string;
  scheduleId?: number;
  locations?: Array<{ type: string; address?: string; link?: string }>;
  minimumBookingNotice?: number;
  hidden?: boolean;
  metadata?: Record<string, unknown>;
}

export interface CalScheduleAvailability {
  days: Array<'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'>;
  startTime: string; // "HH:mm"
  endTime: string;
}

export interface CalSchedule {
  id: number;
  name: string;
  timeZone: string;
  isDefault: boolean;
  availability: CalScheduleAvailability[];
  overrides: Array<{ date: string; startTime: string; endTime: string }>;
}

export interface CalScheduleInput {
  name: string;
  timeZone: string;
  isDefault?: boolean;
  availability: CalScheduleAvailability[];
  overrides?: Array<{ date: string; startTime: string; endTime: string }>;
}

export interface CalUser {
  id: number;
  email: string;
  username: string;
  name?: string;
  timeZone: string;
  defaultScheduleId?: number;
}

export interface CalComApiClient {
  // Auto-provisioning — implementation detail, returns existing user OR creates one
  // Idempotent on email. Throws on Cal.com DB error.
  ensureUser(input: { email: string; name?: string; timeZone?: string }): Promise<{
    user: CalUser;
    apiKeyPlaintext?: string; // populated only on first creation
  }>;

  // /v2/me
  getMe(): Promise<CalUser>;

  // EventTypes
  listEventTypes(): Promise<CalEventType[]>;
  createEventType(input: CalEventTypeInput): Promise<CalEventType>;
  updateEventType(eventTypeId: number, input: Partial<CalEventTypeInput>): Promise<CalEventType>;
  deleteEventType(eventTypeId: number): Promise<void>;

  // Schedules
  listSchedules(): Promise<CalSchedule[]>;
  createSchedule(input: CalScheduleInput): Promise<CalSchedule>;
  updateSchedule(scheduleId: number, input: Partial<CalScheduleInput>): Promise<CalSchedule>;
  deleteSchedule(scheduleId: number): Promise<void>;

  // Reconciliation only — UI uses jicate_booking_mirror instead
  listBookings(filter?: { status?: 'upcoming' | 'past' | 'cancelled'; dateFrom?: string; dateTo?: string }): Promise<unknown[]>;
}

// Factory pattern — one client instance per request, scoped to current MyJKKN user
export async function getCalClientForUser(supabaseUserId: string): Promise<CalComApiClient> {
  // 1. Look up profiles.cal_user_id and profiles.cal_api_key_encrypted
  // 2. If missing, run ensureUser() flow + provision
  // 3. Decrypt plaintext key
  // 4. Return client bound to that key
  throw new Error('NotImplemented — see PR #663');
}
```

---

## Gaps + workarounds

| Gap | Severity | Workaround |
|---|---|---|
| **No public POST /v2/users for self-host without OAuth** | Critical | Direct DB insert into `users` + `ApiKey` tables on jicate-booking Supabase via Supabase MCP. Implemented in `lib/services/integrations/cal-com-provisioning-service.ts` (Phase 2). |
| **API v2 not deployed on jicate-booking.vercel.app** | Critical (blocker for Phase 1) | Deploy a separate Vercel project `jicate-booking-api` (NestJS app at `apps/api/v2`). Set `NEXT_PUBLIC_API_V2_URL=https://api.jicate-booking.vercel.app/api/v2` on the web project so `/api/v2/*` rewrites work. Director decision. |
| **CALCOM_LICENSE_KEY required for v2** | High | Already set on jicate-booking-prod (existing self-host runs the v6.2.0 license check). Same env value must be copied to the api project. |
| **Cal.com ApiKey schema couples MyJKKN to internal Prisma model** | Medium | Pin jicate-booking to v6.2.0 in `package.json`. Add daily smoke-test cron that does `GET /v2/me` for one canary user; Sentry-alert on response shape change. |
| **No webhook for "user EventType list changed"** | Low | Path W reads on demand; no caching. Acceptable. |
| **Rate limit 120 rpm per API key** | Low | One key per user means 5000 users × 120 = 600,000 rpm headroom. Not a real ceiling at our scale. |
| **`days` field uses string array in v2 vs number array in v1** | Low | Type-safe at the client; no runtime hazard. |
| **Schedule overrides API may differ between v2 schedules_2024_06_11 vs schedules_2024_06_14** | Medium | Pin to `cal-api-version: 2024-06-11` for schedules per the controller's `version: [VERSION_2024_06_14, VERSION_2024_06_11]` declaration; verify with one canary call before fan-out. |
| **Bookings cancel/reschedule from MyJKKN UI** | Out of scope for Path W v1 | Defer to Path W v2; for now keep deep-link to jicate-booking (already implemented in `/meetings/inbox`). |

---

## Implementation plan for the implementer agents

Decomposed by file ownership for parallel execution. PR numbers are placeholders — actual PRs will be #663–#674 in the Path W rebuild batch.

### PR-W1: Cal.com API client lib (FOUNDATION — must merge first)

**Owned files:**
- `lib/services/integrations/cal-com-api-client.ts` (new, ~250 LOC)
- `lib/services/integrations/cal-com-types.ts` (new, ~80 LOC, the interfaces above)
- `lib/services/integrations/__tests__/cal-com-api-client.test.ts` (new, vitest)

**Contract with other PRs:**
- Exports `CalComApiClient` interface + `getCalClientForUser(supabaseUserId)` factory.
- All other Path W PRs MUST import only via the factory; direct `fetch()` against `api.jicate-booking.vercel.app` is forbidden.
- Throws typed errors: `CalAuthError` (401), `CalNotFoundError` (404), `CalRateLimitError` (429), `CalServerError` (5xx).

**Test plan:**
- Unit tests with `msw` mocking 9 endpoints; assert correct headers + payload shapes per the spec.
- One integration test against jicate-booking-prod with a test API key (gated by `CAL_INTEGRATION_TEST_KEY` env) hitting `GET /v2/me` only.

---

### PR-W2: Cal.com auto-provisioning service + DB column migration

**Depends on:** PR-W1
**Owned files:**
- `supabase/migrations/202605xx_profiles_cal_columns.sql` (new) — adds `cal_user_id`, `cal_api_key_encrypted`, `cal_api_key_hash` to `profiles`.
- `lib/services/integrations/cal-com-provisioning-service.ts` (new, ~150 LOC) — implements `ensureUser()` via Supabase MCP DB insert.
- `app/api/meetings/provision/route.ts` (new, ~40 LOC) — POST endpoint called by login hook.
- `lib/auth/post-login-hook.ts` (modify, +5 LOC) — fire-and-forget call to `/api/meetings/provision` after first login per session.

**Contract with other PRs:**
- Provides `ensureCalUserExists(userId)` server-action that PR-W3, W4, W5 call before any Cal API operation.
- Idempotent — safe to call N times per user; only inserts on first call.

**Test plan:**
- Migration applied to staging Supabase (`<MyJKKN-staging-ref>`) — run `\d profiles` and verify 3 new columns.
- Provision a fresh test user end-to-end: login → DB row appears in jicate-booking Supabase `users` table → API key works against `GET /v2/me`.

---

### PR-W3: Native `/meetings/manage` page (replace iframe)

**Depends on:** PR-W1, PR-W2
**Owned files:**
- `app/(routes)/meetings/manage/page.tsx` (rewrite — currently iframe wrapper)
- `app/(routes)/meetings/manage/_components/event-type-list.tsx` (new)
- `app/(routes)/meetings/manage/_components/event-type-form.tsx` (new)
- `app/api/meetings/event-types/route.ts` (new) — GET + POST proxies to Cal API
- `app/api/meetings/event-types/[id]/route.ts` (new) — GET + PATCH + DELETE proxies

**Contract with other PRs:**
- Owns ALL files under `app/(routes)/meetings/manage/**` and `app/api/meetings/event-types/**`.
- Does NOT touch `/meetings/availability` (PR-W4) or `/meetings/inbox` (already shipped).

**Test plan:**
- Browser test (cdp.py at localhost:3104): login, navigate to `/meetings/manage`, verify list renders, click "New event type", submit form, verify it appears in the list AND in jicate-booking's own UI at `https://jicate-booking.vercel.app/event-types`.
- Edit length on an existing event-type, verify update propagates.
- Delete an event-type, verify it disappears from BOTH MyJKKN and jicate-booking UIs.

---

### PR-W4: Native `/meetings/availability` page (replace iframe)

**Depends on:** PR-W1, PR-W2
**Owned files:**
- `app/(routes)/meetings/availability/page.tsx` (rewrite)
- `app/(routes)/meetings/availability/_components/schedule-list.tsx` (new)
- `app/(routes)/meetings/availability/_components/schedule-editor.tsx` (new)
- `app/api/meetings/schedules/route.ts` (new) — GET + POST
- `app/api/meetings/schedules/[id]/route.ts` (new) — GET + PATCH + DELETE

**Contract with other PRs:**
- Owns ALL files under `app/(routes)/meetings/availability/**` and `app/api/meetings/schedules/**`.

**Test plan:**
- Browser test: create new schedule "Working Hours", set Mon–Fri 09:00–17:00, save, verify on jicate-booking side.
- Edit existing default schedule, change Friday to half-day, verify the booking page now reflects shorter Friday window.
- Add a date override (e.g., 2026-12-25 closed), verify slots that day return empty.

---

### PR-W5: Embed wrapper deletion + dependency removal

**Depends on:** PR-W3, PR-W4 merged AND verified working in production
**Owned files:**
- `components/jicate-booking/embed.tsx` (DELETE)
- `components/jicate-booking/index.ts` (DELETE)
- `package.json` (modify) — remove `@calcom/embed-react` dependency
- `lib/integrations/jicate-booking-routes.ts` (modify if exists) — remove iframe URL builders

**Contract with other PRs:**
- Independent — no other PR depends on this and this depends only on W3+W4 being live.

**Test plan:**
- `grep -r 'JicateBookingEmbed\|@calcom/embed-react' .` returns zero matches.
- Build succeeds with smaller bundle (verify via `next build` size diff vs main).
- All three meetings routes (`/inbox`, `/manage`, `/availability`) load without iframe.

---

### Scheduling

PR-W1 → PR-W2 sequential (W2 imports W1 types).
PR-W3 + PR-W4 parallel (different file trees, no overlap).
PR-W5 last (cleanup).

Director-blocking step before ANY of the above: deploy `jicate-booking-api` Vercel project (see Risks).

---

## Risks / open questions for Director

1. **NEW Vercel project required.** The v2 API is a separate NestJS app at `apps/api/v2`. The current `jicate-booking.vercel.app` only deploys `apps/web`. To unblock Path W, Director must approve a second Vercel project — call it `jicate-booking-api` — pointing at the same monorepo with `outputDirectory: "apps/api/v2"` and `buildCommand: "yarn workspace @calcom/api-v2 build"`. Same Supabase DB, same `CALCOM_LICENSE_KEY`, separate URL (e.g., `api.jicate-booking.vercel.app`). Estimated 2-hour setup including env-var sync + smoke test. Alternatively: keep v1 deployed too (also a separate project) — but that means betting on a Cal.com-deprecated surface.

2. **Direct DB insert for user provisioning vs proper API endpoint.** The recommendation is to insert into Cal.com's `users` + `ApiKey` tables directly via Supabase MCP (project_ref `fkihmsuwruohdgsqvnxg`). This is faster and idempotent but couples MyJKKN to Cal.com's internal Prisma schema. Alternative: deploy the v1 API too just for `POST /v1/users` and `POST /v1/api-keys`, even though v1 is deprecated upstream. Decision needed: ship-fast (DB insert) vs strict-API (deploy v1+v2 both). Recommend ship-fast — the schema risk is mitigated by version-pinning + a daily canary check.

3. **Per-user API key storage shape.** PgCrypto-encrypted plaintext in `profiles.cal_api_key_encrypted` is the recommended approach, but it does mean the MyJKKN service-role key can decrypt every user's Cal.com key. Alternative: store a JWT signed by Cal.com (Platform model) — but that requires OAuth client setup, which Agent F rejected. A third option is to mint a short-lived (24h) key on every login and let the old one expire — but Cal.com's `expiresAt` is day-granularity (see `ApiKeyService.isExpired` lines 48-51 — `setHours(0,0,0,0)` comparison). Recommend: PgCrypto-encrypted long-lived keys, rotated on 401, with audit logging on every decrypt operation.

---

## Sources cited

### Local source paths inspected

- `/Users/omm/PROJECTS/jicate-booking/apps/api/v1/pages/api/event-types/_post.ts` — v1 EventType POST handler with Swagger docs
- `/Users/omm/PROJECTS/jicate-booking/apps/api/v1/pages/api/event-types/_get.ts` — v1 EventType GET (list)
- `/Users/omm/PROJECTS/jicate-booking/apps/api/v1/pages/api/event-types/[id]/_get.ts` + `_patch.ts` + `_delete.ts`
- `/Users/omm/PROJECTS/jicate-booking/apps/api/v1/pages/api/schedules/_post.ts` + `_get.ts`
- `/Users/omm/PROJECTS/jicate-booking/apps/api/v1/pages/api/schedules/[id]/_patch.ts` + `_delete.ts`
- `/Users/omm/PROJECTS/jicate-booking/apps/api/v1/pages/api/availabilities/_post.ts` + `[id]/_patch.ts`
- `/Users/omm/PROJECTS/jicate-booking/apps/api/v1/pages/api/users/_post.ts` + `_get.ts` + `[userId]/_get.ts` + `_patch.ts`
- `/Users/omm/PROJECTS/jicate-booking/apps/api/v1/pages/api/api-keys/_post.ts` + `_get.ts`
- `/Users/omm/PROJECTS/jicate-booking/apps/api/v1/pages/api/bookings/_get.ts`
- `/Users/omm/PROJECTS/jicate-booking/apps/api/v1/lib/helpers/verifyApiKey.ts` — auth middleware
- `/Users/omm/PROJECTS/jicate-booking/apps/api/v1/lib/utils/isAdmin.ts` — admin scope check
- `/Users/omm/PROJECTS/jicate-booking/apps/api/v1/lib/helpers/withMiddleware.ts` — middleware composition
- `/Users/omm/PROJECTS/jicate-booking/apps/api/v1/lib/validations/event-type.ts` — Zod schemas
- `/Users/omm/PROJECTS/jicate-booking/apps/api/v1/lib/validations/schedule.ts`
- `/Users/omm/PROJECTS/jicate-booking/apps/api/v1/lib/validations/availability.ts`
- `/Users/omm/PROJECTS/jicate-booking/apps/api/v1/lib/selects/event-type.ts` — response shape
- `/Users/omm/PROJECTS/jicate-booking/apps/api/v1/proxy.ts` — proves `_get.ts` etc. are blocked from public routing
- `/Users/omm/PROJECTS/jicate-booking/apps/api/v2/src/ee/event-types/event-types_2024_06_14/controllers/event-types.controller.ts` — v2 EventType controller (NestJS)
- `/Users/omm/PROJECTS/jicate-booking/apps/api/v2/src/ee/schedules/schedules_2024_06_11/controllers/schedules.controller.ts`
- `/Users/omm/PROJECTS/jicate-booking/apps/api/v2/src/ee/me/me.controller.ts`
- `/Users/omm/PROJECTS/jicate-booking/apps/api/v2/src/modules/auth/strategies/api-auth/api-auth.strategy.ts` — confirms v2 supports plain Bearer API keys
- `/Users/omm/PROJECTS/jicate-booking/apps/api/v2/src/modules/oauth-clients/controllers/oauth-client-users/oauth-client-users.controller.ts` — managed-user controller (rejected)
- `/Users/omm/PROJECTS/jicate-booking/apps/api/v2/src/modules/api-keys/controllers/api-keys.controller.ts` — only has /refresh
- `/Users/omm/PROJECTS/jicate-booking/packages/features/ee/api-keys/lib/apiKeys.ts` — `generateUniqueAPIKey` + `hashAPIKey`
- `/Users/omm/PROJECTS/jicate-booking/packages/features/ee/api-keys/services/ApiKeyService.ts` — verification logic
- `/Users/omm/PROJECTS/jicate-booking/packages/features/users/services/userCreationService.ts` — UserCreationService for ref
- `/Users/omm/PROJECTS/jicate-booking/packages/prisma/schema.prisma` — `ApiKey` model definition
- `/Users/omm/PROJECTS/jicate-booking/apps/web/next.config.ts` — confirms `/api/v2/:path*` rewrite to `NEXT_PUBLIC_API_V2_URL`
- `/Users/omm/PROJECTS/jicate-booking/turbo.json` — global env vars including `API_KEY_PREFIX`, `CALCOM_LICENSE_KEY`
- `/Users/omm/PROJECTS/MyJKKN/lib/services/integrations/jicate-booking-mirror-service.ts` — current inbound webhook surface (DO NOT MODIFY)
- `/Users/omm/PROJECTS/MyJKKN/app/(routes)/meetings/inbox/page.tsx` — read-only inbox (DO NOT MODIFY)
- `/Users/omm/PROJECTS/MyJKKN/app/(routes)/meetings/manage/page.tsx` — current iframe (REPLACE in PR-W3)
- `/Users/omm/PROJECTS/MyJKKN/app/(routes)/meetings/availability/page.tsx` — current iframe (REPLACE in PR-W4)
- `/Users/omm/PROJECTS/MyJKKN/specs/cal-com-embed-sso.md` — Agent F's iframe research (companion)

### External URLs

- [Cal.com v1 to v2 migration guide](https://cal.com/docs/api-reference/v2/v1-v2-differences) — confirms v1 deprecation, auth header change, endpoint mapping
- [Cal.com v5.6 deprecation announcement](https://cal.com/blog/calcom-v5-6) — original v1 deprecation notice (Aug 2025)
- [Cal.com self-hosting installation](https://cal.com/docs/self-hosting/installation) — confirms 2GB RAM minimum, monorepo structure
- [Cal.com self-host on Vercel](https://cal.diy/deployments/vercel) — Pro plan required, monorepo on multiple Vercel projects
- [Cal.com cloud API authentication docs](https://cal.com/docs/enterprise-features/api) — confirms Bearer auth for v2, 120 rpm rate limit
- [Cal.com goes private — context](https://cal.com/blog/cal-diy-open-source-to-closed-source) — explains why we self-host on jicate v6.2.0 and not bleeding edge
- [Cal.com API v1 deprecation status (Make community)](https://community.make.com/t/cal-com-api-deprecation-any-impact-or-downtime-expected-after-feb-15-2026/103091) — community confirmation of shutdown timeline
- [Cal.com license key docs](https://cal.com/docs/self-hosting/license-key) — `CALCOM_LICENSE_KEY` requirement for self-host

### Cross-references in this codebase

- `feedback_calcom_self_host_v6_realities` (memory) — Cal.com v6 self-host pitfalls (license, pooler, IPv6, ports)
- `feedback_three_remote_fork_routing` (memory) — push to `jicate` remote, PR on Jicate-Solutions/MyJKKN
- `feedback_vercel_env_var_redeploy_required` (memory) — applies to setting `NEXT_PUBLIC_API_V2_URL` on the web project
- `feedback_vercel_cli_cwd_resolution` (memory) — applies when running `vercel env add` for the new api project
