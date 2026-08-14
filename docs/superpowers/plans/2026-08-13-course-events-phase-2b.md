# Course Events — Phase 2b (Packages + Installment Templates) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin define priced packages for a course and the installment schedule each one bills on — the layer Phase 4's bill generation reads.

**Architecture:** One Postgres RPC saves a package and its installments in a single transaction (required — see below), then the house four-layer stack on top: service → hook → the Packages tab already scaffolded on `/courses/[id]`.

**Tech Stack:** PostgreSQL 15 (Supabase), Next.js 16 App Router, React 19, TanStack Query v5, react-hook-form + Zod, Shadcn UI.

**Spec:** `docs/superpowers/specs/2026-08-13-course-events-design.md` §3.1 and §9a.
**Branch:** `feat/course-events-phase-2b`, based on Phase 2a's tip `bffe66347`.

---

## Why this phase needs a migration when 2a did not

`fn_course_package_amounts_chk` is attached to **both** `course_packages` and `course_package_installments` as `CONSTRAINT TRIGGER … DEFERRABLE INITIALLY DEFERRED` — verified in `pg_trigger` (`tgdeferrable=true, tginitdeferred=true`). It evaluates at COMMIT, and PostgREST wraps each request in its own transaction.

So editing a package from ₹2,50,000 (4 × 62,500) to ₹3,00,000 (4 × 75,000) is **impossible in two calls**:

| Order attempted | Result |
|---|---|
| Package first | `total=300000` commits → check fires → installments still sum 250000 → **`23514`** |
| Installments first | installments sum 300000 commits → check fires → total still 250000 → **`23514`** |

Create is the narrower case and *does* work in two calls — inserting a package alone passes because the trigger permits zero installments (a draft). But the UI must handle edit, so one RPC handles both.

---

## Global Constraints

