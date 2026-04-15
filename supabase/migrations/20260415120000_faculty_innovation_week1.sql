-- ============================================================================
-- Faculty Innovation Portfolio Module — Week 1 Migration
-- Spec: specs/faculty-innovation-module-spec.md (v1.0.0, 2026-04-15)
-- Chain: myjkkn-module -> preflight -> assumption-thrash (16 Qs, 4 rounds) -> THIS
-- Created: 2026-04-15
--
-- SCOPE (Week 1 only):
--   * Table: faculty_initiatives (core, 12-state TRL enum, role-routed approval)
--   * Table: faculty_initiative_coinventors (internal JKKN co-inventors; A14)
--   * Table: faculty_initiative_audit_log (immutable state-change audit; A8)
--   * Table: approval_authority_config (escalation config; A5)
--   * ALTER: sh_publications (add origin / faculty_initiative_id / faculty_inventor_id; §11)
--
-- DEFERRED (Week 2-3):
--   * ip_filings (stricter-RLS IP register)
--   * faculty_initiative_inventor_transfers (ownership transfers)
--   * faculty_innovation_notifications
--
-- NOTES:
--   * SAFE to apply twice (IF NOT EXISTS / IF EXISTS guards)
--   * sh_publications extension is CONDITIONAL — only runs if the table exists
--     (Solutions Hub may not be deployed yet in every env)
--   * Review-only artifact — DO NOT push to remote via this agent
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENUM-like CHECK values are inline per MyJKKN convention (no CREATE TYPE)
-- ----------------------------------------------------------------------------

