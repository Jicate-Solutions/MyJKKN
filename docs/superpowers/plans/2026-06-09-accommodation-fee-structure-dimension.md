# Accommodation Fee-Structure Dimension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-introduce `accommodation_type_id` as an *optional* matching dimension (parallel to `gender`) so admission fee structures can target Day Scholar vs Hostel, and the learner enquiry form resolves the right one — without touching hostel billing (which lives in campus-living).

**Architecture:** `accommodation_type_id` is a nullable column on `admission_fee_structures` (NULL = "Any"). Two resolution paths must agree: the persist RPC `admission_resolve_fee_items_for_lead` (writes `fee_items` onto `learners_profiles`) and the preview `FeeStructureService.findByDimensions` (enquiry Finance tab). Both filter `(accommodation = learner's OR NULL)` and rank accommodation-specific > gender-specific > most-recently-updated. The 90 active `dayscholar` structures are re-tagged to NULL so nothing regresses. Hostel-kind billing categories are already excluded from the item picker, so academic-only is structurally guaranteed.

**Tech Stack:** Next.js 16 / React 19, TypeScript, Supabase (Postgres + RLS), TanStack Query, Shadcn UI. No automated test runner in this repo — verification is `mcp__ide__getDiagnostics` per file + SQL parity queries via the Supabase MCP + browser smoke for a non-super-admin role.

**Spec:** `docs/superpowers/specs/2026-06-09-accommodation-fee-structure-dimension-design.md`

