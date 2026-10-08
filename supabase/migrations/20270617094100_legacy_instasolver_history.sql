-- ============================================================================
-- Migration: 20270617094100_legacy_instasolver_history
-- Purpose:   Keep the OLD InstaSolver site's whole history inside MyJKKN.
--
-- Director rulings, 30 Sep 2026:
--   * copy ALL unfinished jobs from the old site (instasolver.jkkn.ac.in) into
--     MyJKKN's fix list (Campus Walk tasks) — the importer does that;
--   * the old purchase requests stuck at 'Pending MD Approval' get ONE screen
--     where the Director approves or rejects each one;
--   * the WHOLE old history is kept here, so a repeat problem can be spotted.
--
-- Two tables, one per old-site table. Each row is one old record with its
-- CLEANED category / place / college next to the raw values, so nothing the
-- old site knew is thrown away and nothing has to be re-cleaned later.
--
-- WHO WRITES: nobody through PostgREST. There is no INSERT / UPDATE / DELETE
-- policy for `authenticated`, so only the service role writes — the importer
-- (scripts/instasolver/import-old-site.ts) and the Director's decision route
-- (app/api/instasolver/old-purchase-requests/route.ts, which checks the caller
-- is a super admin before it writes).
--
-- WHO READS: super admins, admins, and holders of grievance.categories.manage
-- (the existing grievance-admin key). The rows carry the old reporter's NAME,
-- so this is deliberately not every signed-in user. The old site's mobile
-- numbers and email addresses are NOT stored at all.
--
-- The importer upserts on legacy_id and never sends imported_task_id or any
-- decision column, so a re-run can never undo a task link or a decision.
-- ============================================================================

