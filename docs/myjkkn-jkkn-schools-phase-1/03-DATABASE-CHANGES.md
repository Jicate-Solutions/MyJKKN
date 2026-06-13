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

**Column for school classification:**

| Column | Type | Nullable | Default | Check |
|---|---|---|---|---|
| **`entity_type`** | **varchar(20)** | **NO** | **`'institution'`** | **IN ('institution', 'school', 'admin_office', 'company')** |

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

## Column reference

The `entity_type` column classifies institutions:

| Column | Meaning | Values | Purpose |
|---|---|---|---|
| `entity_type` | Institutional classification | `institution`, `school`, `admin_office`, `company` | Determines UI labels and data hierarchy |
| `institution_type` | Accreditation status | `autonomous`, `self`, `aided` | Regulatory classification (pre-existing) |

These are orthogonal and both are queried independently.

---

## The entity_type column

Path: `supabase/migrations/` (already applied to schema)

The `entity_type` column is already present in the institutions table:

```sql
-- Column definition
entity_type character varying(20) not null default 'institution'::character varying,

-- Check constraint
constraint chk_entity_type check (
  (entity_type)::text = any (
    array['institution'::text, 'admin_office'::text, 'company'::text, 'school'::text]
  )
);

-- Index for filtering
create index idx_institutions_entity_type on public.institutions using btree (entity_type);
```

### Usage for schools

To identify a school institution, query:
```sql
SELECT * FROM institutions WHERE entity_type = 'school';
```

To flag an institution as a school:
```sql
UPDATE institutions SET entity_type = 'school' WHERE id = :school_id;
```

### Values

- `'institution'` — default for colleges and higher-ed institutions
- `'school'` — K-12 schools (uses virtual K-12 hierarchy)
- `'admin_office'` — administrative divisions
- `'company'` — partner organizations

---

## Verification (run these manually)

```sql
-- 1. Column exists with correct type
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='institutions' AND column_name='entity_type';
-- Expected: varchar(20), NOT NULL, default 'institution'

-- 2. Check constraint exists
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'chk_entity_type';
-- Expected: entity_type IN ('institution', 'school', 'admin_office', 'company')

-- 3. Index exists
SELECT indexname FROM pg_indexes
WHERE tablename='institutions' AND indexname='idx_institutions_entity_type';
-- Expected: 1 row

-- 4. All existing rows default to 'institution'
SELECT entity_type, COUNT(*)
FROM institutions GROUP BY entity_type;
-- Expected: most rows show 'institution'

-- 5. Invalid value rejected
-- This must ERROR:
UPDATE institutions SET entity_type = 'other' WHERE id = (SELECT id FROM institutions LIMIT 1);
-- Expected: new row for relation "institutions" violates check constraint "chk_entity_type"
```

---

## Rollback plan (if needed)

```sql
-- Only if something goes catastrophically wrong on production.
-- Safe because no code path requires the column (the hook has a fallback to 'institution').

DROP INDEX IF EXISTS idx_institutions_entity_type;
ALTER TABLE public.institutions DROP CONSTRAINT IF EXISTS chk_entity_type;
-- Note: entity_type column is core to the schema; do not drop without careful planning
```

The `useInstitutionType` hook will log an error and fall back to `'institution'` if the column is missing — so a rolled-back DB with deployed code is functional (all institutions look like colleges), just unhappy.

---

## Impact on existing queries

**Zero.** No existing service, RLS policy, trigger, view, or query references `institution_kind`. The column is additive-only.

Verified by grep: `grep -rn "institution_kind" lib/ app/ supabase/ hooks/` returned only the new files in this handoff + 1 reference in SPEC.

---

## Seed data pattern (Phase 1.5, after merge)

For each JKKN school, create:

```sql
-- Flag the institution as a school
UPDATE institutions SET entity_type = 'school' WHERE id = :school_id;

-- Create virtual degree (one per school — needed because student.degree_id is NOT NULL)
INSERT INTO degrees (id, degree_name, degree_type, institution_id)
VALUES (gen_random_uuid(), 'K-12 Program', 'ug', :school_id);

-- Create virtual department
INSERT INTO departments (id, department_code, department_name, institution_id)
VALUES (gen_random_uuid(), 'SCHOOL', 'Academic', :school_id);

-- Create 12 programs as classes
-- Omit loop here — will ship as a seed script in Phase 1.5
```

The exact school names will be provided when seeding.