-- ============================================================================
-- TABLE: faculty_initiatives
-- Core record for each faculty-led innovation
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.faculty_initiatives (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id             UUID        NOT NULL REFERENCES public.institutions(id) ON DELETE RESTRICT,

  -- Ownership (A1: transferable with history)
  -- original_inventor_id = frozen at submit (for credit/authorship)
  -- inventor_id          = mutable current owner (updated on transfer)
  original_inventor_id       UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  inventor_id                UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,

  -- Core content
  title                      VARCHAR(500) NOT NULL,
  abstract                   TEXT        NOT NULL,
  description                TEXT,

  -- Category drives approval routing (learning #4)
  category                   VARCHAR(50) NOT NULL
    CHECK (category IN ('ip_bearing', 'clinical', 'research_grant', 'publication')),

  -- 12-state TRL lifecycle (decision #3 + A3 terminated + A15 draft_from_email)
  status                     VARCHAR(50) NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'draft_from_email',
      'submitted',
      'under_review',
      'approved',
      'rejected',
      'resourced',
      'in_progress',
      'piloting',
      'completed',
      'scaled',
      'terminated'
    )),

  -- Approval routing (decision #4 + A4 hybrid IP Cell)
  approval_authority         VARCHAR(50)
    CHECK (approval_authority IS NULL OR approval_authority IN ('director', 'dean', 'ip_cell', 'hod')),
  approval_sub_authority     VARCHAR(50),          -- 'central' | 'liaison_<institution_id>' (A4)
  current_approver_id        UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_at               TIMESTAMPTZ,
  last_status_change_at      TIMESTAMPTZ,
  last_status_change_by      UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- External co-inventors (A14 hybrid: external names/emails stored as JSONB,
  -- internal JKKN co-inventors live in faculty_initiative_coinventors table)
  external_coinventors       JSONB       NOT NULL DEFAULT '[]'::jsonb,

  -- Category-specific detail fields (JSONB allows per-branch schema without ALTER)
  clinical_details           JSONB,                  -- sample_size / ethics_approval_id / deployment_site ...
  research_details           JSONB,                  -- funding_agency / grant_amount / duration ...

  -- Publication linkage (§11 overlap: we reuse sh_publications, not duplicate)
  -- NULLABLE — only set when category = 'publication' AND Solutions Hub is present
  sh_publication_id          UUID,                   -- FK added conditionally below

  -- Startup Studio compounding (learning #7)
  startup_studio_cycle_id    UUID,                   -- FK added conditionally if ss_cycles exists
  startup_studio_link_status VARCHAR(20)
    CHECK (startup_studio_link_status IS NULL OR
           startup_studio_link_status IN ('unlinked', 'requested', 'linked', 'declined')),

  -- Source tracking (for /email-triage compounding + retro-load)
  source                     VARCHAR(20) NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'email_triage', 'bulk_import', 'retro_load')),
  source_email_thread_id     TEXT,
  source_note                TEXT,

  -- Attachments (decision #8)
  attachment_urls            JSONB       NOT NULL DEFAULT '[]'::jsonb,

  -- Standard MyJKKN audit fields
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                 UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by                 UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active                  BOOLEAN     NOT NULL DEFAULT TRUE  -- soft delete (A7)
);

COMMENT ON TABLE  public.faculty_initiatives IS
  'Faculty-led innovation/research initiative register. See specs/faculty-innovation-module-spec.md v1.0.0.';
COMMENT ON COLUMN public.faculty_initiatives.original_inventor_id IS
  'Frozen at submit. Used for authorship credit even after ownership transfer (A1).';
COMMENT ON COLUMN public.faculty_initiatives.inventor_id IS
  'Current owner. Can be reassigned by Director (A1). Drives RLS + current_approver routing.';
COMMENT ON COLUMN public.faculty_initiatives.approval_sub_authority IS
  'For hybrid IP Cell: ''central'' (org-wide) or ''liaison_<institution_id>'' (per-college).';
COMMENT ON COLUMN public.faculty_initiatives.status IS
  '12-state TRL lifecycle. Enforced via status transition trigger. draft_from_email = /email-triage auto-draft.';

-- Indexes (A12: filter-based search only in v1, no tsvector)
CREATE INDEX IF NOT EXISTS idx_fi_inventor
  ON public.faculty_initiatives(inventor_id);
CREATE INDEX IF NOT EXISTS idx_fi_original_inventor
  ON public.faculty_initiatives(original_inventor_id);
CREATE INDEX IF NOT EXISTS idx_fi_institution_status
  ON public.faculty_initiatives(institution_id, status);
CREATE INDEX IF NOT EXISTS idx_fi_category_approver
  ON public.faculty_initiatives(category, current_approver_id);
CREATE INDEX IF NOT EXISTS idx_fi_approval_authority
  ON public.faculty_initiatives(approval_authority, status)
  WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_fi_source_email
  ON public.faculty_initiatives(source_email_thread_id)
  WHERE source = 'email_triage';
CREATE INDEX IF NOT EXISTS idx_fi_submitted_at
  ON public.faculty_initiatives(submitted_at DESC)
  WHERE is_active = TRUE AND submitted_at IS NOT NULL;

-- ============================================================================
-- TABLE: faculty_initiative_coinventors (A14 — internal JKKN users only)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.faculty_initiative_coinventors (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id         UUID        NOT NULL REFERENCES public.faculty_initiatives(id) ON DELETE CASCADE,
  coinventor_user_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  contribution_percent  NUMERIC(5,2) CHECK (contribution_percent IS NULL OR (contribution_percent >= 0 AND contribution_percent <= 100)),
  role                  VARCHAR(50),                -- 'co-inventor' | 'advisor' | 'technical-lead' (free text)
  added_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  added_by              UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,

  UNIQUE (initiative_id, coinventor_user_id)
);

CREATE INDEX IF NOT EXISTS idx_fi_coinventors_initiative
  ON public.faculty_initiative_coinventors(initiative_id);
CREATE INDEX IF NOT EXISTS idx_fi_coinventors_user
  ON public.faculty_initiative_coinventors(coinventor_user_id);

COMMENT ON TABLE public.faculty_initiative_coinventors IS
  'Internal JKKN co-inventors (FK to profiles). External names/emails live in faculty_initiatives.external_coinventors JSONB.';

-- ============================================================================
-- TABLE: faculty_initiative_audit_log (A8 — immutable audit trail)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.faculty_initiative_audit_log (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  initiative_id  UUID        NOT NULL REFERENCES public.faculty_initiatives(id) ON DELETE CASCADE,
  action         VARCHAR(50) NOT NULL,              -- 'created' | 'status_changed' | 'approver_changed' | 'transferred' | 'updated' | 'deleted'
  actor_id       UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,
  before_state   JSONB,                             -- NULL on 'created'
  after_state    JSONB,                             -- NULL on 'deleted'
  reason         TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fi_audit_initiative
  ON public.faculty_initiative_audit_log(initiative_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fi_audit_actor
  ON public.faculty_initiative_audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_fi_audit_action
  ON public.faculty_initiative_audit_log(action);

COMMENT ON TABLE public.faculty_initiative_audit_log IS
  'Immutable state-change audit. NEVER UPDATE or DELETE. Populated by service layer + transition trigger.';

-- ============================================================================
-- TABLE: approval_authority_config (A5 — escalation)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.approval_authority_config (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_authority    VARCHAR(50) NOT NULL,       -- 'director' | 'dean' | 'ip_cell' | 'hod'
  institution_id        UUID        REFERENCES public.institutions(id) ON DELETE CASCADE,  -- NULL = applies globally
  escalate_after_days   INTEGER     NOT NULL DEFAULT 7,
  fallback_role         VARCHAR(50) NOT NULL,       -- role_key to escalate to
  is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (approval_authority, institution_id)
);

CREATE INDEX IF NOT EXISTS idx_approval_config_authority
  ON public.approval_authority_config(approval_authority, is_active);

COMMENT ON TABLE public.approval_authority_config IS
  'Per-authority escalation config. Cron-driven job (Week 2+) finds initiatives idle beyond escalate_after_days and reroutes to fallback_role.';

-- ============================================================================
-- EXTENSION: sh_publications (conditional — only if table exists)
-- See spec §11 overlap resolution: faculty publications use this canonical table
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'sh_publications') THEN

    -- Add columns only if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'sh_publications' AND column_name = 'origin') THEN
      ALTER TABLE public.sh_publications
        ADD COLUMN origin VARCHAR(20) NOT NULL DEFAULT 'student'
          CHECK (origin IN ('student', 'faculty', 'external'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'sh_publications' AND column_name = 'faculty_initiative_id') THEN
      ALTER TABLE public.sh_publications
        ADD COLUMN faculty_initiative_id UUID REFERENCES public.faculty_initiatives(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_schema = 'public' AND table_name = 'sh_publications' AND column_name = 'faculty_inventor_id') THEN
      ALTER TABLE public.sh_publications
        ADD COLUMN faculty_inventor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
    END IF;

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_sh_pub_origin                  ON public.sh_publications(origin);
    CREATE INDEX IF NOT EXISTS idx_sh_pub_faculty_initiative      ON public.sh_publications(faculty_initiative_id)
      WHERE faculty_initiative_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_sh_pub_faculty_inventor        ON public.sh_publications(faculty_inventor_id)
      WHERE faculty_inventor_id IS NOT NULL;

    -- Add the reciprocal FK on faculty_initiatives.sh_publication_id
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name   = 'faculty_initiatives'
        AND constraint_name = 'faculty_initiatives_sh_publication_id_fkey'
    ) THEN
      ALTER TABLE public.faculty_initiatives
        ADD CONSTRAINT faculty_initiatives_sh_publication_id_fkey
        FOREIGN KEY (sh_publication_id) REFERENCES public.sh_publications(id) ON DELETE SET NULL;
    END IF;

  END IF;
END $$;

-- Conditional FK for startup_studio_cycle_id (only if ss_cycles exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'ss_cycles') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public'
        AND table_name   = 'faculty_initiatives'
        AND constraint_name = 'faculty_initiatives_startup_studio_cycle_id_fkey'
    ) THEN
      ALTER TABLE public.faculty_initiatives
        ADD CONSTRAINT faculty_initiatives_startup_studio_cycle_id_fkey
        FOREIGN KEY (startup_studio_cycle_id) REFERENCES public.ss_cycles(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- TRIGGERS: updated_at maintenance
-- ============================================================================

-- Generic updated_at setter (reuses existing if already defined project-wide)
CREATE OR REPLACE FUNCTION public.fi_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_fi_set_updated_at ON public.faculty_initiatives;
CREATE TRIGGER trg_fi_set_updated_at
  BEFORE UPDATE ON public.faculty_initiatives
  FOR EACH ROW EXECUTE FUNCTION public.fi_set_updated_at();

DROP TRIGGER IF EXISTS trg_approval_cfg_set_updated_at ON public.approval_authority_config;
CREATE TRIGGER trg_approval_cfg_set_updated_at
  BEFORE UPDATE ON public.approval_authority_config
  FOR EACH ROW EXECUTE FUNCTION public.fi_set_updated_at();

-- ============================================================================
-- TRIGGER: Status transition enforcement (A11 strict TRL)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.faculty_initiatives_enforce_status_transition()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  allowed_transitions JSONB := '{
    "draft":              ["submitted", "draft"],
    "draft_from_email":   ["submitted", "draft_from_email", "draft"],
    "submitted":          ["under_review", "rejected", "submitted"],
    "under_review":       ["approved", "rejected", "under_review"],
    "approved":           ["resourced", "approved"],
    "rejected":           ["rejected"],
    "resourced":          ["in_progress", "resourced"],
    "in_progress":        ["piloting", "terminated", "in_progress"],
    "piloting":           ["completed", "terminated", "piloting"],
    "completed":          ["scaled", "completed"],
    "scaled":             ["scaled"],
    "terminated":         ["terminated"]
  }'::jsonb;
  is_allowed BOOLEAN;
