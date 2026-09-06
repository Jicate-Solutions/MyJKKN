# Source Coverage Detailed Analytics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Daily Pivot grid and a By-Program grid to the admission analytics Source Coverage tab, with advanced filters (institution / date range / source / program / assignment status), mirroring the group-dashboard seat-pivot UX.

**Architecture:** One new SECURITY DEFINER RPC `fn_admission_source_coverage_daily` returns rows keyed by (source_key, program_id) with `daily_counts` JSONB. Powers two new sub-tabs (Daily Pivot, By Program); the existing Summary tab keeps its lifetime `SourceMasterService.list` query unchanged. A new filter card above the tab strip drives all three sub-tabs.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (Postgres + RLS + SECURITY DEFINER RPCs), TanStack Query, shadcn/ui (Tabs / Select / Popover / Calendar), Tailwind CSS, Vitest snapshot tests, `xlsx` for export.

**Reference spec:** `docs/superpowers/specs/2026-05-18-source-coverage-detailed-analytics-design.md`

---

## File Structure

**Create:**
- `supabase/migrations/<YYYYMMDDHHMMSS>_fn_admission_source_coverage_daily.sql` — the new RPC
- `supabase/tests/test_fn_admission_source_coverage_daily.sql` — ad-hoc SQL verification script (run via `mcp__supabase__execute_sql`; pgTAP is not configured in this project)
- `types/admission/source-coverage.ts` — `SourceCoverageRow`, `SourceCoverageFilters`, `AssignmentFilter`
- `lib/services/admission/source-coverage-service.ts` — `SourceCoverageService.getDailyCoverage`
- `hooks/admission/use-source-coverage-daily.ts` — TanStack Query hook
- `components/admission/source-coverage/source-coverage-filter-bar.tsx` — filter card
- `components/admission/source-coverage/source-coverage-daily-grid.tsx` — Daily Pivot grid
- `components/admission/source-coverage/source-coverage-by-program-grid.tsx` — By Program grid
- `components/admission/source-coverage/source-coverage-daily-grid.test.tsx` — snapshot test
- `components/admission/source-coverage/source-coverage-by-program-grid.test.tsx` — snapshot test

**Modify:**
- `components/admission/source-coverage-dashboard.tsx` — refactor to add sub-tabs, integrate filter bar, remove `institutionId` prop in favor of internal state seeded by `defaultInstitutionId`
- `components/admission/index.tsx` — re-export new sub-components (verify the existing barrel pattern first)
- `app/(routes)/admission/analytics/page.tsx:673` — change prop name `institutionId` → `defaultInstitutionId`

---

## Task 1: Database Migration — `fn_admission_source_coverage_daily` RPC

**Files:**
- Create: `supabase/migrations/<YYYYMMDDHHMMSS>_fn_admission_source_coverage_daily.sql`

**Context:** This RPC reads `admission_leads` and joins `admission_lead_sources_master` + `programs`. "Assigned" semantics match `get_lead_counts_by_source` (introduced 2026-05-10): `counselor_id IS NOT NULL`. IST date bucketing mirrors `fn_seat_analytics_daily_pivot`. SECURITY DEFINER with the permission gate inside, scoped via `role_has_institution_access`. Per memory `feedback_placeholder_migrations_hide_typos`, both apply via MCP and commit the real body to `supabase/migrations/`.

- [ ] **Step 1: Generate the migration timestamp**

Run (bash):
```bash
date -u +"%Y%m%d%H%M%S"
```
Note the value — use it as `<TS>` for the filename `<TS>_fn_admission_source_coverage_daily.sql`.

- [ ] **Step 2: Write the migration SQL file**

Create `supabase/migrations/<TS>_fn_admission_source_coverage_daily.sql` with this exact content:

```sql
-- ============================================================================
-- 2026-05-18 — Source Coverage Detailed Analytics (Daily Pivot + By Program)
--
-- Returns one row per (source_key, program_id) for admission_leads created
-- in [p_from, p_to], with daily_counts JSONB keyed by IST date.
--
-- Spec: docs/superpowers/specs/2026-05-18-source-coverage-detailed-analytics-design.md
--
-- "Assigned" follows the convention introduced by get_lead_counts_by_source
-- (migration 20260510230000): counselor_id IS NOT NULL.
-- IST bucketing follows fn_seat_analytics_daily_pivot.
-- Permission gate uses the catalog key admission.analytics.view per memory
-- feedback_rpc_perm_gate_must_use_catalog_key.
-- ============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.fn_admission_source_coverage_daily(uuid, date, date, text, text[], uuid[]);

CREATE OR REPLACE FUNCTION public.fn_admission_source_coverage_daily(
  p_institution_id  uuid    DEFAULT NULL,
  p_from            date    DEFAULT NULL,
  p_to              date    DEFAULT NULL,
  p_assignment      text    DEFAULT 'all',
  p_source_keys     text[]  DEFAULT NULL,
  p_program_ids     uuid[]  DEFAULT NULL
)
RETURNS TABLE (
  source_key      text,
  source_label    text,
  source_enum     lead_source,
  program_id      uuid,
  program_short   text,
  program_name    text,
  total           integer,
  assigned        integer,
  unassigned      integer,
  daily_counts    jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date;
  v_to   date;
  v_tmp  date;
BEGIN
  -- 1. Permission gate (catalog key)
  IF NOT (
    is_super_admin()
    OR is_admin()
    OR user_has_permission('admission.analytics.view')
  ) THEN
    RAISE EXCEPTION 'access denied' USING ERRCODE = '42501';
  END IF;

  -- 2. Date defaults: last 30 days when both ends are NULL
  v_to   := COALESCE(p_to, (CURRENT_DATE AT TIME ZONE 'Asia/Kolkata')::date);
  v_from := COALESCE(p_from, v_to - INTERVAL '30 days');

  -- 3. Swap if reversed (silent — service-layer already toasts)
  IF v_from > v_to THEN
    v_tmp := v_from; v_from := v_to; v_to := v_tmp;
  END IF;

  -- 4. Cap range at 365 days (safety net; service-layer also clamps)
  IF v_to - v_from > 365 THEN
    v_from := v_to - INTERVAL '365 days';
  END IF;

  -- 5. Validate p_assignment
  IF p_assignment NOT IN ('all', 'assigned', 'unassigned') THEN
    RAISE EXCEPTION 'invalid p_assignment: %', p_assignment USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH eligible_institutions AS (
    SELECT i.id
    FROM institutions i
    WHERE role_has_institution_access(i.id)
      AND (p_institution_id IS NULL OR i.id = p_institution_id)
  ),
  lead_window AS (
    SELECT
      l.id,
      l.source,
      l.program_id,
      l.counselor_id,
      (l.created_at AT TIME ZONE 'Asia/Kolkata')::date AS ist_day
    FROM admission_leads l
    WHERE l.institution_id IN (SELECT id FROM eligible_institutions)
      AND (l.created_at AT TIME ZONE 'Asia/Kolkata')::date BETWEEN v_from AND v_to
      AND (
        p_assignment = 'all'
        OR (p_assignment = 'assigned'   AND l.counselor_id IS NOT NULL)
        OR (p_assignment = 'unassigned' AND l.counselor_id IS NULL)
      )
      AND (
        p_program_ids IS NULL
        OR cardinality(p_program_ids) = 0
        OR l.program_id = ANY(p_program_ids)
      )
  ),
  source_resolved AS (
    SELECT
      lw.id,
      lw.source,
      lw.program_id,
      lw.counselor_id,
      lw.ist_day,
      COALESCE(sm.key, lw.source::text) AS source_key,
      COALESCE(
        sm.label,
        initcap(replace(lw.source::text, '_', ' '))
      )                                  AS source_label
    FROM lead_window lw
    LEFT JOIN admission_lead_sources_master sm
      ON sm.enum_value = lw.source::text
  ),
  filtered AS (
    SELECT * FROM source_resolved sr
    WHERE p_source_keys IS NULL
       OR cardinality(p_source_keys) = 0
       OR sr.source_key = ANY(p_source_keys)
  ),
  daily_agg AS (
    SELECT
      f.source_key,
      f.program_id,
      f.ist_day,
      COUNT(*)::integer AS daily_n
    FROM filtered f
    GROUP BY f.source_key, f.program_id, f.ist_day
  ),
  totals AS (
    SELECT
      f.source_key,
      f.source_label,
      f.source AS source_enum,
      f.program_id,
      COUNT(*)::integer                                              AS total,
      COUNT(*) FILTER (WHERE f.counselor_id IS NOT NULL)::integer    AS assigned,
      COUNT(*) FILTER (WHERE f.counselor_id IS NULL)::integer        AS unassigned
    FROM filtered f
    GROUP BY f.source_key, f.source_label, f.source, f.program_id
  ),
  daily_json AS (
    SELECT
      da.source_key,
      da.program_id,
      jsonb_object_agg(to_char(da.ist_day, 'YYYY-MM-DD'), da.daily_n ORDER BY da.ist_day) AS daily_counts
    FROM daily_agg da
    GROUP BY da.source_key, da.program_id
  )
  SELECT
    t.source_key,
    t.source_label,
    t.source_enum,
    t.program_id,
    p.program_id  AS program_short,
    p.program_name,
    t.total,
    t.assigned,
    t.unassigned,
    COALESCE(dj.daily_counts, '{}'::jsonb) AS daily_counts
  FROM totals t
  LEFT JOIN daily_json dj
    ON dj.source_key = t.source_key
   AND dj.program_id IS NOT DISTINCT FROM t.program_id
  LEFT JOIN programs p ON p.id = t.program_id
  ORDER BY t.total DESC, t.source_label, p.program_name NULLS LAST;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_admission_source_coverage_daily(
  uuid, date, date, text, text[], uuid[]
) TO authenticated;

COMMENT ON FUNCTION public.fn_admission_source_coverage_daily(uuid, date, date, text, text[], uuid[]) IS
  'Per-(source, program) daily-pivot aggregator for admission_leads in [p_from, p_to]. Returns total/assigned/unassigned + daily_counts JSONB keyed by IST date. Powers the Source Coverage Daily Pivot and By Program sub-tabs. SECURITY DEFINER + admission.analytics.view permission gate + role_has_institution_access scope.';

COMMIT;
```

