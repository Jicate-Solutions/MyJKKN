# Campus Living Housekeeping Rebuild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace both existing housekeeping systems with one booking-driven flow: dynamic cleaning types carrying their own duration, expected-cost lines, room-category eligibility and usage quota; a cleaner directory; before/after photo evidence; and a room-based rating that gates hostel attendance.

**Architecture:** Four sequential migrations (teardown → schema → RPCs → permissions), then five plain static service classes wrapping PostgREST reads and four `SECURITY DEFINER` RPCs for writes, five React Query hooks with file-local key factories, six pages (five warden, one learner), and one Drive-upload API route. The room lock, quota and eligibility are enforced in the database; the attendance hold is computed live by a SQL function and enforced both in the attendance service and by a trigger.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript 5 (strict OFF — see Global Constraints), Supabase (Postgres + RLS + Auth), TanStack Query v5, Shadcn UI + Tailwind, Vitest, Google Drive API for photo storage.

**Spec:** `specs/campus-living-housekeeping-rebuild-spec-2026-09-07.md` — read it before starting. This plan argues from that spec; where they disagree, the spec wins and the plan is wrong.

---

## Global Constraints

These apply to **every** task. Each was measured against this codebase or traced to a production incident.

**Environment**

- `export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"` at the start of every Bash command. Without it `rm`, `git`, `node` and `npm` all exit 127.
- Repo files have **mixed line endings per file**. Never assume; detect before multiline `sed`, and assert anchor counts after any scripted edit.
- Scratchpad for temp files: `C:\Users\Admin\AppData\Local\Temp\claude\D--Projects-MyJKKN\<session>\scratchpad`. Never write temp files into the repo.

**Migrations**

- There is **no psql, no Supabase CLI, and no Management API token.** Apply migrations with `node --env-file=.env scripts/apply-migration-file.mjs <filename>`.
- Migrations must contain **no `BEGIN`/`COMMIT`** — the transport is `exec_sql()`, which runs inside a function. It is still atomic: the whole file runs in one PostgREST request transaction.
- `exec_sql` returns failures as `{ok:false, error, sqlstate}` **instead of throwing.** The script checks `ok`; if you call it any other way, check `ok` yourself or every failure reads as success.
- The file on disk must be **exactly** what ran. Never commit a `SELECT 1;` placeholder — it hides column typos and makes the repo lie about the schema.
- A migration file can contain **more** than was applied. After applying, diff `supabase_migrations.schema_migrations.statements` against the file.

**Database rules**

- `ENABLE ROW LEVEL SECURITY` in the **same migration** as `CREATE TABLE`, always.
- Every foreign key gets an index in the same migration. Postgres does not auto-index FK columns.
- Wrap every auth call as `(select auth.uid())` / `(select is_super_admin())` — bare calls re-evaluate **per candidate row**.
- One permissive policy per table/role/verb. Multiple permissive policies are ORed and all evaluated per row.
- `SECURITY DEFINER` functions: derive the caller from `auth.uid()` internally (never a caller-id parameter — those are spoofable), `SET search_path = ''`, perform their own permission check, and `REVOKE EXECUTE … FROM anon` explicitly after creation. Re-creating a dropped function **silently re-grants EXECUTE to PUBLIC**.
- `x <> NULL` is neither true nor false — in plpgsql `IF` branches it silently skips, making gates fail **open**. Use `IS DISTINCT FROM`.
- Test JSONB grant values, not key presence: `permissions ? 'key'` is true even when the value is `false`. Use `(permissions->>'key')::boolean IS TRUE`.
- `DROP TABLE … CASCADE` cascades away **other tables'** policies and FKs. Verified safe here (§Task 2), but re-verify if the schema drifts before execution.

**TypeScript / client rules**

- TypeScript `strict` is **off** and `typescript.ignoreBuildErrors: true`. **The build does not typecheck.** Verify with `mcp__ide__getDiagnostics` per file (seconds). Never run a full `tsc` — it takes 3–4 min and OOMs under ~10 GB heap. If the IDE MCP is down, use a scoped `tsconfig.<name>.tmp.json` in the repo root (`extends` + `files`), ~12 s.
- Always destructure `{ data, error }` and check `error`. Supabase errors are plain objects — `try/catch` does **not** catch RLS denials or constraint violations, and `err instanceof Error` is always false. Surface them via `getErrorMessage()` from `@/lib/utils`.
- Institution scope uses `??`, never `|| ''`. `||` coerces `undefined` → `''`, which travels as a real UUID and matches zero rows.
- Never pass `undefined` to `.eq()` — it is sent as the literal string `"undefined"` → `22P02`.
- Never branch on `isSuperAdmin` to decide **which institution's data to fetch**. Pass the id (or `undefined`) and let RLS filter. This bug was fixed three times in the old module.
- Use left joins. `!inner` is an INNER JOIN; one null FK silently drops the whole row.
- Normalise `'' → null` for every nullable UUID before insert, or the insert crashes with `22P02`.

**Conventions (measured 2026-09-07 — follow these, not CLAUDE.md)**

- **Plain static service classes** using `createClientSupabaseClient()`. Zero of the 95 `lib/services/campus-living/` services extend `BaseService`; only 68 of 1,132 repo-wide do.
- **File-local query-key factories** exported from each hook file. 55 of 90 `hooks/campus-living/` hooks do this; only 2 use the central `queryKeys`.
- No `<PermissionGuard>` in this module — it uses `usePermissions()` with the default-open-while-loading idiom, because `isSuperAdmin` reads `false` mid-load and would false-negative super admins out.
- RPC results are discriminated unions: `{success:true, …} | {success:false, error_code, message?}`.
- No file over ~400 lines.

**Testing**

- Vitest **is** runnable despite no npm script: `npx vitest run __tests__/campus-living/`.
- Tests are pure-logic unit tests (node environment, no database). Do not attempt DB integration tests — there is no fixture harness.
- Gate scripts: `npm run gen:routes` then `npm run check:menus`.
- "Done" is never "the code runs." It is: diagnostics clean, gates pass, and **exercised in a browser as a Warden and as a Student** — never as super admin, which hides every permission bug.

**Terminology**

- "Learner", never "student", in DB columns, types, and UI labels.
- Gender values are `Male` / `Female` / `Other`.
- Weekdays are **Postgres DOW**: 0 = Sunday … 6 = Saturday.

---

## File Structure

**Created — database (4 files)**

| File | Responsibility |
|---|---|
| `supabase/migrations/20260907085000_housekeeping_teardown.sql` | Drop the old module entirely; revoke its permission keys |
| `supabase/migrations/20260907090100_housekeeping_schema.sql` | 9 tables, RLS, policies, indexes |
| `supabase/migrations/20260907090200_housekeeping_rpcs.sql` | 4 DEFINER RPCs, hold function, attendance trigger |
| `supabase/migrations/20260907090300_housekeeping_permissions.sql` | 8 catalog keys granted to 7 roles |

**Created — types & pure logic (2 files)**

| File | Responsibility |
|---|---|
| `types/campus-living/housekeeping.ts` | Every row, DTO and RPC result type for the module |
| `lib/services/campus-living/housekeeping-rules.ts` | Pure functions: slot end, quota window, status transitions, error copy. **No I/O — this is the unit-tested core.** |

**Created — services (5 files)**

| File | Responsibility |
|---|---|
| `housekeeping-type-service.ts` | Cleaning types + expense lines + category eligibility CRUD |
| `housekeeping-cleaner-service.ts` | Cleaner directory + block assignment CRUD |
| `housekeeping-availability-service.ts` | Per-block weekday windows + the 2 policy knobs |
| `housekeeping-booking-service.ts` | Slots, book, cancel, assign, day board, photos, feedback |
| `housekeeping-feedback-gate.ts` | Reads active attendance holds. Consumed by the attendance service. |

**Created — hooks (5 files)**, one per service, each exporting its own key factory.

**Created — pages (6) and one API route**

| File | Responsibility |
|---|---|
| `app/(routes)/campus-living/housekeeping/page.tsx` | Warden day board |
| `…/housekeeping/types/page.tsx` | Cleaning type catalog |
| `…/housekeeping/cleaners/page.tsx` | Cleaner directory |
| `…/housekeeping/availability/page.tsx` | Weekday windows + policy knobs |
| `…/housekeeping/holds/page.tsx` | Rooms currently blocking attendance |
| `…/my-hostel/housekeeping/page.tsx` | Learner booking + rating |
| `app/api/campus-living/housekeeping/bookings/[bookingId]/photos/route.ts` | Drive upload |

Page `_components/` split where a page would exceed ~400 lines.

**Deleted (18) and modified (10)** — enumerated in Task 1.

---

## Task Sequence

Phases are strictly ordered; tasks within a phase are ordered.

| Phase | Tasks | Ends with |
|---|---|---|
| A — Teardown | 1–2 | Old module gone, build green, DB clean |
| B — Database | 3–5 | New schema, RPCs and permissions live |
| C — Pure logic | 6 | Unit-tested rules module |
| D — Services & hooks | 7–11 | Typed data layer |
| E — UI | 12–17 | Every surface built |
| F — Integration | 18–20 | Attendance gate wired, gates pass, browser-verified |

---

# Phase A — Teardown

## Task 1: Remove the housekeeping code surface

The deletions and the edits **must land in one commit.** `settings/mess-services/page.tsx` hard-imports `HousekeepingPolicyForm`; deleting the folder without fixing that import breaks the build.

**Files:**

- Delete (18):
  - `lib/services/campus-living/housekeeping-service.ts`
  - `lib/services/campus-living/housekeeping-booking-service.ts`
  - `lib/services/campus-living/housekeeping-policy-keys.ts`
  - `hooks/campus-living/use-hostel-housekeeping.ts`
  - `hooks/campus-living/use-housekeeping-bookings.ts`
  - `app/api/cron/campus-living/housekeeping-task-generator/route.ts`
  - `app/(routes)/campus-living/housekeeping/` (entire directory: `page.tsx`, `schedules/`, `tasks/`, `my-work/`, `bookings/` + its `_components/`)
  - `app/(routes)/campus-living/my-hostel/housekeeping/` (entire directory: `page.tsx` + 6 `_components/` files)
  - `app/(routes)/campus-living/my-hostel/_components/room-cleaning-entry-card.tsx`
  - `app/(routes)/campus-living/settings/housekeeping/` (entire directory)
- Modify (6):
  - `app/(routes)/campus-living/settings/mess-services/page.tsx` — lines 12, 41–42, ~132–138
  - `app/(routes)/campus-living/settings/page.tsx:24`
  - `lib/services/campus-living/index.ts:44`
  - `lib/constants/permissions.ts:2152–2155`
  - `lib/sidebarMenuLink.ts:1317–1319`
  - `app/(routes)/campus-living/nav-config.ts` — lines 32, 209, 321–341, 652–655
  - `lib/ai-routines/platform-ops.ts:346–362`
  - `lib/campus-living/guide/content.ts` — lines ~31, 124–133, 288, 432–436
  - `app/(routes)/campus-living/my-hostel/page.tsx` — remove the `RoomCleaningEntryCard` import and usage

**Interfaces:**

- Consumes: nothing.
- Produces: a repo with **zero** references to `hostel_cleaning_*` tables or `fn_housekeeping_*` RPCs in application code. Later tasks rebuild against this clean slate.

- [ ] **Step 1: Capture the current reference count as a baseline**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
grep -rn "housekeeping\|hostel_cleaning" --include=*.ts --include=*.tsx app lib hooks types \
  | grep -viE "bed_econ|campus-walk|decision-queue-item" \
  | wc -l
```

Record the number. It must reach a known, explained remainder by Step 8.

- [ ] **Step 2: Verify the mess-services coupling is still exactly where the plan says**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
grep -n "Housekeeping" "app/(routes)/campus-living/settings/mess-services/page.tsx"
```

Expected: line 12 (a header comment), line 41 (a comment), line 42 (`import { HousekeepingPolicyForm } …`), lines 132–138 (the rendered section). If the line numbers have drifted, use the grep output — never the plan's numbers — as truth.

- [ ] **Step 3: Fix `mess-services/page.tsx` BEFORE deleting anything**

Remove the import line, its preceding comment, and the whole Section 2 block. The page keeps its other sections. Read the file first and delete precisely:

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
sed -n '5,20p;38,46p;125,145p' "app/(routes)/campus-living/settings/mess-services/page.tsx"
```

Then edit with the Edit tool (not `sed` — line endings are mixed). Remove:
1. The `• Housekeeping → <HousekeepingPolicyForm/>` bullet from the header comment.
2. The comment on line 41 and the `import` on line 42.
3. The entire `{/* Section 2 — Housekeeping slot booking … */}` JSX block including its wrapper and `<HousekeepingPolicyForm />`.

Renumber any subsequent `{/* Section N */}` comments so they stay sequential.

- [ ] **Step 4: Verify mess-services no longer references housekeeping**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
grep -c -i "housekeeping" "app/(routes)/campus-living/settings/mess-services/page.tsx"
```

Expected: `0`.

- [ ] **Step 5: Delete the 18 files and directories**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
rm -rf "app/(routes)/campus-living/housekeeping" \
       "app/(routes)/campus-living/my-hostel/housekeeping" \
       "app/(routes)/campus-living/settings/housekeeping" \
       "app/api/cron/campus-living/housekeeping-task-generator"
rm -f lib/services/campus-living/housekeeping-service.ts \
      lib/services/campus-living/housekeeping-booking-service.ts \
      lib/services/campus-living/housekeeping-policy-keys.ts \
      hooks/campus-living/use-hostel-housekeeping.ts \
      hooks/campus-living/use-housekeeping-bookings.ts \
      "app/(routes)/campus-living/my-hostel/_components/room-cleaning-entry-card.tsx"
```

- [ ] **Step 6: Apply the five remaining surgical edits**

Use the Edit tool on each. Exact content to remove:

`lib/services/campus-living/index.ts` — delete this line, keep the two neighbours:

```ts
export { HousekeepingService } from './housekeeping-service';
```

`lib/constants/permissions.ts` — delete the four-line block at 2152–2155:

```ts
      // Housekeeping
      { key: 'campus_living.housekeeping.view', label: 'View Housekeeping Schedules' },
      { key: 'campus_living.housekeeping.schedule', label: 'Create/Edit Schedule' },
      { key: 'campus_living.housekeeping.mark_done', label: 'Mark Task Done' },
```

(Task 19 puts the eight new keys back in this exact position.)

`lib/sidebarMenuLink.ts` — delete the three entries at 1317–1319:

```ts
  '/campus-living/housekeeping': 'campus_living.housekeeping.view',
  '/campus-living/housekeeping/schedules': 'campus_living.housekeeping.view',
  '/campus-living/housekeeping/tasks': 'campus_living.housekeeping.view',
