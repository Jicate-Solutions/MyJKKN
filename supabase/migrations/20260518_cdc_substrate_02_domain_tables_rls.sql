-- =====================================================================
-- CDC (Career Development Centre) — Substrate Migration 2 / 3
-- =====================================================================
-- Date: 2026-05-18
-- Prereq: 20260518_cdc_substrate_01_masters_enums_roles_policies.sql
--
-- Creates the 15 domain tables that hold CDC operational data, plus
-- RLS, indexes, and updated_at triggers. No data is seeded here — that
-- happens through the operational UI.
--
-- Table dependency graph (FK direction = "depends on"):
--
--   cdc_recruiters  ◄─ cdc_drives ◄─ cdc_drive_state_transitions
--                  ◄────────────── cdc_drive_eligibility
--                                ◄ cdc_drive_willingness
--                                ◄ cdc_drive_attendance
--                                ◄ cdc_placements ─► cdc_placement_snapshots
--                  ◄─ cdc_internships (built in M3 by ALTERing internship_*)
--
--   cdc_clubs ◄ cdc_club_memberships
--   cdc_mentor_pairings  (self-pair within learners_profiles)
--   cdc_idp_responses    (1 row per learner per academic year)
--   cdc_training_programmes ◄ cdc_training_enrollments
--   cdc_external_opportunities (Director bulletin board, no learner FK)
--
-- RLS strategy:
--   - Read: authenticated users can read most rows (service layer
--     filters by institution / role need-to-know).
--   - Write: cdc_staff for operational tables; cdc_head_or_super for
--     governance tables (recruiters master, external opportunities).
--   - The cdc_placements_public VIEW handles the tiered privacy of
--     Round 4.1 (peers see name+company only, no salary).
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. RECRUITERS (cdc_recruiters)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cdc_recruiters (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     text NOT NULL,
  legal_name               text,
  website                  text,
  industry_sector_id       uuid REFERENCES public.cdc_industry_sectors(id) ON DELETE SET NULL,
  hq_city                  text,
  hq_state                 text,
  hq_country               text DEFAULT 'India',
  primary_contact_name     text,
  primary_contact_email    text,
  primary_contact_phone    text,
  package_band_min_lpa     numeric(8,2),
  package_band_max_lpa     numeric(8,2),
  notes                    text,
  -- Internal-recruiter signals (Round 5.3 — JICATE Solutions etc.)
  is_internal              boolean NOT NULL DEFAULT false,
  internal_institution_id  uuid REFERENCES public.institutions(id) ON DELETE SET NULL,
  -- Operational signals
  operates_weekends        boolean NOT NULL DEFAULT false,
  is_active                boolean NOT NULL DEFAULT true,
  is_blacklisted           boolean NOT NULL DEFAULT false,
  blacklist_reason         text,
  -- Audit
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid REFERENCES public.profiles(id),
  updated_by               uuid REFERENCES public.profiles(id),
  CONSTRAINT cdc_recruiters_internal_consistency CHECK (
    (is_internal = false AND internal_institution_id IS NULL)
    OR (is_internal = true AND internal_institution_id IS NOT NULL)
  ),
  CONSTRAINT cdc_recruiters_package_band_sane CHECK (
    package_band_min_lpa IS NULL OR package_band_max_lpa IS NULL
    OR package_band_min_lpa <= package_band_max_lpa
  )
);

CREATE INDEX IF NOT EXISTS idx_cdc_recruiters_name              ON public.cdc_recruiters (lower(name));
CREATE INDEX IF NOT EXISTS idx_cdc_recruiters_industry_sector   ON public.cdc_recruiters (industry_sector_id);
CREATE INDEX IF NOT EXISTS idx_cdc_recruiters_is_internal       ON public.cdc_recruiters (is_internal) WHERE is_internal = true;
CREATE INDEX IF NOT EXISTS idx_cdc_recruiters_active            ON public.cdc_recruiters (is_active) WHERE is_active = true;


