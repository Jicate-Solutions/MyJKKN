-- Migration: Hostel Vacate Workflow — schema foundation (PR-A)
-- Created: 2026-04-22
--
-- WHY: Real student request from Akash M (M.Pharm Y1, medical-grounds vacate
--      letter) surfaced that MyJKKN had no student-initiated vacate flow. PR-0
--      shipped the engine; this PR adds the vacate-specific tables that the
--      engine will drive. Subsequent PR-B adds student portal + warden queue
--      UI; PR-C adds SLA cron + notifications.
--
-- Design notes:
-- * approval_chain_run_id FK links each vacate_request to its engine run. The
--   engine is source-of-truth for stage progression; vacate_requests.status
--   is a denormalized mirror updated by HostelVacateRequestService on every
--   engine.advance() call (indexed queries + display convenience).
-- * resident_type is snapshotted on the request row at submit time so the
--   engine's criteria matcher works even if the resident's classification
--   changes later.
-- * Attribution: submitted_on_behalf_of_id handles the Akash edge case —
--   hostel_office or warden can file on behalf of an incapacitated student.
-- * Scheduled vacates: requested_vacate_date allows future dating; bed shows
--   as pending_vacate until the day.
--
-- NOTE on enum ALTER: ALTER TYPE ADD VALUE cannot run inside a transaction
-- block. Those two statements MUST be applied as separate Mgmt API calls
-- (or via Dashboard SQL editor) BEFORE this migration's main body runs.
-- The apply script handles the ordering.

-- ─── ENUM ADDITIONS (run these FIRST, separate statements) ──────────────────
-- ALTER TYPE vacate_reason_enum ADD VALUE IF NOT EXISTS 'medical';
-- ALTER TYPE allocation_status_enum ADD VALUE IF NOT EXISTS 'pending_vacate';

-- ─── NEW ENUMS ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vacate_request_status_enum') THEN
    CREATE TYPE vacate_request_status_enum AS ENUM (
      'draft',
      'pending_parent',
      'pending_warden',
      'pending_chief',
      'pending_dues',
      'approved',
      'completed',
      'rejected',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'vacate_document_type_enum') THEN
    CREATE TYPE vacate_document_type_enum AS ENUM (
      'medical_certificate',
      'id_proof',
      'parent_consent_scan',
      'clearance_receipt',
      'other'
    );
  END IF;
END$$;

-- ─── TABLE: hostel_vacate_requests ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hostel_vacate_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE RESTRICT,
  allocation_id UUID NOT NULL REFERENCES hostel_allocations(id) ON DELETE RESTRICT,
  resident_id UUID REFERENCES hostel_residents(id) ON DELETE RESTRICT,
  learner_id UUID REFERENCES profiles(id),
  -- Snapshot of resident classification at submit time (engine criteria input)
  resident_type hostel_resident_type_enum NOT NULL,

  -- Request content
  reason_type vacate_reason_enum NOT NULL,
  reason_text TEXT NOT NULL,
  requested_vacate_date DATE NOT NULL,
  is_permanent BOOLEAN NOT NULL DEFAULT true,
  is_scheduled BOOLEAN NOT NULL DEFAULT false,

  -- Medical-specific
  has_medical_grounds BOOLEAN NOT NULL DEFAULT false,
  medical_notes TEXT,

  -- State (mirror of engine state; see design notes above)
  status vacate_request_status_enum NOT NULL DEFAULT 'draft',

  -- Attribution
  submitted_by_id UUID NOT NULL REFERENCES auth.users(id),
  submitted_on_behalf_of_id UUID REFERENCES profiles(id),

  -- Engine link (nullable for draft; populated on submit)
  approval_chain_run_id UUID REFERENCES approval_chain_runs(id) ON DELETE SET NULL,

  -- Close-out
  completed_at TIMESTAMPTZ,
  actual_vacate_date DATE,
  rejected_reason TEXT,
  cancelled_reason TEXT,

  -- SLA tracking (cron reads these to escalate 72h idle)
  warden_last_action_at TIMESTAMPTZ,
  warden_idle_escalated_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT hvr_medical_requires_grounds_flag
    CHECK (reason_type != 'medical' OR has_medical_grounds = true),
  CONSTRAINT hvr_submit_requires_actor_or_delegate
    CHECK (submitted_by_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_hvr_institution ON hostel_vacate_requests(institution_id);
CREATE INDEX IF NOT EXISTS idx_hvr_allocation ON hostel_vacate_requests(allocation_id);
CREATE INDEX IF NOT EXISTS idx_hvr_resident ON hostel_vacate_requests(resident_id);
CREATE INDEX IF NOT EXISTS idx_hvr_learner ON hostel_vacate_requests(learner_id) WHERE learner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hvr_status_active ON hostel_vacate_requests(status)
  WHERE status NOT IN ('completed', 'rejected', 'cancelled');
CREATE INDEX IF NOT EXISTS idx_hvr_sla_warden_idle
  ON hostel_vacate_requests(warden_last_action_at)
  WHERE status = 'pending_warden' AND warden_idle_escalated_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_hvr_run ON hostel_vacate_requests(approval_chain_run_id)
  WHERE approval_chain_run_id IS NOT NULL;

-- ─── TABLE: hostel_vacate_documents ─────────────────────────────────────────
-- 1-to-many with hostel_vacate_requests. Medical cert + ID proof + misc.
CREATE TABLE IF NOT EXISTS hostel_vacate_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vacate_request_id UUID NOT NULL REFERENCES hostel_vacate_requests(id) ON DELETE CASCADE,
  document_type vacate_document_type_enum NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  mime_type TEXT NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  CONSTRAINT hvd_mime_check CHECK (mime_type IN (
    'application/pdf', 'image/jpeg', 'image/png'
  )),
  CONSTRAINT hvd_size_limit CHECK (file_size_bytes <= 5242880)  -- 5 MB
);