```

`app/(routes)/campus-living/settings/page.tsx` — delete the line-24 card entry beginning `{ title: 'Housekeeping Booking',`.

`app/(routes)/campus-living/nav-config.ts` — delete: the `Room Cleaning` entry (line 32), the `'/campus-living/housekeeping'` string (line 209), the whole `Housekeeping` group and its three children (lines ~321–341), and the `Housekeeping Booking` settings child (lines ~652–655).

`lib/ai-routines/platform-ops.ts` — delete the whole `campus-housekeeping-task-generator` object (lines ~346–362).

`app/(routes)/campus-living/my-hostel/page.tsx` — remove the `RoomCleaningEntryCard` import and its JSX usage.

- [ ] **Step 7: Rewrite the three Smart Guide entries**

`lib/campus-living/guide/content.ts`:

1. Line ~31 comment: change `three pages (block-economics, housekeeping, choose-your-menu)` to `two pages (block-economics, choose-your-menu)`.
2. Delete the whole `id: 'cleaning'` step object (lines ~124–133). Task 20 adds the replacement.
3. Line ~288: remove `Housekeeping` from the parenthetical list of super-admin settings pages.
4. Lines ~432–436: delete the `Housekeeping` settings-lane entry object.

- [ ] **Step 8: Confirm the only remaining references are the known-unrelated ones**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
grep -rn "housekeeping\|hostel_cleaning" --include=*.ts --include=*.tsx app lib hooks types
```

Expected remainder, and **nothing else**:
- `lib/policies/keys.ts` — `bed_econ.housekeeping_cost_per_room_month` (a cost line item, unrelated concept)
- `lib/campus-walk/scoreboard.ts`, `lib/campus-walk/urgent-alert.ts` — the plain English word
- `components/dashboard/decision-queue-item.tsx` — a comment
- `app/(routes)/campus-living/my-hostel/_components/wins-feed-card.tsx:25` — `housekeeping: 'Housekeeping'` label map, deliberately kept
- `types/supabase.ts` — generated, cleared in Task 2
- comments in `choose-your-menu-service.ts` / `block-economics-service.ts` citing the old file as a pattern precedent — harmless prose

If anything else appears, remove it before continuing.

- [ ] **Step 9: Regenerate the route manifest and run the nav gates**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
npm run gen:routes && npm run check:menus
```

Expected: both succeed. `check:reachability` runs with `--max-unreachable 60`; removing routes can only reduce that count.

- [ ] **Step 10: Verify the touched files typecheck**

Run `mcp__ide__getDiagnostics` on:
`app/(routes)/campus-living/settings/mess-services/page.tsx`, `app/(routes)/campus-living/settings/page.tsx`, `app/(routes)/campus-living/my-hostel/page.tsx`, `lib/services/campus-living/index.ts`, `lib/constants/permissions.ts`, `lib/sidebarMenuLink.ts`, `app/(routes)/campus-living/nav-config.ts`, `lib/ai-routines/platform-ops.ts`, `lib/campus-living/guide/content.ts`.

Expected: no errors referencing housekeeping. Pre-existing unrelated errors are acceptable — note them, don't fix them.

- [ ] **Step 11: Commit**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
git add -A
git commit -m "refactor(campus-living)!: remove the old housekeeping module code surface

Deletes both housekeeping systems' application code: the recurring
block-sweep service and cron route, and the resident slot-booking
service, hooks and pages.

settings/mess-services hard-imported HousekeepingPolicyForm and
rendered it as Section 2, so that import is removed in the same commit
to keep the build green.

Database objects are dropped separately in the next migration.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Migration M1 — drop the old database objects

**Files:**
- Create: `supabase/migrations/20260907085000_housekeeping_teardown.sql`
- Modify: `types/supabase.ts` (regenerated, never hand-edited)

**Interfaces:**
- Consumes: Task 1's clean code surface.
- Produces: a database with no `hostel_cleaning_*` tables, no `fn_housekeeping_*` functions, no `cleaning_*` enums, and no role holding `campus_living.housekeeping.schedule` or `.mark_done`.

- [ ] **Step 1: Re-verify the drop is still contained**

Nothing outside the module may depend on these tables. Run via `mcp__supabase__execute_sql`:

```sql
SELECT con.conname, src.relname AS referencing_table
FROM pg_constraint con
JOIN pg_class src ON src.oid = con.conrelid
JOIN pg_class tgt ON tgt.oid = con.confrelid
WHERE con.contype = 'f'
  AND tgt.relname IN ('hostel_cleaning_bookings','hostel_cleaning_schedules','hostel_cleaning_tasks')
  AND src.relname NOT IN ('hostel_cleaning_bookings','hostel_cleaning_schedules','hostel_cleaning_tasks')
UNION ALL
SELECT p.polname, c.relname
FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
WHERE c.relname NOT LIKE 'hostel_cleaning%'
  AND (COALESCE(pg_get_expr(p.polqual, p.polrelid), '') ILIKE '%hostel_cleaning%'
    OR COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') ILIKE '%hostel_cleaning%');
```

Expected: **zero rows.** If any row returns, STOP and report — the blast radius has changed since the spec was written and `CASCADE` would take another table's policy or FK with it.

- [ ] **Step 2: Write the migration file**

Create `supabase/migrations/20260907085000_housekeeping_teardown.sql`:

```sql
-- Housekeeping rebuild, migration 1 of 4: teardown.
--
-- Removes BOTH old housekeeping systems:
--   1. hostel_cleaning_schedules / _tasks — recurring block-level sweeps,
--      generated nightly by fn_housekeeping_generate_tasks.
--   2. hostel_cleaning_bookings — resident slot booking, tier-gated.
--
-- Verified before writing: no table outside this set has a foreign key to
-- these three, and no policy on any other table references them. The CASCADE
-- below is therefore contained. Re-verify if replaying against a drifted
-- schema — DROP TABLE CASCADE removes OTHER tables' policies and FKs, which
-- is how the HR regularizations table once went deny-all.
--
-- Row counts at authoring time: bookings 3, schedules 4, tasks 144.
-- Removal approved as irreversible; no archive is taken.
--
-- Spec: specs/campus-living-housekeeping-rebuild-spec-2026-09-07.md §2

-- ── Tables ────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS public.hostel_cleaning_bookings CASCADE;
DROP TABLE IF EXISTS public.hostel_cleaning_tasks CASCADE;
DROP TABLE IF EXISTS public.hostel_cleaning_schedules CASCADE;

-- ── Functions ─────────────────────────────────────────────────────────────
-- Signatures are explicit: DROP FUNCTION without them fails on overloads.
DROP FUNCTION IF EXISTS public.fn_housekeeping_assign_booking(uuid, uuid, text, boolean);
DROP FUNCTION IF EXISTS public.fn_housekeeping_assignable_staff(uuid);
DROP FUNCTION IF EXISTS public.fn_housekeeping_available_slots(uuid, date);
DROP FUNCTION IF EXISTS public.fn_housekeeping_book_slot(date, time without time zone, text);
DROP FUNCTION IF EXISTS public.fn_housekeeping_booking_board(uuid, date, date, date);
DROP FUNCTION IF EXISTS public.fn_housekeeping_cancel_booking(uuid);
DROP FUNCTION IF EXISTS public.fn_housekeeping_entitlement_tier(uuid);
DROP FUNCTION IF EXISTS public.fn_housekeeping_generate_tasks(date);
DROP FUNCTION IF EXISTS public.fn_housekeeping_mark_booking(uuid, text);
DROP FUNCTION IF EXISTS public.fn_housekeeping_my_entitlement();
DROP FUNCTION IF EXISTS public.fn_housekeeping_schedule_due(text, date, date);
DROP FUNCTION IF EXISTS public._on_cleaning_schedule_seed_task();

-- ── Enums ─────────────────────────────────────────────────────────────────
-- Safe only because the three tables above are gone; these types were used
-- nowhere else.
DROP TYPE IF EXISTS public.cleaning_task_status_enum;
DROP TYPE IF EXISTS public.cleaning_frequency_enum;
DROP TYPE IF EXISTS public.cleaning_type_enum;

-- ── Policy rows ───────────────────────────────────────────────────────────
-- Five of seven go. The knobs they held are now table config:
--   slot_duration_minutes      -> hostel_cleaning_types.duration_minutes
--   service_window             -> hostel_cleaning_availability.window_start/_end
--   capacity_per_slot_per_block-> hostel_cleaning_availability.capacity
--   weekly_quota_by_tier       -> hostel_cleaning_types.usage_limit_count/_period
--   cancellation_cutoff_minutes-> replaced by "cancel while unassigned"
-- booking_enabled and booking_advance_days SURVIVE and stay in platform_policies.
DELETE FROM public.platform_policies
WHERE policy_key IN (
  'housekeeping.slot_duration_minutes',
  'housekeeping.service_window',
  'housekeeping.capacity_per_slot_per_block',
  'housekeeping.cancellation_cutoff_minutes',
  'housekeeping.weekly_quota_by_tier'
);

-- ── Permission keys ───────────────────────────────────────────────────────
-- .view survives (re-labelled in migration 4). .schedule and .mark_done are
-- replaced by a finer-grained set, so strip them from every role now.
UPDATE public.custom_roles
SET permissions = permissions
                  - 'campus_living.housekeeping.schedule'
                  - 'campus_living.housekeeping.mark_done'
WHERE permissions ?| array[
  'campus_living.housekeeping.schedule',
  'campus_living.housekeeping.mark_done'
];
```

- [ ] **Step 3: Apply the migration**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
node --env-file=.env scripts/apply-migration-file.mjs 20260907085000_housekeeping_teardown.sql
```

Expected: the script reports success and the recorded statement length. If it reports `ok:false`, read the `error` and `sqlstate` — the whole file rolled back.

- [ ] **Step 4: Verify the teardown actually happened**

Via `mcp__supabase__execute_sql`:

```sql
SELECT
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname LIKE 'hostel_cleaning%')            AS tables_left,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE '%housekeep%')                 AS functions_left,
  (SELECT count(*) FROM pg_type WHERE typname LIKE 'cleaning%')                AS enums_left,
  (SELECT count(*) FROM platform_policies WHERE policy_key LIKE 'housekeeping%') AS policy_rows_left,
  (SELECT count(*) FROM custom_roles
    WHERE permissions ?| array['campus_living.housekeeping.schedule',
                               'campus_living.housekeeping.mark_done'])        AS roles_with_old_keys;
```

Expected exactly: `tables_left=0, functions_left=0, enums_left=0, policy_rows_left=2, roles_with_old_keys=0`.

`policy_rows_left=2` is correct — `booking_enabled` and `booking_advance_days` survive by design.

- [ ] **Step 5: Confirm the file on disk matches what ran**

A migration file can contain more than was applied. Via `mcp__supabase__execute_sql`:

```sql
SELECT version, length(array_to_string(statements, E'\n')) AS applied_len
FROM supabase_migrations.schema_migrations
ORDER BY version DESC LIMIT 3;
```

Compare `applied_len` against the local file:

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
wc -c supabase/migrations/20260907085000_housekeeping_teardown.sql
```

The lengths should be within a few bytes (line-ending differences only). A large gap means part of the file did not run.

- [ ] **Step 6: Regenerate Supabase types**

Use `mcp__supabase__generate_typescript_types` and write the result to `types/supabase.ts`. Never hand-edit it.

- [ ] **Step 7: Verify the generated types no longer mention the old tables**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
grep -c "hostel_cleaning" types/supabase.ts
```

Expected: `0`.

- [ ] **Step 8: Mirror into the setup reference files**

Remove the `hostel_cleaning_*` table definitions from `supabase/setup/01_tables.sql`, the `fn_housekeeping_*` functions from `02_functions.sql`, the policies from `03_policies.sql`, and the cleaning trigger from `04_triggers.sql`. These files are the reviewable end-state snapshot, not deltas.

- [ ] **Step 9: Commit**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
git add supabase/migrations/20260907085000_housekeeping_teardown.sql supabase/setup/ types/supabase.ts
git commit -m "feat(campus-living)!: drop the old housekeeping database objects

Removes 3 tables (151 rows), 12 functions, 3 enums and 5 platform_policies
rows, and strips .schedule/.mark_done from every role that held them.

Verified before applying: nothing outside the module had a foreign key or
policy referencing these tables, so the CASCADE is contained.

housekeeping.booking_enabled and .booking_advance_days survive; every other
knob becomes table configuration in the next migration.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

# Phase B — Database

## Task 3: Migration M2 — the new schema

Nine tables. RLS enabled in the same migration that creates them; every FK indexed; the room lock expressed as a partial unique index so no application path can bypass it.

**Files:**
- Create: `supabase/migrations/20260907090100_housekeeping_schema.sql`
- Modify: `types/supabase.ts` (regenerated), `supabase/setup/01_tables.sql`, `03_policies.sql`, `04_triggers.sql`

**Interfaces:**
- Consumes: Task 2's clean database.
- Produces: tables `hostel_cleaning_types`, `hostel_cleaning_type_expenses`, `hostel_cleaning_type_categories`, `hostel_cleaners`, `hostel_cleaner_blocks`, `hostel_cleaning_availability`, `hostel_cleaning_bookings`, `hostel_cleaning_booking_photos`, `hostel_cleaning_feedback`. Tasks 4 and 7–11 depend on these exact names and columns.

- [ ] **Step 1: Confirm the shared `updated_at` trigger function exists**

Reuse the house convention rather than adding a tenth variant. Via `mcp__supabase__execute_sql`:

```sql
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND proname='update_updated_at_column';
```

Expected: one row (it backs 244 existing triggers). If missing, STOP and report — do not silently create a variant.

- [ ] **Step 2: Write `supabase/migrations/20260907090100_housekeeping_schema.sql`**

```sql
-- Housekeeping rebuild, migration 2 of 4: schema.
--
-- Design notes that are NOT obvious from the DDL:
--
--   * bookings.learner_id references profiles(id), NOT learners_profiles(id).
--     hostel_allocations.learner_id is itself a FK to profiles(id) despite the
--     column name: all 714 live allocations resolve that way, zero resolve
--     through profiles.learner_id. The OLD bookings table pointed at
--     learners_profiles and was joining two different id spaces.
--     The chain is: auth.uid() = profiles.id = hostel_allocations.learner_id.
--
--   * The room lock is ux_hk_one_live_booking_per_room, a PARTIAL UNIQUE INDEX.
--     Two roommates tapping Book in the same second get one booking and one
--     23505. There is no application path around it.
--
--   * bookings carries four snapshot columns (type_name, duration_minutes,
--     expected_cost_inr, cleaner_name) so renaming a type, editing its
--     expenses, deactivating it, or retiring a cleaner never rewrites the
--     history of jobs already done.
--
--   * cleaner_name is a snapshot specifically so learners never need SELECT on
--     hostel_cleaners, which holds staff phone numbers. Postgres RLS is
--     row-level, not column-level: exposing the row exposes the PII.
--
--   * An EMPTY hostel_cleaning_type_categories set means NOBODY can book that
--     type. It fails closed. The types UI must warn on a type with no
--     categories, because it is invisible to every learner.
--
--   * hostel_categories is a GLOBAL lookup with no institution_id (12 rows,
--     gender-split). The junction is what makes a type institution-scoped.
--
-- Spec: specs/campus-living-housekeeping-rebuild-spec-2026-09-07.md §3, §8

-- ══════════════════════════════════════════════════════════════════════════
-- 1. hostel_cleaning_types
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE public.hostel_cleaning_types (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    uuid NOT NULL REFERENCES public.institutions(id),
  name              text NOT NULL,
  description       text,
  duration_minutes  integer NOT NULL CHECK (duration_minutes > 0 AND duration_minutes <= 480),
  usage_limit_count integer NOT NULL CHECK (usage_limit_count >= 1),
  usage_period      text    NOT NULL CHECK (usage_period IN ('day','week','month')),
  is_active         boolean NOT NULL DEFAULT true,
  sort_order        integer NOT NULL DEFAULT 0,
  created_by        uuid REFERENCES public.profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hk_types_institution ON public.hostel_cleaning_types (institution_id);
CREATE INDEX idx_hk_types_created_by  ON public.hostel_cleaning_types (created_by);
CREATE UNIQUE INDEX ux_hk_types_name_per_institution
  ON public.hostel_cleaning_types (institution_id, lower(name));
CREATE TRIGGER t_hk_types_touch BEFORE UPDATE ON public.hostel_cleaning_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.hostel_cleaning_types ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. hostel_cleaning_type_expenses
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE public.hostel_cleaning_type_expenses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id        uuid NOT NULL REFERENCES public.hostel_cleaning_types(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  item_name      text NOT NULL,
  unit           text,
  quantity       numeric(10,2) NOT NULL CHECK (quantity > 0),
  unit_cost_inr  numeric(10,2) NOT NULL CHECK (unit_cost_inr >= 0),
  line_total_inr numeric(12,2) GENERATED ALWAYS AS (quantity * unit_cost_inr) STORED,
  sort_order     integer NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hk_type_expenses_type        ON public.hostel_cleaning_type_expenses (type_id);
CREATE INDEX idx_hk_type_expenses_institution ON public.hostel_cleaning_type_expenses (institution_id);
CREATE TRIGGER t_hk_type_expenses_touch BEFORE UPDATE ON public.hostel_cleaning_type_expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.hostel_cleaning_type_expenses ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. hostel_cleaning_type_categories  (eligibility junction)
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE public.hostel_cleaning_type_categories (
  type_id     uuid NOT NULL REFERENCES public.hostel_cleaning_types(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.hostel_categories(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (type_id, category_id)
);
CREATE INDEX idx_hk_type_categories_category ON public.hostel_cleaning_type_categories (category_id);
ALTER TABLE public.hostel_cleaning_type_categories ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- 4. hostel_cleaners  (directory records; NO login, NO profile link)
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE public.hostel_cleaners (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  full_name      text NOT NULL,
  phone          text,
  gender         text CHECK (gender IN ('Male','Female','Other')),
  employee_code  text,
  -- Postgres DOW: 0=Sunday .. 6=Saturday. Default is Mon-Sat.
  working_days   integer[] NOT NULL DEFAULT '{1,2,3,4,5,6}',
  shift_start    time,
  shift_end      time,
  is_active      boolean NOT NULL DEFAULT true,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_hk_cleaners_shift
    CHECK (shift_end IS NULL OR shift_start IS NULL OR shift_end > shift_start),
  CONSTRAINT ck_hk_cleaners_working_days
    CHECK (working_days <@ ARRAY[0,1,2,3,4,5,6])
);
CREATE INDEX idx_hk_cleaners_institution ON public.hostel_cleaners (institution_id);
CREATE TRIGGER t_hk_cleaners_touch BEFORE UPDATE ON public.hostel_cleaners
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.hostel_cleaners ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- 5. hostel_cleaner_blocks
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE public.hostel_cleaner_blocks (
  cleaner_id uuid NOT NULL REFERENCES public.hostel_cleaners(id) ON DELETE CASCADE,
  block_id   uuid NOT NULL REFERENCES public.hostel_blocks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cleaner_id, block_id)
);
CREATE INDEX idx_hk_cleaner_blocks_block ON public.hostel_cleaner_blocks (block_id);
ALTER TABLE public.hostel_cleaner_blocks ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- 6. hostel_cleaning_availability  (per block, per weekday)
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE public.hostel_cleaning_availability (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  block_id       uuid NOT NULL REFERENCES public.hostel_blocks(id) ON DELETE CASCADE,
  weekday        integer NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  is_open        boolean NOT NULL DEFAULT true,
  window_start   time NOT NULL DEFAULT '09:00',
  window_end     time NOT NULL DEFAULT '17:00',
  capacity       integer NOT NULL DEFAULT 1 CHECK (capacity >= 1),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_hk_availability_window CHECK (window_end > window_start),
  CONSTRAINT ux_hk_availability_block_weekday UNIQUE (block_id, weekday)
);
CREATE INDEX idx_hk_availability_institution ON public.hostel_cleaning_availability (institution_id);
CREATE TRIGGER t_hk_availability_touch BEFORE UPDATE ON public.hostel_cleaning_availability
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.hostel_cleaning_availability ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- 7. hostel_cleaning_bookings  (the core record)
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE public.hostel_cleaning_bookings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id    uuid NOT NULL REFERENCES public.institutions(id),
  block_id          uuid NOT NULL REFERENCES public.hostel_blocks(id),
  room_id           uuid NOT NULL REFERENCES public.hostel_rooms(id),
  allocation_id     uuid NOT NULL REFERENCES public.hostel_allocations(id),
  -- profiles(id), matching hostel_allocations.learner_id. See header note.
  learner_id        uuid NOT NULL REFERENCES public.profiles(id),
  type_id           uuid NOT NULL REFERENCES public.hostel_cleaning_types(id) ON DELETE RESTRICT,

  booking_date      date NOT NULL,
  slot_start        time NOT NULL,
  slot_end          time NOT NULL,
  status            text NOT NULL DEFAULT 'booked'
    CHECK (status IN ('booked','assigned','in_progress','awaiting_feedback','completed','cancelled')),

  cleaner_id        uuid REFERENCES public.hostel_cleaners(id),
  cleaner_name      text,
  assigned_at       timestamptz,
  assigned_by       uuid REFERENCES public.profiles(id),

  started_at        timestamptz,
  finished_at       timestamptz,

  -- Display + notification scheduling only. The hold predicate is
  -- booking_date < p_date (fn_cl_housekeeping_feedback_holds), the authority.
  feedback_due_at   timestamptz NOT NULL,

  -- Snapshots, frozen at booking / assign time.
  type_name         text NOT NULL,
  duration_minutes  integer NOT NULL,
  expected_cost_inr numeric(12,2) NOT NULL DEFAULT 0,

  waived_at         timestamptz,
  waived_by         uuid REFERENCES public.profiles(id),
  waive_reason      text,

  cancelled_at      timestamptz,
  cancelled_by      uuid REFERENCES public.profiles(id),
  cancel_reason     text,

  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_hk_bookings_slot  CHECK (slot_end > slot_start),
  CONSTRAINT ck_hk_bookings_waive CHECK (waived_at IS NULL OR waive_reason IS NOT NULL)
);

-- THE ROOM LOCK. One live booking per room, enforced by the database.
CREATE UNIQUE INDEX ux_hk_one_live_booking_per_room
  ON public.hostel_cleaning_bookings (room_id)
  WHERE status IN ('booked','assigned','in_progress','awaiting_feedback');

CREATE INDEX idx_hk_bookings_institution_date ON public.hostel_cleaning_bookings (institution_id, booking_date);
CREATE INDEX idx_hk_bookings_block_date       ON public.hostel_cleaning_bookings (block_id, booking_date);
CREATE INDEX idx_hk_bookings_room_date        ON public.hostel_cleaning_bookings (room_id, booking_date);
CREATE INDEX idx_hk_bookings_cleaner_date     ON public.hostel_cleaning_bookings (cleaner_id, booking_date);
CREATE INDEX idx_hk_bookings_learner          ON public.hostel_cleaning_bookings (learner_id);
CREATE INDEX idx_hk_bookings_allocation       ON public.hostel_cleaning_bookings (allocation_id);
CREATE INDEX idx_hk_bookings_type             ON public.hostel_cleaning_bookings (type_id);
CREATE INDEX idx_hk_bookings_assigned_by      ON public.hostel_cleaning_bookings (assigned_by);
CREATE INDEX idx_hk_bookings_waived_by        ON public.hostel_cleaning_bookings (waived_by);
CREATE INDEX idx_hk_bookings_cancelled_by     ON public.hostel_cleaning_bookings (cancelled_by);

-- The attendance-hold lookup. Deliberately narrow: only a handful of rows sit
-- in awaiting_feedback at any moment, which is what keeps the hostel_attendance
-- trigger cheap on a 15,822-row hot table.
CREATE INDEX idx_hk_bookings_awaiting_feedback
  ON public.hostel_cleaning_bookings (room_id, booking_date)
  WHERE status = 'awaiting_feedback';

CREATE TRIGGER t_hk_bookings_touch BEFORE UPDATE ON public.hostel_cleaning_bookings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.hostel_cleaning_bookings ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- 8. hostel_cleaning_booking_photos
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE public.hostel_cleaning_booking_photos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     uuid NOT NULL REFERENCES public.hostel_cleaning_bookings(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  phase          text NOT NULL CHECK (phase IN ('before','after')),
  drive_file_id  text NOT NULL,
  drive_url      text NOT NULL,
  file_name      text,
  mime_type      text,
  size_bytes     bigint,
  uploaded_by    uuid NOT NULL REFERENCES public.profiles(id),
  uploaded_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_hk_photos_booking     ON public.hostel_cleaning_booking_photos (booking_id);
CREATE INDEX idx_hk_photos_institution ON public.hostel_cleaning_booking_photos (institution_id);
CREATE INDEX idx_hk_photos_uploader    ON public.hostel_cleaning_booking_photos (uploaded_by);
ALTER TABLE public.hostel_cleaning_booking_photos ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- 9. hostel_cleaning_feedback
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE public.hostel_cleaning_feedback (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id     uuid NOT NULL REFERENCES public.hostel_cleaning_bookings(id) ON DELETE CASCADE,
  institution_id uuid NOT NULL REFERENCES public.institutions(id),
  room_id        uuid NOT NULL REFERENCES public.hostel_rooms(id),
  learner_id     uuid NOT NULL REFERENCES public.profiles(id),
  rating         integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment        text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ux_hk_feedback_one_per_learner UNIQUE (booking_id, learner_id)
);
CREATE INDEX idx_hk_feedback_booking     ON public.hostel_cleaning_feedback (booking_id);
CREATE INDEX idx_hk_feedback_institution ON public.hostel_cleaning_feedback (institution_id);
CREATE INDEX idx_hk_feedback_room        ON public.hostel_cleaning_feedback (room_id);
CREATE INDEX idx_hk_feedback_learner     ON public.hostel_cleaning_feedback (learner_id);
ALTER TABLE public.hostel_cleaning_feedback ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
--
-- One permissive policy per table per verb. Every auth call is wrapped in a
-- scalar subquery so it evaluates once per query (InitPlan) rather than once
-- per candidate row.
--
-- Learner access is deliberately narrow:
--   types, type_categories   : SELECT yes (they must see what they can book)
--   type_expenses            : SELECT NO  (institution cost data)
--   cleaners, cleaner_blocks : SELECT NO  (phone numbers; RLS is row-level, so
--                              exposing the row exposes the PII. The learner
--                              sees bookings.cleaner_name instead.)
--   availability             : SELECT NO  (the slots RPC is DEFINER)
--   bookings, photos, feedback : SELECT yes, scoped to their own room
-- ══════════════════════════════════════════════════════════════════════════

-- ── types ────────────────────────────────────────────────────────────────
CREATE POLICY hk_types_select ON public.hostel_cleaning_types FOR SELECT
USING (
  (SELECT is_super_admin())
  OR ((SELECT user_has_permission('campus_living.housekeeping.view'))
      AND role_has_institution_access(institution_id))
  OR (is_active AND EXISTS (
        SELECT 1 FROM public.hostel_allocations a
        WHERE a.learner_id = (SELECT auth.uid())
          AND a.institution_id = hostel_cleaning_types.institution_id
          AND a.status::text = ANY (public.fn_cl_roster_statuses())))
);
CREATE POLICY hk_types_insert ON public.hostel_cleaning_types FOR INSERT
WITH CHECK (
  (SELECT is_super_admin())
  OR ((SELECT user_has_permission('campus_living.housekeeping.types_manage'))
      AND role_has_institution_access(institution_id))
);
CREATE POLICY hk_types_update ON public.hostel_cleaning_types FOR UPDATE
USING (
  (SELECT is_super_admin())
  OR ((SELECT user_has_permission('campus_living.housekeeping.types_manage'))
      AND role_has_institution_access(institution_id))
);
CREATE POLICY hk_types_delete ON public.hostel_cleaning_types FOR DELETE
USING (
  (SELECT is_super_admin())
  OR ((SELECT user_has_permission('campus_living.housekeeping.types_manage'))
      AND role_has_institution_access(institution_id))
);

-- ── type_expenses (warden only, every verb) ──────────────────────────────
CREATE POLICY hk_type_expenses_select ON public.hostel_cleaning_type_expenses FOR SELECT
USING (
  (SELECT is_super_admin())
  OR ((SELECT user_has_permission('campus_living.housekeeping.view'))
      AND role_has_institution_access(institution_id))
);
CREATE POLICY hk_type_expenses_insert ON public.hostel_cleaning_type_expenses FOR INSERT
WITH CHECK (
  (SELECT is_super_admin())
  OR ((SELECT user_has_permission('campus_living.housekeeping.types_manage'))
      AND role_has_institution_access(institution_id))
);
CREATE POLICY hk_type_expenses_update ON public.hostel_cleaning_type_expenses FOR UPDATE
USING (
  (SELECT is_super_admin())
  OR ((SELECT user_has_permission('campus_living.housekeeping.types_manage'))
      AND role_has_institution_access(institution_id))
);
CREATE POLICY hk_type_expenses_delete ON public.hostel_cleaning_type_expenses FOR DELETE
USING (
  (SELECT is_super_admin())
  OR ((SELECT user_has_permission('campus_living.housekeeping.types_manage'))
      AND role_has_institution_access(institution_id))
);

-- ── type_categories (readable by anyone who can read the parent type) ────
CREATE POLICY hk_type_categories_select ON public.hostel_cleaning_type_categories FOR SELECT
USING (EXISTS (SELECT 1 FROM public.hostel_cleaning_types t WHERE t.id = type_id));
CREATE POLICY hk_type_categories_insert ON public.hostel_cleaning_type_categories FOR INSERT
WITH CHECK (
  (SELECT is_super_admin())
  OR EXISTS (SELECT 1 FROM public.hostel_cleaning_types t
             WHERE t.id = type_id
               AND (SELECT user_has_permission('campus_living.housekeeping.types_manage'))
               AND role_has_institution_access(t.institution_id))
);
CREATE POLICY hk_type_categories_delete ON public.hostel_cleaning_type_categories FOR DELETE
USING (
  (SELECT is_super_admin())
  OR EXISTS (SELECT 1 FROM public.hostel_cleaning_types t
             WHERE t.id = type_id
               AND (SELECT user_has_permission('campus_living.housekeeping.types_manage'))
               AND role_has_institution_access(t.institution_id))
);

-- ── cleaners (warden only, every verb) ───────────────────────────────────
CREATE POLICY hk_cleaners_select ON public.hostel_cleaners FOR SELECT
USING (
  (SELECT is_super_admin())
  OR ((SELECT user_has_permission('campus_living.housekeeping.view'))
      AND role_has_institution_access(institution_id))
);
CREATE POLICY hk_cleaners_insert ON public.hostel_cleaners FOR INSERT
WITH CHECK (
  (SELECT is_super_admin())
  OR ((SELECT user_has_permission('campus_living.housekeeping.cleaners_manage'))
      AND role_has_institution_access(institution_id))
);
CREATE POLICY hk_cleaners_update ON public.hostel_cleaners FOR UPDATE
USING (
  (SELECT is_super_admin())
  OR ((SELECT user_has_permission('campus_living.housekeeping.cleaners_manage'))
      AND role_has_institution_access(institution_id))
);
CREATE POLICY hk_cleaners_delete ON public.hostel_cleaners FOR DELETE
USING (
  (SELECT is_super_admin())
  OR ((SELECT user_has_permission('campus_living.housekeeping.cleaners_manage'))
      AND role_has_institution_access(institution_id))
);

-- ── cleaner_blocks ───────────────────────────────────────────────────────
CREATE POLICY hk_cleaner_blocks_select ON public.hostel_cleaner_blocks FOR SELECT
USING (EXISTS (SELECT 1 FROM public.hostel_cleaners c WHERE c.id = cleaner_id));
CREATE POLICY hk_cleaner_blocks_insert ON public.hostel_cleaner_blocks FOR INSERT
WITH CHECK (
  (SELECT is_super_admin())
  OR EXISTS (SELECT 1 FROM public.hostel_cleaners c
             WHERE c.id = cleaner_id
               AND (SELECT user_has_permission('campus_living.housekeeping.cleaners_manage'))
               AND role_has_institution_access(c.institution_id))
);
CREATE POLICY hk_cleaner_blocks_delete ON public.hostel_cleaner_blocks FOR DELETE
USING (
  (SELECT is_super_admin())
  OR EXISTS (SELECT 1 FROM public.hostel_cleaners c
             WHERE c.id = cleaner_id
               AND (SELECT user_has_permission('campus_living.housekeeping.cleaners_manage'))
               AND role_has_institution_access(c.institution_id))
);

-- ── availability (warden only) ───────────────────────────────────────────
CREATE POLICY hk_availability_select ON public.hostel_cleaning_availability FOR SELECT
USING (
  (SELECT is_super_admin())
  OR ((SELECT user_has_permission('campus_living.housekeeping.view'))
      AND role_has_institution_access(institution_id))
);
CREATE POLICY hk_availability_insert ON public.hostel_cleaning_availability FOR INSERT
WITH CHECK (
  (SELECT is_super_admin())
  OR ((SELECT user_has_permission('campus_living.housekeeping.availability_manage'))
      AND role_has_institution_access(institution_id))
);
CREATE POLICY hk_availability_update ON public.hostel_cleaning_availability FOR UPDATE
USING (
  (SELECT is_super_admin())
  OR ((SELECT user_has_permission('campus_living.housekeeping.availability_manage'))
      AND role_has_institution_access(institution_id))
);
CREATE POLICY hk_availability_delete ON public.hostel_cleaning_availability FOR DELETE
USING (
  (SELECT is_super_admin())
  OR ((SELECT user_has_permission('campus_living.housekeeping.availability_manage'))
      AND role_has_institution_access(institution_id))
);

-- ── bookings ─────────────────────────────────────────────────────────────
-- Roommates MUST see the booking: rating it is the whole point of the flow.
CREATE POLICY hk_bookings_select ON public.hostel_cleaning_bookings FOR SELECT
USING (
  (SELECT is_super_admin())
  OR ((SELECT user_has_permission('campus_living.housekeeping.view'))
      AND role_has_institution_access(institution_id))
  OR EXISTS (
       SELECT 1 FROM public.hostel_allocations a
       WHERE a.room_id = hostel_cleaning_bookings.room_id
         AND a.learner_id = (SELECT auth.uid())
         AND a.status::text = ANY (public.fn_cl_roster_statuses()))
);
-- INSERT and DELETE are RPC-only: no policy is created for them, so PostgREST
-- refuses both for every role. That is deliberate, not an omission.
CREATE POLICY hk_bookings_update ON public.hostel_cleaning_bookings FOR UPDATE
USING (
  (SELECT is_super_admin())
  OR (((SELECT user_has_permission('campus_living.housekeeping.execute'))
       OR (SELECT user_has_permission('campus_living.housekeeping.assign'))
       OR (SELECT user_has_permission('campus_living.housekeeping.waive')))
      AND role_has_institution_access(institution_id))
);

-- ── booking_photos ───────────────────────────────────────────────────────
CREATE POLICY hk_photos_select ON public.hostel_cleaning_booking_photos FOR SELECT
USING (EXISTS (SELECT 1 FROM public.hostel_cleaning_bookings b WHERE b.id = booking_id));
CREATE POLICY hk_photos_insert ON public.hostel_cleaning_booking_photos FOR INSERT
WITH CHECK (
  (SELECT is_super_admin())
  OR ((SELECT user_has_permission('campus_living.housekeeping.execute'))
      AND role_has_institution_access(institution_id))
);
CREATE POLICY hk_photos_delete ON public.hostel_cleaning_booking_photos FOR DELETE
USING (
  (SELECT is_super_admin())
  OR ((SELECT user_has_permission('campus_living.housekeeping.execute'))
      AND role_has_institution_access(institution_id))
);

-- ── feedback ─────────────────────────────────────────────────────────────
CREATE POLICY hk_feedback_select ON public.hostel_cleaning_feedback FOR SELECT
USING (EXISTS (SELECT 1 FROM public.hostel_cleaning_bookings b WHERE b.id = booking_id));
-- Only a learner living in that room, rating as themselves, on a job that is
-- actually awaiting feedback.
CREATE POLICY hk_feedback_insert ON public.hostel_cleaning_feedback FOR INSERT
WITH CHECK (
  learner_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.hostel_cleaning_bookings b
    JOIN public.hostel_allocations a ON a.room_id = b.room_id
    WHERE b.id = booking_id
      AND b.status = 'awaiting_feedback'
      AND a.learner_id = (SELECT auth.uid())
      AND a.status::text = ANY (public.fn_cl_roster_statuses()))
);
```

- [ ] **Step 3: Apply the migration**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
node --env-file=.env scripts/apply-migration-file.mjs 20260907090100_housekeeping_schema.sql
```

Expected: success. A failure rolls the whole file back — there is no partial state to clean up.

- [ ] **Step 4: Verify all nine tables exist WITH RLS ON**

A table with RLS off and grants present is a published unauthenticated CRUD API. Via `mcp__supabase__execute_sql`:

```sql
SELECT c.relname, c.relrowsecurity AS rls_on,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('hostel_cleaning_types','hostel_cleaning_type_expenses',
                    'hostel_cleaning_type_categories','hostel_cleaners',
                    'hostel_cleaner_blocks','hostel_cleaning_availability',
                    'hostel_cleaning_bookings','hostel_cleaning_booking_photos',
                    'hostel_cleaning_feedback')
ORDER BY 1;
```

Expected: **9 rows, `rls_on = true` and `policies > 0` on every one.** Anything else is stop-and-fix.

- [ ] **Step 5: Verify every foreign key has an index**

```sql
SELECT c.conrelid::regclass AS tbl, a.attname AS unindexed_fk_column
FROM pg_constraint c
JOIN unnest(c.conkey) k(attnum) ON true
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
WHERE c.contype = 'f'
  AND c.conrelid::regclass::text LIKE 'hostel_clean%'
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid AND i.indkey[0] = a.attnum);
```

Expected: **zero rows.**

- [ ] **Step 6: Prove the room lock actually locks**

This is the single most important constraint in the module — do not take it on faith. Via `mcp__supabase__execute_sql`:

```sql
DO $$
DECLARE
  v_room uuid; v_block uuid; v_inst uuid; v_alloc uuid; v_learner uuid; v_type uuid;
  v_failed boolean := false;
BEGIN
  SELECT a.room_id, a.block_id, a.institution_id, a.id, a.learner_id
    INTO v_room, v_block, v_inst, v_alloc, v_learner
  FROM hostel_allocations a
  WHERE a.status::text = ANY (fn_cl_roster_statuses())
  LIMIT 1;

  INSERT INTO hostel_cleaning_types
    (institution_id, name, duration_minutes, usage_limit_count, usage_period)
  VALUES (v_inst, '__roomlock_probe__', 30, 2, 'week')
  RETURNING id INTO v_type;

  INSERT INTO hostel_cleaning_bookings
    (institution_id, block_id, room_id, allocation_id, learner_id, type_id,
     booking_date, slot_start, slot_end, feedback_due_at, type_name, duration_minutes)
  VALUES (v_inst, v_block, v_room, v_alloc, v_learner, v_type,
          current_date, '09:00', '09:30', now(), '__probe__', 30);

  BEGIN
    INSERT INTO hostel_cleaning_bookings
      (institution_id, block_id, room_id, allocation_id, learner_id, type_id,
       booking_date, slot_start, slot_end, feedback_due_at, type_name, duration_minutes)
    VALUES (v_inst, v_block, v_room, v_alloc, v_learner, v_type,
            current_date, '10:00', '10:30', now(), '__probe__', 30);
  EXCEPTION WHEN unique_violation THEN
    v_failed := true;
  END;

  DELETE FROM hostel_cleaning_bookings WHERE type_name = '__probe__';
  DELETE FROM hostel_cleaning_types WHERE name = '__roomlock_probe__';

  IF NOT v_failed THEN
    RAISE EXCEPTION 'ROOM LOCK IS NOT WORKING - second booking was accepted';
  END IF;
  RAISE NOTICE 'Room lock verified: second live booking rejected with 23505.';
END $$;
```

Expected: completes with the `Room lock verified` notice. If it raises `ROOM LOCK IS NOT WORKING`, the partial index is wrong — stop and fix before any UI is built on a lock that does not lock.

- [ ] **Step 7: Run the Supabase security advisors**

Use `mcp__supabase__get_advisors` with type `security`.

Expected: **zero ERROR-level findings** mentioning any `hostel_clean*` object. Pre-existing unrelated warnings are acceptable — note, don't fix.

- [ ] **Step 8: Regenerate types and confirm the tables landed**

Use `mcp__supabase__generate_typescript_types`, write to `types/supabase.ts`, then:

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
for t in hostel_cleaning_types hostel_cleaning_type_expenses hostel_cleaning_type_categories \
         hostel_cleaners hostel_cleaner_blocks hostel_cleaning_availability \
         hostel_cleaning_bookings hostel_cleaning_booking_photos hostel_cleaning_feedback; do
  printf "%s: %s\n" "$t" "$(grep -c "$t" types/supabase.ts)"
done
```

Expected: every count `> 0`. A missing table makes `.from('<table>')` fail with a misleading TS2769 overload cascade.

- [ ] **Step 9: Mirror into the setup reference files**

Append the nine `CREATE TABLE` blocks to `supabase/setup/01_tables.sql`, the policies to `03_policies.sql`, and the four `t_hk_*_touch` triggers to `04_triggers.sql`.

- [ ] **Step 10: Commit**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
git add supabase/migrations/20260907090100_housekeeping_schema.sql supabase/setup/ types/supabase.ts
git commit -m "feat(campus-living): housekeeping schema - types, cleaners, bookings, evidence

Nine tables with RLS enabled and every FK indexed in the same migration.

The room lock is a partial unique index on (room_id) WHERE status is live,
so two roommates booking simultaneously produce one booking and one 23505
rather than a race the application has to reason about. Verified by probe.

bookings.learner_id references profiles(id) to match
hostel_allocations.learner_id; the old table pointed at learners_profiles,
a different id space, and could never have joined correctly.

Learners can read types and their own room's bookings, but not expense
lines or the cleaner directory - the latter holds phone numbers and RLS is
row-level, so bookings.cleaner_name carries the name instead.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Migration M3 — RPCs, the hold function, and the attendance trigger

**Files:**
- Create: `supabase/migrations/20260907090200_housekeeping_rpcs.sql`
- Modify: `supabase/setup/02_functions.sql`, `supabase/setup/04_triggers.sql`

**Interfaces:**
- Consumes: every table from Task 3.
- Produces, called by name from Tasks 10, 11 and 18:
  - `fn_cl_housekeeping_slots(p_room_id uuid, p_type_id uuid, p_date date) → jsonb`
  - `fn_cl_housekeeping_book(p_type_id uuid, p_date date, p_slot_start time, p_notes text) → jsonb`
  - `fn_cl_housekeeping_cancel(p_booking_id uuid, p_reason text) → jsonb`
  - `fn_cl_housekeeping_assign(p_booking_id uuid, p_cleaner_id uuid, p_clear boolean) → jsonb`
  - `fn_cl_housekeeping_feedback_holds(p_institution_id uuid, p_block_id uuid, p_date date) → TABLE(learner_id uuid, room_id uuid, booking_id uuid, booking_date date, type_name text)`

Every jsonb result is a discriminated union: `{"success": true, ...}` or `{"success": false, "error_code": "..."}`.

- [ ] **Step 1: Note the two rules that make DEFINER functions safe here**

Before writing, internalise these — both are load-bearing:

1. **`SET search_path = ''` means every object needs a schema prefix.** `hostel_cleaning_types` becomes `public.hostel_cleaning_types`. Miss one and the function fails at runtime, not at creation.
2. **Re-creating a dropped function silently re-grants EXECUTE to PUBLIC** (which includes `anon`). Every function below therefore ends with an explicit `REVOKE … FROM PUBLIC, anon` followed by a deliberate `GRANT … TO authenticated`. Restoring captured grants is not enough — revoke, then grant.

- [ ] **Step 2: Write `supabase/migrations/20260907090200_housekeeping_rpcs.sql`**

```sql
-- Housekeeping rebuild, migration 3 of 4: RPCs, hold function, attendance trigger.
--
-- Every function here is SECURITY DEFINER and therefore bypasses RLS. Each one
-- consequently:
--   * derives the caller from auth.uid() INTERNALLY. No function accepts a
--     caller-id parameter -- parameters are attacker-controlled, and a DEFINER
--     RPC that trusts p_user_id lets any caller impersonate anyone.
--   * runs with SET search_path = '' so nothing can be shadowed. That is why
--     every single object reference below is schema-qualified.
--   * performs its own permission check before touching data.
--   * has EXECUTE revoked from PUBLIC and anon, then granted to authenticated.
--     CREATE OR REPLACE silently re-grants EXECUTE to PUBLIC, so the revoke is
--     not optional and must follow every definition.
--
-- Spec: specs/campus-living-housekeeping-rebuild-spec-2026-09-07.md §6, §8

-- ══════════════════════════════════════════════════════════════════════════
-- fn_cl_housekeeping_slots
--
-- The slot grid for one room + one cleaning type + one date.
-- Slot length is the TYPE's duration, so a 30-minute type yields 30-minute
-- slots and a 90-minute type yields 90-minute slots from the same window.
--
-- Returns jsonb rather than SETOF so a closed day can carry its reason:
--   {"open": false, "reason": "day_closed", "slots": []}
--   {"open": true,  "slots": [{slot_start, slot_end, remaining_capacity,
--                              is_bookable, reason}, ...]}
-- Learners cannot SELECT hostel_cleaning_availability (warden-only policy),
-- which is exactly why this function is DEFINER.
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_cl_housekeeping_slots(
  p_room_id uuid,
  p_type_id uuid,
  p_date    date
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_block_id   uuid;
  v_duration   integer;
  v_avail      public.hostel_cleaning_availability%ROWTYPE;
  v_cursor     time;
  v_slot_end   time;
  v_used       integer;
  v_slots      jsonb := '[]'::jsonb;
  v_now_ist    timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('open', false, 'reason', 'unauthenticated', 'slots', '[]'::jsonb);
  END IF;

  -- The caller must actually live in this room. Without this check a DEFINER
  -- function would happily enumerate any room's availability.
  IF NOT EXISTS (
    SELECT 1 FROM public.hostel_allocations a
    WHERE a.room_id = p_room_id
      AND a.learner_id = v_uid
      AND a.status::text = ANY (public.fn_cl_roster_statuses())
  ) AND NOT public.user_has_permission('campus_living.housekeeping.view') THEN
    RETURN jsonb_build_object('open', false, 'reason', 'not_your_room', 'slots', '[]'::jsonb);
  END IF;

  SELECT r.block_id INTO v_block_id FROM public.hostel_rooms r WHERE r.id = p_room_id;
  IF v_block_id IS NULL THEN
    RETURN jsonb_build_object('open', false, 'reason', 'room_not_found', 'slots', '[]'::jsonb);
  END IF;

  SELECT t.duration_minutes INTO v_duration
  FROM public.hostel_cleaning_types t
  WHERE t.id = p_type_id AND t.is_active;
  IF v_duration IS NULL THEN
    RETURN jsonb_build_object('open', false, 'reason', 'type_unavailable', 'slots', '[]'::jsonb);
  END IF;

  SELECT * INTO v_avail
  FROM public.hostel_cleaning_availability av
  WHERE av.block_id = v_block_id
    AND av.weekday = EXTRACT(DOW FROM p_date)::integer;

  IF NOT FOUND OR NOT v_avail.is_open THEN
    RETURN jsonb_build_object('open', false, 'reason', 'day_closed', 'slots', '[]'::jsonb);
  END IF;

  v_cursor := v_avail.window_start;
  WHILE v_cursor + make_interval(mins => v_duration) <= v_avail.window_end LOOP
    v_slot_end := v_cursor + make_interval(mins => v_duration);

    -- Parallel cleanings already committed in this block overlapping this slot.
    SELECT count(*)::integer INTO v_used
    FROM public.hostel_cleaning_bookings b
    WHERE b.block_id = v_block_id
      AND b.booking_date = p_date
      AND b.status <> 'cancelled'
      AND b.slot_start < v_slot_end
      AND b.slot_end   > v_cursor;

    v_slots := v_slots || jsonb_build_object(
      'slot_start', to_char(v_cursor, 'HH24:MI'),
      'slot_end',   to_char(v_slot_end, 'HH24:MI'),
      'remaining_capacity', greatest(v_avail.capacity - v_used, 0),
      'is_bookable', (v_used < v_avail.capacity)
                     AND ((p_date > (v_now_ist AT TIME ZONE 'Asia/Kolkata')::date)
                       OR (p_date = (v_now_ist AT TIME ZONE 'Asia/Kolkata')::date
                           AND v_cursor > (v_now_ist AT TIME ZONE 'Asia/Kolkata')::time)),
      'reason', CASE
                  WHEN v_used >= v_avail.capacity THEN 'slot_full'
                  WHEN p_date < (v_now_ist AT TIME ZONE 'Asia/Kolkata')::date
                    OR (p_date = (v_now_ist AT TIME ZONE 'Asia/Kolkata')::date
                        AND v_cursor <= (v_now_ist AT TIME ZONE 'Asia/Kolkata')::time) THEN 'past'
                  ELSE NULL
                END
    );

    v_cursor := v_slot_end;
  END LOOP;

  RETURN jsonb_build_object('open', true, 'slots', v_slots);
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_housekeeping_slots(uuid, uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_housekeeping_slots(uuid, uuid, date) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- fn_cl_housekeeping_book
--
-- The full validation chain, in the order the spec defines (§8.1). Returns the
-- first failure rather than collecting them, because the UI shows one message.
--
-- The advisory lock narrows the double-book race; ux_hk_one_live_booking_per_room
-- closes it. Both are needed: the lock gives a clean error_code for the common
-- case, the index guarantees correctness for the rest.
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_cl_housekeeping_book(
  p_type_id    uuid,
  p_date       date,
  p_slot_start time,
  p_notes      text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_alloc        public.hostel_allocations%ROWTYPE;
  v_type         public.hostel_cleaning_types%ROWTYPE;
  v_category_id  uuid;
  v_slot_end     time;
  v_window_start date;
  v_used         integer;
  v_advance_days integer;
  v_slots        jsonb;
  v_slot         jsonb;
  v_ok           boolean := false;
  v_cost         numeric(12,2);
  v_booking_id   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'unauthenticated');
  END IF;

  -- 1. Master kill switch.
  IF NOT public.fn_get_policy_bool('housekeeping.booking_enabled', true, NULL) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'feature_disabled');
  END IF;

  -- 2. Live allocation. This is the learner's authorisation -- no permission
  --    key is involved; living in the room IS the right to book for it.
  SELECT * INTO v_alloc
  FROM public.hostel_allocations a
  WHERE a.learner_id = v_uid
    AND a.status::text = ANY (public.fn_cl_roster_statuses())
  ORDER BY a.allocation_date DESC NULLS LAST
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'no_allocation');
  END IF;

  -- 3. Active type in the caller's institution.
  SELECT * INTO v_type
  FROM public.hostel_cleaning_types t
  WHERE t.id = p_type_id
    AND t.is_active
    AND t.institution_id = v_alloc.institution_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'type_unavailable');
  END IF;

  -- 4. Eligibility by the SEATED room's category (never the billed category,
  --    and never hostel_allocations.tier_id, which is dead in production).
  --    An empty junction means nobody can book: it fails closed.
  SELECT r.category_id INTO v_category_id
  FROM public.hostel_rooms r WHERE r.id = v_alloc.room_id;
  IF v_category_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.hostel_cleaning_type_categories tc
    WHERE tc.type_id = p_type_id AND tc.category_id = v_category_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'category_not_eligible');
  END IF;

  -- Serialise same-room bookers before the read-then-write below.
  PERFORM pg_advisory_xact_lock(hashtext(v_alloc.room_id::text));

  -- 5. Room lock: one live booking per room, any type.
  IF EXISTS (
    SELECT 1 FROM public.hostel_cleaning_bookings b
    WHERE b.room_id = v_alloc.room_id
      AND b.status IN ('booked','assigned','in_progress','awaiting_feedback')
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'room_locked');
  END IF;

  -- 6. Quota: per room, per type, rolling window ending on the booking date.
  v_window_start := CASE v_type.usage_period
                      WHEN 'day'   THEN p_date
                      WHEN 'week'  THEN p_date - 6
                      WHEN 'month' THEN p_date - 29
                    END;
  SELECT count(*)::integer INTO v_used
  FROM public.hostel_cleaning_bookings b
  WHERE b.room_id = v_alloc.room_id
    AND b.type_id = p_type_id
    AND b.status <> 'cancelled'
    AND b.booking_date BETWEEN v_window_start AND p_date;
  IF v_used >= v_type.usage_limit_count THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'quota_exhausted',
                              'used', v_used, 'allowed', v_type.usage_limit_count);
  END IF;

  -- 7. Date range.
  v_advance_days := public.fn_get_policy_int('housekeeping.booking_advance_days', 7, NULL);
  IF p_date < (now() AT TIME ZONE 'Asia/Kolkata')::date
     OR p_date > (now() AT TIME ZONE 'Asia/Kolkata')::date + v_advance_days THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'date_out_of_range');
  END IF;

  -- 8. The slot must exist in today's grid and still be bookable.
  v_slots := public.fn_cl_housekeeping_slots(v_alloc.room_id, p_type_id, p_date);
  IF NOT (v_slots->>'open')::boolean THEN
    RETURN jsonb_build_object('success', false, 'error_code', COALESCE(v_slots->>'reason','day_closed'));
  END IF;
  FOR v_slot IN SELECT * FROM jsonb_array_elements(v_slots->'slots') LOOP
    IF (v_slot->>'slot_start') = to_char(p_slot_start, 'HH24:MI') THEN
      v_ok := (v_slot->>'is_bookable')::boolean;
      v_slot_end := (v_slot->>'slot_end')::time;
    END IF;
  END LOOP;
  IF v_slot_end IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'slot_not_found');
  END IF;
  IF NOT v_ok THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'slot_full');
  END IF;

  -- 9. Snapshot the cost and insert.
  SELECT COALESCE(sum(e.line_total_inr), 0) INTO v_cost
  FROM public.hostel_cleaning_type_expenses e WHERE e.type_id = p_type_id;

  INSERT INTO public.hostel_cleaning_bookings (
    institution_id, block_id, room_id, allocation_id, learner_id, type_id,
    booking_date, slot_start, slot_end, status,
    feedback_due_at, type_name, duration_minutes, expected_cost_inr, notes
  ) VALUES (
    v_alloc.institution_id, v_alloc.block_id, v_alloc.room_id, v_alloc.id, v_uid, p_type_id,
    p_date, p_slot_start, v_slot_end, 'booked',
    (p_date + time '23:59:59') AT TIME ZONE 'Asia/Kolkata',
    v_type.name, v_type.duration_minutes, v_cost, nullif(btrim(COALESCE(p_notes,'')), '')
  )
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object('success', true, 'booking_id', v_booking_id,
                            'slot_end', to_char(v_slot_end, 'HH24:MI'));
EXCEPTION
  WHEN unique_violation THEN
    -- ux_hk_one_live_booking_per_room fired: a roommate won the race.
    RETURN jsonb_build_object('success', false, 'error_code', 'room_locked');
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_housekeeping_book(uuid, date, time, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_housekeeping_book(uuid, date, time, text) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- fn_cl_housekeeping_cancel
--
-- A learner may cancel only while the booking is still unassigned. Once a
-- cleaner is assigned, only a warden holding .cancel may do it.
-- Cancelling releases the room lock and refunds the quota, because the partial
-- unique index and the quota count both exclude 'cancelled'.
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_cl_housekeeping_cancel(
  p_booking_id uuid,
  p_reason     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_b         public.hostel_cleaning_bookings%ROWTYPE;
  v_is_warden boolean;
  v_is_owner  boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'unauthenticated');
  END IF;

  SELECT * INTO v_b FROM public.hostel_cleaning_bookings b WHERE b.id = p_booking_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found');
  END IF;

  IF v_b.status IN ('completed','cancelled') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_cancellable');
  END IF;

  v_is_warden := public.user_has_permission('campus_living.housekeeping.cancel')
                 AND public.role_has_institution_access(v_b.institution_id);
  v_is_owner  := EXISTS (
    SELECT 1 FROM public.hostel_allocations a
    WHERE a.room_id = v_b.room_id
      AND a.learner_id = v_uid
      AND a.status::text = ANY (public.fn_cl_roster_statuses())
  );

  IF v_is_warden THEN
    NULL;  -- wardens may cancel at any live status
  ELSIF v_is_owner THEN
    IF v_b.status <> 'booked' THEN
      RETURN jsonb_build_object('success', false, 'error_code', 'already_assigned');
    END IF;
  ELSE
    RETURN jsonb_build_object('success', false, 'error_code', 'forbidden');
  END IF;

  UPDATE public.hostel_cleaning_bookings
  SET status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = v_uid,
      cancel_reason = nullif(btrim(COALESCE(p_reason,'')), '')
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true);
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_housekeeping_cancel(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_housekeeping_cancel(uuid, text) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- fn_cl_housekeeping_assign
--
-- Warden assigns (or clears) a cleaner. Snapshots cleaner_name onto the
-- booking so learners never need SELECT on hostel_cleaners, which holds phone
-- numbers -- Postgres RLS is row-level, so exposing the row exposes the PII.
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_cl_housekeeping_assign(
  p_booking_id uuid,
  p_cleaner_id uuid,
  p_clear      boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_b    public.hostel_cleaning_bookings%ROWTYPE;
  v_name text;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'unauthenticated');
  END IF;

  SELECT * INTO v_b FROM public.hostel_cleaning_bookings b WHERE b.id = p_booking_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_found');
  END IF;

  IF NOT (public.user_has_permission('campus_living.housekeeping.assign')
          AND public.role_has_institution_access(v_b.institution_id)) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'forbidden');
  END IF;

  IF v_b.status NOT IN ('booked','assigned') THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'not_assignable');
  END IF;

  IF p_clear THEN
    UPDATE public.hostel_cleaning_bookings
    SET cleaner_id = NULL, cleaner_name = NULL, assigned_at = NULL, assigned_by = NULL,
        status = 'booked'
    WHERE id = p_booking_id;
    RETURN jsonb_build_object('success', true, 'status', 'booked');
  END IF;

  SELECT c.full_name INTO v_name
  FROM public.hostel_cleaners c
  WHERE c.id = p_cleaner_id
    AND c.is_active
    AND c.institution_id = v_b.institution_id;
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'cleaner_unavailable');
  END IF;

  -- The cleaner must actually serve this block and work this weekday.
  IF NOT EXISTS (
    SELECT 1 FROM public.hostel_cleaner_blocks cb
    WHERE cb.cleaner_id = p_cleaner_id AND cb.block_id = v_b.block_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'cleaner_wrong_block');
  END IF;
  IF NOT (EXTRACT(DOW FROM v_b.booking_date)::integer = ANY (
            SELECT c.working_days FROM public.hostel_cleaners c WHERE c.id = p_cleaner_id)) THEN
    RETURN jsonb_build_object('success', false, 'error_code', 'cleaner_not_working');
  END IF;

  UPDATE public.hostel_cleaning_bookings
  SET cleaner_id = p_cleaner_id, cleaner_name = v_name,
      assigned_at = now(), assigned_by = v_uid,
      status = 'assigned'
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true, 'status', 'assigned', 'cleaner_name', v_name);
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_housekeeping_assign(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_housekeeping_assign(uuid, uuid, boolean) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- fn_cl_housekeeping_feedback_holds
--
-- Which learners are currently attendance-blocked by unrated cleanings.
-- Computed live: there is no stored flag and no cron, so nothing can fall out
-- of sync. The hold starts the day AFTER the booking date and lifts the
-- instant any roommate rates.
--
-- p_institution_id / p_block_id are optional filters (NULL = no filter).
-- SECURITY INVOKER on purpose: the caller is the attendance service, which
-- already holds the relevant permission, and RLS on bookings is the backstop.
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_cl_housekeeping_feedback_holds(
  p_institution_id uuid DEFAULT NULL,
  p_block_id       uuid DEFAULT NULL,
  p_date           date DEFAULT NULL
) RETURNS TABLE (
  learner_id   uuid,
  room_id      uuid,
  booking_id   uuid,
  booking_date date,
  type_name    text
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT a.learner_id, b.room_id, b.id, b.booking_date, b.type_name
  FROM public.hostel_cleaning_bookings b
  JOIN public.hostel_allocations a
    ON a.room_id = b.room_id
   AND a.status::text = ANY (public.fn_cl_roster_statuses())
  WHERE b.status = 'awaiting_feedback'
    AND b.waived_at IS NULL
    AND b.booking_date < COALESCE(p_date, (now() AT TIME ZONE 'Asia/Kolkata')::date)
    AND (p_institution_id IS NULL OR b.institution_id = p_institution_id)
    AND (p_block_id       IS NULL OR b.block_id       = p_block_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.hostel_cleaning_feedback f WHERE f.booking_id = b.id);
$$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_housekeeping_feedback_holds(uuid, uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_housekeeping_feedback_holds(uuid, uuid, date) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- The attendance gate
--
-- hostel_attendance is a hot table (15,822 rows, written in bulk). This
-- trigger is deliberately a single EXISTS against
-- idx_hk_bookings_awaiting_feedback, of which only a handful of rows exist at
-- any moment.
--
-- The service layer pre-filters held learners out of bulk marking so one held
-- learner never fails a whole block's insert. This trigger is the backstop
-- for every path that bypasses the service -- a UI-only guard on an
-- RLS-writable table is decorative.
--
-- hostel_attendance.learner_id references profiles(id), the same id space as
-- hostel_allocations.learner_id (verified: 15,822 of 15,822 rows match), so
-- the comparison below is direct.
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_cl_housekeeping_attendance_gate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_type text;
  v_when date;
BEGIN
  SELECT h.type_name, h.booking_date INTO v_type, v_when
  FROM public.fn_cl_housekeeping_feedback_holds(NULL, NULL, NEW.date) h
  WHERE h.learner_id = NEW.learner_id
  LIMIT 1;

  IF v_type IS NOT NULL THEN
    RAISE EXCEPTION
      'Housekeeping feedback pending for this room (% on %). Any roommate can rate the cleaning to release attendance.',
      v_type, to_char(v_when, 'DD Mon YYYY')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_cl_housekeeping_attendance_gate() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS t_hostel_attendance_housekeeping_gate ON public.hostel_attendance;
CREATE TRIGGER t_hostel_attendance_housekeeping_gate
  BEFORE INSERT OR UPDATE ON public.hostel_attendance
  FOR EACH ROW EXECUTE FUNCTION public.fn_cl_housekeeping_attendance_gate();
```

- [ ] **Step 3: Apply the migration**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
node --env-file=.env scripts/apply-migration-file.mjs 20260907090200_housekeeping_rpcs.sql
```

- [ ] **Step 4: Verify every function is DEFINER-safe and not callable by anon**

Via `mcp__supabase__execute_sql`:

```sql
SELECT p.proname,
       p.prosecdef AS definer,
       COALESCE(array_to_string(p.proconfig, ','), 'NO search_path') AS cfg,
       has_function_privilege('anon',           p.oid, 'EXECUTE') AS anon_can_call,
       has_function_privilege('authenticated',  p.oid, 'EXECUTE') AS auth_can_call
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname LIKE 'fn_cl_housekeeping%'
ORDER BY 1;
```

Expected, for all five functions plus the gate:
- `cfg` contains `search_path=` — **never** `NO search_path`
- `anon_can_call = false` on every row
- `auth_can_call = true` on the five RPCs

If `anon_can_call` is true anywhere, the `REVOKE` did not take — a `SECURITY DEFINER` function callable by `anon` with no internal auth check is a public data leak. Stop and fix.

- [ ] **Step 5: Verify no function accepts a caller-id parameter**

```sql
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname LIKE 'fn_cl_housekeeping%';
```

Expected: **no argument named `p_user_id`, `p_caller_id`, `p_profile_id` or similar.** Every function derives the caller from `auth.uid()`. A DEFINER RPC that trusts a caller-id parameter lets anyone impersonate anyone.

- [ ] **Step 6: Verify the attendance trigger exists and fires**

```sql
SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS def
FROM pg_trigger
WHERE tgrelid = 'public.hostel_attendance'::regclass
  AND tgname = 't_hostel_attendance_housekeeping_gate';
```

Expected: one row, `tgenabled = 'O'` (enabled).

- [ ] **Step 7: Prove the gate blocks and releases**

End-to-end, in the database, before any UI exists. Via `mcp__supabase__execute_sql`:

```sql
DO $$
DECLARE
  v_room uuid; v_block uuid; v_inst uuid; v_alloc uuid; v_learner uuid;
  v_type uuid; v_booking uuid;
  v_blocked boolean := false;
BEGIN
  SELECT a.room_id, a.block_id, a.institution_id, a.id, a.learner_id
    INTO v_room, v_block, v_inst, v_alloc, v_learner
  FROM hostel_allocations a
  WHERE a.status::text = ANY (fn_cl_roster_statuses())
  LIMIT 1;

  INSERT INTO hostel_cleaning_types (institution_id, name, duration_minutes, usage_limit_count, usage_period)
  VALUES (v_inst, '__gate_probe__', 30, 2, 'week') RETURNING id INTO v_type;

  -- A job finished YESTERDAY and nobody has rated it.
  INSERT INTO hostel_cleaning_bookings
    (institution_id, block_id, room_id, allocation_id, learner_id, type_id,
     booking_date, slot_start, slot_end, status, feedback_due_at, type_name, duration_minutes)
  VALUES (v_inst, v_block, v_room, v_alloc, v_learner, v_type,
          current_date - 1, '09:00', '09:30', 'awaiting_feedback', now(), '__probe__', 30)
  RETURNING id INTO v_booking;

  BEGIN
    INSERT INTO hostel_attendance (institution_id, learner_id, block_id, date, evening_status)
    VALUES (v_inst, v_learner, v_block, current_date, 'present');
  EXCEPTION WHEN check_violation THEN
    v_blocked := true;
  END;

  IF NOT v_blocked THEN
    DELETE FROM hostel_attendance WHERE learner_id = v_learner AND date = current_date;
    DELETE FROM hostel_cleaning_bookings WHERE id = v_booking;
    DELETE FROM hostel_cleaning_types WHERE id = v_type;
    RAISE EXCEPTION 'GATE NOT WORKING - attendance was accepted despite a pending hold';
  END IF;

  -- Now a roommate rates it. The hold must lift immediately.
  INSERT INTO hostel_cleaning_feedback (booking_id, institution_id, room_id, learner_id, rating)
  VALUES (v_booking, v_inst, v_room, v_learner, 5);

  INSERT INTO hostel_attendance (institution_id, learner_id, block_id, date, evening_status)
  VALUES (v_inst, v_learner, v_block, current_date, 'present');

  -- Clean up the probe entirely.
  DELETE FROM hostel_attendance WHERE learner_id = v_learner AND date = current_date;
  DELETE FROM hostel_cleaning_feedback WHERE booking_id = v_booking;
  DELETE FROM hostel_cleaning_bookings WHERE id = v_booking;
  DELETE FROM hostel_cleaning_types WHERE id = v_type;

  RAISE NOTICE 'Attendance gate verified: blocked while unrated, released on rating.';
END $$;
```

Expected: the `Attendance gate verified` notice. Two possible failures, both stop-and-fix:
- `GATE NOT WORKING` — the trigger did not block.
- An error on the second attendance insert — the hold did not lift on rating, which would strand real learners.

Confirm the probe left nothing behind:

```sql
SELECT (SELECT count(*) FROM hostel_cleaning_types WHERE name = '__gate_probe__') AS types,
       (SELECT count(*) FROM hostel_cleaning_bookings WHERE type_name = '__probe__') AS bookings;
```

Expected: `0, 0`.

- [ ] **Step 8: Mirror into the setup reference files and commit**

Append the five functions and the gate function to `supabase/setup/02_functions.sql`, and the trigger to `04_triggers.sql`.

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
git add supabase/migrations/20260907090200_housekeeping_rpcs.sql supabase/setup/
git commit -m "feat(campus-living): housekeeping RPCs and the attendance feedback gate

Four DEFINER RPCs (slots, book, cancel, assign), one live hold function, and
a BEFORE trigger on hostel_attendance.

Every RPC derives its caller from auth.uid() rather than a parameter, sets
search_path to empty, and has EXECUTE revoked from anon after creation -
CREATE OR REPLACE silently re-grants EXECUTE to PUBLIC, so the revoke is not
optional.

The hold is computed live from bookings still in awaiting_feedback with no
feedback row: no stored flag, no cron, nothing to fall out of sync. Verified
by probe that attendance is blocked while unrated and released on rating.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Migration M4 — permission keys and grants

A key declared in the catalog but never granted to a role renders pages empty with no error. Catalog and grants therefore ship together.

**Files:**
- Create: `supabase/migrations/20260907090300_housekeeping_permissions.sql`
- Modify: `lib/constants/permissions.ts` (restores the block Task 1 removed, now with 8 keys)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the 8 keys `campus_living.housekeeping.{view,types_manage,cleaners_manage,availability_manage,assign,execute,cancel,waive}`, granted as specified. Every RLS policy from Task 3 and every RPC from Task 4 reads these exact strings.

- [ ] **Step 1: Confirm the role names still exist before granting to them**

Role names are data, not code — verify rather than assume. Via `mcp__supabase__execute_sql`:

```sql
SELECT role_name FROM custom_roles
WHERE role_name IN ('Warden','Chief Warden','Hostel Office Admin',
                    'Executive Administrative Officer','Managing Director',
                    'Chief Executive Officer','Housekeeping Staff')
ORDER BY 1;
```

Expected: **7 rows.** If any is missing, STOP and report — granting to a non-existent role silently does nothing and the module ships unusable.

- [ ] **Step 2: Write `supabase/migrations/20260907090300_housekeeping_permissions.sql`**

```sql
-- Housekeeping rebuild, migration 4 of 4: permission keys and grants.
--
-- Catalog entry and role grants MUST ship together. A key that exists in
-- lib/constants/permissions.ts but in no role's custom_roles.permissions JSONB
-- produces a page that renders empty with no error anywhere -- the single most
-- confusing failure mode in this codebase.
--
-- Grants mirror exactly who held the three old keys before the teardown, so no
-- one gains or loses access from the rebuild itself.
--
-- Learners are deliberately absent: booking authorisation is "you hold a live
-- allocation for this room", enforced inside fn_cl_housekeeping_book. The
-- Student role's housekeeping keys stay false.
--
-- Note jsonb_build_object values are booleans, not strings. A grant check is
-- (permissions->>'key')::boolean IS TRUE -- `permissions ? 'key'` is a FALSE
-- POSITIVE, true even when the value is false.
--
-- Spec: specs/campus-living-housekeeping-rebuild-spec-2026-09-07.md §7

-- ── Full grant: the six administrative roles ──────────────────────────────
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
  'campus_living.housekeeping.view',               true,
  'campus_living.housekeeping.types_manage',       true,
  'campus_living.housekeeping.cleaners_manage',    true,
  'campus_living.housekeeping.availability_manage',true,
  'campus_living.housekeeping.assign',             true,
  'campus_living.housekeeping.execute',            true,
  'campus_living.housekeeping.cancel',             true,
  'campus_living.housekeeping.waive',              true
)
WHERE role_name IN (
  'Warden',
  'Chief Warden',
  'Hostel Office Admin',
  'Executive Administrative Officer',
  'Managing Director',
  'Chief Executive Officer'
);

