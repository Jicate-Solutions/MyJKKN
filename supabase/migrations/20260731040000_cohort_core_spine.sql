-- ============================================================================
-- COHORT CORE — shared cohort spine (Phase 1)
-- Created: 2026-07-05  (plan: docs/cohort-core/PLAN.md, PHASE 1.1)
-- ============================================================================
-- A thin, domain-agnostic engine that every "cohort-shaped" program registers
-- into: SF100 (startup), Foundations, CDC training, Trainer development. Each
-- domain keeps its own extension tables and points its container row at one of
-- these three tables.
--
--   • cohorts             — the container (kind + institution + lifecycle window)
--   • cohort_memberships  — who is in a cohort (team | student | learner | staff)
--   • cohort_status_events— append-only audit that powers the generic lifecycle
--                           rules (nudge→pause, escalate-after-3-business-days,
--                           30-day grace period). See lib/services/cohort-core/
--                           lifecycle.ts for the pure decision functions.
--
-- LIFECYCLE STATUS MODELS (enforced by CHECK, per repo convention — NOT pg ENUM):
--   cohort:     draft → enrolling → active → completed → archived
--   membership: invited → enrolled → active → graduated | removed | paused
--
-- SECURITY / MULTI-TENANCY:
--   • institution_id on public.cohorts is NOT NULL by design. The generic tenant
--     guard role_has_institution_access(NULL) returns TRUE, so a nullable tenant
--     column paired with that guard would be a cross-tenant PII hole. Keeping it
--     NOT NULL closes that gotcha at the schema level.
--   • RLS on all three tables uses the repo-canonical dynamic-permission pattern
--     (is_super_admin() OR is_admin() first, then user_has_permission + scope).
--     memberships/events have no institution_id column → they scope through the
--     parent cohort via EXISTS. SECDEF calls are wrapped as (select fn(...)) so
--     the planner InitPlan-caches them once per statement (per-row tax fix).
--   • DELETE is gated on cohort.manage (delete/removal is a manage-level power),
--     keeping every RLS-referenced key inside the 4 keys registered in
--     lib/constants/permissions.ts (cohort.view/create/edit/manage).
-- ============================================================================

-- ── 1. cohorts — the container ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cohorts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL
                    CHECK (kind IN ('sf100','foundations','cdc','trainer')),
  name            text NOT NULL,
  institution_id  uuid NOT NULL REFERENCES public.institutions(id) ON DELETE CASCADE,
  owner_id        uuid,
  academic_year   text,
  opens_at        timestamptz,
  closes_at       timestamptz,
  hard_deadline   timestamptz,
  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','enrolling','active','completed','archived')),
  config          jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived_at     timestamptz,
  archived_by     uuid,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cohorts_institution_id
  ON public.cohorts (institution_id);
CREATE INDEX IF NOT EXISTS idx_cohorts_kind_status
  ON public.cohorts (kind, status);

-- ── 2. cohort_memberships — who is in a cohort ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.cohort_memberships (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id    uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE CASCADE,
  member_type  text NOT NULL
                 CHECK (member_type IN ('team','student','learner','staff')),
  member_ref   uuid NOT NULL,
  status       text NOT NULL DEFAULT 'invited'
                 CHECK (status IN ('invited','enrolled','active','graduated','removed','paused')),
  role         text,
  joined_at    timestamptz,
  joined_by    uuid,
  config       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cohort_memberships_cohort_member_uidx UNIQUE (cohort_id, member_type, member_ref)
);

CREATE INDEX IF NOT EXISTS idx_cohort_memberships_cohort_id
  ON public.cohort_memberships (cohort_id);
CREATE INDEX IF NOT EXISTS idx_cohort_memberships_member
  ON public.cohort_memberships (member_type, member_ref);

