# Course Events — Phase 2a (Course CRUD + Nav) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the admin surface for course events — list, create, view, edit, delete — wired into the sidebar and passing every nav gate, so Phases 2b (packages) and 2c (sessions/venue) have a working chassis to hang off.

**Architecture:** The house four-layer stack, no deviations: page (`'use client'`) → React Query hook → static service class → Supabase with RLS. Phase 1's schema and permissions are already on `main`; this phase writes no migrations.

**Tech Stack:** Next.js 16 App Router, React 19, TanStack Query v5, Shadcn UI + Tailwind, react-hook-form + Zod, TypeScript (strict OFF).

**Spec:** `docs/superpowers/specs/2026-08-13-course-events-design.md` — read §7.2 (routes), §7.3 (layers) and **§9a (carry-forward constraints)** before starting.

**Branch:** `feat/course-events-phase-2` (already checked out, based on `main` at `bf0c9d86e`).

---

## Global Constraints

- **Phase 2a writes NO migrations.** The 11 tables, RLS and `courses.*` permission catalogue are already on `main`. If you find yourself calling `mcp__supabase__apply_migration`, stop and report BLOCKED.
- **There is NO test suite.** Never write "run the tests" and never claim tests pass. Verification is: `mcp__ide__getDiagnostics` per touched file (NEVER full `tsc` — 3-4 min and OOMs), the three nav gates below, and exercising the page in a browser.
- **The three build gates must pass after any nav change:**
  `npx tsx scripts/check-sidebar-health.ts`, **`npm run check:reachability`** (never the bare script — it defaults to `--max-unreachable 0` and exits 1 against ~52 pre-existing unreachable routes; the npm script passes `--max-unreachable 58`), and `npx tsx scripts/check-permission-audit-coverage.ts`.
- **`mcp__ide__getDiagnostics` became unavailable mid-phase** (MCP server disconnected). Do NOT substitute `npm run typecheck` or full `tsc` — CLAUDE.md is explicit it takes 3-4 minutes and OOMs. Verify with `npx eslint <file>` plus hand-verification of every imported symbol against its source, and **never claim a clean typecheck you did not run.**
- **`BaseService.executeListQuery` THROWS without `institution_id`** (`base-service.ts:130`). Every list call must pass one.
- **Never branch on `isSuperAdmin` to decide institution scope.** Pass the accessible-institution IDs from `useInstitutionsWithAccess`; RLS still gates the rows. Branching on `isSuperAdmin` silently strips access from `scope='all'` secondary roles.
- **A NULL `institution_id` grants NOTHING** (spec §9a). Never write `institution_id IS NULL` — or a JS equivalent — as a privilege test. It would promote every external participant to super-admin visibility.
- **`institutionId ?? ''` never `institutionId || ''`.** `||` coerces `undefined` → `''`, which flows through as a real UUID parameter and matches zero rows.
- **Nullable UUID form fields must normalise `'' → null` before insert** or Postgres throws `22P02`.
- **PostgREST returns `numeric` as a STRING.** `"0.00"` is truthy. `Number()` every amount at the read boundary.
- **Supabase errors are plain objects, not `Error` instances.** `err instanceof Error` always falls through — use `getErrorMessage()` from `@/lib/utils`.
- **Never fire-and-forget a mutation.** Always destructure `{ error }` and check it; try/catch does NOT catch RLS denials.
- **Permission keys already exist** and are granted to `administrator` and `coo`: `courses.view`, `courses.create`, `courses.edit`, `courses.delete`, `courses.packages.manage`, `courses.forms.manage`, `courses.sessions.manage`, `courses.applications.view`, `courses.applications.decide`, `courses.enrollments.manage`, `courses.billing.view`, `courses.billing.manage`, `courses.attendance.mark`, `courses.certificates.issue`, `courses.participant.self`. **`courses.delete` is granted to NO role** — super admins pass via `user_has_permission()`'s bypass; everyone else gets it from Role Management.
- Match the surrounding code's comment density and idiom. Don't refactor neighbouring code.
- Stage explicitly named files. **`git add <path>` stages that file's ENTIRE current content, not your diff** — this working directory is shared with another session. Run `git diff <path>` before staging and read every hunk; run `git show --stat HEAD` after committing and confirm the counts match your edit.

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `types/courses.ts` | Domain types + DTOs + filter shapes for the whole module |
| `lib/services/courses/course-event-service.ts` | Static class, CRUD against `course_events` |
| `hooks/courses/use-course-events.ts` | React Query hooks + cache invalidation |
| `app/(routes)/courses/page.tsx` | Catalog list |
| `app/(routes)/courses/_components/columns.tsx` | DataTable column defs |
| `app/(routes)/courses/_components/course-form.tsx` | Shared create/edit form |
| `app/(routes)/courses/_components/row-actions.tsx` | Per-row menu, permission-gated |
| `app/(routes)/courses/new/page.tsx` | Create |
| `app/(routes)/courses/[id]/page.tsx` | Detail shell with tab scaffold for 2b/2c |