-- ── Housekeeping Staff: see the work, record the work, nothing else ───────
-- They held .view + .mark_done before; .execute is the direct successor to
-- .mark_done. They must NOT configure types (cost data) or waive holds.
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
  'campus_living.housekeeping.view',    true,
  'campus_living.housekeeping.execute', true
)
WHERE role_name = 'Housekeeping Staff';

-- ── Every other role: explicit false, so the audit surface stays complete ──
-- The access-audit module reports a key absent from a role differently from a
-- key present-and-false; the existing rows all carry explicit false.
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
  'campus_living.housekeeping.view',               false,
  'campus_living.housekeeping.types_manage',       false,
  'campus_living.housekeeping.cleaners_manage',    false,
  'campus_living.housekeeping.availability_manage',false,
  'campus_living.housekeeping.assign',             false,
  'campus_living.housekeeping.execute',            false,
  'campus_living.housekeeping.cancel',             false,
  'campus_living.housekeeping.waive',              false
)
WHERE role_name NOT IN (
  'Warden','Chief Warden','Hostel Office Admin',
  'Executive Administrative Officer','Managing Director',
  'Chief Executive Officer','Housekeeping Staff'
);

-- Housekeeping Staff needs explicit false on the six it does not hold.
UPDATE public.custom_roles
SET permissions = permissions || jsonb_build_object(
  'campus_living.housekeeping.types_manage',       false,
  'campus_living.housekeeping.cleaners_manage',    false,
  'campus_living.housekeeping.availability_manage',false,
  'campus_living.housekeeping.assign',             false,
  'campus_living.housekeeping.cancel',             false,
  'campus_living.housekeeping.waive',              false
)
WHERE role_name = 'Housekeeping Staff';
```

- [ ] **Step 3: Apply the migration**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
node --env-file=.env scripts/apply-migration-file.mjs 20260907090300_housekeeping_permissions.sql
```

