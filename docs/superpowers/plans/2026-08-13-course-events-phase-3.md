# Course Events — Phase 3 (Registration Forms + Public Pages) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A person with no JKKN account can find a course at a public URL, see its package tiers, fill a form the admin designed, and land in `course_applications` as `pending`. This is the first phase that exposes anything unauthenticated.

**Architecture:** An admin-side form builder on the house four-layer stack, plus a **public surface** that does NOT use RLS at all: public pages are server components and public writes are service-role route handlers, because `anon` is revoked on every course table (verified — a bare anon read returns `42501`).

**Tech Stack:** PostgreSQL 15 (Supabase), Next.js 16 App Router, React 19, TanStack Query v5, react-hook-form + Zod, Shadcn UI.

**Spec:** `docs/superpowers/specs/2026-08-13-course-events-design.md` §3.3, §3.4, §7.2, §9a.
**Branch:** `feat/course-events-phase-3`, based on main at Phase 2c's tip.

---

## Scope boundary — read this first

Phase 3 ends at **a `pending` row in `course_applications`**. It does NOT:

- approve anything, mint a MyJKKN ID, or create an enrollment (Phase 4)
- generate a bill or take a payment (Phase 4 / 5)
- give the applicant a login or a status page they can sign into (Phase 4 mints the identity; see the §9a problem below)

That boundary is decision **D6** in the spec, and it is deliberate: auto-enrolling on form submit would provision an auth identity, a login and a ₹2.5 lakh bill for **every abandoned form**.

---

## What already exists (verified live, 2026-08-17)

| Object | State |
|---|---|
| `course_registration_forms` | exists. `is_enabled` NOT NULL **DEFAULT false**, `UNIQUE (course_event_id, slug)`, slug format CHECK |
| `course_registration_form_sections` | exists. `form_id` NOT NULL, cascade |
| `course_registration_form_fields` | exists. **`form_id` NOT NULL** and `section_id` NULLABLE — the Events bug is already designed out at the schema level. `options` jsonb NOT NULL DEFAULT `'[]'`, `validation` jsonb NOT NULL DEFAULT `'{}'` |
| `course_applications` | exists. `custom_fields` jsonb NOT NULL DEFAULT `'{}'`, `applicant_name` + `applicant_phone` NOT NULL, `applicant_email` NULLABLE, `status` DEFAULT `'pending'` |
| `event_external_participants` | exists and is REUSED, not duplicated. `full_name` + `phone` NOT NULL, everything else nullable, **no `institution_id`** — a global person register shared with Events |
| Permission keys | `courses.forms.manage`, `courses.applications.view`, `courses.applications.decide` all declared AND granted |
| `types/supabase.ts` | all four tables registered |
| `anon` on course tables | **revoked** — confirmed live, a bare anon read returns `42501 permission denied` |

**Only ONE migration is needed** (Task 1). Everything else is TypeScript.

---

## The three constraints that shape the design

### A. A public application is TWO writes, not one

```
course_applications_identity_chk CHECK (
     (applicant_type = 'learner'  AND learner_id IS NOT NULL)
  OR (applicant_type = 'staff'    AND profile_id IS NOT NULL)
  OR (applicant_type = 'external' AND external_participant_id IS NOT NULL)
)
```

An external applicant **cannot** be inserted alone. The submit route must upsert `event_external_participants` **by phone** first, take its id, then insert the application. Order is forced; there is no single-statement version.

Upsert by phone, not by email: `phone` is NOT NULL on that table and `email` is not, and the same human applying twice must not become two people. This is the deliberate `courses → event_*` dependency the spec names in §3.4.

### B. The applicant cannot read their own pending application

`course_applications_select` grants `... OR (profile_id = auth.uid())`. For an external applicant `profile_id` is **NULL until Phase 4 approves them**, so that clause matches nothing.

**Consequence for this phase:** there is no "check my application status" page. Do not build one that silently returns empty. Phase 3 ends at a confirmation screen rendered from the submit response. If a status page is wanted later it needs a token in the URL or a service-role read — decide that in Phase 4, not here.

### C. Whether applications are OPEN is decided by the window, not a status

There is deliberately no `closed` status on `course_events` (spec §3.1) — two switches controlling one behaviour is how intake states drift. The public page must compute open/closed from `application_opens_at` / `application_closes_at`, treating NULL as "no bound on that side".

A course must ALSO be `status = 'published'` and have at least one `is_enabled` form to accept anything.

---

## Global Constraints

