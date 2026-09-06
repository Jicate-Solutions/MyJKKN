-- =====================================================================
-- Global Calendar module — Phase 1 substrate (3 owned tables)            2026-06-23
-- calendar_entries:        cross-institution holidays/events/meetings.
--                          scope_institution_ids NULL = COMMON (all institutions);
--                          a populated uuid[] = a specific subset.
-- calendar_categories:     global color/legend vocabulary.
-- calendar_feed_settings:  per-feed on/off; institution_id NULL = global default,
--                          a row with institution_id = per-institution override.
-- RLS: admin bypass OR permission key AND institution scope (the standard
-- MyJKKN idiom). Reads for the grid go through the SECURITY DEFINER resolver
-- (next migration); these policies gate DIRECT reads/writes from the admin UI.
-- =====================================================================

-- 1. calendar_categories ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.calendar_categories (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  slug             TEXT NOT NULL UNIQUE,
  color_code       TEXT NOT NULL DEFAULT '#6b7280',
  applies_to_kinds TEXT[] NOT NULL DEFAULT ARRAY['holiday','event','meeting'],
  icon             TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. calendar_entries ---------------------------------------------------
CREATE TABLE IF NOT EXISTS public.calendar_entries (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                  TEXT NOT NULL DEFAULT 'holiday'
                          CHECK (kind IN ('holiday','event','meeting')),
  title                 TEXT NOT NULL,
  description           TEXT,
  category_id           UUID REFERENCES public.calendar_categories(id),
  start_at              TIMESTAMPTZ NOT NULL,
  end_at                TIMESTAMPTZ NOT NULL,
  all_day               BOOLEAN NOT NULL DEFAULT true,
  blocks_attendance     BOOLEAN NOT NULL DEFAULT true,
  scope_institution_ids UUID[],                       -- NULL = common (all institutions)
  visibility            TEXT NOT NULL DEFAULT 'public'
                          CHECK (visibility IN ('public','restricted')),
  location              TEXT,
  meeting_url           TEXT,
  is_recurring          BOOLEAN NOT NULL DEFAULT false,
  recurrence_pattern    JSONB,
  color_code            TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_by            UUID REFERENCES public.profiles(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT calendar_entries_end_after_start CHECK (end_at >= start_at)
);

CREATE INDEX IF NOT EXISTS idx_calendar_entries_active_start
  ON public.calendar_entries (is_active, start_at);
CREATE INDEX IF NOT EXISTS idx_calendar_entries_kind_start
  ON public.calendar_entries (kind, start_at);
CREATE INDEX IF NOT EXISTS idx_calendar_entries_scope
  ON public.calendar_entries USING GIN (scope_institution_ids);

-- 3. calendar_feed_settings --------------------------------------------
CREATE TABLE IF NOT EXISTS public.calendar_feed_settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_key        TEXT NOT NULL,
  institution_id  UUID REFERENCES public.institutions(id),  -- NULL = global default
  is_enabled      BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- one global-default row per feed, one override row per (feed, institution)
CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_feed_global
  ON public.calendar_feed_settings (feed_key) WHERE institution_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_calendar_feed_institution
  ON public.calendar_feed_settings (feed_key, institution_id) WHERE institution_id IS NOT NULL;

-- 4. updated_at touch trigger (shared by the 3 tables) ------------------
CREATE OR REPLACE FUNCTION public.fn_calendar_entries_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calendar_entries_touch ON public.calendar_entries;
CREATE TRIGGER trg_calendar_entries_touch BEFORE UPDATE ON public.calendar_entries
  FOR EACH ROW EXECUTE FUNCTION public.fn_calendar_entries_touch_updated_at();
DROP TRIGGER IF EXISTS trg_calendar_categories_touch ON public.calendar_categories;
CREATE TRIGGER trg_calendar_categories_touch BEFORE UPDATE ON public.calendar_categories
  FOR EACH ROW EXECUTE FUNCTION public.fn_calendar_entries_touch_updated_at();
DROP TRIGGER IF EXISTS trg_calendar_feed_settings_touch ON public.calendar_feed_settings;
CREATE TRIGGER trg_calendar_feed_settings_touch BEFORE UPDATE ON public.calendar_feed_settings
  FOR EACH ROW EXECUTE FUNCTION public.fn_calendar_entries_touch_updated_at();

-- 5. RLS ----------------------------------------------------------------
ALTER TABLE public.calendar_categories    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_feed_settings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.calendar_categories    FROM anon;
REVOKE ALL ON public.calendar_entries       FROM anon;
REVOKE ALL ON public.calendar_feed_settings FROM anon;

-- categories: any calendar viewer reads; config managers write
DROP POLICY IF EXISTS calendar_categories_select ON public.calendar_categories;
CREATE POLICY calendar_categories_select ON public.calendar_categories
  FOR SELECT USING (
    is_super_admin() OR is_admin() OR user_has_permission('calendar.view')
  );
DROP POLICY IF EXISTS calendar_categories_write ON public.calendar_categories;
CREATE POLICY calendar_categories_write ON public.calendar_categories
  FOR ALL USING (
    is_super_admin() OR is_admin() OR user_has_permission('calendar.config.manage')
  ) WITH CHECK (
    is_super_admin() OR is_admin() OR user_has_permission('calendar.config.manage')
  );

-- entries: viewers see common + their-scope; holiday managers write common + their-scope
DROP POLICY IF EXISTS calendar_entries_select ON public.calendar_entries;
CREATE POLICY calendar_entries_select ON public.calendar_entries
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('calendar.view')
        AND (scope_institution_ids IS NULL
             OR scope_institution_ids && public._user_accessible_institutions()))
  );
DROP POLICY IF EXISTS calendar_entries_write ON public.calendar_entries;
CREATE POLICY calendar_entries_write ON public.calendar_entries
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR (user_has_permission('calendar.holidays.manage')
        AND (scope_institution_ids IS NULL
             OR scope_institution_ids && public._user_accessible_institutions()))
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('calendar.holidays.manage')
        AND (scope_institution_ids IS NULL
             OR scope_institution_ids && public._user_accessible_institutions()))
  );

-- feed settings: viewers read; config managers write
DROP POLICY IF EXISTS calendar_feed_settings_select ON public.calendar_feed_settings;
CREATE POLICY calendar_feed_settings_select ON public.calendar_feed_settings
  FOR SELECT USING (
    is_super_admin() OR is_admin() OR user_has_permission('calendar.view')
  );
DROP POLICY IF EXISTS calendar_feed_settings_write ON public.calendar_feed_settings;
CREATE POLICY calendar_feed_settings_write ON public.calendar_feed_settings
  FOR ALL USING (
    is_super_admin() OR is_admin() OR user_has_permission('calendar.config.manage')
  ) WITH CHECK (
    is_super_admin() OR is_admin() OR user_has_permission('calendar.config.manage')
  );

-- 6. seed the legend categories ----------------------------------------
INSERT INTO public.calendar_categories (name, slug, color_code, applies_to_kinds, sort_order)
VALUES
  ('Public Holiday',    'public-holiday',    '#f59e0b', ARRAY['holiday'], 1),
  ('Institution Leave', 'institution-leave', '#0ea5e9', ARRAY['holiday'], 2),
  ('Event',             'event',             '#22c55e', ARRAY['event'],   3),
  ('Meeting',           'meeting',           '#8b5cf6', ARRAY['meeting'], 4)
ON CONFLICT (slug) DO NOTHING;
