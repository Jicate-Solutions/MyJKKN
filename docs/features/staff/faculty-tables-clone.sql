-- ============================================================================
-- Faculty Module — Portable Schema Export
-- ============================================================================
-- Source:        Engineering College Supabase (kyvfkyjmdbtyimtedkie)
-- Exported on:   2026-05-03
-- Purpose:       Clone the faculty + faculty_achievements tables (with all
--                indexes, triggers, RLS policies, and helper functions) into
--                a different Supabase / Postgres project.
--
-- This file is SELF-CONTAINED for the `faculty` table.
--
-- The `faculty_achievements` table references three other tables:
--     - public.colleges                (FK: college_id, ON DELETE CASCADE)
--     - public.courses                 (FK: course_id,  ON DELETE SET NULL)
--     - public.achievement_categories  (FK: category_id,ON DELETE SET NULL)
--     - auth.users                     (FK: created_by — Supabase auth schema)
--
-- If the target project does NOT have these tables, scroll to the
-- "STANDALONE FALLBACK" section near the bottom of this file. It contains a
-- variant of `faculty_achievements` with the FK constraints stripped, so you
-- can run it without those dependencies.
--
-- Run order:
--   1. EXTENSIONS
--   2. TRIGGER FUNCTIONS
--   3. TABLE: faculty
--   4. TABLE: faculty_achievements   (only if college/course tables exist)
--   5. INDEXES
--   6. TRIGGERS
--   7. RLS POLICIES
--   8. (optional) STANDALONE FALLBACK for faculty_achievements
-- ============================================================================


-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
-- gen_random_uuid() lives in pgcrypto; Supabase has it enabled by default,
-- but enable explicitly for portability.
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================================
-- 2. TRIGGER FUNCTIONS
-- ============================================================================

-- Bumps updated_at on faculty rows.
CREATE OR REPLACE FUNCTION public.update_faculty_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;


-- Auto-derives achievement_year from achievement_date and bumps updated_at
-- on faculty_achievements rows.
CREATE OR REPLACE FUNCTION public.extract_achievement_year_faculty()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.achievement_date IS NOT NULL THEN
    NEW.achievement_year = EXTRACT(YEAR FROM NEW.achievement_date)::INTEGER;
  END IF;
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$function$;


-- ============================================================================
-- 3. TABLE: public.faculty
-- ============================================================================
-- 36 columns. Heavy use of jsonb arrays for repeating sub-objects
-- (qualifications, publications, awards, etc.) — keeps the page-builder
-- friendly without needing a dozen child tables.

CREATE TABLE IF NOT EXISTS public.faculty (
  id                       uuid           NOT NULL DEFAULT gen_random_uuid(),
  full_name                text           NOT NULL,
  slug                     text           NOT NULL,
  designation              text           NOT NULL DEFAULT 'Assistant Professor'::text,
  department               text           NOT NULL,
  qualification            text           NOT NULL DEFAULT ''::text,
  email                    text           NOT NULL DEFAULT ''::text,
  photo_url                text           NULL,
  experience_years         integer        NOT NULL DEFAULT 0,
  research_papers          integer        NOT NULL DEFAULT 0,
  phd_scholars             integer        NOT NULL DEFAULT 0,
  awards_won               integer        NOT NULL DEFAULT 0,
  display_order            integer        NOT NULL DEFAULT 0,
  is_active                boolean        NOT NULL DEFAULT true,
  status                   text           NOT NULL DEFAULT 'draft'::text,
  badges                   jsonb          NOT NULL DEFAULT '[]'::jsonb,
  professional_summary     text           NOT NULL DEFAULT ''::text,
  qualifications           jsonb          NOT NULL DEFAULT '[]'::jsonb,
  specialisations          jsonb          NOT NULL DEFAULT '[]'::jsonb,
  experience_entries       jsonb          NOT NULL DEFAULT '[]'::jsonb,
  research_focus_areas     jsonb          NOT NULL DEFAULT '[]'::jsonb,
  publications             jsonb          NOT NULL DEFAULT '[]'::jsonb,
  funded_projects          jsonb          NOT NULL DEFAULT '[]'::jsonb,
  google_scholar_url       text           NULL,
  researchgate_url         text           NULL,
  orcid_url                text           NULL,
  certifications           jsonb          NOT NULL DEFAULT '[]'::jsonb,
  awards                   jsonb          NOT NULL DEFAULT '[]'::jsonb,
  memberships              jsonb          NOT NULL DEFAULT '[]'::jsonb,
  mentoring_description    text           NOT NULL DEFAULT ''::text,
  phd_scholars_list        jsonb          NOT NULL DEFAULT '[]'::jsonb,
  pg_dissertations_guided  integer        NOT NULL DEFAULT 0,
  ug_projects_guided       integer        NOT NULL DEFAULT 0,
  faqs                     jsonb          NOT NULL DEFAULT '[]'::jsonb,
  created_at               timestamptz    NOT NULL DEFAULT now(),
  updated_at               timestamptz    NOT NULL DEFAULT now(),
  CONSTRAINT faculty_pkey       PRIMARY KEY (id),
  CONSTRAINT faculty_slug_key   UNIQUE (slug),
  CONSTRAINT faculty_status_check CHECK (status = ANY (ARRAY['draft'::text, 'published'::text]))
);


