-- Migration: Parent Portal — Phases A3–A5 feature tables
-- Created: 2026-06-18
-- Spec: docs/spec-Myjkkn-Parent-Portal.md (full pp_* schema)
--
-- All carry institutions_id (plural, BoS convention). RLS enabled as
-- defense-in-depth; the portal reads/writes via the service-role client with
-- app-layer assertLearnerAccess as the real authorization gate.

-- ============================ A3: Homework =============================
CREATE TABLE IF NOT EXISTS public.pp_homework (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id     UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  section_id          UUID,
  subject             VARCHAR(255),
  title               VARCHAR(255) NOT NULL,
  instructions        TEXT,
  attachment_urls     JSONB DEFAULT '[]',
  assigned_on         DATE DEFAULT CURRENT_DATE,
  due_date            DATE,
  max_marks           NUMERIC(6,2),
  requires_submission BOOLEAN DEFAULT true,
  created_by          UUID,
  is_active           BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pp_homework_submissions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id    UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  homework_id        UUID NOT NULL REFERENCES public.pp_homework(id) ON DELETE CASCADE,
  learner_profile_id UUID NOT NULL,
  submission_text    TEXT,
  attachment_urls    JSONB DEFAULT '[]',
  submitted_at       TIMESTAMPTZ,
  status             VARCHAR(20) DEFAULT 'pending'
                       CHECK (status IN ('pending','submitted','marked','returned','late')),
  marks              NUMERIC(6,2),
  feedback           TEXT,
  marked_by          UUID,
  marked_at          TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(homework_id, learner_profile_id)
);

