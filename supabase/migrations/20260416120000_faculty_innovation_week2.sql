-- ============================================================================
-- Faculty Innovation Portfolio Module — Week 2 Migration
-- Spec: specs/faculty-innovation-module-spec.md (v1.0.0, 2026-04-15)
-- Depends on: 20260415120000_faculty_innovation_week1.sql
--
-- SCOPE (Week 2):
--   * Table: ip_filings (confidential IP/patent register — STRICTER RLS)
--   * Table: faculty_initiative_inventor_transfers (ownership transfer audit)
--   * Table: faculty_innovation_notifications (in-app notifications)
--   * ALTER: faculty_initiatives (add collaboration_request JSONB column)
--
-- RLS DECISIONS (from spec §12):
--   * ip_filings: inventor + Director ONLY. Dean/HOD CANNOT see. (Decision #2)
--   * inventor_transfers: super_admin + director only
--   * notifications: user sees own only
--
-- SAFE to apply twice (IF NOT EXISTS / IF EXISTS guards)
-- Review-only artifact — DO NOT push to remote via this agent
-- ============================================================================

-- ============================================================================
-- TABLE: ip_filings (§5 Table 2 — Confidential IP/Patent Register)
-- STRICTER RLS than faculty_initiatives: inventor + Director ONLY
-- Dean and HOD do NOT see this table (thrash decision A4)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.ip_filings (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id         UUID        NOT NULL REFERENCES public.faculty_initiatives(id) ON DELETE CASCADE,
  institution_id        UUID        NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,

  inventor_id           UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,

  -- Filing details
  filing_type           VARCHAR(50) NOT NULL
    CHECK (filing_type IN ('patent', 'design', 'trademark', 'copyright', 'trade_secret', 'utility_model')),
  filing_status         VARCHAR(50) NOT NULL DEFAULT 'draft'
    CHECK (filing_status IN ('draft', 'filed', 'published', 'granted', 'rejected', 'abandoned', 'expired')),
  filing_number         VARCHAR(100),               -- Patent/application number
  filing_date           DATE,
  grant_date            DATE,
  jurisdiction          VARCHAR(100),               -- e.g. 'India', 'US', 'PCT', 'EU'
  assignee              VARCHAR(200),               -- e.g. 'JKKN Educational Institutions'

  title                 VARCHAR(500) NOT NULL,
  abstract              TEXT,

  -- Cost tracking
  cost_currency         VARCHAR(3)  DEFAULT 'INR',
  cost_amount           NUMERIC(12,2),

  -- NAAC/NBA/AICTE fields
  naac_criteria         VARCHAR(50),                -- e.g. 'III.3.1', 'III.4.2'
  naac_metric_code      VARCHAR(50),
  naac_score_claim      NUMERIC(5,2),

  -- Co-inventors on the filing (JSONB — may differ from initiative coinventors)
  coinventors           JSONB       NOT NULL DEFAULT '[]'::jsonb,

  -- Attachments (certificates, filing receipts, etc.)
  attachment_urls       JSONB       NOT NULL DEFAULT '[]'::jsonb,

  -- Standard MyJKKN audit fields
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by            UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active             BOOLEAN     NOT NULL DEFAULT TRUE
);

COMMENT ON TABLE  public.ip_filings IS
  'Confidential IP/Patent register. STRICTER RLS than faculty_initiatives: inventor + Director ONLY. Dean/HOD cannot see.';
COMMENT ON COLUMN public.ip_filings.filing_type IS
  'patent | design | trademark | copyright | trade_secret | utility_model';
COMMENT ON COLUMN public.ip_filings.filing_status IS
  'draft | filed | published | granted | rejected | abandoned | expired';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ipf_initiative
  ON public.ip_filings(initiative_id);
CREATE INDEX IF NOT EXISTS idx_ipf_inventor
  ON public.ip_filings(inventor_id);
CREATE INDEX IF NOT EXISTS idx_ipf_institution_status
  ON public.ip_filings(institution_id, filing_status);
CREATE INDEX IF NOT EXISTS idx_ipf_filing_type
  ON public.ip_filings(filing_type)
  WHERE is_active = TRUE;

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_ipf_set_updated_at ON public.ip_filings;
CREATE TRIGGER trg_ipf_set_updated_at
  BEFORE UPDATE ON public.ip_filings
  FOR EACH ROW EXECUTE FUNCTION public.fi_set_updated_at();

-- ============================================================================
-- TABLE: faculty_initiative_inventor_transfers (§12 A1 — ownership audit)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.faculty_initiative_inventor_transfers (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id     UUID        NOT NULL REFERENCES public.faculty_initiatives(id) ON DELETE CASCADE,
  from_inventor_id  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  to_inventor_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  transferred_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  transferred_by    UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason            TEXT
);

COMMENT ON TABLE public.faculty_initiative_inventor_transfers IS
  'Ownership transfer audit log. Created each time FacultyInitiativeService.transferOwnership() is called.';

CREATE INDEX IF NOT EXISTS idx_fi_transfers_initiative
  ON public.faculty_initiative_inventor_transfers(initiative_id, transferred_at DESC);
CREATE INDEX IF NOT EXISTS idx_fi_transfers_from
  ON public.faculty_initiative_inventor_transfers(from_inventor_id);
CREATE INDEX IF NOT EXISTS idx_fi_transfers_to
  ON public.faculty_initiative_inventor_transfers(to_inventor_id);

-- ============================================================================
-- TABLE: faculty_innovation_notifications (§12 A6 — in-app notifications)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.faculty_innovation_notifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  initiative_id   UUID        REFERENCES public.faculty_initiatives(id) ON DELETE SET NULL,
  event_type      VARCHAR(50) NOT NULL,
    -- e.g. 'status_changed', 'approval_needed', 'collab_request', 'escalated',
    -- 'transfer', 'ip_filed', 'changes_requested'
  title           VARCHAR(300),
  body            TEXT,
  channels        TEXT[]      NOT NULL DEFAULT ARRAY['in_app']::TEXT[],
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.faculty_innovation_notifications IS
  'In-app notifications for Faculty Innovation. v1: channels=[''in_app''] only. Channel-agnostic table for future expansion.';

CREATE INDEX IF NOT EXISTS idx_fin_user_unread
  ON public.faculty_innovation_notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fin_initiative
  ON public.faculty_innovation_notifications(initiative_id)
  WHERE initiative_id IS NOT NULL;

-- ============================================================================
-- ALTER: faculty_initiatives — add collaboration_request JSONB
-- For v1 simplicity, collab requests are stored as a JSONB field on the
-- initiative rather than a separate table. (Spec §12 design decision)
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'faculty_initiatives'
      AND column_name  = 'collaboration_request'
  ) THEN
    ALTER TABLE public.faculty_initiatives
      ADD COLUMN collaboration_request JSONB;
    COMMENT ON COLUMN public.faculty_initiatives.collaboration_request IS
      'JSONB field for cross-college collaboration requests. Structure: { target_institution_id, target_department_id, description, status, requested_at, responded_at, responded_by }';
  END IF;
