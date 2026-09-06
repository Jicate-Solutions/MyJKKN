# Fee-aware Program Eligibility (Campus Living) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate which hostel **room** and **mess** categories a student may take by `(program → quota → current-academic-year academic-fee band)`, enforced at every room allocation (admin + student self-service), configured from the existing Program Eligibility settings page.

**Architecture:** *Extend* the two existing (empty) eligibility tables with `quota_id` + `fee_min`/`fee_max` (rupees, half-open `[min,max)` ranges). All matching logic lives in SQL: one fee function, one resolver per kind, one composite per kind that both callers invoke — a single source of truth. The TS allocation path and the SECURITY DEFINER self-service RPC both call the composite. Fail-open everywhere (no rule / no bill data ⇒ show all).

**Tech Stack:** Next.js 16 (App Router) · React 19 · TanStack Query v5 · Supabase (Postgres + RLS) · TypeScript (strict off) · Shadcn UI.

**Spec:** `docs/superpowers/specs/2026-06-06-campus-living-fee-aware-program-eligibility-design.md`

---

## Prerequisites (read before executing — the gate is *inert until these land*)

This plan ships a **safe, fail-open** engine. With no academic-year-tagged bills it changes nothing visible. For the gate to actually *enforce*, these must be true (tracked **separately**, not in this plan):

1. **Bills must carry `academic_year_id`** — today only 1 of 5,774 academic bills is tagged. The `academic-year-aware-billing` feature (separate approved design) tags new bills.
2. **A current-cohort backfill** of academic bills' `academic_year_id` (safe only for learners whose bills all belong to their current year).
3. `learners_profiles.quota_id` is 72% populated; un-quota'd learners fail-open until quotas are assigned.

Until 1–2 land, `fn_learner_current_year_academic_fee` returns NULL for most learners ⇒ composite returns empty ⇒ **fail-open**. This is expected and safe.

---

## File Structure

**Database (3 migrations + setup mirror):**
- `supabase/migrations/20260606160000_fee_aware_eligibility_schema.sql` — Create: ALTER both tables (quota/fee cols, checks, unique-index swap) + seed `pmss` quota.
- `supabase/migrations/20260606160100_fee_aware_eligibility_functions.sql` — Create: `fn_learner_current_year_academic_fee`, `fn_hostel_effective_{room,mess}_categories`, `fn_hostel_learner_{room,mess}_categories`.
- `supabase/migrations/20260606160200_fee_aware_self_service_gate.sql` — Modify: `fn_my_manual_categories` (inject eligibility filter).
- `supabase/setup/01_tables.sql`, `supabase/setup/02_functions.sql` — Mirror (reference copies).

**TypeScript:**
- `types/program-eligibility.ts` — Modify: add `quota_id`/`fee_min`/`fee_max`/`quota_name` to row + DTO shapes.
- `lib/services/campus-living/program-eligibility-service.ts` — Modify: `getActiveQuotas`, category `type`, carry quota/fee in list+create, rewrite `getEffective*` to the composite RPC.
- `hooks/campus-living/use-program-eligibility.ts` — Modify: `useActiveQuotas`.
- `hooks/campus-living/use-allocation-eligibility.ts` — Modify: `useEffective{Room,Mess}Categories(learnerId)`.
- `app/(routes)/campus-living/settings/program-eligibility/_components/form-dialog.tsx` — Modify: Quota select + Fee-range inputs.
- `app/(routes)/campus-living/settings/program-eligibility/_components/columns.tsx` — Modify: Quota + Fee-band columns.
- `app/(routes)/campus-living/allocations/new/page.tsx` — Modify: call the learner-based hooks.

---

## Task 1: DB — extend eligibility tables + seed PMSS quota

**Files:**
- Create: `supabase/migrations/20260606160000_fee_aware_eligibility_schema.sql`
- Modify (mirror): `supabase/setup/01_tables.sql`

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260606160000_fee_aware_eligibility_schema.sql`:

```sql
-- Fee-aware program eligibility — schema extension.
-- Adds quota + academic-fee band to the two existing (empty) eligibility tables.
-- A row with quota_id/fee_min/fee_max all NULL behaves identically to today's
-- program-only rule (current semantics are a strict subset).

-- ── Room eligibility ────────────────────────────────────────────────────────
ALTER TABLE public.hostel_program_room_eligibility
  ADD COLUMN IF NOT EXISTS quota_id uuid REFERENCES public.quotas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS fee_min  numeric(12,2),
  ADD COLUMN IF NOT EXISTS fee_max  numeric(12,2);

ALTER TABLE public.hostel_program_room_eligibility
  DROP CONSTRAINT IF EXISTS chk_room_elig_fee_range;
ALTER TABLE public.hostel_program_room_eligibility
  ADD CONSTRAINT chk_room_elig_fee_range
  CHECK (fee_min IS NULL OR fee_max IS NULL OR fee_min < fee_max);