-- ============================ A4: Achievements ========================
CREATE TABLE IF NOT EXISTS public.pp_achievements (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id    UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  learner_profile_id UUID NOT NULL,
  title              VARCHAR(255) NOT NULL,
  description        TEXT,
  category           VARCHAR(50),
  achieved_on        DATE,
  certificate_url    TEXT,
  created_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================ A4: Opinion Poll ========================
CREATE TABLE IF NOT EXISTS public.pp_polls (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  question        VARCHAR(500) NOT NULL,
  options         JSONB NOT NULL,                 -- [{id,label}]
  audience        VARCHAR(20) DEFAULT 'all',
  section_id      UUID,
  closes_at       TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT true,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pp_poll_responses (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id    UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  poll_id            UUID NOT NULL REFERENCES public.pp_polls(id) ON DELETE CASCADE,
  parent_account_id  UUID NOT NULL REFERENCES public.pp_parent_accounts(id) ON DELETE CASCADE,
  learner_profile_id UUID NOT NULL,
  option_id          VARCHAR(50) NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(poll_id, parent_account_id, learner_profile_id)
);

-- ============================ A4: Parent Concerns =====================
CREATE TABLE IF NOT EXISTS public.pp_concerns (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id    UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  parent_account_id  UUID NOT NULL REFERENCES public.pp_parent_accounts(id) ON DELETE CASCADE,
  learner_profile_id UUID NOT NULL,
  category           VARCHAR(50),
  subject            VARCHAR(255) NOT NULL,
  status             VARCHAR(20) DEFAULT 'open'
                       CHECK (status IN ('open','in_progress','resolved','closed')),
  priority           VARCHAR(10) DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  assigned_to        UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pp_concern_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concern_id      UUID NOT NULL REFERENCES public.pp_concerns(id) ON DELETE CASCADE,
  sender_type     VARCHAR(10) NOT NULL CHECK (sender_type IN ('parent','staff')),
  sender_id       UUID,
  message         TEXT NOT NULL,
  attachment_urls JSONB DEFAULT '[]',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================ A4: Events & Gallery ====================
CREATE TABLE IF NOT EXISTS public.pp_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  description     TEXT,
  event_date      DATE,
  start_time      TIME,
  end_time        TIME,
  venue           VARCHAR(255),
  banner_url      TEXT,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pp_gallery_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  event_id        UUID REFERENCES public.pp_events(id) ON DELETE SET NULL,
  title           VARCHAR(255),
  media_type      VARCHAR(10) CHECK (media_type IN ('image','video')),
  drive_file_id   VARCHAR(255),
  thumbnail_url   TEXT,
  url             TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================ A4: Spotlight ===========================
CREATE TABLE IF NOT EXISTS public.pp_spotlight (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  title           VARCHAR(255) NOT NULL,
  body            TEXT,
  media_url       TEXT,
  link_url        TEXT,
  sort_order      INT DEFAULT 0,
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================ A4: Wellness ============================
CREATE TABLE IF NOT EXISTS public.pp_wellness_records (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id    UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  learner_profile_id UUID NOT NULL,
  record_date        DATE DEFAULT CURRENT_DATE,
  height_cm          NUMERIC(5,1),
  weight_kg          NUMERIC(5,1),
  bmi                NUMERIC(5,2),
  vision_left        VARCHAR(20),
  vision_right       VARCHAR(20),
  remarks            TEXT,
  recorded_by        UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================ A4: Notifications log ===================
CREATE TABLE IF NOT EXISTS public.pp_notifications_log (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id    UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  parent_account_id  UUID REFERENCES public.pp_parent_accounts(id) ON DELETE CASCADE,
  learner_profile_id UUID,
  title              VARCHAR(255),
  body               TEXT,
  category           VARCHAR(50),
  channels           JSONB DEFAULT '[]',
  action_url         TEXT,
  is_read            BOOLEAN DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================ A5: Bus =================================
CREATE TABLE IF NOT EXISTS public.pp_bus_routes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  route_name      VARCHAR(255) NOT NULL,
  bus_number      VARCHAR(50),
  driver_name     VARCHAR(255),
  driver_contact  VARCHAR(15),
  stops           JSONB DEFAULT '[]',
  is_active       BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pp_bus_assignments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id    UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  learner_profile_id UUID NOT NULL,
  route_id           UUID NOT NULL REFERENCES public.pp_bus_routes(id) ON DELETE CASCADE,
  stop_name          VARCHAR(255),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(learner_profile_id, route_id)
);

-- ============================ A5: Gate Pass ===========================
CREATE TABLE IF NOT EXISTS public.pp_gate_passes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id    UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  learner_profile_id UUID NOT NULL,
  parent_account_id  UUID NOT NULL REFERENCES public.pp_parent_accounts(id) ON DELETE CASCADE,
  pass_type          VARCHAR(20) CHECK (pass_type IN ('early_leave','late_arrival','outpass','medical')),
  reason             TEXT NOT NULL,
  requested_date     DATE NOT NULL,
  requested_time     TIME,
  status             VARCHAR(20) DEFAULT 'requested'
                       CHECK (status IN ('requested','approved','rejected','used','expired')),
  qr_token           VARCHAR(100) UNIQUE,
  pickup_member_id   UUID,
  approved_by        UUID,
  approved_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================ A5: Leaves ==============================
CREATE TABLE IF NOT EXISTS public.pp_leave_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id    UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  learner_profile_id UUID NOT NULL,
  parent_account_id  UUID NOT NULL REFERENCES public.pp_parent_accounts(id) ON DELETE CASCADE,
  leave_type         VARCHAR(20) NOT NULL
                       CHECK (leave_type IN ('sick','casual','emergency','on_duty','planned_family')),
  from_date          DATE NOT NULL,
  to_date            DATE NOT NULL,
  reason             TEXT NOT NULL,
  attachment_urls    JSONB DEFAULT '[]',
  status             VARCHAR(20) DEFAULT 'requested'
                       CHECK (status IN ('requested','approved','rejected','cancelled')),
  approved_by        UUID,
  approved_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (to_date >= from_date)
);

-- ============================ A5: Pickup members ======================
CREATE TABLE IF NOT EXISTS public.pp_pickup_members (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id    UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  parent_account_id  UUID NOT NULL REFERENCES public.pp_parent_accounts(id) ON DELETE CASCADE,
  learner_profile_id UUID,
  name               VARCHAR(255) NOT NULL,
  relationship       VARCHAR(50),
  contact_no         VARCHAR(15),
  id_proof_url       TEXT,
  photo_url          TEXT,
  is_active          BOOLEAN DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================ A5: Feedback ============================
CREATE TABLE IF NOT EXISTS public.pp_feedback (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institutions_id   UUID NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  parent_account_id UUID NOT NULL REFERENCES public.pp_parent_accounts(id) ON DELETE CASCADE,
  type              VARCHAR(20) CHECK (type IN ('issue','improvement','appreciation','question','rating')),
  rating            INT CHECK (rating BETWEEN 1 AND 5),
  message           TEXT,
  status            VARCHAR(20) DEFAULT 'open',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================ Indexes =================================
CREATE INDEX IF NOT EXISTS idx_pp_homework_section     ON public.pp_homework(section_id, is_active);
CREATE INDEX IF NOT EXISTS idx_pp_submissions_learner  ON public.pp_homework_submissions(learner_profile_id);
CREATE INDEX IF NOT EXISTS idx_pp_achievements_learner ON public.pp_achievements(learner_profile_id);
CREATE INDEX IF NOT EXISTS idx_pp_poll_responses       ON public.pp_poll_responses(poll_id, parent_account_id);
CREATE INDEX IF NOT EXISTS idx_pp_concerns_parent      ON public.pp_concerns(parent_account_id, status);
CREATE INDEX IF NOT EXISTS idx_pp_concern_messages     ON public.pp_concern_messages(concern_id);
CREATE INDEX IF NOT EXISTS idx_pp_gallery_event        ON public.pp_gallery_items(event_id);
CREATE INDEX IF NOT EXISTS idx_pp_bus_assign_learner   ON public.pp_bus_assignments(learner_profile_id);
CREATE INDEX IF NOT EXISTS idx_pp_gatepass_learner     ON public.pp_gate_passes(learner_profile_id, status);
CREATE INDEX IF NOT EXISTS idx_pp_leaves_learner       ON public.pp_leave_requests(learner_profile_id, status);
CREATE INDEX IF NOT EXISTS idx_pp_pickup_parent        ON public.pp_pickup_members(parent_account_id);
CREATE INDEX IF NOT EXISTS idx_pp_notifications_parent ON public.pp_notifications_log(parent_account_id, is_read, created_at DESC);

-- ============================ updated_at triggers =====================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['pp_homework','pp_homework_submissions','pp_concerns','pp_gate_passes','pp_leave_requests']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I;', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();',
      t, t
    );
  END LOOP;
END $$;

-- ============================ RLS (defense-in-depth) ==================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pp_homework','pp_homework_submissions','pp_achievements','pp_polls','pp_poll_responses',
    'pp_concerns','pp_concern_messages','pp_events','pp_gallery_items','pp_spotlight',
    'pp_wellness_records','pp_notifications_log','pp_bus_routes','pp_bus_assignments',
    'pp_gate_passes','pp_leave_requests','pp_pickup_members','pp_feedback'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;