BEGIN
  -- Allow INSERT unconditionally (no OLD row)
  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  -- If status unchanged, skip
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Check transition legality
  SELECT (allowed_transitions->OLD.status) ? NEW.status INTO is_allowed;

  IF is_allowed IS NULL OR is_allowed = FALSE THEN
    RAISE EXCEPTION 'Illegal status transition: % -> % (faculty_initiatives.id=%)',
      OLD.status, NEW.status, OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_fi_enforce_status_transition ON public.faculty_initiatives;
CREATE TRIGGER trg_fi_enforce_status_transition
  BEFORE UPDATE OF status ON public.faculty_initiatives
  FOR EACH ROW EXECUTE FUNCTION public.faculty_initiatives_enforce_status_transition();

-- ============================================================================
-- TRIGGER: Audit log auto-populate on state changes
-- ============================================================================
CREATE OR REPLACE FUNCTION public.faculty_initiatives_audit_trigger()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.faculty_initiative_audit_log
      (initiative_id, action, actor_id, before_state, after_state)
    VALUES
      (NEW.id, 'created', COALESCE(NEW.created_by, auth.uid()), NULL, to_jsonb(NEW));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Only log "interesting" changes (status / inventor / approver / is_active)
    IF OLD.status            IS DISTINCT FROM NEW.status
       OR OLD.inventor_id    IS DISTINCT FROM NEW.inventor_id
       OR OLD.current_approver_id IS DISTINCT FROM NEW.current_approver_id
       OR OLD.is_active      IS DISTINCT FROM NEW.is_active THEN
      INSERT INTO public.faculty_initiative_audit_log
        (initiative_id, action, actor_id, before_state, after_state)
      VALUES
        (NEW.id,
         CASE
           WHEN OLD.status       IS DISTINCT FROM NEW.status            THEN 'status_changed'
           WHEN OLD.inventor_id  IS DISTINCT FROM NEW.inventor_id       THEN 'transferred'
           WHEN OLD.current_approver_id IS DISTINCT FROM NEW.current_approver_id THEN 'approver_changed'
           WHEN OLD.is_active    = TRUE AND NEW.is_active = FALSE       THEN 'deleted'
           ELSE 'updated'
         END,
         COALESCE(NEW.updated_by, auth.uid()),
         to_jsonb(OLD),
         to_jsonb(NEW));
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_fi_audit ON public.faculty_initiatives;
CREATE TRIGGER trg_fi_audit
  AFTER INSERT OR UPDATE ON public.faculty_initiatives
  FOR EACH ROW EXECUTE FUNCTION public.faculty_initiatives_audit_trigger();