END $$;

-- ============================================================================
-- RLS: ip_filings — STRICTER: inventor + Director ONLY
-- ============================================================================
ALTER TABLE public.ip_filings ENABLE ROW LEVEL SECURITY;

-- SELECT: inventor OR Director OR super_admin/admin ONLY
-- Dean and HOD are explicitly EXCLUDED (spec §12 decision #2)
DROP POLICY IF EXISTS "ip_filings_select" ON public.ip_filings;
CREATE POLICY "ip_filings_select" ON public.ip_filings
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR inventor_id = auth.uid()
    OR get_current_user_role() = 'director'
  );

-- INSERT: inventor creating their own filing, or super_admin
DROP POLICY IF EXISTS "ip_filings_insert" ON public.ip_filings;
CREATE POLICY "ip_filings_insert" ON public.ip_filings
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('faculty_innovation.ip.register')
        AND inventor_id = auth.uid())
  );

-- UPDATE: inventor (own filings) or Director
DROP POLICY IF EXISTS "ip_filings_update" ON public.ip_filings;
CREATE POLICY "ip_filings_update" ON public.ip_filings
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR inventor_id = auth.uid()
    OR get_current_user_role() = 'director'
  );

-- No DELETE policy (soft-delete via is_active = false)

-- ============================================================================
-- RLS: faculty_initiative_inventor_transfers — super_admin + director ONLY
-- ============================================================================
ALTER TABLE public.faculty_initiative_inventor_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fi_transfers_select" ON public.faculty_initiative_inventor_transfers;
CREATE POLICY "fi_transfers_select" ON public.faculty_initiative_inventor_transfers
  FOR SELECT USING (
    is_super_admin() OR get_current_user_role() = 'director'
  );

DROP POLICY IF EXISTS "fi_transfers_insert" ON public.faculty_initiative_inventor_transfers;
CREATE POLICY "fi_transfers_insert" ON public.faculty_initiative_inventor_transfers
  FOR INSERT WITH CHECK (
    is_super_admin() OR get_current_user_role() = 'director'
  );

-- No UPDATE or DELETE — immutable transfer log

-- ============================================================================
-- RLS: faculty_innovation_notifications — user sees own only
-- ============================================================================
ALTER TABLE public.faculty_innovation_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fin_select" ON public.faculty_innovation_notifications;
CREATE POLICY "fin_select" ON public.faculty_innovation_notifications
  FOR SELECT USING (
    is_super_admin() OR user_id = auth.uid()
  );

-- INSERT: any authenticated user (service layer creates notifications)
DROP POLICY IF EXISTS "fin_insert" ON public.faculty_innovation_notifications;
CREATE POLICY "fin_insert" ON public.faculty_innovation_notifications
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
  );

-- UPDATE: user can mark own notifications as read
DROP POLICY IF EXISTS "fin_update" ON public.faculty_innovation_notifications;
CREATE POLICY "fin_update" ON public.faculty_innovation_notifications
  FOR UPDATE USING (
    is_super_admin() OR user_id = auth.uid()
  );

-- ============================================================================
-- END Week 2 migration
-- ============================================================================
