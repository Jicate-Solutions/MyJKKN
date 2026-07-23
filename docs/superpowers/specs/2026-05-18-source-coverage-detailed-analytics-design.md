# Source Coverage Detailed Analytics — Design

**Date:** 2026-05-18
**Status:** Design — pending implementation plan
**Owner:** Admission / Analytics
**Related surfaces:**
- `components/admission/source-coverage-dashboard.tsx` (current view, lifetime aggregates only)
- `app/(routes)/admission/group-dashboard/_components/seat-pivot-grid.tsx` (visual reference for daily pivot)
- `supabase/migrations/20260502000007_fn_seat_analytics_daily_pivot_align_summary.sql` (RPC reference for daily JSONB shape)

---

## 1. Problem

The admission analytics page's **Source Coverage** tab currently shows only **lifetime per-source aggregates** (total / assigned / unassigned / coverage % per source). Two analytical questions can't be answered:

1. **"How are sources performing over time?"** — admins can't see daily inflow per source, so spikes, droughts, and weekday/weekend patterns are invisible.
2. **"Which programs is each source actually bringing leads to?"** — admins can't see the source × program cross-tab, so they can't tell whether (e.g.) `youtube_ads` is bringing leads to BBA or BTech.

The user explicitly referenced the group dashboard's **Seat Analytics → Daily Pivot** as the visual pattern to mirror.

## 2. Scope

### In scope

- A daily date-wise grid of lead counts per source, mirroring `SeatPivotGrid` (sticky-left columns + horizontal-scroll date columns).
- A source × program grid (no date axis) showing how each source distributes across assigned programs.
- An advanced-filter bar covering institution, source enum (multi), program (multi), assignment status, and a free date-range picker.
- A new SECURITY DEFINER RPC that returns rows keyed by `(source_key, program_id)` with `daily_counts` JSONB for the requested window.
- XLSX export of the Daily Pivot grid.

### Out of scope (deferred)

- Hourly / weekly / monthly granularities — daily only in v1.
- Real-time push updates — relies on tanstack-query refetch on filter change.
- Cross-institution comparison view — institution stays single-select.
- Export of the By Program grid.
- Cohort/admission-year scoping (free date range covers the broader use case).

## 3. Architecture

One new RPC powers two of three sub-tabs; the existing lifetime query keeps powering the third.

