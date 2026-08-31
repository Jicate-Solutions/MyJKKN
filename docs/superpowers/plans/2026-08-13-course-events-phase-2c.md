# Course Events — Phase 2c (Sessions + Venue Holds) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin schedule a course's sittings and hold a real room for each one through the existing Resource Management booking spine — the layer Phase 6's attendance reads.

**Architecture:** The house four-layer stack (service → hook → the Sessions tab already scaffolded on `/courses/[id]`), plus one **change to shared infrastructure**: `ReservationService.createReservation` cannot currently write `resource_reservations.course_session_id` at all. See Task 1.

**Tech Stack:** PostgreSQL 15 (Supabase), Next.js 16 App Router, React 19, TanStack Query v5, react-hook-form + Zod, Shadcn UI.

**Spec:** `docs/superpowers/specs/2026-08-13-course-events-design.md` §3.2 and §9a.
**Branch:** `feat/course-events-phase-2c`, based on Phase 2b's tip (`efc0790ac` on `feat/course-events-phase-2b`) or on main once 2b merges.

---

## Why this phase adds NO migration

Verified against the live database on 2026-08-17. Phase 1 already shipped everything:

| Object | State |
|---|---|
| `course_sessions` (16 cols) | exists; `course_sessions_time_order_chk CHECK (end_time > start_time)` |
| FKs | `course_event_id`→`course_events` CASCADE, `institution_id`, `trainer_profile_id`→`profiles` SET NULL, `venue_resource_id`→`resources` SET NULL, `reservation_id`→`resource_reservations` SET NULL |
| RLS | `course_sessions_manage` (`courses.sessions.manage` AND `role_has_institution_access`), `course_sessions_select` (`courses.view`), `course_sessions_participant_select` (enrolled only) |
| `resource_reservations.course_session_id` | exists, plus `resource_reservations_single_owner_check CHECK (num_nonnulls(event_id, session_id, course_session_id) <= 1)` |
| Indexes | `idx_course_sessions_event (course_event_id, session_date)`, `idx_course_sessions_date` partial on `NOT is_cancelled`, `idx_resource_reservations_course_session` partial |
| Permission key | `courses.sessions.manage` declared AND granted to Administrator, COO, SEO Specialist |
| `types/supabase.ts` | `course_sessions` registered at line ~23174 |

**If you find yourself writing a migration in this phase, stop and ask.** The one exception worth raising first is a `UNIQUE (course_event_id, session_no)` — deliberately absent today, and this plan does not add it (see Task 4, Step 3).

---

## The finding that shapes this whole phase

**`ReservationService.createReservation` has no way to write `course_session_id`.** Phase 1 added the column; nothing populates it.

`lib/services/reservation/reservation-service.ts:299-303` builds the insert with an explicit allow-list:

```typescript
// Booking-spine links — only set when the caller provides them.
...(dto.event_id ? { event_id: dto.event_id } : {}),
...(dto.session_id ? { session_id: dto.session_id } : {}),
...(dto.bundle_id ? { bundle_id: dto.bundle_id } : {}),
...(dto.session_label ? { session_label: dto.session_label } : {})
```

and `CreateReservationDto` (`types/reservation.ts:80-110`) declares only those four links. An extra key passed by a caller is dropped silently here — it never reaches PostgREST. So without Task 1, every course venue hold would look successful and leave `course_session_id` permanently NULL, breaking the link Phase 6 needs and leaving the Phase 1 CHECK constraint guarding nothing.

**This is the only place this module reaches into live shared infrastructure that Resource Management and Events both depend on.** Treat Task 1 accordingly: additive, optional, and provably inert for existing callers.

> **Trap: there are TWO `CreateReservationDto` interfaces.**
> `types/reservation.ts:80` — the one `ReservationService` imports (see its import block, line 34).
> `types/resource-management.ts:579` — a different one.
> Editing the wrong file is a silent no-op that typechecks. Confirm the import before you edit.

---

## Global Constraints