**Modify**

| File | Change |
|---|---|
| `lib/query/query-keys.ts` | Add the `courses` key factory |
| `lib/sidebarMenuLink.ts` | `MENU_PERMISSIONS` entries for the new routes |
| `lib/permissions-audit/module-mappings.ts` | `ROUTE_PREFIX_TO_MODULE` gains `['/courses', 'Courses']` |
| the sidebar menu source | A "Courses" nav entry |

---

## Task 1: Types and query keys

**Files:**
- Create: `types/courses.ts`
- Modify: `lib/query/query-keys.ts`

**Interfaces:**
- Consumes: `Database` from `types/supabase.ts` (all 11 `course_*` tables are registered there already).
- Produces: `CourseEvent`, `CourseEventFilters`, `CreateCourseEventDto`, `UpdateCourseEventDto`, `COURSE_EVENT_STATUSES`, `COURSE_EVENT_MODES`, and `queryKeys.courses`. Tasks 2-7 all import from these.

- [ ] **Step 1: Read the existing shapes you must match**

Read `lib/query/query-keys.ts` (starts line 2) and one existing domain type module — `types/reservation.ts` is a good reference for the filter/DTO idiom. Match their structure; do not invent a new one.

- [ ] **Step 2: Write `types/courses.ts`**

Derive row types from the generated `Database` type rather than hand-writing columns, so a schema change surfaces as a type error:

```typescript
import type { Database } from '@/types/supabase';

export type CourseEventRow = Database['public']['Tables']['course_events']['Row'];

/** Status is a CHECK constraint, not a Postgres enum — keep this list in step with
 *  course_events_status_check. There is deliberately NO 'closed': whether
 *  applications are accepted is decided solely by the application window. */
export const COURSE_EVENT_STATUSES = ['draft', 'published', 'completed', 'cancelled'] as const;
export type CourseEventStatus = (typeof COURSE_EVENT_STATUSES)[number];

export const COURSE_EVENT_MODES = ['offline', 'online', 'hybrid'] as const;
export type CourseEventMode = (typeof COURSE_EVENT_MODES)[number];

export interface CourseEvent extends CourseEventRow {
  institution?: { id: string; name: string } | null;
  created_by_profile?: { id: string; full_name: string | null } | null;
}

export interface CourseEventFilters {
  institution_id?: string;
  /** For multi-institution users. Pass the accessible IDs; never branch on isSuperAdmin. */
  institution_ids?: string[];
  status?: CourseEventStatus;
  mode?: CourseEventMode;
  year?: number;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
}

export interface CreateCourseEventDto {
  institution_id: string;
  title: string;
  slug: string;
  code?: string | null;
  description?: string | null;
  mode: CourseEventMode;
  status?: CourseEventStatus;
  start_date?: string | null;
  end_date?: string | null;
  application_opens_at?: string | null;
  application_closes_at?: string | null;
  total_seats?: number | null;
  venue_text?: string | null;
  cover_image_url?: string | null;
  year?: number | null;
  edition_number?: number | null;
  previous_course_event_id?: string | null;
}

export type UpdateCourseEventDto = Partial<Omit<CreateCourseEventDto, 'institution_id'>>;
```

- [ ] **Step 3: Add the query-key factory**

In `lib/query/query-keys.ts`, add inside the exported `queryKeys` object, matching the surrounding style:

```typescript
  courses: {
    all: ['courses'] as const,
    lists: () => [...queryKeys.courses.all, 'list'] as const,
    list: (filters: unknown) => [...queryKeys.courses.lists(), filters] as const,
    details: () => [...queryKeys.courses.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.courses.details(), id] as const,
  },
```

- [ ] **Step 4: Typecheck**

Run `mcp__ide__getDiagnostics` on `types/courses.ts` and `lib/query/query-keys.ts`. Expected: no errors.

If `CourseEventRow` errors with "Property 'course_events' does not exist", the generated types on this branch are stale — report BLOCKED rather than hand-writing the row type.

- [ ] **Step 5: Commit**

```bash
git diff types/courses.ts lib/query/query-keys.ts   # read every hunk — shared workdir
git add types/courses.ts lib/query/query-keys.ts
git commit -m "feat(courses): domain types and query-key factory"
git show --stat HEAD                                 # counts must match your edit
```

---

