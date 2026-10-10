-- ─── Scholarship categories & types — dynamic, replaces the hardcoded list ──
-- 2026-10-08
--
-- Apply Scholarship hardcoded "Scholarship Category" to five values, and
-- billing_discounts.discount_category carried a CHECK for exactly those five.
-- The field labelled "Scholarship Type" was really the value mode
-- (percentage | amount). Now admins define Categories, and Types under each
-- category; a discount points at both.
--
--   billing_scholarship_categories   global list (no institution_id — same as
--                                    billing_categories)
--   billing_scholarship_types        child of a category; carries a DEFAULT
--                                    value mode / value the Apply form pre-fills
--
-- billing_discounts.discount_type STAYS (percentage | amount): it is the value
-- mode and every calculation / report reads it. The UI relabels it "Value Mode".
--
-- ── Safety: billing_discounts was EMPTY (0 rows) when this was written ──────
-- so swapping discount_category for two NOT NULL FKs needs no backfill. The DO
-- block below aborts the whole migration if that stops being true by the time
-- it is applied, rather than failing half way on SET NOT NULL.
--
-- ── Dependency scan (2026-10-08) ────────────────────────────────────────────
-- The only database object reading discount_category was
-- get_billing_reports_discounts(); it is recreated here returning the category
-- and type NAMES. No view, policy or index referenced the column.
--
-- Composite FK (scholarship_type_id, scholarship_category_id) → types(id,
-- category_id): a type can never be filed under a category it does not belong
-- to, whatever the client sends.
--
-- No BEGIN/COMMIT: applied through exec_sql (scripts/apply-migration-file.mjs).

DO $$
BEGIN
  IF (SELECT count(*) FROM public.billing_discounts) > 0 THEN
    RAISE EXCEPTION 'billing_discounts is no longer empty — this migration assumes no rows to backfill';
  END IF;
END $$;

-- ── 1. Categories ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_scholarship_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL,
  name        text NOT NULL,
  description text,
  sort_order  integer NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT billing_scholarship_categories_code_format CHECK (code ~ '^[a-z0-9_]+$'),
  CONSTRAINT billing_scholarship_categories_name_not_blank CHECK (btrim(name) <> '')
);
ALTER TABLE public.billing_scholarship_categories ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS billing_scholarship_categories_code_uq
  ON public.billing_scholarship_categories (code);
CREATE UNIQUE INDEX IF NOT EXISTS billing_scholarship_categories_name_uq
  ON public.billing_scholarship_categories (lower(name));

-- ── 2. Types ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_scholarship_types (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id         uuid NOT NULL
                        REFERENCES public.billing_scholarship_categories(id) ON DELETE RESTRICT,
  code                text NOT NULL,
  name                text NOT NULL,
  description         text,
  default_value_mode  text NOT NULL DEFAULT 'percentage',
  default_value       numeric,
  sort_order          integer NOT NULL DEFAULT 0,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT billing_scholarship_types_code_format CHECK (code ~ '^[a-z0-9_]+$'),
  CONSTRAINT billing_scholarship_types_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT billing_scholarship_types_mode_check
    CHECK (default_value_mode IN ('percentage', 'amount')),
  CONSTRAINT billing_scholarship_types_default_value_check
    CHECK (default_value IS NULL
           OR (default_value > 0
               AND (default_value_mode = 'amount' OR default_value <= 100))),
  -- Target of billing_discounts' composite FK.
  CONSTRAINT billing_scholarship_types_id_category_uq UNIQUE (id, category_id)
);
ALTER TABLE public.billing_scholarship_types ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS billing_scholarship_types_category_idx
  ON public.billing_scholarship_types (category_id);
CREATE UNIQUE INDEX IF NOT EXISTS billing_scholarship_types_category_code_uq
  ON public.billing_scholarship_types (category_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS billing_scholarship_types_category_name_uq
  ON public.billing_scholarship_types (category_id, lower(name));

-- ── 3. updated_at triggers (same function billing_discounts uses) ───────────
DROP TRIGGER IF EXISTS trigger_billing_scholarship_categories_updated_at
  ON public.billing_scholarship_categories;
CREATE TRIGGER trigger_billing_scholarship_categories_updated_at
  BEFORE UPDATE ON public.billing_scholarship_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_billing_updated_at();

DROP TRIGGER IF EXISTS trigger_billing_scholarship_types_updated_at
  ON public.billing_scholarship_types;
CREATE TRIGGER trigger_billing_scholarship_types_updated_at
  BEFORE UPDATE ON public.billing_scholarship_types
  FOR EACH ROW EXECUTE FUNCTION public.update_billing_updated_at();

-- ── 4. Policies — read: any signed-in user; write: super admin / admin / key ─
-- The Apply form needs the lists for anyone who can apply a scholarship; the
-- names are not sensitive (same stance as billing_categories_select).
REVOKE ALL ON public.billing_scholarship_categories FROM anon;
REVOKE ALL ON public.billing_scholarship_types FROM anon;

DROP POLICY IF EXISTS billing_scholarship_categories_select ON public.billing_scholarship_categories;
CREATE POLICY billing_scholarship_categories_select ON public.billing_scholarship_categories
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS billing_scholarship_categories_insert ON public.billing_scholarship_categories;
CREATE POLICY billing_scholarship_categories_insert ON public.billing_scholarship_categories
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR (SELECT user_has_permission('billing.scholarship_setup.create'))
  );