- **This phase adds NO migration.** Everything is TypeScript. If you think you need one, stop and ask.
- **There is NO test suite.** Never write "run the tests" and never claim tests pass.
- **`mcp__ide__getDiagnostics` IS available again** (it was down during Phase 2a; it worked throughout 2b). Use it per file — it is the same TS server as a full `tsc` and takes seconds, where `npm run typecheck` takes 3-4 minutes and OOMs. Also run `npx eslint <file>` and **read its output**: this repo's `react-hooks/incompatible-library` findings are *warnings*, so eslint still exits 0 while reporting a real problem.
- **A dev server runs on :3000.** Do **NOT** run `npm run dev` — `predev` prunes the cache of the already-running server and corrupts it. The automated Chrome has no session, so browser verification needs the user to log in first; state plainly whether you got one.
- **SHARED WORKING DIRECTORY.** Another session works in this same checkout and *switches branches under you*. During Phase 2b it checked out a different branch mid-task. Therefore:
  - `git branch --show-current` **before every commit** — are you still on your branch?
  - `git diff <path>` before staging — is every hunk yours?
  - `git diff --cached` before committing — does the index hold ONLY your files?
  - `git commit -m "msg" -- <paths>` — **never a bare `git commit`**. Note `-m` and its message come BEFORE the `--`.
  - `git show --stat HEAD` after — do the file list and counts match your edit?
- `institution_id` stays NOT NULL on everything. Never write `institution_id IS NULL` as a privilege test, in SQL or JS (spec §9a).
- Do NOT write a second booking path. `ReservationService` is the one spine; extend it, then call it.

---

## Failure modes carried forward — read before writing code

**1. The optional-number Zod trap.** `z.coerce.number().int().positive().optional()` is broken for a cleared input: the input reports `''`, coerce makes it `0`, `.positive()` rejects it, and `.optional()` does not help because the value is *present* as `''`. Use the `preprocess` form for every nullable numeric — `session_no` here:

```typescript
session_no: z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.number().int().positive().optional(),
),
```

**2. A `DataTable` in `fetchDataFn` mode cannot be refreshed by `invalidateQueries` alone.** The bridge fires only on invalidate events from an already-cached query, and a `fetchDataFn` table registers none. **Phase 2b's packages panel used a plain list from a React Query hook and had no such problem — do the same here.** Sessions are a schedule, not a paginated dataset.

**3. Normalisation layers can route around each other.** Phase 2a mapped `'' → null` in the service and `'' → undefined` in the form; together, a cleared numeric reached PostgREST as `undefined`, which `JSON.stringify` drops from the PATCH, so the column silently never updated. Check what the layers either side already do before adding a third.

**4. `form.watch()` on a field array kills React Compiler optimisation** (`react-hooks/incompatible-library`). Use `useWatch({ control, name })`, and compute derived values inline rather than in `useMemo`. `course-form.tsx` gets away with `form.watch('title')` only because it reads one scalar — do not generalise from it.

**5. PostgREST returns `numeric` as a string.** Less relevant here than in 2b (sessions carry no money), but `session_no` is an `int` and arrives as a number — do not add a `Number()` pass you do not need.

---

## Two shapes you must design around

### A. The FK cycle

`course_sessions.reservation_id` → `resource_reservations.id`, **and** `resource_reservations.course_session_id` → `course_sessions.id`. Neither can be written before the other exists. The only correct order is:

1. INSERT the session (no `reservation_id`).
2. Create the reservation with `course_session_id = <the new session id>`.
3. UPDATE the session's `reservation_id`.

**These are three round trips across two subsystems and CANNOT be one transaction** — `course_sessions` is written through `BaseService`/PostgREST while `ReservationService` uses its own browser client. So step 2 or 3 failing must be *compensated*, not rolled back. `holdEventVenue` already models this (`releaseHolds` on failure); follow it.

Decide explicitly and write it in a comment: **a session whose venue hold failed is still a session.** Keep the row, leave `reservation_id` NULL, and surface "not reserved" in the UI — the events module reached the same conclusion (it renders "… (not reserved)"). Deleting a scheduled sitting because a room was busy would be worse.

### B. `ReservationService` is browser-only and takes the user id explicitly

It calls `createClientSupabaseClient()` — **not** `BaseService.supabase`, so it has no request-scoped server client and must not be called from a server route handler in this phase. `createReservation(dto, userId)` needs the caller's `profiles.id` (== `auth.uid()`) passed in; `hooks/reservation/use-reservation-operations.ts:29` shows the house way to get it.

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `lib/services/courses/course-session-service.ts` | Session CRUD + the hold/release orchestration |
| `hooks/courses/use-course-sessions.ts` | React Query hooks |
| `app/(routes)/courses/[id]/_components/sessions-panel.tsx` | The Sessions tab body |
| `app/(routes)/courses/[id]/_components/session-form.tsx` | Session editor incl. trainer + venue |