-- ---------------------------------------------------------------------
-- 2. DRIVES (cdc_drives)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cdc_drives (
  id                                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruiter_id                        uuid NOT NULL REFERENCES public.cdc_recruiters(id) ON DELETE RESTRICT,
  drive_type_id                       uuid NOT NULL REFERENCES public.cdc_drive_types(id) ON DELETE RESTRICT,
  -- Multi-institution: which colleges participate in this drive (Round 1.2).
  institutions                        uuid[] NOT NULL DEFAULT '{}',
  title                               text NOT NULL,
  description                         text,
  -- Lifecycle
  status                              public.cdc_drive_status NOT NULL DEFAULT 'draft',
  rounds_count                        integer NOT NULL DEFAULT 1 CHECK (rounds_count BETWEEN 1 AND 10),
  -- Scheduling
  drive_date                          date,
  drive_start_time                    time,
  drive_end_time                      time,
  willingness_window_open_at          timestamptz,
  willingness_window_close_at         timestamptz,
  -- Venue (FK to existing resource_management when known; free-text fallback)
  venue_label                         text,
  venue_reservation_id                uuid,  -- soft FK to resource_reservations (no constraint to avoid cross-module coupling at substrate stage)
  -- Approval workflow
  coordinator_approval_deadline_hours integer,  -- nullable; pulls from platform_policy default if null
  industry_mentor_id                  uuid REFERENCES public.industry_mentors(id) ON DELETE SET NULL,
  -- Compensation
  expected_package_lpa                numeric(8,2),
  job_role_title                      text,
  job_location                        text,
  -- Documents (mandatory ones are checked at state-transition gates per cdc.required_attachments_by_state policy)
  campus_circular_url                 text,
  poster_url                          text,
  promo_video_url                     text,
  selection_list_url                  text,
  event_photos_album_url              text,
  -- Audit
  cancelled_at                        timestamptz,
  cancelled_by                        uuid REFERENCES public.profiles(id),
  cancellation_reason                 text,
  created_at                          timestamptz NOT NULL DEFAULT now(),
  updated_at                          timestamptz NOT NULL DEFAULT now(),
  created_by                          uuid REFERENCES public.profiles(id),
  updated_by                          uuid REFERENCES public.profiles(id),
  CONSTRAINT cdc_drives_drive_times_sane CHECK (
    drive_start_time IS NULL OR drive_end_time IS NULL OR drive_start_time <= drive_end_time
  ),
  CONSTRAINT cdc_drives_willingness_window_sane CHECK (
    willingness_window_open_at IS NULL OR willingness_window_close_at IS NULL
    OR willingness_window_open_at <= willingness_window_close_at
  ),
  CONSTRAINT cdc_drives_cancelled_consistency CHECK (
    (status = 'cancelled' AND cancelled_at IS NOT NULL)
    OR (status <> 'cancelled' AND cancelled_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_cdc_drives_recruiter        ON public.cdc_drives (recruiter_id);
CREATE INDEX IF NOT EXISTS idx_cdc_drives_drive_type       ON public.cdc_drives (drive_type_id);
CREATE INDEX IF NOT EXISTS idx_cdc_drives_status           ON public.cdc_drives (status);
CREATE INDEX IF NOT EXISTS idx_cdc_drives_drive_date       ON public.cdc_drives (drive_date) WHERE drive_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cdc_drives_institutions     ON public.cdc_drives USING gin (institutions);


-- ---------------------------------------------------------------------
-- 3. DRIVE STATE TRANSITIONS (cdc_drive_state_transitions) — audit
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cdc_drive_state_transitions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id            uuid NOT NULL REFERENCES public.cdc_drives(id) ON DELETE CASCADE,
  from_status         public.cdc_drive_status,
  to_status           public.cdc_drive_status NOT NULL,
  transitioned_at     timestamptz NOT NULL DEFAULT now(),
  transitioned_by     uuid REFERENCES public.profiles(id),
  reason              text,
  metadata            jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_cdc_drive_state_transitions_drive ON public.cdc_drive_state_transitions (drive_id, transitioned_at DESC);


-- ---------------------------------------------------------------------
-- 4. DRIVE ELIGIBILITY (cdc_drive_eligibility) — one row per drive
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cdc_drive_eligibility (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id                 uuid NOT NULL REFERENCES public.cdc_drives(id) ON DELETE CASCADE,
  -- Structured eligibility per Round 1.3
  program_ids              uuid[] NOT NULL DEFAULT '{}',
  min_cgpa                 numeric(4,2),
  min_semester             integer,
  max_arrears              integer,
  allowed_genders          text[] DEFAULT '{}',
  program_year             integer,  -- e.g. 4 = final-year only
  passed_out_allowed       boolean NOT NULL DEFAULT false,
  additional_notes         text,
  -- Audit
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid REFERENCES public.profiles(id),
  updated_by               uuid REFERENCES public.profiles(id),
  CONSTRAINT cdc_drive_eligibility_one_per_drive UNIQUE (drive_id),
  CONSTRAINT cdc_drive_eligibility_min_cgpa_sane CHECK (min_cgpa IS NULL OR (min_cgpa >= 0 AND min_cgpa <= 10)),
  CONSTRAINT cdc_drive_eligibility_arrears_sane CHECK (max_arrears IS NULL OR max_arrears >= 0)
);

CREATE INDEX IF NOT EXISTS idx_cdc_drive_eligibility_programs ON public.cdc_drive_eligibility USING gin (program_ids);


-- ---------------------------------------------------------------------
-- 5. DRIVE WILLINGNESS (cdc_drive_willingness)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cdc_drive_willingness (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id                    uuid NOT NULL REFERENCES public.cdc_drives(id) ON DELETE CASCADE,
  learner_id                  uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  status                      public.cdc_willingness_status NOT NULL DEFAULT 'willing',
  -- Snapshot of eligibility at declaration time (Round 1.4)
  eligibility_snapshot        jsonb NOT NULL,
  -- Proxy: declared_by_user_id may differ from learner_id if coordinator submitted on behalf (Round 3.1)
  declared_by_user_id         uuid REFERENCES public.profiles(id),
  declared_at                 timestamptz NOT NULL DEFAULT now(),
  confirmation_required_by_at timestamptz,  -- learner has until this time to confirm a proxy declaration
  confirmed_at                timestamptz,
  -- Parent consent (Round 5 — required if learner age < cdc.parent_consent_required_under_age policy)
  parent_consent_url          text,
  parent_consent_uploaded_at  timestamptz,
  -- Withdrawal audit
  withdrawn_at                timestamptz,
  withdrawn_reason            text,
  -- Audit trail of status changes (append-only jsonb log)
  willingness_audit           jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Audit
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cdc_drive_willingness_one_per_drive_learner UNIQUE (drive_id, learner_id)
);

CREATE INDEX IF NOT EXISTS idx_cdc_drive_willingness_drive   ON public.cdc_drive_willingness (drive_id);
CREATE INDEX IF NOT EXISTS idx_cdc_drive_willingness_learner ON public.cdc_drive_willingness (learner_id);
CREATE INDEX IF NOT EXISTS idx_cdc_drive_willingness_status  ON public.cdc_drive_willingness (drive_id, status);


-- ---------------------------------------------------------------------
-- 6. DRIVE ATTENDANCE (cdc_drive_attendance) — per round, per learner
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cdc_drive_attendance (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id        uuid NOT NULL REFERENCES public.cdc_drives(id) ON DELETE CASCADE,
  learner_id      uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  round_no        integer NOT NULL CHECK (round_no BETWEEN 1 AND 10),
  round_type      public.cdc_drive_round_type,
  attended        boolean NOT NULL DEFAULT false,
  attended_at     timestamptz,
  no_show_reason  text,
  marked_by       uuid REFERENCES public.profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cdc_drive_attendance_unique UNIQUE (drive_id, learner_id, round_no)
);

CREATE INDEX IF NOT EXISTS idx_cdc_drive_attendance_drive_round ON public.cdc_drive_attendance (drive_id, round_no);
CREATE INDEX IF NOT EXISTS idx_cdc_drive_attendance_learner    ON public.cdc_drive_attendance (learner_id);


-- ---------------------------------------------------------------------
-- 7. PLACEMENTS (cdc_placements)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cdc_placements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id          uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE RESTRICT,
  drive_id            uuid REFERENCES public.cdc_drives(id) ON DELETE SET NULL,  -- nullable for walk-in drives without a drive record
  recruiter_id        uuid NOT NULL REFERENCES public.cdc_recruiters(id) ON DELETE RESTRICT,
  offer_type_id       uuid NOT NULL REFERENCES public.cdc_offer_types(id) ON DELETE RESTRICT,
  status              public.cdc_placement_status NOT NULL DEFAULT 'offered',
  -- Selection batches (Round 2.2)
  round_no            integer,
  batch_no            integer DEFAULT 1,
  -- Offer details
  package_lpa         numeric(8,2),
  package_inr_total   numeric(12,2),  -- raw INR for AICTE-format export
  job_role            text,
  job_location        text,
  is_remote           boolean NOT NULL DEFAULT false,
  joining_date        date,
  -- Documents
  offer_letter_url    text,
  acceptance_letter_url text,
  -- Lifecycle timestamps
  offered_at          timestamptz NOT NULL DEFAULT now(),
  accepted_at         timestamptz,
  declined_at         timestamptz,
  rescinded_at        timestamptz,
  decline_reason      text,
  rescind_reason      text,
  -- Walk-in flag (Round 3.2)
  is_walk_in          boolean NOT NULL DEFAULT false,
  -- Audit
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES public.profiles(id),
  updated_by          uuid REFERENCES public.profiles(id),
  CONSTRAINT cdc_placements_status_timestamps CHECK (
    (status = 'offered'   AND accepted_at IS NULL AND declined_at IS NULL AND rescinded_at IS NULL) OR
    (status = 'accepted'  AND accepted_at IS NOT NULL) OR
    (status = 'declined'  AND declined_at IS NOT NULL) OR
    (status = 'rescinded' AND rescinded_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_cdc_placements_learner    ON public.cdc_placements (learner_id);
CREATE INDEX IF NOT EXISTS idx_cdc_placements_drive      ON public.cdc_placements (drive_id);
CREATE INDEX IF NOT EXISTS idx_cdc_placements_recruiter  ON public.cdc_placements (recruiter_id);
CREATE INDEX IF NOT EXISTS idx_cdc_placements_status     ON public.cdc_placements (status);
CREATE INDEX IF NOT EXISTS idx_cdc_placements_accepted   ON public.cdc_placements (learner_id) WHERE status = 'accepted';

-- Partial unique: at most ONE accepted placement per learner at a time.
-- (NULL drive_id is allowed multiple times.)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cdc_placements_one_accepted_per_learner
  ON public.cdc_placements (learner_id) WHERE status = 'accepted';


-- ---------------------------------------------------------------------
-- 8. PLACEMENT SNAPSHOTS (cdc_placement_snapshots) — quarterly frozen state
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cdc_placement_snapshots (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_at         timestamptz NOT NULL DEFAULT now(),
  snapshot_period     text NOT NULL,  -- e.g. '2025-Q3', '2026-Q1'
  -- Frozen row image
  placement_id        uuid NOT NULL,
  learner_id          uuid NOT NULL,
  drive_id            uuid,
  recruiter_id        uuid NOT NULL,
  offer_type_id       uuid NOT NULL,
  status              public.cdc_placement_status NOT NULL,
  package_lpa         numeric(8,2),
  package_inr_total   numeric(12,2),
  job_role            text,
  job_location        text,
  offered_at          timestamptz,
  accepted_at         timestamptz,
  -- Period metadata
  notes               text,
  CONSTRAINT cdc_placement_snapshots_unique UNIQUE (placement_id, snapshot_period)
);

CREATE INDEX IF NOT EXISTS idx_cdc_placement_snapshots_period   ON public.cdc_placement_snapshots (snapshot_period);
CREATE INDEX IF NOT EXISTS idx_cdc_placement_snapshots_learner  ON public.cdc_placement_snapshots (learner_id);


-- ---------------------------------------------------------------------
-- 9. IDP RESPONSES (cdc_idp_responses) — first-year fresher development plan
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cdc_idp_responses (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id               uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  batch_id                 uuid REFERENCES public.batches(id) ON DELETE SET NULL,
  academic_year_label      text,  -- e.g. '2025-26' for cross-year reporting
  -- Captured fields (Native form replaces the Google Form per Round 4.2)
  interests                jsonb DEFAULT '[]'::jsonb,
  aspirations              jsonb DEFAULT '{}'::jsonb,   -- e.g. { "aspiring_companies": ["Wipro","Google"], "preferred_sectors": ["it_services"] }
  club_picks               text[] DEFAULT '{}',
  three_year_plan          jsonb DEFAULT '{}'::jsonb,
  skills_self_attribution  jsonb DEFAULT '[]'::jsonb,   -- e.g. [{"skill":"Python","level":"basic"}]
  free_text_notes          text,
  -- Migration source tracking
  source                   text NOT NULL DEFAULT 'native_form',  -- 'native_form' | 'google_form_migration'
  source_response_id       text,
  -- Audit
  submitted_at             timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  created_by               uuid REFERENCES public.profiles(id),
  updated_by               uuid REFERENCES public.profiles(id),
  CONSTRAINT cdc_idp_responses_one_per_year UNIQUE (learner_id, academic_year_label)
);

CREATE INDEX IF NOT EXISTS idx_cdc_idp_responses_learner ON public.cdc_idp_responses (learner_id);
CREATE INDEX IF NOT EXISTS idx_cdc_idp_responses_batch   ON public.cdc_idp_responses (batch_id);


-- ---------------------------------------------------------------------
-- 10. CLUBS (cdc_clubs)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cdc_clubs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  slug                text NOT NULL UNIQUE,
  description         text,
  club_type           text,  -- 'technical' | 'cultural' | 'sports' | 'innovation' | 'social'
  coordinator_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  institution_id      uuid REFERENCES public.institutions(id) ON DELETE SET NULL,  -- nullable for cross-institution clubs
  is_active           boolean NOT NULL DEFAULT true,
  formed_on           date,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  created_by          uuid REFERENCES public.profiles(id),
  updated_by          uuid REFERENCES public.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_cdc_clubs_institution ON public.cdc_clubs (institution_id);


-- ---------------------------------------------------------------------
-- 11. CLUB MEMBERSHIPS (cdc_club_memberships)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cdc_club_memberships (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL REFERENCES public.cdc_clubs(id) ON DELETE CASCADE,
  learner_id  uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'member',  -- 'member' | 'lead' | 'secretary' | 'coordinator'
  joined_at   timestamptz NOT NULL DEFAULT now(),
  left_at     timestamptz,
  is_active   boolean NOT NULL DEFAULT true,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cdc_club_memberships_unique UNIQUE (club_id, learner_id)
);

CREATE INDEX IF NOT EXISTS idx_cdc_club_memberships_learner ON public.cdc_club_memberships (learner_id);


-- ---------------------------------------------------------------------
-- 12. MENTOR PAIRINGS (cdc_mentor_pairings) — senior ↔ fresher
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cdc_mentor_pairings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mentor_learner_id uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  mentee_learner_id uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'active',  -- 'active' | 'paused' | 'concluded'
  paired_at       timestamptz NOT NULL DEFAULT now(),
  concluded_at    timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cdc_mentor_pairings_no_self CHECK (mentor_learner_id <> mentee_learner_id),
  CONSTRAINT cdc_mentor_pairings_unique  UNIQUE (mentor_learner_id, mentee_learner_id)
);

CREATE INDEX IF NOT EXISTS idx_cdc_mentor_pairings_mentee ON public.cdc_mentor_pairings (mentee_learner_id);
CREATE INDEX IF NOT EXISTS idx_cdc_mentor_pairings_active ON public.cdc_mentor_pairings (status) WHERE status = 'active';


-- ---------------------------------------------------------------------
-- 13. TRAINING PROGRAMMES (cdc_training_programmes) — Unnati / MRB / Springboard
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cdc_training_programmes (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL,
  training_type_id      uuid REFERENCES public.cdc_training_types(id) ON DELETE SET NULL,
  description           text,
  institution_id        uuid REFERENCES public.institutions(id) ON DELETE SET NULL,  -- nullable for cross-college
  total_hours           integer,
  start_date            date,
  end_date              date,
  status                text NOT NULL DEFAULT 'planned',  -- 'planned' | 'in_progress' | 'completed' | 'cancelled'
  external_provider     text,  -- e.g. 'Sakthi Auto', 'Infosys Springboard'
  certificate_template_url text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid REFERENCES public.profiles(id),
  updated_by            uuid REFERENCES public.profiles(id),
  CONSTRAINT cdc_training_programmes_dates_sane CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
);

CREATE INDEX IF NOT EXISTS idx_cdc_training_programmes_status  ON public.cdc_training_programmes (status);
CREATE INDEX IF NOT EXISTS idx_cdc_training_programmes_institution ON public.cdc_training_programmes (institution_id);


-- ---------------------------------------------------------------------
-- 14. TRAINING ENROLLMENTS (cdc_training_enrollments)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cdc_training_enrollments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  programme_id    uuid NOT NULL REFERENCES public.cdc_training_programmes(id) ON DELETE CASCADE,
  learner_id      uuid NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  enrolled_at     timestamptz NOT NULL DEFAULT now(),
  status          text NOT NULL DEFAULT 'enrolled',  -- 'enrolled' | 'completed' | 'dropped' | 'awaiting_certificate'
  attendance_pct  numeric(5,2),
  certificate_url text,
  certificate_issued_at timestamptz,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cdc_training_enrollments_unique UNIQUE (programme_id, learner_id),
  CONSTRAINT cdc_training_enrollments_attendance_sane CHECK (attendance_pct IS NULL OR (attendance_pct >= 0 AND attendance_pct <= 100))
);

CREATE INDEX IF NOT EXISTS idx_cdc_training_enrollments_learner ON public.cdc_training_enrollments (learner_id);


-- ---------------------------------------------------------------------
-- 15. EXTERNAL OPPORTUNITIES (cdc_external_opportunities) — Director bulletin
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cdc_external_opportunities (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title               text NOT NULL,
  source_organisation text,  -- e.g. 'ISRO', 'SBI Foundation', 'DRDO', 'Infosys'
  category            text,  -- 'fellowship' | 'internship' | 'scholarship' | 'job' | 'training' | 'competition'
  deadline_date       date,
  eligibility_text    text,
  apply_url           text,
  detail_url          text,
  stipend_text        text,
  is_active           boolean NOT NULL DEFAULT true,
  posted_at           timestamptz NOT NULL DEFAULT now(),
  posted_by           uuid REFERENCES public.profiles(id),
  archived_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cdc_external_opportunities_active   ON public.cdc_external_opportunities (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_cdc_external_opportunities_deadline ON public.cdc_external_opportunities (deadline_date) WHERE deadline_date IS NOT NULL;


-- ---------------------------------------------------------------------
-- updated_at triggers — attach the canonical helper to every new table.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN VALUES
    ('cdc_recruiters'),
    ('cdc_drives'),
    ('cdc_drive_eligibility'),
    ('cdc_drive_willingness'),
    ('cdc_drive_attendance'),
    ('cdc_placements'),
    ('cdc_idp_responses'),
    ('cdc_clubs'),
    ('cdc_club_memberships'),
    ('cdc_mentor_pairings'),
    ('cdc_training_programmes'),
    ('cdc_training_enrollments'),
    ('cdc_external_opportunities')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_touch ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER trg_%s_touch BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at()', t, t);
  END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- RLS — enable on every table.
-- Strategy:
--   - cdc_recruiters: read = all authenticated; write = cdc_head_or_super
--   - cdc_drives + state_transitions + eligibility: read = all authenticated; write = cdc_staff
--   - cdc_drive_willingness: read = self OR cdc_staff; write = self OR cdc_staff (proxy path)
--   - cdc_drive_attendance: read = self OR cdc_staff; write = cdc_staff
--   - cdc_placements: read = self full / others via cdc_placements_public view; write = cdc_staff
--   - cdc_placement_snapshots: read = cdc_staff (audit); write = service-role-only
--   - cdc_idp_responses: read = self OR cdc_staff; write = self OR cdc_staff
--   - cdc_clubs + memberships + mentor_pairings: read = all authenticated; write = cdc_staff
--   - cdc_training_*: read = all authenticated; write = cdc_staff
--   - cdc_external_opportunities: read = all authenticated; write = cdc_head_or_super
-- ---------------------------------------------------------------------

-- Enable RLS
ALTER TABLE public.cdc_recruiters              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_drives                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_drive_state_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_drive_eligibility       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_drive_willingness       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_drive_attendance        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_placements              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_placement_snapshots     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_idp_responses           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_clubs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_club_memberships        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_mentor_pairings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_training_programmes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_training_enrollments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cdc_external_opportunities  ENABLE ROW LEVEL SECURITY;

-- Self-access pattern (canonical, verified against migration
-- 20250120000004_add_students_view_own_related_entities_policies.sql):
--   profiles.id = auth.uid() AND profiles.learner_id = <learner_id_being_checked>
-- This bridges auth.uid() → profiles.id → profiles.learner_id → learners_profiles.id.

-- Recruiters
DROP POLICY IF EXISTS "cdc_recruiters_read"  ON public.cdc_recruiters;
DROP POLICY IF EXISTS "cdc_recruiters_write" ON public.cdc_recruiters;
CREATE POLICY "cdc_recruiters_read"  ON public.cdc_recruiters FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cdc_recruiters_write" ON public.cdc_recruiters FOR ALL    USING (public.is_cdc_head_or_super()) WITH CHECK (public.is_cdc_head_or_super());

-- Drives
DROP POLICY IF EXISTS "cdc_drives_read"  ON public.cdc_drives;
DROP POLICY IF EXISTS "cdc_drives_write" ON public.cdc_drives;
CREATE POLICY "cdc_drives_read"  ON public.cdc_drives FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cdc_drives_write" ON public.cdc_drives FOR ALL    USING (public.is_cdc_staff()) WITH CHECK (public.is_cdc_staff());

-- Drive state transitions (audit — write via service layer only)
DROP POLICY IF EXISTS "cdc_drive_state_transitions_read"  ON public.cdc_drive_state_transitions;
DROP POLICY IF EXISTS "cdc_drive_state_transitions_write" ON public.cdc_drive_state_transitions;
CREATE POLICY "cdc_drive_state_transitions_read"  ON public.cdc_drive_state_transitions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cdc_drive_state_transitions_write" ON public.cdc_drive_state_transitions FOR ALL    USING (public.is_cdc_staff()) WITH CHECK (public.is_cdc_staff());

-- Drive eligibility
DROP POLICY IF EXISTS "cdc_drive_eligibility_read"  ON public.cdc_drive_eligibility;
DROP POLICY IF EXISTS "cdc_drive_eligibility_write" ON public.cdc_drive_eligibility;
CREATE POLICY "cdc_drive_eligibility_read"  ON public.cdc_drive_eligibility FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cdc_drive_eligibility_write" ON public.cdc_drive_eligibility FOR ALL    USING (public.is_cdc_staff()) WITH CHECK (public.is_cdc_staff());

-- Drive willingness (self OR staff)
DROP POLICY IF EXISTS "cdc_drive_willingness_read"  ON public.cdc_drive_willingness;
DROP POLICY IF EXISTS "cdc_drive_willingness_write" ON public.cdc_drive_willingness;
CREATE POLICY "cdc_drive_willingness_read" ON public.cdc_drive_willingness FOR SELECT
  USING (
    public.is_cdc_staff()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.learner_id = learner_id)
  );
CREATE POLICY "cdc_drive_willingness_write" ON public.cdc_drive_willingness FOR ALL
  USING (
    public.is_cdc_staff()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.learner_id = learner_id)
  )
  WITH CHECK (
    public.is_cdc_staff()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.learner_id = learner_id)
  );

-- Drive attendance
DROP POLICY IF EXISTS "cdc_drive_attendance_read"  ON public.cdc_drive_attendance;
DROP POLICY IF EXISTS "cdc_drive_attendance_write" ON public.cdc_drive_attendance;
CREATE POLICY "cdc_drive_attendance_read" ON public.cdc_drive_attendance FOR SELECT
  USING (
    public.is_cdc_staff()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.learner_id = learner_id)
  );
CREATE POLICY "cdc_drive_attendance_write" ON public.cdc_drive_attendance FOR ALL USING (public.is_cdc_staff()) WITH CHECK (public.is_cdc_staff());

-- Placements (full read for self + staff; peers use the view below)
DROP POLICY IF EXISTS "cdc_placements_read"  ON public.cdc_placements;
DROP POLICY IF EXISTS "cdc_placements_write" ON public.cdc_placements;
CREATE POLICY "cdc_placements_read" ON public.cdc_placements FOR SELECT
  USING (
    public.is_cdc_staff()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.learner_id = learner_id)
  );
