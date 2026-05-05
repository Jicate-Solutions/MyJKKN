-- ============================================================================
-- 20260505100005 — Backfill shadow-FK columns from observed TEXT
-- ============================================================================
-- For each row in learners_profiles with a non-null TEXT value but null FK,
-- find the canonical match by lower(trim(text)) = code OR name. On miss,
-- insert a data_quality_review row.
-- ============================================================================

-- Inline-create minimal data_quality_review if it doesn't exist
CREATE TABLE IF NOT EXISTS public.data_quality_review (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    table_name   text NOT NULL,
    column_name  text NOT NULL,
    observed_value text NOT NULL,
    occurrence_count integer NOT NULL DEFAULT 1,
    review_status text NOT NULL DEFAULT 'pending'
        CHECK (review_status IN ('pending','mapped','ignored')),
    mapped_to_id uuid,
    review_notes text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (table_name, column_name, observed_value)
);

-- ---------- 1. Seed institution-scoped accommodation_types starter set ----------
INSERT INTO public.accommodation_types (institution_id, code, name, sort_order)
SELECT i.id, t.code, t.name, t.sort_order
  FROM public.institutions i
 CROSS JOIN (VALUES
    ('hostel',       'Hostel',         10),
    ('dayscholar',   'Day Scholar',    20),
    ('pg',           'Paying Guest',   30),
    ('not_applicable','Not Applicable', 99)
 ) AS t(code, name, sort_order)
ON CONFLICT (institution_id, code) DO NOTHING;

-- ---------- 2. Backfill learners_profiles.quota_id ----------
UPDATE public.learners_profiles lp
   SET quota_id = q.id
  FROM public.quotas q
 WHERE lp.quota IS NOT NULL
   AND lp.quota_id IS NULL
   AND (
       lower(trim(lp.quota)) = lower(q.code)
    OR lower(trim(lp.quota)) = lower(q.name)
   );

-- ---------- 3. Backfill learners_profiles.community_category_id ----------
UPDATE public.learners_profiles lp
   SET community_category_id = c.id
  FROM public.community_categories c
 WHERE lp.community IS NOT NULL
   AND lp.community_category_id IS NULL
   AND (
       lower(trim(lp.community)) = lower(c.code)
    OR lower(trim(lp.community)) = lower(c.name)
   );

-- ---------- 4. Backfill learners_profiles.accommodation_type_id ----------
UPDATE public.learners_profiles lp
   SET accommodation_type_id = a.id
  FROM public.accommodation_types a
 WHERE lp.accommodation_type IS NOT NULL
   AND lp.accommodation_type_id IS NULL
   AND a.institution_id = lp.institution_id
   AND (
       lower(trim(lp.accommodation_type)) = lower(a.code)
    OR lower(trim(lp.accommodation_type)) = lower(a.name)
   );

-- NOTE: admission_leads has no legacy TEXT columns for quota/community/accommodation_type.
-- The shadow-FK columns added in Task 2 will be populated forward-only as new leads
-- come in via the enquiry form. No backfill needed for admission_leads.

-- ---------- 5. Surface unmatched values to data_quality_review (learners_profiles only) ----------
INSERT INTO public.data_quality_review (table_name, column_name, observed_value, occurrence_count)
SELECT 'learners_profiles', 'quota', lp.quota, count(*)
  FROM public.learners_profiles lp
 WHERE lp.quota IS NOT NULL AND lp.quota_id IS NULL
 GROUP BY lp.quota
ON CONFLICT (table_name, column_name, observed_value) DO UPDATE
   SET occurrence_count = EXCLUDED.occurrence_count, updated_at = now();

INSERT INTO public.data_quality_review (table_name, column_name, observed_value, occurrence_count)
SELECT 'learners_profiles', 'community', lp.community, count(*)
  FROM public.learners_profiles lp
 WHERE lp.community IS NOT NULL AND lp.community_category_id IS NULL
 GROUP BY lp.community
ON CONFLICT (table_name, column_name, observed_value) DO UPDATE
   SET occurrence_count = EXCLUDED.occurrence_count, updated_at = now();

INSERT INTO public.data_quality_review (table_name, column_name, observed_value, occurrence_count)
SELECT 'learners_profiles', 'accommodation_type', lp.accommodation_type, count(*)
  FROM public.learners_profiles lp
 WHERE lp.accommodation_type IS NOT NULL AND lp.accommodation_type_id IS NULL
 GROUP BY lp.accommodation_type
ON CONFLICT (table_name, column_name, observed_value) DO UPDATE
   SET occurrence_count = EXCLUDED.occurrence_count, updated_at = now();