**Modify**

| File | Change |
|---|---|
| `types/reservation.ts` | Add `course_session_id?: string` to `CreateReservationDto` (Task 1) |
| `lib/services/reservation/reservation-service.ts` | Add the `course_session_id` spread to the insert (Task 1) |
| `types/courses.ts` | Session types and DTOs |
| `lib/query/query-keys.ts` | `queryKeys.courseSessions` |
| `app/(routes)/courses/[id]/page.tsx` | Replace the Sessions Coming-Soon panel |

---

## Task 1: Teach the booking spine about course sessions

**Files:**
- Modify: `types/reservation.ts`, `lib/services/reservation/reservation-service.ts`

**Interfaces:**
- Produces `CreateReservationDto.course_session_id?: string`, honoured by `ReservationService.createReservation`. Task 3 depends on it.

- [ ] **Step 1: Confirm which DTO is live.** Open `lib/services/reservation/reservation-service.ts` and read its import block — it imports from `@/types/reservation` (line 34). `types/resource-management.ts:579` declares a same-named interface that is NOT the one in play. Note the line numbers you verified.

- [ ] **Step 2: Add the field to `types/reservation.ts`**, inside the existing "Booking-spine links" block (lines 92-103), matching the comment style of its three siblings. One line plus a docstring naming the column.

- [ ] **Step 3: Add the spread to the insert** in `createReservation`, alongside the existing four:

```typescript
...(dto.course_session_id ? { course_session_id: dto.course_session_id } : {}),
```

**Keep the conditional-spread form.** It is what makes the change inert for every existing caller: absent ⇒ the key is not in the insert at all.

- [ ] **Step 4: Reason about the CHECK before you move on.** `resource_reservations_single_owner_check` is `num_nonnulls(event_id, session_id, course_session_id) <= 1`. A course hold must therefore pass `course_session_id` and **neither** `event_id` nor `session_id`. Add a one-line comment saying so at the new spread, so a later reader does not "helpfully" set both.

- [ ] **Step 5: Verify the change cannot affect events.** Confirm by reading, and state in your report: (a) the only other callers are `lib/services/events/venue/event-venue.ts:278` and `hooks/reservation/use-reservation-operations.ts:29`; (b) neither passes `course_session_id`; (c) the field is optional, so no call site needs updating. `mcp__ide__getDiagnostics` on both files must be clean.

- [ ] **Step 6:** `npx eslint` on both modified files, `getDiagnostics` on both, then commit. This is a shared-infrastructure change — say so in the commit message, and say what proves it is inert.

---

## Task 2: Types and query keys

**Files:**
- Modify: `types/courses.ts`, `lib/query/query-keys.ts`

**Interfaces:**
- Produces `CourseSession`, `CreateCourseSessionDto`, `UpdateCourseSessionDto`, and `queryKeys.courseSessions` with `all`, `lists()`, `list(courseEventId)`, `details()`, `detail(id)`. Tasks 3-5 import these names verbatim.

- [ ] **Step 1: Derive the row type from the generated `Database` type**, exactly as `types/courses.ts` already does for `CourseEventRow` and `CoursePackageRow` — not hand-written columns, so a schema change surfaces as a type error.

- [ ] **Step 2: Model the joins the panel needs** — `venue_resource?: { id, name } | null`, `trainer?: { id, full_name } | null`, `reservation?: { id, status, start_time, end_time } | null`. Optional, because list reads may not join all three.

- [ ] **Step 3: Keep the DTO honest about the two-step.** The create DTO carries the session's own columns plus the *desired* venue (`venue_resource_id`); it must NOT carry `reservation_id`, which only exists after step 2 of the cycle. Model the hold result separately (e.g. `{ session, held: boolean, reason?: string }`) so the UI can say "scheduled, room not held".

- [ ] **Step 4: Add the query-key factory** matching `queryKeys.coursePackages` (added in 2b). `list(courseEventId)` must spread `...lists()`.

- [ ] **Step 5:** `getDiagnostics`, `npx eslint`, commit.

---

## Task 3: CourseSessionService

