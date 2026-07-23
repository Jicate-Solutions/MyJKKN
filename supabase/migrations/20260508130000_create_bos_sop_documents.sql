-- ============================================================================
-- Migration: 20260508130000_create_bos_sop_documents.sql
-- Description: Standard Operating Procedure (SOP) document editor for BoS.
--              Adds three tables:
--                bos_sop_documents — one row per SOP document (Tiptap JSON tree)
--                bos_sop_versions  — immutable snapshots for version history
--                bos_sop_comments  — threaded comments anchored to a doc/range
--
--              Single-JSON content model: the entire Tiptap ProseMirror tree
--              lives in `content` (JSONB). `plain_text` is a generated column
--              extracted from the tree so we get full-text search without
--              re-parsing on every query.
-- ============================================================================


-- ── Helper: extract plain text from a Tiptap JSON tree ──────────────────────
-- Walks the Tiptap document tree and concatenates every text node. Used by
-- the generated `plain_text` column on bos_sop_documents so SOP search hits
-- the contents of headings, paragraphs, table cells, list items, etc.
-- IMMUTABLE so it can back a STORED generated column.

CREATE OR REPLACE FUNCTION public.bos_sop_extract_text(doc JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result TEXT := '';
  node   JSONB;
  child  JSONB;
BEGIN
  -- Null or non-object input → empty string.
  IF doc IS NULL OR jsonb_typeof(doc) <> 'object' THEN
    RETURN '';
  END IF;

  -- Direct text node (leaf) — append its text.
  IF doc ? 'text' THEN
    result := result || (doc->>'text') || ' ';
  END IF;

  -- Recurse through `content` array if present.
  IF doc ? 'content' AND jsonb_typeof(doc->'content') = 'array' THEN
    FOR child IN SELECT * FROM jsonb_array_elements(doc->'content')
    LOOP
      result := result || public.bos_sop_extract_text(child);
    END LOOP;
  END IF;

  RETURN result;
END;
$$;


-- ── bos_sop_documents ───────────────────────────────────────────────────────
-- One row per SOP. Bilingual support: `language` is 'en' | 'ta' | 'mixed'
-- so reports can filter Tamil-only SOPs. `status` mirrors the syllabus
-- workflow (draft/review/approved/archived) so role gates are consistent.

CREATE TABLE IF NOT EXISTS public.bos_sop_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,

  -- Human-readable title (shown in lists, breadcrumbs, exports).
  title           VARCHAR(255) NOT NULL,

  -- Slug-style category: 'syllabus_framing' | 'syllabus_revision' | 'general' | <custom>
  -- Used to bucket SOPs in list views and to choose a default template.
  category        VARCHAR(60) NOT NULL DEFAULT 'general',

  -- Free-form description used in cards & search snippets.
  description     TEXT,

  -- Primary language. 'mixed' = both EN and TA in the same document.
  language        VARCHAR(10) NOT NULL DEFAULT 'en',

  -- Editorial state. Mirrors bos_syllabi.status semantics.
  status          VARCHAR(20) NOT NULL DEFAULT 'draft',

  -- Tiptap document tree — the single source of truth for the editor.
  content         JSONB NOT NULL DEFAULT '{"type":"doc","content":[]}'::jsonb,

  -- Optional structured metadata (page size, margins, theme, watermark, etc.)
  -- Kept separate from `content` so layout changes don't bloat the doc.
  page_settings   JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Generated full-text column from the Tiptap tree text nodes.
  plain_text      TEXT GENERATED ALWAYS AS (
    public.bos_sop_extract_text(content)
  ) STORED,

  -- Latest version number. Bumped by the version-snapshot helper. Lets the
  -- list view show "v7" without aggregating bos_sop_versions on every query.
  current_version INTEGER NOT NULL DEFAULT 1,

  -- Audit
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT bos_sop_documents_status_chk
    CHECK (status IN ('draft', 'review', 'approved', 'archived')),
  CONSTRAINT bos_sop_documents_language_chk
    CHECK (language IN ('en', 'ta', 'mixed'))
);


-- ── bos_sop_versions ────────────────────────────────────────────────────────
-- Append-only snapshots of the Tiptap tree. Captured on every "Save & Snapshot"
-- and used for the version-history timeline, restore, and diff/compare views.

CREATE TABLE IF NOT EXISTS public.bos_sop_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES public.bos_sop_documents(id) ON DELETE CASCADE,

  -- Monotonic version counter unique per document.
  version_no   INTEGER NOT NULL,

  -- Frozen Tiptap content at the time of the snapshot.
  content      JSONB NOT NULL,

  -- Optional human note ("Approved by board", "Pre-revision baseline").
  note         TEXT,

  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT bos_sop_versions_unique
    UNIQUE (document_id, version_no)
);


-- ── bos_sop_comments ────────────────────────────────────────────────────────
-- Threaded comments. `range_from` / `range_to` are ProseMirror character
-- positions in the doc — null for whole-document comments.

