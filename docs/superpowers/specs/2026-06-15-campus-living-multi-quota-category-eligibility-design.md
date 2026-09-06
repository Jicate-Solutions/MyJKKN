# Multi-Quota Category Eligibility — Design

**Date:** 2026-06-15
**Module:** Campus Living → Settings → Program Eligibility → **Category Eligibility** tab
**Author:** Boobalan (aiahs@jkkn.ac.in)
**Branch:** `feat/campus-living/multi-quota-category-eligibility`

## Problem

A Category Eligibility rule maps `(institution, program, quota, fee-band, gender)` →
room category + mess category. Today the **quota** dimension is single-valued: a rule
applies to exactly one quota, or to "any quota" (`quota_id IS NULL`). Operators need a
single rule to apply to **several specific quotas** (e.g. one fee-band → Deluxe rule that
covers both *Government* and *Management* quotas) without "any quota" (which would also
catch quotas they want to exclude).

## Decision

**Option A — array column.** Replace the scalar `quota_id uuid` with `quota_ids uuid[]`.
One row stays one condition; the UI becomes a multi-select. Chosen over a junction table
(overkill for a 7-row admin table) and over fanning out to N rows (clunky to edit; noisy
table). Trade-off accepted: arrays can't carry a foreign key, so a trigger replaces the
FK's integrity guarantee.

### Semantics (unchanged precedence model)

- `quota_ids IS NULL` → **any quota** (the existing sentinel; an empty selection in the
  form stores `NULL`).
- `quota_ids = {A, B}` → applies to a learner whose quota is `A` **or** `B`.
- Specificity score is preserved: `program ×4 + quota ×2 + fee ×1`, where the quota term
  is now `(quota_ids IS NOT NULL)::int * 2`. A rule that names quotas still outranks an
  "any quota" rule, ties broken by narrowest fee band — identical to today.

## Current state (blast radius)

| Layer | Location | Today |
|---|---|---|
| Column | `hostel_program_eligibility.quota_id` | nullable `uuid` FK → `quotas` |
| FK | `hostel_program_eligibility_quota_id_fkey` | `quota_id → quotas(id) ON DELETE CASCADE` |
| Indexes | `uq_prog_elig_band`, `idx_prog_elig_resolve` | both include `quota_id` |
| Resolver fns | `fn_hostel_effective_room_categories`, `fn_hostel_effective_mess_categories`, `fn_explain_allocation` | predicate `(quota_id = p_quota OR quota_id IS NULL)` + specificity `(quota_id IS NOT NULL)::int*2` |
| Delegating fns | `fn_apply_hostel_fee_categories_bulk`, `fn_preview_hostel_fee_categories`, learner-RPC wrappers | call the resolvers; **no direct `quota_id` use** → no change needed |
| Type | `types/program-eligibility.ts` | `quota_id: string \| null` on `ProgramEligibility` + DTOs; row `quota_name: string \| null` |
| Generated type | `types/supabase.ts` | **NOT registered** — table absent from the generated `Database` union; the service casts `this.supabase as any` for it, so the column rename needs **no** `types/supabase.ts` edit |
| Service | `lib/services/campus-living/program-eligibility-service.ts` | PostgREST embed `quota:quotas(name)`; insert `quota_id` |
| Form | `app/(routes)/campus-living/settings/program-eligibility/_components/form-dialog.tsx` | single `SearchableSelect`, `ANY_QUOTA` sentinel |
| Table | `_components/columns.tsx` | `QuotaCell` shows one name or "Any quota" |
| Filters | `_components/eligibility-filters.tsx` | single-value quota filter, `QUOTA_ANY` sentinel |

**Data volume:** 7 rows total, 1 with a quota set, 1 distinct quota used. Migration is trivial.

## Design

### 1. Migration (single file, applied + committed real body, mirrored to `supabase/setup/`)