**Files:**
- Create: `lib/services/courses/course-session-service.ts`

**Interfaces:**
- Consumes Task 1's and Task 2's types. Produces `listByCourse(courseEventId)`, `getById(id)`, `create(dto, userId)`, `update(id, dto, userId)`, `remove(id)`, `cancel(id)`.

- [ ] **Step 1: Read `lib/services/courses/course-package-service.ts` first** (Phase 2b) and match its shape — `nullifyBlanks`-style normalisation, left joins, and the read-back-on-delete guard.

- [ ] **Step 2: Reads are ordinary table reads.** RLS gates them. Order by `session_date`, then `start_time`. Use **left** joins for venue/trainer/reservation — `!inner` would silently drop every session that has no room yet, which is most of them while a course is being planned.

- [ ] **Step 3: Implement `create` as the three-step cycle from Shape A**, in this order, and comment why the order is forced:
  1. insert the session,
  2. `ReservationService.createReservation({ ..., course_session_id: session.id }, userId)`,
  3. update `reservation_id`.

  If step 2 throws, **keep the session** and return `{ session, held: false, reason }`. If step 3 fails after step 2 succeeded, release the reservation you just made (mirror `releaseHolds`) rather than leaving an orphan hold nobody can see.

- [ ] **Step 4: Copy `holdEventVenue`'s refusals, do not reinvent them.** Read `lib/services/events/venue/event-venue.ts:233-321`. Before booking, load the resource and honour:
  - `is_reservable === false` → refuse
  - `booking_type === 'walk_in'` → refuse
  - same institution as the course → `approvalMode: 'auto'`; different institution → `'require'` **plus** caretaker approvers
  - cross-institution room with **no resolvable approver** → refuse honestly rather than creating a `pending` hold nobody can ever approve

  That last rule is the one most likely to be dropped as an edge case. It is not one — it is the difference between "we could not get you that room" and a hold that silently never resolves.

- [ ] **Step 5: Changing a scheduled session's time or room must move the hold.** Releasing the old reservation and creating a new one is correct and simple; mutating a reservation's times in place bypasses `checkAvailability`. Whichever you choose, write down why. **Never** leave the old hold occupying a room the session has moved out of.

- [ ] **Step 6: `cancel` sets `is_cancelled = true` AND releases the hold.** A cancelled sitting that still occupies the hall is the most expensive bug this phase can ship. `remove` (hard delete) must do the same before deleting.

- [ ] **Step 7: Guard the silent-denial shape.** Under RLS a blocked UPDATE/DELETE affects zero rows and returns **no error**. Use `.select(...)` read-backs on `update`, `cancel` and `remove` and throw when nothing came back — the pattern `CoursePackageService.remove()` established in 2b.

- [ ] **Step 8:** `getDiagnostics`, `npx eslint`, commit.

---

## Task 4: Hooks

**Files:**
- Create: `hooks/courses/use-course-sessions.ts`

**Interfaces:**
- Produces `useCourseSessions(courseEventId)`, `useCourseSession(id)`, `useCreateCourseSession()`, `useUpdateCourseSession()`, `useCancelCourseSession()`, `useDeleteCourseSession()`.

- [ ] **Step 1: Read `hooks/courses/use-course-packages.ts`** and match it, including `getErrorMessage()` — Supabase errors are plain objects, so `instanceof Error` always falls through.

- [ ] **Step 2: A partial success is not a success toast.** When `create` returns `held: false`, the session WAS scheduled but the room was NOT held. Show a warning that says both, using the refusal reason from Task 3 Step 4 (`not_reservable` / `walk_in` / `no_approver` / `taken`). A green "Session created" here would be a lie the user only discovers on the day.

- [ ] **Step 3: `userId`.** These hooks must supply the caller's `profiles.id` to the service (which forwards it to `createReservation`). Get it the way `hooks/reservation/use-reservation-operations.ts:29` does. Do not re-derive it in the service.

- [ ] **Step 4: Invalidate `queryKeys.courseSessions.lists()`** on every mutation, plus `detail(id)` on update. A hold also changes a *reservation*, so invalidate the reservation keys too if the Resource Management calendar is cached under them — check `lib/query/query-keys.ts` before assuming either way.

- [ ] **Step 5:** `getDiagnostics`, `npx eslint`, commit.

---

## Task 5: The Sessions tab