- [ ] **Step 4: Verify the grants landed on the right roles**

Test the VALUE, not key presence. Via `mcp__supabase__execute_sql`:

```sql
SELECT role_name,
       (permissions->>'campus_living.housekeeping.view')::boolean           AS v,
       (permissions->>'campus_living.housekeeping.types_manage')::boolean   AS types,
       (permissions->>'campus_living.housekeeping.execute')::boolean        AS exec,
       (permissions->>'campus_living.housekeeping.waive')::boolean          AS waive
FROM custom_roles
WHERE (permissions->>'campus_living.housekeeping.view')::boolean IS TRUE
ORDER BY 1;
```

Expected: exactly **7 rows** — the six administrative roles with `types/exec/waive` all `true`, and `Housekeeping Staff` with `exec = true` but `types = false` and `waive = false`.

- [ ] **Step 5: Verify no role kept an old key**

```sql
SELECT count(*) AS roles_with_dead_keys
FROM custom_roles
WHERE permissions ?| array['campus_living.housekeeping.schedule',
                           'campus_living.housekeeping.mark_done'];
```

Expected: `0`.

- [ ] **Step 6: Restore the catalog block in `lib/constants/permissions.ts`**

At the position Task 1 emptied (between the Maintenance and Laundry blocks), insert:

```ts
      // Housekeeping
      { key: 'campus_living.housekeeping.view', label: 'View Housekeeping' },
      { key: 'campus_living.housekeeping.types_manage', label: 'Manage Cleaning Types' },
      { key: 'campus_living.housekeeping.cleaners_manage', label: 'Manage Cleaner Directory' },
      { key: 'campus_living.housekeeping.availability_manage', label: 'Manage Booking Availability' },
      { key: 'campus_living.housekeeping.assign', label: 'Assign Cleaner to Booking' },
      { key: 'campus_living.housekeeping.execute', label: 'Record Cleaning (photos, start/finish)' },
      { key: 'campus_living.housekeeping.cancel', label: "Cancel Another's Booking" },
      { key: 'campus_living.housekeeping.waive', label: 'Waive Feedback Hold' },
```

- [ ] **Step 7: Confirm catalog and database agree**

Every catalog key must be granted somewhere, and every granted key must be in the catalog. Drift in either direction is what the audit gates exist to catch:

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
grep -o "campus_living\.housekeeping\.[a-z_]*" lib/constants/permissions.ts | sort -u
```

Expected: exactly the 8 keys above. Compare against the database:

```sql
SELECT DISTINCT k
FROM custom_roles, LATERAL jsonb_object_keys(permissions) k
WHERE k LIKE 'campus_living.housekeeping.%'
ORDER BY 1;
```

Both lists must be identical, 8 entries each.

- [ ] **Step 8: Run diagnostics and commit**

Run `mcp__ide__getDiagnostics` on `lib/constants/permissions.ts` — expect no new errors.

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
git add supabase/migrations/20260907090300_housekeeping_permissions.sql lib/constants/permissions.ts
git commit -m "feat(campus-living): housekeeping permission keys and role grants

Eight keys replacing the old three, granted to exactly the roles that held
the old ones so nobody gains or loses access from the rebuild.

Catalog entry and grants ship in one migration: a key declared but never
granted renders pages empty with no error anywhere.

Housekeeping Staff gets view + execute (the successor to mark_done) but not
types_manage or waive - expense lines are institution cost data and a hold
waiver needs accountability.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

# Phase C — Pure logic

## Task 6: Types and the rules module (TDD)

The only genuinely unit-testable core in this module: no I/O, no Supabase, no React. Everything downstream imports from here, so it is built first and test-first.

**Files:**
- Create: `types/campus-living/housekeeping.ts`
- Create: `lib/services/campus-living/housekeeping-rules.ts`
- Test: `__tests__/campus-living/housekeeping-rules.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, imported by Tasks 7–18:
  - Types: `UsagePeriod`, `BookingStatus`, `CleaningType`, `CleaningTypeExpense`, `CleaningTypeWithDetail`, `Cleaner`, `CleaningAvailability`, `CleaningBooking`, `BookingPhoto`, `CleaningFeedback`, `FeedbackHold`, `SlotGridResult`, `Slot`, `BookResult`, `AssignResult`, `CancelResult`, and the `Create*Dto` / `Update*Dto` shapes.
  - Functions: `quotaWindowStart(bookingDate, period) → string`, `slotEndTime(start, durationMinutes) → string`, `expenseTotal(lines) → number`, `canLearnerCancel(status) → boolean`, `isLiveStatus(status) → boolean`, `bookingErrorMessage(code, fallback) → string`, `holdMessage(hold) → string`.

- [ ] **Step 1: Write the type module**

Create `types/campus-living/housekeeping.ts`:

```ts
/**
 * Campus Living — Housekeeping types.
 *
 * learner_id is a profiles.id throughout, matching hostel_allocations.learner_id
 * (which is a FK to profiles despite its name). It is NOT a learners_profiles.id.
 */

export type UsagePeriod = 'day' | 'week' | 'month';

export type BookingStatus =
  | 'booked'
  | 'assigned'
  | 'in_progress'
  | 'awaiting_feedback'
  | 'completed'
  | 'cancelled';

export type PhotoPhase = 'before' | 'after';

export interface CleaningType {
  id: string;
  institution_id: string;
  name: string;
  description: string | null;
  duration_minutes: number;
  usage_limit_count: number;
  usage_period: UsagePeriod;
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CleaningTypeExpense {
  id: string;
  type_id: string;
  institution_id: string;
  item_name: string;
  unit: string | null;
  quantity: number;
  unit_cost_inr: number;
  line_total_inr: number;
  sort_order: number;
}

/** A type with its expense lines and the room categories allowed to book it. */
export interface CleaningTypeWithDetail extends CleaningType {
  expenses: CleaningTypeExpense[];
  category_ids: string[];
  expected_cost_inr: number;
}

export interface Cleaner {
  id: string;
  institution_id: string;
  full_name: string;
  phone: string | null;
  gender: 'Male' | 'Female' | 'Other' | null;
  employee_code: string | null;
  /** Postgres DOW: 0=Sunday .. 6=Saturday. */
  working_days: number[];
  shift_start: string | null;
  shift_end: string | null;
  is_active: boolean;
  notes: string | null;
  block_ids: string[];
}

export interface CleaningAvailability {
  id: string;
  institution_id: string;
  block_id: string;
  /** Postgres DOW: 0=Sunday .. 6=Saturday. */
  weekday: number;
  is_open: boolean;
  window_start: string;
  window_end: string;
  capacity: number;
}

export interface CleaningBooking {
  id: string;
  institution_id: string;
  block_id: string;
  room_id: string;
  allocation_id: string;
  learner_id: string;
  type_id: string;
  booking_date: string;
  slot_start: string;
  slot_end: string;
  status: BookingStatus;
  cleaner_id: string | null;
  cleaner_name: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
  started_at: string | null;
  finished_at: string | null;
  feedback_due_at: string;
  type_name: string;
  duration_minutes: number;
  expected_cost_inr: number;
  waived_at: string | null;
  waived_by: string | null;
  waive_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** A booking joined with the room/block labels the day board renders. */
export interface BookingBoardRow extends CleaningBooking {
  room_number: string | null;
  block_name: string | null;
  has_before_photo: boolean;
  has_after_photo: boolean;
  feedback_count: number;
  average_rating: number | null;
}

export interface BookingPhoto {
  id: string;
  booking_id: string;
  institution_id: string;
  phase: PhotoPhase;
  drive_file_id: string;
  drive_url: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string;
  uploaded_at: string;
}

export interface CleaningFeedback {
  id: string;
  booking_id: string;
  institution_id: string;
  room_id: string;
  learner_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

/**
 * One learner currently attendance-blocked by an unrated cleaning.
 * Shaped to mirror the academic side's LeaveBlockInfo so the attendance mark
 * page can render a housekeeping hold and a leave block through one banner.
 */
export interface FeedbackHold {
  learner_id: string;
  room_id: string;
  booking_id: string;
  booking_date: string;
  type_name: string;
}

export interface Slot {
  slot_start: string;
  slot_end: string;
  remaining_capacity: number;
  is_bookable: boolean;
  reason: string | null;
}

export type SlotGridResult =
  | { open: true; slots: Slot[] }
  | { open: false; reason: string; slots: [] };

export type BookResult =
  | { success: true; booking_id: string; slot_end: string }
  | { success: false; error_code: string; used?: number; allowed?: number };

export type CancelResult = { success: true } | { success: false; error_code: string };

export type AssignResult =
  | { success: true; status: BookingStatus; cleaner_name?: string }
  | { success: false; error_code: string };

// ── DTOs ──────────────────────────────────────────────────────────────────

export interface CreateCleaningTypeDto {
  institution_id: string;
  name: string;
  description?: string | null;
  duration_minutes: number;
  usage_limit_count: number;
  usage_period: UsagePeriod;
  is_active?: boolean;
  sort_order?: number;
  category_ids: string[];
  expenses: Array<Omit<CleaningTypeExpense, 'id' | 'type_id' | 'institution_id' | 'line_total_inr'>>;
}

export type UpdateCleaningTypeDto = Partial<Omit<CreateCleaningTypeDto, 'institution_id'>>;

export interface CreateCleanerDto {
  institution_id: string;
  full_name: string;
  phone?: string | null;
  gender?: 'Male' | 'Female' | 'Other' | null;
  employee_code?: string | null;
  working_days: number[];
  shift_start?: string | null;
  shift_end?: string | null;
  is_active?: boolean;
  notes?: string | null;
  block_ids: string[];
}

export type UpdateCleanerDto = Partial<Omit<CreateCleanerDto, 'institution_id'>>;

export interface UpsertAvailabilityDto {
  institution_id: string;
  block_id: string;
  weekday: number;
  is_open: boolean;
  window_start: string;
  window_end: string;
  capacity: number;
}
```

- [ ] **Step 2: Write the failing test**

Create `__tests__/campus-living/housekeeping-rules.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  quotaWindowStart,
  slotEndTime,
  expenseTotal,
  canLearnerCancel,
  isLiveStatus,
  bookingErrorMessage,
  holdMessage,
} from '@/lib/services/campus-living/housekeeping-rules';

describe('quotaWindowStart — must mirror fn_cl_housekeeping_book exactly', () => {
  it('day: the window is the booking date itself', () => {
    expect(quotaWindowStart('2026-09-15', 'day')).toBe('2026-09-15');
  });

  it('week: 7 days INCLUSIVE, so the start is date - 6', () => {
    expect(quotaWindowStart('2026-09-15', 'week')).toBe('2026-09-09');
  });

  it('month: 30 days INCLUSIVE, so the start is date - 29', () => {
    expect(quotaWindowStart('2026-09-15', 'month')).toBe('2026-08-17');
  });

  it('crosses a month boundary correctly', () => {
    expect(quotaWindowStart('2026-03-03', 'week')).toBe('2026-02-25');
  });

  it('crosses a year boundary correctly', () => {
    expect(quotaWindowStart('2027-01-02', 'week')).toBe('2026-12-27');
  });

  it('handles a leap day without drifting', () => {
    expect(quotaWindowStart('2028-03-01', 'week')).toBe('2028-02-24');
  });
});

describe('slotEndTime', () => {
  it('adds the duration to the start', () => {
    expect(slotEndTime('09:00', 30)).toBe('09:30');
  });

  it('rolls the hour over', () => {
    expect(slotEndTime('09:45', 30)).toBe('10:15');
  });

  it('handles a 90-minute deep clean', () => {
    expect(slotEndTime('10:30', 90)).toBe('12:00');
  });

  it('accepts a HH:MM:SS input and still returns HH:MM', () => {
    expect(slotEndTime('09:00:00', 45)).toBe('09:45');
  });
});

describe('expenseTotal', () => {
  it('sums quantity x unit cost across lines', () => {
    expect(
      expenseTotal([
        { quantity: 2, unit_cost_inr: 45.5 },
        { quantity: 1, unit_cost_inr: 120 },
      ]),
    ).toBe(211);
  });

  it('is 0 for no lines, not NaN — a type with no expenses is valid', () => {
    expect(expenseTotal([])).toBe(0);
  });

  it('rounds to 2 decimals rather than carrying float noise', () => {
    expect(expenseTotal([{ quantity: 3, unit_cost_inr: 33.33 }])).toBe(99.99);
  });
});

describe('canLearnerCancel — only while nobody is assigned', () => {
  it('allows cancelling a fresh booking', () => {
    expect(canLearnerCancel('booked')).toBe(true);
  });

  it.each(['assigned', 'in_progress', 'awaiting_feedback', 'completed', 'cancelled'] as const)(
    'refuses once status is %s',
    (status) => {
      expect(canLearnerCancel(status)).toBe(false);
    },
  );
});

describe('isLiveStatus — must match ux_hk_one_live_booking_per_room exactly', () => {
  it.each(['booked', 'assigned', 'in_progress', 'awaiting_feedback'] as const)(
    '%s holds the room lock',
    (status) => {
      expect(isLiveStatus(status)).toBe(true);
    },
  );

  it.each(['completed', 'cancelled'] as const)('%s releases the room lock', (status) => {
    expect(isLiveStatus(status)).toBe(false);
  });
});

describe('bookingErrorMessage', () => {
  it('translates room_locked into something a learner can act on', () => {
    expect(bookingErrorMessage('room_locked', 'fallback')).toMatch(/roommate/i);
  });

  it('translates category_not_eligible without blaming the learner', () => {
    expect(bookingErrorMessage('category_not_eligible', 'fallback')).toMatch(/room type/i);
  });

  it('falls back for an unknown code rather than showing the raw code', () => {
    expect(bookingErrorMessage('some_new_code', 'Could not book')).toBe('Could not book');
  });
});

describe('holdMessage', () => {
  it('names the cleaning and the date so the warden knows what to chase', () => {
    const msg = holdMessage({
      learner_id: 'l1',
      room_id: 'r1',
      booking_id: 'b1',
      booking_date: '2026-09-12',
      type_name: 'Toilet Cleaning',
    });
    expect(msg).toContain('Toilet Cleaning');
    expect(msg).toContain('12 Sep 2026');
  });
});
```

- [ ] **Step 3: Run the test and watch it fail**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
npx vitest run __tests__/campus-living/housekeeping-rules.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/services/campus-living/housekeeping-rules"`. If it passes, the file already exists and something is wrong.

- [ ] **Step 4: Write the implementation**

Create `lib/services/campus-living/housekeeping-rules.ts`:

```ts
/**
 * Housekeeping — pure rules.
 *
 * No I/O, no Supabase, no React. Everything here is unit-tested in
 * __tests__/campus-living/housekeeping-rules.test.ts.
 *
 * quotaWindowStart and isLiveStatus MIRROR database logic:
 *   - quotaWindowStart mirrors the CASE in fn_cl_housekeeping_book step 6
 *   - isLiveStatus mirrors the WHERE of ux_hk_one_live_booking_per_room
 * The database is the authority in both cases; these exist so the UI can show
 * "2 left this week" and disable a Book button without a round trip. If you
 * change one, change the other in the same commit or they will disagree
 * silently — the UI will offer a slot the RPC then refuses.
 */

import type { BookingStatus, FeedbackHold, UsagePeriod } from '@/types/campus-living/housekeeping';

/** Inclusive start of the rolling quota window ending on bookingDate. */
export function quotaWindowStart(bookingDate: string, period: UsagePeriod): string {
  const daysBack = period === 'day' ? 0 : period === 'week' ? 6 : 29;
  // Anchor at UTC noon so a DST shift can never move the calendar date.
  const d = new Date(`${bookingDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

/** slot_start + durationMinutes, returned as HH:MM. */
export function slotEndTime(start: string, durationMinutes: number): string {
  const [h, m] = start.split(':').map(Number);
  const total = h * 60 + m + durationMinutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** Sum of quantity x unit cost, rounded to paise. Mirrors the generated column. */
export function expenseTotal(
  lines: Array<{ quantity: number; unit_cost_inr: number }>,
): number {
  const total = lines.reduce((sum, l) => sum + l.quantity * l.unit_cost_inr, 0);
  return Math.round(total * 100) / 100;
}

/** A learner may cancel only while no cleaner is assigned. */
export function canLearnerCancel(status: BookingStatus): boolean {
  return status === 'booked';
}

/** Statuses that hold the room lock. Mirrors ux_hk_one_live_booking_per_room. */
export function isLiveStatus(status: BookingStatus): boolean {
  return (
    status === 'booked' ||
    status === 'assigned' ||
    status === 'in_progress' ||
    status === 'awaiting_feedback'
  );
}

const BOOKING_ERROR_COPY: Record<string, string> = {
  unauthenticated: 'Please sign in again to book a cleaning.',
  feature_disabled: 'Cleaning booking is turned off right now. Ask your warden.',
  no_allocation: 'You need an active hostel room before you can book a cleaning.',
  type_unavailable: 'That cleaning type is no longer available.',
  category_not_eligible: 'This cleaning is not offered for your room type.',
  room_locked: 'A roommate already has a cleaning booked for your room. It has to finish first.',
  quota_exhausted: 'Your room has used all its bookings for this cleaning.',
  date_out_of_range: 'You cannot book that far ahead. Pick a nearer date.',
  day_closed: 'No cleaning is scheduled for that day.',
  slot_full: 'That slot was just taken. Please pick another.',
  slot_not_found: 'That slot is no longer on offer. Refresh and try again.',
  not_your_room: 'You can only book cleanings for your own room.',
  room_not_found: 'We could not find your room. Contact your warden.',
  already_assigned: 'A cleaner is already on the way, so this can no longer be cancelled.',
  not_cancellable: 'This booking can no longer be cancelled.',
  cleaner_unavailable: 'That cleaner is not available.',
  cleaner_wrong_block: 'That cleaner does not serve this block.',
  cleaner_not_working: 'That cleaner does not work on this day.',
  not_assignable: 'This booking can no longer be assigned.',
  forbidden: 'You do not have permission to do that.',
  not_found: 'That booking no longer exists.',
};

export function bookingErrorMessage(code: string, fallback: string): string {
  return BOOKING_ERROR_COPY[code] ?? fallback;
}

/** The banner text shown on the attendance mark page for a held learner. */
export function holdMessage(hold: FeedbackHold): string {
  const d = new Date(`${hold.booking_date}T12:00:00Z`);
  const pretty = d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return `Housekeeping feedback pending — ${hold.type_name} on ${pretty}. Any roommate can rate the cleaning to release attendance.`;
}
```

- [ ] **Step 5: Run the tests and watch them pass**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
npx vitest run __tests__/campus-living/housekeeping-rules.test.ts
```

Expected: PASS, all assertions green. If `quotaWindowStart` fails on the leap-day or year-boundary case, the date arithmetic is drifting — do not "fix" the test.

- [ ] **Step 6: Cross-check the TS window against the SQL window**

These two implementations must agree or the UI will show a quota the RPC disagrees with. Via `mcp__supabase__execute_sql`:

```sql
SELECT ('2026-09-15'::date - 6)::text  AS week_start,
       ('2026-09-15'::date - 29)::text AS month_start,
       ('2028-03-01'::date - 6)::text  AS leap_week_start;
```

Expected: `2026-09-09`, `2026-08-17`, `2028-02-24` — identical to the test expectations in Step 2.

- [ ] **Step 7: Run diagnostics and commit**

Run `mcp__ide__getDiagnostics` on both new files.

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
git add types/campus-living/housekeeping.ts \
        lib/services/campus-living/housekeeping-rules.ts \
        __tests__/campus-living/housekeeping-rules.test.ts
git commit -m "feat(campus-living): housekeeping types and pure rules module

quotaWindowStart and isLiveStatus deliberately mirror database logic (the
CASE in fn_cl_housekeeping_book and the WHERE of the room-lock index) so the
UI can show remaining quota and disable a Book button without a round trip.
Both are unit-tested against the SQL's own output, including leap-day and
year-boundary cases, because a silent disagreement would offer a slot the
RPC then refuses.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

# Phase D — Services and hooks

Every service in this phase is a plain static class using `createClientSupabaseClient()`, matching all 95 sibling campus-living services. Every hook exports its own key factory. Both are deliberate — see Global Constraints.

## Task 7: Cleaning type service and hook

The only service that writes three tables for one logical record (type + expenses + category junction). PostgREST has no multi-table transaction, so writes are ordered so that a mid-way failure leaves a type that is *invisible* (no categories) rather than *wrong*.

**Files:**
- Create: `lib/services/campus-living/housekeeping-type-service.ts`
- Create: `hooks/campus-living/use-housekeeping-types.ts`

**Interfaces:**
- Consumes: `types/campus-living/housekeeping.ts`, `housekeeping-rules.ts` (`expenseTotal`).
- Produces: `HousekeepingTypeService.{listTypes, getType, createType, updateType, deleteType, listBookableTypesForRoom}`; hook `useHousekeepingTypes(institutionId?)`, `useCreateCleaningType()`, `useUpdateCleaningType()`, `useDeleteCleaningType()`, `useBookableTypes(roomId?)`, and `housekeepingTypeKeys`.

- [ ] **Step 1: Write the service**

Create `lib/services/campus-living/housekeeping-type-service.ts`:

```ts
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { getErrorMessage } from '@/lib/utils';
import { expenseTotal } from './housekeeping-rules';
import type {
  CleaningType,
  CleaningTypeExpense,
  CleaningTypeWithDetail,
  CreateCleaningTypeDto,
  UpdateCleaningTypeDto,
} from '@/types/campus-living/housekeeping';

const LOG = 'campus-living/housekeeping-types';

export class HousekeepingTypeService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /**
   * institutionId omitted => every institution the caller's roles can reach.
   * Never branch on isSuperAdmin to decide this: pass undefined and let RLS
   * filter, or a secondary role with wider scope silently loses access.
   */
  static async listTypes(institutionId?: string): Promise<CleaningTypeWithDetail[]> {
    try {
      let query = this.supabase
        .from('hostel_cleaning_types')
        .select(`*,
                 expenses:hostel_cleaning_type_expenses(*),
                 categories:hostel_cleaning_type_categories(category_id)`)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });

      // ?? not ||: '' would travel as a real UUID and match zero rows.
      if (institutionId != null) query = query.eq('institution_id', institutionId);

      const { data, error } = await query;
      if (error) {
        logger.error(LOG, 'Failed to list cleaning types', error);
        throw error;
      }

      return (data ?? []).map((row: any) => {
        const expenses = (row.expenses ?? []) as CleaningTypeExpense[];
        return {
          ...(row as CleaningType),
          expenses,
          category_ids: (row.categories ?? []).map((c: any) => c.category_id),
          expected_cost_inr: expenseTotal(expenses),
        };
      });
    } catch (error) {
      logger.error(LOG, `Unexpected error in listTypes: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  static async getType(typeId: string): Promise<CleaningTypeWithDetail | null> {
    try {
      const { data, error } = await this.supabase
        .from('hostel_cleaning_types')
        .select(`*,
                 expenses:hostel_cleaning_type_expenses(*),
                 categories:hostel_cleaning_type_categories(category_id)`)
        .eq('id', typeId)
        .maybeSingle();
      if (error) {
        logger.error(LOG, 'Failed to fetch cleaning type', error);
        throw error;
      }
      if (!data) return null;
      const expenses = ((data as any).expenses ?? []) as CleaningTypeExpense[];
      return {
        ...(data as unknown as CleaningType),
        expenses,
        category_ids: ((data as any).categories ?? []).map((c: any) => c.category_id),
        expected_cost_inr: expenseTotal(expenses),
      };
    } catch (error) {
      logger.error(LOG, `Unexpected error in getType: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  /**
   * Ordered so a partial failure fails SAFE. The type row is written first,
   * then expenses, then the category junction LAST — because an empty junction
   * means nobody can book the type. A type stranded without categories is
   * invisible, which is recoverable; a type visible with the wrong cost or the
   * wrong eligibility is not.
   */
  static async createType(dto: CreateCleaningTypeDto): Promise<CleaningType> {
    try {
      const { data: type, error } = await this.supabase
        .from('hostel_cleaning_types')
        .insert({
          institution_id: dto.institution_id,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          duration_minutes: dto.duration_minutes,
          usage_limit_count: dto.usage_limit_count,
          usage_period: dto.usage_period,
          is_active: dto.is_active ?? true,
          sort_order: dto.sort_order ?? 0,
        })
        .select()
        .single();

      if (error) {
        logger.error(LOG, 'Failed to create cleaning type', error);
        throw error;
      }

      const created = type as unknown as CleaningType;
      await this.replaceExpenses(created.id, dto.institution_id, dto.expenses);
      await this.replaceCategories(created.id, dto.category_ids);
      return created;
    } catch (error) {
      logger.error(LOG, `Unexpected error in createType: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  static async updateType(typeId: string, dto: UpdateCleaningTypeDto): Promise<void> {
    try {
      const patch: Record<string, unknown> = {};
      if (dto.name !== undefined) patch.name = dto.name.trim();
      if (dto.description !== undefined) patch.description = dto.description?.trim() || null;
      if (dto.duration_minutes !== undefined) patch.duration_minutes = dto.duration_minutes;
      if (dto.usage_limit_count !== undefined) patch.usage_limit_count = dto.usage_limit_count;
      if (dto.usage_period !== undefined) patch.usage_period = dto.usage_period;
      if (dto.is_active !== undefined) patch.is_active = dto.is_active;
      if (dto.sort_order !== undefined) patch.sort_order = dto.sort_order;

      if (Object.keys(patch).length > 0) {
        const { error } = await this.supabase
          .from('hostel_cleaning_types')
          .update(patch)
          .eq('id', typeId);
        if (error) {
          logger.error(LOG, 'Failed to update cleaning type', error);
          throw error;
        }
      }

      const { data: existing, error: readErr } = await this.supabase
        .from('hostel_cleaning_types')
        .select('institution_id')
        .eq('id', typeId)
        .single();
      if (readErr) {
        logger.error(LOG, 'Failed to read institution for type update', readErr);
        throw readErr;
      }

      if (dto.expenses !== undefined) {
        await this.replaceExpenses(typeId, (existing as any).institution_id, dto.expenses);
      }
      if (dto.category_ids !== undefined) {
        await this.replaceCategories(typeId, dto.category_ids);
      }
    } catch (error) {
      logger.error(LOG, `Unexpected error in updateType: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  /**
   * Deleting is refused by the database (ON DELETE RESTRICT) once any booking
   * references the type — history must survive. Deactivate instead; the UI
   * surfaces that message on 23503.
   */
  static async deleteType(typeId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('hostel_cleaning_types')
        .delete()
        .eq('id', typeId);
      if (error) {
        logger.error(LOG, 'Failed to delete cleaning type', error);
        throw error;
      }
    } catch (error) {
      logger.error(LOG, `Unexpected error in deleteType: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  /** Active types whose category set includes this room's category. */
  static async listBookableTypesForRoom(roomId: string): Promise<CleaningTypeWithDetail[]> {
    try {
      const { data: room, error: roomErr } = await this.supabase
        .from('hostel_rooms')
        .select('category_id')
        .eq('id', roomId)
        .maybeSingle();
      if (roomErr) {
        logger.error(LOG, 'Failed to read room category', roomErr);
        throw roomErr;
      }
      const categoryId = (room as { category_id: string | null } | null)?.category_id;
      // No category => nothing is bookable. Fails closed, matching the RPC.
      if (!categoryId) return [];

      const { data, error } = await this.supabase
        .from('hostel_cleaning_type_categories')
        .select(`type_id,
                 type:hostel_cleaning_types(*)`)
        .eq('category_id', categoryId);
      if (error) {
        logger.error(LOG, 'Failed to list bookable types', error);
        throw error;
      }

      return (data ?? [])
        .map((r: any) => r.type)
        .filter((t: any) => t && t.is_active)
        .sort((a: any, b: any) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
        .map((t: any) => ({
          ...(t as CleaningType),
          expenses: [],          // learners never read expense lines (RLS denies it)
          category_ids: [categoryId],
          expected_cost_inr: 0,
        }));
    } catch (error) {
      logger.error(LOG, `Unexpected error in listBookableTypesForRoom: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  // ── private helpers ────────────────────────────────────────────────────

  private static async replaceExpenses(
    typeId: string,
    institutionId: string,
    lines: CreateCleaningTypeDto['expenses'],
  ): Promise<void> {
    const { error: delErr } = await this.supabase
      .from('hostel_cleaning_type_expenses')
      .delete()
      .eq('type_id', typeId);
    if (delErr) {
      logger.error(LOG, 'Failed to clear expense lines', delErr);
      throw delErr;
    }
    if (lines.length === 0) return;

    // Every row in a batch insert must carry identical keys: a missing key is
    // sent as an explicit NULL and defeats the column DEFAULT.
    const rows = lines.map((l, i) => ({
      type_id: typeId,
      institution_id: institutionId,
      item_name: l.item_name.trim(),
      unit: l.unit?.trim() || null,
      quantity: l.quantity,
      unit_cost_inr: l.unit_cost_inr,
      sort_order: l.sort_order ?? i,
    }));
    const { error } = await this.supabase.from('hostel_cleaning_type_expenses').insert(rows);
    if (error) {
      logger.error(LOG, 'Failed to insert expense lines', error);
      throw error;
    }
  }

  private static async replaceCategories(typeId: string, categoryIds: string[]): Promise<void> {
    const { error: delErr } = await this.supabase
      .from('hostel_cleaning_type_categories')
      .delete()
      .eq('type_id', typeId);
    if (delErr) {
      logger.error(LOG, 'Failed to clear category eligibility', delErr);
      throw delErr;
    }
    if (categoryIds.length === 0) return;

    const { error } = await this.supabase
      .from('hostel_cleaning_type_categories')
      .insert(categoryIds.map((category_id) => ({ type_id: typeId, category_id })));
    if (error) {
      logger.error(LOG, 'Failed to insert category eligibility', error);
      throw error;
    }
  }
}
```

- [ ] **Step 2: Write the hook**

Create `hooks/campus-living/use-housekeeping-types.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HousekeepingTypeService } from '@/lib/services/campus-living/housekeeping-type-service';
import { getErrorMessage } from '@/lib/utils';
import type {
  CreateCleaningTypeDto,
  UpdateCleaningTypeDto,
} from '@/types/campus-living/housekeeping';

export const housekeepingTypeKeys = {
  all: ['housekeeping-types'] as const,
  list: (institutionId?: string) =>
    ['housekeeping-types', 'list', institutionId ?? 'all'] as const,
  detail: (typeId: string) => ['housekeeping-types', 'detail', typeId] as const,
  bookable: (roomId?: string) =>
    ['housekeeping-types', 'bookable', roomId ?? 'none'] as const,
};

export function useHousekeepingTypes(institutionId?: string) {
  return useQuery({
    queryKey: housekeepingTypeKeys.list(institutionId),
    queryFn: () => HousekeepingTypeService.listTypes(institutionId),
  });
}

export function useBookableTypes(roomId?: string) {
  return useQuery({
    queryKey: housekeepingTypeKeys.bookable(roomId),
    queryFn: () => HousekeepingTypeService.listBookableTypesForRoom(roomId as string),
    enabled: Boolean(roomId),
  });
}

export function useCreateCleaningType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateCleaningTypeDto) => HousekeepingTypeService.createType(dto),
    onSuccess: (_data, dto) => {
      qc.invalidateQueries({ queryKey: housekeepingTypeKeys.all });
      toast.success(
        dto.category_ids.length === 0
          ? 'Cleaning type saved — but no room categories are selected, so nobody can book it yet.'
          : 'Cleaning type created',
      );
    },
    onError: (error) => toast.error(`Could not create cleaning type: ${getErrorMessage(error)}`),
  });
}

export function useUpdateCleaningType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ typeId, dto }: { typeId: string; dto: UpdateCleaningTypeDto }) =>
      HousekeepingTypeService.updateType(typeId, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: housekeepingTypeKeys.all });
      toast.success('Cleaning type updated');
    },
    onError: (error) => toast.error(`Could not update cleaning type: ${getErrorMessage(error)}`),
  });
}

export function useDeleteCleaningType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (typeId: string) => HousekeepingTypeService.deleteType(typeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: housekeepingTypeKeys.all });
      toast.success('Cleaning type deleted');
    },
    onError: (error) => {
      const msg = getErrorMessage(error);
      // 23503: ON DELETE RESTRICT fired because bookings reference this type.
      toast.error(
        msg.includes('23503') || msg.toLowerCase().includes('foreign key')
          ? 'This type has bookings in its history, so it cannot be deleted. Deactivate it instead.'
          : `Could not delete cleaning type: ${msg}`,
      );
    },
  });
}
```

- [ ] **Step 3: Verify diagnostics and commit**

Run `mcp__ide__getDiagnostics` on both files. Expect no errors — if `.from('hostel_cleaning_types')` errors with TS2769, `types/supabase.ts` was not regenerated in Task 3 Step 8.

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
git add lib/services/campus-living/housekeeping-type-service.ts hooks/campus-living/use-housekeeping-types.ts
git commit -m "feat(campus-living): cleaning type service and hook

Writes are ordered type -> expenses -> categories so a mid-way failure
strands an INVISIBLE type (empty category set means nobody can book) rather
than a visible one with wrong cost or wrong eligibility.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Cleaner directory service and hook

**Files:**
- Create: `lib/services/campus-living/housekeeping-cleaner-service.ts`
- Create: `hooks/campus-living/use-housekeeping-cleaners.ts`

**Interfaces:**
- Produces: `HousekeepingCleanerService.{listCleaners, createCleaner, updateCleaner, deleteCleaner, listAssignableForBooking}`; hook `useHousekeepingCleaners(institutionId?)`, `useCreateCleaner()`, `useUpdateCleaner()`, `useDeleteCleaner()`, `useAssignableCleaners(blockId?, bookingDate?)`, and `housekeepingCleanerKeys`.

- [ ] **Step 1: Write the service**

Create `lib/services/campus-living/housekeeping-cleaner-service.ts`:

```ts
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { getErrorMessage } from '@/lib/utils';
import type {
  Cleaner,
  CreateCleanerDto,
  UpdateCleanerDto,
} from '@/types/campus-living/housekeeping';

const LOG = 'campus-living/housekeeping-cleaners';

export class HousekeepingCleanerService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  static async listCleaners(institutionId?: string, includeInactive = false): Promise<Cleaner[]> {
    try {
      let query = this.supabase
        .from('hostel_cleaners')
        .select('*, blocks:hostel_cleaner_blocks(block_id)')
        .order('full_name', { ascending: true });

      if (institutionId != null) query = query.eq('institution_id', institutionId);
      if (!includeInactive) query = query.eq('is_active', true);

      const { data, error } = await query;
      if (error) {
        logger.error(LOG, 'Failed to list cleaners', error);
        throw error;
      }
      return (data ?? []).map((row: any) => ({
        ...(row as Cleaner),
        block_ids: (row.blocks ?? []).map((b: any) => b.block_id),
      }));
    } catch (error) {
      logger.error(LOG, `Unexpected error in listCleaners: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  /**
   * Cleaners who serve this block AND work this weekday. Mirrors the two
   * checks in fn_cl_housekeeping_assign so the picker never offers someone
   * the RPC will refuse.
   */
  static async listAssignableForBooking(blockId: string, bookingDate: string): Promise<Cleaner[]> {
    try {
      const { data, error } = await this.supabase
        .from('hostel_cleaner_blocks')
        .select('cleaner:hostel_cleaners(*)')
        .eq('block_id', blockId);
      if (error) {
        logger.error(LOG, 'Failed to list assignable cleaners', error);
        throw error;
      }
      // Postgres DOW: getUTCDay() is 0=Sunday..6=Saturday, the same convention.
      const dow = new Date(`${bookingDate}T12:00:00Z`).getUTCDay();
      return (data ?? [])
        .map((r: any) => r.cleaner)
        .filter((c: any) => c && c.is_active && (c.working_days ?? []).includes(dow))
        .map((c: any) => ({ ...(c as Cleaner), block_ids: [blockId] }))
        .sort((a: Cleaner, b: Cleaner) => a.full_name.localeCompare(b.full_name));
    } catch (error) {
      logger.error(LOG, `Unexpected error in listAssignableForBooking: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  static async createCleaner(dto: CreateCleanerDto): Promise<Cleaner> {
    try {
      const { data, error } = await this.supabase
        .from('hostel_cleaners')
        .insert({
          institution_id: dto.institution_id,
          full_name: dto.full_name.trim(),
          phone: dto.phone?.trim() || null,
          gender: dto.gender || null,
          employee_code: dto.employee_code?.trim() || null,
          working_days: dto.working_days,
          shift_start: dto.shift_start || null,
          shift_end: dto.shift_end || null,
          is_active: dto.is_active ?? true,
          notes: dto.notes?.trim() || null,
        })
        .select()
        .single();
      if (error) {
        logger.error(LOG, 'Failed to create cleaner', error);
        throw error;
      }
      const created = data as unknown as Cleaner;
      await this.replaceBlocks(created.id, dto.block_ids);
      return { ...created, block_ids: dto.block_ids };
    } catch (error) {
      logger.error(LOG, `Unexpected error in createCleaner: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  static async updateCleaner(cleanerId: string, dto: UpdateCleanerDto): Promise<void> {
    try {
      const patch: Record<string, unknown> = {};
      if (dto.full_name !== undefined) patch.full_name = dto.full_name.trim();
      if (dto.phone !== undefined) patch.phone = dto.phone?.trim() || null;
      if (dto.gender !== undefined) patch.gender = dto.gender || null;
      if (dto.employee_code !== undefined) patch.employee_code = dto.employee_code?.trim() || null;
      if (dto.working_days !== undefined) patch.working_days = dto.working_days;
      if (dto.shift_start !== undefined) patch.shift_start = dto.shift_start || null;
      if (dto.shift_end !== undefined) patch.shift_end = dto.shift_end || null;
      if (dto.is_active !== undefined) patch.is_active = dto.is_active;
      if (dto.notes !== undefined) patch.notes = dto.notes?.trim() || null;

      if (Object.keys(patch).length > 0) {
        const { error } = await this.supabase
          .from('hostel_cleaners')
          .update(patch)
          .eq('id', cleanerId);
        if (error) {
          logger.error(LOG, 'Failed to update cleaner', error);
          throw error;
        }
      }
      if (dto.block_ids !== undefined) await this.replaceBlocks(cleanerId, dto.block_ids);
    } catch (error) {
      logger.error(LOG, `Unexpected error in updateCleaner: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  /** Refused by the database once bookings reference the cleaner. Deactivate instead. */
  static async deleteCleaner(cleanerId: string): Promise<void> {
    try {
      const { error } = await this.supabase.from('hostel_cleaners').delete().eq('id', cleanerId);
      if (error) {
        logger.error(LOG, 'Failed to delete cleaner', error);
        throw error;
      }
    } catch (error) {
      logger.error(LOG, `Unexpected error in deleteCleaner: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  private static async replaceBlocks(cleanerId: string, blockIds: string[]): Promise<void> {
    const { error: delErr } = await this.supabase
      .from('hostel_cleaner_blocks')
      .delete()
      .eq('cleaner_id', cleanerId);
    if (delErr) {
      logger.error(LOG, 'Failed to clear cleaner blocks', delErr);
      throw delErr;
    }
    if (blockIds.length === 0) return;
    const { error } = await this.supabase
      .from('hostel_cleaner_blocks')
      .insert(blockIds.map((block_id) => ({ cleaner_id: cleanerId, block_id })));
    if (error) {
      logger.error(LOG, 'Failed to insert cleaner blocks', error);
      throw error;
    }
  }
}
```

- [ ] **Step 2: Write the hook**

Create `hooks/campus-living/use-housekeeping-cleaners.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HousekeepingCleanerService } from '@/lib/services/campus-living/housekeeping-cleaner-service';
import { getErrorMessage } from '@/lib/utils';
import type { CreateCleanerDto, UpdateCleanerDto } from '@/types/campus-living/housekeeping';

export const housekeepingCleanerKeys = {
  all: ['housekeeping-cleaners'] as const,
  list: (institutionId?: string, includeInactive?: boolean) =>
    ['housekeeping-cleaners', 'list', institutionId ?? 'all', includeInactive ?? false] as const,
  assignable: (blockId?: string, date?: string) =>
    ['housekeeping-cleaners', 'assignable', blockId ?? 'none', date ?? 'none'] as const,
};

export function useHousekeepingCleaners(institutionId?: string, includeInactive = false) {
  return useQuery({
    queryKey: housekeepingCleanerKeys.list(institutionId, includeInactive),
    queryFn: () => HousekeepingCleanerService.listCleaners(institutionId, includeInactive),
  });
}

export function useAssignableCleaners(blockId?: string, bookingDate?: string) {
  return useQuery({
    queryKey: housekeepingCleanerKeys.assignable(blockId, bookingDate),
    queryFn: () =>
      HousekeepingCleanerService.listAssignableForBooking(blockId as string, bookingDate as string),
    enabled: Boolean(blockId && bookingDate),
  });
}

export function useCreateCleaner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateCleanerDto) => HousekeepingCleanerService.createCleaner(dto),
    onSuccess: (_d, dto) => {
      qc.invalidateQueries({ queryKey: housekeepingCleanerKeys.all });
      toast.success(
        dto.block_ids.length === 0
          ? 'Cleaner saved — assign them to at least one block before they can take jobs.'
          : 'Cleaner added',
      );
    },
    onError: (error) => toast.error(`Could not add cleaner: ${getErrorMessage(error)}`),
  });
}

export function useUpdateCleaner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cleanerId, dto }: { cleanerId: string; dto: UpdateCleanerDto }) =>
      HousekeepingCleanerService.updateCleaner(cleanerId, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: housekeepingCleanerKeys.all });
      toast.success('Cleaner updated');
    },
    onError: (error) => toast.error(`Could not update cleaner: ${getErrorMessage(error)}`),
  });
}

export function useDeleteCleaner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cleanerId: string) => HousekeepingCleanerService.deleteCleaner(cleanerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: housekeepingCleanerKeys.all });
      toast.success('Cleaner removed');
    },
    onError: (error) => {
      const msg = getErrorMessage(error);
      toast.error(
        msg.includes('23503') || msg.toLowerCase().includes('foreign key')
          ? 'This cleaner appears in booking history, so they cannot be deleted. Mark them inactive instead.'
          : `Could not remove cleaner: ${msg}`,
      );
    },
  });
}
```

- [ ] **Step 3: Verify diagnostics and commit**

Run `mcp__ide__getDiagnostics` on both files, then:

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
git add lib/services/campus-living/housekeeping-cleaner-service.ts hooks/campus-living/use-housekeeping-cleaners.ts
git commit -m "feat(campus-living): cleaner directory service and hook

listAssignableForBooking mirrors both checks in fn_cl_housekeeping_assign
(serves this block, works this weekday) so the picker never offers a cleaner
the RPC will then refuse.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Availability service and hook

Also owns the two surviving policy knobs, which replaces the deleted settings page.

**Files:**
- Create: `lib/services/campus-living/housekeeping-availability-service.ts`
- Create: `hooks/campus-living/use-housekeeping-availability.ts`

**Interfaces:**
- Produces: `HousekeepingAvailabilityService.{listForBlock, upsertWeekday, listPolicies, savePolicy}`; hook `useBlockAvailability(blockId?)`, `useUpsertAvailability()`, `useHousekeepingPolicies()`, `useSaveHousekeepingPolicy()`, and `housekeepingAvailabilityKeys`.

- [ ] **Step 1: Write the service**

Create `lib/services/campus-living/housekeeping-availability-service.ts`:

```ts
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { getErrorMessage } from '@/lib/utils';
import type {
  CleaningAvailability,
  UpsertAvailabilityDto,
} from '@/types/campus-living/housekeeping';