1. `ALTER TABLE hostel_program_eligibility ADD COLUMN quota_ids uuid[];`
2. Backfill: `UPDATE ... SET quota_ids = CASE WHEN quota_id IS NULL THEN NULL ELSE ARRAY[quota_id] END;`
3. `ALTER TABLE ... DROP CONSTRAINT hostel_program_eligibility_quota_id_fkey;`
4. `ALTER TABLE ... DROP COLUMN quota_id;`
5. **Normalization + validation trigger** `trg_prog_elig_normalize_quotas` (`BEFORE INSERT OR UPDATE`):
   - empty array (`cardinality = 0`) → `NULL`;
   - de-dupe + **sort ascending** so the array is canonical (order-insensitive uniqueness);
   - validate every element exists in `quotas` — `RAISE EXCEPTION` otherwise (replaces the FK).
   - `SET search_path = public`; `SECURITY DEFINER` not required (operates on NEW only).
6. Rebuild indexes using `COALESCE(quota_ids, '{}'::uuid[])` in place of the old
   `COALESCE(quota_id, zero-uuid)`:
   - `uq_prog_elig_band` → `UNIQUE (institution_id, COALESCE(program_id, zero-uuid), COALESCE(quota_ids, '{}'), COALESCE(fee_min, -1), COALESCE(fee_max, -1), hostel_type)`. Exact-duplicate rules stay blocked; overlapping (non-identical) quota sets are allowed and resolved by specificity.
   - `idx_prog_elig_resolve` → `(institution_id, program_id, is_active)` btree **+** a GIN index `idx_prog_elig_quota_ids ON hostel_program_eligibility USING gin (quota_ids)` for `= ANY` membership (cosmetic at 7 rows, future-proof).

### 2. Resolver functions (3) — `CREATE OR REPLACE`, real body committed + mirrored

For all three, rebuilt **from the current live definition** (per the create-or-replace
gotcha), apply the same two edits:

- predicate: `(e.quota_id = p_quota OR e.quota_id IS NULL)` → `(e.quota_ids IS NULL OR p_quota = ANY(e.quota_ids))`
- specificity: `(e.quota_id IS NOT NULL)::int * 2` → `(e.quota_ids IS NOT NULL)::int * 2`
- winner-join: `c.quota_id IS NOT DISTINCT FROM w.quota_id` → `c.quota_ids IS NOT DISTINCT FROM w.quota_ids`

`fn_explain_allocation` additionally:
- carries `quota_ids` through its `rules`/`winner` CTEs;
- the emitted JSON `'quota'` field becomes an **array of names**:
  `(SELECT array_agg(name ORDER BY name) FROM quotas WHERE id = ANY(r.quota_ids))`,
  rendered as a comma-joined string or `null` for "any quota".