**Files:**
- Create: `app/(routes)/courses/[id]/_components/sessions-panel.tsx`, `…/session-form.tsx`
- Modify: `app/(routes)/courses/[id]/page.tsx` (replace `ComingSoonPanel`, and the header comment above it, which Phase 2b already narrowed to mention only 2c)

- [ ] **Step 1: Read `app/(routes)/courses/[id]/_components/packages-panel.tsx`** — the sibling Phase 2b built. Match its structure: plain list, `usePermissions().canAccess('courses', 'sessions.manage')` for mutations, Shadcn `Dialog` for the form with `key={editing?.id ?? 'new'}`, `AlertDialog` for destructive confirms. **Glob/Grep patterns containing `[id]` match nothing** — brackets read as a character class. Open by direct path.

- [ ] **Step 2: Build the panel** — sessions ordered by date and start time, each showing number, title, date, time range, trainer (internal name or the free-text one), venue, and **the hold state**. Make "not reserved" visually distinct from "reserved" and from "pending approval"; that is the single most useful fact on this screen. Cancelled sessions stay visible, struck through — they are schedule history.

- [ ] **Step 3: Build the form.** Fields: `session_no` (optional, `z.preprocess`), `title`, `session_date`, `start_time`, `end_time`, trainer (internal picker → `trainer_profile_id` **or** free-text `trainer_name`), venue (resource picker → `venue_resource_id` **or** free-text `venue_text`), and a note that saving will try to hold the room.

  Mirror `course_sessions_time_order_chk` as a Zod `.refine` on `end_time > start_time`, so it is a field message rather than a Postgres error.

  For the trainer and venue pickers, find and reuse what Resource Management and Events already use — do not build a third resource picker. If no reusable picker exists, say so and propose one before building.

- [ ] **Step 4: Verify.** `getDiagnostics` and `npx eslint` on each file (read the warnings, not just the exit code). Reason explicitly about hook rules — all hooks unconditional, at top level.

- [ ] **Step 5: Commit.**

---

## Phase 2c completion criteria

Observe, do not assume:

1. `course_session_id` is genuinely populated. Create a session with a venue, then prove it in SQL:
   `SELECT id, course_session_id, event_id, session_id, status FROM resource_reservations WHERE course_session_id IS NOT NULL;`
   A row here with `course_session_id` NULL is Task 1 not working. **Clean up anything a probe creates.**
2. `num_nonnulls(event_id, session_id, course_session_id) = 1` on every course hold.
3. Cancelling a session releases its hold — verify the reservation's status in SQL, not in the UI.
4. A refused hold (non-reservable room, or cross-institution with no approver) leaves the session row intact with `reservation_id` NULL, and the UI says so.
5. `mcp__ide__getDiagnostics` clean and `npx eslint` **warning-free** on every created/modified file.
6. Events still book rooms. State what you read that proves Task 1 is inert for them.
7. Every commit's `git show --stat` matches its intended file list, and `git branch --show-current` was checked first — shared working directory.

**Do not claim tests pass.** There is no suite. State what you ran and what it returned. If you got no browser session, say browser verification is outstanding.

---

## Notes for Phase 3

- Phase 3 (registration forms + public `/course/[slug]`) is the first phase that adds **public** routes. `proxy.ts` must gain `'/course/'` and `'/api/public/courses/'` in `PUBLIC_PATH_PREFIXES`, or applicants are 302'd to `/auth/login` before the route handler runs. Public routes also need their own `<Toaster>`.
- **The public prefix is `'/course/'`, singular, and NEVER `'/learn/'`.** The spec originally said `/learn/[slug]`; that was corrected on 2026-08-17 (see spec §7.2) because `app/(routes)/learn/` is the authenticated Foundation module — 16 live routes — and `isPublicPath` matches by `startsWith`, so allow-listing `'/learn/'` would have unauthenticated all of them. Equally, do not shorten `'/course/'` to `'/course'`: the trailing slash is the only thing stopping it matching `/courses/[id]`.
- Build the form builder with `form_id` on fields **from day one** (spec §3.3). The Events module hung fields off sections only, and the moment a second form existed it rendered every other form's fields.
- Spec §9a: an external applicant cannot read their own pending application — the self-clause keys on `profile_id`, which is NULL until approval. Design the status page around a token or a service-role read.
