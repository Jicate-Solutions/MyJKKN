-- ============================================================
-- Migration: Create Service Request Tables
-- Created: 2026-02-25
-- Tables: service_types, service_type_fields,
--         service_request_approval_steps, service_requests,
--         service_request_approvals, service_request_timeline,
--         service_request_attachments
-- ============================================================

-- ---------- ENUM types ----------

DO $$ BEGIN
  CREATE TYPE service_request_status AS ENUM (
    'draft', 'submitted', 'in_review', 'approved',
    'rejected', 'returned', 'fulfilled', 'closed', 'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE service_field_type AS ENUM (
    'text', 'select', 'date', 'number', 'boolean', 'textarea', 'file'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE service_request_priority AS ENUM (
    'low', 'normal', 'high', 'urgent'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE service_approval_action AS ENUM (
    'pending', 'approved', 'rejected', 'returned'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE service_timeline_event_type AS ENUM (
    'status_change', 'comment', 'internal_note',
    'edit', 'attachment_added', 'system'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE approval_workflow_type AS ENUM (
    'sequential', 'parallel'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- 1. service_types ----------

CREATE TABLE IF NOT EXISTS service_types (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                      TEXT NOT NULL UNIQUE,
  name                      TEXT NOT NULL,
  description               TEXT,
  icon                      TEXT NOT NULL DEFAULT 'FileText',
  color                     TEXT NOT NULL DEFAULT '#3B82F6',
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  is_system_default         BOOLEAN NOT NULL DEFAULT false,
  allowed_roles             TEXT[]  NOT NULL DEFAULT '{}',
  max_active_requests       INTEGER NOT NULL DEFAULT 1,
  auto_fulfill_on_approval  BOOLEAN NOT NULL DEFAULT false,
  enable_priority           BOOLEAN NOT NULL DEFAULT false,
  enable_attachments        BOOLEAN NOT NULL DEFAULT false,
  enable_email_notifications BOOLEAN NOT NULL DEFAULT true,
  approval_workflow_type    approval_workflow_type NOT NULL DEFAULT 'sequential',
  attachment_config         JSONB,
  validity_period_days      INTEGER,
  created_by                UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 2. service_type_fields ----------

CREATE TABLE IF NOT EXISTS service_type_fields (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type_id  UUID NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
  field_key        TEXT NOT NULL,
  field_label      TEXT NOT NULL,
  field_type       service_field_type NOT NULL DEFAULT 'text',
  field_options    JSONB,
  is_required      BOOLEAN NOT NULL DEFAULT false,
  display_order    INTEGER NOT NULL DEFAULT 0,
  placeholder      TEXT,
  help_text        TEXT,
  default_value    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (service_type_id, field_key)
);

-- ---------- 3. service_request_approval_steps ----------

CREATE TABLE IF NOT EXISTS service_request_approval_steps (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type_id              UUID NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
  step_order                   INTEGER NOT NULL,
  step_name                    TEXT NOT NULL,
  approver_role                TEXT NOT NULL,
  is_required                  BOOLEAN NOT NULL DEFAULT true,
  on_return_restart_from_step  INTEGER,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (service_type_id, step_order)
);

-- ---------- 4. service_requests ----------

CREATE SEQUENCE IF NOT EXISTS service_request_number_seq START WITH 1000;

CREATE TABLE IF NOT EXISTS service_requests (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number       TEXT NOT NULL UNIQUE DEFAULT ('SR-' || nextval('service_request_number_seq')::TEXT),
  service_type_id      UUID NOT NULL REFERENCES service_types(id) ON DELETE RESTRICT,
  requester_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  institution_id       UUID REFERENCES institutions(id) ON DELETE SET NULL,
  status               service_request_status NOT NULL DEFAULT 'draft',
  priority             service_request_priority,
  current_approval_step INTEGER NOT NULL DEFAULT 0,
  form_data            JSONB NOT NULL DEFAULT '{}',
  requester_context    JSONB NOT NULL DEFAULT '{}',
  submitted_at         TIMESTAMPTZ,
  approved_at          TIMESTAMPTZ,
  fulfilled_at         TIMESTAMPTZ,
  closed_at            TIMESTAMPTZ,
  cancelled_at         TIMESTAMPTZ,
  validity_expires_at  TIMESTAMPTZ,
  cancellation_reason  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by           UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ---------- 5. service_request_approvals ----------

CREATE TABLE IF NOT EXISTS service_request_approvals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id  UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  approval_step_id    UUID REFERENCES service_request_approval_steps(id) ON DELETE SET NULL,
  step_order          INTEGER NOT NULL,
  approver_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action              service_approval_action NOT NULL DEFAULT 'pending',
  comments            TEXT,
  acted_at            TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 6. service_request_timeline ----------

CREATE TABLE IF NOT EXISTS service_request_timeline (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id  UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  actor_id            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type          service_timeline_event_type NOT NULL DEFAULT 'system',
  old_status          service_request_status,
  new_status          service_request_status,
  content             TEXT,
  is_internal         BOOLEAN NOT NULL DEFAULT false,
  metadata            JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- 7. service_request_attachments ----------

CREATE TABLE IF NOT EXISTS service_request_attachments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_request_id  UUID NOT NULL REFERENCES service_requests(id) ON DELETE CASCADE,
  file_name           TEXT NOT NULL,
  file_url            TEXT NOT NULL,
  file_size           BIGINT,
  file_type           TEXT,
  uploaded_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Indexes ----------

CREATE INDEX IF NOT EXISTS idx_service_types_slug       ON service_types(slug);
CREATE INDEX IF NOT EXISTS idx_service_types_is_active  ON service_types(is_active);

CREATE INDEX IF NOT EXISTS idx_stf_service_type_id      ON service_type_fields(service_type_id);
CREATE INDEX IF NOT EXISTS idx_sras_service_type_id     ON service_request_approval_steps(service_type_id);

CREATE INDEX IF NOT EXISTS idx_sr_requester_id          ON service_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_sr_service_type_id       ON service_requests(service_type_id);
CREATE INDEX IF NOT EXISTS idx_sr_institution_id        ON service_requests(institution_id);
CREATE INDEX IF NOT EXISTS idx_sr_status                ON service_requests(status);
CREATE INDEX IF NOT EXISTS idx_sr_submitted_at          ON service_requests(submitted_at DESC);

CREATE INDEX IF NOT EXISTS idx_sra_request_id           ON service_request_approvals(service_request_id);
CREATE INDEX IF NOT EXISTS idx_sra_approver_id          ON service_request_approvals(approver_id);

CREATE INDEX IF NOT EXISTS idx_srt_request_id           ON service_request_timeline(service_request_id);
CREATE INDEX IF NOT EXISTS idx_srt_created_at           ON service_request_timeline(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sratt_request_id         ON service_request_attachments(service_request_id);

-- ---------- updated_at trigger ----------

CREATE OR REPLACE FUNCTION update_service_request_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_types_updated_at    ON service_types;
DROP TRIGGER IF EXISTS trg_service_requests_updated_at ON service_requests;

CREATE TRIGGER trg_service_types_updated_at
  BEFORE UPDATE ON service_types
  FOR EACH ROW EXECUTE FUNCTION update_service_request_updated_at();

CREATE TRIGGER trg_service_requests_updated_at
  BEFORE UPDATE ON service_requests
  FOR EACH ROW EXECUTE FUNCTION update_service_request_updated_at();

-- ---------- Row-Level Security ----------

ALTER TABLE service_types                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_type_fields             ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_request_approval_steps  ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requests                ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_request_approvals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_request_timeline        ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_request_attachments     ENABLE ROW LEVEL SECURITY;

-- service_types: anyone authenticated can read active types
CREATE POLICY "Authenticated users can view active service types"
  ON service_types FOR SELECT
  TO authenticated
  USING (is_active = true);

-- service_type_fields: readable if the parent type is active
CREATE POLICY "Authenticated users can view service type fields"
  ON service_type_fields FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM service_types st
      WHERE st.id = service_type_id AND st.is_active = true
    )
  );

-- service_request_approval_steps: same as fields
CREATE POLICY "Authenticated users can view approval steps"
  ON service_request_approval_steps FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM service_types st
      WHERE st.id = service_type_id AND st.is_active = true
    )
  );

-- service_requests: users see their own; admins/staff see all
CREATE POLICY "Users can view their own service requests"
  ON service_requests FOR SELECT
  TO authenticated
  USING (requester_id = auth.uid());

CREATE POLICY "Users can create service requests"
  ON service_requests FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "Users can update their own draft requests"
  ON service_requests FOR UPDATE
  TO authenticated
  USING (requester_id = auth.uid() AND status = 'draft');

-- service_request_approvals: requester can read their own; approver can see theirs
CREATE POLICY "Users can view approvals for their requests"
  ON service_request_approvals FOR SELECT
  TO authenticated
  USING (
    approver_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM service_requests sr
      WHERE sr.id = service_request_id AND sr.requester_id = auth.uid()
    )
  );

-- timeline: public entries visible to requester; internal only to staff (handled in app layer)
CREATE POLICY "Users can view timeline for their requests"
  ON service_request_timeline FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM service_requests sr
      WHERE sr.id = service_request_id
        AND (sr.requester_id = auth.uid() OR actor_id = auth.uid())
    )
  );

-- attachments: requester can see their own
CREATE POLICY "Users can view attachments for their requests"
  ON service_request_attachments FOR SELECT
  TO authenticated
  USING (
    uploaded_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM service_requests sr
      WHERE sr.id = service_request_id AND sr.requester_id = auth.uid()
    )
  );