CREATE INDEX IF NOT EXISTS idx_hvd_request ON hostel_vacate_documents(vacate_request_id);
CREATE INDEX IF NOT EXISTS idx_hvd_type ON hostel_vacate_documents(document_type);

-- ─── TABLE: hostel_clearance_items ──────────────────────────────────────────
-- Dues checklist per vacate request. Seeded with 6 default items on submit.
-- Warden ticks each; engine stage 'dues_clearance' can't advance until all
-- is_required items have is_cleared=true.
CREATE TABLE IF NOT EXISTS hostel_clearance_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vacate_request_id UUID NOT NULL REFERENCES hostel_vacate_requests(id) ON DELETE CASCADE,
  item_key TEXT NOT NULL,            -- machine key, e.g. 'mess_dues'
  item_label TEXT NOT NULL,          -- human label, e.g. 'Mess dues'
  is_required BOOLEAN NOT NULL DEFAULT true,
  is_cleared BOOLEAN NOT NULL DEFAULT false,
  cleared_at TIMESTAMPTZ,
  cleared_by UUID REFERENCES auth.users(id),
  notes TEXT,
  amount_outstanding NUMERIC(12, 2),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT hci_unique_key_per_request UNIQUE (vacate_request_id, item_key),
  CONSTRAINT hci_cleared_implies_timestamp CHECK (
    is_cleared = false OR cleared_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_hci_request ON hostel_clearance_items(vacate_request_id);
CREATE INDEX IF NOT EXISTS idx_hci_required_uncleared
  ON hostel_clearance_items(vacate_request_id, is_required)
  WHERE is_cleared = false;

-- ─── TRIGGERS: updated_at ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_hostel_vacate_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_hvr_updated_at ON hostel_vacate_requests;
CREATE TRIGGER tr_hvr_updated_at
  BEFORE UPDATE ON hostel_vacate_requests
  FOR EACH ROW EXECUTE FUNCTION set_hostel_vacate_updated_at();

DROP TRIGGER IF EXISTS tr_hci_updated_at ON hostel_clearance_items;
CREATE TRIGGER tr_hci_updated_at
  BEFORE UPDATE ON hostel_clearance_items
  FOR EACH ROW EXECUTE FUNCTION set_hostel_vacate_updated_at();

-- ─── RLS: hostel_vacate_requests ────────────────────────────────────────────
ALTER TABLE hostel_vacate_requests ENABLE ROW LEVEL SECURITY;

-- SELECT: super_admin / admin OR view_all (warden/chief/hostel_office) within
-- institution OR view_own (learner sees their own submissions).
DROP POLICY IF EXISTS hvr_select_permission ON hostel_vacate_requests;
CREATE POLICY hvr_select_permission ON hostel_vacate_requests
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('campus_living.vacate_requests.view')
      AND role_has_institution_access(institution_id)
    )
    OR (
      user_has_permission('campus_living.vacate_requests.view_own')
      AND (submitted_by_id = auth.uid() OR learner_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS hvr_insert_permission ON hostel_vacate_requests;
CREATE POLICY hvr_insert_permission ON hostel_vacate_requests
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('campus_living.vacate_requests.submit')
      AND role_has_institution_access(institution_id)
    )
    OR (
      user_has_permission('campus_living.vacate_requests.submit_on_behalf')
      AND role_has_institution_access(institution_id)
      AND submitted_on_behalf_of_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS hvr_update_permission ON hostel_vacate_requests;
CREATE POLICY hvr_update_permission ON hostel_vacate_requests
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('campus_living.vacate_requests.view')
      AND role_has_institution_access(institution_id)
    )
    OR (
      -- Students can edit their own draft requests
      submitted_by_id = auth.uid() AND status = 'draft'
    )
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR (
      user_has_permission('campus_living.vacate_requests.view')
      AND role_has_institution_access(institution_id)
    )
    OR (
      submitted_by_id = auth.uid() AND status = 'draft'
    )
  );

DROP POLICY IF EXISTS hvr_delete_permission ON hostel_vacate_requests;
CREATE POLICY hvr_delete_permission ON hostel_vacate_requests
  FOR DELETE USING (
    is_super_admin() OR is_admin()
  );