- **This phase adds ONE migration.** If you find yourself writing a second, stop and ask.
- **There is NO test suite.** Never write "run the tests" and never claim tests pass.
- **`mcp__ide__getDiagnostics` is available.** Use it per file. Do NOT run `npm run typecheck` (3-4 min, OOMs). Also run `npx eslint <file>` and **read the output** — `react-hooks/incompatible-library` is a *warning*, so eslint still exits 0.
- **A dev server is already running on :3000.** Do NOT run `npm run dev` — `predev` prunes the cache of the running server and corrupts it.
- **SHARED WORKING DIRECTORY.** Another session works in this checkout and switches branches under you. `git branch --show-current` before every commit; `git diff --cached` before committing; `git commit -m "msg" -- <paths>`, never a bare `git commit`; `git show --stat HEAD` after.
- `institution_id` stays NOT NULL on everything. Never write `institution_id IS NULL` as a privilege test.
- **`useAuth()` gives `{ profile, isLoading, error }` only.** Use `usePermissions().canAccess('courses', 'forms.manage')` and `<PermissionGuard module="courses" action="forms.manage">`.
- Use `useWatch`, not `form.watch()`, whenever a watched value is consumed in render or passed to a child — otherwise React Compiler skips optimising the whole component.
- Terminology: UI copy uses "instalment" (single l); code and DB use `installment`.

---

## SECURITY — this phase is different from 2a/2b/2c

Those phases were entirely behind login. This one is not. Every item below is a real failure this repo has already had at least once.

1. **`proxy.ts` prefixes must be `'/course/'` and `'/api/public/courses/'` — WITH the trailing slash.**
   `isPublicPath` matches by `path.startsWith(prefix)` (`proxy.ts:210-212`). `'/course'` without the slash would match `/courses` and `/courses/[id]` and make the **entire admin module public**. The trailing slash is the only thing preventing that.
   Equally: **never** allow-list `'/learn/'` — `app/(routes)/learn/` is the authenticated Foundation module (16 routes). The spec used to say to; it was corrected on 2026-08-17.

2. **The service-role key is server-only.** `SUPABASE_SERVICE_ROLE_KEY` may appear in a server component or a route handler and NOWHERE else. It bypasses RLS entirely. Never import it into a `'use client'` file, never pass it as a prop.

3. **Only the public subset of columns may reach the browser.** Project columns explicitly; never `select('*')` on a public path. `institution_id`, `created_by`, internal ids and anything about other applicants must not appear in the payload. Pattern: `app/(public)/r/[slug]/page.tsx` builds an explicit `PublicForm` object.

4. **Rate-limit and honeypot the submit route.** Pattern: `app/api/public/forms/[slug]/submit/route.ts` — per-IP counter plus an invisible field that, when filled, returns a fake success. Copy the shape.

5. **Never trust the client for money or tenancy.** `package_id` arrives from the browser: re-read the package server-side and verify it belongs to this course and is `is_active`. `institution_id` on the application comes from `course_events`, never from the payload — the same rule `fn_save_course_package` enforces.

6. **Public pages need their own `<Toaster>`.** They do not inherit the authenticated shell's.

7. **Explicit not-found states, never a silent redirect.** An unknown or unpublished slug renders a real "not available" page.

8. `export const dynamic = 'force-dynamic'` on every public page and route handler.

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `supabase/migrations/20260820010000_course_form_save_rpc.sql` | `fn_save_course_registration_form` |
| `lib/services/courses/course-form-service.ts` | Admin CRUD for forms |
| `hooks/courses/use-course-forms.ts` | React Query hooks |
| `app/(routes)/courses/[id]/_components/forms-panel.tsx` | The Forms tab body |
| `app/(routes)/courses/[id]/_components/form-builder.tsx` | Sections + fields editor |
| `app/api/public/courses/[slug]/route.ts` | Public course + packages + enabled forms |
| `app/api/public/courses/[slug]/apply/route.ts` | Public submit (service-role) |
| `app/(public)/course/[slug]/page.tsx` | Public landing |
| `app/(public)/course/[slug]/_components/course-landing.tsx` | Landing client bits |
| `app/(public)/course/[slug]/apply/page.tsx` | Public apply |
| `app/(public)/course/[slug]/apply/_components/apply-widget.tsx` | The form + submit |

**Modify**

| File | Change |
|---|---|
| `proxy.ts` | `'/course/'` + `'/api/public/courses/'` in `PUBLIC_PATH_PREFIXES` |
| `types/courses.ts` | Form / section / field / application types |
| `lib/query/query-keys.ts` | `queryKeys.courseForms` |
| `app/(routes)/courses/[id]/page.tsx` | Add the Forms tab to `COURSE_TABS` and render the panel |