## Task 2: CourseEventService

**Files:**
- Create: `lib/services/courses/course-event-service.ts`

**Interfaces:**
- Consumes: `types/courses.ts` from Task 1.
- Produces: `CourseEventService` with `list(filters)`, `getById(id)`, `create(dto)`, `update(id, dto)`, `remove(id)`, `slugAvailable(institutionId, slug, excludeId?)`. Task 3's hooks call exactly these names.

- [ ] **Step 1: Read the base class contract**

Read `lib/services/base-service.ts` around `executeListQuery` (line 113) and `executeCreate` (line 296). Note that `executeListQuery` **throws** when `filters.institution_id` is absent (line 130) — that is deliberate multi-tenant protection, not a bug to work around.

- [ ] **Step 2: Write the service**

```typescript
import { BaseService } from '@/lib/services/base-service';
import { sanitizeSearch } from '@/lib/config/pagination';
import type {
  CourseEvent, CourseEventFilters, CreateCourseEventDto, UpdateCourseEventDto,
} from '@/types/courses';

const SELECT = `
  *,
  institution:institutions!course_events_institution_id_fkey(id, name),
  created_by_profile:profiles!course_events_created_by_fkey(id, full_name)
`;

export class CourseEventService extends BaseService {
  /**
   * Multi-institution users pass `institution_ids`; single-institution users pass
   * `institution_id`. NEVER branch on isSuperAdmin to decide which — that silently
   * strips access from secondary roles carrying scope='all'. RLS gates the rows either
   * way; this only decides the query filter.
   *
   * BaseService.executeListQuery requires a single institution_id, so the multi-
   * institution path uses its own query rather than fighting that contract.
   */
  static async list(filters: CourseEventFilters) {
    const ids = filters.institution_ids;

    if (ids && ids.length > 0) {
      const page = filters.page ?? 1;
      const limit = filters.limit ?? 10;
      let q = this.supabase
        .from('course_events')
        .select(SELECT, { count: 'exact' })
        .in('institution_id', ids);

      q = this.applyCommonFilters(q, filters);
      q = q
        .order(filters.sortBy ?? 'created_at', { ascending: filters.sortDirection === 'asc' })
        .range((page - 1) * limit, page * limit - 1);

      const { data, count, error } = await q;
      if (error) throw error;

      return {
        data: (data ?? []) as unknown as CourseEvent[],
        metadata: {
          total: count ?? 0,
          page,
          limit,
          totalPages: count ? Math.ceil(count / limit) : 0,
        },
      };
    }

    return this.executeListQuery<CourseEvent>(
      'course_events',
      filters,
      SELECT,
      (q) => this.applyCommonFilters(q, filters),
    );
  }

  /**
   * CORRECTED 2026-08-13 (flagged by security review) — the first draft escaped only
   * [%_], which are the LIKE wildcards. PostgREST's `or=(...)` grammar has its own
   * metacharacters — `,` separates conditions, `(`/`)` group, `.` separates
   * column.operator.value — so a search containing a comma broke out of the ilike and
   * injected a sibling condition.
   *
   * Use the repo's own sanitizeSearch (lib/config/pagination.ts:15), which strips
   * % \ ' " ( ) , . * — do NOT invent escaping here.
   *
   * This is called explicitly rather than relied on from BaseService: executeListQuery
   * auto-sanitizes at base-service.ts:143, but the multi-institution path bypasses that
   * method entirely, so it would have had no sanitization at all. Calling it here makes
   * BOTH paths safe and is harmless double-sanitizing on the single-institution path
   * (the function is idempotent — it strips rather than escapes).
   */
  private static applyCommonFilters(q: any, filters: CourseEventFilters) {
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.mode) q = q.eq('mode', filters.mode);
    if (filters.year) q = q.eq('year', filters.year);
    if (filters.search) {
      const s = sanitizeSearch(filters.search);
      // sanitizeSearch can return '' (e.g. a search of only punctuation). An empty
      // ilike pattern matches everything, which is a confusing no-op filter — skip.
      if (s) q = q.or(`title.ilike.%${s}%,code.ilike.%${s}%,slug.ilike.%${s}%`);
    }
    return q;
  }

  static async getById(id: string) {
    const { data, error } = await this.supabase
      .from('course_events').select(SELECT).eq('id', id).single();
    if (error) throw error;
    return data as unknown as CourseEvent;
  }

  /**
   * Nullable UUID and text fields arrive from react-hook-form as '' and must be
   * normalised to null — Postgres rejects '' for a uuid column with 22P02.
   */
  static async create(dto: CreateCourseEventDto) {
    const payload = {
      ...dto,
      code: dto.code || null,
      description: dto.description || null,
      venue_text: dto.venue_text || null,
      cover_image_url: dto.cover_image_url || null,
      previous_course_event_id: dto.previous_course_event_id || null,
      start_date: dto.start_date || null,
      end_date: dto.end_date || null,
      application_opens_at: dto.application_opens_at || null,
      application_closes_at: dto.application_closes_at || null,
      status: dto.status ?? 'draft',
    };
    const { data, error } = await this.supabase
      .from('course_events').insert(payload as any).select(SELECT).single();
    if (error) throw error;
    return data as unknown as CourseEvent;
  }

  /**
   * CORRECTED 2026-08-13 — the first draft passed `dto` straight through, which was a
   * live 22P02 waiting for the edit form. SIX columns reject '': start_date and
   * end_date (date), application_opens_at and application_closes_at (timestamptz),
   * total_seats (integer), previous_course_event_id (uuid). The date fields are the
   * ones a user is most likely to CLEAR on an edit form.
   *
   * The normalizer is shared with create() rather than duplicated — two parallel
   * field lists drift, which is exactly the incomplete-sweep failure Phase 1 hit.
   *
   * It must only rewrite keys ALREADY PRESENT and must never ADD one:
   * UpdateCourseEventDto is Partial<>, so seeding absent keys with null would wipe
   * every field the user did not touch — silent data loss, far worse than the 22P02.
   */
  static async update(id: string, dto: UpdateCourseEventDto) {
    const { data, error } = await this.supabase
      .from('course_events')
      .update(this.nullifyBlanks(dto) as any)
      .eq('id', id).select(SELECT).single();
    if (error) throw error;
    return data as unknown as CourseEvent;
  }

  /** Blocked by RLS unless the caller holds courses.delete, and by ON DELETE RESTRICT
   *  if any enrollment exists. Surface the error; do not swallow it. */
  static async remove(id: string) {
    const { error } = await this.supabase.from('course_events').delete().eq('id', id);
    if (error) throw error;
  }

  /** UNIQUE (institution_id, slug). Check before submit so the user gets a field
   *  error instead of a raw 23505. */
  static async slugAvailable(institutionId: string, slug: string, excludeId?: string) {
    let q = this.supabase
      .from('course_events').select('id')
      .eq('institution_id', institutionId).eq('slug', slug);
    if (excludeId) q = q.neq('id', excludeId);
    const { data, error } = await q.maybeSingle();
    if (error) throw error;
    return !data;
  }
}
```