const LOG = 'campus-living/housekeeping-availability';

/**
 * The two knobs that survived the rebuild. Every other old housekeeping.*
 * policy became table configuration:
 *   slot_duration_minutes       -> hostel_cleaning_types.duration_minutes
 *   service_window              -> hostel_cleaning_availability.window_start/_end
 *   capacity_per_slot_per_block -> hostel_cleaning_availability.capacity
 *   weekly_quota_by_tier        -> hostel_cleaning_types.usage_limit_count/_period
 *   cancellation_cutoff_minutes -> replaced by "cancel while unassigned"
 */
export const HOUSEKEEPING_POLICY_KEYS = {
  BOOKING_ENABLED: 'housekeeping.booking_enabled',
  BOOKING_ADVANCE_DAYS: 'housekeeping.booking_advance_days',
} as const;

export class HousekeepingAvailabilityService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /** Always returns 7 rows, one per weekday, defaulting closed days. */
  static async listForBlock(blockId: string, institutionId: string): Promise<CleaningAvailability[]> {
    try {
      const { data, error } = await this.supabase
        .from('hostel_cleaning_availability')
        .select('*')
        .eq('block_id', blockId)
        .order('weekday', { ascending: true });
      if (error) {
        logger.error(LOG, 'Failed to list availability', error);
        throw error;
      }
      const byWeekday = new Map<number, CleaningAvailability>(
        (data ?? []).map((r: any) => [r.weekday, r as CleaningAvailability]),
      );
      // Postgres DOW: 0=Sunday .. 6=Saturday.
      return Array.from({ length: 7 }, (_unused, weekday) =>
        byWeekday.get(weekday) ?? {
          id: '',
          institution_id: institutionId,
          block_id: blockId,
          weekday,
          is_open: false,
          window_start: '09:00',
          window_end: '17:00',
          capacity: 1,
        },
      );
    } catch (error) {
      logger.error(LOG, `Unexpected error in listForBlock: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  static async upsertWeekday(dto: UpsertAvailabilityDto): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('hostel_cleaning_availability')
        .upsert(
          {
            institution_id: dto.institution_id,
            block_id: dto.block_id,
            weekday: dto.weekday,
            is_open: dto.is_open,
            window_start: dto.window_start,
            window_end: dto.window_end,
            capacity: dto.capacity,
          },
          { onConflict: 'block_id,weekday' },
        );
      if (error) {
        logger.error(LOG, 'Failed to upsert availability', error);
        throw error;
      }
    } catch (error) {
      logger.error(LOG, `Unexpected error in upsertWeekday: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  static async listPolicies(): Promise<Record<string, unknown>> {
    try {
      const { data, error } = await this.supabase
        .from('platform_policies')
        .select('policy_key, value')
        .in('policy_key', Object.values(HOUSEKEEPING_POLICY_KEYS))
        .eq('scope_type', 'global')
        .is('scope_id', null);
      if (error) {
        logger.error(LOG, 'Failed to read housekeeping policies', error);
        throw error;
      }
      return Object.fromEntries((data ?? []).map((r: any) => [r.policy_key, r.value]));
    } catch (error) {
      logger.error(LOG, `Unexpected error in listPolicies: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  static async savePolicy(policyKey: string, value: unknown): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('platform_policies')
        .update({ value })
        .eq('policy_key', policyKey)
        .eq('scope_type', 'global')
        .is('scope_id', null);
      if (error) {
        logger.error(LOG, `Failed to save policy ${policyKey}`, error);
        throw error;
      }
    } catch (error) {
      logger.error(LOG, `Unexpected error in savePolicy: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }
}
```

- [ ] **Step 2: Write the hook**

Create `hooks/campus-living/use-housekeeping-availability.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HousekeepingAvailabilityService } from '@/lib/services/campus-living/housekeeping-availability-service';
import { getErrorMessage } from '@/lib/utils';
import type { UpsertAvailabilityDto } from '@/types/campus-living/housekeeping';

export const housekeepingAvailabilityKeys = {
  all: ['housekeeping-availability'] as const,
  block: (blockId?: string) => ['housekeeping-availability', 'block', blockId ?? 'none'] as const,
  policies: () => ['housekeeping-availability', 'policies'] as const,
};

export function useBlockAvailability(blockId?: string, institutionId?: string) {
  return useQuery({
    queryKey: housekeepingAvailabilityKeys.block(blockId),
    queryFn: () =>
      HousekeepingAvailabilityService.listForBlock(blockId as string, institutionId as string),
    enabled: Boolean(blockId && institutionId),
  });
}

export function useUpsertAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpsertAvailabilityDto) =>
      HousekeepingAvailabilityService.upsertWeekday(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: housekeepingAvailabilityKeys.all });
      // The learner slot grid is derived from availability, so it is stale now.
      qc.invalidateQueries({ queryKey: ['housekeeping-bookings'] });
      toast.success('Availability saved');
    },
    onError: (error) => toast.error(`Could not save availability: ${getErrorMessage(error)}`),
  });
}

export function useHousekeepingPolicies() {
  return useQuery({
    queryKey: housekeepingAvailabilityKeys.policies(),
    queryFn: () => HousekeepingAvailabilityService.listPolicies(),
  });
}

export function useSaveHousekeepingPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ policyKey, value }: { policyKey: string; value: unknown }) =>
      HousekeepingAvailabilityService.savePolicy(policyKey, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: housekeepingAvailabilityKeys.policies() });
      toast.success('Setting saved');
    },
    onError: (error) => toast.error(`Could not save setting: ${getErrorMessage(error)}`),
  });
}
```

- [ ] **Step 3: Verify diagnostics and commit**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
git add lib/services/campus-living/housekeeping-availability-service.ts hooks/campus-living/use-housekeeping-availability.ts
git commit -m "feat(campus-living): housekeeping availability service and hook

listForBlock always returns 7 rows so the weekday grid renders completely
even before a block has been configured; unsaved days default to closed.

Also owns the two surviving platform_policies knobs, which is what lets the
separate housekeeping settings page stay deleted.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Booking service and hook

The centre of the module. Writes go through the four RPCs; reads use PostgREST with RLS. Photos and feedback are plain table writes because their validation is expressible as RLS.

**Files:**
- Create: `lib/services/campus-living/housekeeping-booking-service.ts`
- Create: `hooks/campus-living/use-housekeeping-bookings.ts`

**Interfaces:**
- Consumes: the four RPCs from Task 4, types and `bookingErrorMessage` from Task 6.
- Produces: `HousekeepingBookingService.{getSlots, book, cancel, assign, listDayBoard, listMyBookings, getBooking, listPhotos, recordPhoto, startJob, finishJob, waiveHold, submitFeedback, listFeedback}`; hook `useSlotGrid`, `useBookSlot`, `useCancelBooking`, `useAssignCleaner`, `useDayBoard`, `useMyBookings`, `useBookingPhotos`, `useWaiveHold`, `useSubmitFeedback`, and `housekeepingBookingKeys`.

- [ ] **Step 1: Write the service**

Create `lib/services/campus-living/housekeeping-booking-service.ts`:

```ts
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { getErrorMessage } from '@/lib/utils';
import type {
  AssignResult,
  BookResult,
  BookingBoardRow,
  BookingPhoto,
  CancelResult,
  CleaningBooking,
  CleaningFeedback,
  PhotoPhase,
  SlotGridResult,
} from '@/types/campus-living/housekeeping';

const LOG = 'campus-living/housekeeping-bookings';

export class HousekeepingBookingService {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  // ── Reads ──────────────────────────────────────────────────────────────