-- Replace bracket uniqueness so the same category can exist in different
-- quota/fee bands of the same (institution, program).
DROP INDEX IF EXISTS public.uq_room_elig_inst_prog_cat;
DROP INDEX IF EXISTS public.uq_room_elig_inst_default;
CREATE UNIQUE INDEX uq_room_elig_bracket ON public.hostel_program_room_eligibility (
  institution_id,
  COALESCE(program_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(quota_id,   '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(fee_min, -1),
  COALESCE(fee_max, -1),
  room_category_id
);
CREATE INDEX IF NOT EXISTS idx_room_elig_resolve
  ON public.hostel_program_room_eligibility (institution_id, program_id, quota_id, is_active);

-- ── Mess eligibility ────────────────────────────────────────────────────────
ALTER TABLE public.hostel_program_mess_eligibility
  ADD COLUMN IF NOT EXISTS quota_id uuid REFERENCES public.quotas(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS fee_min  numeric(12,2),
  ADD COLUMN IF NOT EXISTS fee_max  numeric(12,2);

ALTER TABLE public.hostel_program_mess_eligibility
  DROP CONSTRAINT IF EXISTS chk_mess_elig_fee_range;
ALTER TABLE public.hostel_program_mess_eligibility
  ADD CONSTRAINT chk_mess_elig_fee_range
  CHECK (fee_min IS NULL OR fee_max IS NULL OR fee_min < fee_max);

DROP INDEX IF EXISTS public.uq_mess_elig_inst_prog_cat;
DROP INDEX IF EXISTS public.uq_mess_elig_inst_default;
CREATE UNIQUE INDEX uq_mess_elig_bracket ON public.hostel_program_mess_eligibility (
  institution_id,
  COALESCE(program_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(quota_id,   '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(fee_min, -1),
  COALESCE(fee_max, -1),
  mess_category_id
);
CREATE INDEX IF NOT EXISTS idx_mess_elig_resolve
  ON public.hostel_program_mess_eligibility (institution_id, program_id, quota_id, is_active);

-- ── Seed the PMSS quota (matrix has BDS-PMSS; it doesn't exist yet) ──────────
INSERT INTO public.quotas (code, name, is_active)
VALUES ('pmss', 'PMSS Quota', true)
ON CONFLICT (code) DO NOTHING;
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP tool `mcp__supabase__apply_migration` with `name: "fee_aware_eligibility_schema"` and the SQL body above. (Per repo rule: also keep the real SQL committed in `supabase/migrations/` — never a `SELECT 1;` placeholder.)

- [ ] **Step 3: Verify columns + seed (this is the test)**

Run via `mcp__supabase__execute_sql`:

```sql
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name='hostel_program_room_eligibility'
      AND column_name IN ('quota_id','fee_min','fee_max')) AS room_cols,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_name='hostel_program_mess_eligibility'
      AND column_name IN ('quota_id','fee_min','fee_max')) AS mess_cols,
  (SELECT count(*) FROM public.quotas WHERE code='pmss') AS pmss_seeded;
```
Expected: `{ room_cols: 3, mess_cols: 3, pmss_seeded: 1 }`.

- [ ] **Step 4: Mirror to setup reference**

In `supabase/setup/01_tables.sql`, find the `CREATE TABLE ... hostel_program_room_eligibility` and `... hostel_program_mess_eligibility` blocks and add the three columns (`quota_id uuid REFERENCES quotas(id) ON DELETE CASCADE`, `fee_min numeric(12,2)`, `fee_max numeric(12,2)`) plus the `chk_*_fee_range` checks to each, matching the migration. (Reference-only file; no execution.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260606160000_fee_aware_eligibility_schema.sql supabase/setup/01_tables.sql
git commit -m "feat(campus-living): add quota+fee-band columns to program eligibility tables"
```

---

## Task 2: DB — fee source, resolver, and composite SQL functions

**Files:**
- Create: `supabase/migrations/20260606160100_fee_aware_eligibility_functions.sql`
- Modify (mirror): `supabase/setup/02_functions.sql`

- [ ] **Step 1: Write the functions migration**

Create `supabase/migrations/20260606160100_fee_aware_eligibility_functions.sql`:

```sql
-- Fee-aware program eligibility — fee source + resolvers.
-- SINGLE source of truth: nothing else computes the gating fee or the category set.

-- 1. The gating fee = current-academic-year academic bill total.
--    NO COALESCE: SUM over zero rows = NULL = "no fee data" => caller fails open.
--    SECURITY DEFINER so campus-living operators without billing read still get it
--    (returns only an aggregate numeric — no row leakage).
CREATE OR REPLACE FUNCTION public.fn_learner_current_year_academic_fee(p_learner_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT SUM(b.final_amount)
  FROM billing_student_bills b
  JOIN learners_profiles lp ON lp.id = b.student_id
  WHERE b.student_id = p_learner_id
    AND b.fee_source = 'academic'
    AND b.status NOT IN ('cancelled','superseded')
    AND b.academic_year_id = lp.academic_year_id;
$$;

-- 2. Parametric resolver (room). Most-specific matching scope wins; tie-break by
--    tightest band. Returns ALL categories in the winning scope (allow-set).
--    Empty result => caller fails open.
CREATE OR REPLACE FUNCTION public.fn_hostel_effective_room_categories(
  p_institution uuid, p_program uuid, p_quota uuid, p_fee numeric
) RETURNS TABLE(category_id uuid)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  WITH candidates AS (
    SELECT e.room_category_id,
           e.program_id, e.quota_id, e.fee_min, e.fee_max,
           ( (e.program_id IS NOT NULL)::int * 4
           + (e.quota_id   IS NOT NULL)::int * 2
           + ((e.fee_min IS NOT NULL OR e.fee_max IS NOT NULL))::int * 1 ) AS specificity
    FROM hostel_program_room_eligibility e
    WHERE e.institution_id = p_institution
      AND e.is_active
      AND (e.program_id = p_program OR e.program_id IS NULL)
      AND (e.quota_id   = p_quota   OR e.quota_id   IS NULL)
      AND (e.fee_min IS NULL OR p_fee >= e.fee_min)
      AND (e.fee_max IS NULL OR p_fee <  e.fee_max)
  ),
  winner AS (
    SELECT program_id, quota_id, fee_min, fee_max
    FROM candidates
    ORDER BY specificity DESC,
             (COALESCE(fee_max, 9.9e14::numeric) - COALESCE(fee_min, 0)) ASC
    LIMIT 1
  )
  SELECT c.room_category_id
  FROM candidates c JOIN winner w
    ON c.program_id IS NOT DISTINCT FROM w.program_id
   AND c.quota_id   IS NOT DISTINCT FROM w.quota_id
   AND c.fee_min    IS NOT DISTINCT FROM w.fee_min
   AND c.fee_max    IS NOT DISTINCT FROM w.fee_max;
$$;

-- 3. Parametric resolver (mess) — identical shape on the mess table.
CREATE OR REPLACE FUNCTION public.fn_hostel_effective_mess_categories(
  p_institution uuid, p_program uuid, p_quota uuid, p_fee numeric
) RETURNS TABLE(category_id uuid)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  WITH candidates AS (
    SELECT e.mess_category_id,
           e.program_id, e.quota_id, e.fee_min, e.fee_max,
           ( (e.program_id IS NOT NULL)::int * 4
           + (e.quota_id   IS NOT NULL)::int * 2
           + ((e.fee_min IS NOT NULL OR e.fee_max IS NOT NULL))::int * 1 ) AS specificity
    FROM hostel_program_mess_eligibility e
    WHERE e.institution_id = p_institution
      AND e.is_active
      AND (e.program_id = p_program OR e.program_id IS NULL)
      AND (e.quota_id   = p_quota   OR e.quota_id   IS NULL)
      AND (e.fee_min IS NULL OR p_fee >= e.fee_min)
      AND (e.fee_max IS NULL OR p_fee <  e.fee_max)
  ),
  winner AS (
    SELECT program_id, quota_id, fee_min, fee_max
    FROM candidates
    ORDER BY specificity DESC,
             (COALESCE(fee_max, 9.9e14::numeric) - COALESCE(fee_min, 0)) ASC
    LIMIT 1
  )
  SELECT c.mess_category_id
  FROM candidates c JOIN winner w
    ON c.program_id IS NOT DISTINCT FROM w.program_id
   AND c.quota_id   IS NOT DISTINCT FROM w.quota_id
   AND c.fee_min    IS NOT DISTINCT FROM w.fee_min
   AND c.fee_max    IS NOT DISTINCT FROM w.fee_max;
$$;

-- 4. Composite (room): the interface callers use. Reads the learner's dims +
--    fee, then resolves. NULL fee or NULL program => empty => fail-open.
--    SECURITY DEFINER so it reliably reads learners_profiles; returns only ids.
CREATE OR REPLACE FUNCTION public.fn_hostel_learner_room_categories(p_learner_id uuid)
RETURNS TABLE(category_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_institution uuid; v_program uuid; v_quota uuid; v_fee numeric;
BEGIN
  SELECT lp.institution_id, lp.program_id, lp.quota_id
    INTO v_institution, v_program, v_quota
  FROM learners_profiles lp WHERE lp.id = p_learner_id;

  IF v_program IS NULL THEN RETURN; END IF;            -- no program => fail-open
  v_fee := fn_learner_current_year_academic_fee(p_learner_id);
  IF v_fee IS NULL THEN RETURN; END IF;                -- no bill data => fail-open

  RETURN QUERY
    SELECT r.category_id
    FROM fn_hostel_effective_room_categories(v_institution, v_program, v_quota, v_fee) r;
END $$;

-- 5. Composite (mess).
CREATE OR REPLACE FUNCTION public.fn_hostel_learner_mess_categories(p_learner_id uuid)
RETURNS TABLE(category_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_institution uuid; v_program uuid; v_quota uuid; v_fee numeric;
BEGIN
  SELECT lp.institution_id, lp.program_id, lp.quota_id
    INTO v_institution, v_program, v_quota
  FROM learners_profiles lp WHERE lp.id = p_learner_id;

  IF v_program IS NULL THEN RETURN; END IF;
  v_fee := fn_learner_current_year_academic_fee(p_learner_id);
  IF v_fee IS NULL THEN RETURN; END IF;

  RETURN QUERY
    SELECT m.category_id
    FROM fn_hostel_effective_mess_categories(v_institution, v_program, v_quota, v_fee) m;
END $$;

GRANT EXECUTE ON FUNCTION public.fn_hostel_learner_room_categories(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_hostel_learner_mess_categories(uuid) TO authenticated;
```

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration` with `name: "fee_aware_eligibility_functions"` and the SQL above.

- [ ] **Step 3: Verify with crafted data (the test)**

Run this self-contained check via `mcp__supabase__execute_sql`. It seeds a temp band, asserts the resolver, then cleans up:

```sql
DO $$
DECLARE
  v_inst uuid; v_prog uuid; v_quota uuid; v_classic uuid; v_premium uuid; v_cnt int;
BEGIN
  SELECT id INTO v_inst FROM institutions LIMIT 1;
  SELECT id INTO v_prog FROM programs WHERE institution_id = v_inst LIMIT 1;
  SELECT id INTO v_quota FROM quotas WHERE code='government';
  SELECT id INTO v_classic FROM mess_categories WHERE type='boys' AND name ILIKE 'classic%' LIMIT 1;
  SELECT id INTO v_premium FROM mess_categories WHERE type='boys' AND name ILIKE 'premium%' LIMIT 1;

  INSERT INTO hostel_program_mess_eligibility (institution_id, program_id, quota_id, mess_category_id, fee_min, fee_max, is_active)
  VALUES (v_inst, v_prog, v_quota, v_classic, NULL, 400000, true),
         (v_inst, v_prog, v_quota, v_premium, 400000, NULL, true);

  -- fee below 4L => Classic only
  SELECT count(*) INTO v_cnt FROM fn_hostel_effective_mess_categories(v_inst, v_prog, v_quota, 380000) WHERE category_id = v_classic;
  ASSERT v_cnt = 1, 'expected Classic at 380000';
  SELECT count(*) INTO v_cnt FROM fn_hostel_effective_mess_categories(v_inst, v_prog, v_quota, 380000) WHERE category_id = v_premium;
  ASSERT v_cnt = 0, 'expected NO Premium at 380000';
  -- fee >= 4L => Premium only
  SELECT count(*) INTO v_cnt FROM fn_hostel_effective_mess_categories(v_inst, v_prog, v_quota, 420000) WHERE category_id = v_premium;
  ASSERT v_cnt = 1, 'expected Premium at 420000';

  DELETE FROM hostel_program_mess_eligibility WHERE institution_id=v_inst AND program_id=v_prog AND quota_id=v_quota;
  RAISE NOTICE 'RESOLVER OK';
END $$;
```
Expected: completes with `NOTICE: RESOLVER OK` and no `ASSERT` failure.

- [ ] **Step 4: Mirror to setup reference**

Append the five function definitions to `supabase/setup/02_functions.sql` (reference-only).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260606160100_fee_aware_eligibility_functions.sql supabase/setup/02_functions.sql
git commit -m "feat(campus-living): fee-aware eligibility resolver SQL functions"
```

---

## Task 3: DB — gate student self-service categories on fee eligibility

**Files:**
- Create: `supabase/migrations/20260606160200_fee_aware_self_service_gate.sql`
- Modify (mirror): `supabase/setup/02_functions.sql`

- [ ] **Step 1: Write the patched `fn_my_manual_categories`**

Create `supabase/migrations/20260606160200_fee_aware_self_service_gate.sql`. This preserves the existing gender filter and adds a fail-open eligibility intersection (`array_agg` over an empty set is NULL ⇒ `v_elig IS NULL` ⇒ show all):

```sql
CREATE OR REPLACE FUNCTION public.fn_my_manual_categories()
RETURNS TABLE(id uuid, name text, type text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_gender  text;
  v_learner uuid;
  v_elig    uuid[];
BEGIN
  SELECT lower(trim(gender)) INTO v_gender FROM profiles WHERE profiles.id = auth.uid();
  v_learner := get_my_learner_id();

  -- Fee-aware allow-set for this learner. NULL (no rule / no bill data) => fail-open.
  SELECT array_agg(category_id) INTO v_elig
  FROM fn_hostel_learner_room_categories(v_learner);

  RETURN QUERY
  SELECT c.id, c.name, c.type FROM hostel_categories c
  WHERE c.allocation_mode='manual' AND c.is_active
    AND ((v_gender IN ('male','m')   AND c.type='boys')
         OR (v_gender IN ('female','f') AND c.type='girls'))
    AND (v_elig IS NULL OR c.id = ANY(v_elig))
  ORDER BY c.sort_order;
END $function$;
```

- [ ] **Step 2: Apply the migration**

`mcp__supabase__apply_migration` with `name: "fee_aware_self_service_gate"` and the SQL above.

- [ ] **Step 3: Verify it still returns rows for an unconfigured learner (fail-open test)**

```sql
-- With no eligibility rows configured for that learner's program, the gate must
-- be transparent: the function should still return the gender-matched manual
-- categories. Pick any hosteler and confirm a non-empty result is possible.
SELECT pg_get_functiondef('public.fn_my_manual_categories()'::regprocedure) ILIKE '%v_elig IS NULL OR c.id = ANY(v_elig)%' AS gate_injected;
```
Expected: `{ gate_injected: true }`.

- [ ] **Step 4: Mirror to setup reference**

Replace the `fn_my_manual_categories` body in `supabase/setup/02_functions.sql` with the patched version.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260606160200_fee_aware_self_service_gate.sql supabase/setup/02_functions.sql
git commit -m "feat(campus-living): gate self-service room categories on fee eligibility"
```

---

## Task 4: Types — add quota + fee-band fields

**Files:**
- Modify: `types/program-eligibility.ts`

- [ ] **Step 1: Add fields to room + mess shapes and DTOs**

In `types/program-eligibility.ts`, add `quota_id`, `fee_min`, `fee_max` to both base interfaces, `quota_name` to both row interfaces, and the three new fields to both Create DTOs. Apply these exact edits:

In `ProgramRoomEligibility`, after `room_category_id: string;` add:
```ts
  quota_id: string | null;
  fee_min: number | null;
  fee_max: number | null;
```
In `ProgramRoomEligibilityRow`, after `room_category_name: string | null;` add:
```ts
  quota_name: string | null; // null => any quota
```
In `CreateProgramRoomEligibilityDto`, after `room_category_id: string;` add:
```ts
  quota_id?: string | null;
  fee_min?: number | null;
  fee_max?: number | null;
```
Repeat the identical pattern for the mess trio: add `quota_id/fee_min/fee_max` to `ProgramMessEligibility` (after `mess_category_id`), `quota_name` to `ProgramMessEligibilityRow` (after `mess_category_name`), and `quota_id?/fee_min?/fee_max?` to `CreateProgramMessEligibilityDto` (after `mess_category_id`).

- [ ] **Step 2: Verify types compile**

Run `mcp__ide__getDiagnostics` on `types/program-eligibility.ts`.
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add types/program-eligibility.ts
git commit -m "feat(campus-living): quota+fee-band fields on eligibility types"
```

---

## Task 5: Service — quotas loader, gender-typed categories, carry quota/fee, RPC resolvers

**Files:**
- Modify: `lib/services/campus-living/program-eligibility-service.ts`

- [ ] **Step 1: Add the QuotaOption shape + `type` to CategoryOption**

Near the top option interfaces, change `CategoryOption` and add `QuotaOption`:
```ts
export interface CategoryOption {
  id: string;
  name: string;
  type: string | null; // 'boys' | 'girls' — disambiguates same-named gender variants
}
export interface QuotaOption {
  id: string;
  code: string;
  name: string;
}
```

- [ ] **Step 2: Select `quota` + `quota_id/fee_min/fee_max` in the list queries**

In `getRoomEligibility`, change the `.select(...)` string to include the quota join:
```ts
      .select(
        '*, institution:institutions(name), program:programs(program_name), quota:quotas(name), room_category:hostel_categories(name)'
      )
```
And in the `.map(...)` return, destructure + surface `quota_name` (the `...rest` already carries `quota_id/fee_min/fee_max` from `*`):
```ts
      const quota = r.quota as { name?: string } | null;
      const { institution: _i, program: _p, quota: _q, room_category: _c, ...rest } = r;
      return {
        ...(rest as ProgramRoomEligibility),
        institution_name: institution?.name ?? null,
        program_name: program?.program_name ?? null,
        quota_name: quota?.name ?? null,
        room_category_name: category?.name ?? null,
      };
```
Apply the identical change to `getMessEligibility` (use `mess_category:mess_categories(name)` and `mess_category_name`, keep the `quota:quotas(name)` join + `quota_name`).

- [ ] **Step 3: Normalize quota/fee in create**

In `createRoomEligibility`, change the insert payload so `quota_id` empty-string/undefined → null:
```ts
      .insert([{ ...dto, program_id: dto.program_id ?? null, quota_id: dto.quota_id || null, fee_min: dto.fee_min ?? null, fee_max: dto.fee_max ?? null }])
```
Apply the identical `quota_id/fee_min/fee_max` normalization to `createMessEligibility`'s insert payload.

- [ ] **Step 4: Add `type` to the category loaders**

In `getActiveRoomCategories`, change `.select('id, name')` → `.select('id, name, type')`. Same for `getActiveMessCategories`.

- [ ] **Step 5: Add `getActiveQuotas`**

Append this method to the class (after `getActiveMessCategories`):
```ts
  static async getActiveQuotas(): Promise<QuotaOption[]> {
    const { data, error } = await this.supabase
      .from('quotas')
      .select('id, code, name')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) {
      logger.error(LOG, 'Database error loading quotas', error);
      throw new Error(error.message || 'Failed to load quotas');
    }
    return (data ?? []) as QuotaOption[];
  }
```

- [ ] **Step 6: Rewrite `getEffective{Room,Mess}Categories` to the composite RPC (learner-based)**

Replace the entire bodies of both `getEffectiveRoomCategories` and `getEffectiveMessCategories` with learner-based RPC calls (the resolver now lives in SQL):
```ts
  // Fee-aware effective categories for a learner — program → quota → fee band.
  // The whole decision lives in the composite SQL function; [] => fail open.
  static async getEffectiveRoomCategories(learnerId: string): Promise<string[]> {
    // RPC not in generated Database types (existing loosely-typed RPC pattern).
    const { data, error } = await (this.supabase.rpc as any)(
      'fn_hostel_learner_room_categories',
      { p_learner_id: learnerId }
    );
    if (error) {
      logger.error(LOG, 'Database error resolving effective room categories', error);
      throw new Error(error.message || 'Failed to resolve room categories');
    }
    return ((data ?? []) as Array<{ category_id: string }>).map((r) => r.category_id);
  }

  static async getEffectiveMessCategories(learnerId: string): Promise<string[]> {
    const { data, error } = await (this.supabase.rpc as any)(
      'fn_hostel_learner_mess_categories',
      { p_learner_id: learnerId }
    );
    if (error) {
      logger.error(LOG, 'Database error resolving effective mess categories', error);
      throw new Error(error.message || 'Failed to resolve mess categories');
    }
    return ((data ?? []) as Array<{ category_id: string }>).map((r) => r.category_id);
  }
```

- [ ] **Step 7: Verify**

Run `mcp__ide__getDiagnostics` on `lib/services/campus-living/program-eligibility-service.ts`.
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add lib/services/campus-living/program-eligibility-service.ts
git commit -m "feat(campus-living): quota loader, gender-typed categories, RPC-based eligibility resolver"
```

---

## Task 6: Hooks — `useActiveQuotas` + learner-based effective-category hooks

**Files:**
- Modify: `hooks/campus-living/use-program-eligibility.ts`
- Modify: `hooks/campus-living/use-allocation-eligibility.ts`

- [ ] **Step 1: Add `useActiveQuotas`**

In `hooks/campus-living/use-program-eligibility.ts`, append after `useActiveMessCategories`:
```ts
export function useActiveQuotas() {
  const query = useQuery({
    queryKey: [...ELIG_KEY, 'quotas'],
    queryFn: () => ProgramEligibilityService.getActiveQuotas(),
  });
  return { quotas: query.data ?? [], loading: query.isLoading };
}
```

- [ ] **Step 2: Rewrite the effective-category hooks to learner-based**

In `hooks/campus-living/use-allocation-eligibility.ts`, replace the `useEffectiveRoomCategories` and `useEffectiveMessCategories` functions with single-arg (learnerId) versions:
```ts
/**
 * Fee-aware effective room-category ids for a learner (program → quota → fee
 * band). The whole decision lives in the composite SQL fn. [] => fail open.
 */
export function useEffectiveRoomCategories(learnerId: string | null | undefined) {
  return useQuery({
    queryKey: [...ALLOC_ELIG_KEY, 'room-cats', learnerId ?? null],
    queryFn: () => ProgramEligibilityService.getEffectiveRoomCategories(learnerId!),
    enabled: !!learnerId,
    staleTime: 5 * 60 * 1000,
  });
}

/** Fee-aware effective mess-category ids for a learner. */
export function useEffectiveMessCategories(learnerId: string | null | undefined) {
  return useQuery({
    queryKey: [...ALLOC_ELIG_KEY, 'mess-cats', learnerId ?? null],
    queryFn: () => ProgramEligibilityService.getEffectiveMessCategories(learnerId!),
    enabled: !!learnerId,
    staleTime: 5 * 60 * 1000,
  });
}
```

- [ ] **Step 3: Confirm no other callers use the old 2-arg signature**

Run via Grep (output_mode content): pattern `useEffectiveRoomCategories|useEffectiveMessCategories`, path `app`/`hooks`/`components`.
Expected: the only consumer is `app/(routes)/campus-living/allocations/new/page.tsx` (updated in Task 9). If any other file passes `(institutionId, programId)`, update it to pass the learner id.

- [ ] **Step 4: Verify**

Run `mcp__ide__getDiagnostics` on both hook files.
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add hooks/campus-living/use-program-eligibility.ts hooks/campus-living/use-allocation-eligibility.ts
git commit -m "feat(campus-living): useActiveQuotas + learner-based effective-category hooks"
```

---

## Task 7: Settings dialog — Quota select + Fee-range inputs

**Files:**
- Modify: `app/(routes)/campus-living/settings/program-eligibility/_components/form-dialog.tsx`

- [ ] **Step 1: Import `useActiveQuotas` and add state**

Add `useActiveQuotas` to the existing import from `@/hooks/campus-living/use-program-eligibility`. Add a constant near `INSTITUTION_DEFAULT`:
```ts
const ANY_QUOTA = '__any_quota__';
```
Add state alongside the existing `useState` declarations:
```ts
  const [quota, setQuota] = useState<string>(ANY_QUOTA);
  const [feeMinL, setFeeMinL] = useState<string>(''); // lakhs (UI), '' = unbounded
  const [feeMaxL, setFeeMaxL] = useState<string>('');
```
Add the loader next to the category loaders:
```ts
  const { quotas } = useActiveQuotas();
```

- [ ] **Step 2: Initialize/reset the new fields in the `useEffect`**

In the `if (isEdit)` branch add (after `setEffectiveFrom(...)`):
```ts
      setQuota(row?.quota_id ?? ANY_QUOTA);
      setFeeMinL(row?.fee_min != null ? String(row.fee_min / 100000) : '');
      setFeeMaxL(row?.fee_max != null ? String(row.fee_max / 100000) : '');
```
In the `else` branch add:
```ts
      setQuota(ANY_QUOTA);
      setFeeMinL('');
      setFeeMaxL('');
```
(`row` resolves to `roomRow`/`messRow`, both of which now carry `quota_id`/`fee_min`/`fee_max` from Task 4.)

- [ ] **Step 3: Build the quota + gender-labeled category options**

Add a quota option list near `programOptions`:
```ts
  const quotaOptions = [
    { value: ANY_QUOTA, label: 'All quotas — any' },
    ...quotas.map((q) => ({ value: q.id, label: q.name })),
  ];
```
Change `categoryOptions` to disambiguate gender variants:
```ts
  const categoryOptions = (kind === 'room' ? roomCategories : messCategories).map(
    (c) => ({ value: c.id, label: c.type ? `${c.name} (${c.type})` : c.name })
  );
```

- [ ] **Step 4: Pass quota + fee into the create payloads**

In `onSubmit`, after `const programId = ...`, add:
```ts
      const quotaId = quota === ANY_QUOTA ? null : quota;
      const toRupees = (s: string) => {
        const n = parseFloat(s);
        return s.trim() !== '' && !Number.isNaN(n) ? Math.round(n * 100000) : null;
      };
      const feeMin = toRupees(feeMinL);
      const feeMax = toRupees(feeMaxL);
      if (feeMin != null && feeMax != null && feeMin >= feeMax) {
        toast.error('Fee "min" must be less than "max"');
        return;
      }
```
In the room **create** branch (`roomHook.createRoomEligibility({...})`) add `quota_id: quotaId, fee_min: feeMin, fee_max: feeMax,`. In the mess **create** branch (`messHook.createMessEligibility({...})`) add the same three fields. (Edit branches are unchanged — scope/quota/fee are immutable once created, matching today's category/scope behavior.)

- [ ] **Step 5: Render the Quota select + Fee-range inputs**

Insert this JSX between the Scope block (closing `</div>` of the Scope group, ~line 223) and the Category block:
```tsx
          <div className='space-y-2'>
            <Label>Quota</Label>
            <SearchableSelect
              value={quota}
              onValueChange={setQuota}
              options={quotaOptions}
              placeholder='Select quota'
              disabled={isEdit}
              modal
            />
            <p className='text-xs text-muted-foreground'>
              Choose &ldquo;All quotas&rdquo; to apply regardless of quota, or a
              specific quota for a finer rule.
            </p>
          </div>

          <div className='space-y-2'>
            <Label>
              Academic Fee Band (₹ lakhs){' '}
              <span className='text-muted-foreground font-normal'>(Optional)</span>
            </Label>
            <div className='flex items-center gap-2'>
              <Input
                type='number'
                inputMode='decimal'
                step='0.01'
                min='0'
                placeholder='Min'
                value={feeMinL}
                onChange={(e) => setFeeMinL(e.target.value)}
                disabled={isEdit}
              />
              <span className='text-muted-foreground text-sm'>to</span>
              <Input
                type='number'
                inputMode='decimal'
                step='0.01'
                min='0'
                placeholder='Max'
                value={feeMaxL}
                onChange={(e) => setFeeMaxL(e.target.value)}
                disabled={isEdit}
              />
            </div>
            <p className='text-xs text-muted-foreground'>
              Half-open band: includes Min, excludes Max. Leave a side blank for
              unbounded (e.g. blank–4 = below ₹4L; 5–6 = ₹5L up to under ₹6L).
              Leave both blank to apply at any fee.
            </p>
          </div>
```

- [ ] **Step 6: Verify**

Run `mcp__ide__getDiagnostics` on `form-dialog.tsx`.
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add "app/(routes)/campus-living/settings/program-eligibility/_components/form-dialog.tsx"
git commit -m "feat(campus-living): quota + academic-fee-band controls in eligibility dialog"
```

---

## Task 8: Settings table — Quota + Fee-band columns

**Files:**
- Modify: `app/(routes)/campus-living/settings/program-eligibility/_components/columns.tsx`

- [ ] **Step 1: Add a shared fee-band formatter + Quota cell**

At the top of `columns.tsx` (after the imports, before `ScopeCell`), add:
```tsx
// ₹ rupees → compact lakh label. Trims trailing zeros (400000 => "4L").
const lakh = (n: number) => `${Number((n / 100000).toFixed(2))}L`;
function FeeBandCell({ min, max }: { min: number | null; max: number | null }) {
  let label: string;
  if (min == null && max == null) label = 'Any';
  else if (min == null) label = `< ${lakh(max!)}`;
  else if (max == null) label = `≥ ${lakh(min)}`;
  else label = `${lakh(min)} – ${lakh(max)}`;
  return <span className='text-sm tabular-nums'>{label}</span>;
}
function QuotaCell({ name }: { name: string | null }) {
  return name
    ? <span className='text-sm'>{name}</span>
    : <Badge variant='secondary' className='font-normal'>Any quota</Badge>;
}
```

- [ ] **Step 2: Insert the two columns into both column arrays**

In `createRoomColumns`, immediately after the `program_name` ("Scope") column object, insert:
```tsx
  {
    accessorKey: 'quota_name',
    header: 'Quota',
    cell: ({ row }) => <QuotaCell name={row.original.quota_name} />,
  },
  {
    id: 'fee_band',
    header: 'Fee Band',
    cell: ({ row }) => <FeeBandCell min={row.original.fee_min} max={row.original.fee_max} />,
  },
```
Insert the identical two column objects into `createMessColumns` immediately after its `program_name` ("Scope") column.

- [ ] **Step 3: Verify**

Run `mcp__ide__getDiagnostics` on `columns.tsx`.
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "app/(routes)/campus-living/settings/program-eligibility/_components/columns.tsx"
git commit -m "feat(campus-living): quota + fee-band columns on eligibility tables"
```

---

## Task 9: Allocation page — call the learner-based hooks

**Files:**
- Modify: `app/(routes)/campus-living/allocations/new/page.tsx`

- [ ] **Step 1: Switch the eligibility hook calls to learner-based**

Replace the block at lines ~90-98 (the `useLearnerProgramId` + two `useEffective*` calls) with the learner-based form. The `institutionId`/`learnerProgramId` are no longer needed to *feed eligibility* (the SQL composite derives institution/program/quota/fee itself):
```ts
  const { data: eligibleRoomCategoryIds } = useEffectiveRoomCategories(
    formData.learner_id || null,
  );
  const { data: eligibleMessCategoryIds } = useEffectiveMessCategories(
    formData.learner_id || null,
  );
```

- [ ] **Step 2: Clean up now-unused imports/vars**

If `useLearnerProgramId` and the `institutionId` const are no longer referenced anywhere else in the file (confirm via Grep within the file), remove `useLearnerProgramId` from the import on lines 23-28 and delete the now-orphan `learnerProgramId`/`institutionId` lines. If `institutionId` is still used elsewhere in the page, leave it. (Do not remove `useFeeQuote`.)

- [ ] **Step 3: Verify**

Run `mcp__ide__getDiagnostics` on `app/(routes)/campus-living/allocations/new/page.tsx`.
Expected: no errors. The existing fail-open filter (`roomFilterActive`, `visibleRooms`, hints) is unchanged and now driven by the fee-aware sets.

- [ ] **Step 4: Commit**

```bash
git add "app/(routes)/campus-living/allocations/new/page.tsx"
git commit -m "feat(campus-living): drive allocation category filter from fee-aware resolver"
```

---

## Task 10: End-to-end verification (browser + SQL)

**Files:** none (verification only).

- [ ] **Step 1: Diagnostics sweep**

Run `mcp__ide__getDiagnostics` on every touched TS file (Tasks 4-9). Expected: zero errors.

- [ ] **Step 2: Seed a realistic matrix slice for one program (SQL)**

Replace `:inst`, `:prog` by picking a BDS-like program. Run via `mcp__supabase__execute_sql` (adjust the program name filter to a real one):
```sql
WITH ctx AS (
  SELECT i.id AS inst,
         (SELECT id FROM programs p WHERE p.institution_id=i.id ORDER BY p.program_name LIMIT 1) AS prog,
         (SELECT id FROM quotas WHERE code='government') AS govt,
         (SELECT id FROM mess_categories WHERE type='boys' AND name ILIKE 'classic%' LIMIT 1) AS mclassic,
         (SELECT id FROM mess_categories WHERE type='boys' AND name ILIKE 'premium%' LIMIT 1) AS mpremium,
         (SELECT id FROM hostel_categories WHERE type='boys' AND name ILIKE 'classic%' LIMIT 1) AS rclassic
  FROM institutions i LIMIT 1
)
INSERT INTO hostel_program_room_eligibility (institution_id, program_id, quota_id, room_category_id, fee_min, fee_max, is_active)
SELECT inst, prog, govt, rclassic, NULL, NULL, true FROM ctx;  -- Govt → Classic at any fee
-- (then insert the two mess bands as in Task 2 Step 3)
```
Confirm rows appear in the Settings page Room/Mess tabs with the Quota="Government Quota" and the Fee Band rendered.

- [ ] **Step 3: Browser — Settings (as a non-super-admin campus-living role)**

Open `/campus-living/settings/program-eligibility`. Add a Room rule (Institution → a program → Quota=Government → Fee blank-blank → Classic Room (boys)). Add two Mess rules (Classic for blank–4, Premium for 4–blank). Confirm the table shows Quota + Fee Band columns correctly, and create/edit/delete refresh without reload.

- [ ] **Step 4: Browser — Allocation gating**

For a learner of that program+quota **with a current-year academic bill** (`academic_year_id = profile.academic_year_id`) summing < ₹4L: open `/campus-living/allocations/new`, select that learner + block. Expect rooms narrowed to Classic and the mess list to Classic only. For a learner summing ≥ ₹4L, expect mess narrowed to Premium. For a learner with **no tagged bill**, expect all categories shown + the "No room eligibility configured — showing all rooms" hint (fail-open).

- [ ] **Step 5: Browser — Student self-service**

As a hosteler student of that program (with a tagged bill) open the `request-room` flow; confirm the manual category list is narrowed to the eligible set, and that an unconfigured learner sees the full gender-matched list (fail-open).

- [ ] **Step 6: Clean up the seed rows (if this was a non-production check)**

```sql
DELETE FROM hostel_program_room_eligibility WHERE fee_min IS NULL AND fee_max IS NULL AND quota_id = (SELECT id FROM quotas WHERE code='government') AND program_id IS NOT NULL;
-- and the mess test rows you inserted
```

- [ ] **Step 7: Final commit (if any verification tweaks were made)**

```bash
git add -A
git commit -m "test(campus-living): verify fee-aware eligibility end-to-end"
```

---

## Self-Review notes (for the executor)
- **Fail-open is load-bearing.** Three independent layers produce it: NULL fee (no COALESCE), empty composite result, and `v_elig IS NULL` in self-service. Do not "fix" any of them into a default-deny.
- **Gender:** rules store gender-typed category ids; configure both boys + girls variants for a co-ed program. The dialog labels categories `Name (boys|girls)` so the right one is pickable.
- **Inert until prerequisites:** if browser Step 4 shows everything fail-open, first check the learner actually has a bill with `academic_year_id = profile.academic_year_id` (see Prerequisites) — that is the expected current state, not a bug.
- **RPC typing:** the two composite RPCs are called with `(this.supabase.rpc as any)` because they are not in the generated `Database` type — matching the repo's loosely-typed RPC pattern; `typescript.ignoreBuildErrors` is on.