DROP POLICY IF EXISTS billing_scholarship_categories_update ON public.billing_scholarship_categories;
CREATE POLICY billing_scholarship_categories_update ON public.billing_scholarship_categories
  FOR UPDATE TO authenticated
  USING (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR (SELECT user_has_permission('billing.scholarship_setup.edit'))
  )
  WITH CHECK (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR (SELECT user_has_permission('billing.scholarship_setup.edit'))
  );

DROP POLICY IF EXISTS billing_scholarship_categories_delete ON public.billing_scholarship_categories;
CREATE POLICY billing_scholarship_categories_delete ON public.billing_scholarship_categories
  FOR DELETE TO authenticated
  USING (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR (SELECT user_has_permission('billing.scholarship_setup.delete'))
  );

DROP POLICY IF EXISTS billing_scholarship_types_select ON public.billing_scholarship_types;
CREATE POLICY billing_scholarship_types_select ON public.billing_scholarship_types
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS billing_scholarship_types_insert ON public.billing_scholarship_types;
CREATE POLICY billing_scholarship_types_insert ON public.billing_scholarship_types
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR (SELECT user_has_permission('billing.scholarship_setup.create'))
  );

DROP POLICY IF EXISTS billing_scholarship_types_update ON public.billing_scholarship_types;
CREATE POLICY billing_scholarship_types_update ON public.billing_scholarship_types
  FOR UPDATE TO authenticated
  USING (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR (SELECT user_has_permission('billing.scholarship_setup.edit'))
  )
  WITH CHECK (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR (SELECT user_has_permission('billing.scholarship_setup.edit'))
  );

DROP POLICY IF EXISTS billing_scholarship_types_delete ON public.billing_scholarship_types;
CREATE POLICY billing_scholarship_types_delete ON public.billing_scholarship_types
  FOR DELETE TO authenticated
  USING (
    (SELECT is_super_admin()) OR (SELECT is_admin())
    OR (SELECT user_has_permission('billing.scholarship_setup.delete'))
  );

-- ── 5. Seed: today's five categories, one "General" type each ───────────────
-- So Apply Scholarship works the day this lands; admins then add real types.
INSERT INTO public.billing_scholarship_categories (code, name, sort_order) VALUES
  ('merit_scholarship',     'Merit Scholarship',     10),
  ('financial_aid',         'Financial Aid',         20),
  ('staff_quota',           'Staff Quota',           30),
  ('sports_quota',          'Sports Quota',          40),
  ('special_circumstances', 'Special Circumstances', 50)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.billing_scholarship_types (category_id, code, name, sort_order)
SELECT c.id, 'general', 'General', 10
  FROM public.billing_scholarship_categories c
ON CONFLICT (category_id, code) DO NOTHING;

-- ── 6. billing_discounts: category/type become FKs ──────────────────────────
ALTER TABLE public.billing_discounts
  ADD COLUMN IF NOT EXISTS scholarship_category_id uuid,
  ADD COLUMN IF NOT EXISTS scholarship_type_id     uuid;

ALTER TABLE public.billing_discounts
  ALTER COLUMN scholarship_category_id SET NOT NULL,
  ALTER COLUMN scholarship_type_id     SET NOT NULL;

ALTER TABLE public.billing_discounts
  DROP CONSTRAINT IF EXISTS fk_billing_discounts_scholarship_category,
  DROP CONSTRAINT IF EXISTS fk_billing_discounts_scholarship_type;