  /**
   * The warden day board. Left joins throughout: an !inner embed would be an
   * INNER JOIN and would silently drop a booking whose room or block row is
   * missing — exactly the bookings a warden most needs to see.
   */
  static async listDayBoard(
    date: string,
    institutionId?: string,
    blockId?: string,
  ): Promise<BookingBoardRow[]> {
    try {
      let query = this.supabase
        .from('hostel_cleaning_bookings')
        .select(`*,
                 room:hostel_rooms(room_number),
                 block:hostel_blocks(name),
                 photos:hostel_cleaning_booking_photos(phase),
                 feedback:hostel_cleaning_feedback(rating)`)
        .eq('booking_date', date)
        .order('slot_start', { ascending: true });

      if (institutionId != null) query = query.eq('institution_id', institutionId);
      if (blockId != null) query = query.eq('block_id', blockId);

      const { data, error } = await query;
      if (error) {
        logger.error(LOG, 'Failed to load day board', error);
        throw error;
      }

      return (data ?? []).map((row: any) => {
        const photos = (row.photos ?? []) as Array<{ phase: PhotoPhase }>;
        const feedback = (row.feedback ?? []) as Array<{ rating: number }>;
        return {
          ...(row as CleaningBooking),
          room_number: row.room?.room_number ?? null,
          block_name: row.block?.name ?? null,
          has_before_photo: photos.some((p) => p.phase === 'before'),
          has_after_photo: photos.some((p) => p.phase === 'after'),
          feedback_count: feedback.length,
          average_rating:
            feedback.length > 0
              ? Math.round((feedback.reduce((s, f) => s + f.rating, 0) / feedback.length) * 10) / 10
              : null,
        };
      });
    } catch (error) {
      logger.error(LOG, `Unexpected error in listDayBoard: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  /**
   * Every booking for the caller's room — not just ones they booked. RLS
   * scopes this to rooms they are allocated to, which is what lets a roommate
   * see and rate a cleaning someone else booked.
   */
  static async listMyBookings(roomId: string, fromDate?: string): Promise<BookingBoardRow[]> {
    try {
      let query = this.supabase
        .from('hostel_cleaning_bookings')
        .select(`*,
                 room:hostel_rooms(room_number),
                 block:hostel_blocks(name),
                 photos:hostel_cleaning_booking_photos(phase),
                 feedback:hostel_cleaning_feedback(rating)`)
        .eq('room_id', roomId)
        .order('booking_date', { ascending: false })
        .order('slot_start', { ascending: false })
        .limit(50);

      if (fromDate != null) query = query.gte('booking_date', fromDate);

      const { data, error } = await query;
      if (error) {
        logger.error(LOG, 'Failed to load my bookings', error);
        throw error;
      }
      return (data ?? []).map((row: any) => {
        const photos = (row.photos ?? []) as Array<{ phase: PhotoPhase }>;
        const feedback = (row.feedback ?? []) as Array<{ rating: number }>;
        return {
          ...(row as CleaningBooking),
          room_number: row.room?.room_number ?? null,
          block_name: row.block?.name ?? null,
          has_before_photo: photos.some((p) => p.phase === 'before'),
          has_after_photo: photos.some((p) => p.phase === 'after'),
          feedback_count: feedback.length,
          average_rating: null,
        };
      });
    } catch (error) {
      logger.error(LOG, `Unexpected error in listMyBookings: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  static async listPhotos(bookingId: string): Promise<BookingPhoto[]> {
    try {
      const { data, error } = await this.supabase
        .from('hostel_cleaning_booking_photos')
        .select('*')
        .eq('booking_id', bookingId)
        .order('uploaded_at', { ascending: true });
      if (error) {
        logger.error(LOG, 'Failed to list booking photos', error);
        throw error;
      }
      return (data ?? []) as BookingPhoto[];
    } catch (error) {
      logger.error(LOG, `Unexpected error in listPhotos: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  static async listFeedback(bookingId: string): Promise<CleaningFeedback[]> {
    try {
      const { data, error } = await this.supabase
        .from('hostel_cleaning_feedback')
        .select('*')
        .eq('booking_id', bookingId)
        .order('created_at', { ascending: true });
      if (error) {
        logger.error(LOG, 'Failed to list feedback', error);
        throw error;
      }
      return (data ?? []) as CleaningFeedback[];
    } catch (error) {
      logger.error(LOG, `Unexpected error in listFeedback: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  // ── RPC writes ─────────────────────────────────────────────────────────

  static async getSlots(roomId: string, typeId: string, date: string): Promise<SlotGridResult> {
    try {
      const { data, error } = await (this.supabase as any).rpc('fn_cl_housekeeping_slots', {
        p_room_id: roomId,
        p_type_id: typeId,
        p_date: date,
      });
      if (error) {
        logger.error(LOG, 'Failed to load slot grid', error);
        throw error;
      }
      return data as SlotGridResult;
    } catch (error) {
      logger.error(LOG, `Unexpected error in getSlots: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  static async book(
    typeId: string,
    date: string,
    slotStart: string,
    notes?: string,
  ): Promise<BookResult> {
    try {
      const { data, error } = await (this.supabase as any).rpc('fn_cl_housekeeping_book', {
        p_type_id: typeId,
        p_date: date,
        p_slot_start: slotStart,
        p_notes: notes ?? null,
      });
      if (error) {
        logger.error(LOG, 'Failed to book slot', error);
        throw error;
      }
      return data as BookResult;
    } catch (error) {
      logger.error(LOG, `Unexpected error in book: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  static async cancel(bookingId: string, reason?: string): Promise<CancelResult> {
    try {
      const { data, error } = await (this.supabase as any).rpc('fn_cl_housekeeping_cancel', {
        p_booking_id: bookingId,
        p_reason: reason ?? null,
      });
      if (error) {
        logger.error(LOG, 'Failed to cancel booking', error);
        throw error;
      }
      return data as CancelResult;
    } catch (error) {
      logger.error(LOG, `Unexpected error in cancel: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  static async assign(
    bookingId: string,
    cleanerId: string | null,
    clear = false,
  ): Promise<AssignResult> {
    try {
      const { data, error } = await (this.supabase as any).rpc('fn_cl_housekeeping_assign', {
        p_booking_id: bookingId,
        p_cleaner_id: cleanerId,
        p_clear: clear,
      });
      if (error) {
        logger.error(LOG, 'Failed to assign cleaner', error);
        throw error;
      }
      return data as AssignResult;
    } catch (error) {
      logger.error(LOG, `Unexpected error in assign: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  // ── Table writes (RLS-enforced) ────────────────────────────────────────

  /**
   * Called by the photo API route AFTER the Drive upload succeeds. Advancing
   * the status is part of the same call so a booking can never hold an
   * after-photo while still reading 'assigned'.
   */
  static async recordPhoto(args: {
    bookingId: string;
    institutionId: string;
    phase: PhotoPhase;
    driveFileId: string;
    driveUrl: string;
    fileName?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    uploadedBy: string;
  }): Promise<void> {
    try {
      const { error } = await this.supabase.from('hostel_cleaning_booking_photos').insert({
        booking_id: args.bookingId,
        institution_id: args.institutionId,
        phase: args.phase,
        drive_file_id: args.driveFileId,
        drive_url: args.driveUrl,
        file_name: args.fileName ?? null,
        mime_type: args.mimeType ?? null,
        size_bytes: args.sizeBytes ?? null,
        uploaded_by: args.uploadedBy,
      });
      if (error) {
        logger.error(LOG, 'Failed to record photo', error);
        throw error;
      }
      if (args.phase === 'before') await this.startJob(args.bookingId);
      else await this.finishJob(args.bookingId);
    } catch (error) {
      logger.error(LOG, `Unexpected error in recordPhoto: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  /** assigned -> in_progress. The .eq('status',...) makes this idempotent. */
  static async startJob(bookingId: string): Promise<void> {
    const { error } = await this.supabase
      .from('hostel_cleaning_bookings')
      .update({ status: 'in_progress', started_at: new Date().toISOString() })
      .eq('id', bookingId)
      .eq('status', 'assigned');
    if (error) {
      logger.error(LOG, 'Failed to start job', error);
      throw error;
    }
  }

  /**
   * in_progress -> awaiting_feedback. Guarded on the current status so an
   * after-photo can never skip the before-photo step: if the booking is not
   * in_progress, zero rows update and the status stands.
   */
  static async finishJob(bookingId: string): Promise<void> {
    const { error } = await this.supabase
      .from('hostel_cleaning_bookings')
      .update({ status: 'awaiting_feedback', finished_at: new Date().toISOString() })
      .eq('id', bookingId)
      .eq('status', 'in_progress');
    if (error) {
      logger.error(LOG, 'Failed to finish job', error);
      throw error;
    }
  }

  /**
   * The safety valve. A room whose learners have left campus would otherwise
   * be attendance-blocked forever. The reason is mandatory (DB CHECK), and
   * waiving does NOT complete the booking — it stays awaiting_feedback so the
   * record still shows nobody rated it.
   */
  static async waiveHold(bookingId: string, reason: string, waivedBy: string): Promise<void> {
    try {
      const trimmed = reason.trim();
      if (!trimmed) throw new Error('A reason is required to waive a feedback hold.');
      const { error } = await this.supabase
        .from('hostel_cleaning_bookings')
        .update({ waived_at: new Date().toISOString(), waived_by: waivedBy, waive_reason: trimmed })
        .eq('id', bookingId);
      if (error) {
        logger.error(LOG, 'Failed to waive feedback hold', error);
        throw error;
      }
    } catch (error) {
      logger.error(LOG, `Unexpected error in waiveHold: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  /**
   * Any roommate may rate. The FIRST rating completes the booking, which lifts
   * the attendance hold for everyone in the room. RLS enforces that the rater
   * lives in the room and the booking is awaiting_feedback.
   */
  static async submitFeedback(args: {
    bookingId: string;
    institutionId: string;
    roomId: string;
    learnerId: string;
    rating: number;
    comment?: string | null;
  }): Promise<void> {
    try {
      const { error } = await this.supabase.from('hostel_cleaning_feedback').insert({
        booking_id: args.bookingId,
        institution_id: args.institutionId,
        room_id: args.roomId,
        learner_id: args.learnerId,
        rating: args.rating,
        comment: args.comment?.trim() || null,
      });
      if (error) {
        logger.error(LOG, 'Failed to submit feedback', error);
        throw error;
      }
      const { error: statusErr } = await this.supabase
        .from('hostel_cleaning_bookings')
        .update({ status: 'completed' })
        .eq('id', args.bookingId)
        .eq('status', 'awaiting_feedback');
      if (statusErr) {
        logger.error(LOG, 'Failed to complete booking after feedback', statusErr);
        throw statusErr;
      }
    } catch (error) {
      logger.error(LOG, `Unexpected error in submitFeedback: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }
}
```

- [ ] **Step 2: Write the hook**

Create `hooks/campus-living/use-housekeeping-bookings.ts`:

```ts
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { HousekeepingBookingService } from '@/lib/services/campus-living/housekeeping-booking-service';
import { bookingErrorMessage } from '@/lib/services/campus-living/housekeeping-rules';
import { getErrorMessage } from '@/lib/utils';
import type { PhotoPhase } from '@/types/campus-living/housekeeping';

export const housekeepingBookingKeys = {
  all: ['housekeeping-bookings'] as const,
  slots: (roomId?: string, typeId?: string, date?: string) =>
    ['housekeeping-bookings', 'slots', roomId ?? '-', typeId ?? '-', date ?? '-'] as const,
  dayBoard: (date: string, institutionId?: string, blockId?: string) =>
    ['housekeeping-bookings', 'day-board', date, institutionId ?? 'all', blockId ?? 'all'] as const,
  mine: (roomId?: string) => ['housekeeping-bookings', 'mine', roomId ?? 'none'] as const,
  photos: (bookingId: string) => ['housekeeping-bookings', 'photos', bookingId] as const,
  holds: (institutionId?: string, blockId?: string, date?: string) =>
    ['housekeeping-bookings', 'holds', institutionId ?? 'all', blockId ?? 'all', date ?? 'today'] as const,
};

/** Everything a mutation must refresh: bookings, holds, and the attendance roster. */
function invalidateBookingSurfaces(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: housekeepingBookingKeys.all });
  // Cross-module: nothing self-refreshes here (staleTime 5min, no focus
  // refetch), so a booking change must invalidate the attendance roster too or
  // a warden sees a stale hold.
  qc.invalidateQueries({ queryKey: ['hostel-attendance'] });
}

export function useSlotGrid(roomId?: string, typeId?: string, date?: string) {
  return useQuery({
    queryKey: housekeepingBookingKeys.slots(roomId, typeId, date),
    queryFn: () =>
      HousekeepingBookingService.getSlots(roomId as string, typeId as string, date as string),
    enabled: Boolean(roomId && typeId && date),
  });
}

export function useDayBoard(date: string, institutionId?: string, blockId?: string) {
  return useQuery({
    queryKey: housekeepingBookingKeys.dayBoard(date, institutionId, blockId),
    queryFn: () => HousekeepingBookingService.listDayBoard(date, institutionId, blockId),
  });
}

export function useMyBookings(roomId?: string, fromDate?: string) {
  return useQuery({
    queryKey: housekeepingBookingKeys.mine(roomId),
    queryFn: () => HousekeepingBookingService.listMyBookings(roomId as string, fromDate),
    enabled: Boolean(roomId),
  });
}

export function useBookingPhotos(bookingId: string) {
  return useQuery({
    queryKey: housekeepingBookingKeys.photos(bookingId),
    queryFn: () => HousekeepingBookingService.listPhotos(bookingId),
    enabled: Boolean(bookingId),
  });
}

export function useBookSlot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      typeId, date, slotStart, notes,
    }: { typeId: string; date: string; slotStart: string; notes?: string }) =>
      HousekeepingBookingService.book(typeId, date, slotStart, notes),
    onSuccess: (result) => {
      // Invalidate on BOTH outcomes: a refusal means the grid on screen is
      // already stale (someone else took the slot, or locked the room).
      invalidateBookingSurfaces(qc);
      if (result.success) {
        toast.success('Cleaning booked');
      } else if (result.error_code === 'quota_exhausted') {
        toast.error(
          `Your room has used all ${result.allowed ?? ''} bookings for this cleaning.`.replace('  ', ' '),
        );
      } else {
        toast.error(bookingErrorMessage(result.error_code, 'Could not book this slot'));
      }
    },
    onError: (error) => toast.error(`Could not book this slot: ${getErrorMessage(error)}`),
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, reason }: { bookingId: string; reason?: string }) =>
      HousekeepingBookingService.cancel(bookingId, reason),
    onSuccess: (result) => {
      invalidateBookingSurfaces(qc);
      if (result.success) toast.success('Booking cancelled');
      else toast.error(bookingErrorMessage(result.error_code, 'Could not cancel this booking'));
    },
    onError: (error) => toast.error(`Could not cancel: ${getErrorMessage(error)}`),
  });
}

export function useAssignCleaner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      bookingId, cleanerId, clear,
    }: { bookingId: string; cleanerId: string | null; clear?: boolean }) =>
      HousekeepingBookingService.assign(bookingId, cleanerId, clear ?? false),
    onSuccess: (result) => {
      invalidateBookingSurfaces(qc);
      if (result.success) {
        toast.success(result.cleaner_name ? `Assigned to ${result.cleaner_name}` : 'Cleaner cleared');
      } else {
        toast.error(bookingErrorMessage(result.error_code, 'Could not assign this cleaner'));
      }
    },
    onError: (error) => toast.error(`Could not assign: ${getErrorMessage(error)}`),
  });
}

export function useWaiveHold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      bookingId, reason, waivedBy,
    }: { bookingId: string; reason: string; waivedBy: string }) =>
      HousekeepingBookingService.waiveHold(bookingId, reason, waivedBy),
    onSuccess: () => {
      invalidateBookingSurfaces(qc);
      toast.success('Hold waived — attendance released for this room');
    },
    onError: (error) => toast.error(`Could not waive the hold: ${getErrorMessage(error)}`),
  });
}

export function useSubmitFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      bookingId: string;
      institutionId: string;
      roomId: string;
      learnerId: string;
      rating: number;
      comment?: string | null;
    }) => HousekeepingBookingService.submitFeedback(args),
    onSuccess: () => {
      invalidateBookingSurfaces(qc);
      toast.success('Thanks — your rating released attendance for your room');
    },
    onError: (error) => {
      const msg = getErrorMessage(error);
      toast.error(
        msg.includes('23505')
          ? 'You have already rated this cleaning.'
          : `Could not submit your rating: ${msg}`,
      );
    },
  });
}

/** Re-exported so pages import copy from one place. */
export { bookingErrorMessage };
```

- [ ] **Step 3: Confirm the photo-upload guard cannot be bypassed**

`finishJob` is guarded on `status = 'in_progress'`, so an after-photo cannot advance a booking that never had a before-photo. Verify the guard is really in the code:

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
grep -A3 "static async finishJob" lib/services/campus-living/housekeeping-booking-service.ts | grep -c "eq('status', 'in_progress')"
```

Expected: `1`. If it is `0`, the ordering guarantee is gone.

- [ ] **Step 4: Verify diagnostics and commit**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
git add lib/services/campus-living/housekeeping-booking-service.ts hooks/campus-living/use-housekeeping-bookings.ts
git commit -m "feat(campus-living): housekeeping booking service and hook

Writes go through the four DEFINER RPCs; reads use PostgREST with RLS, which
is what lets a roommate see and rate a booking someone else made.

Status advances are guarded on the current status, so an after-photo cannot
advance a booking that never had a before-photo - zero rows update and the
status stands.

Mutations invalidate the attendance roster as well as the booking surfaces:
nothing self-refreshes in this app, so a booking change must push the other
module's keys or a warden sees a stale hold.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: The feedback gate service and hook

Small, isolated, and the only thing another module imports. Modelled on `mess-rating-gate.ts`, but reading `auth.uid() = profiles.id = hostel_allocations.learner_id` rather than that file's broken chain.

**Files:**
- Create: `lib/services/campus-living/housekeeping-feedback-gate.ts`
- Create: `hooks/campus-living/use-housekeeping-holds.ts`

**Interfaces:**
- Consumes: `fn_cl_housekeeping_feedback_holds` (Task 4), `holdMessage` (Task 6).
- Produces: `HousekeepingFeedbackGate.{listHolds, holdsByLearner}` and `useFeedbackHolds(institutionId?, blockId?, date?)`, `housekeepingHoldKeys`. **Task 18 imports `holdsByLearner` into `HostelAttendanceService`.**

- [ ] **Step 1: Write the gate service**

Create `lib/services/campus-living/housekeeping-feedback-gate.ts`:

```ts
/**
 * Housekeeping Feedback Gate
 * ============================================================================
 * Answers one question: which learners are attendance-blocked right now
 * because a cleaning in their room finished and nobody rated it?
 *
 * The answer is computed live by fn_cl_housekeeping_feedback_holds — there is
 * no stored flag and no cron, so nothing can fall out of sync. A hold starts
 * the day AFTER the booking date and lifts the instant any roommate rates.
 *
 * Identity chain (verified 2026-09-07, 714/714 live allocations):
 *   auth.uid()  =  profiles.id  =  hostel_allocations.learner_id
 *                              =  hostel_attendance.learner_id
 * NOTE: do NOT copy the chain in mess-rating-gate.ts, which goes
 * profiles.learner_id -> hostel_allocations.learner_id and matches zero rows.
 * ============================================================================
 */

import { createClientSupabaseClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/enhanced-logger';
import { getErrorMessage } from '@/lib/utils';
import type { FeedbackHold } from '@/types/campus-living/housekeeping';

const LOG = 'campus-living/housekeeping-feedback-gate';

export class HousekeepingFeedbackGate {
  private static get supabase() {
    return createClientSupabaseClient();
  }

  /**
   * All active holds, optionally narrowed. Every argument is optional and null
   * means "no filter" — never coerce undefined to '' here, that would travel
   * as a real UUID and match zero rows, silently reporting "no holds" and
   * letting blocked learners through.
   */
  static async listHolds(
    institutionId?: string,
    blockId?: string,
    date?: string,
  ): Promise<FeedbackHold[]> {
    try {
      const { data, error } = await (this.supabase as any).rpc(
        'fn_cl_housekeeping_feedback_holds',
        {
          p_institution_id: institutionId ?? null,
          p_block_id: blockId ?? null,
          p_date: date ?? null,
        },
      );
      if (error) {
        // Distinguish "query failed" from "no holds". Returning [] on an error
        // would silently release every hold in the institution.
        logger.error(LOG, 'Failed to read feedback holds', error);
        throw error;
      }
      return (data ?? []) as FeedbackHold[];
    } catch (error) {
      logger.error(LOG, `Unexpected error in listHolds: ${getErrorMessage(error)}`, error);
      throw error;
    }
  }

  /**
   * The same data keyed by learner_id, which is the shape the attendance
   * marking screen needs. A learner appears once even if two rooms somehow
   * hold them; the first hold wins for display.
   */
  static async holdsByLearner(
    institutionId?: string,
    blockId?: string,
    date?: string,
  ): Promise<Map<string, FeedbackHold>> {
    const holds = await this.listHolds(institutionId, blockId, date);
    const map = new Map<string, FeedbackHold>();
    for (const hold of holds) {
      if (!map.has(hold.learner_id)) map.set(hold.learner_id, hold);
    }
    return map;
  }
}
```

- [ ] **Step 2: Write the hook**

Create `hooks/campus-living/use-housekeeping-holds.ts`:

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { HousekeepingFeedbackGate } from '@/lib/services/campus-living/housekeeping-feedback-gate';

export const housekeepingHoldKeys = {
  all: ['housekeeping-holds'] as const,
  list: (institutionId?: string, blockId?: string, date?: string) =>
    ['housekeeping-holds', 'list', institutionId ?? 'all', blockId ?? 'all', date ?? 'today'] as const,
};

export function useFeedbackHolds(institutionId?: string, blockId?: string, date?: string) {
  return useQuery({
    queryKey: housekeepingHoldKeys.list(institutionId, blockId, date),
    queryFn: () => HousekeepingFeedbackGate.listHolds(institutionId, blockId, date),
  });
}
```

- [ ] **Step 3: Verify the gate returns real data**

The probe in Task 4 already proved the SQL works. Confirm the service path returns the same. Via `mcp__supabase__execute_sql`, create a hold and read it back through the RPC exactly as the service does:

```sql
SELECT * FROM fn_cl_housekeeping_feedback_holds(NULL, NULL, NULL);
```

Expected right now: **zero rows** (no bookings exist yet). That is the correct empty state — an error here, rather than an empty set, would mean the grants from Task 4 are wrong.

- [ ] **Step 4: Verify diagnostics and commit**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
git add lib/services/campus-living/housekeeping-feedback-gate.ts hooks/campus-living/use-housekeeping-holds.ts
git commit -m "feat(campus-living): housekeeping feedback gate

The single import surface the attendance module consumes. Throws rather than
returning [] on a query failure: coercing an error to an empty set would
silently release every hold in the institution.

Uses auth.uid() = profiles.id = hostel_allocations.learner_id, not the
profiles.learner_id chain in mess-rating-gate.ts, which matches zero rows.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

# Phase E — Surfaces

## Task 12: Photo upload and image-proxy routes

Drive files are **not** publicly shared, so a stored `drive_url` cannot be used in an `<img>` tag. The existing room-condition-photos feature solves this with an authenticated proxy route, and this module copies that shape exactly.

**Files:**
- Modify: `lib/google/drive-upload.ts` (add `uploadHousekeepingPhoto`)
- Create: `app/api/campus-living/housekeeping/bookings/[bookingId]/photos/route.ts`
- Create: `app/api/campus-living/housekeeping/photos/[photoId]/image/route.ts`

**Interfaces:**
- Consumes: `HousekeepingBookingService.recordPhoto` (Task 10).
- Produces: `POST …/bookings/<id>/photos` accepting `multipart/form-data` with `file` and `phase`; `GET …/photos/<id>/image` streaming the bytes. Task 16 posts to the first and renders the second.

- [ ] **Step 1: Add the Drive upload function**

Append to `lib/google/drive-upload.ts`, following `uploadRoomConditionPhoto` directly above it:

```ts
export interface HousekeepingPhotoUploadOptions {
  blockName: string;
  roomNumber: string;
  bookingDate: string;
  phase: 'before' | 'after';
  file: File;
}

export interface HousekeepingPhotoUploadResult {
  name: string;
  driveFileId: string;
  url: string;
}

/**
 * Upload a housekeeping before/after photo to
 *   <ROOT> / Campus Living / Housekeeping Photos / <Block> / <Room> / <Date>
 * No anyone:reader permission — access is gated by
 * hostel_cleaning_booking_photos RLS plus the authenticated image proxy route,
 * not public link-sharing. blockName/roomNumber (not an institution name) key
 * the folder path since a block can serve multiple institutions via
 * hostel_block_institutions.
 */
export async function uploadHousekeepingPhoto(
  opts: HousekeepingPhotoUploadOptions
): Promise<HousekeepingPhotoUploadResult> {
  if (!isDriveConfigured()) throw new Error('Google Drive is not configured.');
  const drive = createDriveClient();
  const folderId = await ensureFolderPath(drive, [
    'Campus Living', 'Housekeeping Photos', opts.blockName, opts.roomNumber, opts.bookingDate,
  ]);
  const buffer = Buffer.from(await opts.file.arrayBuffer());
  const safeName = (opts.file.name || 'photo').replace(/[\r\n]/g, ' ').slice(0, 200);
  const storedName = `${opts.phase}-${Date.now()}-${safeName}`;
  const created = await drive.files.create({
    requestBody: { name: storedName, parents: [folderId] },
    media: { mimeType: opts.file.type || 'application/octet-stream', body: Readable.from(buffer) },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });
  const fileId = created.data.id;
  if (!fileId) throw new Error('Drive upload returned no file id.');
  return {
    name: opts.file.name || storedName,
    driveFileId: fileId,
    url: created.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`,
  };
}
```

- [ ] **Step 2: Write the upload route**

Create `app/api/campus-living/housekeeping/bookings/[bookingId]/photos/route.ts`:

```ts
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isDriveConfigured } from '@/lib/google/drive-client';
import { uploadHousekeepingPhoto } from '@/lib/google/drive-upload';
import { learnerFacingError, logWithReference } from '@/lib/services/campus-living/error-sanitize';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 8 * 1024 * 1024;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  if (!isDriveConfigured()) {
    return NextResponse.json({ error: 'File storage is not configured.' }, { status: 503 });
  }

  const supabase = await createClient();
  // getUser(), never getSession(): getSession reads the cookie unverified.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { bookingId } = await params;

  const { data: booking, error: bookingErr } = await supabase
    .from('hostel_cleaning_bookings')
    .select('id, institution_id, status, booking_date, room:hostel_rooms(room_number), block:hostel_blocks(name)')
    .eq('id', bookingId)
    .maybeSingle();
  if (bookingErr || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  // First line of every mutation entry point. RLS re-validates on INSERT too;
  // this exists so we never upload to Drive before knowing the write is allowed.
  const { data: canExecute } = await supabase.rpc('user_has_permission', {
    permission_name: 'campus_living.housekeeping.execute',
  });
  if (!canExecute) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const form = await request.formData();
  const file = form.get('file');
  const phase = form.get('phase');

  if (!file || typeof file === 'string') {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }
  if (phase !== 'before' && phase !== 'after') {
    return NextResponse.json({ error: 'phase must be "before" or "after"' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json({ error: 'Only JPEG, PNG, and WebP images are supported.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File size must be under 8 MB.' }, { status: 400 });
  }

  // Ordering guard, enforced here as well as by the status-guarded update:
  // an "after" photo is meaningless without a "before" to compare it to.
  if (phase === 'after') {
    const { count, error: countErr } = await supabase
      .from('hostel_cleaning_booking_photos')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', bookingId)
      .eq('phase', 'before');
    if (countErr) {
      return NextResponse.json({ error: 'Could not verify the before photo.' }, { status: 500 });
    }
    if (!count) {
      return NextResponse.json(
        { error: 'Upload the before photo first.' },
        { status: 409 },
      );
    }
  }

  if (booking.status === 'completed' || booking.status === 'cancelled') {
    return NextResponse.json(
      { error: 'This booking is closed and no longer accepts photos.' },
      { status: 409 },
    );
  }

  try {
    const blockName = (booking as any).block?.name ?? 'Unknown Block';
    const roomNumber = (booking as any).room?.room_number ?? 'Unknown Room';

    const uploaded = await uploadHousekeepingPhoto({
      blockName,
      roomNumber,
      bookingDate: booking.booking_date as string,
      phase,
      file,
    });

    const { error: insertErr } = await supabase.from('hostel_cleaning_booking_photos').insert({
      booking_id: bookingId,
      institution_id: booking.institution_id,
      phase,
      drive_file_id: uploaded.driveFileId,
      drive_url: uploaded.url,
      file_name: uploaded.name,
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: user.id,
    });
    if (insertErr) {
      logWithReference('housekeeping/photo-insert', insertErr);
      return NextResponse.json({ error: learnerFacingError(insertErr) }, { status: 500 });
    }

    // Advance the status. Guarded on the current value, so a repeated upload
    // is idempotent and an out-of-order one changes nothing.
    const nextStatus = phase === 'before' ? 'in_progress' : 'awaiting_feedback';
    const requiredStatus = phase === 'before' ? 'assigned' : 'in_progress';
    const stamp = phase === 'before' ? 'started_at' : 'finished_at';

    const { error: statusErr } = await supabase
      .from('hostel_cleaning_bookings')
      .update({ status: nextStatus, [stamp]: new Date().toISOString() })
      .eq('id', bookingId)
      .eq('status', requiredStatus);
    if (statusErr) {
      logWithReference('housekeeping/photo-status', statusErr);
      return NextResponse.json({ error: learnerFacingError(statusErr) }, { status: 500 });
    }

    return NextResponse.json({ ok: true, phase, status: nextStatus });
  } catch (err) {
    logWithReference('housekeeping/photo-upload', err);
    return NextResponse.json({ error: learnerFacingError(err) }, { status: 500 });
  }
}
```

- [ ] **Step 3: Write the image proxy route**

Read the existing proxy first so the streaming details match:

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
cat "app/api/campus-living/rooms/[roomId]/condition-photos/[photoId]/image/route.ts"
```

Create `app/api/campus-living/housekeeping/photos/[photoId]/image/route.ts` following that file exactly, changing only:
- the table read to `hostel_cleaning_booking_photos` by `photoId`,
- the permission gate to `campus_living.housekeeping.view` **OR** the caller being allocated to the booking's room (roommates must see the evidence they are rating),
- the log scope to `housekeeping/photo-image`.

Keep its `Cache-Control` header exactly as the original sets it. **Never let a service worker cache an authenticated response** — the audit traced a cross-user data leak to exactly that.

- [ ] **Step 4: Verify Drive is configured before assuming the route works**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
grep -c "GOOGLE_" .env 2>/dev/null || echo "no .env match"
```

If Drive is not configured in this environment the route returns 503 by design. Note it and continue — Task 20's browser walk will confirm it end to end.

- [ ] **Step 5: Verify diagnostics and commit**

Run `mcp__ide__getDiagnostics` on all three files.

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
git add lib/google/drive-upload.ts "app/api/campus-living/housekeeping"
git commit -m "feat(campus-living): housekeeping photo upload and image proxy routes

Photos go to Drive, matching the room-condition-photos convention, so they
do not consume Supabase storage quota. Drive files are not link-shared, so an
authenticated proxy route streams the bytes.

The route refuses an after-photo when no before-photo exists and refuses both
on a closed booking, then advances the status guarded on its current value so
a repeated upload is idempotent.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Cleaning types page

**Files:**
- Create: `app/(routes)/campus-living/housekeeping/types/page.tsx`
- Create: `app/(routes)/campus-living/housekeeping/types/_components/cleaning-type-dialog.tsx`

**Interfaces:**
- Consumes: `useHousekeepingTypes`, `useCreateCleaningType`, `useUpdateCleaningType`, `useDeleteCleaningType` (Task 7); `useHostelCategories` (existing, `hooks/campus-living/use-hostel-categories.ts`); `expenseTotal` (Task 6).
- Produces: the route `/campus-living/housekeeping/types`, registered in nav by Task 19.

- [ ] **Step 1: Confirm the existing categories hook's shape before consuming it**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
grep -nE "export function|return useQuery|queryKey" hooks/campus-living/use-hostel-categories.ts | head -15
```

Use whatever hook name and return shape it actually exports. Categories are gender-split (12 rows: Classic/Deluxe/Deluxe Plus/Premium/Premium + AC/Premium Plus × boys/girls), so the picker groups by `type`.

- [ ] **Step 2: Write the dialog component**

Create `app/(routes)/campus-living/housekeeping/types/_components/cleaning-type-dialog.tsx`. It owns the create/edit form and must include, as real controls:

- `name` (required), `description`
- `duration_minutes` — a number input, minutes, 1–480. Helper text: *"Booking slots are generated at this length."*
- `usage_limit_count` + `usage_period` — rendered as one sentence: `Allowed [2] time(s) per [week ▾] per room`. The `per room` wording is not decorative: the quota is shared by roommates and learners misread it otherwise.
- `is_active`, `sort_order`
- **Room categories** — a checkbox group, grouped by boys/girls. Below it, when zero are checked, a visible destructive-tone warning: *"No room categories selected — no learner will be able to book this cleaning."* This mirrors the fail-closed junction and is the single easiest way to ship an invisible type by accident.
- **Expense lines** — a repeatable row editor (`item_name`, `unit`, `quantity`, `unit_cost_inr`) with an Add-line button, per-row delete, and a live total computed with `expenseTotal(...)` displayed as *"Expected cost per cleaning: ₹X"*. Explicitly label it *expected* — nobody is billed.

Use `react-hook-form` + `zod` per repo convention, and `DialogContent` inside a flex shell: **`DialogContent` has no max-height or overflow**, so a tall form runs off screen. The body needs `overflow-y-auto` and `min-h-0` **on the same element** — `min-h-0` alone does nothing and the root-scroll variant paints the body over the footer.

- [ ] **Step 3: Write the page**

Create `app/(routes)/campus-living/housekeeping/types/page.tsx` as a `'use client'` page following the campus-living convention (`ContentLayout` + `PageBreadcrumb`, the shared `DataTable` in client mode — the list is small and unpaginated).

Columns: Name, Duration, Quota (`2 / week`), Room categories (count + tooltip listing them, with a warning badge at zero), Expected cost, Active, row actions.

Permission gating uses the module idiom — default-open while loading, because `isSuperAdmin` reads `false` mid-load and would false-negative super admins out:

```tsx
const { can, isSuperAdmin, isLoading: permsLoading } = usePermissions();
const canManage = permsLoading || isSuperAdmin || can('campus_living.housekeeping.types_manage');
```

Gate the New button, the row actions column, and the dialog's save button on `canManage`. Hiding a button is UX only — the RLS policies from Task 3 are the actual wall.

Institution scope: use the existing campus-living institution picker; pass the selected id (or `undefined` for all) straight through. **Never branch on `isSuperAdmin` to decide scope.**

- [ ] **Step 4: Verify in the browser as a Warden**

Start the app if it is not running (`npm run dev`), sign in as a Warden, and open `/campus-living/housekeeping/types`.

Confirm: the page renders, New opens the dialog, a type with zero categories shows the warning, the expense total updates live as lines change, and saving succeeds.

> If `localhost:3000` shows a different project's UI, a stale service worker has hijacked the shared origin. Verify via `127.0.0.1:3000` or unregister the SW.

- [ ] **Step 5: Verify diagnostics and commit**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
git add "app/(routes)/campus-living/housekeeping/types"
git commit -m "feat(campus-living): cleaning types page

The category picker warns loudly at zero selections: an empty junction means
nobody can book the type, which is the easiest way to ship an invisible one.

Quota reads 'per room', not 'per learner' - roommates share it, and the
wording is the only place a learner learns that.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Cleaner directory page

**Files:**
- Create: `app/(routes)/campus-living/housekeeping/cleaners/page.tsx`
- Create: `app/(routes)/campus-living/housekeeping/cleaners/_components/cleaner-dialog.tsx`

**Interfaces:**
- Consumes: `useHousekeepingCleaners`, `useCreateCleaner`, `useUpdateCleaner`, `useDeleteCleaner` (Task 8); the existing `useHostelBlocks` hook.
- Produces: the route `/campus-living/housekeeping/cleaners`.

- [ ] **Step 1: Write the dialog**

Create `_components/cleaner-dialog.tsx` with: `full_name` (required), `phone`, `gender` (`Male` / `Female` / `Other` — the repo's canonical domain, and it matches the DB CHECK), `employee_code`, `shift_start`/`shift_end`, `is_active`, `notes`, a **blocks** multi-select, and a **working days** toggle group.

The working-days control must map to **Postgres DOW: 0 = Sunday … 6 = Saturday**. Render labels Mon–Sun for readability but store the DOW numbers, and put that mapping in a comment — an off-by-one here silently makes cleaners un-assignable on the wrong day, which surfaces only as `cleaner_not_working` from the RPC.

Warn when zero blocks are selected: *"Assign at least one block, or this cleaner cannot be given any job."*

- [ ] **Step 2: Write the page**

Client page, `ContentLayout` + `PageBreadcrumb` + `DataTable` in client mode. Columns: Name, Phone, Gender, Blocks (count + names), Working days (Mon–Sun chips), Shift, Active, row actions.

Include an "Show inactive" toggle wired to the hook's `includeInactive` argument — cleaners are deactivated rather than deleted once they appear in history, so the default list hides them.

Gate on `campus_living.housekeeping.cleaners_manage` with the same default-open-while-loading idiom as Task 13.

- [ ] **Step 3: Verify in the browser as a Warden, then commit**

Add a cleaner, confirm the working-day chips match what you selected, deactivate them, confirm they disappear from the default list and return with "Show inactive".

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
git add "app/(routes)/campus-living/housekeeping/cleaners"
git commit -m "feat(campus-living): cleaner directory page

Working days are stored as Postgres DOW (0=Sunday) while rendering Mon-Sun
labels; an off-by-one here surfaces only as cleaner_not_working from the
assign RPC, so the mapping is commented at the control.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 15: Availability page

Replaces the deleted settings page, and carries the two surviving policy knobs.

**Files:**
- Create: `app/(routes)/campus-living/housekeeping/availability/page.tsx`

**Interfaces:**
- Consumes: `useBlockAvailability`, `useUpsertAvailability`, `useHousekeepingPolicies`, `useSaveHousekeepingPolicy` (Task 9); the existing `BlockSelector` component (`@/components/campus-living/block-selector`).
- Produces: the route `/campus-living/housekeeping/availability`.

- [ ] **Step 1: Write the page**

A block selector, then a seven-row weekday grid (Sunday first, matching DOW 0), each row: Open toggle, window start, window end, capacity, Save.

Above the grid, a short explainer — the relationship is not obvious and getting it wrong produces an empty slot list the warden cannot explain:

> Slots are generated from this window at the length of whichever cleaning type the learner picks. A 09:00–17:00 window offers sixteen 30-minute slots, or five 90-minute slots. Capacity is how many cleanings can run **at the same time** in this block.

Below the grid, the two policy knobs in the established Campus Living settings shape (load → draft → dirty-diff → per-row isolated save → live consequences panel), the same pattern `choose-your-menu` and `bed-economics` use:

- `housekeeping.booking_enabled` — a switch. Consequence copy: *"Off: learners cannot book any cleaning. Existing bookings are unaffected."*
- `housekeeping.booking_advance_days` — a number. Consequence copy: *"Learners can book up to N days ahead."*

Gate the grid on `campus_living.housekeeping.availability_manage`.

- [ ] **Step 2: Verify the window/duration relationship really holds**

Set a block to Mon 09:00–17:00, capacity 2. Then via `mcp__supabase__execute_sql`, using a real room in that block and the two types you created in Task 13:

```sql
SELECT jsonb_array_length(
  (fn_cl_housekeeping_slots(
     (SELECT r.id FROM hostel_rooms r
       JOIN hostel_cleaning_availability av ON av.block_id = r.block_id
      WHERE av.is_open LIMIT 1),
     (SELECT id FROM hostel_cleaning_types WHERE duration_minutes = 30 LIMIT 1),
     (SELECT min(d)::date FROM generate_series(current_date, current_date + 7, '1 day') d
       WHERE EXTRACT(DOW FROM d) = 1)
   ))->'slots') AS thirty_minute_slots;
```

Expected: `16` for a 09:00–17:00 window with a 30-minute type. A different number means the stepping loop in `fn_cl_housekeeping_slots` is wrong.

- [ ] **Step 3: Commit**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
git add "app/(routes)/campus-living/housekeeping/availability"
git commit -m "feat(campus-living): housekeeping availability page

Per-block weekday windows plus the two surviving policy knobs, which is what
lets the separate housekeeping settings page stay deleted.

Explains the window/duration/capacity relationship inline: it is not obvious,
and getting it wrong produces an empty slot list with no error to explain it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 16: Warden day board and holds page

The module's main screen.

**Files:**
- Create: `app/(routes)/campus-living/housekeeping/page.tsx`
- Create: `app/(routes)/campus-living/housekeeping/_components/booking-card.tsx`
- Create: `app/(routes)/campus-living/housekeeping/_components/assign-cleaner-dialog.tsx`
- Create: `app/(routes)/campus-living/housekeeping/_components/photo-upload-button.tsx`
- Create: `app/(routes)/campus-living/housekeeping/_components/waive-hold-dialog.tsx`
- Create: `app/(routes)/campus-living/housekeeping/holds/page.tsx`

**Interfaces:**
- Consumes: `useDayBoard`, `useAssignCleaner`, `useWaiveHold`, `useBookingPhotos`, `useCancelBooking` (Task 10); `useAssignableCleaners` (Task 8); `useFeedbackHolds` (Task 11); the photo routes (Task 12).
- Produces: the routes `/campus-living/housekeeping` and `/campus-living/housekeeping/holds`.

- [ ] **Step 1: Write `booking-card.tsx`**

One card per booking, readable on a phone in a corridor:

```
09:30  B-112  Room Cleaning              45 min
       Cleaner: Lakshmi              [Reassign]
       📷 Before ✓   After —         [Upload after]
       ⭐ Awaiting feedback (due today)
```

State-driven affordances:
- `booked` → **Assign** button (gated on `.assign`)
- `assigned` → **Upload before** (gated on `.execute`)
- `in_progress` → **Upload after** (gated on `.execute`)
- `awaiting_feedback` → rating-pending badge; **Waive** appears only once `booking_date < today` (gated on `.waive`)
- `completed` → the star rating and comment
- `cancelled` → muted, with the reason

Thumbnails come from `/api/campus-living/housekeeping/photos/<id>/image`, never from `drive_url` — Drive files are not link-shared and the raw URL renders broken.

- [ ] **Step 2: Write `assign-cleaner-dialog.tsx`**

Lists only `useAssignableCleaners(blockId, bookingDate)` — cleaners who serve the block and work that weekday, mirroring the RPC's checks so the picker never offers someone the RPC then refuses. Show phone alongside the name. Include a **Clear assignment** action calling `assign(bookingId, null, true)`.

Empty state must be actionable, not blank: *"No cleaner serves this block on this day. Add one under Cleaners, or change their working days."*

- [ ] **Step 3: Write `photo-upload-button.tsx`**

A file input posting `multipart/form-data` (`file`, `phase`) to `/api/campus-living/housekeeping/bookings/<id>/photos`, with `capture="environment"` so a phone opens the camera. On success invalidate `housekeepingBookingKeys.all`. Surface the route's own error text on 4xx — it already carries actionable copy such as *"Upload the before photo first."*

- [ ] **Step 4: Write `waive-hold-dialog.tsx`**

A **mandatory** reason textarea (the DB CHECK enforces it too) plus explicit consequence copy:

> Waiving releases attendance for everyone in this room without a rating. The booking stays marked as never rated, and your name and reason are recorded.

Disable the confirm button while the reason is blank.

- [ ] **Step 5: Write the day board page**

Client page: date arrows (‹ Today ›) plus a date picker, an institution picker, and a `BlockSelector`. Group cards by block, ordered by `slot_start`.

A summary strip at the top: counts of Unassigned / In progress / Awaiting feedback / Completed for the day. **Unassigned is the number that matters** — an unassigned booking whose slot has passed is the module's main failure mode, so render those cards with a destructive-tone border.

Empty state: *"No cleanings booked for this day."*

- [ ] **Step 6: Write the holds page**

`/campus-living/housekeeping/holds` lists every room currently blocking attendance, from `useFeedbackHolds`. Columns: Block, Room, Cleaning, Date finished, Days overdue, Learners affected (count), and a Waive action.

Order by days overdue, descending — the oldest holds are the ones stranding real attendance records.

Empty state: *"No rooms are blocking attendance."*

- [ ] **Step 7: Verify in the browser as a Warden**

With a booking created (use the learner page from Task 17, or insert one via SQL), walk: assign a cleaner → upload before → upload after → confirm the card reaches "Awaiting feedback" and the holds page lists it the following day.

- [ ] **Step 8: Commit**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
git add "app/(routes)/campus-living/housekeeping"
git commit -m "feat(campus-living): warden day board and attendance holds page

One card per booking with state-driven affordances, sized for a phone in a
corridor. Unassigned bookings whose slot has passed are rendered destructive:
that is the module's main failure mode.

Thumbnails go through the authenticated image proxy, never drive_url - Drive
files are not link-shared and the raw URL renders broken.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 17: Learner booking page and My Hostel entry card

**Files:**
- Create: `app/(routes)/campus-living/my-hostel/housekeeping/page.tsx`
- Create: `app/(routes)/campus-living/my-hostel/housekeeping/_components/type-picker.tsx`
- Create: `app/(routes)/campus-living/my-hostel/housekeeping/_components/slot-grid.tsx`
- Create: `app/(routes)/campus-living/my-hostel/housekeeping/_components/rate-cleaning-card.tsx`
- Create: `app/(routes)/campus-living/my-hostel/_components/room-cleaning-entry-card.tsx`
- Modify: `app/(routes)/campus-living/my-hostel/page.tsx` (mount the entry card)

**Interfaces:**
- Consumes: `useBookableTypes` (Task 7), `useSlotGrid`, `useBookSlot`, `useMyBookings`, `useCancelBooking`, `useSubmitFeedback` (Task 10), `canLearnerCancel` + `quotaWindowStart` (Task 6), the existing `useMyHostel` hook for the learner's allocation.
- Produces: the route `/campus-living/my-hostel/housekeeping`.

- [ ] **Step 1: Resolve the learner's room the way the rest of My Hostel does**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
grep -nE "export function use|room_id|allocation" hooks/campus-living/use-my-hostel.ts | head -20
```

Use that hook's existing shape. **Do not fetch the profile independently on mount** — that races the auth provider and bounces super admins to `/unauthorized`.

- [ ] **Step 2: Write `type-picker.tsx`**

Cards for each type from `useBookableTypes(roomId)`, showing name, duration, and remaining quota. Compute remaining client-side from `useMyBookings` using `quotaWindowStart(today, type.usage_period)`: count this room's non-cancelled bookings of that type inside the window, subtract from `usage_limit_count`.

Label it *"2 of 2 left this week — shared with your roommates."* The sharing is the part learners get wrong.

A type at zero remaining renders disabled with *"Your room has used this week's bookings."* The RPC is still the authority; this only avoids a pointless round trip.

- [ ] **Step 3: Write `slot-grid.tsx`**

A horizontal date strip (today → `booking_advance_days`), then the slot buttons from `useSlotGrid(roomId, typeId, date)`.

Handle all three shapes the RPC returns:
- `open: false` → the reason as a friendly line, via `bookingErrorMessage`
- `open: true, slots: []` → *"No slots fit a N-minute cleaning in this day's window."*
- otherwise → buttons, with `is_bookable: false` disabled and its `reason` as a tooltip (`slot_full` → "Taken", `past` → "Already passed")

- [ ] **Step 4: Write `rate-cleaning-card.tsx`**

Shown for any booking in `awaiting_feedback`. A 1–5 star control plus an optional comment, and copy that states the stake plainly:

> Rate this cleaning to close it. Until someone in your room does, hostel attendance is on hold for all of you.

Once overdue (`booking_date < today`), escalate the tone to destructive and name the consequence as current, not pending.

Show the before/after photos through the image proxy so the rating is informed.

- [ ] **Step 5: Write the page**

Sections in order: **Rate a cleaning** (only when one awaits feedback — it is the most urgent thing), **Book a cleaning** (type picker → date strip → slot grid → confirm dialog showing type, date, slot and duration), **Your bookings** (upcoming and recent, with Cancel where `canLearnerCancel(status)`).

Room-locked state is its own message, not a generic failure: *"A cleaning is already booked for your room on <date> at <time>. Only one at a time."*

- [ ] **Step 6: Rebuild the My Hostel entry card**

Recreate `room-cleaning-entry-card.tsx` keeping the old module's best idea — **render `null` when `useBookableTypes(roomId)` returns empty**, so the card never advertises a feature the next page refuses. When types exist, show the count, any pending rating as a badge, and link to `/campus-living/my-hostel/housekeeping`. Mount it in `my-hostel/page.tsx` where the old one sat.

- [ ] **Step 7: Verify in the browser as a Student**

Sign in as a learner in a **Premium** room: the eligible type appears, a slot books, the quota decrements, a second booking is refused with the room-locked message. Then as a learner in a **Classic** room (not in the type's categories): the type does not appear and the entry card renders nothing.

- [ ] **Step 8: Commit**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
git add "app/(routes)/campus-living/my-hostel"
git commit -m "feat(campus-living): learner cleaning booking and rating page

Quota is labelled 'shared with your roommates' because that is the part
learners misread, and the rating card names the consequence plainly: until
someone rates, attendance is on hold for the whole room.

The My Hostel entry card renders null when no type is bookable for the room's
category, keeping the old module's rule that we never advertise a feature the
next page refuses.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

# Phase F — Integration and verification

## Task 18: Wire the hold into hostel attendance

The one place this module reaches into another. The trigger from Task 4 is already the wall; this task makes the wall *explicable* instead of a raw database error.

**Files:**
- Modify: `lib/services/campus-living/hostel-attendance-service.ts` (`getMarkableResidents` ~line 106, `bulkMarkAttendance` ~line 429)
- Modify: `app/(routes)/campus-living/attendance/mark/page.tsx`
- Modify: `app/(routes)/campus-living/attendance/mark/_components/bulk-action-bar.tsx`

**Interfaces:**
- Consumes: `HousekeepingFeedbackGate.holdsByLearner` (Task 11), `holdMessage` (Task 6).
- Produces: a `feedback_hold: FeedbackHold | null` field on each row returned by `getMarkableResidents`.

- [ ] **Step 1: Read the current shape before changing it**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
sed -n '100,175p' lib/services/campus-living/hostel-attendance-service.ts
sed -n '425,455p' lib/services/campus-living/hostel-attendance-service.ts
```

Note the exact return type of `getMarkableResidents` and the payload shape `bulkMarkAttendance` takes. The edits below extend them; they must not change any existing field.

- [ ] **Step 2: Add the hold lookup to `getMarkableResidents`**

Import at the top of the service:

```ts
import { HousekeepingFeedbackGate } from './housekeeping-feedback-gate';
import type { FeedbackHold } from '@/types/campus-living/housekeeping';
```

Then, after the resident roster has been assembled and before returning it, attach the hold. The date argument matters: a hold applies to the date being marked, not to today.

```ts
    // Housekeeping feedback holds. Computed live — a room whose cleaning
    // finished and went unrated blocks attendance for everyone in it from the
    // NEXT day, and the block lifts the instant any roommate rates.
    //
    // This is UX: the BEFORE trigger on hostel_attendance is the actual wall.
    // We look it up here so the warden sees WHY a learner cannot be marked,
    // instead of a raw check_violation from the database.
    const holds = await HousekeepingFeedbackGate.holdsByLearner(
      institutionId,
      blockId,
      date,
    );

    return residents.map((r) => ({
      ...r,
      feedback_hold: holds.get(r.learner_id) ?? null,
    }));
```

If `getMarkableResidents` does not currently accept the marking `date`, add it as an optional trailing parameter and pass it from the page. Do not reorder existing parameters.

- [ ] **Step 3: Pre-filter held learners out of bulk marking**

`bulkMarkAttendance` inserts many rows at once. One held learner would make the whole batch fail, so filter first and report what was skipped:

```ts
  static async bulkMarkAttendance(records: CreateHostelAttendanceDTO[]) {
    if (records.length === 0) return { inserted: 0, skipped: [] as FeedbackHold[] };

    // The trigger would reject the WHOLE batch for one held learner, so drop
    // them here and tell the caller. The trigger still guards every other path.
    const date = records[0].date;
    const holds = await HousekeepingFeedbackGate.holdsByLearner(
      records[0].institution_id,
      undefined,
      date,
    );

    const allowed = records.filter((r) => !holds.has(r.learner_id));
    const skipped = records
      .filter((r) => holds.has(r.learner_id))
      .map((r) => holds.get(r.learner_id) as FeedbackHold);

    if (allowed.length === 0) return { inserted: 0, skipped };

    // ...the existing insert, using `allowed` instead of `records`, keeping
    // the existing { error } destructure and check exactly as it is...

    return { inserted: allowed.length, skipped };
  }
```

Update every caller of `bulkMarkAttendance` to handle the new return shape. Find them:

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
grep -rn "bulkMarkAttendance" --include=*.ts --include=*.tsx app lib hooks
```

- [ ] **Step 4: Render the hold on the mark page**

In `app/(routes)/campus-living/attendance/mark/page.tsx`, for a resident with `feedback_hold`:

- disable the Present/Absent controls for that row
- render `holdMessage(hold)` in place of them, in destructive tone
- link the message to `/campus-living/housekeeping/holds` so a warden can act
- exclude the row from "select all" and from the bulk action bar's count

In `_components/bulk-action-bar.tsx`, when a bulk mark returns `skipped.length > 0`, surface it rather than silently marking fewer people:

```tsx
toast.warning(
  `${result.inserted} marked. ${result.skipped.length} skipped — housekeeping feedback pending for their rooms.`,
);
```

- [ ] **Step 5: Verify the whole loop against the database**

Confirm the service and the trigger agree — a learner the UI blocks must be the same learner the trigger rejects. Via `mcp__supabase__execute_sql`:

```sql
SELECT learner_id, room_id, type_name, booking_date
FROM fn_cl_housekeeping_feedback_holds(NULL, NULL, current_date);
```

Cross-check that every `learner_id` listed here shows the blocked state on the mark page for today, and that nobody else does.

- [ ] **Step 6: Verify diagnostics and commit**

Run `mcp__ide__getDiagnostics` on all three modified files.

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
git add lib/services/campus-living/hostel-attendance-service.ts "app/(routes)/campus-living/attendance"
git commit -m "feat(campus-living): surface housekeeping feedback holds on attendance marking

The BEFORE trigger on hostel_attendance is the wall; this makes it
explicable. Held learners render a reason and a link to the holds page
instead of failing with a raw check_violation.

Bulk marking pre-filters held learners and reports the count skipped - one
held learner would otherwise fail the entire batch for a whole block.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 19: Navigation, guide content, and the notification rule

Wiring the module back into the app. A permission namespace touches four layers that must move together — nav, UI guards, RLS, and RPCs. Tasks 3–5 did the last two; this does the first two.

**Files:**
- Modify: `app/(routes)/campus-living/nav-config.ts`
- Modify: `lib/sidebarMenuLink.ts`
- Modify: `lib/campus-living/guide/content.ts`
- Modify: `lib/services/campus-living/hostel-notification-rules-service.ts`

**Interfaces:**
- Consumes: the routes from Tasks 13–17 and the keys from Task 5.
- Produces: nav entries and `npm run check:menus` passing.

- [ ] **Step 1: Add the nav entries**

In `nav-config.ts`, restore a Housekeeping group where the old one sat (~line 321), with five children:

| Label | href |
|---|---|
| Housekeeping | `/campus-living/housekeeping` |
| Cleaning Types | `/campus-living/housekeeping/types` |
| Cleaners | `/campus-living/housekeeping/cleaners` |
| Availability | `/campus-living/housekeeping/availability` |
| Attendance Holds | `/campus-living/housekeeping/holds` |

And under My Hostel (~line 32), restore the learner entry:

```ts
{ label: 'Room Cleaning', icon: 'Brush', href: '/campus-living/my-hostel/housekeeping', matchPaths: ['/campus-living/my-hostel/housekeeping'] },
```

Do **not** re-add a Housekeeping entry under Settings — the knobs now live on the Availability page.

- [ ] **Step 2: Map each route to its permission key**

In `lib/sidebarMenuLink.ts`, where the old three entries sat (~line 1317):

```ts
  '/campus-living/housekeeping': 'campus_living.housekeeping.view',
  '/campus-living/housekeeping/types': 'campus_living.housekeeping.types_manage',
  '/campus-living/housekeeping/cleaners': 'campus_living.housekeeping.cleaners_manage',
  '/campus-living/housekeeping/availability': 'campus_living.housekeeping.availability_manage',
  '/campus-living/housekeeping/holds': 'campus_living.housekeeping.view',
```

The learner route takes no key — access is having an allocation.

- [ ] **Step 3: Rewrite the Smart Guide entries**

In `lib/campus-living/guide/content.ts`, restore a resident step where the old `id: 'cleaning'` step was:

```ts
        {
          id: 'cleaning',
          title: 'Book room cleaning',
          steps: [
            {
              action: 'Open **Room Cleaning**, pick a cleaning type, then a date and time slot.',
              detail:
                'Your room shares a limit for each cleaning type, so a booking uses one of your room\'s turns, not just yours. Only one cleaning can be live for a room at a time.',
              link: { label: 'Open Room Cleaning', href: '/campus-living/my-hostel/housekeeping' },
            },
            {
              action: 'After the cleaning, rate it.',
              detail:
                'Any one of you can rate it, and that closes the job for the whole room. Until someone does, hostel attendance is on hold for everyone in the room.',
            },
          ],
        },
```

And a warden lane entry pointing at `/campus-living/housekeeping` describing the day board, replacing the deleted settings-lane bullet. Leave the line-31 comment as Task 1 corrected it — housekeeping is no longer a super-admin settings page.

- [ ] **Step 4: Add the notification rule**

In `hostel-notification-rules-service.ts`, register a rule fired when a booking enters `awaiting_feedback`, targeting every learner allocated to the room:

- Title: `Rate your room cleaning`
- Body: `<Type name> was completed today. Rate it before midnight — until someone in your room does, hostel attendance is on hold for all of you.`
- Link: `/campus-living/my-hostel/housekeeping`

Follow whatever registration shape that file already uses; read it first rather than inventing one:

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
sed -n '1,60p' lib/services/campus-living/hostel-notification-rules-service.ts
```

Fire it from the photo route (Task 12) at the point the status becomes `awaiting_feedback`. **A block nobody was warned about is just a mystery** — this notification is what makes the gate fair.

- [ ] **Step 5: Regenerate routes and run the gates**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
npm run gen:routes && npm run check:menus
```

Expected: both pass. `check:audit-coverage` requires every module to appear in the permissions audit — if it fails on a new key, the catalog entry from Task 5 Step 6 is missing or misspelled.

- [ ] **Step 6: Confirm nav and catalog agree**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
grep -o "campus_living\.housekeeping\.[a-z_]*" lib/sidebarMenuLink.ts | sort -u
grep -o "campus_living\.housekeeping\.[a-z_]*" lib/constants/permissions.ts | sort -u
```

Every key in `sidebarMenuLink.ts` must exist in `permissions.ts`. A nav entry gated on a key that does not exist renders the page permanently invisible, with no error.

- [ ] **Step 7: Commit**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
git add "app/(routes)/campus-living/nav-config.ts" lib/sidebarMenuLink.ts \
        lib/campus-living/guide/content.ts \
        lib/services/campus-living/hostel-notification-rules-service.ts \
        lib/navigation/route-manifest.generated.ts
git commit -m "feat(campus-living): housekeeping navigation, guide content, and feedback notification

Five warden routes plus the learner entry, each mapped to its permission key.
No Settings entry: the two surviving knobs live on the Availability page.

Learners are notified the evening a cleaning finishes, before the attendance
hold lands next morning - a block nobody was warned about is just a mystery.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 20: End-to-end acceptance

Nothing here is optional. Every silent-failure class in this stack — empty tables, dropped rows, 302 redirects, permission gaps — only shows up when a real restricted user drives a browser. **Do not perform this walk as a super admin**; a super-admin session hides every permission bug in the module.

**Files:** none created. This task produces evidence.

- [ ] **Step 1: Confirm the database is clean before testing**

```sql
SELECT
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname LIKE 'hostel_clean%' AND NOT c.relrowsecurity) AS tables_without_rls,
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'fn_cl_housekeeping%'
      AND has_function_privilege('anon', p.oid, 'EXECUTE'))                    AS anon_callable_rpcs,
  (SELECT count(*) FROM hostel_cleaning_types WHERE name LIKE '\_\_%')          AS leftover_probes;
```

Expected: `0, 0, 0`. Also run `mcp__supabase__get_advisors` (security) and confirm zero ERROR-level findings on any `hostel_clean*` object.

- [ ] **Step 2: Run the unit tests and the gates**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
npx vitest run __tests__/campus-living/
npm run gen:routes && npm run check:menus
npm run lint
```

Expected: tests pass, gates pass. Record any pre-existing lint warnings unrelated to this module rather than fixing them here.

- [ ] **Step 3: The acceptance walk — as a Warden**

Sign in as a user holding the **Warden** role (not super admin).

1. `/campus-living/housekeeping/types` → create **Toilet Cleaning**: 30 min, 2 per week, three expense lines, **Premium** categories only. Confirm the expected-cost total is right.
2. Create a second type, **Deep Cleaning**: 90 min, 1 per month, Premium only. Confirm both types coexist with different quotas.
3. `/campus-living/housekeeping/cleaners` → add a cleaner serving a girls' block, working Mon–Sat.
4. `/campus-living/housekeeping/availability` → set that block Mon–Sat 09:00–17:00, capacity 2, Sunday closed.

- [ ] **Step 4: The acceptance walk — as a Student in a Premium room**

Sign in as a learner allocated to a **Premium** room in that block.

5. `/campus-living/my-hostel` → the Room Cleaning card is visible.
6. Open it → Toilet Cleaning shows *"2 of 2 left this week"*; slots appear at **30-minute** intervals. Pick Deep Cleaning → slots become **90-minute**. This proves slot length follows the type.
7. Book a Toilet Cleaning slot for **today**. Confirm success and that the quota now reads 1 of 2.

- [ ] **Step 5: The room lock, as a second Student**

8. Sign in as a **different learner in the same room**. The booking is visible (RLS lets roommates see it) and attempting to book anything returns *"A roommate already has a cleaning booked for your room."*

- [ ] **Step 6: Eligibility, as a Student in a Classic room**

9. Sign in as a learner in a **Classic** room. Neither type appears, and the My Hostel entry card renders **nothing at all** — not an empty page.

- [ ] **Step 7: Execution, back as the Warden**

10. `/campus-living/housekeeping` → the day board shows the booking as **unassigned**.
11. Assign the cleaner. Confirm the picker offers only cleaners serving that block on that weekday.
12. Upload a **before** photo → status becomes In progress, thumbnail renders (through the proxy, not `drive_url`).
13. Try to upload an **after** photo on a *different* booking that has no before photo → refused with *"Upload the before photo first."*
14. Upload the **after** photo on the real booking → status becomes Awaiting feedback. Confirm the learners received the notification.

- [ ] **Step 8: Same-day attendance is unaffected**

15. `/campus-living/attendance/mark` for **today** → the room's learners can be marked normally. The hold starts tomorrow, not now.

- [ ] **Step 9: The hold — the critical assertion**

Move the booking into yesterday so the hold applies, via `mcp__supabase__execute_sql`:

```sql
UPDATE hostel_cleaning_bookings
SET booking_date = current_date - 1
WHERE status = 'awaiting_feedback' AND type_name = 'Toilet Cleaning';
```

16. Reload `/campus-living/attendance/mark` → **every learner in that room** is blocked, showing *"Housekeeping feedback pending — Toilet Cleaning on <date>"*, with the controls disabled and a link to the holds page.
17. Select-all excludes them; a bulk mark reports *"N marked. M skipped — housekeeping feedback pending."*
18. `/campus-living/housekeeping/holds` lists the room with its days overdue.
19. Confirm the trigger is the real wall, not just the UI — attempt a direct write:

```sql
INSERT INTO hostel_attendance (institution_id, learner_id, block_id, date, evening_status)
SELECT b.institution_id, a.learner_id, b.block_id, current_date, 'present'
FROM hostel_cleaning_bookings b
JOIN hostel_allocations a ON a.room_id = b.room_id
WHERE b.status = 'awaiting_feedback' AND a.status::text = ANY (fn_cl_roster_statuses())
LIMIT 1;
```

Expected: **rejected** with the housekeeping message. If this insert succeeds, the gate is decorative — stop and fix before shipping.

- [ ] **Step 10: Release by rating, as a Student**

20. As **either** roommate, open Room Cleaning → the Rate card is present and overdue-toned. Submit 4 stars with a comment.
21. Confirm the booking becomes **Completed**.
22. Reload `/campus-living/attendance/mark` → **all** roommates are markable again, immediately. Mark one to prove it.
23. `/campus-living/housekeeping/holds` no longer lists the room.

- [ ] **Step 11: The waive valve, as the Warden**

24. Create a second unrated overdue booking on a different room. Confirm it blocks.
25. Waive it with a reason. Confirm attendance releases for that room, the reason is stored, and the booking still reads as never rated:

```sql
SELECT id, status, waived_by, waive_reason,
       (SELECT count(*) FROM hostel_cleaning_feedback f WHERE f.booking_id = b.id) AS ratings
FROM hostel_cleaning_bookings b WHERE waived_at IS NOT NULL;
```

Expected: `status = 'awaiting_feedback'`, a non-null reason, `ratings = 0`. A waive releases attendance; it does not fake a rating.

- [ ] **Step 12: Cancellation and quota refund**

26. As a learner, book again, then cancel it while unassigned → succeeds, and the quota returns to 2 of 2.
27. Book again, have the warden assign a cleaner, then try to cancel as the learner → refused with *"A cleaner is already on the way."*

- [ ] **Step 13: Clean up the test data**

```sql
DELETE FROM hostel_cleaning_feedback WHERE booking_id IN
  (SELECT id FROM hostel_cleaning_bookings WHERE type_name IN ('Toilet Cleaning','Deep Cleaning'));
DELETE FROM hostel_cleaning_booking_photos WHERE booking_id IN
  (SELECT id FROM hostel_cleaning_bookings WHERE type_name IN ('Toilet Cleaning','Deep Cleaning'));
DELETE FROM hostel_attendance WHERE date = current_date AND marked_by IS NULL;
DELETE FROM hostel_cleaning_bookings WHERE type_name IN ('Toilet Cleaning','Deep Cleaning');
```

Keep the cleaning types, the cleaner and the availability rows if the institution wants them; delete them otherwise. **Do not delete real attendance records** — narrow the `hostel_attendance` delete to exactly the rows the walk created.

- [ ] **Step 14: Report honestly**

Write a short summary naming: which steps passed, which were skipped and why (for example, Drive not configured in this environment), and anything observed but not fixed. Do not report success for a step that was not actually run — a silent-failure stack is only proven by data rendering for a restricted role.

- [ ] **Step 15: Final commit**

```bash
export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"
cd "D:/Projects/MyJKKN"
git status
git add -A
git commit -m "test(campus-living): housekeeping rebuild verified end to end

Walked as Warden and as Student, never as super admin. Confirmed: slot length
follows the cleaning type, the room lock refuses a roommate's second booking,
an ineligible room category sees nothing at all, an after-photo is refused
without a before-photo, the attendance hold starts the next day and blocks
every roommate, a direct SQL insert is rejected by the trigger, one rating
releases the whole room immediately, and a waive releases attendance without
faking a rating.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

# Appendix — Plan self-review

Run against the spec after writing, per the writing-plans skill.

**1. Spec coverage.** Every spec section maps to a task:

| Spec § | Task |
|---|---|
| §1.1 learner_id id-space fix | 3 (schema), 11 (gate comment) |
| §2.1 database removal | 2 |
| §2.2 files deleted | 1 |
| §2.3 files edited | 1, 19 |
| §3.1 config tables | 3 |
| §3.2 operational tables | 3 |
| §4 lifecycle + transition rules | 4 (RPCs), 10 (status guards), 12 (photo ordering) |
| §5.1 eligibility by room category | 4 (book RPC step 4), 7 (`listBookableTypesForRoom`) |
| §5.2 quota | 4 (book RPC step 6), 6 (`quotaWindowStart`) |
| §5.3 feedback→attendance hold | 4 (fn + trigger), 11 (gate), 18 (attendance wiring) |
| §5.4 waive valve | 3 (columns), 10 (`waiveHold`), 16 (dialog) |
| §5.5 notification | 19 |
| §6 slot generation | 4 (`fn_cl_housekeeping_slots`), 15 (verification), 17 (grid) |
| §7 permissions | 5 |
| §8 RLS + RPC discipline | 3 (policies), 4 (grants/revokes) |
| §9.1 warden surfaces | 13, 14, 15, 16 |
| §9.2 learner surface | 17 |
| §9.3 photos | 12 |
| §10 code conventions | Global Constraints; applied in 7–11 |
| §11 migration sequence | 2, 3, 4, 5 |
| §12 verification | 20 |
| §13 decisions on record | reflected throughout |

No gaps.

**2. Placeholder scan.** No "TBD", "TODO", "implement later", "add appropriate error handling", or "similar to Task N". Tasks 13–17 describe UI in prose plus exact required controls, copy and gating rather than full TSX — deliberate, because those files exceed the useful size of a plan listing and the repo's own page conventions govern their shape. Every non-obvious behaviour in them (the zero-category warning, the DOW mapping, the `min-h-0` + `overflow-y-auto` pairing, proxy-not-`drive_url`, the null-rendering entry card) is stated explicitly.

**3. Type consistency.** Checked across tasks:
- `FeedbackHold` — defined Task 6, produced by Task 11, consumed by Task 18. Fields match `fn_cl_housekeeping_feedback_holds`'s `RETURNS TABLE` exactly.
- `BookResult` / `CancelResult` / `AssignResult` / `SlotGridResult` — defined Task 6, returned by Task 10, matching each RPC's `jsonb_build_object` keys.
- `housekeepingBookingKeys.holds` (Task 10) and `housekeepingHoldKeys.list` (Task 11) are distinct namespaces; `invalidateBookingSurfaces` invalidates `housekeepingBookingKeys.all` and `['hostel-attendance']`. **Note for the executor:** it does *not* invalidate `housekeepingHoldKeys` — add that invalidation in Task 16 when the holds page is built, or a waive will not refresh that page.
- `isLiveStatus` (Task 6) lists exactly the four statuses in `ux_hk_one_live_booking_per_room` (Task 3).
- `quotaWindowStart` (Task 6) matches the `CASE` in `fn_cl_housekeeping_book` (Task 4): 0 / 6 / 29 days back.
- `HOUSEKEEPING_POLICY_KEYS` (Task 9) contains exactly the two rows Task 2 preserved.
- Permission key strings are identical across Task 3 policies, Task 4 RPCs, Task 5 grants and catalog, and Task 19 nav — all eight.