-- ============================================================================
-- RLS: Row-Level Security policies
-- ============================================================================

-- faculty_initiatives ---------------------------------------------------------
ALTER TABLE public.faculty_initiatives ENABLE ROW LEVEL SECURITY;

-- SELECT: inventor | original_inventor | approval_authority role | HOD (non-IP only) | super/admin
DROP POLICY IF EXISTS "faculty_initiatives_select" ON public.faculty_initiatives;
CREATE POLICY "faculty_initiatives_select" ON public.faculty_initiatives
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR inventor_id            = auth.uid()
    OR original_inventor_id   = auth.uid()
    -- Approval authority routing (role-key based)
    OR (approval_authority = 'director' AND get_current_user_role() = 'director')
    OR (approval_authority = 'dean'     AND get_current_user_role() = 'dean'
        AND role_has_institution_access(institution_id))
    OR (approval_authority = 'ip_cell'  AND user_has_permission('faculty_innovation.ip.view'))
    -- HOD auto-visibility for non-IP initiatives (A10)
    OR (category <> 'ip_bearing'
        AND get_current_user_role() = 'hod'
        AND role_has_institution_access(institution_id))
    -- Co-inventors who are JKKN users
    OR EXISTS (
      SELECT 1 FROM public.faculty_initiative_coinventors c
      WHERE c.initiative_id = faculty_initiatives.id
        AND c.coinventor_user_id = auth.uid()
    )
  );