---

## Task 1: The atomic form-save RPC

**Files:** Create `supabase/migrations/20260820010000_course_form_save_rpc.sql`

**Interfaces:** Produces `public.fn_save_course_registration_form(p_form jsonb, p_sections jsonb) RETURNS jsonb`. Task 3 calls it by exactly that name and shape.

- [ ] **Step 1: Read the precedent.** `save_event_registration_form` in `supabase/migrations/20260731150000_event_multi_registration_forms.sql:105`. It is `SECURITY INVOKER` with `SET search_path = public`. Follow that.

- [ ] **Step 2: Same INVOKER reasoning as Phase 2b.** `course_registration_forms_manage` already gates on `courses.forms.manage` AND `role_has_institution_access(...)`. Running as the caller inherits it and it cannot drift. **The catch:** under RLS a blocked UPDATE/DELETE affects zero rows SILENTLY, so verify writes with `GET DIAGNOSTICS` and raise `42501` yourself.

- [ ] **Step 3: Write it.** Requirements:
  1. `p_form` carries `id` (null = create), `course_event_id`, `name`, `slug`, `description`, `display_order`, `is_enabled`.
  2. **`institution_id` is resolved from `course_events`, never from the payload.**
  3. Upsert the form; verify the write landed.
  4. **Replace** sections and fields: delete this form's sections (fields cascade off sections) AND delete this form's orphan fields (`section_id IS NULL`), then re-insert in order.
  5. **Every field gets `form_id` explicitly**, not only `section_id`. The Events module hung fields off sections alone and the moment a second form existed it rendered every other form's fields. The column is already NOT NULL here; keep it correct in the writer too.
  6. Renumber `display_order` from 0 in array order rather than trusting the client.
  7. `options` and `validation` are NOT NULL jsonb — coalesce a missing/`null`/non-array value to `'[]'` / `'{}'` respectively rather than letting a 23502 through.
  8. Return `jsonb_build_object('ok', true, 'form_id', …, 'section_count', …, 'field_count', …)`.
  9. `REVOKE EXECUTE … FROM anon, PUBLIC;` then `GRANT EXECUTE … TO authenticated;` — **revoke from `anon` explicitly**, Supabase grants to it directly.

- [ ] **Step 4: Apply** with `mcp__supabase__apply_migration` (name `20260820010000_course_form_save_rpc`) AND save byte-identical SQL to that path. Never a `SELECT 1;` placeholder.

- [ ] **Step 5: Probe — a correct save.** Create a course, save a form with 2 sections and 4 fields. Expect `ok:true, section_count:2, field_count:4`. Read back and assert **every field's `form_id` matches the form**. Roll back with a terminal `RAISE EXCEPTION` and confirm zero leftovers.

- [ ] **Step 6: Probe — the two-form isolation test.** THE test for this phase. On one course create form A (2 fields) and form B (3 fields), then read A's fields filtered by `form_id`. Expect exactly 2. If you get 5, the Events bug has been reproduced. Roll back.

- [ ] **Step 7: Probe — a re-save replaces rather than accumulates.** Save the same form twice with different fields; assert the field count is the second save's, not the sum.

Record all probe outputs verbatim.

- [ ] **Step 8: Mirror into `supabase/setup/02_functions.sql`**, in place, no duplicates.

- [ ] **Step 9: Commit** (branch check, diff, `git diff --cached`, path-limited commit, `git show --stat`).

---

## Task 2: Types and query keys

**Files:** Modify `types/courses.ts`, `lib/query/query-keys.ts`

- [ ] **Step 1: Derive row types from the generated `Database` type**, as the file already does for events, packages and sessions.

- [ ] **Step 2: Model the save DTO as form + sections + fields together**, since that is what the RPC takes and what one builder submit produces.

- [ ] **Step 3: Model the PUBLIC shapes separately** — `PublicCourseSummary`, `PublicCoursePackage`, `PublicFormField`. These are what crosses to an unauthenticated browser, and having them as distinct types is what makes an accidental `institution_id` leak a type error rather than a silent one. Do not reuse the admin types on public paths.

- [ ] **Step 4: Add `queryKeys.courseForms`** matching `coursePackages` / `courseSessions`. `list(courseEventId)` spreads `lists()`.

- [ ] **Step 5:** `getDiagnostics`, `npx eslint`, commit.

---

## Task 3: CourseFormService

**Files:** Create `lib/services/courses/course-form-service.ts`

**Interfaces:** `listByCourse(courseEventId)`, `getById(id)`, `save(dto)`, `remove(id)`, `setEnabled(id, enabled)`, `slugAvailable(courseEventId, slug, excludeId?)`.