- [ ] **Step 3: Typecheck**

`mcp__ide__getDiagnostics` on the new file. Expected: no errors. `strict` is off, so a `null`/`undefined` mismatch will NOT be reported — read the nullable fields yourself.

- [ ] **Step 4: Commit** (diff-before-staging as in Task 1 Step 5)

```bash
git add lib/services/courses/course-event-service.ts
git commit -m "feat(courses): CourseEventService with multi-institution list path"
```

---

## Task 3: React Query hooks

**Files:**
- Create: `hooks/courses/use-course-events.ts`

**Interfaces:**
- Consumes: `CourseEventService` (Task 2), `queryKeys.courses` (Task 1).
- Produces: `useCourseEvents(filters)`, `useCourseEvent(id)`, `useCreateCourseEvent()`, `useUpdateCourseEvent()`, `useDeleteCourseEvent()`. Tasks 5-7 consume exactly these.

- [ ] **Step 1: Read an existing hook module for the idiom**

Read `hooks/learners-council/use-lc-events.ts` — it is the closest analogue (list + detail + mutations with invalidation). Match its toast and error handling.

- [ ] **Step 2: Write the hooks**

```typescript
'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query/query-keys';
import { getErrorMessage } from '@/lib/utils';
import { CourseEventService } from '@/lib/services/courses/course-event-service';
import type { CourseEventFilters, CreateCourseEventDto, UpdateCourseEventDto } from '@/types/courses';

export function useCourseEvents(filters: CourseEventFilters) {
  const scoped = Boolean(filters.institution_id) || (filters.institution_ids?.length ?? 0) > 0;
  return useQuery({
    queryKey: queryKeys.courses.list(filters),
    queryFn: () => CourseEventService.list(filters),
    // Without an institution the service throws by design; don't fire the query at all.
    enabled: scoped,
  });
}

export function useCourseEvent(id: string) {
  return useQuery({
    queryKey: queryKeys.courses.detail(id),
    queryFn: () => CourseEventService.getById(id),
    enabled: Boolean(id),
  });
}

export function useCreateCourseEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateCourseEventDto) => CourseEventService.create(dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.courses.lists() });
      toast.success('Course created');
    },
    // Supabase errors are plain objects — instanceof Error falls through.
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}

export function useUpdateCourseEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateCourseEventDto }) =>
      CourseEventService.update(id, dto),
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: queryKeys.courses.lists() });
      qc.invalidateQueries({ queryKey: queryKeys.courses.detail(id) });
      toast.success('Course updated');
    },
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteCourseEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => CourseEventService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.courses.lists() });
      toast.success('Course deleted');
    },
    // A course with enrollments is blocked by ON DELETE RESTRICT (23503). Show the
    // real reason rather than a generic failure.
    onError: (e) => toast.error(getErrorMessage(e)),
  });
}
```