-- INSERT: any user with submit permission, setting themselves as inventor
DROP POLICY IF EXISTS "faculty_initiatives_insert" ON public.faculty_initiatives;
CREATE POLICY "faculty_initiatives_insert" ON public.faculty_initiatives
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (user_has_permission('faculty_innovation.initiative.submit')
        AND (inventor_id = auth.uid() OR original_inventor_id = auth.uid()))
  );

-- UPDATE: inventor (own drafts / submitted pre-review) OR current approver OR Director
DROP POLICY IF EXISTS "faculty_initiatives_update" ON public.faculty_initiatives;
CREATE POLICY "faculty_initiatives_update" ON public.faculty_initiatives
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR inventor_id = auth.uid()
    OR current_approver_id = auth.uid()
    OR get_current_user_role() = 'director'
  );

-- No DELETE policy (soft-delete via is_active UPDATE)

-- faculty_initiative_coinventors ----------------------------------------------
ALTER TABLE public.faculty_initiative_coinventors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fi_coinventors_select" ON public.faculty_initiative_coinventors;
CREATE POLICY "fi_coinventors_select" ON public.faculty_initiative_coinventors
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR coinventor_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.faculty_initiatives fi
      WHERE fi.id = faculty_initiative_coinventors.initiative_id
        AND (fi.inventor_id = auth.uid()
             OR fi.original_inventor_id = auth.uid()
             OR fi.current_approver_id = auth.uid()
             OR get_current_user_role() = 'director')
    )
  );

DROP POLICY IF EXISTS "fi_coinventors_write" ON public.faculty_initiative_coinventors;
CREATE POLICY "fi_coinventors_write" ON public.faculty_initiative_coinventors
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.faculty_initiatives fi
      WHERE fi.id = faculty_initiative_coinventors.initiative_id
        AND fi.inventor_id = auth.uid()
    )
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.faculty_initiatives fi
      WHERE fi.id = faculty_initiative_coinventors.initiative_id
        AND fi.inventor_id = auth.uid()
    )
  );

-- faculty_initiative_audit_log ------------------------------------------------
ALTER TABLE public.faculty_initiative_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fi_audit_select" ON public.faculty_initiative_audit_log;
CREATE POLICY "fi_audit_select" ON public.faculty_initiative_audit_log
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM public.faculty_initiatives fi
      WHERE fi.id = faculty_initiative_audit_log.initiative_id
        AND (fi.inventor_id = auth.uid()
             OR fi.original_inventor_id = auth.uid()
             OR fi.current_approver_id = auth.uid()
             OR get_current_user_role() IN ('director', 'dean')
             OR user_has_permission('faculty_innovation.ip.view'))
    )
  );

-- INSERTs only via SECURITY DEFINER trigger (no app-level INSERT policy granted)
-- No UPDATE, no DELETE — immutable by design (A8)

-- approval_authority_config ---------------------------------------------------
ALTER TABLE public.approval_authority_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_cfg_select" ON public.approval_authority_config;
CREATE POLICY "approval_cfg_select" ON public.approval_authority_config
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "approval_cfg_write" ON public.approval_authority_config;
CREATE POLICY "approval_cfg_write" ON public.approval_authority_config
  FOR ALL USING (
    is_super_admin() OR get_current_user_role() = 'director'
  ) WITH CHECK (
    is_super_admin() OR get_current_user_role() = 'director'
  );

-- ============================================================================
-- Default approval authority escalation config (safe-by-default)
-- ============================================================================
INSERT INTO public.approval_authority_config
  (approval_authority, institution_id, escalate_after_days, fallback_role, is_active)
VALUES
  ('director', NULL, 10, 'super_admin', TRUE),
  ('dean',     NULL,  7, 'director',    TRUE),
  ('ip_cell',  NULL,  7, 'director',    TRUE),
  ('hod',      NULL,  5, 'dean',        TRUE)
ON CONFLICT (approval_authority, institution_id) DO NOTHING;

-- ============================================================================
-- END Week 1 migration
-- ============================================================================