- [ ] **Step 1: Read `lib/services/courses/course-package-service.ts`** and match it — the RPC call shape, blanks resolved to `null` before serialising (`JSON.stringify` drops `undefined` keys), and the read-back-on-delete guard.

- [ ] **Step 2: Reads filter fields by `form_id`.** Never by `course_event_id`. This is the same bug as Task 1 Step 5, on the read side.

- [ ] **Step 3: `slugAvailable`** for `UNIQUE (course_event_id, slug)`, so a duplicate is a field message rather than a raw 23505. Mirror `CourseEventService.slugAvailable`.

- [ ] **Step 4:** `getDiagnostics`, `npx eslint`, commit.

---

## Task 4: Hooks

**Files:** Create `hooks/courses/use-course-forms.ts`

- [ ] **Step 1: Read `hooks/courses/use-course-packages.ts`** and match it, including `getErrorMessage()`.

- [ ] **Step 2: Map `23505` to "a form with that URL already exists on this course".** Leave other codes' messages intact.

- [ ] **Step 3: Enabling a form is the act that opens intake.** Its toast should say so plainly — this is the switch that makes a form public.

- [ ] **Step 4:** invalidate `queryKeys.courseForms.lists()` + `detail(id)`. `getDiagnostics`, `npx eslint`, commit.

---

## Task 5: The Forms tab

**Files:** Create `forms-panel.tsx`, `form-builder.tsx`; modify `app/(routes)/courses/[id]/page.tsx`

- [ ] **Step 1: Read `packages-panel.tsx` and `sessions-panel.tsx`** — match their structure. Plain list from a React Query hook (NOT `DataTable` in `fetchDataFn` mode), `usePermissions().canAccess`, `Dialog` with `key={editing?.id ?? 'new'}`, `AlertDialog` for destructive confirms. **Glob/Grep patterns containing `[id]` match nothing** — open by direct path.

- [ ] **Step 2: Add `'forms'` to `COURSE_TABS`** and a `<TabsTrigger>`. The array is the allow-list `useTabParam` validates against, so a tab added to the UI but not the array silently falls back to `overview`.

- [ ] **Step 3: The panel lists forms** with name, public URL, field count, and enabled state. Show the **live public URL** (`/course/<course-slug>?form=<form-slug>`) with a copy button — the whole point of a form is that someone can reach it.

  Make `is_enabled` a visible switch, and label the off state "Not accepting applications" rather than a bare toggle.

- [ ] **Step 4: The builder edits sections and fields in ONE form, saved by ONE submit.** Field types to support: `text`, `textarea`, `email`, `phone`, `number`, `date`, `select`, `multiselect`, `checkbox`. `select`/`multiselect` need an options editor writing the `options` jsonb array.

  `field_key` must be unique within the form (`UNIQUE (form_id, field_key)`); derive it from the label and let the user override, the way `CourseForm` derives `slug` from `title`.

  **Do not put a fee on a form.** Price lives on the package, chosen at application time. Two fee sources feeding one payment was explicitly rejected in Events as a genuine hazard (spec §3.3).

- [ ] **Step 5: Verify.** `getDiagnostics`, `npx eslint` (read warnings), reason about hook rules. Commit.

---

## Task 6: `proxy.ts` + the public API routes

**Files:** Modify `proxy.ts`; create `app/api/public/courses/[slug]/route.ts` and `.../apply/route.ts`

- [ ] **Step 1: Register the prefixes.** Add `'/course/'` and `'/api/public/courses/'` to `PUBLIC_PATH_PREFIXES` (`proxy.ts:173-198`), each with a comment in the style of its neighbours. **State in the comment that the trailing slash is load-bearing** — `'/course'` would match `/courses` and expose the admin module — and that `'/learn/'` must never be used.

- [ ] **Step 2: `GET /api/public/courses/[slug]`.** Service-role client. Return ONLY: course title, description, mode, dates, venue text, cover image, application window, a computed `applicationsOpen` boolean, active packages (name, description, total_amount, currency, seat_cap, instalment schedule), and enabled forms (name, slug). **Explicitly projected — no `select('*')`, no `institution_id`.**

  404 unless the course is `status = 'published'`. A draft course must not be readable by URL guess.