ALTER TABLE public.billing_discounts
  ADD CONSTRAINT fk_billing_discounts_scholarship_category
    FOREIGN KEY (scholarship_category_id)
    REFERENCES public.billing_scholarship_categories(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_billing_discounts_scholarship_type
    FOREIGN KEY (scholarship_type_id, scholarship_category_id)
    REFERENCES public.billing_scholarship_types(id, category_id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS billing_discounts_scholarship_category_idx
  ON public.billing_discounts (scholarship_category_id);
CREATE INDEX IF NOT EXISTS billing_discounts_scholarship_type_idx
  ON public.billing_discounts (scholarship_type_id, scholarship_category_id);

-- Dropping the column drops its CHECK (the hardcoded five) with it.
ALTER TABLE public.billing_discounts DROP COLUMN IF EXISTS discount_category;

COMMENT ON COLUMN public.billing_discounts.discount_type IS
  'Value mode: percentage | amount. (Not the scholarship type — see scholarship_type_id.)';

-- ── 7. Reports RPC: category / type NAMES instead of the dropped column ─────
-- Return type changes, so DROP + CREATE. Body identical otherwise (SECURITY
-- DEFINER, billing.reports.view gate, institution scope from
-- get_user_accessible_institutions).
DROP FUNCTION IF EXISTS public.get_billing_reports_discounts(
  uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid,
  text[], text[], uuid, date, date, integer, integer);

CREATE FUNCTION public.get_billing_reports_discounts(
  p_institution_ids uuid[] DEFAULT NULL::uuid[],
  p_academic_year_id uuid DEFAULT NULL::uuid,
  p_academic_year_unspecified boolean DEFAULT false,
  p_item_category_id uuid DEFAULT NULL::uuid,
  p_degree_id uuid DEFAULT NULL::uuid,
  p_department_id uuid DEFAULT NULL::uuid,
  p_program_id uuid DEFAULT NULL::uuid,
  p_semester_id uuid DEFAULT NULL::uuid,
  p_section_id uuid DEFAULT NULL::uuid,
  p_schemes text[] DEFAULT NULL::text[],
  p_accommodation_codes text[] DEFAULT NULL::text[],
  p_student_id uuid DEFAULT NULL::uuid,
  p_date_from date DEFAULT NULL::date,
  p_date_to date DEFAULT NULL::date,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0)
 RETURNS TABLE(discount_id uuid, first_name text, last_name text, roll_number text,
               institution_name text, bill_description text,
               scholarship_category_name text, scholarship_type_name text,
               discount_type text, discount_value numeric, discount_amount numeric,
               approval_status text, effective_date date, total_count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_inst uuid[];
BEGIN
  IF NOT public.user_has_permission('billing.reports.view') THEN
    RAISE EXCEPTION 'permission denied: billing.reports.view' USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(institution_id) INTO v_inst
  FROM public.get_user_accessible_institutions(auth.uid())
  WHERE (p_institution_ids IS NULL OR institution_id = ANY(p_institution_ids));
  IF v_inst IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT d.id, lp.first_name::text, lp.last_name::text, lp.roll_number::text,
         i.name::text, b.bill_description::text,
         sc.name::text, st.name::text, d.discount_type::text,
         d.discount_value, d.discount_amount,
         d.approval_status::text, d.effective_date,
         COUNT(*) OVER() AS total_count
  FROM public.billing_discounts d
  JOIN public.billing_student_bills b ON b.id = d.bill_id
  JOIN public.billing_report_student_cohort(
         p_degree_id, p_department_id, p_program_id,
         p_semester_id, p_section_id, p_schemes, p_accommodation_codes) c ON c.student_id = b.student_id
  LEFT JOIN public.learners_profiles lp ON lp.id = b.student_id
  LEFT JOIN public.institutions i ON i.id = b.institution_id
  LEFT JOIN public.billing_scholarship_categories sc ON sc.id = d.scholarship_category_id
  LEFT JOIN public.billing_scholarship_types st ON st.id = d.scholarship_type_id
  WHERE b.institution_id = ANY(v_inst)
    AND (p_student_id IS NULL OR b.student_id = p_student_id)
    AND (p_item_category_id IS NULL OR b.item_category_id = p_item_category_id)
    AND (CASE
           WHEN p_academic_year_unspecified THEN b.academic_year_id IS NULL
           WHEN p_academic_year_id IS NOT NULL THEN b.academic_year_id = p_academic_year_id
           ELSE true END)
    AND (p_date_from IS NULL OR d.effective_date >= p_date_from)
    AND (p_date_to   IS NULL OR d.effective_date <= p_date_to)
  ORDER BY d.created_at DESC, d.id DESC
  LIMIT COALESCE(p_limit, 10000) OFFSET COALESCE(p_offset, 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_billing_reports_discounts(
  uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid,
  text[], text[], uuid, date, date, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_billing_reports_discounts(
  uuid[], uuid, boolean, uuid, uuid, uuid, uuid, uuid, uuid,
  text[], text[], uuid, date, date, integer, integer) TO authenticated, service_role;

-- ── 8. Permission keys → roles that can approve scholarships today ──────────
-- Same audience that already runs the scholarship desk. Tested by VALUE
-- (->> = 'true'), never by key presence. Super admin / admin pass the policies
-- without a key.
UPDATE public.custom_roles
   SET permissions = COALESCE(permissions, '{}'::jsonb)
                     || jsonb_build_object(
                          'billing.scholarship_setup.view',   true,
                          'billing.scholarship_setup.create', true,
                          'billing.scholarship_setup.edit',   true,
                          'billing.scholarship_setup.delete', true),
       updated_at  = now()
 WHERE (permissions->>'billing.discounts.approve') = 'true'
   AND (permissions->>'billing.scholarship_setup.view') IS DISTINCT FROM 'true';