-- ── Old "something is broken" reports ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.legacy_instasolver_issues (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The old site's own id. UNIQUE so the importer can upsert on it.
  legacy_id              INTEGER NOT NULL UNIQUE,

  -- College: raw text from the old site, and the MyJKKN institution it maps to
  -- (scripts/instasolver/institution-map.json).
  legacy_institution     TEXT,
  institution_id         UUID REFERENCES public.institutions(id) ON DELETE SET NULL,

  -- Category: raw, and the cleaned group.
  legacy_category        TEXT,
  clean_category         TEXT,

  -- Place: raw location text, and the cleaned site + area.
  legacy_location        TEXT,
  clean_site             TEXT,
  clean_area             TEXT,

  details                TEXT,          -- issue_details
  cause                  TEXT,          -- issue_reason
  suggested_fix          TEXT,          -- resolution_suggestion
  ai_summary             TEXT,
  notes                  TEXT,
  severity               TEXT,          -- as the old site recorded it
  legacy_status          TEXT,          -- trimmed old status
  is_completed           BOOLEAN NOT NULL DEFAULT FALSE,
  is_open                BOOLEAN NOT NULL DEFAULT FALSE,
  reopened               BOOLEAN NOT NULL DEFAULT FALSE,
  reopen_reason          TEXT,
  rejection_reason       TEXT,
  legacy_assigned_to     TEXT,

  photo_url              TEXT,
  completed_photo_url    TEXT,

  -- Who reported it: the old record's name, and the MyJKKN profile it matched
  -- by email (NULL when nobody matched).
  reporter_name          TEXT,
  reporter_profile_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  reported_at            TIMESTAMPTZ,
  -- TRUE for the rows bulk-loaded into the old site on 23 Nov 2024: their
  -- report date is the load date, not a real report date.
  reported_at_is_bulk_load BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at           TIMESTAMPTZ,
  legacy_created_at      TIMESTAMPTZ,
  legacy_updated_at      TIMESTAMPTZ,

  -- The old site's admin notes on this record: [{content, created_at, admin_name, admin_role}].
  admin_notes            JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Open and older than a year at import: the task is titled
  -- 'Check if still broken: ...'.
  needs_still_broken_check BOOLEAN NOT NULL DEFAULT FALSE,
  -- The Campus Walk task the importer created for an open record. Written once;
  -- the importer never creates a second task for a row that has one.
  imported_task_id       UUID REFERENCES public.project_tasks(id) ON DELETE SET NULL,
  task_imported_at       TIMESTAMPTZ,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.legacy_instasolver_issues IS
  'History of the old InstaSolver site''s fault reports (instasolver.jkkn.ac.in), kept so repeat problems can be spotted. Service-role writes only (scripts/instasolver/import-old-site.ts). Open rows link to the Campus Walk task created for them via imported_task_id.';

CREATE INDEX IF NOT EXISTS idx_legacy_is_issues_institution
  ON public.legacy_instasolver_issues (institution_id);
CREATE INDEX IF NOT EXISTS idx_legacy_is_issues_place
  ON public.legacy_instasolver_issues (clean_site, clean_area);
CREATE INDEX IF NOT EXISTS idx_legacy_is_issues_open
  ON public.legacy_instasolver_issues (is_open) WHERE is_open;
CREATE INDEX IF NOT EXISTS idx_legacy_is_issues_reporter
  ON public.legacy_instasolver_issues (reporter_profile_id);
CREATE INDEX IF NOT EXISTS idx_legacy_is_issues_task
  ON public.legacy_instasolver_issues (imported_task_id);

-- ── Old purchase requests ("requirements") ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.legacy_instasolver_requirements (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_id              INTEGER NOT NULL UNIQUE,

  legacy_institution     TEXT,
  institution_id         UUID REFERENCES public.institutions(id) ON DELETE SET NULL,

  legacy_category        TEXT,
  clean_category         TEXT,

  legacy_location        TEXT,
  clean_site             TEXT,
  clean_area             TEXT,

  details                TEXT,          -- requirement_details
  cause                  TEXT,          -- requirement_reason
  suggested_fix          TEXT,          -- resolution_suggestion
  notes                  TEXT,
  priority               TEXT,
  legacy_status          TEXT,          -- e.g. 'Pending MD Approval'
  is_completed           BOOLEAN NOT NULL DEFAULT FALSE,
  reopened               BOOLEAN NOT NULL DEFAULT FALSE,
  reopen_reason          TEXT,
  rejection_reason       TEXT,
  legacy_assigned_to     TEXT,

  photo_url              TEXT,
  completed_photo_url    TEXT,

  reporter_name          TEXT,
  reporter_profile_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  requested_at           TIMESTAMPTZ,
  requested_at_is_bulk_load BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at           TIMESTAMPTZ,
  legacy_created_at      TIMESTAMPTZ,
  legacy_updated_at      TIMESTAMPTZ,

  admin_notes            JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- The Director's decision on a 'Pending MD Approval' row, from
  -- /instasolver/old-purchase-requests. 'approving' is a short-lived claim
  -- held while the browser raises the Procurement request, so two taps cannot
  -- raise two requests.
  decision               TEXT CHECK (decision IN ('approving', 'approved', 'rejected')),
  decision_reason        TEXT,
  decided_by             UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at             TIMESTAMPTZ,
  decision_claimed_at    TIMESTAMPTZ,
  imported_purchase_request_id UUID
    REFERENCES public.procurement_purchase_requests(id) ON DELETE SET NULL,

  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.legacy_instasolver_requirements IS
  'History of the old InstaSolver site''s purchase requests, kept so repeat asks can be spotted. Service-role writes only. The Director decides the ''Pending MD Approval'' rows on /instasolver/old-purchase-requests; an approved row links to the Procurement purchase request it became.';

CREATE INDEX IF NOT EXISTS idx_legacy_is_req_pending
  ON public.legacy_instasolver_requirements (legacy_status, requested_at);
CREATE INDEX IF NOT EXISTS idx_legacy_is_req_institution
  ON public.legacy_instasolver_requirements (institution_id);
CREATE INDEX IF NOT EXISTS idx_legacy_is_req_reporter
  ON public.legacy_instasolver_requirements (reporter_profile_id);
CREATE INDEX IF NOT EXISTS idx_legacy_is_req_pr
  ON public.legacy_instasolver_requirements (imported_purchase_request_id);

-- ── Lock both tables ────────────────────────────────────────────────────────
ALTER TABLE public.legacy_instasolver_issues       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_instasolver_requirements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.legacy_instasolver_issues       FROM anon, PUBLIC;
REVOKE ALL ON TABLE public.legacy_instasolver_requirements FROM anon, PUBLIC;

-- Read only for signed-in users; the policies below decide which rows.
REVOKE ALL ON TABLE public.legacy_instasolver_issues       FROM authenticated;
REVOKE ALL ON TABLE public.legacy_instasolver_requirements FROM authenticated;
GRANT SELECT ON TABLE public.legacy_instasolver_issues       TO authenticated;
GRANT SELECT ON TABLE public.legacy_instasolver_requirements TO authenticated;

GRANT ALL ON TABLE public.legacy_instasolver_issues       TO service_role;
GRANT ALL ON TABLE public.legacy_instasolver_requirements TO service_role;

DROP POLICY IF EXISTS legacy_instasolver_issues_select ON public.legacy_instasolver_issues;
CREATE POLICY legacy_instasolver_issues_select ON public.legacy_instasolver_issues
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_admin()
    OR public.user_has_permission('grievance.categories.manage')
  );

DROP POLICY IF EXISTS legacy_instasolver_requirements_select ON public.legacy_instasolver_requirements;
CREATE POLICY legacy_instasolver_requirements_select ON public.legacy_instasolver_requirements
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_admin()
    OR public.user_has_permission('grievance.categories.manage')
  );

-- No INSERT / UPDATE / DELETE policy on purpose: with RLS on and no matching
-- policy, every write through the anon or authenticated key is refused. This
-- migration defines no functions.