- [ ] **Step 3: Typecheck and commit**

`mcp__ide__getDiagnostics` clean, then:

```bash
git add hooks/courses/use-course-events.ts
git commit -m "feat(courses): React Query hooks for course events"
```

---

## Task 4: Nav wiring and the three gates

Do this BEFORE the pages. The gates fail the build, and finding out at the end is worse.

**Files:**
- Modify: `lib/navigation/modules.ts` (the module registry — line 145 is the Events entry)
- Modify: `lib/sidebarMenuLink.ts` (`MENU_PERMISSIONS`, line 161; `/events` entry at line 517)
- Modify: `lib/permissions-audit/module-mappings.ts` (`ROUTE_PREFIX_TO_MODULE`, line 142)
- Regenerate: `lib/navigation/route-manifest.generated.ts` via `npm run gen:routes` — **generated, never hand-edited**

- [ ] **Step 1: Read the four places nav lives**

Nav is spread across four files and they must move together:

1. **`lib/navigation/modules.ts`** — the module registry. Events is one line (145):
   `{ slug: 'events', label: 'Events', icon: 'Calendar', section: 'Events', hasNavConfig: false },`
2. **`lib/sidebarMenuLink.ts:161`** — `MENU_PERMISSIONS`, route → permission key.
3. **`lib/permissions-audit/module-mappings.ts:142`** — `ROUTE_PREFIX_TO_MODULE`.
4. **`lib/navigation/route-manifest.generated.ts`** — generated by `npm run gen:routes`, which runs first in the build gauntlet. Never edit it by hand.

Read all four before changing any. `icon` is a `lucide-react` name as a string, not an import.

- [ ] **Step 2: Add the route→permission map**

In `MENU_PERMISSIONS`, alongside the events entries:

```typescript
  '/courses': 'courses.view',
  '/courses/new': 'courses.create',
```

Do NOT add `/courses/[id]` — dynamic segments are matched by prefix, and a literal `[id]` entry is a known trap in this file.

- [ ] **Step 3: Add the route-prefix→module mapping**

In `lib/permissions-audit/module-mappings.ts`, in `ROUTE_PREFIX_TO_MODULE` (line 142). Order matters — the scan returns the first `startsWith` match, so more-specific prefixes come first. `/courses` collides with nothing:

```typescript
  ['/courses', 'Courses'],
```

`MODULE_TO_CATEGORY_KEY` needs **no** change — it is derived programmatically and `'Courses'` normalises to the `'courses'` category key added in Phase 1.

- [ ] **Step 4: Register the module**

In `lib/navigation/modules.ts`, add alongside the Events entry (line 145), matching that one-line shape exactly:

```typescript
  // ── Courses ───────────────────────────────────────────────────────────
  { slug: 'courses', label: 'Courses', icon: 'Presentation', section: 'Courses', hasNavConfig: false },
```

`slug` must be `courses` so it resolves against `/courses`. `icon` is a `lucide-react` export name as a **string**, resolved at render time (see the doc comment at `modules.ts:39`).

**`Presentation` is chosen because it is unused.** Checked 2026-08-13: `GraduationCap` is already the **Academic** module's icon (`modules.ts:69`) and `BookOpen` is also taken — either would put two identical glyphs in one sidebar, which is exactly the kind of thing nobody notices in review and everybody notices in use. `Library` and `NotebookPen` are also free if `Presentation` reads wrong to you.

- [ ] **Step 5: Regenerate the route manifest**

```bash
npm run gen:routes
```

This rewrites `lib/navigation/route-manifest.generated.ts`. It runs first in the build gauntlet, so a stale manifest fails the build. Commit the regenerated file with your change; never hand-edit it.

- [ ] **Step 6: Run all three gates**

```bash
npx tsx scripts/check-sidebar-health.ts
npm run check:reachability          # NOT a bare `npx tsx scripts/check-nav-reachability.ts`
npx tsx scripts/check-permission-audit-coverage.ts
```

Expected: all three exit 0.

