-- 20260503100001_staff_extended_profile_columns.sql
-- Adds extended faculty profile fields to public.staff so MyJKKN can
-- serve as the single source of truth for the institution website.
-- All columns nullable / defaulted so existing rows are unaffected.

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS has_extended_profile    boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS slug                    text         NULL,
  ADD COLUMN IF NOT EXISTS status                  text         NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS display_order           integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS experience_years        integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS research_papers         integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phd_scholars            integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS awards_won              integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pg_dissertations_guided integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ug_projects_guided      integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qualification_summary   text         NULL,
  ADD COLUMN IF NOT EXISTS professional_summary    text         NULL,
  ADD COLUMN IF NOT EXISTS mentoring_description   text         NULL,
  ADD COLUMN IF NOT EXISTS google_scholar_url      text         NULL,
  ADD COLUMN IF NOT EXISTS researchgate_url        text         NULL,
  ADD COLUMN IF NOT EXISTS orcid_url               text         NULL,
  ADD COLUMN IF NOT EXISTS badges                  jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS qualifications          jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS specialisations         jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS experience_entries      jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS research_focus_areas    jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS publications            jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS funded_projects         jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS certifications          jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS awards                  jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS memberships             jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS phd_scholars_list       jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS faqs                    jsonb        NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS achievements            jsonb        NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.staff
  DROP CONSTRAINT IF EXISTS staff_status_check;
ALTER TABLE public.staff
  ADD CONSTRAINT staff_status_check
  CHECK (status IN ('draft', 'published'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_slug_unique
  ON public.staff (slug)
  WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_staff_status_published
  ON public.staff (status, is_active)
  WHERE status = 'published' AND is_active = true;

CREATE INDEX IF NOT EXISTS idx_staff_extended_profile
  ON public.staff (has_extended_profile)
  WHERE has_extended_profile = true;