CREATE POLICY "cdc_placements_write" ON public.cdc_placements FOR ALL USING (public.is_cdc_staff()) WITH CHECK (public.is_cdc_staff());

-- Placement snapshots (audit only)
DROP POLICY IF EXISTS "cdc_placement_snapshots_read"  ON public.cdc_placement_snapshots;
DROP POLICY IF EXISTS "cdc_placement_snapshots_write" ON public.cdc_placement_snapshots;
CREATE POLICY "cdc_placement_snapshots_read"  ON public.cdc_placement_snapshots FOR SELECT USING (public.is_cdc_staff());
-- write disabled at policy level; service-role only

-- IDP responses (self OR staff)
DROP POLICY IF EXISTS "cdc_idp_responses_read"  ON public.cdc_idp_responses;
DROP POLICY IF EXISTS "cdc_idp_responses_write" ON public.cdc_idp_responses;
CREATE POLICY "cdc_idp_responses_read" ON public.cdc_idp_responses FOR SELECT
  USING (
    public.is_cdc_staff()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.learner_id = learner_id)
  );
CREATE POLICY "cdc_idp_responses_write" ON public.cdc_idp_responses FOR ALL
  USING (
    public.is_cdc_staff()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.learner_id = learner_id)
  )
  WITH CHECK (
    public.is_cdc_staff()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.learner_id = learner_id)
  );