-- ============================================================================
-- 4. TABLE: public.faculty_achievements
-- ============================================================================
-- Run this section ONLY IF the target project already has:
--   public.colleges, public.courses, public.achievement_categories
-- Otherwise skip and use the STANDALONE FALLBACK at the bottom.

CREATE TABLE IF NOT EXISTS public.faculty_achievements (
  id                   uuid         NOT NULL DEFAULT gen_random_uuid(),
  college_id           uuid         NOT NULL,
  course_id            uuid         NULL,
  category_id          uuid         NULL,
  title                text         NOT NULL,
  description          text         NOT NULL,
  faculty_name         text         NOT NULL,
  faculty_designation  text         NULL,
  achievement_date     date         NULL,
  achievement_year     integer      NULL,
  display_order        integer      NULL DEFAULT 0,
  is_featured          boolean      NULL DEFAULT false,
  is_active            boolean      NULL DEFAULT true,
  created_at           timestamptz  NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           timestamptz  NULL DEFAULT CURRENT_TIMESTAMP,
  created_by           uuid         NULL,
  CONSTRAINT faculty_achievements_pkey
    PRIMARY KEY (id),
  CONSTRAINT faculty_achievements_college_id_fkey
    FOREIGN KEY (college_id)  REFERENCES public.colleges(id)               ON DELETE CASCADE,
  CONSTRAINT faculty_achievements_course_id_fkey
    FOREIGN KEY (course_id)   REFERENCES public.courses(id)                ON DELETE SET NULL,
  CONSTRAINT faculty_achievements_category_id_fkey
    FOREIGN KEY (category_id) REFERENCES public.achievement_categories(id) ON DELETE SET NULL,
  CONSTRAINT faculty_achievements_created_by_fkey
    FOREIGN KEY (created_by)  REFERENCES auth.users(id)
);

COMMENT ON TABLE  public.faculty_achievements                IS 'Faculty accomplishments, awards, publications, and recognitions';
COMMENT ON COLUMN public.faculty_achievements.description    IS 'Markdown formatted text supporting bold, lists, links, etc.';
COMMENT ON COLUMN public.faculty_achievements.display_order  IS 'Custom priority ordering (lower = higher priority, 0 = highest)';
COMMENT ON COLUMN public.faculty_achievements.is_featured    IS 'Featured achievements shown in All Courses tab';


-- ============================================================================
-- 5. INDEXES
-- ============================================================================

-- faculty
CREATE INDEX IF NOT EXISTS idx_faculty_active_published
  ON public.faculty USING btree (is_active, status)
  WHERE ((is_active = true) AND (status = 'published'::text));

CREATE INDEX IF NOT EXISTS idx_faculty_department
  ON public.faculty USING btree (department);

CREATE INDEX IF NOT EXISTS idx_faculty_display_order
  ON public.faculty USING btree (display_order);

CREATE INDEX IF NOT EXISTS idx_faculty_slug
  ON public.faculty USING btree (slug);

CREATE INDEX IF NOT EXISTS idx_faculty_status
  ON public.faculty USING btree (status);

-- faculty_achievements
CREATE INDEX IF NOT EXISTS idx_faculty_achievements_active
  ON public.faculty_achievements USING btree (college_id, is_active)
  WHERE (is_active = true);