**CORRECTED 2026-08-13.** The reachability script run bare **exits 1 by design** — its default `--max-unreachable` is 0, and this app has ~52 pre-existing unreachable routes (`admin/*`, `hr/*`, `okr/*`, `internships/*`, …). The real build gate is the npm script, which passes `--max-unreachable 58`:

```json
"check:reachability": "tsx scripts/check-nav-reachability.ts --max-unreachable 58"
```

Run the npm script, and **read the output rather than trusting the exit code** — the only thing that matters is that no `/courses` route appears in the unreachable list.

- `[route] Route "/courses" has no entry in ROUTE_PREFIX_TO_MODULE` → Step 3 missed.
- A reachability failure naming `/courses` → the module registry entry in Step 4 is missing or mis-slugged.

**Expect `npm run gen:routes` to produce more diff than you added.** The committed manifest is routinely stale relative to `main`, so regenerating sweeps in pre-existing routes other features already merged. That is correct — the file is generated from the filesystem and is catching up. Verify a sample with `git log --oneline -1 -- <route path>` to confirm they are pre-existing rather than yours, and say so in your report.

- [ ] **Step 7: Typecheck and commit**

```bash
git diff lib/navigation/modules.ts lib/sidebarMenuLink.ts \
         lib/permissions-audit/module-mappings.ts lib/navigation/route-manifest.generated.ts
git add lib/navigation/modules.ts lib/sidebarMenuLink.ts \
        lib/permissions-audit/module-mappings.ts lib/navigation/route-manifest.generated.ts
git commit -m "feat(courses): module registry, menu permissions, audit mapping, route manifest"
git show --stat HEAD
```

---

## Task 5: Course list page

**Files:**
- Create: `app/(routes)/courses/page.tsx`, `app/(routes)/courses/_components/columns.tsx`, `app/(routes)/courses/_components/row-actions.tsx`

**Interfaces:**
- Consumes: `useCourseEvents`, `useDeleteCourseEvent` (Task 3); `useAuth`, `useInstitutionsWithAccess`.
- Produces: the `/courses` route the nav entry from Task 4 points at.

- [ ] **Step 1: Read the reference implementation**

Read `app/(routes)/events/page.tsx` and `app/(routes)/events/_components/events-data-table.tsx`. Match how they compose `DataTable`, filters and `PermissionGuard`. Do not invent a different table pattern.

- [ ] **Step 2: Write the columns**

Columns: Title (with `code` as secondary text), Institution, Status badge, Mode, Start–End dates, Seats, Actions. Use the repo's existing badge/status helper if one exists in the events module; otherwise a local `STATUS_VARIANT` map.

**A `Badge` renders a `<div>`; it cannot be nested inside a `<CardDescription>`, which renders a `<p>`** — invalid HTML hydration error. This has bitten this codebase before.

- [ ] **Step 3: Write row actions, permission-gated**

View (always, if `courses.view`), Edit (`courses.edit`), Delete (`courses.delete`).

**CORRECTED 2026-08-13 — the first draft was wrong, and wrong in a documented way.**

`useAuth()` does **NOT** expose `hasPermission`. The wired provider's `AuthContextValue`
is exactly `{ profile, isLoading, error }` (`hooks/use-auth-provider.tsx:8-12`).
**The project CLAUDE.md describes `useAuth()` as exposing `hasPermission(key)`,
`isSuperAdmin` and `user` — that description is inaccurate for the actually-wired
provider, and this brief inherited the error by trusting it.**