- **This phase adds ONE migration.** Everything else is TypeScript. If you find yourself writing a second migration, stop and ask.
- **There is NO test suite.** Never write "run the tests" and never claim tests pass.
- **`mcp__ide__getDiagnostics` is unavailable** (MCP server disconnected during Phase 2a). Do **NOT** substitute `npm run typecheck` or full `tsc` — CLAUDE.md is explicit it takes 3-4 minutes and OOMs. Verify with `npx eslint <file>` plus hand-verification of every imported symbol against its source, noting line numbers. **Never claim a clean typecheck you did not run.**
- **No Chrome browser is connected.** Do not attempt a browser check, and do not spend time trying to make one work. Live verification is outstanding for Phase 2a as well and is batched.
- **Migration verification is SQL probes** run via `mcp__supabase__execute_sql`, each with a stated expected output. Probes must leave nothing behind.
- **SHARED WORKING DIRECTORY.** Another session works in this same directory and has uncommitted files. Both halves of the git discipline are mandatory:
  - `git diff <path>` before staging — is every hunk yours?
  - `git diff --cached` before committing — does the index hold ONLY your files? (During Phase 2a this check caught 1,656 insertions of another team's work sitting staged.)
  - `git commit -m "msg" -- <paths>` — **never a bare `git commit`**, which commits the entire shared index. Note the order: `-m` and its message come BEFORE the `--`.
  - `git show --stat HEAD` after — do the file list and counts match your edit?
- Branch `feat/course-events-phase-2b`. Do NOT switch branches or commit to `main`.
- **`useAuth()` returns ONLY `{ profile, isLoading, error }`** — no `hasPermission`. Use `usePermissions().canAccess('courses', 'packages.manage')` and `<PermissionGuard module="courses" action="packages.manage">`. **CLAUDE.md is wrong about this hook** and caused three defects in Phase 2a.
- `institution_id` stays NOT NULL on everything. Never write `institution_id IS NULL` as a privilege test, in SQL or JS (spec §9a).
- PostgREST returns `numeric` as a **string**. `"0.00"` is truthy. `Number()` every amount at the read boundary — this phase is entirely about money.

---

## Three failure modes inherited from Phase 2a — read before writing UI

**1. The optional-number Zod trap.** `z.coerce.number().int().positive().optional()` is broken for a cleared input: the input reports `''`, `z.coerce.number()` makes it `0`, `.positive()` rejects it, and `.optional()` does not help because the value is *present* as `''`. Use the `preprocess` form for **every** nullable numeric — `seat_cap` here, and `amount` on each installment:

```typescript
seat_cap: z.preprocess(
  (v) => (v === '' || v === null ? undefined : v),
  z.coerce.number().int().positive().optional(),
),
```

**2. A `DataTable` in `fetchDataFn` mode cannot be refreshed by `invalidateQueries` alone.** The bridge fires only on invalidate events from an already-cached query, and a `fetchDataFn` table registers none. If the packages list uses `DataTable`, it needs a page-local counter folded into `refetchKey` (a real dependency of the fetch effect, `data-table.tsx:554`). See `hooks/events/use-general-events.ts:158-170`. **A plain list rendered from a React Query hook does not have this problem** — prefer that here unless there is a reason for `DataTable`.

**3. Normalisation layers can route around each other.** Phase 2a mapped `'' → null` in the service and `'' → undefined` in the form; together, a cleared numeric reached PostgREST as `undefined`, which `JSON.stringify` drops from the PATCH, so the column silently never updated. **Before adding any normalisation, check what the layers either side already do.** For this phase the RPC takes jsonb, so blanks must be resolved to `null` *before* serialisation, not left as `undefined`.

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `supabase/migrations/20260819010000_course_package_save_rpc.sql` | `fn_save_course_package` — the atomic save |
| `lib/services/courses/course-package-service.ts` | Reads + the RPC call |
| `hooks/courses/use-course-packages.ts` | React Query hooks |
| `app/(routes)/courses/[id]/_components/packages-panel.tsx` | The Packages tab body |
| `app/(routes)/courses/[id]/_components/package-form.tsx` | Package + installment editor |

**Modify**

| File | Change |
|---|---|
| `types/courses.ts` | Package + installment types and DTOs |
| `lib/query/query-keys.ts` | `queryKeys.coursePackages` |
| `app/(routes)/courses/[id]/page.tsx` | Replace the Packages Coming-Soon panel |

---

## Task 1: The atomic save RPC

**Files:**
- Create: `supabase/migrations/20260819010000_course_package_save_rpc.sql`

**Interfaces:**
- Produces `public.fn_save_course_package(p_package jsonb, p_installments jsonb) RETURNS jsonb`. Task 3's service calls it by exactly that name and argument shape.

- [ ] **Step 1: Read the two closest precedents**

Read `save_event_registration_form` and `clone_event_registration_form` in `supabase/migrations/` (grep for `CREATE OR REPLACE FUNCTION public.save_event_registration_form`). Both are the analogous "save a parent and replace its children atomically" RPC in this codebase.

Note that both are **`SECURITY INVOKER`** (the default — `prosecdef = false` in `pg_proc`, confirmed) with `SET search_path = public`. Follow that.

- [ ] **Step 2: Understand why INVOKER is the correct choice here**

This is the load-bearing design decision; do not "harden" it to `SECURITY DEFINER`.

- **INVOKER runs as the caller, so RLS still applies inside the function body.** `course_packages_manage` and `course_package_installments_manage` already gate on `courses.packages.manage` AND `role_has_institution_access(...)`. You get that for free and it can never drift.
- A `SECURITY DEFINER` version would **bypass RLS** and would have to re-implement that predicate by hand. This repo has a recorded incident of a DEFINER function whose hand-copied predicate diverged from the policy it mirrored, silently over-granting.
- Atomicity is unaffected: the body runs in the caller's transaction, so the deferred sum-check still fires once at the outer COMMIT.

**The catch INVOKER introduces, which you must handle:** under RLS a blocked `UPDATE` or `DELETE` affects **zero rows silently** — no error. So the function must verify it wrote what it intended rather than assuming success. Use `GET DIAGNOSTICS` or `RETURNING … INTO` and raise `42501` explicitly when a write matched nothing.

- [ ] **Step 3: Write the migration**

Requirements the function must satisfy:

1. **Signature:** `fn_save_course_package(p_package jsonb, p_installments jsonb) RETURNS jsonb`.
2. **`p_package`** carries `id` (null for create), `course_event_id`, `name`, `description`, `total_amount`, `currency`, `seat_cap`, `sale_opens_at`, `sale_closes_at`, `is_active`, `display_order`.
3. **`institution_id` is NOT taken from the payload.** Resolve it from `course_events.institution_id` for the given `course_event_id`. A caller must not be able to write a package into another tenant by lying in the payload.
4. **Upsert the package**: insert when `id` is null, else update. Verify the write landed (see Step 2's catch) and raise `42501` with a readable message if it did not.
5. **Replace the installments**: delete all rows for the package, then insert `p_installments` in order. A full replace is simpler and safer than diffing, and the deferred check validates the end state.
6. **Renumber `installment_no`** from 1 in array order rather than trusting the client, so `UNIQUE (package_id, installment_no)` cannot be violated by a reordered UI.
7. **Return** `jsonb_build_object('ok', true, 'package_id', …, 'installment_count', …)`.
8. `REVOKE EXECUTE … FROM anon, PUBLIC;` then `GRANT EXECUTE … TO authenticated;` — **revoke from `anon`, not `PUBLIC` alone**; Supabase's default privileges grant to `anon` directly.
9. Do **not** validate that the amounts sum to the total inside the function. The deferred trigger already does that, and duplicating it means two places to drift. Let `23514` surface.

- [ ] **Step 4: Apply**

Apply with `mcp__supabase__apply_migration` (name `20260819010000_course_package_save_rpc`) AND save byte-identical SQL to that path. Never leave a `SELECT 1;` placeholder.

- [ ] **Step 5: Probe — a correct save succeeds**

Create a course, then call the RPC with a package of 250000 and 4 × 62500. Expect `ok: true, installment_count: 4`. Roll back with a terminal `RAISE EXCEPTION 'rollback probe'` and confirm zero leftovers afterwards.

**These probes need no `SET CONSTRAINTS`** — the RPC's own COMMIT is what you are testing, and the probe's rollback happens after the function returns. If a result looks impossible, question the probe's transaction semantics before concluding the RPC is broken; a Phase 1 probe was a guaranteed false negative for exactly this reason.

- [ ] **Step 6: Probe — a mismatched save is REJECTED**

Same call but with 3 × 50,000 against a 250,000 package. Expect failure with `23514` and the `fn_course_package_amounts_chk` message. **A failure here is the pass.** If it succeeds, the deferred trigger is not covering the RPC path and that is a blocking finding.

- [ ] **Step 7: Probe — the edit that two calls cannot do**

The whole reason this RPC exists. On the package from Step 5, call the RPC once changing `total_amount` to 300000 **and** the installments to 4 × 75000. Expect `ok: true`. Then confirm the row reads back at 300000 with four 75000 installments.

Record all three probe outputs verbatim.

- [ ] **Step 8: Mirror into `supabase/setup/02_functions.sql`**, in place, no duplicates.

- [ ] **Step 9: Commit** (diff before staging, `git diff --cached`, path-limited commit, `git show --stat HEAD`).

---

## Task 2: Types and query keys

**Files:**
- Modify: `types/courses.ts`, `lib/query/query-keys.ts`

**Interfaces:**
- Produces `CoursePackage`, `CoursePackageInstallment`, `SaveCoursePackageDto`, and `queryKeys.coursePackages` with `all`, `lists()`, `list(courseEventId)`, `details()`, `detail(id)`. Tasks 3-5 import these names verbatim.

- [ ] **Step 1: Derive row types from the generated `Database` type**, as `types/courses.ts` already does for `CourseEventRow` — not hand-written columns, so a schema change surfaces as a type error.

- [ ] **Step 2: Model the save DTO as package + installments together**, since that is what the RPC takes and what the form submits. A DTO that separates them invites a two-call save, which cannot work.

- [ ] **Step 3: Add the query-key factory**, matching the existing `queryKeys.courses` shape. `list(courseEventId)` must spread `...lists()` so invalidating `lists()` reaches every course's package list.

- [ ] **Step 4:** `npx eslint`, hand-verify imports, commit.

---

## Task 3: CoursePackageService

**Files:**
- Create: `lib/services/courses/course-package-service.ts`

**Interfaces:**
- Consumes Task 2's types. Produces `listByCourse(courseEventId)`, `getById(id)`, `save(dto)`, `remove(id)`.

- [ ] **Step 1: Read `lib/services/courses/course-event-service.ts`** — match its shape, including `nullifyBlanks` and the `sanitizeSearch` treatment if you add search.

- [ ] **Step 2: `save()` calls the RPC**, not table writes:

```typescript
const { data, error } = await this.supabase.rpc('fn_save_course_package', {
  p_package: packageJson,
  p_installments: installmentsJson,
});
```

**Resolve blanks to `null` before serialising.** `JSON.stringify` drops `undefined` keys, so an `undefined` `seat_cap` would vanish from the jsonb entirely and the RPC would read it as "not provided" rather than "cleared". This is the exact layer interaction that bit Phase 2a — there it dropped a key from a PATCH; here it would drop one from jsonb.

- [ ] **Step 3: `listByCourse` and `getById` are ordinary table reads** — RLS gates them. Order installments by `installment_no`.

- [ ] **Step 4: `Number()` every numeric at the read boundary.** PostgREST returns `numeric` as a string; `"0.00"` is truthy and string concatenation instead of addition is the failure mode. Every amount in this phase is money.

- [ ] **Step 5:** `npx eslint`, hand-verify imports, commit.

---

## Task 4: Hooks

**Files:**
- Create: `hooks/courses/use-course-packages.ts`

**Interfaces:**
- Produces `useCoursePackages(courseEventId)`, `useCoursePackage(id)`, `useSaveCoursePackage()`, `useDeleteCoursePackage()`.

- [ ] **Step 1: Read `hooks/courses/use-course-events.ts`** and match it — including the `getErrorMessage()` treatment. Supabase errors are plain objects, so `instanceof Error` always falls through and hides the cause.

- [ ] **Step 2: Surface `23514` in human terms.** A mismatched schedule is the most likely user error in this phase, and the raw message names a constraint. Map it to something like *"The installment amounts must add up to the package price."* Keep the underlying message available — do not swallow it.

- [ ] **Step 3: Invalidate `queryKeys.coursePackages.lists()`** on save and delete, plus `detail(id)` on save.

- [ ] **Step 4:** `npx eslint`, hand-verify imports, commit.

---

## Task 5: The Packages tab

**Files:**
- Create: `app/(routes)/courses/[id]/_components/packages-panel.tsx`, `…/package-form.tsx`
- Modify: `app/(routes)/courses/[id]/page.tsx` (replace the Coming-Soon panel)

- [ ] **Step 1: Read `app/(routes)/courses/[id]/page.tsx`** to see how the Packages tab is currently scaffolded and how it receives the course. **Glob/Grep patterns containing `[id]` match nothing** — brackets read as a character class. Open it by direct path.

- [ ] **Step 2: Build the panel** — a list of the course's packages with name, price, seat cap, installment count, active state; plus Add and Edit. Gate mutations on `courses.packages.manage` via `usePermissions().canAccess('courses', 'packages.manage')`.

Prefer a plain list rendered from `useCoursePackages` over `DataTable` — it avoids the `fetchDataFn` invalidation trap entirely (see Failure Mode 2 above). If you use `DataTable`, you must add the counter.

- [ ] **Step 3: Build the form — package fields and the installment rows in ONE form, saved by ONE submit.** This is not a UI preference; two saves cannot satisfy the deferred check.

Show a **live running total** of the installment amounts against the package price, and block submit while they differ. The DB rejects a mismatch anyway; the point is that the user should never reach that error.

Use the `z.preprocess` form for `seat_cap` and every installment `amount` (Failure Mode 1).

- [ ] **Step 4: Verify**

`npx eslint` on each file; hand-verify every imported symbol with line numbers; reason explicitly about hook rules (all hooks unconditional, top level).

**No browser is available**, so state plainly in your report that the panel has not been rendered. Do not claim otherwise.

- [ ] **Step 5:** Commit.

---

## Phase 2b completion criteria

Observe, do not assume:

1. All three Task 1 probes produced their exact expected output — including the mismatch probe **failing** with `23514`.
2. The migration exists both applied and as byte-identical committed SQL, with no `SELECT 1;` placeholder.
3. `anon` and `PUBLIC` hold no EXECUTE on `fn_save_course_package`.
4. `npx eslint` clean on every created/modified file.
5. Every commit's `git show --stat` matches its intended file list — shared working directory.
6. **Browser verification outstanding and stated as such.**

**Do not claim tests pass.** There is no suite. State what you ran and what it returned.

---

## Notes for Phase 2c

- Sessions + venue holds write `resource_reservations.course_session_id` — the column Phase 1 Task 3 added. Reuse `ReservationService`; do not write a second booking path.
- The same three failure modes apply. Sessions have no nullable numerics, but the `fetchDataFn` trap and the layer-interaction warning both still hold.