- [ ] **Step 3: Apply the migration via MCP**

Use the `mcp__supabase__apply_migration` tool with `name = 'fn_admission_source_coverage_daily'` and the SQL body from Step 2 (without the BEGIN/COMMIT — MCP wraps the migration in its own transaction).

- [ ] **Step 4: Smoke-test the RPC with default args (super-admin will see all-institution scope)**

Use `mcp__supabase__execute_sql`:
```sql
SELECT source_key, source_label, total, assigned, unassigned, jsonb_object_keys(daily_counts) AS sample_day
FROM fn_admission_source_coverage_daily()
LIMIT 5;
```

**Expected:** Rows return for the last 30 days. No error. At least one row has a non-empty `daily_counts` if there are leads in window.

- [ ] **Step 5: Smoke-test with explicit window, assignment filter, source filter**

```sql
SELECT source_key, total, assigned, unassigned
FROM fn_admission_source_coverage_daily(
  NULL,
  (CURRENT_DATE - INTERVAL '7 days')::date,
  CURRENT_DATE,
  'unassigned',
  ARRAY['walk_in', 'website'],
  NULL
)
ORDER BY total DESC;
```

**Expected:** Only `walk_in` and `website` rows, with `assigned = 0` (filter is `unassigned`).

- [ ] **Step 6: Smoke-test permission gate (impersonate a non-privileged user)**

Per memory `reference_rls_impersonation_via_jwt_claims`:
```sql
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
SELECT count(*) FROM fn_admission_source_coverage_daily();
ROLLBACK;
```