-- Clubs / memberships / mentor pairings
DROP POLICY IF EXISTS "cdc_clubs_read"  ON public.cdc_clubs;
DROP POLICY IF EXISTS "cdc_clubs_write" ON public.cdc_clubs;
CREATE POLICY "cdc_clubs_read"  ON public.cdc_clubs FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cdc_clubs_write" ON public.cdc_clubs FOR ALL    USING (public.is_cdc_staff()) WITH CHECK (public.is_cdc_staff());

DROP POLICY IF EXISTS "cdc_club_memberships_read"  ON public.cdc_club_memberships;
DROP POLICY IF EXISTS "cdc_club_memberships_write" ON public.cdc_club_memberships;
CREATE POLICY "cdc_club_memberships_read"  ON public.cdc_club_memberships FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cdc_club_memberships_write" ON public.cdc_club_memberships FOR ALL    USING (public.is_cdc_staff()) WITH CHECK (public.is_cdc_staff());

DROP POLICY IF EXISTS "cdc_mentor_pairings_read"  ON public.cdc_mentor_pairings;
DROP POLICY IF EXISTS "cdc_mentor_pairings_write" ON public.cdc_mentor_pairings;
CREATE POLICY "cdc_mentor_pairings_read"  ON public.cdc_mentor_pairings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cdc_mentor_pairings_write" ON public.cdc_mentor_pairings FOR ALL    USING (public.is_cdc_staff()) WITH CHECK (public.is_cdc_staff());