```
┌─────────────────────────── SourceCoverageDashboard ────────────────────────────┐
│  KPI strip (unchanged)                                                         │
│  ┌────────────────────────── Filter bar (new) ──────────────────────────────┐  │
│  │  Institution | From | To | Assignment | More(N) | Reset                  │  │
│  │  (when More open)  Sources(multi) | Programs(multi)                      │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
│  Tab strip: [Summary] [Daily Pivot] [By Program]                               │
│                                                                                │
│  ┌─────────────────────────── Tab content ──────────────────────────────────┐  │
│  │ Summary: existing table (SourceMasterService.list, lifetime aggregates)  │  │
│  │ Daily Pivot: SourceCoverageDailyGrid  ← new RPC, folded to per-source    │  │
│  │ By Program: SourceCoverageByProgramGrid  ← new RPC, full rows            │  │
│  └──────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Why split data sources between Summary and the new tabs:** Summary answers "what's the lifetime backlog?" — a different question that doesn't need a date axis. Date-windowed aggregations are a separate use case; combining them under one RPC would mean every Summary load pays for date-bucketing work it never renders. Keeping Summary on `SourceMasterService.list` also means existing users see no behavior change on the tab they already use.

## 4. Data Model & Contracts

### 4.1 New RPC — `fn_admission_source_coverage_daily`

```sql
CREATE OR REPLACE FUNCTION public.fn_admission_source_coverage_daily(
  p_institution_id  uuid    DEFAULT NULL,         -- NULL = all RLS-accessible
  p_from            date    NOT NULL,
  p_to              date    NOT NULL,
  p_assignment      text    DEFAULT 'all',        -- 'all' | 'assigned' | 'unassigned'
  p_source_keys     text[]  DEFAULT NULL,         -- NULL/empty = all sources
  p_program_ids     uuid[]  DEFAULT NULL          -- NULL/empty = all programs incl. NULL
)
RETURNS TABLE (
  source_key      text,
  source_label    text,
  source_enum     lead_source,
  program_id      uuid,                            -- nullable
  program_short   text,                            -- nullable when program_id NULL
  program_name    text,                            -- nullable when program_id NULL
  total           integer,
  assigned        integer,
  unassigned      integer,
  daily_counts    jsonb                            -- { "YYYY-MM-DD": int, ... } IST-bucketed
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public;
```

**Bucketing rule:** `daily_counts` keys are `to_char((l.created_at AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD')` — matches the seat-pivot's IST-day grouping so the columns line up across surfaces.

**Permission gate (inside function body):**
```sql
IF NOT (is_super_admin() OR is_admin() OR user_has_permission('admission.view'))
THEN RAISE EXCEPTION 'access denied'; END IF;
```

**Scope filter:** when `p_institution_id IS NULL` the function resolves accessible institutions via `role_has_institution_access(id)` inside an `eligible_institutions` CTE, matching `fn_seat_analytics_daily_pivot`'s pattern. When provided, the function still validates access (`AND role_has_institution_access(p_institution_id)`) so a forged param can't leak data.

**Source/program filters:** `NULL` or empty array = no constraint on that dimension. The function never returns rows with zero total in the window (caller doesn't need to filter empty rows).

### 4.2 TypeScript types

New file `types/admission/source-coverage.ts`:

```ts
export interface SourceCoverageRow {
  source_key: string;
  source_label: string;
  source_enum: LeadSource;
  program_id: string | null;
  program_short: string | null;
  program_name: string | null;
  total: number;
  assigned: number;
  unassigned: number;
  daily_counts: Record<string, number>; // ISO YYYY-MM-DD → count
}

export type AssignmentFilter = 'all' | 'assigned' | 'unassigned';

export interface SourceCoverageFilters {
  institution_id?: string;
  from: string;        // YYYY-MM-DD
  to: string;          // YYYY-MM-DD
  assignment: AssignmentFilter;
  source_keys: string[];
  program_ids: string[];
}
```

### 4.3 Service layer

New file `lib/services/admission/source-coverage-service.ts`. One static method:

- `SourceCoverageService.getDailyCoverage(filters: SourceCoverageFilters): Promise<SourceCoverageRow[]>`
- Calls `supabase.rpc('fn_admission_source_coverage_daily', { p_institution_id, p_from, p_to, p_assignment, p_source_keys, p_program_ids })` — mapping `filters.source_keys` / `filters.program_ids` to `NULL` when empty arrays so the RPC's "all" semantics apply.
- **Pre-flight validation** (caps before round-trip): if `(to - from)` exceeds 365 days, clamp `from = to - 365d` and surface a `__clampedRange: true` flag on the returned array so the hook can toast a warning; if `from > to`, swap them silently.
- Destructures `{ data, error }` (per project convention; see memory `feedback_supabase_mutations_must_check_error`); rethrows the Supabase error wrapped through `getErrorMessage()`.
- No retry — transient ECONNRESET handling is the parent hook's job via `lib/retry.ts withRetry()`.

## 5. UI / UX

### 5.1 Filter bar

Layout (mirrors the fees-structure filter card shipped 2026-05-18):

- **Row 1 (always visible):** Filter icon · Institution select (`w-full sm:w-44`) · Date From · Date To · Assignment select (`All` / `Assigned` / `Unassigned`) · `More` toggle with count badge · `Reset` (when any filter active)
- **Row 2 (when `showAdvanced` true, separated by `border-t pt-3`):** Sources multi-select chip popover · Programs multi-select chip popover

**Cascade rule:** Programs picker disables until Institution is set (programs are institution-scoped). Source picker is global — works without institution.

**Mobile (<640px):** every chip uses `w-full`, primary row wraps onto multiple lines via `flex-wrap`. Advanced row's two chips drop to `grid-cols-1`.

**Reset behavior:** restores defaults for the bar's filters — `from = today-30d`, `to = today`, `assignment = 'all'`, `source_keys = []`, `program_ids = []`. Institution **is** reset to the page-level default (whatever the parent analytics page passes in as `defaultInstitutionId`, typically the user's primary institution).

**Institution ownership (resolves the only filter that could come from two places):** The new filter bar's Institution select is the **single source of truth** for institution scope across all three sub-tabs (Summary included). The parent `app/(routes)/admission/analytics/page.tsx` will pass `defaultInstitutionId?` (used only for initial state); the `institutionId` prop currently consumed by `SourceCoverageDashboard` is removed so we don't have two places fighting to set the same value.

### 5.2 Tab strip

`<Tabs>` from `components/ui/tabs.tsx`, three values: `summary` | `daily-pivot` | `by-program`. Default tab: `summary` (preserves existing user mental model). Active tab is URL-synced via `useUrlState('source_cov_tab', 'summary')`.

### 5.3 Summary tab

Renders exactly the existing per-source table — same columns, same sort order, same status badges. The only change is the **driver** of `SourceMasterService.list({ institution_id })`: it now reads the bar's institution state (see §5.1 ownership note) instead of a page-level prop. Behavior for "all institutions" (institution unset) is unchanged.

### 5.4 Daily Pivot tab — `SourceCoverageDailyGrid`

- **Sticky-left columns:** `SOURCE` (label + key in muted small text) · `TOTAL` · `ASSIGNED` · `UNASSIGNED`
- **Scrollable right columns:** one column per date in the union of `daily_counts` keys (already filtered by RPC to the window), sorted ascending, formatted `DD/MM/YY`
- **Cells:** tabular-nums; empty cells render as `—` (text-muted-foreground)
- **Heat tint:** within each row, cells whose value ≥ the 75th percentile of *that row's non-zero daily counts in the visible window* (i.e. only the date columns currently rendered) get `bg-blue-50`. Empty/zero cells are excluded from the percentile calculation so a sparse row doesn't trigger a tint on a single occurrence. Implementation: per-row `quantile(values.filter(v => v > 0), 0.75)`.
- **Grand-total row** at the bottom: sums across all sources per date, in `font-semibold tabular-nums`
- **Export:** XLSX button in the tab's header right cluster — file format mirrors the seat-pivot's `admission-daily-pivot-YYYY-YY.xlsx`; columns: Source / Key / Total / Assigned / Unassigned + one column per date.

### 5.5 By Program tab — `SourceCoverageByProgramGrid`

- **Sticky-left columns:** `SOURCE` · `PROGRAM` · `TOTAL` · `ASSIGNED` · `UNASSIGNED` · `COVERAGE %`
- **COVERAGE %** column formula: `total > 0 ? round(assigned / total * 100) : 0`. Rendered with the same pill scheme the existing Summary table uses (≥90% green, 50–89% blue, <50% orange). Subtotal and grand-total rows compute the same formula on their summed columns (not as an average of per-row %s).
- **No date columns** — the third dimension would explode the table; users go to Daily Pivot for time.
- **Grouped rendering:** source label row (chevron collapsible, defaults expanded), program rows indented below, per-source subtotal row at the end of each group, grand-total row at the bottom.
- **Unassigned bucket:** rows with `program_id IS NULL` render at the bottom of each source's group with `program_name = '— Unassigned —'` (italic, muted).
- **Empty state:** matches Daily Pivot — "No leads matched these filters in the selected window."

### 5.6 KPI strip (above the filter bar)

Unchanged from the current `SourceCoverageDashboard`. The four tiles (Total / Assigned / Unassigned / Sources with backlog) still reflect lifetime aggregates from `SourceMasterService.list`. **Rationale:** the KPI strip is a constant scoreboard; redefining it as "filtered window" would confuse the existing user mental model. The tabs themselves carry the filter-window semantics.

## 6. Error Handling & Edge Cases

| Case | Behavior |
|---|---|
| No institution selected + super-admin | RPC accepts NULL, resolves via `role_has_institution_access` |
| Date range wider than 365 days | Service clamps to 365; UI toasts a warning ("Date range capped at 365 days for performance") |
| `from > to` | Service swaps them silently and toasts a notice |
| No leads in window | Pivot tabs show empty-state card; KPI strip & Summary stay populated (they're lifetime) |
| Source enum without master entry | Falls back to formatted enum (`youtube_ads` → `Youtube Ads`) as `source_label`; key stays as enum value |
| RPC permission denied | Service throws; tab renders error card with `Retry` button |
| Mid-tab institution change | URL state survives; RPC refetches under new key (tanstack-query handles invalidation) |

## 7. Testing

| Layer | Tests |
|---|---|
| **pgTAP (DB)** | Seed 5 leads across 2 sources × 2 programs × 3 dates; assert RPC returns correct `daily_counts` totals; assert `p_assignment='unassigned'` filter excludes assigned rows; assert `p_source_keys`/`p_program_ids` filters narrow correctly; assert NULL institution scopes via RLS for a fixture super-admin and a fixture single-institution user. Pattern: clone `supabase/tests/test_fn_seat_analytics_daily_pivot.sql`. |
| **Vitest (UI)** | `SourceCoverageDailyGrid` and `SourceCoverageByProgramGrid` snapshot tests against fixture rows: empty, single source, multi-source sparse dates, grand-total math. |
| **Manual UAT** | (1) Summary tab unchanged. (2) Daily Pivot grand-total matches Summary total when filters cleared and range is all-time. (3) By Program's per-source "Unassigned" bucket sum matches Summary's `unassigned_count`. (4) Mobile (<640px) — filter bar wraps cleanly, grids horizontally scroll. (5) Filter cascade — Programs picker disables until institution set. |

## 8. Migration & Rollout

- **DB:** single forward migration file `supabase/migrations/<ts>_fn_admission_source_coverage_daily.sql`. No backfill needed (RPC reads live data).
- **Frontend:** no feature flag; the change is purely additive (adds sub-tabs to an existing card). The Summary tab is unchanged, so existing bookmarks/screenshots stay valid.
- **Permissions:** RPC grants execute to `authenticated`; the inside-function gate (`admission.view`) reuses the existing source-coverage permission. No new permission key.
- **Cache invalidation:** tanstack-query keys are `['admission-source-coverage-daily', filters]`. Each filter change is a new key — no manual invalidation needed.

## 9. Open Questions

None at design time. The user has resolved date axis (lead `created_at`), program axis (`admission_leads.program_id`), time scope (free date range, default 30d), UI layout (sub-tabs inside the existing card), and filter dimensions (institution + sources multi + programs multi + assignment status).

## 10. Future Enhancements (out of scope for this spec)

- Hourly / weekly / monthly granularity toggle on Daily Pivot.
- Cross-institution comparison (multi-select institution).
- Source × program × day three-axis grid (only practical with a heat-map renderer; deferred).
- Funnel-stage overlay (e.g. show qualified-to-applied conversion per source).
- Saved filter presets per user.