CREATE INDEX IF NOT EXISTS idx_faculty_achievements_category_id
  ON public.faculty_achievements USING btree (category_id)
  WHERE (category_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_faculty_achievements_college_id
  ON public.faculty_achievements USING btree (college_id);

CREATE INDEX IF NOT EXISTS idx_faculty_achievements_course_id
  ON public.faculty_achievements USING btree (college_id, course_id)
  WHERE (course_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_faculty_achievements_display_order
  ON public.faculty_achievements USING btree (college_id, display_order);

CREATE INDEX IF NOT EXISTS idx_faculty_achievements_featured
  ON public.faculty_achievements USING btree (college_id, is_featured)
  WHERE (is_featured = true);

CREATE INDEX IF NOT EXISTS idx_faculty_achievements_year
  ON public.faculty_achievements USING btree (achievement_year)
  WHERE (achievement_year IS NOT NULL);

-- Full-text search index over (title, description, faculty_name)
CREATE INDEX IF NOT EXISTS idx_faculty_achievements_search
  ON public.faculty_achievements
  USING gin (to_tsvector('english'::regconfig,
    ((((title || ' '::text) || COALESCE(description, ''::text)) || ' '::text) || faculty_name)
  ));


-- ============================================================================
-- 6. TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_faculty_updated_at ON public.faculty;
CREATE TRIGGER trigger_faculty_updated_at
  BEFORE UPDATE ON public.faculty
  FOR EACH ROW
  EXECUTE FUNCTION public.update_faculty_updated_at();

DROP TRIGGER IF EXISTS set_achievement_year_faculty ON public.faculty_achievements;
CREATE TRIGGER set_achievement_year_faculty
  BEFORE INSERT OR UPDATE ON public.faculty_achievements
  FOR EACH ROW
  EXECUTE FUNCTION public.extract_achievement_year_faculty();


-- ============================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE public.faculty               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faculty_achievements  ENABLE ROW LEVEL SECURITY;

-- ----- faculty -----
DROP POLICY IF EXISTS "Public can view active published faculty" ON public.faculty;
CREATE POLICY "Public can view active published faculty"
  ON public.faculty
  FOR SELECT
  TO public
  USING ((is_active = true) AND (status = 'published'::text));

DROP POLICY IF EXISTS "Authenticated users can view all faculty" ON public.faculty;
CREATE POLICY "Authenticated users can view all faculty"
  ON public.faculty
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert faculty" ON public.faculty;
CREATE POLICY "Authenticated users can insert faculty"
  ON public.faculty
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update faculty" ON public.faculty;
CREATE POLICY "Authenticated users can update faculty"
  ON public.faculty
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete faculty" ON public.faculty;
CREATE POLICY "Authenticated users can delete faculty"
  ON public.faculty
  FOR DELETE
  TO authenticated
  USING (true);

-- ----- faculty_achievements -----
DROP POLICY IF EXISTS "Public users can view active faculty achievements" ON public.faculty_achievements;
CREATE POLICY "Public users can view active faculty achievements"
  ON public.faculty_achievements
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Authenticated users can view all faculty achievements" ON public.faculty_achievements;
CREATE POLICY "Authenticated users can view all faculty achievements"
  ON public.faculty_achievements
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert faculty achievements" ON public.faculty_achievements;
CREATE POLICY "Authenticated users can insert faculty achievements"
  ON public.faculty_achievements
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update faculty achievements" ON public.faculty_achievements;
CREATE POLICY "Authenticated users can update faculty achievements"
  ON public.faculty_achievements
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete faculty achievements" ON public.faculty_achievements;
CREATE POLICY "Authenticated users can delete faculty achievements"
  ON public.faculty_achievements
  FOR DELETE
  TO authenticated
  USING (true);


-- ============================================================================
-- 8. (OPTIONAL) STANDALONE FALLBACK FOR faculty_achievements
-- ============================================================================
-- Use this block ONLY if your target project does NOT have the colleges /
-- courses / achievement_categories tables. It creates the same table without
-- the foreign-key constraints — the column types/defaults are identical so
-- you can backfill the FKs later if needed.
--
-- To use: comment out section 4 above and uncomment the block below.
--
-- CREATE TABLE IF NOT EXISTS public.faculty_achievements (
--   id                   uuid         NOT NULL DEFAULT gen_random_uuid(),
--   college_id           uuid         NOT NULL,
--   course_id            uuid         NULL,
--   category_id          uuid         NULL,
--   title                text         NOT NULL,
--   description          text         NOT NULL,
--   faculty_name         text         NOT NULL,
--   faculty_designation  text         NULL,
--   achievement_date     date         NULL,
--   achievement_year     integer      NULL,
--   display_order        integer      NULL DEFAULT 0,
--   is_featured          boolean      NULL DEFAULT false,
--   is_active            boolean      NULL DEFAULT true,
--   created_at           timestamptz  NULL DEFAULT CURRENT_TIMESTAMP,
--   updated_at           timestamptz  NULL DEFAULT CURRENT_TIMESTAMP,
--   created_by           uuid         NULL,
--   CONSTRAINT faculty_achievements_pkey PRIMARY KEY (id)
-- );


-- ============================================================================
-- END OF FILE
-- ============================================================================