-- ─── RLS: hostel_vacate_documents ───────────────────────────────────────────
-- Inherits effective permission via parent request (same institution + actors).
ALTER TABLE hostel_vacate_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hvd_select_permission ON hostel_vacate_documents;
CREATE POLICY hvd_select_permission ON hostel_vacate_documents
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM hostel_vacate_requests r
      WHERE r.id = hostel_vacate_documents.vacate_request_id
        AND (
          (user_has_permission('campus_living.vacate_requests.view')
            AND role_has_institution_access(r.institution_id))
          OR (user_has_permission('campus_living.vacate_requests.view_own')
              AND (r.submitted_by_id = auth.uid() OR r.learner_id = auth.uid()))
        )
    )
  );

DROP POLICY IF EXISTS hvd_insert_permission ON hostel_vacate_documents;
CREATE POLICY hvd_insert_permission ON hostel_vacate_documents
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM hostel_vacate_requests r
      WHERE r.id = hostel_vacate_documents.vacate_request_id
        AND (
          (user_has_permission('campus_living.vacate_requests.submit')
            AND r.submitted_by_id = auth.uid())
          OR (user_has_permission('campus_living.vacate_requests.view')
              AND role_has_institution_access(r.institution_id))
        )
    )
  );

DROP POLICY IF EXISTS hvd_delete_permission ON hostel_vacate_documents;
CREATE POLICY hvd_delete_permission ON hostel_vacate_documents
  FOR DELETE USING (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM hostel_vacate_requests r
      WHERE r.id = hostel_vacate_documents.vacate_request_id
        AND r.submitted_by_id = auth.uid()
        AND r.status = 'draft'
    )
  );

-- ─── RLS: hostel_clearance_items ────────────────────────────────────────────
ALTER TABLE hostel_clearance_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hci_select_permission ON hostel_clearance_items;
CREATE POLICY hci_select_permission ON hostel_clearance_items
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM hostel_vacate_requests r
      WHERE r.id = hostel_clearance_items.vacate_request_id
        AND (
          (user_has_permission('campus_living.vacate_requests.view')
            AND role_has_institution_access(r.institution_id))
          OR (user_has_permission('campus_living.vacate_requests.view_own')
              AND (r.submitted_by_id = auth.uid() OR r.learner_id = auth.uid()))
        )
    )
  );

DROP POLICY IF EXISTS hci_insert_permission ON hostel_clearance_items;
CREATE POLICY hci_insert_permission ON hostel_clearance_items
  FOR INSERT WITH CHECK (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM hostel_vacate_requests r
      WHERE r.id = hostel_clearance_items.vacate_request_id
        AND user_has_permission('campus_living.vacate_requests.view')
        AND role_has_institution_access(r.institution_id)
    )
  );

DROP POLICY IF EXISTS hci_update_permission ON hostel_clearance_items;
CREATE POLICY hci_update_permission ON hostel_clearance_items
  FOR UPDATE USING (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM hostel_vacate_requests r
      WHERE r.id = hostel_clearance_items.vacate_request_id
        AND user_has_permission('campus_living.vacate_requests.mark_clearance')
        AND role_has_institution_access(r.institution_id)
    )
  ) WITH CHECK (
    is_super_admin() OR is_admin()
    OR EXISTS (
      SELECT 1 FROM hostel_vacate_requests r
      WHERE r.id = hostel_clearance_items.vacate_request_id
        AND user_has_permission('campus_living.vacate_requests.mark_clearance')
        AND role_has_institution_access(r.institution_id)
    )
  );

-- ─── COMMENTS ───────────────────────────────────────────────────────────────
COMMENT ON TABLE hostel_vacate_requests IS
  'Student-initiated (or admin-delegated) hostel vacate requests. Driven by approval_chain_runs via approval_chain_run_id. resident_type is snapshotted for engine criteria matching; status is a denormalized mirror of engine state.';

COMMENT ON COLUMN hostel_vacate_requests.resident_type IS
  'Snapshot at submit time. Engine rule selection uses this as context: {resident_type: ''learner''} matches the 4-stage Learner rule; any other value matches the 3-stage Non-Learner rule (skips parent consent).';

COMMENT ON COLUMN hostel_vacate_requests.submitted_on_behalf_of_id IS
  'Non-null when hostel_office or warden files the request for an incapacitated student (Akash-case). When null, submitted_by_id is the actor and the subject.';

COMMENT ON COLUMN hostel_vacate_requests.status IS
  'Denormalized mirror of engine state. Updated by HostelVacateRequestService after every ApprovalChainService.advance(). Do not write directly from UI.';

COMMENT ON TABLE hostel_vacate_documents IS
  '1-to-many with hostel_vacate_requests. MIME + size constrained via CHECK (PDF / JPG / PNG, max 5 MB). Medical cert required when reason_type=medical (enforced at service layer, not CHECK, since cert row is created after request).';

COMMENT ON TABLE hostel_clearance_items IS
  'Dues checklist per request. Seeded by service with 6 default items on submit (mess_dues, library_dues, hostel_damage, deposit_refund, key_return, id_card_return). Engine''s dues_clearance stage can''t advance until all is_required items have is_cleared=true (enforced at service layer).';
