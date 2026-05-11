-- ============================================================================
-- Migration: 20260508_create_bos_taxonomy_master.sql
-- Description: Master taxonomy registry for the Board of Studies module.
--              Creates two new tables:
--                bos_taxonomy        — one row per framework (Bloom's, Fink's, custom)
--                bos_taxonomy_levels — one row per level inside a framework (K1..Kn)
--              Seeds Bloom's and Fink's taxonomy for every existing institution
--              so the new "Taxonomy List" entry under /bos/taxonomy has data on
--              first load.
--
--              No FK link from bos_regulation_taxonomies is added here. Wiring
--              regulations to a chosen master taxonomy is a follow-up.
-- ============================================================================


-- ── bos_taxonomy ────────────────────────────────────────────────────────────
-- Master taxonomy framework. Identified by (institutions_id, code).
-- `is_system = true` rows are seed-installed by this migration; UI may forbid
-- editing/deleting them so users always have at least Bloom's and Fink's.

CREATE TABLE IF NOT EXISTS public.bos_taxonomy (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,

  -- Stable short identifier within an institution: 'blooms' | 'finks' | custom slug
  code            VARCHAR(50) NOT NULL,

  -- Human-readable name (e.g. "Bloom's Taxonomy", "Fink's Taxonomy")
  name            VARCHAR(150) NOT NULL,

  description     TEXT,

  -- True for ordered frameworks (Bloom's K1<K2<..<K6); false for non-hierarchical
  -- frameworks where dimensions are independent (Fink's).
  is_hierarchical BOOLEAN NOT NULL DEFAULT true,

  -- Seed rows installed by this migration. UI/API may treat them as protected.
  is_system       BOOLEAN NOT NULL DEFAULT false,

  is_active       BOOLEAN NOT NULL DEFAULT true,

  -- Audit (nullable so the seed insert can run without a real auth.users row)
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT bos_taxonomy_code_per_institution_unique
    UNIQUE (institutions_id, code)
);

CREATE INDEX IF NOT EXISTS idx_bos_taxonomy_institutions
  ON public.bos_taxonomy (institutions_id);
CREATE INDEX IF NOT EXISTS idx_bos_taxonomy_active
  ON public.bos_taxonomy (institutions_id, is_active);


-- ── bos_taxonomy_levels ─────────────────────────────────────────────────────
-- One level/dimension per taxonomy. K1..K6 for Bloom's & Fink's seed rows.
-- `verb_examples` is a Postgres TEXT[] so Bloom's verb hints round-trip cleanly
-- without JSONB ceremony; Fink's rows leave it empty.

CREATE TABLE IF NOT EXISTS public.bos_taxonomy_levels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  taxonomy_id   UUID NOT NULL REFERENCES public.bos_taxonomy(id) ON DELETE CASCADE,

  -- Level code (e.g. 'K1'..'K6'). Unique per parent taxonomy.
  code          VARCHAR(20) NOT NULL,

  -- Level name (e.g. 'Remember', 'Foundational Knowledge')
  name          VARCHAR(150) NOT NULL,

  description   TEXT,

  -- Verb examples (Bloom's: ['define','list','recall',...]; Fink's: empty)
  verb_examples TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

  -- Display order. For hierarchical frameworks this is also the rank (K1=1).
  sort_order    INTEGER NOT NULL DEFAULT 0,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT bos_taxonomy_levels_code_per_taxonomy_unique
    UNIQUE (taxonomy_id, code)
);

CREATE INDEX IF NOT EXISTS idx_bos_taxonomy_levels_taxonomy
  ON public.bos_taxonomy_levels (taxonomy_id);
CREATE INDEX IF NOT EXISTS idx_bos_taxonomy_levels_order
  ON public.bos_taxonomy_levels (taxonomy_id, sort_order);


-- ── updated_at trigger ──────────────────────────────────────────────────────
-- Reuses the project-wide update_updated_at_column() helper if it exists.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'update_updated_at_column' AND n.nspname = 'public'
  ) THEN
    EXECUTE $trg$
      DROP TRIGGER IF EXISTS trg_bos_taxonomy_updated_at ON public.bos_taxonomy;
      CREATE TRIGGER trg_bos_taxonomy_updated_at
        BEFORE UPDATE ON public.bos_taxonomy
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

      DROP TRIGGER IF EXISTS trg_bos_taxonomy_levels_updated_at ON public.bos_taxonomy_levels;
      CREATE TRIGGER trg_bos_taxonomy_levels_updated_at
        BEFORE UPDATE ON public.bos_taxonomy_levels
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    $trg$;
  END IF;
END $$;


-- ── Row-Level Security ──────────────────────────────────────────────────────
-- Mirrors bos_regulation_taxonomies: per-institution read/write, super_admin
-- bypass via profiles.is_super_admin.

ALTER TABLE public.bos_taxonomy        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bos_taxonomy_levels ENABLE ROW LEVEL SECURITY;

-- bos_taxonomy: read own institution
CREATE POLICY "bos_taxonomy_read_own_institution"
  ON public.bos_taxonomy
  FOR SELECT
  USING (
    institutions_id = (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid())
  );

-- bos_taxonomy: insert own institution
CREATE POLICY "bos_taxonomy_insert_own_institution"
  ON public.bos_taxonomy
  FOR INSERT
  WITH CHECK (
    institutions_id = (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid())
  );