- [ ] **Step 3: `POST /api/public/courses/[slug]/apply`.** Read `app/api/public/forms/[slug]/submit/route.ts` first and copy its rate-limit + honeypot shape.

  Order of operations, all server-side:
  1. rate-limit by IP; honeypot → fake success
  2. load the course by slug, service role; reject unless published AND the window is open
  3. load the named form; reject unless it belongs to this course AND `is_enabled`
  4. **re-validate `package_id` server-side** — it must belong to this course and be `is_active`. Never trust the client on price.
  5. validate required fields against the form's own field list; unknown keys are dropped, not stored
  6. **upsert `event_external_participants` by phone**, then
  7. insert `course_applications` with `applicant_type='external'`, `external_participant_id`, `institution_id` **from the course**, `status='pending'`, `custom_fields` = the validated answers
  8. return only `{ ok: true, reference }` — never the row, never internal ids

- [ ] **Step 4: Probe both routes with `curl`** against the running :3000 server (do NOT restart it). Expect: a published slug returns the projected payload; a draft slug returns 404; a submit with the honeypot filled returns a fake success and writes nothing. **Delete any rows a probe creates**, and say what you deleted.

- [ ] **Step 5:** `getDiagnostics`, `npx eslint`, commit. Call out the `proxy.ts` change in the message — it is an auth-surface change.

---

## Task 7: The public pages

**Files:** Create `app/(public)/course/[slug]/page.tsx`, `_components/course-landing.tsx`, `apply/page.tsx`, `apply/_components/apply-widget.tsx`

- [ ] **Step 1: Read `app/(public)/r/[slug]/page.tsx`** — the closest precedent. Note: server component, `dynamic = 'force-dynamic'`, `generateMetadata` with `robots: { index: false }`, service-role load, an explicit "not available" state, and a client `_components/*-widget.tsx` for the interactive part.

  Decide `robots` deliberately: a course landing page is marketing, so indexing it may be WANTED — unlike a routing form. Say which you chose and why.

- [ ] **Step 2: The landing page** renders the course, its dates, and the package tiers with their instalment schedules. When applications are closed or no form is enabled, say so plainly instead of showing a dead Apply button.

- [ ] **Step 3: The apply page** reads `?form=<slug>`, falls back to the single enabled form when there is exactly one, and renders an explicit chooser when there are several. Include a package selector — the price is chosen here, not on the form.

- [ ] **Step 4: Its own `<Toaster>`.** Public routes do not inherit the authenticated shell's, so without it every error is invisible.

- [ ] **Step 5: On success show a confirmation screen**, not a redirect to a status page. Per constraint B there is no status page an external applicant can read. Tell them what happens next: their application is reviewed, and if accepted they receive a JKKN ID and a login by email/WhatsApp.

- [ ] **Step 6: Verify.** `getDiagnostics`, `npx eslint`. Then, since these pages are genuinely public, fetch them with `curl` against :3000 **with no cookies** and confirm HTTP 200 and real HTML — that is the actual test of the `proxy.ts` change, and the one that catches a 302-to-login.

- [ ] **Step 7: Commit.**

---

## Phase 3 completion criteria

Observe, do not assume:

1. All three Task 1 probes produced their expected output — including the **two-form isolation** probe returning 2, not 5.
2. Migration applied AND committed byte-identical, no `SELECT 1;` placeholder.
3. `anon` and `PUBLIC` hold no EXECUTE on `fn_save_course_registration_form`.
4. **`curl` with no cookies returns 200 on `/course/<published-slug>`** and 404 on a draft slug. A 302 to `/auth/login` means `proxy.ts` is wrong.
5. `curl` proves `/courses` and `/courses/<id>` STILL redirect to login — the prefix must not have widened the admin module.
6. A submitted application lands with `applicant_type='external'`, a non-null `external_participant_id`, and `institution_id` matching the course. Verify in SQL. **Delete probe rows.**
7. No public payload contains `institution_id` or any other internal id.
8. `getDiagnostics` clean and `npx eslint` **warning-free** on every created/modified file.
9. Every commit's `git show --stat` matches its intended file list, and the branch was checked first.

**Do not claim tests pass.** There is no suite. State what you ran and what it returned.

---

## Notes for Phase 4

- Approval mints the identity: upsert is already done (`event_external_participants`), so Phase 4 reuses that row and sets `linked_profile_id`. Call the existing `fn_issue_jkkn_id`; the course module mints nothing itself.
- Generate **ALL** instalment bills at enrollment, in one transaction. `fn_course_recompute_balances` derives the enrollment balance from the bills that EXIST, so lazy generation would let someone reach `balance = 0` after paying only the first instalment.
- Grant `users.jkkn_id.issue` to the roles holding `courses.applications.decide` rather than widening the issuer's own gate.
- `course_applications` has **no uniqueness constraint** on (course, applicant). Phase 4 should decide what a duplicate application means before approving one twice.
