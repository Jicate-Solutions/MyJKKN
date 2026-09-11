-- ============================================================================
-- Resource Management — the "(Optional)" fields are now actually optional
-- File: 20260911120100_resources_relax_subcategory_description_not_null.sql
-- Date: 2026-09-11
-- Bug: BUG-003997 (P1)
--
-- WHY THIS EXISTS
--   Creating a resource without picking a sub-category fails with:
--
--       23502: null value in column "subcategory_id" of relation "resources"
--              violates not-null constraint
--
--   Every application layer already treats the column as optional, and has for
--   as long as the module has existed. Read on 2026-09-11:
--
--     app/(routes)/resource-management/resources/_components/resource-form.tsx:661
--         <FormLabel>Sub-Category (Optional)</FormLabel>
--         -- and the create default is '' , converted to undefined on submit
--     types/resource-management.ts:746
--         subcategory_id: z.string().nullish()   -- "Made optional"
--     types/resource-management.ts:155, :533, :623
--         subcategory_id?: string;               -- "Made optional"
--     lib/services/resource-management/resource-service.ts
--         normalises '' to null before the insert
--     app/api/resource-management/resources/import/route.ts
--         sends null outright for a blank template cell
--
--   The database is the only layer that disagrees. Confirmed NOT NULL today
--   from types/supabase.ts (generated from the live database 2026-09-07):
--   `subcategory_id: string` appears as a REQUIRED, non-optional property in
--   both the Row and the Insert type of `resources` (lines 146079 / 146135),
--   which is how the generator spells "NOT NULL, no default".
--
--   DIRECTION: relax the database to match the application, NOT tighten the
--   form. Decided by the user. Making the field required was considered and
--   rejected: a resource genuinely may have no meaningful sub-category, and
--   ~every caller in the codebase would have to grow a value it does not have.
--
-- WHY `description` IS INCLUDED, THOUGH THE REPORT NAMED ONLY subcategory_id
--   `description` carries the IDENTICAL mismatch — `description: string`,
--   required and non-optional in both Row and Insert (types/supabase.ts:146059
--   / :146115), while resource-form.tsx:697 labels it "Description (Optional)"
--   and types/resource-management.ts:744 marks it `.nullish()`.
--
--   It has not been reported yet only by luck: the form's default is the empty
--   string rather than null, and '' satisfies NOT NULL. The bulk import route
--   sends a real null for a blank cell, so it fails the same way the moment
--   anyone imports a resource without a description. Fixing one column and
--   leaving its twin would simply queue the next bug report.
--
-- WHAT THIS DOES NOT DO
--   * Does not add a DEFAULT. NULL is the honest value for "not chosen"; a
--     default empty string would invent a second spelling for absent.
--   * Does not touch `parent_category_id`, which stays NOT NULL — the form
--     requires it (`z.string().min(1, 'Parent category is required')`) and the
--     sub-category select is disabled until it is set.
--   * Changes no application code. The Zod schema, the service and the import
--     route already model both columns as optional; nothing has to move.
--   * Writes no row. Existing rows are untouched — dropping NOT NULL never
--     rewrites the table and takes only a brief ACCESS EXCLUSIVE lock.
--
-- REVERSAL
--   Only safe while no NULL has been written. After that, backfill first:
--     UPDATE public.resources SET description = '' WHERE description IS NULL;
--     ALTER TABLE public.resources
--       ALTER COLUMN subcategory_id SET NOT NULL,
--       ALTER COLUMN description    SET NOT NULL;
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- The columns.
--
-- Guarded per column rather than as one statement so that a re-run, or a
-- database where only one of the two is still NOT NULL, does what it can
-- instead of erroring on the whole file. (DROP NOT NULL on an already-nullable
-- column is a no-op in Postgres, but the column-existence check is not free of
-- charge: ALTER on a missing column raises 42703.)
-- ---------------------------------------------------------------------------
DO $relax$
DECLARE
  v_col text;
BEGIN
  FOREACH v_col IN ARRAY ARRAY['subcategory_id', 'description'] LOOP
    IF EXISTS (
      SELECT 1
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name   = 'resources'
         AND column_name  = v_col
         AND is_nullable  = 'NO'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.resources ALTER COLUMN %I DROP NOT NULL', v_col
      );
      RAISE NOTICE 'resources.% is now nullable', v_col;
    ELSE
      RAISE NOTICE 'resources.% needs no change (already nullable, or absent)', v_col;
    END IF;
  END LOOP;
END
$relax$;

COMMENT ON COLUMN public.resources.subcategory_id IS
  'NULL = no sub-category chosen. Optional since BUG-003997 (2026-09-11): the form has always labelled this "Sub-Category (Optional)" and the Zod schema has always marked it .nullish(), while the column was NOT NULL — so creating a resource without one failed with 23502.';

COMMENT ON COLUMN public.resources.description IS
  'NULL = no description given. Optional since BUG-003997 (2026-09-11), for the same mismatch as subcategory_id: labelled "Description (Optional)" and .nullish() in the schema, but NOT NULL in the table. It only escaped the same 23502 because the form default is an empty string; the bulk import route sends a real null.';

-- ---------------------------------------------------------------------------
-- APPLY-TIME ASSERT — house style (20261111000000:299).
-- A migration that applies but leaves the constraint in place is worse than one
-- that fails, because the bug report would be closed on a database that still
-- rejects the insert.
-- ---------------------------------------------------------------------------
DO $assert$
DECLARE
  v_still_not_null text;
BEGIN
  SELECT string_agg(column_name, ', ' ORDER BY column_name)
    INTO v_still_not_null
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'resources'
     AND column_name IN ('subcategory_id', 'description')
     AND is_nullable  = 'NO';

  IF v_still_not_null IS NOT NULL THEN
    RAISE EXCEPTION
      'resources.% is still NOT NULL — BUG-003997 would still reproduce',
      v_still_not_null;
  END IF;

  -- Both columns must still EXIST. A silent rename would make the DO block
  -- above a no-op and this assert pass on a table that lost the column.
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'resources'
         AND column_name IN ('subcategory_id', 'description')) <> 2 THEN
    RAISE EXCEPTION
      'public.resources is missing subcategory_id and/or description';
  END IF;

  -- Not relaxed, and must not be: the form requires a parent category.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'resources'
       AND column_name = 'parent_category_id' AND is_nullable = 'NO'
  ) THEN
    RAISE WARNING 'resources.parent_category_id is nullable — this migration did not do that, but the form treats it as required';
  END IF;
END
$assert$;

COMMIT;

NOTIFY pgrst, 'reload schema';