-- bos_taxonomy: update own institution
CREATE POLICY "bos_taxonomy_update_own_institution"
  ON public.bos_taxonomy
  FOR UPDATE
  USING (
    institutions_id = (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    institutions_id = (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid())
  );

-- bos_taxonomy: delete own institution (system rows are guarded at app layer)
CREATE POLICY "bos_taxonomy_delete_own_institution"
  ON public.bos_taxonomy
  FOR DELETE
  USING (
    institutions_id = (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid())
  );

-- bos_taxonomy_levels: read/write follow the parent's institution.
CREATE POLICY "bos_taxonomy_levels_read_via_parent"
  ON public.bos_taxonomy_levels
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.bos_taxonomy t
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE t.id = bos_taxonomy_levels.taxonomy_id
        AND (t.institutions_id = p.institution_id OR p.is_super_admin)
    )
  );

CREATE POLICY "bos_taxonomy_levels_write_via_parent"
  ON public.bos_taxonomy_levels
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.bos_taxonomy t
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE t.id = bos_taxonomy_levels.taxonomy_id
        AND (t.institutions_id = p.institution_id OR p.is_super_admin)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bos_taxonomy t
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE t.id = bos_taxonomy_levels.taxonomy_id
        AND (t.institutions_id = p.institution_id OR p.is_super_admin)
    )
  );


-- ── Seed: per-institution copies of Bloom's and Fink's ──────────────────────
-- For every existing institution, insert one Bloom's row + one Fink's row
-- and their six levels. ON CONFLICT DO NOTHING so re-running the migration is
-- safe and idempotent.

WITH bloom_seed AS (
  INSERT INTO public.bos_taxonomy
    (institutions_id, code, name, description, is_hierarchical, is_system, is_active)
  SELECT
    i.id,
    'blooms',
    'Bloom''s Taxonomy',
    'UGC / University Regulations. Six hierarchical cognitive levels K1..K6.',
    true,
    true,
    true
  FROM public.institutions i
  ON CONFLICT (institutions_id, code) DO NOTHING
  RETURNING id, institutions_id
),
finks_seed AS (
  INSERT INTO public.bos_taxonomy
    (institutions_id, code, name, description, is_hierarchical, is_system, is_active)
  SELECT
    i.id,
    'finks',
    'Fink''s Taxonomy',
    'Management Regulations. Six non-hierarchical dimensions of significant learning.',
    false,
    true,
    true
  FROM public.institutions i
  ON CONFLICT (institutions_id, code) DO NOTHING
  RETURNING id, institutions_id
),
bloom_levels AS (
  -- Bloom's: hierarchical levels K1..K6 with verb examples.
  INSERT INTO public.bos_taxonomy_levels
    (taxonomy_id, code, name, description, verb_examples, sort_order)
  SELECT b.id, l.code, l.name, l.description, l.verbs, l.sort_order
  FROM bloom_seed b
  CROSS JOIN (VALUES
    ('K1', 'Remember',   'Recall facts and basic concepts.',
     ARRAY['define','list','recall','name','identify'], 1),
    ('K2', 'Understand', 'Explain ideas or concepts.',
     ARRAY['explain','describe','classify','summarize'], 2),
    ('K3', 'Apply',      'Use information in new situations.',
     ARRAY['use','solve','demonstrate','execute','implement'], 3),
    ('K4', 'Analyze',    'Draw connections among ideas.',
     ARRAY['differentiate','compare','examine','break down'], 4),
    ('K5', 'Evaluate',   'Justify a stand or decision.',
     ARRAY['justify','critique','judge','argue','assess'], 5),
    ('K6', 'Create',     'Produce new or original work.',
     ARRAY['design','construct','develop','formulate','produce'], 6)
  ) AS l(code, name, description, verbs, sort_order)
  ON CONFLICT (taxonomy_id, code) DO NOTHING
  RETURNING 1
),
finks_levels AS (
  -- Fink's: non-hierarchical dimensions, also coded K1..K6 for consistency
  -- with Bloom's. (Fink's taxonomy itself doesn't prescribe codes — sort_order
  -- carries display order; is_hierarchical=false on the parent row signals that
  -- the sequence is not a ranking.)
  INSERT INTO public.bos_taxonomy_levels
    (taxonomy_id, code, name, description, verb_examples, sort_order)
  SELECT f.id, l.code, l.name, l.description, ARRAY[]::TEXT[], l.sort_order
  FROM finks_seed f
  CROSS JOIN (VALUES
    ('K1', 'Foundational Knowledge', 'Understanding key information and ideas.', 1),
    ('K2', 'Application',            'Skills, critical thinking, managing projects.', 2),
    ('K3', 'Integration',            'Connecting ideas, people, realms of life.', 3),
    ('K4', 'Human Dimension',        'Learning about oneself and others.', 4),
    ('K5', 'Caring',                 'Developing new feelings, interests, values.', 5),
    ('K6', 'Learning How to Learn',  'Self-direction, inquiry, becoming a better learner.', 6)
  ) AS l(code, name, description, sort_order)
  ON CONFLICT (taxonomy_id, code) DO NOTHING
  RETURNING 1
)
SELECT 1;


COMMENT ON TABLE  public.bos_taxonomy        IS 'Master taxonomy frameworks (Bloom''s, Fink''s, custom) per institution.';
COMMENT ON COLUMN public.bos_taxonomy.code            IS 'Stable identifier within institution: blooms | finks | <custom-slug>.';
COMMENT ON COLUMN public.bos_taxonomy.is_hierarchical IS 'true = ordered (Bloom''s K1<K2<..); false = non-hierarchical (Fink''s).';
COMMENT ON COLUMN public.bos_taxonomy.is_system       IS 'Seed-installed row; UI/API may forbid edit/delete.';
COMMENT ON TABLE  public.bos_taxonomy_levels IS 'Levels/dimensions for a taxonomy (e.g. K1..K6).';
COMMENT ON COLUMN public.bos_taxonomy_levels.verb_examples IS 'Action-verb hints for Bloom''s; empty for Fink''s.';