**Expected:** `ERROR: access denied` (sub UUID doesn't hold `admission.analytics.view`).

- [ ] **Step 7: Commit the migration**

```bash
git add supabase/migrations/<TS>_fn_admission_source_coverage_daily.sql
git commit -m "feat(admission/analytics): RPC fn_admission_source_coverage_daily

Per-(source, program) daily pivot aggregator for admission_leads. Returns
total/assigned/unassigned + daily_counts JSONB keyed by IST date. Powers
the new Daily Pivot and By Program sub-tabs of Source Coverage.

- SECURITY DEFINER with admission.analytics.view permission gate
- Scope via role_has_institution_access (eligible_institutions CTE)
- Date range capped at 365 days; reversed range silently swapped
- Mirrors fn_seat_analytics_daily_pivot's IST bucketing for column alignment

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: SQL Verification Script — `test_fn_admission_source_coverage_daily.sql`

**Files:**
- Create: `supabase/tests/test_fn_admission_source_coverage_daily.sql`

**Context:** This project doesn't have pgTAP installed; tests are SQL scripts executed via `mcp__supabase__execute_sql` that ROLLBACK at the end. The pattern: insert fixture rows inside a transaction, assert the RPC output, then `ROLLBACK` so the DB is untouched.

- [ ] **Step 1: Write the test script**

Create `supabase/tests/test_fn_admission_source_coverage_daily.sql` with this exact content:

```sql
-- ============================================================================
-- Manual verification for fn_admission_source_coverage_daily
-- Run via mcp__supabase__execute_sql. All statements wrap in a transaction
-- that ROLLS BACK so nothing is persisted.
-- ============================================================================

BEGIN;

-- Pick a real institution + counselor for fixture data
DO $$
DECLARE
  v_inst        uuid;
  v_counselor   uuid;
  v_program_a   uuid;
  v_program_b   uuid;
  v_today       date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_result      RECORD;
  v_total       integer;
BEGIN
  SELECT id INTO v_inst FROM institutions ORDER BY name LIMIT 1;
  SELECT id INTO v_counselor FROM profiles WHERE role IN ('counselor','admission_counselor') LIMIT 1;
  SELECT id INTO v_program_a FROM programs WHERE institution_id = v_inst ORDER BY program_name LIMIT 1;
  SELECT id INTO v_program_b FROM programs WHERE institution_id = v_inst ORDER BY program_name OFFSET 1 LIMIT 1;

  RAISE NOTICE 'Fixture: inst=% counselor=% prog_a=% prog_b=%',
    v_inst, v_counselor, v_program_a, v_program_b;

  -- 5 fixture leads: 2 walk_in × prog_a (1 assigned, 1 unassigned, both today),
  --                  2 website × prog_b (both yesterday, both assigned),
  --                  1 walk_in unassigned with NULL program today
  INSERT INTO admission_leads
    (id, institution_id, source, program_id, counselor_id, phone, first_name, created_at, funnel_stage)
  VALUES
    (gen_random_uuid(), v_inst, 'walk_in', v_program_a, v_counselor,    '9000000001', 'TestA1', now(), 'new'),
    (gen_random_uuid(), v_inst, 'walk_in', v_program_a, NULL,           '9000000002', 'TestA2', now(), 'new'),
    (gen_random_uuid(), v_inst, 'website', v_program_b, v_counselor,    '9000000003', 'TestB1', now() - interval '1 day', 'new'),
    (gen_random_uuid(), v_inst, 'website', v_program_b, v_counselor,    '9000000004', 'TestB2', now() - interval '1 day', 'new'),
    (gen_random_uuid(), v_inst, 'walk_in', NULL,        NULL,           '9000000005', 'TestC1', now(), 'new');

  -- Assertion 1: per-source totals for last 7 days
  SELECT COUNT(*) INTO v_total
  FROM fn_admission_source_coverage_daily(v_inst, v_today - 7, v_today);
  RAISE NOTICE 'Row count (last 7d, all assignment): % (expect 3 rows: walk_in×prog_a, walk_in×NULL, website×prog_b)', v_total;
  ASSERT v_total = 3, format('Expected 3 (source, program) groups, got %s', v_total);

  -- Assertion 2: walk_in × prog_a → total=2, assigned=1, unassigned=1
  SELECT total, assigned, unassigned INTO v_result
  FROM fn_admission_source_coverage_daily(v_inst, v_today - 7, v_today)
  WHERE source_key = 'walk_in' AND program_id = v_program_a;
  ASSERT v_result.total = 2 AND v_result.assigned = 1 AND v_result.unassigned = 1,
    format('walk_in×prog_a wrong: total=%s assigned=%s unassigned=%s',
      v_result.total, v_result.assigned, v_result.unassigned);

  -- Assertion 3: 'unassigned' filter excludes assigned rows
  SELECT COUNT(*) INTO v_total
  FROM fn_admission_source_coverage_daily(v_inst, v_today - 7, v_today, 'unassigned');
  ASSERT v_total = 2, format('unassigned filter: expected 2 rows (walk_in×prog_a, walk_in×NULL), got %s', v_total);

  -- Assertion 4: source filter narrows correctly
  SELECT COUNT(*) INTO v_total
  FROM fn_admission_source_coverage_daily(v_inst, v_today - 7, v_today, 'all', ARRAY['website']);
  ASSERT v_total = 1, format('source filter website: expected 1 row, got %s', v_total);

  -- Assertion 5: daily_counts JSONB keys present and correct
  SELECT daily_counts->>(to_char(v_today, 'YYYY-MM-DD')) INTO v_result
  FROM fn_admission_source_coverage_daily(v_inst, v_today - 7, v_today)
  WHERE source_key = 'walk_in' AND program_id = v_program_a;
  ASSERT v_result IS NOT NULL, 'daily_counts missing today key for walk_in×prog_a';

  -- Assertion 6: invalid p_assignment errors out
  BEGIN
    PERFORM * FROM fn_admission_source_coverage_daily(v_inst, v_today - 7, v_today, 'bogus');
    ASSERT FALSE, 'expected invalid p_assignment to raise';
  EXCEPTION WHEN OTHERS THEN
    -- Good
    NULL;
  END;

  RAISE NOTICE 'All assertions passed.';
END $$;

ROLLBACK;
```

- [ ] **Step 2: Run the test via MCP**

Execute the full file content via `mcp__supabase__execute_sql`.

**Expected output (in NOTICEs):**
```
NOTICE:  Fixture: inst=... counselor=... prog_a=... prog_b=...
NOTICE:  Row count (last 7d, all assignment): 3 ...
NOTICE:  All assertions passed.
ROLLBACK
```

If any `ASSERT` fails, the script raises and the transaction rolls back — read the error message, fix the RPC body (Task 1 Step 2), re-apply the migration, re-run this script.

- [ ] **Step 3: Commit the test script**

```bash
git add supabase/tests/test_fn_admission_source_coverage_daily.sql
git commit -m "test(admission/analytics): fixture-based verification for fn_admission_source_coverage_daily

Inserts 5 fixture leads inside a transaction, asserts the RPC returns
3 (source, program) groups with correct total/assigned/unassigned counts
and daily_counts JSONB shape, then ROLLBACK. Includes assertions for
the assignment, source, and validation paths.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: TypeScript Types

**Files:**
- Create: `types/admission/source-coverage.ts`

- [ ] **Step 1: Find the existing LeadSource type to import**

Run:
```bash
grep -n "export type LeadSource\b\|export type lead_source" types/admission/*.ts | head -5
```
Note the source file (likely `types/admission/index.ts` or `types/admission/leads.ts`). Use that import path in Step 2.

- [ ] **Step 2: Write the new types file**

Create `types/admission/source-coverage.ts` with this exact content (replace the LeadSource import path if Step 1 found a different one):

```ts
// Per-(source, program) daily-pivot row returned by
// fn_admission_source_coverage_daily. Powers the Source Coverage
// Daily Pivot and By Program sub-tabs on /admission/analytics.

import type { LeadSource } from '@/types/admission';

export interface SourceCoverageRow {
  source_key: string;
  source_label: string;
  source_enum: LeadSource;
  /** Null when the lead has no assigned program (Unassigned bucket). */
  program_id: string | null;
  program_short: string | null;
  program_name: string | null;
  total: number;
  assigned: number;
  unassigned: number;
  /** Keyed by ISO YYYY-MM-DD (IST bucket). Values are integer lead counts. */
  daily_counts: Record<string, number>;
}

export type AssignmentFilter = 'all' | 'assigned' | 'unassigned';

export interface SourceCoverageFilters {
  /** Undefined = all RLS-accessible institutions (super-admin path). */
  institution_id?: string;
  /** ISO YYYY-MM-DD, inclusive. */
  from: string;
  /** ISO YYYY-MM-DD, inclusive. */
  to: string;
  assignment: AssignmentFilter;
  /** Empty = no narrowing. */
  source_keys: string[];
  /** Empty = no narrowing. NULL program rows are always included unless source/assignment filters exclude them. */
  program_ids: string[];
}
```

- [ ] **Step 3: Verify it compiles**

Run:
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "source-coverage" ; echo "---END---"
```
**Expected:** only `---END---` (no errors).

- [ ] **Step 4: Commit**

```bash
git add types/admission/source-coverage.ts
git commit -m "feat(admission/analytics): SourceCoverageRow + SourceCoverageFilters types

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Service Layer — `SourceCoverageService.getDailyCoverage`

**Files:**
- Create: `lib/services/admission/source-coverage-service.ts`

**Context:** The service wraps the RPC call. Per project memories: destructure `{ error }` from supabase mutations, use `getErrorMessage()` (project utility), and clamp range client-side. Returned array has an optional `__clampedRange` flag so the hook can toast a warning.

- [ ] **Step 1: Find the project's getErrorMessage utility**

Run:
```bash
grep -n "export function getErrorMessage\|export const getErrorMessage" lib/utils.ts lib/utils/*.ts 2>/dev/null | head -5
```
Note the import path. Standard project path is `@/lib/utils`.

- [ ] **Step 2: Write the service file**

Create `lib/services/admission/source-coverage-service.ts` with this exact content:

```ts
import { createClientSupabaseClient } from '@/lib/supabase/client';
import { getErrorMessage } from '@/lib/utils';
import type {
  SourceCoverageFilters,
  SourceCoverageRow,
} from '@/types/admission/source-coverage';

/**
 * Detailed source-coverage analytics for the admission Source Coverage tab.
 *
 * Single method: getDailyCoverage(filters) returns per-(source, program)
 * rows with daily_counts JSONB for the requested window. Powers both the
 * Daily Pivot grid (folds rows to per-source) and the By Program grid
 * (uses rows as-is).
 *
 * Client-side guardrails:
 *  - Range > 365 days is clamped to 365 (the RPC also enforces this)
 *  - Swapped from/to is left to the RPC to swap silently (we don't toast
 *    on the silent swap; only on the clamp)
 *  - Empty filter arrays are sent as null so the RPC's "no narrowing"
 *    branch fires; Supabase otherwise serialises [] as text[] and the
 *    `cardinality(...) = 0` check still works, but sending null is
 *    semantically cleaner and matches the seat-pivot service.
 */
export class SourceCoverageService {
  static async getDailyCoverage(
    filters: SourceCoverageFilters,
  ): Promise<SourceCoverageRow[] & { __clampedRange?: boolean }> {
    const supabase = createClientSupabaseClient();

    // Clamp range at 365 days
    const fromDate = new Date(filters.from);
    const toDate = new Date(filters.to);
    const dayMs = 24 * 60 * 60 * 1000;
    let from = filters.from;
    let clamped = false;
    if (toDate.getTime() - fromDate.getTime() > 365 * dayMs) {
      const clampedFrom = new Date(toDate.getTime() - 365 * dayMs);
      from = clampedFrom.toISOString().slice(0, 10);
      clamped = true;
    }

    const { data, error } = await supabase.rpc(
      'fn_admission_source_coverage_daily',
      {
        p_institution_id: filters.institution_id ?? null,
        p_from: from,
        p_to: filters.to,
        p_assignment: filters.assignment,
        p_source_keys:
          filters.source_keys.length === 0 ? null : filters.source_keys,
        p_program_ids:
          filters.program_ids.length === 0 ? null : filters.program_ids,
      },
    );

    if (error) {
      throw new Error(
        `SourceCoverageService.getDailyCoverage: ${getErrorMessage(error)}`,
      );
    }

    const rows = (data ?? []) as SourceCoverageRow[];
    if (clamped) {
      (rows as SourceCoverageRow[] & { __clampedRange?: boolean }).__clampedRange = true;
    }
    return rows as SourceCoverageRow[] & { __clampedRange?: boolean };
  }
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "source-coverage-service" ; echo "---END---"
```
**Expected:** only `---END---`.

- [ ] **Step 4: Commit**

```bash
git add lib/services/admission/source-coverage-service.ts
git commit -m "feat(admission/analytics): SourceCoverageService.getDailyCoverage

Wraps fn_admission_source_coverage_daily with client-side 365-day clamp
and empty-array-to-null conversion for the source/program filters. Surfaces
a __clampedRange flag on the returned array for the hook to toast a warning.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: React Query Hook — `useSourceCoverageDaily`

**Files:**
- Create: `hooks/admission/use-source-coverage-daily.ts`

**Context:** Standard tanstack-query hook. The query is disabled when filters indicate the user is on the Summary tab (we pass `enabled` from the caller). The hook also toasts a one-time warning if the service returned a clamped range.

- [ ] **Step 1: Find the toast library used by other admission hooks**

```bash
grep -n "from 'react-hot-toast'\|from 'sonner'" hooks/admission/*.ts | head -5
```
Note which toast lib is used. Standard project pattern is `react-hot-toast`.

- [ ] **Step 2: Write the hook**

Create `hooks/admission/use-source-coverage-daily.ts`:

```ts
'use client';

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { SourceCoverageService } from '@/lib/services/admission/source-coverage-service';
import type {
  SourceCoverageFilters,
  SourceCoverageRow,
} from '@/types/admission/source-coverage';

/**
 * TanStack Query hook for the Source Coverage Daily Pivot / By Program tabs.
 *
 * Toasts a one-time warning when the service had to clamp the date range
 * (>365 days). The toast suppression uses a ref so a second render with
 * the same clamped result doesn't re-fire.
 */
export function useSourceCoverageDaily(
  filters: SourceCoverageFilters,
  options: { enabled?: boolean } = {},
) {
  const { enabled = true } = options;
  const toastedRef = useRef(false);

  const query = useQuery<
    SourceCoverageRow[] & { __clampedRange?: boolean }
  >({
    queryKey: ['admission-source-coverage-daily', filters],
    queryFn: () => SourceCoverageService.getDailyCoverage(filters),
    enabled,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (query.data?.__clampedRange && !toastedRef.current) {
      toast('Date range capped at 365 days for performance.', { icon: '⚠️' });
      toastedRef.current = true;
    }
    if (!query.data?.__clampedRange) {
      toastedRef.current = false;
    }
  }, [query.data]);

  return query;
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "use-source-coverage-daily" ; echo "---END---"
```
**Expected:** only `---END---`.

- [ ] **Step 4: Commit**

```bash
git add hooks/admission/use-source-coverage-daily.ts
git commit -m "feat(admission/analytics): useSourceCoverageDaily hook

TanStack Query wrapper for SourceCoverageService with one-time clamped-range
toast. queryKey = ['admission-source-coverage-daily', filters] — each filter
change is a new cache entry.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Filter Bar Component — `SourceCoverageFilterBar`

**Files:**
- Create: `components/admission/source-coverage/source-coverage-filter-bar.tsx`

**Context:** Single source of truth for filter state lives in the parent (`SourceCoverageDashboard`); this component is fully controlled. Mirrors the fees-structure filter-card pattern (commit 8f11b9502): `rounded-lg border bg-card p-3 space-y-3`, primary row + collapsible advanced row. Date pickers use `calendar-date-picker.tsx`. Source/program multi-selects use shadcn Popover + Command for the chip UX.

- [ ] **Step 1: Inspect the calendar-date-picker contract**

```bash
head -60 components/data-table/calendar-date-picker.tsx
```
Note the props: it accepts `{ date: { from, to }, onDateSelect }`. Use the same prop shape in this component.

- [ ] **Step 2: Verify a multi-select chip component exists or fall back to a basic listbox**

```bash
grep -rln "MultiSelect\b" components/ui/ | head -5
```
If a `multi-select.tsx` exists, use it. Otherwise use the inline `Popover + Command + Checkbox` pattern shown in this file's component body.

- [ ] **Step 3: Write the filter bar component**

Create `components/admission/source-coverage/source-coverage-filter-bar.tsx`:

```tsx
'use client';

// Controlled filter card for the Source Coverage tabs. Owns no state —
// emits onChange to the parent (SourceCoverageDashboard) which holds the
// filter source of truth.
//
// Layout pattern matches the fees-structure filter card landed
// 2026-05-18 (commit 8f11b9502): rounded-lg border bg-card with a
// primary row + a collapsible advanced row separated by border-t.

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { CalendarDatePicker } from '@/components/data-table/calendar-date-picker';
import { Filter, RotateCcw, ChevronDown } from 'lucide-react';
import type {
  AssignmentFilter,
  SourceCoverageFilters,
} from '@/types/admission/source-coverage';

interface InstitutionOption {
  id: string;
  name: string;
}

interface SourceOption {
  key: string;
  label: string;
}

interface ProgramOption {
  id: string;
  program_name: string;
}

interface SourceCoverageFilterBarProps {
  filters: SourceCoverageFilters;
  onChange: (next: SourceCoverageFilters) => void;
  institutions: InstitutionOption[];
  sources: SourceOption[];
  programs: ProgramOption[];
  defaults: SourceCoverageFilters;
}

const ALL = 'all';

export function SourceCoverageFilterBar({
  filters,
  onChange,
  institutions,
  sources,
  programs,
  defaults,
}: SourceCoverageFilterBarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const advancedCount =
    filters.source_keys.length + filters.program_ids.length;

  const hasAnyFilter = useMemo(() => {
    return (
      filters.institution_id !== defaults.institution_id ||
      filters.from !== defaults.from ||
      filters.to !== defaults.to ||
      filters.assignment !== defaults.assignment ||
      filters.source_keys.length > 0 ||
      filters.program_ids.length > 0
    );
  }, [filters, defaults]);

  const update = (patch: Partial<SourceCoverageFilters>) =>
    onChange({ ...filters, ...patch });

  const toggleArray = (
    key: 'source_keys' | 'program_ids',
    value: string,
  ) => {
    const set = new Set(filters[key]);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    update({ [key]: Array.from(set) } as Partial<SourceCoverageFilters>);
  };

  return (
    <div className="mb-3 rounded-lg border bg-card p-3 space-y-3">
      {/* Primary row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground pr-1 shrink-0">
          <Filter className="h-3.5 w-3.5" />
          <span>Filters</span>
        </div>

        <Select
          value={filters.institution_id ?? ALL}
          onValueChange={(v) =>
            update({
              institution_id: v === ALL ? undefined : v,
              // Programs are institution-scoped — clear when institution changes.
              program_ids: [],
            })
          }
        >
          <SelectTrigger className="w-full sm:w-44 h-8 text-xs">
            <SelectValue placeholder="All institutions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All institutions</SelectItem>
            {institutions.map((i) => (
              <SelectItem key={i.id} value={i.id}>
                {i.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="w-full sm:w-auto">
          <CalendarDatePicker
            date={{ from: new Date(filters.from), to: new Date(filters.to) }}
            onDateSelect={({ from, to }) =>
              update({
                from: (from ?? new Date()).toISOString().slice(0, 10),
                to: (to ?? new Date()).toISOString().slice(0, 10),
              })
            }
            className="w-full sm:w-[260px] h-8"
            variant="outline"
          />
        </div>

        <Select
          value={filters.assignment}
          onValueChange={(v) =>
            update({ assignment: v as AssignmentFilter })
          }
        >
          <SelectTrigger className="w-full sm:w-36 h-8 text-xs">
            <SelectValue placeholder="Assignment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All leads</SelectItem>
            <SelectItem value="assigned">Assigned only</SelectItem>
            <SelectItem value="unassigned">Unassigned only</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant={showAdvanced ? 'secondary' : 'outline'}
          size="sm"
          className="h-8 gap-1 px-2.5 shrink-0"
          onClick={() => setShowAdvanced((p) => !p)}
          aria-expanded={showAdvanced}
          aria-controls="source-coverage-advanced-filters"
        >
          <Filter className="h-3.5 w-3.5" />
          <span className="text-xs">More</span>
          {advancedCount > 0 && (
            <span className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              {advancedCount}
            </span>
          )}
        </Button>

        {hasAnyFilter && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0"
            onClick={() => onChange(defaults)}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
          </Button>
        )}
      </div>

      {/* Advanced row */}
      {showAdvanced && (
        <div
          id="source-coverage-advanced-filters"
          className="border-t pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          {/* Sources multi-select */}
          <div className="space-y-1">
            <Label className="text-xs">Sources</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-full justify-between font-normal"
                >
                  {filters.source_keys.length === 0
                    ? 'All sources'
                    : `${filters.source_keys.length} selected`}
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-2">
                <div className="max-h-72 overflow-y-auto space-y-1">
                  {sources.length === 0 && (
                    <p className="text-xs text-muted-foreground p-2">
                      No sources configured.
                    </p>
                  )}
                  {sources.map((s) => {
                    const checked = filters.source_keys.includes(s.key);
                    return (
                      <label
                        key={s.key}
                        className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() =>
                            toggleArray('source_keys', s.key)
                          }
                        />
                        <span className="flex-1">{s.label}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {s.key}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
            {filters.source_keys.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {filters.source_keys.map((k) => (
                  <Badge
                    key={k}
                    variant="secondary"
                    className="text-[10px] cursor-pointer"
                    onClick={() => toggleArray('source_keys', k)}
                  >
                    {sources.find((s) => s.key === k)?.label ?? k} ×
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Programs multi-select (disabled until institution selected) */}
          <div className="space-y-1">
            <Label className="text-xs">Programs</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-full justify-between font-normal"
                  disabled={!filters.institution_id}
                >
                  {!filters.institution_id
                    ? 'Pick institution first'
                    : filters.program_ids.length === 0
                      ? 'All programs'
                      : `${filters.program_ids.length} selected`}
                  <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-2">
                <div className="max-h-72 overflow-y-auto space-y-1">
                  {programs.length === 0 && (
                    <p className="text-xs text-muted-foreground p-2">
                      No programs in this institution.
                    </p>
                  )}
                  {programs.map((p) => {
                    const checked = filters.program_ids.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-muted cursor-pointer"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() =>
                            toggleArray('program_ids', p.id)
                          }
                        />
                        <span className="flex-1">{p.program_name}</span>
                      </label>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
            {filters.program_ids.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {filters.program_ids.map((id) => (
                  <Badge
                    key={id}
                    variant="secondary"
                    className="text-[10px] cursor-pointer"
                    onClick={() => toggleArray('program_ids', id)}
                  >
                    {programs.find((p) => p.id === id)?.program_name ?? id} ×
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify it compiles**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "source-coverage-filter-bar" ; echo "---END---"
```
**Expected:** only `---END---`.

- [ ] **Step 5: Commit**

```bash
git add components/admission/source-coverage/source-coverage-filter-bar.tsx
git commit -m "feat(admission/analytics): SourceCoverageFilterBar component

Controlled filter card mirroring the fees-structure pattern. Primary row:
institution / date range / assignment / More toggle / Reset. Advanced row:
sources multi-select chip popover + programs multi-select chip popover.
Programs picker disables until institution is set.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Daily Pivot Grid — `SourceCoverageDailyGrid` + snapshot test

**Files:**
- Create: `components/admission/source-coverage/source-coverage-daily-grid.tsx`
- Create: `components/admission/source-coverage/source-coverage-daily-grid.test.tsx`

**Context:** Sticky-left columns + horizontal-scroll date columns. Folds rows to per-source totals (sums program-sub-rows). Heat tint: cells ≥ 75th percentile of that row's non-zero daily counts in the visible window. Mirrors the structural pattern of `seat-pivot-grid.tsx`.

- [ ] **Step 1: Write the snapshot test first (failing — file doesn't exist)**

Create `components/admission/source-coverage/source-coverage-daily-grid.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SourceCoverageDailyGrid } from './source-coverage-daily-grid';
import type { SourceCoverageRow } from '@/types/admission/source-coverage';

const fixture: SourceCoverageRow[] = [
  {
    source_key: 'walk_in',
    source_label: 'Walk In',
    source_enum: 'walk_in' as any,
    program_id: '00000000-0000-0000-0000-000000000001',
    program_short: 'BBA',
    program_name: 'Bachelor of Business Administration',
    total: 5,
    assigned: 3,
    unassigned: 2,
    daily_counts: { '2026-05-15': 2, '2026-05-16': 3 },
  },
  {
    source_key: 'walk_in',
    source_label: 'Walk In',
    source_enum: 'walk_in' as any,
    program_id: null,
    program_short: null,
    program_name: null,
    total: 1,
    assigned: 0,
    unassigned: 1,
    daily_counts: { '2026-05-16': 1 },
  },
  {
    source_key: 'website',
    source_label: 'Website',
    source_enum: 'website' as any,
    program_id: '00000000-0000-0000-0000-000000000002',
    program_short: 'BTech',
    program_name: 'Bachelor of Technology',
    total: 4,
    assigned: 4,
    unassigned: 0,
    daily_counts: { '2026-05-15': 4 },
  },
];

describe('SourceCoverageDailyGrid', () => {
  it('renders an empty-state when no rows', () => {
    const { container } = render(<SourceCoverageDailyGrid rows={[]} />);
    expect(container.textContent).toMatch(/No leads matched/i);
  });

  it('folds program sub-rows into per-source totals', () => {
    const { container } = render(<SourceCoverageDailyGrid rows={fixture} />);
    // Walk In should have total = 5 + 1 = 6
    expect(container.textContent).toContain('Walk In');
    expect(container.textContent).toContain('6');
    // Website should have total = 4
    expect(container.textContent).toContain('Website');
  });

  it('renders one column per unique IST date across all rows', () => {
    const { getAllByRole } = render(<SourceCoverageDailyGrid rows={fixture} />);
    // 2 dates: 2026-05-15, 2026-05-16
    const headers = getAllByRole('columnheader');
    // 5 sticky + 2 date columns
    expect(headers.length).toBeGreaterThanOrEqual(7);
  });

  it('matches snapshot for typical data', () => {
    const { container } = render(<SourceCoverageDailyGrid rows={fixture} />);
    expect(container.innerHTML).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run the test (it must fail because the component doesn't exist)**

```bash
npx vitest run components/admission/source-coverage/source-coverage-daily-grid.test.tsx
```
**Expected:** FAIL with `Cannot find module './source-coverage-daily-grid'`.

- [ ] **Step 3: Write the component**

Create `components/admission/source-coverage/source-coverage-daily-grid.tsx`:

```tsx
'use client';

// Source Coverage Daily Pivot grid — folds per-(source, program) rows
// into per-source rows with one column per date. Sticky-left structural
// columns, horizontal-scroll date columns. Mirrors seat-pivot-grid.tsx.

import { useMemo } from 'react';
import type { SourceCoverageRow } from '@/types/admission/source-coverage';

interface SourceCoverageDailyGridProps {
  rows: SourceCoverageRow[];
}

interface SourceAggRow {
  source_key: string;
  source_label: string;
  total: number;
  assigned: number;
  unassigned: number;
  daily_counts: Record<string, number>;
}

function formatDateHeader(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}

export function SourceCoverageDailyGrid({
  rows,
}: SourceCoverageDailyGridProps) {
  // 1. Union of dates across all rows, sorted ascending.
  const dateColumns = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) {
      for (const k of Object.keys(r.daily_counts)) set.add(k);
    }
    return Array.from(set).sort();
  }, [rows]);

  // 2. Fold (source, program) rows into per-source aggregates.
  const sourceAgg = useMemo<SourceAggRow[]>(() => {
    const map = new Map<string, SourceAggRow>();
    for (const r of rows) {
      const cur = map.get(r.source_key);
      if (cur) {
        cur.total += r.total;
        cur.assigned += r.assigned;
        cur.unassigned += r.unassigned;
        for (const [d, c] of Object.entries(r.daily_counts)) {
          cur.daily_counts[d] = (cur.daily_counts[d] ?? 0) + c;
        }
      } else {
        map.set(r.source_key, {
          source_key: r.source_key,
          source_label: r.source_label,
          total: r.total,
          assigned: r.assigned,
          unassigned: r.unassigned,
          daily_counts: { ...r.daily_counts },
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [rows]);

  // 3. Grand totals across all sources.
  const grandTotal = useMemo(() => {
    let total = 0,
      assigned = 0,
      unassigned = 0;
    const daily: Record<string, number> = {};
    for (const s of sourceAgg) {
      total += s.total;
      assigned += s.assigned;
      unassigned += s.unassigned;
      for (const [d, c] of Object.entries(s.daily_counts)) {
        daily[d] = (daily[d] ?? 0) + c;
      }
    }
    return { total, assigned, unassigned, daily };
  }, [sourceAgg]);

  // 4. Per-row 75th-percentile threshold for heat tint (non-zero values only,
  //    across the visible date columns).
  const rowThresholds = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sourceAgg) {
      const values: number[] = [];
      for (const d of dateColumns) {
        const v = s.daily_counts[d] ?? 0;
        if (v > 0) values.push(v);
      }
      map.set(s.source_key, quantile(values, 0.75));
    }
    return map;
  }, [sourceAgg, dateColumns]);

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        No leads matched these filters in the selected window.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide">
          <tr>
            <th role="columnheader" className="sticky left-0 z-10 bg-muted/50 px-3 py-2 text-left">
              Source
            </th>
            <th role="columnheader" className="px-3 py-2 text-right">Total</th>
            <th role="columnheader" className="px-3 py-2 text-right">Assigned</th>
            <th role="columnheader" className="px-3 py-2 text-right">Unassigned</th>
            {dateColumns.map((d) => (
              <th key={d} role="columnheader" className="px-2 py-2 text-right whitespace-nowrap">
                {formatDateHeader(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sourceAgg.map((s) => {
            const threshold = rowThresholds.get(s.source_key) ?? 0;
            return (
              <tr key={s.source_key} className="border-t hover:bg-muted/30">
                <td className="sticky left-0 z-10 bg-background px-3 py-2">
                  <div className="font-medium">{s.source_label}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    {s.source_key}
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">
                  {s.total.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                  {s.assigned.toLocaleString()}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${s.unassigned > 0 ? 'text-orange-700 font-medium' : 'text-muted-foreground'}`}>
                  {s.unassigned.toLocaleString()}
                </td>
                {dateColumns.map((d) => {
                  const v = s.daily_counts[d];
                  if (!v) {
                    return (
                      <td key={d} className="px-2 py-2 text-right text-muted-foreground tabular-nums">
                        —
                      </td>
                    );
                  }
                  const hot = threshold > 0 && v >= threshold;
                  return (
                    <td
                      key={d}
                      className={`px-2 py-2 text-right tabular-nums ${hot ? 'bg-blue-50 font-medium' : ''}`}
                    >
                      {v.toLocaleString()}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {/* Grand total row */}
          <tr className="border-t bg-muted/30 font-semibold">
            <td className="sticky left-0 z-10 bg-muted/30 px-3 py-2">All sources</td>
            <td className="px-3 py-2 text-right tabular-nums">{grandTotal.total.toLocaleString()}</td>
            <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{grandTotal.assigned.toLocaleString()}</td>
            <td className="px-3 py-2 text-right tabular-nums">{grandTotal.unassigned.toLocaleString()}</td>
            {dateColumns.map((d) => (
              <td key={d} className="px-2 py-2 text-right tabular-nums">
                {grandTotal.daily[d]?.toLocaleString() ?? '—'}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run the test — first run also writes the snapshot baseline**

```bash
npx vitest run components/admission/source-coverage/source-coverage-daily-grid.test.tsx
```
**Expected:** PASS, with snapshot file written to `components/admission/source-coverage/__snapshots__/source-coverage-daily-grid.test.tsx.snap`.

- [ ] **Step 5: Eyeball the snapshot file to confirm it's not nonsense**

```bash
cat components/admission/source-coverage/__snapshots__/source-coverage-daily-grid.test.tsx.snap
```
**Expected:** Contains "Walk In", "Website", "All sources", and the date headers 15/05/26 and 16/05/26.

- [ ] **Step 6: Commit (grid only — XLSX export lands in Steps 7-11)**

```bash
git add components/admission/source-coverage/source-coverage-daily-grid.tsx components/admission/source-coverage/source-coverage-daily-grid.test.tsx components/admission/source-coverage/__snapshots__/
git commit -m "feat(admission/analytics): SourceCoverageDailyGrid component + snapshot test

Sticky-left columns (Source / Total / Assigned / Unassigned) plus one
scroll column per IST date in the data window. Folds per-(source, program)
rows into per-source aggregates. Per-row 75th-percentile heat tint highlights
spikes against that source's own non-zero daily distribution.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 7: Verify `xlsx` is already a project dependency**

```bash
grep -q '"xlsx"' package.json && echo "OK" || echo "MISSING"
```
**Expected:** `OK`. The `seat-pivot-grid` already uses `xlsx`, so it must be there. If `MISSING`, run `npm install xlsx` and commit the package.json/lockfile changes as a separate prep commit.

- [ ] **Step 8: Add XLSX export helper to the grid file**

In `components/admission/source-coverage/source-coverage-daily-grid.tsx`, **above** the `SourceCoverageDailyGrid` function definition, add this helper (sibling to `quantile`):

```tsx
import * as XLSX from 'xlsx';

function exportDailyPivotXlsx(
  sourceAgg: SourceAggRow[],
  dateColumns: string[],
  grandTotal: { total: number; assigned: number; unassigned: number; daily: Record<string, number> },
): void {
  // One row per source + a grand-total row at the bottom.
  // Columns: Source label / Key / Total / Assigned / Unassigned + one per date.
  const header = [
    'Source',
    'Key',
    'Total',
    'Assigned',
    'Unassigned',
    ...dateColumns.map((d) => {
      const [y, m, day] = d.split('-');
      return `${day}/${m}/${y.slice(2)}`;
    }),
  ];

  const rows = sourceAgg.map((s) => [
    s.source_label,
    s.source_key,
    s.total,
    s.assigned,
    s.unassigned,
    ...dateColumns.map((d) => s.daily_counts[d] ?? ''),
  ]);

  rows.push([
    'All sources',
    '',
    grandTotal.total,
    grandTotal.assigned,
    grandTotal.unassigned,
    ...dateColumns.map((d) => grandTotal.daily[d] ?? ''),
  ]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Source Coverage');
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `source-coverage-daily-${today}.xlsx`);
}
```

- [ ] **Step 9: Add an Export button to the grid header**

Replace the grid's top-level `<div className="overflow-x-auto rounded-md border">` opening with the following structure (wrap the existing table inside a new outer div that has the export button at the top):

```tsx
<div className="space-y-2">
  <div className="flex justify-end">
    <button
      type="button"
      className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
      onClick={() => exportDailyPivotXlsx(sourceAgg, dateColumns, grandTotal)}
      disabled={sourceAgg.length === 0}
      aria-label="Export Daily Pivot to XLSX"
    >
      Export XLSX
    </button>
  </div>
  <div className="overflow-x-auto rounded-md border">
    {/* existing <table>...</table> stays here unchanged */}
  </div>
</div>
```

Make sure the empty-state branch (the `if (rows.length === 0)` short-circuit) returns its existing `<div className="rounded-md border border-dashed ...">` *outside* this new wrapper — the export button shouldn't render on empty state.

- [ ] **Step 10: Add a snapshot test variant covering the export button presence**

Append this `it()` block to `components/admission/source-coverage/source-coverage-daily-grid.test.tsx`:

```tsx
it('renders an export button when rows exist', () => {
  const { getByLabelText } = render(<SourceCoverageDailyGrid rows={fixture} />);
  expect(getByLabelText(/Export Daily Pivot to XLSX/i)).toBeTruthy();
});

it('does not render an export button on empty state', () => {
  const { queryByLabelText } = render(<SourceCoverageDailyGrid rows={[]} />);
  expect(queryByLabelText(/Export Daily Pivot to XLSX/i)).toBeNull();
});
```

Run:
```bash
npx vitest run components/admission/source-coverage/source-coverage-daily-grid.test.tsx
```
**Expected:** Both new tests PASS. The original snapshot test will FAIL because the DOM changed; rerun with `-u` to update:
```bash
npx vitest run components/admission/source-coverage/source-coverage-daily-grid.test.tsx -u
```
**Expected:** All tests PASS, snapshot file updated.

- [ ] **Step 11: Commit the export work**

```bash
git add components/admission/source-coverage/source-coverage-daily-grid.tsx components/admission/source-coverage/source-coverage-daily-grid.test.tsx components/admission/source-coverage/__snapshots__/
git commit -m "feat(admission/analytics): XLSX export for Source Coverage Daily Pivot

Adds an Export button to the grid header that writes a workbook with
one row per source plus a grand-total row. Columns: Source / Key /
Total / Assigned / Unassigned + one column per date in the visible
window. File naming: source-coverage-daily-YYYY-MM-DD.xlsx.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: By Program Grid — `SourceCoverageByProgramGrid` + snapshot test

**Files:**
- Create: `components/admission/source-coverage/source-coverage-by-program-grid.tsx`
- Create: `components/admission/source-coverage/source-coverage-by-program-grid.test.tsx`

**Context:** No date columns. Groups by source label; program sub-rows indented; per-source subtotal; grand-total at bottom. `program_id IS NULL` rows render at the bottom of their source group with `— Unassigned —` (italic).

- [ ] **Step 1: Write the snapshot test first**

Create `components/admission/source-coverage/source-coverage-by-program-grid.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { SourceCoverageByProgramGrid } from './source-coverage-by-program-grid';
import type { SourceCoverageRow } from '@/types/admission/source-coverage';

const fixture: SourceCoverageRow[] = [
  {
    source_key: 'walk_in',
    source_label: 'Walk In',
    source_enum: 'walk_in' as any,
    program_id: '00000000-0000-0000-0000-000000000001',
    program_short: 'BBA',
    program_name: 'Bachelor of Business Administration',
    total: 5,
    assigned: 3,
    unassigned: 2,
    daily_counts: { '2026-05-15': 2, '2026-05-16': 3 },
  },
  {
    source_key: 'walk_in',
    source_label: 'Walk In',
    source_enum: 'walk_in' as any,
    program_id: null,
    program_short: null,
    program_name: null,
    total: 1,
    assigned: 0,
    unassigned: 1,
    daily_counts: { '2026-05-16': 1 },
  },
  {
    source_key: 'website',
    source_label: 'Website',
    source_enum: 'website' as any,
    program_id: '00000000-0000-0000-0000-000000000002',
    program_short: 'BTech',
    program_name: 'Bachelor of Technology',
    total: 4,
    assigned: 4,
    unassigned: 0,
    daily_counts: { '2026-05-15': 4 },
  },
];

describe('SourceCoverageByProgramGrid', () => {
  it('renders empty-state when no rows', () => {
    const { container } = render(<SourceCoverageByProgramGrid rows={[]} />);
    expect(container.textContent).toMatch(/No leads matched/i);
  });

  it('groups rows by source and renders program sub-rows', () => {
    const { container } = render(<SourceCoverageByProgramGrid rows={fixture} />);
    expect(container.textContent).toContain('Walk In');
    expect(container.textContent).toContain('Bachelor of Business Administration');
    expect(container.textContent).toContain('— Unassigned —');
    expect(container.textContent).toContain('Website');
  });

  it('renders coverage % computed from summed columns', () => {
    const { container } = render(<SourceCoverageByProgramGrid rows={fixture} />);
    // walk_in × BBA: assigned=3, total=5 → 60%
    expect(container.textContent).toContain('60');
    // website × BTech: assigned=4, total=4 → 100%
    expect(container.textContent).toContain('100');
  });

  it('matches snapshot', () => {
    const { container } = render(<SourceCoverageByProgramGrid rows={fixture} />);
    expect(container.innerHTML).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run the test — it must fail**

```bash
npx vitest run components/admission/source-coverage/source-coverage-by-program-grid.test.tsx
```
**Expected:** FAIL `Cannot find module './source-coverage-by-program-grid'`.

- [ ] **Step 3: Write the component**

Create `components/admission/source-coverage/source-coverage-by-program-grid.tsx`:

```tsx
'use client';

// Source Coverage By Program grid — groups rows by source, shows program
// sub-rows + per-source subtotal + grand total. No date axis (use the
// Daily Pivot tab for time-series).

import { Fragment, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import type { SourceCoverageRow } from '@/types/admission/source-coverage';

interface SourceCoverageByProgramGridProps {
  rows: SourceCoverageRow[];
}

interface SourceGroup {
  source_key: string;
  source_label: string;
  programs: SourceCoverageRow[];
  subtotal: { total: number; assigned: number; unassigned: number; coverage: number };
}

function coverage(total: number, assigned: number): number {
  return total > 0 ? Math.round((assigned / total) * 100) : 0;
}

function coverageBadge(pct: number, total: number) {
  if (total === 0) {
    return <Badge variant="outline" className="text-muted-foreground">—</Badge>;
  }
  if (pct >= 90) {
    return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200">{pct}%</Badge>;
  }
  if (pct >= 50) {
    return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200">{pct}%</Badge>;
  }
  return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-orange-200">{pct}%</Badge>;
}

export function SourceCoverageByProgramGrid({
  rows,
}: SourceCoverageByProgramGridProps) {
  const groups = useMemo<SourceGroup[]>(() => {
    const map = new Map<string, SourceGroup>();
    for (const r of rows) {
      const g = map.get(r.source_key);
      if (g) {
        g.programs.push(r);
        g.subtotal.total += r.total;
        g.subtotal.assigned += r.assigned;
        g.subtotal.unassigned += r.unassigned;
      } else {
        map.set(r.source_key, {
          source_key: r.source_key,
          source_label: r.source_label,
          programs: [r],
          subtotal: { total: r.total, assigned: r.assigned, unassigned: r.unassigned, coverage: 0 },
        });
      }
    }
    // Sort programs inside each group: named programs first by name,
    // NULL ('Unassigned') always last.
    for (const g of map.values()) {
      g.programs.sort((a, b) => {
        if (a.program_id === null && b.program_id !== null) return 1;
        if (a.program_id !== null && b.program_id === null) return -1;
        return (a.program_name ?? '').localeCompare(b.program_name ?? '');
      });
      g.subtotal.coverage = coverage(g.subtotal.total, g.subtotal.assigned);
    }
    return Array.from(map.values()).sort((a, b) => b.subtotal.total - a.subtotal.total);
  }, [rows]);

  const grandTotal = useMemo(() => {
    let total = 0,
      assigned = 0,
      unassigned = 0;
    for (const g of groups) {
      total += g.subtotal.total;
      assigned += g.subtotal.assigned;
      unassigned += g.subtotal.unassigned;
    }
    return { total, assigned, unassigned, coverage: coverage(total, assigned) };
  }, [groups]);

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
        No leads matched these filters in the selected window.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-xs uppercase tracking-wide">
          <tr>
            <th className="px-3 py-2 text-left">Source</th>
            <th className="px-3 py-2 text-left">Program</th>
            <th className="px-3 py-2 text-right">Total</th>
            <th className="px-3 py-2 text-right">Assigned</th>
            <th className="px-3 py-2 text-right">Unassigned</th>
            <th className="px-3 py-2 text-right">Coverage</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.source_key}>
              {g.programs.map((p, idx) => (
                <tr key={`${g.source_key}-${p.program_id ?? 'null'}`} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2 align-top">
                    {idx === 0 ? (
                      <div>
                        <div className="font-medium">{g.source_label}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{g.source_key}</div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground/30">↳</span>
                    )}
                  </td>
                  <td className={`px-3 py-2 ${p.program_id === null ? 'italic text-muted-foreground' : ''}`}>
                    {p.program_id === null ? '— Unassigned —' : p.program_name}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium">{p.total.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{p.assigned.toLocaleString()}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${p.unassigned > 0 ? 'text-orange-700 font-medium' : 'text-muted-foreground'}`}>
                    {p.unassigned.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right">{coverageBadge(coverage(p.total, p.assigned), p.total)}</td>
                </tr>
              ))}
              {/* Per-source subtotal */}
              <tr className="border-t bg-muted/20 font-medium">
                <td className="px-3 py-2"></td>
                <td className="px-3 py-2 text-xs text-muted-foreground">Subtotal · {g.source_label}</td>
                <td className="px-3 py-2 text-right tabular-nums">{g.subtotal.total.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{g.subtotal.assigned.toLocaleString()}</td>
                <td className="px-3 py-2 text-right tabular-nums">{g.subtotal.unassigned.toLocaleString()}</td>
                <td className="px-3 py-2 text-right">{coverageBadge(g.subtotal.coverage, g.subtotal.total)}</td>
              </tr>
            </Fragment>
          ))}
          {/* Grand total */}
          <tr className="border-t bg-muted/40 font-semibold">
            <td className="px-3 py-2">All sources</td>
            <td className="px-3 py-2 text-xs text-muted-foreground">Grand total</td>
            <td className="px-3 py-2 text-right tabular-nums">{grandTotal.total.toLocaleString()}</td>
            <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{grandTotal.assigned.toLocaleString()}</td>
            <td className="px-3 py-2 text-right tabular-nums">{grandTotal.unassigned.toLocaleString()}</td>
            <td className="px-3 py-2 text-right">{coverageBadge(grandTotal.coverage, grandTotal.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Run the test — should PASS and write snapshot**

```bash
npx vitest run components/admission/source-coverage/source-coverage-by-program-grid.test.tsx
```
**Expected:** PASS with new snapshot file written.

- [ ] **Step 5: Commit**

```bash
git add components/admission/source-coverage/source-coverage-by-program-grid.tsx components/admission/source-coverage/source-coverage-by-program-grid.test.tsx components/admission/source-coverage/__snapshots__/
git commit -m "feat(admission/analytics): SourceCoverageByProgramGrid component + snapshot test

Source × Program grid with grouped rendering: source header + program
sub-rows + per-source subtotal + grand total. Coverage % computed from
summed columns (not averaged per-row). NULL program rows render as
'— Unassigned —' at the bottom of their source group.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Refactor `SourceCoverageDashboard` — add sub-tabs, integrate filter bar

**Files:**
- Modify: `components/admission/source-coverage-dashboard.tsx` (rewritten)
- Modify: `components/admission/index.tsx` (verify exports if needed)

**Context:** The existing component holds the lifetime Summary view. We rewrite it to: (1) hold filter state, (2) render the new FilterBar, (3) render a `<Tabs>` with three values, (4) render Summary as today, (5) render the two new grids backed by `useSourceCoverageDaily`. Prop name flips from `institutionId` → `defaultInstitutionId`.

- [ ] **Step 1: Check current barrel exports**

```bash
grep "SourceCoverageDashboard" components/admission/index.tsx
```
If it's exported by name, no barrel change needed.

- [ ] **Step 2: Rewrite `source-coverage-dashboard.tsx`**

Replace the file's content with:

```tsx
'use client';

// Source Coverage analytics — owns filter state, renders the new filter
// bar, and switches between three sub-tabs: Summary (existing lifetime
// table), Daily Pivot (new), By Program (new).

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Inbox,
  UserCheck,
  UserX,
  TrendingUp,
} from 'lucide-react';
import { SourceMasterService } from '@/lib/services/admission/source-master-service';
import { useInstitutionsWithAccess } from '@/hooks/organization/use-institutions-with-access';
import { usePrograms } from '@/hooks/organization/use-programs';
import { useSourceCoverageDaily } from '@/hooks/admission/use-source-coverage-daily';
import { SourceCoverageFilterBar } from './source-coverage/source-coverage-filter-bar';
import { SourceCoverageDailyGrid } from './source-coverage/source-coverage-daily-grid';
import { SourceCoverageByProgramGrid } from './source-coverage/source-coverage-by-program-grid';
import type { SourceCoverageFilters } from '@/types/admission/source-coverage';

interface SourceCoverageDashboardProps {
  /** Initial institution scope. Overridden once the user picks via the filter bar. */
  defaultInstitutionId?: string;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function daysAgoISO(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

export function SourceCoverageDashboard({
  defaultInstitutionId,
}: SourceCoverageDashboardProps) {
  const defaults: SourceCoverageFilters = useMemo(
    () => ({
      institution_id: defaultInstitutionId,
      from: daysAgoISO(30),
      to: todayISO(),
      assignment: 'all',
      source_keys: [],
      program_ids: [],
    }),
    [defaultInstitutionId],
  );

  const [filters, setFilters] = useState<SourceCoverageFilters>(defaults);
  const [activeTab, setActiveTab] = useState<'summary' | 'daily-pivot' | 'by-program'>('summary');

  // ─── Institutions / Sources / Programs option lookups ─────────────────────
  const { institutions } = useInstitutionsWithAccess();

  const { data: sourcesList } = useQuery({
    queryKey: ['admission-source-coverage-master', filters.institution_id ?? 'all'],
    queryFn: () =>
      SourceMasterService.list({
        institution_id: filters.institution_id ?? undefined,
        is_active: true,
      }),
    staleTime: 60_000,
  });

  const { data: programsResp } = usePrograms({
    page: 1,
    limit: 200,
    institution_id: filters.institution_id ?? undefined,
    is_active: true,
  });

  const sourceOptions = useMemo(
    () =>
      (sourcesList ?? []).map((s) => ({
        key: s.key,
        label: s.label,
      })),
    [sourcesList],
  );

  const programOptions = useMemo(
    () =>
      (programsResp?.data ?? []).map((p: any) => ({
        id: p.id,
        program_name: p.program_name,
      })),
    [programsResp],
  );

  // ─── Daily / By-Program query (skipped on Summary tab) ────────────────────
  const { data: coverageRows, isLoading: coverageLoading } = useSourceCoverageDaily(
    filters,
    { enabled: activeTab !== 'summary' },
  );

  // ─── Summary tab aggregates (lifetime, unchanged behavior) ────────────────
  const summarySorted = useMemo(() => {
    const list = (sourcesList ?? []).slice();
    list.sort((a, b) => (b.lead_count ?? 0) - (a.lead_count ?? 0));
    return list;
  }, [sourcesList]);

  const summaryAggregate = useMemo(() => {
    let total = 0,
      assigned = 0,
      unassigned = 0,
      sourcesWithBacklog = 0;
    for (const s of summarySorted) {
      total += s.lead_count ?? 0;
      assigned += s.assigned_count ?? 0;
      unassigned += s.unassigned_count ?? 0;
      if ((s.unassigned_count ?? 0) > 0) sourcesWithBacklog += 1;
    }
    return {
      total,
      assigned,
      unassigned,
      sourcesWithBacklog,
      assignedPct: total > 0 ? Math.round((assigned / total) * 100) : 0,
      unassignedPct: total > 0 ? Math.round((unassigned / total) * 100) : 0,
    };
  }, [summarySorted]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Source Coverage
        </CardTitle>
        <CardDescription>
          Per-source assignment and conversion health. Summary shows
          lifetime aggregates; Daily Pivot and By Program respect the
          filter window.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* KPI strip — lifetime, unchanged */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiTile icon={<Inbox className="h-4 w-4" />} label="Total leads" value={summaryAggregate.total} tone="info" />
          <KpiTile
            icon={<UserCheck className="h-4 w-4" />}
            label="Assigned"
            value={summaryAggregate.assigned}
            sublabel={summaryAggregate.total > 0 ? `${summaryAggregate.assignedPct}% of total` : undefined}
            tone="success"
          />
          <KpiTile
            icon={<UserX className="h-4 w-4" />}
            label="Unassigned"
            value={summaryAggregate.unassigned}
            sublabel={summaryAggregate.total > 0 ? `${summaryAggregate.unassignedPct}% of total` : undefined}
            tone={summaryAggregate.unassigned > 0 ? 'danger' : 'muted'}
          />
          <KpiTile
            icon={<AlertCircle className="h-4 w-4" />}
            label="Sources with backlog"
            value={summaryAggregate.sourcesWithBacklog}
            sublabel={`of ${summarySorted.length} active`}
            tone={summaryAggregate.sourcesWithBacklog > 0 ? 'danger' : 'success'}
          />
        </div>

        {/* Filter bar */}
        <SourceCoverageFilterBar
          filters={filters}
          onChange={setFilters}
          institutions={institutions}
          sources={sourceOptions}
          programs={programOptions}
          defaults={defaults}
        />

        {/* Sub-tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList>
            <TabsTrigger value="summary">Summary</TabsTrigger>
            <TabsTrigger value="daily-pivot">Daily Pivot</TabsTrigger>
            <TabsTrigger value="by-program">By Program</TabsTrigger>
          </TabsList>

          {/* Summary tab — lifetime per-source table (unchanged behavior) */}
          <TabsContent value="summary" className="mt-3">
            {summarySorted.length === 0 ? (
              <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
                No active sources found.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead className="hidden md:table-cell">Routes To</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Assigned</TableHead>
                      <TableHead className="text-right">Unassigned</TableHead>
                      <TableHead className="text-right hidden lg:table-cell">Coverage</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summarySorted.map((s) => {
                      const total = s.lead_count ?? 0;
                      const assigned = s.assigned_count ?? 0;
                      const unassigned = s.unassigned_count ?? 0;
                      const cov = total > 0 ? Math.round((assigned / total) * 100) : 0;
                      const isBacklog = unassigned > 0 && unassigned / Math.max(total, 1) >= 0.25;
                      return (
                        <TableRow key={s.id}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium">{s.label}</span>
                              <span className="text-xs text-muted-foreground font-mono">{s.key}</span>
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge variant="outline" className="font-mono text-xs">{s.enum_value}</Badge>
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">{total.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums text-green-700">{assigned.toLocaleString()}</TableCell>
                          <TableCell className={`text-right tabular-nums ${unassigned > 0 ? 'text-orange-700 font-medium' : 'text-muted-foreground'}`}>
                            {unassigned.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right tabular-nums hidden lg:table-cell">
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-sm">{cov}%</span>
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                                <div className={`h-full rounded-full ${cov >= 90 ? 'bg-green-500' : cov >= 50 ? 'bg-blue-500' : 'bg-orange-500'}`} style={{ width: `${cov}%` }} />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {total === 0 ? (
                              <Badge variant="outline" className="text-muted-foreground gap-1"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />Idle</Badge>
                            ) : isBacklog ? (
                              <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-orange-200 gap-1"><AlertCircle className="h-3 w-3" />Backlog</Badge>
                            ) : unassigned === 0 ? (
                              <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 gap-1"><CheckCircle2 className="h-3 w-3" />All clear</Badge>
                            ) : (
                              <Badge variant="outline" className="text-blue-700 border-blue-200 gap-1"><TrendingUp className="h-3 w-3" />Active</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* Daily Pivot tab */}
          <TabsContent value="daily-pivot" className="mt-3">
            {coverageLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <SourceCoverageDailyGrid rows={coverageRows ?? []} />
            )}
          </TabsContent>

          {/* By Program tab */}
          <TabsContent value="by-program" className="mt-3">
            {coverageLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <SourceCoverageByProgramGrid rows={coverageRows ?? []} />
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ─── KpiTile (unchanged from previous version) ──────────────────────────────
type Tone = 'info' | 'success' | 'danger' | 'muted';
const TONE: Record<Tone, { card: string; iconBg: string; iconColor: string; valueColor: string }> = {
  info:    { card: 'border-blue-200/60',  iconBg: 'bg-blue-100',  iconColor: 'text-blue-600',  valueColor: 'text-blue-900' },
  success: { card: 'border-green-200/60', iconBg: 'bg-green-100', iconColor: 'text-green-600', valueColor: 'text-green-900' },
  danger:  { card: 'border-red-300 bg-red-50/40', iconBg: 'bg-red-100', iconColor: 'text-red-600', valueColor: 'text-red-900' },
  muted:   { card: 'border-muted', iconBg: 'bg-muted', iconColor: 'text-muted-foreground', valueColor: 'text-foreground/80' },
};
function KpiTile({ icon, label, value, sublabel, tone }: { icon: React.ReactNode; label: string; value: number | string; sublabel?: string; tone: Tone }) {
  const tw = TONE[tone];
  return (
    <Card className={tw.card}>
      <CardContent className="px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${tw.iconBg} ${tw.iconColor}`}>{icon}</span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <div className={`mt-1 text-xl font-semibold tabular-nums ${tw.valueColor}`}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        {sublabel && <div className="text-[11px] text-muted-foreground tabular-nums">{sublabel}</div>}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Verify it compiles**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep "source-coverage-dashboard" ; echo "---END---"
```
**Expected:** only `---END---`.

- [ ] **Step 4: Commit**

```bash
git add components/admission/source-coverage-dashboard.tsx
git commit -m "refactor(admission/analytics): SourceCoverageDashboard adopts sub-tabs + filter bar

- New prop: defaultInstitutionId (was institutionId); now seeds internal
  filter state so the filter bar's institution select is the single source
  of truth across all three sub-tabs.
- KPI strip + Summary table behavior unchanged (still lifetime aggregates
  from SourceMasterService.list).
- Two new tabs (Daily Pivot, By Program) consume useSourceCoverageDaily;
  query is disabled while Summary is active so we don't waste round trips.
- Filter bar mirrors the fees-structure pattern (commit 8f11b9502).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Wire-up in the analytics page + manual UAT

**Files:**
- Modify: `app/(routes)/admission/analytics/page.tsx:673`

- [ ] **Step 1: Update the prop name**

Open `app/(routes)/admission/analytics/page.tsx`, find line 673 (or thereabouts):

```tsx
<SourceCoverageDashboard institutionId={institutionId} />
```

Change to:

```tsx
<SourceCoverageDashboard defaultInstitutionId={institutionId} />
```

- [ ] **Step 2: Type-check the whole project**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "source-coverage|admission/analytics" ; echo "---END---"
```
**Expected:** only `---END---`.

- [ ] **Step 3: Start the dev server**

```bash
(npm run dev > /tmp/dev.log 2>&1 &)
```
Wait until `/tmp/dev.log` contains `Ready in`:
```bash
until grep -q "Ready in" /tmp/dev.log; do sleep 1; done; grep -E "Ready in|Local:" /tmp/dev.log | head -3
```

- [ ] **Step 4: Manual UAT — Summary tab unchanged**

Open the analytics page → Source Coverage tab. **Expected:** Summary sub-tab is active by default; KPI strip and table look exactly like before this change.

- [ ] **Step 5: Manual UAT — Daily Pivot tab**

Click **Daily Pivot**. **Expected:**
- Loading skeletons briefly, then a grid renders with: sticky-left Source / Total / Assigned / Unassigned columns and a date column per active day in the last 30 days.
- Grand-total row at bottom sums correctly.
- A source with daily spikes shows blue-tinted cells on the spike days.

- [ ] **Step 6: Manual UAT — By Program tab**

Click **By Program**. **Expected:**
- Source-grouped rendering: Walk In header row + program sub-rows + subtotal row, then Website, etc.
- Unassigned program rows (`— Unassigned —`) render last within each source group, italic.
- Coverage % column has the colored pill (green ≥90, blue 50–89, orange <50).

- [ ] **Step 7: Manual UAT — Filter cascade and Reset**

- Pick an institution. Programs picker becomes enabled.
- Pick 2 programs and 1 source.
- Switch to Daily Pivot — rows should narrow accordingly.
- Click **Reset** — filters return to defaults (institution back to `defaultInstitutionId`, date range = last 30 days, etc.).

- [ ] **Step 8: Manual UAT — Mobile responsive**

Resize the browser to ~360px wide.
- Filter bar's primary row chips drop to `w-full`, each on its own line.
- Advanced row (when expanded) shows the two pickers stacked.
- Daily Pivot grid scrolls horizontally cleanly; sticky-left columns stay anchored.

- [ ] **Step 9: Commit the wiring change**

```bash
git add "app/(routes)/admission/analytics/page.tsx"
git commit -m "feat(admission/analytics): wire SourceCoverageDashboard with defaultInstitutionId

The new filter bar owns institution scope internally; the page-level
selection seeds it via defaultInstitutionId.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 10: Final sweep — full type-check + full test run**

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | tail -5
npx vitest run components/admission/source-coverage/ 2>&1 | tail -10
```
**Expected:** no type errors; both grid snapshot tests pass.

---

## Verification Summary

When all 10 tasks are complete, you should have:

1. ✅ A new SECURITY DEFINER RPC `fn_admission_source_coverage_daily` deployed to the database, gated by `admission.analytics.view` and scoped via `role_has_institution_access`.
2. ✅ A SQL verification script that asserts the RPC's correctness on fixture data inside a rolled-back transaction.
3. ✅ Typed contracts (`SourceCoverageRow`, `SourceCoverageFilters`, `AssignmentFilter`).
4. ✅ Service + hook layer with 365-day clamp + clamp toast.
5. ✅ Filter bar controlled component with multi-select chip popovers.
6. ✅ Two new grid components with snapshot tests.
7. ✅ Source coverage dashboard refactored to own filter state and three sub-tabs.
8. ✅ Analytics page wired with the new prop name.

The Summary tab's behavior is identical to today — no behavior change for users who don't open the new tabs.
