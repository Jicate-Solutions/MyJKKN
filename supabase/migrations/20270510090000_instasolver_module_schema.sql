-- =============================================================================
-- InstaSolver module — 1 of 3: schema and identity helpers  (2027-05-10)
--
-- Ports the standalone InstaSolver (instasolver.jkkn.ac.in, Supabase project
-- xbodlspdmecprphtjflt) into MyJKKN as a module, per MYJKKN-MODULE-SPEC.md and
-- PRD decision D-9 (approved). It runs BESIDE the existing /instasolver chooser
-- (broken → Campus Walk, complaint → grievance), not in place of it.
--
-- What changed in the port, and why:
--   · Namespaced: every object is instasolver_*, so issues / categories /
--     notifications cannot collide with MyJKKN's own.
--   · No second user table. The standalone `profiles` mirror, its role enum,
--     `role_source`, `myjkkn_role` and the derivation script are gone: people are
--     MyJKKN profiles, and roles are read LIVE from profiles.role + user_roles.
--   · No `institutions` copy: institution_id is MyJKKN's institutions(id) UUID.
--   · No iqac_scope: a Principal sees their own institution
--     (principal role + profiles.institution_id), MyJKKN's existing model.
--   · Maintenance is not a role. Membership of an active maintenance team is
--     what makes someone maintenance (interview decision, 2026-09-30).
--   · CAO = the `cao` role; Super Admin = profiles.is_super_admin or the
--     super_admin role. Reporters = every active login except parents / guests.
--
-- The rules still live in Postgres. The UI's role checks are usability only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums. Severity is what the reporter observed; priority is what the
-- institution decided. Two vocabularies, never merged (spec §2).
-- `withdrawn` is new in the port: the 2026-09-26 review let a reporter withdraw
-- while pending, and nothing is ever hard-deleted.
-- -----------------------------------------------------------------------------
CREATE TYPE public.instasolver_issue_status AS ENUM
  ('pending', 'assigned', 'in_progress', 'completed', 'rejected', 'withdrawn');
CREATE TYPE public.instasolver_requirement_status AS ENUM
  ('pending', 'approved', 'rejected', 'fulfilled', 'withdrawn');
CREATE TYPE public.instasolver_severity AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE public.instasolver_priority AS ENUM ('urgent', 'high', 'medium', 'low');

-- -----------------------------------------------------------------------------
-- Categories — module-owned reference data. Deactivated, never deleted: last
-- year's issue still references its category and must still render.
-- -----------------------------------------------------------------------------
CREATE TABLE public.instasolver_categories (
  id          SERIAL PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('issue', 'requirement')),
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INT NOT NULL DEFAULT 100,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, name)
);
ALTER TABLE public.instasolver_categories ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.instasolver_categories IS
  'InstaSolver issue and requirement categories. Deactivate, never delete.';