Signatures (`p_quota uuid` input — the *learner's* single quota) are **unchanged**; only
the row-side matching changes.

### 3. Types

- `types/program-eligibility.ts`:
  - `ProgramEligibility.quota_id: string | null` → `quota_ids: string[] | null`
  - `CreateProgramEligibilityDto.quota_id?` / `UpdateProgramEligibilityDto.quota_id?` → `quota_ids?: string[] | null`
  - `ProgramEligibilityRow.quota_name: string | null` → `quota_names: string[]` (empty array = any quota)
- `types/supabase.ts`: **no change** — `hostel_program_eligibility` is not in the generated `Database` union (verified: 0 matches in the 107k-line file), and the service already casts `this.supabase as any` for it. Registering the table is out of scope (surgical edits).

### 4. Service (`program-eligibility-service.ts`)

- `getEligibility`: drop the `quota:quotas(name)` embed (the FK it relied on is gone).
  Select `quota_ids` raw, collect all distinct ids across the result, fetch
  `quotas(id, name)` in **one** query, build an id→name map, and project
  `quota_names = (row.quota_ids ?? []).map(id => map[id]).filter(Boolean)`.
- `createEligibility` / `updateEligibility`: send `quota_ids: dto.quota_ids?.length ? dto.quota_ids : null` (defensive — the trigger also collapses `[]`→`NULL`).
- `getActiveQuotas` is reused as-is for the form's option list.

### 5. Form (`form-dialog.tsx` + new `_components/quota-multi-select.tsx`)

- New `quota-multi-select.tsx` built from the codebase's established pattern
  (`Command` + `Popover` + `Badge` chips, as in `multi-role-selector.tsx` /
  `team-member-picker.tsx`) — **no new dependency**. Props: `options`, `value: string[]`,
  `onChange`, `placeholder`. Empty value renders an "Any quota" hint.
- Form state `quota: string` → `quotaIds: string[]`.
- Edit mode loads `row.quota_ids ?? []`; create mode defaults to `[]`.
- Submit maps `quotaIds` straight through (empty → service sends `null`).
- The `ANY_QUOTA` sentinel is removed (empty selection is the "any" state).

### 6. Table + filters

- `columns.tsx` `QuotaCell`: when `quota_names.length === 0` → "Any quota" badge; else
  render one chip per name (wrap/truncate gracefully).
- `eligibility-filters.tsx`:
  - filter predicate: `f.quota === QUOTA_ANY ? (row.quota_ids == null || row.quota_ids.length === 0) : (row.quota_ids?.includes(f.quota) ?? false)`
  - quota options derived by flattening `row.quota_ids` across rows (distinct);
  - search haystack includes `row.quota_names.join(' ')`.

## Deploy ordering

**Single cutover** (chosen): the migration drops `quota_id` + replaces the 3 functions
atomically. The currently-deployed app reads `quota_id` (via the PostgREST embed), so it
breaks in the window between migration apply and code deploy — apply the migration and
ship the code **together**.

*Optional zero-downtime two-phase* (not chosen, recorded for reference): (1) add
`quota_ids` alongside `quota_id`, backfill, keep both in sync via trigger; (2) deploy code
reading `quota_ids`; (3) later migration drops `quota_id` + FK. Unnecessary for a 7-row
admin page.

## Verification (no test suite — see CLAUDE.md)

1. `mcp__ide__getDiagnostics` clean on every touched `.ts/.tsx` file.
2. DB: after migration, `quota_ids` populated for the 1 pre-existing quota row; trigger
   rejects a bad uuid; `uq_prog_elig_band` blocks an exact duplicate.
3. Browser smoke: add a rule with **2 quotas** + a fee band → Deluxe; via the
   **Sync Categories** preview (or `fn_explain_allocation` on a learner in each quota),
   confirm a learner in *either* quota resolves to Deluxe, and a learner in a *third*
   quota does not.
4. Confirm the table shows both quota chips, filter-by-quota matches the rule, and search
   by quota name finds it.
5. No routes / menu entries / permission keys changed → `check:*` gates not triggered.

## Out of scope

- The **Physical Rooms** tab (cohort room reservation) — separate concept, untouched.
- `effective_from` activation logic (still reserved).
- Any change to quota precedence/specificity semantics beyond carrying the array.

## Files touched

- `supabase/migrations/20260615120000_hostel_program_eligibility_multi_quota.sql` (new)
- `supabase/setup/01_tables.sql`, `supabase/setup/02_functions.sql` (mirror)
- `types/program-eligibility.ts` (`types/supabase.ts` **not** touched — table unregistered, service uses `as any`)
- `lib/services/campus-living/program-eligibility-service.ts`
- `app/(routes)/campus-living/settings/program-eligibility/_components/form-dialog.tsx`
- `app/(routes)/campus-living/settings/program-eligibility/_components/quota-multi-select.tsx` (new)
- `app/(routes)/campus-living/settings/program-eligibility/_components/columns.tsx`
- `app/(routes)/campus-living/settings/program-eligibility/_components/eligibility-filters.tsx`