Destructuring a *function* that isn't there gives `TypeError: hasPermission is not a
function` the moment it is called in a render body — which takes out the whole route.
Destructuring a *value* (`user`, `isSuperAdmin`) is worse: silently `undefined`, no
error, the feature simply never works.

Use instead:

```typescript
const { canAccess } = usePermissions();       // hooks/use-permissions.ts:170
canAccess('courses', 'edit')                  // (module, action) — line 502/634
```

`usePermissions()` also exposes `can('module.resource.action')` (line 631) if a single
key string reads better. Both are real; `canAccess` matches what
`app/(routes)/events/_components/row-actions.tsx` already does.

**`PermissionGuard` likewise takes `module` + `action` props, not one permission
string** (`components/auth/permission-guard.tsx:6-15`):

```tsx
<PermissionGuard module="courses" action="view">
```

Do not fetch the profile yourself on mount — that races the provider and bounces
super-admins to `/unauthorized`.

**Do not put Delete behind a `window.confirm`.** Use the Shadcn `AlertDialog`; a native dialog blocks the event loop and is inconsistent with the rest of the app.

- [ ] **Step 4: Write the page**

```typescript
'use client';
// Institution scope comes from useInstitutionsWithAccess, NOT from useAuth and NOT
// from branching on isSuperAdmin. Passing the accessible IDs keeps 'All Institutions'
// working for multi-institution users; branching on isSuperAdmin silently strips
// access from secondary roles carrying scope='all'.
```

Wrap the page body in `<PermissionGuard permission="courses.view">`. Wire search, status filter and pagination into the `CourseEventFilters` object passed to `useCourseEvents`.

- [ ] **Step 5: Verify in a browser — as a non-super-admin**

Run `npm run dev`. Sign in as a user holding `administrator` or `coo` (both were granted `courses.*` in Phase 1) — **not** as a super admin, who bypasses every policy and would prove nothing.

Confirm: the Courses entry appears in the sidebar; `/courses` renders; the table shows courses for the user's accessible institutions; and the Delete action is **absent**, because `courses.delete` is granted to no role.

An empty table with no error is the expected failure signature of a permission or scope problem in this codebase — check the browser console and the network tab before assuming there is simply no data.

- [ ] **Step 6: Typecheck and commit**

`mcp__ide__getDiagnostics` on all three files, then commit.

---

## Task 6: Create page and shared form

**Files:**
- Create: `app/(routes)/courses/new/page.tsx`, `app/(routes)/courses/_components/course-form.tsx`

**Interfaces:**
- Consumes: `useCreateCourseEvent`, `CourseEventService.slugAvailable`.
- Produces: `CourseForm`, reused in edit mode by Task 7 — so it must accept `defaultValues` and a `mode: 'create' | 'edit'` prop from the start.

- [ ] **Step 1: Write the Zod schema mirroring the DB constraints**

Every rule below exists as a CHECK constraint in the database. Mirroring them client-side turns a raw Postgres error into a field message; it does not replace them.

```typescript
const schema = z.object({
  institution_id: z.string().uuid('Select an institution'),
  title: z.string().min(1, 'Title is required'),
  // course_events_slug_format_chk
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/,
    'Lowercase letters, numbers and single hyphens only'),
  code: z.string().optional(),
  description: z.string().optional(),
  mode: z.enum(['offline', 'online', 'hybrid']),
  status: z.enum(['draft', 'published', 'completed', 'cancelled']).default('draft'),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  application_opens_at: z.string().optional(),
  application_closes_at: z.string().optional(),
  // course_events_total_seats_check: NULL or > 0
  //
  // CORRECTED 2026-08-13. The first draft was
  //   total_seats: z.coerce.number().int().positive().optional()
  // which is broken for the COMMON case. A cleared number input reports '',
  // z.coerce.number() turns '' into 0, and .positive() then rejects it — so
  // leaving seats blank to mean "unlimited" made the form un-submittable.
  // .optional() does not help: the value is present as '', not undefined.
  //
  // preprocess normalises '' to undefined BEFORE coercion, so the schema is
  // self-protecting rather than relying on every DOM binding to do it.
  total_seats: z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.coerce.number().int().positive().optional(),
  ),
  venue_text: z.string().optional(),
})
  // course_events_date_order_chk
  .refine((v) => !v.start_date || !v.end_date || v.end_date >= v.start_date,
    { message: 'End date must be on or after start date', path: ['end_date'] })
  // course_events_application_window_chk
  .refine((v) => !v.application_opens_at || !v.application_closes_at
    || v.application_closes_at >= v.application_opens_at,
    { message: 'Applications must close on or after they open', path: ['application_closes_at'] });