CREATE TABLE IF NOT EXISTS public.bos_sop_comments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id    UUID NOT NULL REFERENCES public.bos_sop_documents(id) ON DELETE CASCADE,

  -- Reply threading: NULL means top-level; otherwise points at parent.
  parent_id      UUID REFERENCES public.bos_sop_comments(id) ON DELETE CASCADE,

  -- Anchor in the document (ProseMirror positions). NULL = whole-document.
  range_from     INTEGER,
  range_to       INTEGER,

  -- Cached short snippet so resolved comments still show context after the
  -- underlying text moves. Optional.
  anchor_text    TEXT,

  body           TEXT NOT NULL,

  -- Resolution
  is_resolved    BOOLEAN NOT NULL DEFAULT false,
  resolved_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at    TIMESTAMPTZ,

  -- Audit
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_bos_sop_documents_institutions
  ON public.bos_sop_documents (institutions_id);
CREATE INDEX IF NOT EXISTS idx_bos_sop_documents_status
  ON public.bos_sop_documents (institutions_id, status);
CREATE INDEX IF NOT EXISTS idx_bos_sop_documents_category
  ON public.bos_sop_documents (institutions_id, category);
CREATE INDEX IF NOT EXISTS idx_bos_sop_documents_search
  ON public.bos_sop_documents USING gin (to_tsvector('simple', coalesce(plain_text, '')));
CREATE INDEX IF NOT EXISTS idx_bos_sop_versions_document
  ON public.bos_sop_versions (document_id, version_no DESC);
CREATE INDEX IF NOT EXISTS idx_bos_sop_comments_document
  ON public.bos_sop_comments (document_id, created_at);
CREATE INDEX IF NOT EXISTS idx_bos_sop_comments_unresolved
  ON public.bos_sop_comments (document_id) WHERE is_resolved = false;


-- ── updated_at trigger ──────────────────────────────────────────────────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'update_updated_at_column' AND n.nspname = 'public'
  ) THEN
    EXECUTE $trg$
      DROP TRIGGER IF EXISTS trg_bos_sop_documents_updated_at ON public.bos_sop_documents;
      CREATE TRIGGER trg_bos_sop_documents_updated_at
        BEFORE UPDATE ON public.bos_sop_documents
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

      DROP TRIGGER IF EXISTS trg_bos_sop_comments_updated_at ON public.bos_sop_comments;
      CREATE TRIGGER trg_bos_sop_comments_updated_at
        BEFORE UPDATE ON public.bos_sop_comments
        FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    $trg$;
  END IF;
END $$;


-- ── Row-Level Security ──────────────────────────────────────────────────────
-- Mirrors bos_taxonomy: per-institution read/write, super_admin bypass.

ALTER TABLE public.bos_sop_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bos_sop_versions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bos_sop_comments  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bos_sop_documents_read_own_institution"
  ON public.bos_sop_documents FOR SELECT
  USING (
    institutions_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "bos_sop_documents_write_own_institution"
  ON public.bos_sop_documents FOR ALL
  USING (
    institutions_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    institutions_id = (SELECT institution_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "bos_sop_versions_read_via_parent"
  ON public.bos_sop_versions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.bos_sop_documents d
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE d.id = bos_sop_versions.document_id
        AND (d.institutions_id = p.institution_id OR p.is_super_admin)
    )
  );

CREATE POLICY "bos_sop_versions_write_via_parent"
  ON public.bos_sop_versions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.bos_sop_documents d
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE d.id = bos_sop_versions.document_id
        AND (d.institutions_id = p.institution_id OR p.is_super_admin)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bos_sop_documents d
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE d.id = bos_sop_versions.document_id
        AND (d.institutions_id = p.institution_id OR p.is_super_admin)
    )
  );

CREATE POLICY "bos_sop_comments_read_via_parent"
  ON public.bos_sop_comments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.bos_sop_documents d
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE d.id = bos_sop_comments.document_id
        AND (d.institutions_id = p.institution_id OR p.is_super_admin)
    )
  );

CREATE POLICY "bos_sop_comments_write_via_parent"
  ON public.bos_sop_comments FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.bos_sop_documents d
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE d.id = bos_sop_comments.document_id
        AND (d.institutions_id = p.institution_id OR p.is_super_admin)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bos_sop_documents d
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE d.id = bos_sop_comments.document_id
        AND (d.institutions_id = p.institution_id OR p.is_super_admin)
    )
  );


COMMENT ON TABLE  public.bos_sop_documents IS 'Standard Operating Procedure documents for BoS (Tiptap JSON content).';
COMMENT ON COLUMN public.bos_sop_documents.content IS 'Tiptap ProseMirror tree. Single source of truth for the editor.';
COMMENT ON COLUMN public.bos_sop_documents.plain_text IS 'Generated full-text from content; used for search.';
COMMENT ON TABLE  public.bos_sop_versions  IS 'Immutable snapshots of an SOP at a point in time.';
COMMENT ON TABLE  public.bos_sop_comments  IS 'Threaded comments anchored to a document or range within it.';
COMMENT ON FUNCTION public.bos_sop_extract_text(JSONB) IS 'Recursively extracts plain text from a Tiptap document tree.';
