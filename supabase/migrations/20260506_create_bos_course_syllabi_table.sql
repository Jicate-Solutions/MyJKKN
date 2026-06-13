-- Create bos_course_syllabi table for course syllabus management
-- Supports: new regulations, course revisions, versioning, JSON content storage

CREATE TABLE IF NOT EXISTS public.bos_course_syllabi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  board_id UUID NOT NULL,
  regulation_id UUID,
  course_code VARCHAR(50) NOT NULL,
  course_name VARCHAR(255) NOT NULL,
  course_credits INT,

  -- Versioning: Each revision is a NEW COURSE (not sequential versions within same row)
  version_number INT NOT NULL DEFAULT 1,
  is_latest BOOLEAN NOT NULL DEFAULT true,
  is_archived BOOLEAN NOT NULL DEFAULT false,

  -- Link to previous version (for audit trail and history)
  revised_from_syllabus_id UUID REFERENCES public.bos_course_syllabi(id) ON DELETE SET NULL,

  -- Core content stored as JSONB for flexibility
  -- Each field can be null if not yet filled in (draft state)
  course_objectives JSONB,
  -- Example: {"objectives": [{"id": "1", "number": 1, "description": "..."}, ...]}

  course_learning_outcomes JSONB,
  -- Example: {"clos": [{"clo_number": 1, "description": "...", "k_values": ["K1", "K3"]}, ...]}

  course_content JSONB,
  -- Example: {"units": [{"unit_id": "I", "unit_title": "...", "chapters": [{"chapter_number": 1, "title": "...", "sections": "..."}, ...]}, ...]}

  textbooks JSONB,
  -- Example: {"primary": [{"title": "...", "author": "...", "publication_year": 2024, "publisher": "..."}], "references": [...]}

  web_resources JSONB,
  -- Example: {"resources": [{"title": "...", "url": "https://..."}, ...]}

  pedagogy JSONB,
  -- Example: {"methods": ["Chalk and talk", "PowerPoint", "E-content", "Group discussion", ...]}

  po_mappings JSONB,
  -- Example: {"mappings": [{"co_id": "CO1", "pos": {"PO1": "H", "PO2": "M", ...}, "psos": {...}}, ...]}

  -- Metadata
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_modified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_modified_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Additional metadata
  notes TEXT,
  stream VARCHAR(50), -- "Engineering", "Pharmacy", "Nursing", "Dental", "Arts", etc.

  -- Constraint: Each course_code + regulation_id + version_number is unique
  UNIQUE(regulation_id, course_code, version_number),

  -- Constraint: Only one "is_latest=true" per course_code + regulation_id
  UNIQUE(regulation_id, course_code, is_latest) WHERE is_latest = true,

  -- Constraint: Ensure version_number doesn't go backwards
  CHECK(version_number >= 1)
);

-- Indexes for common queries
CREATE INDEX idx_bos_course_syllabi_institutions ON public.bos_course_syllabi(institutions_id);
CREATE INDEX idx_bos_course_syllabi_regulation ON public.bos_course_syllabi(regulation_id);
CREATE INDEX idx_bos_course_syllabi_code ON public.bos_course_syllabi(course_code);
CREATE INDEX idx_bos_course_syllabi_board ON public.bos_course_syllabi(board_id);
CREATE INDEX idx_bos_course_syllabi_latest ON public.bos_course_syllabi(is_latest) WHERE is_latest = true;
CREATE INDEX idx_bos_course_syllabi_archived ON public.bos_course_syllabi(is_archived) WHERE is_archived = false;

-- RLS: Enable row-level security
ALTER TABLE public.bos_course_syllabi ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view syllabi from their own institution (or super admin sees all)
CREATE POLICY "bos_syllabi_read_own_institution"
  ON public.bos_course_syllabi
  FOR SELECT
  USING (
    institutions_id = (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid())
  );

-- RLS Policy: Only designer/chairman can insert/update/delete
-- (Checked at API layer with role verification)
CREATE POLICY "bos_syllabi_write_own_institution"
  ON public.bos_course_syllabi
  FOR INSERT
  WITH CHECK (
    institutions_id = (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "bos_syllabi_update_own_institution"
  ON public.bos_course_syllabi
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

CREATE POLICY "bos_syllabi_delete_own_institution"
  ON public.bos_course_syllabi
  FOR DELETE
  USING (
    institutions_id = (
      SELECT institution_id FROM public.profiles WHERE id = auth.uid()
    )
    OR (SELECT is_super_admin FROM public.profiles WHERE id = auth.uid())
  );

-- Comments
COMMENT ON TABLE public.bos_course_syllabi IS 'Course syllabi for BoS meetings. Supports versioning (new course = new revision), duplication across regulations, and full content storage as JSON.';
COMMENT ON COLUMN public.bos_course_syllabi.version_number IS 'Version of this course syllabus (1 = original, 2 = first revision, 3 = second revision, etc.)';
COMMENT ON COLUMN public.bos_course_syllabi.is_latest IS 'Whether this is the currently active version of the course';
COMMENT ON COLUMN public.bos_course_syllabi.revised_from_syllabus_id IS 'If this is a revision, reference to the previous version';
COMMENT ON COLUMN public.bos_course_syllabi.course_objectives IS 'JSON: {objectives: [{number, description}, ...]}';
COMMENT ON COLUMN public.bos_course_syllabi.course_learning_outcomes IS 'JSON: {clos: [{clo_number, description, k_values}, ...]}';
COMMENT ON COLUMN public.bos_course_syllabi.course_content IS 'JSON: {units: [{unit_id, unit_title, chapters: [{chapter_number, title, sections}, ...]}, ...]}';
COMMENT ON COLUMN public.bos_course_syllabi.po_mappings IS 'JSON: {mappings: [{co_id, pos: {PO1: "H", ...}, psos: {...}}, ...]}';