```

- [ ] **Step 2: Build the form**

react-hook-form + `zodResolver`, Shadcn `Form` primitives. Institution select from `useInstitutionsWithAccess`. Auto-derive `slug` from `title` on create (kebab-case) but leave it editable, and do not auto-change it in edit mode — the slug is the public URL and silently changing it breaks live links.

Async-validate the slug via `CourseEventService.slugAvailable` on blur, surfacing "That URL is already used by another course at this institution" rather than letting a `23505` surface raw.

**There is no `'closed'` status.** Whether applications are accepted is decided solely by the application window — do not add a status control implying otherwise.

- [ ] **Step 3: Wire the create page**

Wrap in `<PermissionGuard permission="courses.create">`. On success, route to `/courses/[id]` for the new record.

- [ ] **Step 4: Verify in a browser**

Create a course as `administrator`. Then deliberately submit a duplicate slug at the same institution and confirm you get the field message, not a raw error toast. Confirm the new row appears in the list without a manual refresh — that proves Task 3's invalidation is wired.

- [ ] **Step 5: Typecheck and commit**

---

## Task 7: Detail page with tab scaffold

**Files:**
- Create: `app/(routes)/courses/[id]/page.tsx`

**Interfaces:**
- Consumes: `useCourseEvent`, `useUpdateCourseEvent`, `CourseForm` (Task 6).
- Produces: the detail shell whose Packages and Sessions tabs Phases 2b and 2c fill in.

- [ ] **Step 1: Read the analogous console**

Read `app/(routes)/events/[id]/page.tsx` for the header + tabs composition.

- [ ] **Step 2: Build the page**

Header: title, code, status badge, institution, dates. Tabs: **Overview** (read-only summary), **Settings** (the `CourseForm` in edit mode, gated on `courses.edit`), plus disabled **Packages** and **Sessions** tabs carrying a short "Coming in Phase 2b/2c" empty state.

Render the disabled tabs rather than omitting them — it makes the shape of the console legible and gives 2b/2c an obvious insertion point.

**Glob/Grep patterns containing `[id]` match nothing** (brackets read as a character class). Open the dynamic-route file by direct path or use `**`.

- [ ] **Step 3: Verify in a browser**

Open a course, edit its title in Settings, save, and confirm the header updates without a refresh — that proves the detail-key invalidation from Task 3.

- [ ] **Step 4: Typecheck and commit**

---

## Phase 2a completion criteria

Do not report complete until each of these is observed, not assumed:

1. `npx tsx scripts/check-sidebar-health.ts` exits 0.
2. `npx tsx scripts/check-nav-reachability.ts` reports no new unreachable route under `/courses`.
3. `npx tsx scripts/check-permission-audit-coverage.ts` exits 0.
4. `mcp__ide__getDiagnostics` clean on every created/modified file.
5. **Exercised in a browser as `administrator` or `coo` — NOT as a super admin.** List renders, create works, edit works, Delete is absent.
6. A duplicate slug produces a field message, not a raw `23505`.
7. `git show --stat` on each commit matches the intended file list and counts (shared working directory).

**Do not claim tests pass.** There is no suite. State which of the above you ran and what each returned.

---

## Notes for Phase 2b / 2c

- **2b/2c — a `DataTable` in `fetchDataFn` mode CANNOT be refreshed by `invalidateQueries` alone.**
  Found by the Phase 2a final review, after seven earlier reviews missed it. `useDataTableRefreshOnInvalidate`
  fires only on an invalidate event emitted by an **already-cached** query. A table that fetches through
  `fetchDataFn` never registers a query under its key prefix, so `invalidateQueries({ queryKey: X.lists() })`
  matches nothing, fires no event, and the deleted row stays on screen behind a success toast.
  The repo documents this in `hooks/events/use-general-events.ts:158-170` — read it before wiring the
  packages or sessions tables. Two viable fixes: an always-cached query under the same prefix (what the
  events module happens to have), or a page-local counter folded into `refetchKey`, which is a real
  dependency of `DataTable`'s fetch effect (`data-table.tsx:554`) and therefore deterministic.
  **Only `delete` needs this.** Create redirects, so the list remounts and refetches; update runs on a
  detail page where `detail(id)` is genuinely cached. Delete is the only mutation firing while the list
  is mounted.

- **2b/2c — beware fixes in different layers routing around each other.** Task 2 normalised `'' → null`
  in the service; Task 6 normalised `'' → undefined` in the form. Each was correct alone and I ordered
  both, a phase apart — together they meant a cleared numeric field reached PostgREST as `undefined`,
  which `JSON.stringify` drops from the PATCH, so the column was silently never updated. Each fix was
  reviewed against the task it landed in, never against the other fix. When adding a normalisation layer,
  check what the layers on either side already do.

- **2b — the optional-number Zod trap will recur.** `course_packages.seat_cap` (NULL or > 0) and the
  installment `amount` fields have exactly the shape that broke `total_seats`: a cleared numeric input
  reports `''`, `z.coerce.number()` makes it `0`, and `.positive()` rejects it, so "leave blank for
  unlimited" becomes un-submittable and `.optional()` does not save you. Use the `z.preprocess('' →
  undefined, …)` form from Task 6's schema for every nullable numeric field. Do not copy the naive
  version forward.
- **2b (packages):** the installment editor must submit the package and its installments in ONE transaction — the sum constraint is `DEFERRABLE INITIALLY DEFERRED` and validates at COMMIT. A package saved alone, then installments saved separately, will fail the second save with `23514` and leave the user stuck. Zero installments is legal (draft); the sum only binds when at least one exists.
- **2c (sessions/venue):** venue holds write `resource_reservations.course_session_id` — the column Phase 1 Task 3 added. Reuse `ReservationService`; do not write a second booking path.
- Both must keep `institution_id` NOT NULL on anything new (spec §9a).
