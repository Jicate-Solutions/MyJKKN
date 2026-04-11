# 03 — Database Changes

## Live `institutions` table (pulled from staging 2026-04-11)

Project: `hhprjbgknupaplivtoib` · 10 rows · 29 columns (pre-migration)

| Column | Type | Nullable | Default |
|---|---|---|---|
| `id` | uuid | NO | `uuid_generate_v4()` |
| `name` | varchar | NO | — |
| `phone` | varchar | YES | — |
| `email` | varchar | YES | — |
| `website` | varchar | YES | — |
| `is_active` | boolean | YES | `true` |
| `created_by` | uuid | YES | — |
| `created_at` | timestamptz | YES | `now()` |
| `updated_at` | timestamptz | YES | `now()` |
| `counselling_code` | varchar | YES | — |
| `category` | varchar | YES | — |
| `accredited_by` | varchar | YES | — |
| `address_line1` | varchar | YES | — |
| `address_line2` | varchar | YES | — |
| `address_line3` | varchar | YES | — |
| `city` | varchar | YES | — |
| `state` | varchar | YES | — |
| `country` | varchar | YES | — |
| `logo_url` | text | YES | — |
| `transportation_dept` | jsonb | YES | — |
| `administration_dept` | jsonb | YES | — |
| `accounts_dept` | jsonb | YES | — |
| `admission_dept` | jsonb | YES | — |
| `placement_dept` | jsonb | YES | — |
| `anti_ragging_dept` | jsonb | YES | — |
| **`institution_type`** | **varchar** | **YES** | **—** |
| `pin_code` | varchar | YES | — |
| `timetable_type` | varchar | YES | `'week_order'` |

**+1 NEW column after migration:**

| Column | Type | Nullable | Default | Check |
|---|---|---|---|---|
| **`institution_kind`** | **varchar(20)** | **NO** | **`'college'`** | **IN ('college', 'school')** |

---

## Current data distribution (staging)

```sql
SELECT institution_type, category, COUNT(*)
FROM institutions GROUP BY institution_type, category;
```

| `institution_type` | `category` | count |
|---|---|---|
| `autonomous` | `ug_pg` | 5 |
| `self` | `ug` | 2 |
| `aided` | `ug_pg` | 1 |
| `self` | `ug_pg` | 1 |
| `self` | `pg` | 1 |

**Takeaway:** All 10 staging rows are colleges. `institution_type` values (`autonomous`/`self`/`aided`) describe accreditation, not education level. Our new column is orthogonal.

---

## ⚠ Naming warning

The table ALREADY has `institution_type`. Do not confuse it with `institution_kind`:

| Column | Meaning | Values | Introduced |
|---|---|---|---|
| `institution_type` | Accreditation | `autonomous`, `self`, `aided` | Pre-existing |
| `institution_kind` | Education level | `college`, `school` | **This migration** |

Both columns are queried independently in the UI. Do NOT rename, merge, or overload.

---

## The migration SQL

Path: `supabase/migrations/20260411_add_institution_kind.sql`

```sql
-- 1. Add the column
ALTER TABLE public.institutions
  ADD COLUMN IF NOT EXISTS institution_kind VARCHAR(20) NOT NULL DEFAULT 'college';

-- 2. Enforce valid values
DO $$ BEGIN
  ALTER TABLE public.institutions
    ADD CONSTRAINT institutions_kind_check
    CHECK (institution_kind IN ('college', 'school'));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Index for fast filtering (sidebar, reports, dashboards)
CREATE INDEX IF NOT EXISTS idx_institutions_kind
  ON public.institutions(institution_kind);

-- 4. Document the column
COMMENT ON COLUMN public.institutions.institution_kind IS
  'Education level: college (higher ed) or school (K-12). Determines UI labels (Program→Class, Semester→Term, Course→Subject) and which sidebar items are visible. Does NOT affect the underlying data model — schools use the same tables as colleges via virtual K-12 hierarchy rows. See docs/SPEC-jkkn-schools.md.';
```

### Why each line

- `IF NOT EXISTS` — idempotent re-run safety
- `NOT NULL DEFAULT 'college'` — existing rows auto-fill to the safe pre-existing behavior
- `DO $$ ... EXCEPTION WHEN duplicate_object` — re-run safe (doesn't error if constraint already exists from a partial prior run)
- `CHECK` — prevents typos like `'School'` or `'k-12'`
- Index — sidebar filter + any future `WHERE institution_kind='school'` reports
- `COMMENT` — self-documenting for future devs via `\d+ institutions`

---

## Post-migration verification (run these manually)

```sql
-- 1. Column exists with correct type
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='institutions' AND column_name='institution_kind';
-- Expected: varchar(20), NOT NULL, default 'college'

-- 2. Check constraint exists
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'institutions_kind_check';
-- Expected: CHECK ((institution_kind = ANY (ARRAY['college'::text, 'school'::text])))

-- 3. Index exists
SELECT indexname FROM pg_indexes
WHERE tablename='institutions' AND indexname='idx_institutions_kind';
-- Expected: 1 row

-- 4. All existing rows defaulted to 'college'
SELECT institution_kind, COUNT(*)
FROM institutions GROUP BY institution_kind;
-- Expected (staging): college=10

-- 5. Invalid value rejected
-- This must ERROR:
UPDATE institutions SET institution_kind = 'junior' WHERE id = (SELECT id FROM institutions LIMIT 1);
-- Expected: new row for relation "institutions" violates check constraint "institutions_kind_check"
```

---

## Rollback plan (if needed)

```sql
-- Only if something goes catastrophically wrong on production.
-- Safe because no code path requires the column (the hook has a fallback to 'college').

DROP INDEX IF EXISTS idx_institutions_kind;
ALTER TABLE public.institutions DROP CONSTRAINT IF EXISTS institutions_kind_check;
ALTER TABLE public.institutions DROP COLUMN IF EXISTS institution_kind;
```

The `useInstitutionKind` hook will log an error and fall back to `'college'` if the column is missing — so a rolled-back DB with deployed code is functional (all institutions look like colleges), just unhappy.

---

## Impact on existing queries

**Zero.** No existing service, RLS policy, trigger, view, or query references `institution_kind`. The column is additive-only.

Verified by grep: `grep -rn "institution_kind" lib/ app/ supabase/ hooks/` returned only the new files in this handoff + 1 reference in SPEC.

---

## Seed data pattern (Phase 1.5, after merge)

For each JKKN school, create:

```sql
-- Flag the institution as a school
UPDATE institutions SET institution_kind = 'school' WHERE id = :school_id;

-- Create virtual degree (one per school — needed because student.degree_id is NOT NULL)
INSERT INTO degrees (id, degree_name, degree_type, institution_id)
VALUES (gen_random_uuid(), 'K-12 Program', 'ug', :school_id);

-- Create virtual department
INSERT INTO departments (id, department_code, department_name, institution_id)
VALUES (gen_random_uuid(), 'SCHOOL', 'Academic', :school_id);

-- Create 12 programs as classes
-- Omit loop here — will ship as a seed script in Phase 1.5
```

Omm will provide the exact school names when seeding.