-- -----------------------------------------------------------------------------
-- Maintenance teams. institution_id NULL = organisation-wide. category_id is
-- what lets the assigner offer "the team that covers this" by name.
-- -----------------------------------------------------------------------------
CREATE TABLE public.instasolver_maintenance_teams (
  id             SERIAL PRIMARY KEY,
  name           TEXT NOT NULL UNIQUE CHECK (length(btrim(name)) >= 2),
  description    TEXT,
  institution_id UUID REFERENCES public.institutions(id),
  category_id    INT  REFERENCES public.instasolver_categories(id) ON DELETE SET NULL,
  email          TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_by     UUID REFERENCES public.profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.instasolver_maintenance_teams ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_instasolver_teams_institution ON public.instasolver_maintenance_teams (institution_id);
CREATE INDEX idx_instasolver_teams_category    ON public.instasolver_maintenance_teams (category_id);

-- Membership is a link row, not a record of an event: removing one is how
-- membership is managed, so this is the one table with DELETE.
CREATE TABLE public.instasolver_team_members (
  team_id      INT  NOT NULL REFERENCES public.instasolver_maintenance_teams(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_team_lead BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);
ALTER TABLE public.instasolver_team_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_instasolver_team_members_user ON public.instasolver_team_members (user_id);
COMMENT ON COLUMN public.instasolver_team_members.is_team_lead IS
  'A team lead may reassign within their own team, never outside it.';

-- Per-prefix, per-IST-year counter behind ISS-YYYY-NNNNNN / REQ-YYYY-NNNNNN.
-- RLS on with no policies: deny-all; only instasolver_next_reference_no writes.
CREATE TABLE public.instasolver_reference_counters (
  prefix     TEXT NOT NULL,
  year       INT  NOT NULL,
  last_value BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (prefix, year)
);
ALTER TABLE public.instasolver_reference_counters ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- Issues — a facility fault.
-- -----------------------------------------------------------------------------
CREATE TABLE public.instasolver_issues (
  id                        BIGSERIAL PRIMARY KEY,
  reference_no              TEXT NOT NULL UNIQUE,
  reported_by               UUID NOT NULL REFERENCES public.profiles(id),
  institution_id            UUID NOT NULL REFERENCES public.institutions(id),
  category_id               INT  NOT NULL REFERENCES public.instasolver_categories(id),

  severity                  public.instasolver_severity NOT NULL,   -- reporter-set
  priority                  public.instasolver_priority,            -- CAO-set at triage
  status                    public.instasolver_issue_status NOT NULL DEFAULT 'pending',

  title                     TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 5 AND 160),
  details                   TEXT NOT NULL CHECK (length(btrim(details)) >= 10),
  location                  TEXT NOT NULL CHECK (length(btrim(location)) >= 2),
  suspected_reason          TEXT,
  resolution_suggestion     TEXT,
  contact_phone             TEXT,
  alternate_phone           TEXT,
  image_urls                TEXT[] NOT NULL DEFAULT '{}'
                              CHECK (cardinality(image_urls) <= 5),

  -- NULL means unassigned. Person, team, or both; team work is claimed.
  assigned_to               UUID REFERENCES public.profiles(id),
  assigned_team_id          INT  REFERENCES public.instasolver_maintenance_teams(id),
  assigned_at               TIMESTAMPTZ,
  assigned_by               UUID REFERENCES public.profiles(id),

  resolution_notes          TEXT,
  resolution_image_urls     TEXT[] NOT NULL DEFAULT '{}'
                              CHECK (cardinality(resolution_image_urls) <= 5),
  completed_at              TIMESTAMPTZ,       -- trigger-owned; no boolean beside it
  reopened_count            INT NOT NULL DEFAULT 0 CHECK (reopened_count >= 0),
  last_reopened_at          TIMESTAMPTZ,

  -- The reporter's judgement on the fix. Does not change status.
  resolution_confirmed_at   TIMESTAMPTZ,
  resolution_disputed_at    TIMESTAMPTZ,
  resolution_dispute_reason TEXT,

  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.instasolver_issues ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_instasolver_issues_reported_by      ON public.instasolver_issues (reported_by);
CREATE INDEX idx_instasolver_issues_assigned_to      ON public.instasolver_issues (assigned_to, status);
CREATE INDEX idx_instasolver_issues_assigned_team    ON public.instasolver_issues (assigned_team_id, status);
CREATE INDEX idx_instasolver_issues_status           ON public.instasolver_issues (status);
CREATE INDEX idx_instasolver_issues_institution      ON public.instasolver_issues (institution_id);
CREATE INDEX idx_instasolver_issues_category         ON public.instasolver_issues (category_id);
CREATE INDEX idx_instasolver_issues_created_at       ON public.instasolver_issues (created_at DESC);
CREATE INDEX idx_instasolver_issues_location_category ON public.instasolver_issues (lower(location), category_id);
CREATE INDEX idx_instasolver_issues_disputed         ON public.instasolver_issues (resolution_disputed_at DESC)
  WHERE resolution_disputed_at IS NOT NULL;

COMMENT ON TABLE public.instasolver_issues IS
  'InstaSolver facility faults. Status moves are validated per role by '
  'trg_instasolver_issues_guard; nothing is hard-deleted.';
COMMENT ON COLUMN public.instasolver_issues.priority IS
  'Set by the CAO at triage; required before the issue can be assigned.';

-- -----------------------------------------------------------------------------
-- Requirements — a procurement request.
-- -----------------------------------------------------------------------------
CREATE TABLE public.instasolver_requirements (
  id                BIGSERIAL PRIMARY KEY,
  reference_no      TEXT NOT NULL UNIQUE,
  requested_by      UUID NOT NULL REFERENCES public.profiles(id),
  institution_id    UUID NOT NULL REFERENCES public.institutions(id),
  category_id       INT  NOT NULL REFERENCES public.instasolver_categories(id),
  status            public.instasolver_requirement_status NOT NULL DEFAULT 'pending',

  item_requested    TEXT NOT NULL CHECK (length(btrim(item_requested)) BETWEEN 2 AND 160),
  specifications    TEXT,
  quantity_needed   INT CHECK (quantity_needed > 0),
  cost_estimate     NUMERIC(12,2) CHECK (cost_estimate >= 0),
  needed_by         DATE,
  last_ordered      DATE,
  usage_location    TEXT NOT NULL CHECK (length(btrim(usage_location)) >= 2),
  delivery_location TEXT NOT NULL CHECK (length(btrim(delivery_location)) >= 2),
  usage_details     TEXT,
  reason_needed     TEXT,
  preferred_vendor  TEXT,
  contact_person    TEXT,
  contact_phone     TEXT,
  alternate_phone   TEXT,
  image_urls        TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(image_urls) <= 5),

  reviewed_by       UUID REFERENCES public.profiles(id),
  reviewed_at       TIMESTAMPTZ,
  review_notes      TEXT,
  fulfilled_at      TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.instasolver_requirements ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_instasolver_requirements_requested_by ON public.instasolver_requirements (requested_by);
CREATE INDEX idx_instasolver_requirements_status       ON public.instasolver_requirements (status);
CREATE INDEX idx_instasolver_requirements_institution  ON public.instasolver_requirements (institution_id);
CREATE INDEX idx_instasolver_requirements_category     ON public.instasolver_requirements (category_id);
CREATE INDEX idx_instasolver_requirements_created_at   ON public.instasolver_requirements (created_at DESC);

-- -----------------------------------------------------------------------------
-- Audit trail — append-only, written ONLY by triggers.
-- -----------------------------------------------------------------------------
CREATE TABLE public.instasolver_activity_log (
  id          BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('issue', 'requirement')),
  entity_id   BIGINT NOT NULL,
  actor_id    UUID REFERENCES public.profiles(id),
  action      TEXT NOT NULL,
  from_value  TEXT,
  to_value    TEXT,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.instasolver_activity_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_instasolver_activity_entity ON public.instasolver_activity_log (entity_type, entity_id, created_at DESC);
CREATE INDEX idx_instasolver_activity_actor  ON public.instasolver_activity_log (actor_id);
COMMENT ON COLUMN public.instasolver_activity_log.action IS
  'created | edited | status_changed | assigned | claimed | reopened | prioritised '
  '| confirmed | disputed | note_added';

-- Notes on an item. is_internal = TRUE is hidden from reporters by RLS.
CREATE TABLE public.instasolver_admin_notes (
  id          BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('issue', 'requirement')),
  entity_id   BIGINT NOT NULL,
  author_id   UUID NOT NULL REFERENCES public.profiles(id),
  note        TEXT NOT NULL CHECK (length(btrim(note)) > 0),
  is_internal BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.instasolver_admin_notes ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_instasolver_notes_entity ON public.instasolver_admin_notes (entity_type, entity_id, created_at DESC);
CREATE INDEX idx_instasolver_notes_author ON public.instasolver_admin_notes (author_id);

-- The only way to know a notification was lost. Super Admin reads it.
CREATE TABLE public.instasolver_notification_failures (
  id          BIGSERIAL PRIMARY KEY,
  activity_id BIGINT,
  entity_type TEXT,
  entity_id   BIGINT,
  action      TEXT,
  sqlstate    TEXT,
  message     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.instasolver_notification_failures ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- Identity helpers.
--
-- SECURITY DEFINER and read profiles / user_roles directly, which is what keeps
-- every policy above them non-recursive (v1 locked everybody out with a policy
-- on a table that queried that table). These seven are the ONLY place the
-- module decides who someone is; every policy and trigger goes through them.
-- =============================================================================

-- Does the caller hold this role key, through the legacy profiles.role column
-- or a user_roles assignment? Inactive accounts hold nothing.
CREATE OR REPLACE FUNCTION public.instasolver_has_role(p_role_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.is_active
      AND (
        p.role = p_role_key
        OR EXISTS (
          SELECT 1
          FROM public.user_roles ur
          JOIN public.custom_roles cr ON cr.id = ur.role_id
          WHERE ur.user_id = p.id
            AND cr.role_key = p_role_key
            AND COALESCE(cr.is_active, TRUE)
        )
      )
  );
$fn$;

CREATE OR REPLACE FUNCTION public.instasolver_is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.is_active AND COALESCE(p.is_super_admin, FALSE)
  ) OR public.instasolver_has_role('super_admin');
$fn$;

-- Manager = triage authority: CAO or Super Admin. Nobody else assigns.
CREATE OR REPLACE FUNCTION public.instasolver_is_manager()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT public.instasolver_is_admin() OR public.instasolver_has_role('cao');
$fn$;

-- A Principal sees their own institution, read-only. No institution on the
-- profile → no rows, legitimately empty (acceptance #5).
CREATE OR REPLACE FUNCTION public.instasolver_principal_institutions()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT p.institution_id
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid())
    AND p.institution_id IS NOT NULL
    AND public.instasolver_has_role('principal');
$fn$;

CREATE OR REPLACE FUNCTION public.instasolver_my_team_ids()
RETURNS SETOF INT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT tm.team_id
  FROM public.instasolver_team_members tm
  JOIN public.instasolver_maintenance_teams t ON t.id = tm.team_id
  JOIN public.profiles p ON p.id = tm.user_id
  WHERE tm.user_id = (SELECT auth.uid()) AND t.is_active AND p.is_active;
$fn$;

-- Maintenance is team membership, not a role.
CREATE OR REPLACE FUNCTION public.instasolver_is_maintenance()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.instasolver_my_team_ids());
$fn$;

CREATE OR REPLACE FUNCTION public.instasolver_is_team_lead_of(p_team_id INT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.instasolver_team_members tm
    JOIN public.instasolver_maintenance_teams t ON t.id = tm.team_id
    WHERE tm.team_id = p_team_id AND tm.user_id = (SELECT auth.uid())
      AND tm.is_team_lead AND t.is_active
  );
$fn$;

-- Who may report: every active login except parents and guests (interview
-- decision 2026-09-30: team members, Senior Learners and learners — no parents).
CREATE OR REPLACE FUNCTION public.instasolver_can_report()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.is_active
      AND p.role NOT IN ('parent', 'guest', 'external_auditor_timeboxed')
  )
  AND NOT public.instasolver_has_role('parent')
  AND NOT public.instasolver_has_role('guest');