-- Training programmes / enrollments
DROP POLICY IF EXISTS "cdc_training_programmes_read"  ON public.cdc_training_programmes;
DROP POLICY IF EXISTS "cdc_training_programmes_write" ON public.cdc_training_programmes;
CREATE POLICY "cdc_training_programmes_read"  ON public.cdc_training_programmes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cdc_training_programmes_write" ON public.cdc_training_programmes FOR ALL    USING (public.is_cdc_staff()) WITH CHECK (public.is_cdc_staff());

DROP POLICY IF EXISTS "cdc_training_enrollments_read"  ON public.cdc_training_enrollments;
DROP POLICY IF EXISTS "cdc_training_enrollments_write" ON public.cdc_training_enrollments;
CREATE POLICY "cdc_training_enrollments_read" ON public.cdc_training_enrollments FOR SELECT
  USING (
    public.is_cdc_staff()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.learner_id = learner_id)
  );
CREATE POLICY "cdc_training_enrollments_write" ON public.cdc_training_enrollments FOR ALL USING (public.is_cdc_staff()) WITH CHECK (public.is_cdc_staff());

-- External opportunities
DROP POLICY IF EXISTS "cdc_external_opportunities_read"  ON public.cdc_external_opportunities;
DROP POLICY IF EXISTS "cdc_external_opportunities_write" ON public.cdc_external_opportunities;
CREATE POLICY "cdc_external_opportunities_read"  ON public.cdc_external_opportunities FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "cdc_external_opportunities_write" ON public.cdc_external_opportunities FOR ALL    USING (public.is_cdc_head_or_super()) WITH CHECK (public.is_cdc_head_or_super());


-- ---------------------------------------------------------------------
-- PEER-VIEW for placement privacy (Round 4.1) — drops salary/equity/etc.
-- so peer learners can see name + company only.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.cdc_placements_public AS
SELECT
  p.id,
  p.learner_id,
  p.drive_id,
  p.recruiter_id,
  p.offer_type_id,
  p.status,
  p.round_no,
  p.batch_no,
  p.job_role,
  p.job_location,
  p.is_remote,
  p.is_walk_in,
  p.offered_at,
  p.accepted_at,
  -- omitted: package_lpa, package_inr_total, offer_letter_url, acceptance_letter_url,
  -- declined_at, rescinded_at, decline_reason, rescind_reason, notes
  p.created_at,
  p.updated_at
FROM public.cdc_placements p
WHERE p.status IN ('offered', 'accepted');

-- Grant select on the view so anyone authenticated can read it
GRANT SELECT ON public.cdc_placements_public TO authenticated;

COMMIT;