-- ── 3. cohort_status_events — append-only lifecycle audit ─────────────────────
-- cohort_id and membership_id are both nullable: an event can target the cohort
-- (e.g. cohort opened/closed) OR a membership (e.g. nudge/pause/escalation).
CREATE TABLE IF NOT EXISTS public.cohort_status_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id      uuid REFERENCES public.cohorts(id) ON DELETE CASCADE,
  membership_id  uuid REFERENCES public.cohort_memberships(id) ON DELETE CASCADE,
  event_type     text NOT NULL,
  from_status    text,
  to_status      text,
  actor_id       uuid,
  reason         text,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- An event must target the cohort, a membership, or both — never neither.
  CONSTRAINT cohort_status_events_target_chk
    CHECK (cohort_id IS NOT NULL OR membership_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_cohort_status_events_cohort_id
  ON public.cohort_status_events (cohort_id);
CREATE INDEX IF NOT EXISTS idx_cohort_status_events_membership_id
  ON public.cohort_status_events (membership_id);

-- ── 4. updated_at triggers (reuse the repo-canonical fn) ──────────────────────
DROP TRIGGER IF EXISTS trg_cohorts_updated_at ON public.cohorts;
CREATE TRIGGER trg_cohorts_updated_at
  BEFORE UPDATE ON public.cohorts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_cohort_memberships_updated_at ON public.cohort_memberships;
CREATE TRIGGER trg_cohort_memberships_updated_at
  BEFORE UPDATE ON public.cohort_memberships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- (cohort_status_events is append-only: no updated_at column, no trigger.)

-- ── 5. RLS — cohorts (institution-scoped) ─────────────────────────────────────
ALTER TABLE public.cohorts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cohorts_select_permission ON public.cohorts;
CREATE POLICY cohorts_select_permission ON public.cohorts
  FOR SELECT USING (
    (select is_super_admin())
    OR (select is_admin())
    OR (
      (select user_has_permission('cohort.view'::text))
      AND (select role_has_institution_access(institution_id))
    )
  );

DROP POLICY IF EXISTS cohorts_insert_permission ON public.cohorts;
CREATE POLICY cohorts_insert_permission ON public.cohorts
  FOR INSERT WITH CHECK (
    (select is_super_admin())
    OR (select is_admin())
    OR (
      (select user_has_permission('cohort.create'::text))
      AND (select role_has_institution_access(institution_id))
    )
  );

DROP POLICY IF EXISTS cohorts_update_permission ON public.cohorts;
CREATE POLICY cohorts_update_permission ON public.cohorts
  FOR UPDATE USING (
    (select is_super_admin())
    OR (select is_admin())
    OR (
      (select user_has_permission('cohort.edit'::text))
      AND (select role_has_institution_access(institution_id))
    )
  );

DROP POLICY IF EXISTS cohorts_delete_permission ON public.cohorts;
CREATE POLICY cohorts_delete_permission ON public.cohorts
  FOR DELETE USING (
    (select is_super_admin())
    OR (select is_admin())
    OR (
      (select user_has_permission('cohort.manage'::text))
      AND (select role_has_institution_access(institution_id))
    )
  );

-- ── 6. RLS — cohort_memberships (scope through parent cohort) ──────────────────
ALTER TABLE public.cohort_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cohort_memberships_select_permission ON public.cohort_memberships;
CREATE POLICY cohort_memberships_select_permission ON public.cohort_memberships
  FOR SELECT USING (
    (select is_super_admin())
    OR (select is_admin())
    OR (
      (select user_has_permission('cohort.view'::text))
      AND EXISTS (
        SELECT 1 FROM public.cohorts c
        WHERE c.id = cohort_memberships.cohort_id
          AND role_has_institution_access(c.institution_id)
      )
    )
  );

DROP POLICY IF EXISTS cohort_memberships_insert_permission ON public.cohort_memberships;
CREATE POLICY cohort_memberships_insert_permission ON public.cohort_memberships
  FOR INSERT WITH CHECK (
    (select is_super_admin())
    OR (select is_admin())
    OR (
      (select user_has_permission('cohort.create'::text))
      AND EXISTS (
        SELECT 1 FROM public.cohorts c
        WHERE c.id = cohort_memberships.cohort_id
          AND role_has_institution_access(c.institution_id)
      )
    )
  );

DROP POLICY IF EXISTS cohort_memberships_update_permission ON public.cohort_memberships;
CREATE POLICY cohort_memberships_update_permission ON public.cohort_memberships
  FOR UPDATE USING (
    (select is_super_admin())
    OR (select is_admin())
    OR (
      (select user_has_permission('cohort.edit'::text))
      AND EXISTS (
        SELECT 1 FROM public.cohorts c
        WHERE c.id = cohort_memberships.cohort_id
          AND role_has_institution_access(c.institution_id)
      )
    )
  );

DROP POLICY IF EXISTS cohort_memberships_delete_permission ON public.cohort_memberships;
CREATE POLICY cohort_memberships_delete_permission ON public.cohort_memberships
  FOR DELETE USING (
    (select is_super_admin())
    OR (select is_admin())
    OR (
      (select user_has_permission('cohort.manage'::text))
      AND EXISTS (
        SELECT 1 FROM public.cohorts c
        WHERE c.id = cohort_memberships.cohort_id
          AND role_has_institution_access(c.institution_id)
      )
    )
  );

-- ── 7. RLS — cohort_status_events (append-only; scope through cohort/membership)─
ALTER TABLE public.cohort_status_events ENABLE ROW LEVEL SECURITY;

-- Shared scope predicate: the event's cohort (directly, or via its membership)
-- must be one the caller can access. Reused verbatim in SELECT + INSERT.
DROP POLICY IF EXISTS cohort_status_events_select_permission ON public.cohort_status_events;
CREATE POLICY cohort_status_events_select_permission ON public.cohort_status_events
  FOR SELECT USING (
    (select is_super_admin())
    OR (select is_admin())
    OR (
      (select user_has_permission('cohort.view'::text))
      AND EXISTS (
        SELECT 1 FROM public.cohorts c
        WHERE (
                c.id = cohort_status_events.cohort_id
                OR c.id = (
                  SELECT m.cohort_id FROM public.cohort_memberships m
                  WHERE m.id = cohort_status_events.membership_id
                )
              )
          AND role_has_institution_access(c.institution_id)
      )
    )
  );

DROP POLICY IF EXISTS cohort_status_events_insert_permission ON public.cohort_status_events;
CREATE POLICY cohort_status_events_insert_permission ON public.cohort_status_events
  FOR INSERT WITH CHECK (
    (select is_super_admin())
    OR (select is_admin())
    OR (
      (select user_has_permission('cohort.edit'::text))
      AND EXISTS (
        SELECT 1 FROM public.cohorts c
        WHERE (
                c.id = cohort_status_events.cohort_id
                OR c.id = (
                  SELECT m.cohort_id FROM public.cohort_memberships m
                  WHERE m.id = cohort_status_events.membership_id
                )
              )
          AND role_has_institution_access(c.institution_id)
      )
    )
  );

-- Append-only: UPDATE/DELETE are admin-only (no permission-key path). This keeps
-- the audit trail tamper-resistant for non-admin cohort managers.
DROP POLICY IF EXISTS cohort_status_events_update_permission ON public.cohort_status_events;
CREATE POLICY cohort_status_events_update_permission ON public.cohort_status_events
  FOR UPDATE USING (
    (select is_super_admin()) OR (select is_admin())
  );

DROP POLICY IF EXISTS cohort_status_events_delete_permission ON public.cohort_status_events;
CREATE POLICY cohort_status_events_delete_permission ON public.cohort_status_events
  FOR DELETE USING (
    (select is_super_admin()) OR (select is_admin())
  );

NOTIFY pgrst, 'reload schema';