**Conventions for this plan:**
- Migrations are applied via `mcp__supabase__apply_migration` AND the real SQL body is committed to `supabase/migrations/` (never a `SELECT 1;` placeholder), then mirrored into `supabase/setup/`.
- TypeScript is verified with `mcp__ide__getDiagnostics` per touched file (the repo's build does NOT typecheck; full `tsc` OOMs).
- Each commit stages only the files it touches (`git add <explicit paths>`) — the working tree contains unrelated in-progress changes that must NOT be swept in.
- This change touches **no routes and no permission keys**, so `check:*` nav/permission gates are not required.

---

## Task 0: Create the feature branch

**Files:** none (git only)

- [ ] **Step 1: Branch off main without disturbing the working tree**

The repo is on `main` with unrelated uncommitted changes. Branching carries them along uncommitted; that's fine — each task below stages only its own files.

Run:
```bash
git checkout -b feat/admission/fee-structure-accommodation-dimension
```
Expected: `Switched to a new branch 'feat/admission/fee-structure-accommodation-dimension'`

---

## Task 1: DB — re-add accommodation to the resolution RPC + overlap trigger

**Files:**
- Create: `supabase/migrations/20260609150000_fee_structure_readd_accommodation_dimension.sql`
- Modify (mirror): `supabase/setup/02_functions.sql` (RPC body)
- Modify (mirror): `supabase/setup/04_triggers.sql` (trigger function body)

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260609150000_fee_structure_readd_accommodation_dimension.sql` with this exact content:

```sql
-- ─── Re-add accommodation_type as an OPTIONAL fee-structure dimension ────────
-- Reverses the matching-logic half of 20260528000008. accommodation_type_id
-- becomes a second optional matching dimension parallel to `gender`:
--   NULL = "Any accommodation" (wildcard); a non-NULL value targets that type.
-- Resolution prefers an accommodation-specific structure, then falls back to a
-- NULL ("Any") structure. Academic-fees-only is preserved: hostel-kind billing
-- categories remain excluded from the item picker, so this cannot reintroduce
-- the campus-living double-billing risk.
--
-- Changes:
--   1. Resolution RPC: add accommodation filter + accommodation-first ORDER BY.
--   2. Overlap trigger: add accommodation bucket-equality so an "Any" and a
--      type-specific structure can coexist, while duplicates still collide.

-- 1. Resolution RPC — accommodation-aware match (prefer-specific-then-Any).
CREATE OR REPLACE FUNCTION public.admission_resolve_fee_items_for_lead(p_learner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_lead              record;
    v_structure_id      uuid;
    v_resolved          jsonb;
    v_base_items        jsonb;
    v_adjustments       jsonb;
    v_global_deltas_sum numeric(15,2) := 0;
BEGIN
    SELECT institution_id, degree_id, department_id, program_id,
           quota_id, community_category_id, accommodation_type_id, admission_year_id,
           legacy_fee_mode, gender
      INTO v_lead
      FROM public.learners_profiles
     WHERE id = p_learner_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'learner_not_found: %', p_learner_id USING ERRCODE = 'P0002';
    END IF;

    IF v_lead.legacy_fee_mode = true THEN
        RETURN COALESCE((SELECT fee_items FROM public.learners_profiles WHERE id = p_learner_id), '[]'::jsonb);
    END IF;

    -- accommodation_type_id is an OPTIONAL match dimension (NULL = Any). Prefer
    -- an accommodation-specific structure, then a gender-specific one, then the
    -- most recently updated, as the deterministic tiebreak. Hostel ROOM/MESS
    -- fees still live in campus-living; this only routes academic/common fees.
    SELECT afs.id INTO v_structure_id
      FROM public.admission_fee_structures afs
     WHERE afs.institution_id        = v_lead.institution_id
       AND afs.degree_id             = v_lead.degree_id
       AND afs.department_id         = v_lead.department_id
       AND afs.programme_id          = v_lead.program_id
       AND afs.quota_id              = v_lead.quota_id
       AND afs.admission_year_id     = v_lead.admission_year_id
       AND afs.status = 'active'
       AND EXISTS (
             SELECT 1 FROM public.admission_fee_structure_communities j
              WHERE j.fee_structure_id      = afs.id
                AND j.community_category_id = v_lead.community_category_id
           )
       AND (afs.gender = UPPER(v_lead.gender) OR afs.gender IS NULL)
       AND (afs.accommodation_type_id = v_lead.accommodation_type_id
            OR afs.accommodation_type_id IS NULL)
     ORDER BY afs.accommodation_type_id IS NOT NULL DESC,
              afs.gender IS NOT NULL DESC,
              afs.updated_at DESC
     LIMIT 1;

    IF v_structure_id IS NULL THEN
        UPDATE public.learners_profiles SET fee_items = '[]'::jsonb WHERE id = p_learner_id;
        RETURN '[]'::jsonb;
    END IF;

    SELECT jsonb_agg(jsonb_build_object(
                'category_id',   fsi.billing_category_id,
                'category_name', bc.category_name,
                'amount',        fsi.amount,
                'source',        'structure'))
      INTO v_base_items
      FROM public.admission_fee_structure_items fsi
      JOIN public.billing_categories bc ON bc.id = fsi.billing_category_id
     WHERE fsi.fee_structure_id = v_structure_id;

    IF v_base_items IS NULL THEN
        v_base_items := '[]'::jsonb;
    END IF;

    WITH per_cat AS (
        SELECT billing_category_id, SUM(delta_amount) AS delta_sum
          FROM public.admission_fee_adjustments
         WHERE learner_id = p_learner_id
           AND status = 'active'
           AND billing_category_id IS NOT NULL
         GROUP BY billing_category_id
    )
    SELECT jsonb_agg(
             jsonb_build_object(
               'category_id',   item->>'category_id',
               'category_name', item->>'category_name',
               'amount',        GREATEST(0, (item->>'amount')::numeric
                                  + COALESCE(pc.delta_sum, 0)),
               'source',        item->>'source'))
      INTO v_resolved
      FROM jsonb_array_elements(v_base_items) AS item
      LEFT JOIN per_cat pc ON pc.billing_category_id = (item->>'category_id')::uuid;

    IF v_resolved IS NULL THEN
        v_resolved := '[]'::jsonb;
    END IF;

    SELECT COALESCE(SUM(delta_amount), 0)
      INTO v_global_deltas_sum
      FROM public.admission_fee_adjustments
     WHERE learner_id = p_learner_id
       AND status = 'active'
       AND billing_category_id IS NULL;

    IF v_global_deltas_sum <> 0 THEN
        v_resolved := v_resolved || jsonb_build_array(
            jsonb_build_object(
                'category_id',   NULL,
                'category_name', 'Global Adjustment',
                'amount',        v_global_deltas_sum,
                'source',        'adjustment_global'
            )
        );
    END IF;

    UPDATE public.learners_profiles
       SET fee_items = v_resolved,
           updated_at = now()
     WHERE id = p_learner_id;

    RETURN v_resolved;
END;
$function$;

-- 2. Overlap-prevention trigger — accommodation bucket-equality added.
CREATE OR REPLACE FUNCTION public._fee_structure_community_no_overlap()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_self public.admission_fee_structures%ROWTYPE;
BEGIN
    SELECT * INTO v_self
      FROM public.admission_fee_structures
     WHERE id = NEW.fee_structure_id;

    IF v_self.status = 'archived' THEN
        RETURN NEW;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM public.admission_fee_structure_communities j
          JOIN public.admission_fee_structures fs ON fs.id = j.fee_structure_id
         WHERE j.community_category_id = NEW.community_category_id
           AND j.fee_structure_id <> NEW.fee_structure_id
           AND fs.institution_id        = v_self.institution_id
           AND fs.degree_id             = v_self.degree_id
           AND fs.department_id         = v_self.department_id
           AND fs.programme_id          = v_self.programme_id
           AND fs.quota_id              = v_self.quota_id
           AND fs.admission_year_id     = v_self.admission_year_id
           AND fs.status <> 'archived'
           AND (fs.gender IS NOT DISTINCT FROM v_self.gender
                OR fs.gender IS NULL
                OR v_self.gender IS NULL)
           AND fs.accommodation_type_id IS NOT DISTINCT FROM v_self.accommodation_type_id
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23505',
            MESSAGE = 'Another active fee structure already covers community '
                   || NEW.community_category_id::text
                   || ' for this dimension combination (gender: '
                   || COALESCE(v_self.gender, 'Any')
                   || ', accommodation: '
                   || COALESCE(v_self.accommodation_type_id::text, 'Any')
                   || '). Archive the existing structure first.';
    END IF;

    RETURN NEW;
END;
$function$;
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP tool `mcp__supabase__apply_migration` with:
- `name`: `20260609150000_fee_structure_readd_accommodation_dimension`
- `query`: the full SQL body from Step 1.

Expected: success, no error.

- [ ] **Step 3: Verify both functions compiled with the new logic**

Run `mcp__supabase__execute_sql`:
```sql
SELECT
  (SELECT pg_get_functiondef('public.admission_resolve_fee_items_for_lead(uuid)'::regprocedure)
     LIKE '%accommodation_type_id = v_lead.accommodation_type_id%') AS rpc_has_accom,
  (SELECT pg_get_functiondef('public._fee_structure_community_no_overlap()'::regprocedure)
     LIKE '%accommodation_type_id IS NOT DISTINCT FROM%') AS trigger_has_accom;
```
Expected: both columns `true`.

- [ ] **Step 4: Mirror into the setup reference files**

In `supabase/setup/02_functions.sql`, locate the existing `CREATE OR REPLACE FUNCTION public.admission_resolve_fee_items_for_lead` block and replace its body with the new RPC from Step 1 (the version with the accommodation filter + ORDER BY).

Then locate the `CREATE OR REPLACE FUNCTION public._fee_structure_community_no_overlap` block — it is in `supabase/setup/04_triggers.sql` (grep both files to confirm where the function body lives; update wherever the body is, not the `CREATE TRIGGER` binding). Replace its body with the new trigger function from Step 1.

Use `Grep` with pattern `admission_resolve_fee_items_for_lead` on `supabase/setup/02_functions.sql` and `_fee_structure_community_no_overlap` on `supabase/setup/04_triggers.sql` to find the exact line ranges first.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260609150000_fee_structure_readd_accommodation_dimension.sql supabase/setup/02_functions.sql supabase/setup/04_triggers.sql
git commit -m "feat(admission-fees): re-add accommodation as optional resolution dimension (RPC + overlap trigger)"
```

---

## Task 2: DB — re-tag the 90 active day-scholar structures to "Any" (NULL)

**Files:**
- Create: `supabase/migrations/20260609151000_fee_structure_retag_dayscholar_to_any.sql`

- [ ] **Step 1: Capture the pre-state (for verification + reversibility)**

Run `mcp__supabase__execute_sql`:
```sql
SELECT COUNT(*) AS active_dayscholar
FROM admission_fee_structures fs
JOIN accommodation_types act ON act.id = fs.accommodation_type_id
WHERE fs.status = 'active' AND act.code = 'dayscholar';
```
Expected: `90` (record the exact number; the post-check uses it).

- [ ] **Step 2: Write the migration file**

Create `supabase/migrations/20260609151000_fee_structure_retag_dayscholar_to_any.sql`:

```sql
-- ─── Re-tag active day-scholar fee structures to "Any" (NULL accommodation) ──
-- The 90 active structures tagged 'dayscholar' are the surviving academic-fee
-- twins (their hostel twins were archived on 2026-05-28). With accommodation
-- now an optional matching dimension, they should match EVERY learner, so we
-- null their accommodation_type_id ("Any"). Operators then create
-- accommodation-specific structures only where academic fees actually differ.
--
-- A backup table preserves the old values for full reversibility. The overlap
-- trigger fires on the junction table (INSERT/UPDATE of communities), not on
-- parent-row updates, so this UPDATE cannot trip it.

CREATE TABLE IF NOT EXISTS public._bak_fee_structure_accommodation_retag_20260609 AS
SELECT fs.id,
       fs.accommodation_type_id AS old_accommodation_type_id,
       now() AS backed_up_at
  FROM public.admission_fee_structures fs
  JOIN public.accommodation_types act ON act.id = fs.accommodation_type_id
 WHERE fs.status = 'active'
   AND act.code = 'dayscholar';

UPDATE public.admission_fee_structures
   SET accommodation_type_id = NULL,
       updated_at = now()
 WHERE id IN (SELECT id FROM public._bak_fee_structure_accommodation_retag_20260609);
```

- [ ] **Step 3: Apply the migration**

Apply via `mcp__supabase__apply_migration`:
- `name`: `20260609151000_fee_structure_retag_dayscholar_to_any`
- `query`: the SQL from Step 2.

Expected: success.

- [ ] **Step 4: Verify the re-tag**

Run `mcp__supabase__execute_sql`:
```sql
SELECT
  (SELECT COUNT(*) FROM _bak_fee_structure_accommodation_retag_20260609) AS backed_up,
  (SELECT COUNT(*) FROM admission_fee_structures fs
     JOIN accommodation_types act ON act.id = fs.accommodation_type_id
    WHERE fs.status='active' AND act.code='dayscholar') AS remaining_active_dayscholar,
  (SELECT COUNT(*) FROM admission_fee_structures
    WHERE status='active' AND accommodation_type_id IS NULL) AS active_any;
```
Expected: `backed_up = 90`, `remaining_active_dayscholar = 0`, `active_any = 90`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260609151000_fee_structure_retag_dayscholar_to_any.sql
git commit -m "feat(admission-fees): re-tag 90 active day-scholar structures to Any (backed up)"
```

---

## Task 3: Types — make `accommodation_type_id` a first-class optional dimension

**Files:**
- Modify: `types/admission.ts`

- [ ] **Step 1: Read the current type definitions**

Read `types/admission.ts` lines `1585`–`1720` to see the exact current text of `AdmissionFeeStructure`, `CreateAdmissionFeeStructureInput`, `UpdateAdmissionFeeStructureInput`, and `FeeStructureMatrixDimensions`.

- [ ] **Step 2: Make the column type nullable on the interface**

In `interface AdmissionFeeStructure`, change the field:
```ts
  accommodation_type_id: string;
```
to:
```ts
  // Optional matching dimension (NULL = "Any accommodation"). Parallel to
  // `gender`: resolution prefers an accommodation-specific structure, then
  // falls back to a NULL one. Hostel ROOM/MESS fees stay in campus-living.
  accommodation_type_id: string | null;
```

- [ ] **Step 3: Add accommodation to the create + update inputs**

In `CreateAdmissionFeeStructureInput`, add `'accommodation_type_id'` to the `Partial<Pick<AdmissionFeeStructure, ...>>` union (the same group that contains `'gender'`). Result should read:
```ts
  Partial<Pick<AdmissionFeeStructure, 'status' | 'notes' | 'effective_from' | 'effective_to' | 'gender' | 'accommodation_type_id'>> & {
```

In `UpdateAdmissionFeeStructureInput`, add `'accommodation_type_id'` to its `Partial<Pick<AdmissionFeeStructure, ...>>` union (the group listing the editable matrix dimensions alongside `'gender'`).

- [ ] **Step 4: Update the stale comment on the matrix-dimensions type**

In `interface FeeStructureMatrixDimensions`, replace the existing comment on `accommodation_type_id` ("No longer a fee-matching dimension… ignored by resolution") with:
```ts
  /** Optional matching dimension (NULL/undefined = "Any"). Resolution prefers
   *  an accommodation-specific structure, then falls back to an "Any" one. */
  accommodation_type_id?: string;
```

- [ ] **Step 5: Verify types**

Run `mcp__ide__getDiagnostics` on `types/admission.ts`.
Expected: no new errors introduced by these edits.

- [ ] **Step 6: Commit**

```bash
git add types/admission.ts
git commit -m "feat(admission-fees): type accommodation_type_id as optional fee-structure dimension"
```

---

## Task 4: Service — accommodation-aware `findByDimensions` + clone preservation

**Files:**
- Modify: `lib/services/admission/fee-structure-service.ts`

- [ ] **Step 1: Replace `findByDimensions` with the accommodation-aware version**

Replace the entire `static async findByDimensions(...)` method (currently the two-query gender approach) with this single-fetch-then-rank version, which mirrors the RPC's §5 precedence exactly:

```ts
  /**
   * Find the single active structure matching the 6 hard dims + community,
   * with `gender` and `accommodation_type_id` as OPTIONAL refinements (NULL =
   * "Any"). Fetches all active candidates sharing the hard dims + community
   * (the overlap trigger keeps that set tiny), filters to those whose optional
   * dims match (exact OR wildcard-NULL), then ranks: accommodation-specific >
   * gender-specific > most-recently-updated. This MUST stay in lockstep with
   * admission_resolve_fee_items_for_lead's ORDER BY — preview must equal billed.
   */
  static async findByDimensions(
    d: FeeStructureMatrixDimensions,
    community_category_id: string,
    yearOfStudy: number = 1,
  ): Promise<AdmissionFeeStructureWithItems | null> {
    const supabase = createClientSupabaseClient();
    const gender = d.gender?.toUpperCase() || null;
    const accommodation = d.accommodation_type_id || null;

    const { data: rows, error } = await supabase
      .from('admission_fee_structure_communities')
      .select(
        `fee_structure_id,
         structure:admission_fee_structures!inner(id, status, gender,
           accommodation_type_id, institution_id, degree_id, department_id,
           programme_id, quota_id, admission_year_id, updated_at)`,
      )
      .eq('community_category_id', community_category_id)
      .eq('structure.institution_id', d.institution_id)
      .eq('structure.degree_id', d.degree_id)
      .eq('structure.department_id', d.department_id)
      .eq('structure.programme_id', d.programme_id)
      .eq('structure.quota_id', d.quota_id)
      .eq('structure.admission_year_id', d.admission_year_id)
      .eq('structure.status', 'active');
    if (error) throw error;

    interface Candidate {
      id: string;
      gender: string | null;
      accommodation_type_id: string | null;
      updated_at: string | null;
    }

    // The embedded to-one `structure` comes back as an object (PostgREST FK
    // embed); cast defensively in case the client types it as an array.
    const candidates: Candidate[] = (rows ?? [])
      .map((r: any) => (Array.isArray(r.structure) ? r.structure[0] : r.structure))
      .filter((s: Candidate | null | undefined): s is Candidate => !!s)
      .filter(
        (s) =>
          (s.gender === gender || s.gender === null) &&
          (s.accommodation_type_id === accommodation ||
            s.accommodation_type_id === null),
      );

    if (candidates.length === 0) return null;

    // Rank: accommodation-specific first, then gender-specific, then newest.
    candidates.sort((a, b) => {
      const accA = a.accommodation_type_id !== null ? 1 : 0;
      const accB = b.accommodation_type_id !== null ? 1 : 0;
      if (accA !== accB) return accB - accA;
      const genA = a.gender !== null ? 1 : 0;
      const genB = b.gender !== null ? 1 : 0;
      if (genA !== genB) return genB - genA;
      return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
    });

    const full = await this.getWithItems(candidates[0].id);
    if (!full) return null;

    const applicableItems = full.items.filter((it) =>
      feeItemAppliesToYear(
        { applies_to: it.applies_to, applies_year_of_study: it.applies_year_of_study },
        yearOfStudy,
      ),
    );

    return { ...full, items: applicableItems };
  }
```

- [ ] **Step 2: Preserve accommodation through the clone path**

In `static async cloneToAcademicYear(...)`, the `dims` object omits accommodation. Add it so a cloned structure keeps its accommodation targeting. Change the `const dims: FeeStructureMatrixDimensions = { ... }` block to include:
```ts
      accommodation_type_id: overrides?.accommodation_type_id ?? source.accommodation_type_id ?? undefined,
```
(insert it alongside `quota_id` / `gender` in that object).

- [ ] **Step 3: Verify types**

Run `mcp__ide__getDiagnostics` on `lib/services/admission/fee-structure-service.ts`.
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add lib/services/admission/fee-structure-service.ts
git commit -m "feat(admission-fees): findByDimensions resolves accommodation (preview == billed); clone preserves it"
```

---

## Task 5: Create form — add the optional Accommodation selector

**Files:**
- Modify: `app/(routes)/admission/settings/fees-structure/_components/fees-structure-dimension-selector.tsx`

- [ ] **Step 1: Load accommodation types per institution**

Add a state list and a loader effect mirroring the existing `degrees`/`years` pattern.

Add to the state block (near `const [quotas, setQuotas] = useState<Option[]>([]);`):
```ts
  const [accommodations, setAccommodations] = useState<Option[]>([]);
```

Add this effect after the admission-years effect (accommodation types are institution-scoped):
```ts
  // Institution change → load accommodation types (institution-scoped lookup)
  useEffect(() => {
    if (!selectedDims.institution_id) {
      setAccommodations([]);
      return;
    }
    LookupService.listAccommodationTypes(selectedDims.institution_id, true)
      .then((rows) =>
        setAccommodations(rows.map((r) => ({ id: r.id, name: r.name }))),
      )
      .catch(() => setAccommodations([]));
  }, [selectedDims.institution_id]);
```

- [ ] **Step 2: Reset accommodation when institution changes, and add its setter**

In `setInstitution`, add `accommodation_type_id: undefined` to the reset object (accommodation types are institution-scoped, so a stale id must not survive an institution switch):
```ts
  const setInstitution = (id: string) =>
    onChange({
      institution_id: id,
      degree_id: undefined,
      department_id: undefined,
      programme_id: undefined,
      admission_year_id: undefined,
      accommodation_type_id: undefined,
      quota_id: selectedDims.quota_id,
    });
```

Add the setter next to `setGender`:
```ts
  const setAccommodation = (val: string) =>
    onChange({
      ...selectedDims,
      accommodation_type_id: val === '__any__' ? undefined : val,
    });
```

- [ ] **Step 3: Render the optional Accommodation `<Select>`**

Immediately after the Gender `<Select>` block (dim #7), add dim #8. It must NOT be added to `allDimsSelected` / `missingDims`:
```tsx
        {/* 8. Accommodation (optional) */}
        <div className="space-y-1">
          <Label className="text-xs">8. Accommodation <span className="text-muted-foreground">(optional)</span></Label>
          <Select
            value={selectedDims.accommodation_type_id ?? ''}
            onValueChange={setAccommodation}
            disabled={!selectedDims.institution_id}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Any Accommodation" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__any__">Any Accommodation</SelectItem>
              {accommodations.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
```

- [ ] **Step 4: Update the helper copy**

In the header `<p>` that reads "Gender is optional — leave as &quot;Any&quot;…", extend it to mention accommodation, e.g. change the sentence to:
```
Gender and Accommodation are optional — leave as &quot;Any&quot; if fees don&apos;t vary by them. Communities are selected in the form below.
```

And in the success banner line, append accommodation context (optional polish):
```tsx
          <span>All required dimensions selected{selectedDims.gender ? ` · ${selectedDims.gender}` : ''}{selectedDims.accommodation_type_id ? ' · accommodation-specific' : ''} — fee structure form loaded below.</span>
```

- [ ] **Step 5: Verify types**

Run `mcp__ide__getDiagnostics` on `app/(routes)/admission/settings/fees-structure/_components/fees-structure-dimension-selector.tsx`.
Expected: no new errors. (`LookupService.listAccommodationTypes(institutionId, true)` already exists — it's used in `finance-details.tsx`.)

- [ ] **Step 6: Commit**

```bash
git add "app/(routes)/admission/settings/fees-structure/_components/fees-structure-dimension-selector.tsx"
git commit -m "feat(admission-fees): optional Accommodation selector in fee-structure dimension picker"
```

---

## Task 6: Create form — thread accommodation through create + edit paths

**Files:**
- Modify: `app/(routes)/admission/settings/fees-structure/_components/fees-structure-form.tsx`

> **Why this task matters:** the create/edit form hardcodes a 7-field `dims` list in five places. Without threading accommodation through, the create form would drop the selected value, and — worse — *editing any existing structure would silently reset its accommodation to NULL on save*.

- [ ] **Step 1: Include accommodation in the existing-structure lookup `sevenDims`**

In `FeesStructureForm`, the effect that builds `const sevenDims: FeeStructureMatrixDimensions = { ... }` (used for `findByDimensions`) — add accommodation so the lookup disambiguates correctly:
```ts
    const sevenDims: FeeStructureMatrixDimensions = {
      institution_id:        dims.institution_id!,
      degree_id:             dims.degree_id!,
      department_id:         dims.department_id!,
      programme_id:          dims.programme_id!,
      quota_id:              dims.quota_id!,
      admission_year_id:     dims.admission_year_id!,
      gender:                dims.gender,
      accommodation_type_id: dims.accommodation_type_id,
    };
```

- [ ] **Step 2: Pass accommodation into `NewStructureForm`**

In the `if (!structure) { return ( <NewStructureForm dims={{ ... }} /> ) }` branch, add accommodation to the `dims` prop object:
```tsx
        dims={{
          institution_id:        dims.institution_id!,
          degree_id:             dims.degree_id!,
          department_id:         dims.department_id!,
          programme_id:          dims.programme_id!,
          quota_id:              dims.quota_id!,
          admission_year_id:     dims.admission_year_id!,
          gender:                dims.gender,
          accommodation_type_id: dims.accommodation_type_id,
        }}
```
(`NewStructureForm.onSubmit` already does `FeeStructureService.create({ ...dims, ... })`, so the value flows to the insert once it's in `dims`.)

- [ ] **Step 3: Seed accommodation into the editor's `initialDims` + reset effect**

In `ExistingStructureEditor`, add accommodation to `initialDims`:
```ts
  const initialDims: FeeStructureMatrixDimensions = {
    institution_id: structure.institution_id,
    degree_id: structure.degree_id,
    department_id: structure.department_id,
    programme_id: structure.programme_id,
    quota_id: structure.quota_id,
    admission_year_id: structure.admission_year_id,
    gender: structure.gender ?? undefined,
    accommodation_type_id: structure.accommodation_type_id ?? undefined,
  };
```

And in the `useEffect(() => { setItems(...); setEditableDims({ ... }); ... }, [structure.id, ...])` reset block, add accommodation to the `setEditableDims({ ... })` object:
```ts
      accommodation_type_id: structure.accommodation_type_id ?? undefined,
```
Also add `structure.accommodation_type_id` to that effect's dependency array (alongside `structure.gender`).

- [ ] **Step 4: Track accommodation in `dimsChanged` and send it on save**

Add `'accommodation_type_id'` to the `dimsChanged` key array:
```ts
    const k: Array<keyof FeeStructureMatrixDimensions> = [
      'institution_id', 'degree_id', 'department_id', 'programme_id',
      'quota_id', 'admission_year_id', 'gender', 'accommodation_type_id',
    ];
```

In `handleSaveAll`, inside the `...(dimsChanged ? { ... } : {})` payload, add:
```ts
            accommodation_type_id: editableDims.accommodation_type_id ?? null,
```
(NULL clears it back to "Any" — which is why the type had to allow `string | null` in Task 3.)

- [ ] **Step 5: Verify types**

Run `mcp__ide__getDiagnostics` on `app/(routes)/admission/settings/fees-structure/_components/fees-structure-form.tsx`.
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add "app/(routes)/admission/settings/fees-structure/_components/fees-structure-form.tsx"
git commit -m "feat(admission-fees): thread accommodation through create + edit form (prevents silent reset on edit)"
```

---

## Task 7: List + detail polish — show the accommodation badge

**Files:**
- Modify: `app/(routes)/admission/settings/fees-structure/_components/columns.tsx`
- Modify: `app/(routes)/admission/settings/fees-structure/[id]/page.tsx`

> Quality-of-life: with accommodation back, operators need to see at a glance whether a structure is Any / Hostel / Day Scholar. The list service (`listAllPaginated`) already selects `*` so `accommodation_type_id` is present, but it has no joined name. Resolve the label client-side from a small lookup, or render the raw code via a join.

- [ ] **Step 1: Read both files to find the existing badge/column patterns**

Read `app/(routes)/admission/settings/fees-structure/_components/columns.tsx` and `app/(routes)/admission/settings/fees-structure/[id]/page.tsx`. Identify how `gender` is displayed (it is the closest analogue) and mirror it for accommodation.

- [ ] **Step 2: Add an Accommodation column to the list**

In `columns.tsx`, add a column that renders the accommodation label. If the row carries only `accommodation_type_id` (a UUID) with no joined name, render `Any` when null and otherwise a short badge. To get the human name, extend `FeeStructureService.listAllPaginated`'s select to join the accommodation name (add `accommodation:accommodation_types(id, name)` to the embedded select and surface `accommodation_name` on the mapped row), then render:
```tsx
{
  accessorKey: 'accommodation_name',
  header: 'Accommodation',
  cell: ({ row }) => {
    const name = row.original.accommodation_name as string | null;
    return (
      <Badge variant={name ? 'outline' : 'secondary'}>
        {name ?? 'Any'}
      </Badge>
    );
  },
},
```
(If extending the service select, also add `accommodation_name: joined.accommodation?.name ?? null` to the row mapping in `listAllPaginated`, and add `accommodation_name: string | null` to its return type — mirror exactly how `quota_name` is handled.)

- [ ] **Step 3: Show accommodation on the detail page**

In `[id]/page.tsx`, wherever the structure's dimensions are displayed (gender, quota, etc.), add an "Accommodation" line showing the joined name or "Any". `FeeStructureService.getDetailById` already selects `*`; add `accommodation:accommodation_types(id, name)` to its embedded select and surface `accommodation_name` the same way `quota_name` is surfaced, then render it.

- [ ] **Step 4: Verify types**

Run `mcp__ide__getDiagnostics` on `columns.tsx`, `[id]/page.tsx`, and `lib/services/admission/fee-structure-service.ts` (if the select/types were extended).
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(routes)/admission/settings/fees-structure/_components/columns.tsx" "app/(routes)/admission/settings/fees-structure/[id]/page.tsx" lib/services/admission/fee-structure-service.ts
git commit -m "feat(admission-fees): show accommodation badge on fee-structure list + detail"
```

---

## Task 8: Verify the enquiry-form path end-to-end (no code change expected)

**Files:**
- Read-only verify: `app/(routes)/learners/enquiries/_components/form-sections/finance-details.tsx`

- [ ] **Step 1: Confirm the TEXT→FK resolution still works**

`finance-details.tsx` already resolves `resolvedAccommodationId` from the `accommodation_type` radio (`'HOSTEL'` / `'DAY SCHOLAR'`) via `resolveLookupId(accommodationText, accommodationLookup)`, matching on code OR name (case-insensitive). Since `accommodation_types.name` = `'Hostel'` / `'Day Scholar'`, both radio values resolve. Confirm by reading the file that `dims.accommodation_type_id = resolvedAccommodationId` is still assembled and passed to `FeeStructureReadonlyPanel`. **No code change expected.**

- [ ] **Step 2: SQL parity check — preview must equal billed**

Pick a real admitted learner whose dims are covered, and confirm the RPC resolves a structure. Run `mcp__supabase__execute_sql`:
```sql
WITH sample AS (
  SELECT id FROM learners_profiles
  WHERE legacy_fee_mode IS NOT TRUE
    AND institution_id IS NOT NULL AND degree_id IS NOT NULL
    AND department_id IS NOT NULL AND program_id IS NOT NULL
    AND quota_id IS NOT NULL AND community_category_id IS NOT NULL
    AND admission_year_id IS NOT NULL
  LIMIT 1
)
SELECT s.id AS learner_id,
       jsonb_array_length(admission_resolve_fee_items_for_lead(s.id)) AS item_count
FROM sample s;
```
Expected: `item_count >= 0` and no error. (Confirms the RPC change is valid against live data; a day-scholar/hosteller now both match the re-tagged "Any" structure.)

- [ ] **Step 3: Browser smoke — open an enquiry Finance tab**

In the running app (`npm run dev`), open an existing enquiry → Finance tab for a learner whose accommodation is set. Confirm the "Fee Structure" card loads with a subtotal (matching the "Any" structure today). No code change to commit in this task.

---

## Task 9: Classify the 2 active "hostel" structures (decision D5)

**Files:** none (data review; may produce a follow-up migration)

- [ ] **Step 1: Inspect the 2 active hostel structures and their items**

Run `mcp__supabase__execute_sql`:
```sql
SELECT fs.id, fs.name, fs.institution_id, fs.admission_year_id,
       json_agg(json_build_object('cat', bc.category_name, 'kind', bc.kind, 'amt', i.amount)) AS items
FROM admission_fee_structures fs
JOIN accommodation_types act ON act.id = fs.accommodation_type_id
LEFT JOIN admission_fee_structure_items i ON i.fee_structure_id = fs.id
LEFT JOIN billing_categories bc ON bc.id = i.billing_category_id
WHERE fs.status='active' AND act.code='hostel'
GROUP BY fs.id, fs.name, fs.institution_id, fs.admission_year_id;
```

- [ ] **Step 2: Decide and act**

- If their items are purely academic (no `kind='hostel'`) and a re-tagged "Any" structure already covers the same hard dims + community, they are redundant overrides → **archive** them via a small committed migration (`UPDATE ... SET status='archived'`), OR keep them intentionally as hostel-specific academic overrides.
- If any item is `kind='hostel'` (should be impossible given the picker exclusion, but verify), flag it — that is a latent double-billing row and must be cleaned.

Record the decision in the commit message. If a migration results, follow the Task 1/2 apply+commit pattern.

---

## Task 10: Final verification + browser smoke (non-super-admin role)

**Files:** none

- [ ] **Step 1: Diagnostics sweep**

Run `mcp__ide__getDiagnostics` on every touched `.ts`/`.tsx` file:
- `types/admission.ts`
- `lib/services/admission/fee-structure-service.ts`
- `app/(routes)/admission/settings/fees-structure/_components/fees-structure-dimension-selector.tsx`
- `app/(routes)/admission/settings/fees-structure/_components/fees-structure-form.tsx`
- `app/(routes)/admission/settings/fees-structure/_components/columns.tsx`
- `app/(routes)/admission/settings/fees-structure/[id]/page.tsx`

Expected: no new errors in any file.

- [ ] **Step 2: Create-form smoke**

In the browser, go to `/admission/settings/fees-structure/new`. Select all 6 required dims, leave Accommodation as "Any" → form renders. Then pick "Hostel" → still renders (optional, non-blocking). Create a Hostel-specific structure for a dim combo that already has an "Any" structure + same community → expect success (coexistence allowed).

- [ ] **Step 3: Overlap-trigger smoke**

Try to create a SECOND "Hostel" structure for the exact same dims + community + gender → expect the actionable 23505 toast mentioning accommodation. This confirms duplicates collide while Any+Hostel coexist.

- [ ] **Step 4: Enquiry resolution smoke (both accommodation types)**

Open/create one enquiry with accommodation = **Hostel** and one = **Day Scholar** for that dim combo. Confirm the Hostel enquiry's Finance tab resolves to the Hostel-specific structure and the Day Scholar enquiry falls back to the "Any" structure — and that the subtotal shown matches what `admission_resolve_fee_items_for_lead` returns for each (run the RPC on each learner id to compare).

- [ ] **Step 5: Branch is ready**

All tasks committed on `feat/admission/fee-structure-accommodation-dimension`. Summarize what shipped and hand back for PR creation (do not open a PR unless asked).

---

## Self-Review Notes (coverage vs spec)

- Spec §6a (RPC + trigger + re-tag) → Tasks 1, 2. ✓
- Spec §6b (types) → Task 3. ✓
- Spec §6c (create form selector + threading + list/detail polish) → Tasks 5, 6, 7. ✓
- Spec §6d (enquiry — verify only) → Task 8. ✓
- Spec §6e (billing — verify only) → covered by Task 8 Step 2 (RPC drives `fee_items`; no billing code path re-matches structures). ✓
- Spec §6f (clone preserves accommodation) → Task 4 Step 2. ✓
- Spec §5 (resolution contract, preview == billed) → RPC ORDER BY (Task 1) + `findByDimensions` ranking (Task 4) use identical precedence; parity checked in Tasks 8 & 10. ✓
- Spec D5 (2 active hostel structures) → Task 9. ✓
- Spec D6 (bulk out of scope) → not planned, by design. ✓