$fn$;

-- Profile ids of every active CAO — the triage recipients of the fan-out.
CREATE OR REPLACE FUNCTION public.instasolver_cao_user_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT p.id FROM public.profiles p
  WHERE p.is_active
    AND (
      p.role = 'cao'
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        JOIN public.custom_roles cr ON cr.id = ur.role_id
        WHERE ur.user_id = p.id AND cr.role_key = 'cao' AND COALESCE(cr.is_active, TRUE)
      )
    );
$fn$;

REVOKE ALL ON FUNCTION
  public.instasolver_has_role(TEXT),
  public.instasolver_is_admin(),
  public.instasolver_is_manager(),
  public.instasolver_principal_institutions(),
  public.instasolver_my_team_ids(),
  public.instasolver_is_maintenance(),
  public.instasolver_is_team_lead_of(INT),
  public.instasolver_can_report(),
  public.instasolver_cao_user_ids()
FROM PUBLIC, anon;
-- The same revokes, one function per statement, so the CI definer gate's
-- text scan sees each one (2026-10-03; no change in effect).
REVOKE EXECUTE ON FUNCTION public.instasolver_has_role(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.instasolver_cao_user_ids() FROM PUBLIC, anon;
-- ci:allow-secdef-authenticated self-scoped identity helpers: each reads
-- auth.uid() itself, takes no caller identity, and answers only about the
-- CALLER (their own role, their own teams, their own institution). They are
-- what every instasolver_* RLS policy is built on, so every signed-in user's
-- queries must be able to call them; they reveal nothing about anyone else.
-- instasolver_cao_user_ids is the exception and is revoked from authenticated
-- in 20270510090600.

GRANT EXECUTE ON FUNCTION
  public.instasolver_has_role(TEXT),
  public.instasolver_is_admin(),
  public.instasolver_is_manager(),
  public.instasolver_principal_institutions(),
  public.instasolver_my_team_ids(),
  public.instasolver_is_maintenance(),
  public.instasolver_is_team_lead_of(INT),
  public.instasolver_can_report()
TO authenticated;
-- instasolver_cao_user_ids is for the fan-out trigger only: no client grant.

-- -----------------------------------------------------------------------------
-- Grants. RLS decides which rows; grants decide which verbs. No DELETE except
-- team membership, and nothing at all for anon.
-- -----------------------------------------------------------------------------
REVOKE ALL ON
  public.instasolver_categories, public.instasolver_maintenance_teams,
  public.instasolver_team_members, public.instasolver_reference_counters,
  public.instasolver_issues, public.instasolver_requirements,
  public.instasolver_activity_log, public.instasolver_admin_notes,
  public.instasolver_notification_failures
FROM anon;

GRANT SELECT, INSERT, UPDATE ON
  public.instasolver_categories, public.instasolver_maintenance_teams,
  public.instasolver_team_members, public.instasolver_issues,
  public.instasolver_requirements
TO authenticated;
GRANT SELECT, INSERT ON public.instasolver_admin_notes TO authenticated;
GRANT SELECT ON public.instasolver_activity_log, public.instasolver_notification_failures TO authenticated;
GRANT DELETE ON public.instasolver_team_members TO authenticated;
REVOKE UPDATE, DELETE ON public.instasolver_activity_log, public.instasolver_admin_notes FROM authenticated;

GRANT USAGE, SELECT ON
  SEQUENCE public.instasolver_categories_id_seq,
           public.instasolver_maintenance_teams_id_seq,
           public.instasolver_issues_id_seq,
           public.instasolver_requirements_id_seq,
           public.instasolver_admin_notes_id_seq
TO authenticated;
