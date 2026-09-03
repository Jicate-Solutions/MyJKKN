-- RENAME-SAFE: 20260504 -> 20261103000000 — the source version never applied, established from the repository because production is unreachable from this lane. types/supabase.ts is generated from the live database and contains NEITHER grievance_tickets.issue_type, requirement_id, migrated_from_subdomain or legacy_external_id (the four columns section 2 adds) NOR any of the eight tables sections 5-12 create — `requirement_requests` appears 0 times in that file. The objects this migration creates are therefore absent from production, which is the only honest test. The collision that caused it: 20260504_ai_pulse_rls_hardening.sql parses to the SAME version string `20260504`, and supabase_migrations.schema_migrations keys on version ALONE, so one recorded as applied and this one never executed. Renumbering the OTHER file was rejected — this session owns only this file, and ai_pulse_rls_hardening is the one that DID run. Re-applying this file is additive by construction: no DROP TABLE, no removed columns, every DDL guarded by IF NOT EXISTS / DO $$ blocks.
-- =====================================================================
-- Migration: instasolver_substrate (B.1 — Insta Solver core module)
-- Created:   2026-05-04
-- Spec:      docs/INSTASOLVER-MODULE-SPEC.md (DDL Plan — Phase B.1)
--            specs/instasolver-core-module-spec.md
-- Locked initiative: instasolver-core-module-90d (verdict 2026-08-04)
-- Outcome metric: institutions_with_min_5_tickets >= 6 of 8 by 2026-08-04
--
-- WHY:
--   Promote existing grievance_tickets substrate (39 cols, 0 prod rows,
--   PRs #305/#389/#507/#608) from NAAC-gated route to top-level /issues
--   route, absorbing instasolver.jkkn.ac.in subdomain. Add sibling
--   requirement_requests table for institutional feature requests
--   (approval/budget/voting workflow distinct from grievances).
--
-- WHAT (additive ONLY — zero behavior change to existing
--       /accreditation/naac/grievance flow):
--   1. ALTER grievance_tickets — add issue_type, requirement_id (FK),
--      migrated_from_subdomain, legacy_external_id columns
--   2. Extend raised_by_type "enum" — defensively (the underlying column
--      is text, not pg_enum, so we no-op if no enum exists; if an enum
--      with that name DOES exist we ALTER it)
--   3. ALTER grievance_categories — add allow_anonymous boolean
--   4. CREATE TYPE requirement_status enum
--   5. CREATE TABLE requirement_requests (full shape)
--   6. CREATE TABLE requirement_categories (LIKE grievance_categories)
--   7. CREATE TABLE requirement_history    (LIKE grievance_history)
--   8. CREATE TABLE requirement_votes      (with UNIQUE(req,voter))
--   9. CREATE TABLE issue_sla_config       (LIKE hostel_maintenance_sla_config)
--  10. CREATE TABLE requirement_approval_thresholds
--      (LIKE approval_authority_config + min/max amount cols)
--  11. CREATE TABLE requirement_voting_config (LIKE referral_category_eligibility)
--  12. CREATE TABLE issue_escalation_rules    (LIKE counselor_routing_config)
--  13. RLS policies — drop existing grievance_tickets_select, recreate
--      with ICC clause; apply RLS to all new requirement_* tables
--  14. fn_track_issue_by_token() — the anonymous filer's tracking-code path
--  15. Seed defaults — 3 approval-threshold tiers + 5 platform_policies
--  16. Notification generator rename — fn_generate_unresolved_grievance_items
--      → fn_generate_unresolved_issue_items + filter by issue_type;
--      UPDATE notification_generator_config row accordingly. The OLD name is
--      kept as a delegating wrapper — it has a live caller.
--
-- REPAIR (2026-09-03) — this file had never applied to production. Proof:
-- types/supabase.ts, generated from the live database, carries neither
-- grievance_tickets.issue_type nor any requirement_requests table. Four
-- defects were fixed; nothing else was rewritten:
--   (a) the platform_policies seed used a bare ON CONFLICT target against an
--       EXPRESSION unique index — 42P10, which rolls back all 941 lines
--       because this file is one transaction (BEGIN L49 → COMMIT).
--   (b) the same seed omitted data_type, which is NOT NULL with no default;
--       ON CONFLICT cannot rescue a NOT NULL violation.
--   (c) THE MECHANICAL REASON IT NEVER RAN. The filename was
--       20260504_instasolver_substrate.sql, and
--       20260504_ai_pulse_rls_hardening.sql parses to the SAME version,
--       `20260504`. supabase_migrations.schema_migrations keys on version
--       ALONE, so one file recorded as applied and this one never executed —
--       with no error anywhere. Renamed to 20261103000000_.
--   (d) the ICC branch of grievance_tickets_select carried no institution
--       boundary while the ordinary branch two lines below did, so one
--       icc_member role would have read confidential complaints from all 8
--       colleges; and the complainant's own-row clause sat inside the
--       is_icc_only = false branch, so she lost sight of her own case the
--       moment it was marked confidential.
--
-- HARD CONSTRAINTS observed (from auto-loaded memory):
--   - pgcrypto lives in extensions schema → use extensions.gen_random_uuid()
--     OR include extensions in SET search_path for SECURITY DEFINER fns
--   - Idempotent: IF NOT EXISTS / DO $$ guards everywhere
--   - Additive: no DROP TABLE, no removed columns
--   - Reuse fn_business_day_sla_deadline (PR #389) — do NOT redefine
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. ENUM: requirement_status
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'requirement_status') THEN
    CREATE TYPE public.requirement_status AS ENUM (
      'submitted',
      'under_review',
      'voting_open',
      'voting_closed',
      'approved',
      'budgeted',
      'in_progress',
      'fulfilled',
      'rejected',
      'withdrawn'
    );
  END IF;
END $$;

COMMENT ON TYPE public.requirement_status IS
  'Requirement state machine. submitted → under_review → voting_open → voting_closed → approved → budgeted → in_progress → fulfilled. Off-ramps: rejected, withdrawn (auto if quorum not met).';

-- ---------------------------------------------------------------------
-- 2. raised_by_type extension — defensive
-- The grievance_tickets.raised_by_type column ships as `text` in
-- production type definitions (lib/types/database.ts shows
-- `raised_by_type: string`). The spec instructs us to extend the
-- enum named raised_by_type_enum. We defensively check both worlds:
-- if a pg_enum by that name exists, ADD VALUE; otherwise no-op.
-- New persona values 'faculty' and 'admin' are valid in either world.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'raised_by_type_enum') THEN
    BEGIN
      ALTER TYPE public.raised_by_type_enum ADD VALUE IF NOT EXISTS 'faculty';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'raised_by_type_enum ADD VALUE faculty: %', SQLERRM;
    END;
    BEGIN
      ALTER TYPE public.raised_by_type_enum ADD VALUE IF NOT EXISTS 'admin';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'raised_by_type_enum ADD VALUE admin: %', SQLERRM;
    END;
  ELSE
    RAISE NOTICE 'raised_by_type_enum not found — column is plain text; no enum extension needed';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. ALTER grievance_categories — add allow_anonymous
-- (closes Q3 row: per-category anonymous filing override)
-- ---------------------------------------------------------------------
ALTER TABLE public.grievance_categories
  ADD COLUMN IF NOT EXISTS allow_anonymous boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.grievance_categories.allow_anonymous IS
  'Per-category override: when true, anonymous filing UI is shown for this category. When false, filer must be authenticated. Default true (backward-compatible — UGC §5(b) anonymous default).';

-- ---------------------------------------------------------------------
-- 4. CREATE requirement_categories (LIKE grievance_categories shape)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.requirement_categories
  (LIKE public.grievance_categories INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING COMMENTS);

-- Add FKs that LIKE doesn't carry (FK constraints are not copied by LIKE).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'requirement_categories_institution_id_fkey') THEN
    ALTER TABLE public.requirement_categories
      ADD CONSTRAINT requirement_categories_institution_id_fkey
      FOREIGN KEY (institution_id) REFERENCES public.institutions(id);
  END IF;
EXCEPTION WHEN undefined_column THEN
  RAISE NOTICE 'requirement_categories.institution_id column not present after LIKE — skipping FK';
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'requirement_categories_parent_id_fkey') THEN
    ALTER TABLE public.requirement_categories
      ADD CONSTRAINT requirement_categories_parent_id_fkey
      FOREIGN KEY (parent_id) REFERENCES public.requirement_categories(id);
  END IF;
EXCEPTION WHEN undefined_column THEN
  RAISE NOTICE 'requirement_categories.parent_id column not present after LIKE — skipping FK';
END $$;

COMMENT ON TABLE public.requirement_categories IS
  'Category master for requirement_requests (institutional feature requests). Cloned shape from grievance_categories. Per-institution overrides via institution_id (NULL = platform-wide).';

-- ---------------------------------------------------------------------
-- 5. CREATE requirement_requests
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.requirement_requests (
  id                    uuid        PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  request_number        varchar(40) NOT NULL UNIQUE,             -- REQ-2026-0001
  category_id           uuid        NOT NULL REFERENCES public.requirement_categories(id),
  institution_id        uuid        NOT NULL REFERENCES public.institutions(id),
  subject               varchar(200) NOT NULL,
  description           text        NOT NULL,
  estimated_budget      numeric(12,2),
  raised_by_type        text        NOT NULL,                    -- learner | parent | staff | faculty | admin | alumni
  raised_by_id          uuid        REFERENCES auth.users(id),
  raised_by_name        varchar(120),
  status                public.requirement_status NOT NULL DEFAULT 'submitted',
  voting_opens_at       timestamptz,
  voting_closes_at      timestamptz,
  vote_count_yes        int         NOT NULL DEFAULT 0,
  vote_count_no         int         NOT NULL DEFAULT 0,
  approved_at           timestamptz,
  approved_by           uuid        REFERENCES auth.users(id),
  budgeted_amount       numeric(12,2),
  budgeted_at           timestamptz,
  budgeted_by           uuid        REFERENCES auth.users(id),
  fulfilled_at          timestamptz,
  rejection_reason      text,
  approval_chain        jsonb,                                   -- snapshot per leave-service.ts pattern
  metadata              jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_req_req_institution_status
  ON public.requirement_requests (institution_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_req_req_raised_by
  ON public.requirement_requests (raised_by_id);
CREATE INDEX IF NOT EXISTS idx_req_req_voting_window
  ON public.requirement_requests (status, voting_closes_at)
  WHERE status IN ('voting_open', 'voting_closed');

COMMENT ON TABLE public.requirement_requests IS
  'Institutional feature/budget requests with voting + approval-chain workflow. Sibling to grievance_tickets (which uses issue_type=grievance). Filer audience: learner/parent/staff/faculty/admin/alumni. State machine: submitted → under_review → voting_open → voting_closed → approved → budgeted → in_progress → fulfilled. Lock: instasolver-core-module-90d.';

COMMENT ON COLUMN public.requirement_requests.approval_chain IS
  'Snapshot of approval flow at apply-time per lib/services/hr/leave-service.ts buildApprovalChain pattern. Immutable after creation — re-running flow does not retroactively change approver assignments.';

-- ---------------------------------------------------------------------
-- 6. CREATE requirement_history (LIKE grievance_history)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.requirement_history
  (LIKE public.grievance_history INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING COMMENTS);

-- Re-target the ticket_id FK to requirement_requests.
-- LIKE preserves the column but not the FK constraint.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'requirement_history_requirement_id_fkey') THEN
    -- Rename column ticket_id -> requirement_id for clarity (only if column exists with old name)
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public'
                 AND table_name = 'requirement_history'
                 AND column_name = 'ticket_id') THEN
      ALTER TABLE public.requirement_history RENAME COLUMN ticket_id TO requirement_id;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public'
                 AND table_name = 'requirement_history'
                 AND column_name = 'requirement_id') THEN
      ALTER TABLE public.requirement_history
        ADD CONSTRAINT requirement_history_requirement_id_fkey
        FOREIGN KEY (requirement_id) REFERENCES public.requirement_requests(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

COMMENT ON TABLE public.requirement_history IS
  'Append-only audit log for requirement_requests state changes. Cloned shape from grievance_history. ticket_id column renamed to requirement_id with CASCADE delete.';

-- ---------------------------------------------------------------------
-- 7. CREATE requirement_votes
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.requirement_votes (
  id              uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  requirement_id  uuid NOT NULL REFERENCES public.requirement_requests(id) ON DELETE CASCADE,
  voter_id        uuid NOT NULL REFERENCES auth.users(id),
  vote            text NOT NULL CHECK (vote IN ('yes', 'no')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requirement_id, voter_id)
);

CREATE INDEX IF NOT EXISTS idx_req_votes_requirement
  ON public.requirement_votes (requirement_id);
CREATE INDEX IF NOT EXISTS idx_req_votes_voter
  ON public.requirement_votes (voter_id);

COMMENT ON TABLE public.requirement_votes IS
  'Per-voter vote on a Requirement. UNIQUE(requirement_id, voter_id) enforces one-vote-per-user. Immutable after cast (no UPDATE — re-cast = withdraw + new INSERT). Live tally exposed via vote_count_yes/no on requirement_requests; per-voter visibility hidden in UI per spec R2.1.';

-- ---------------------------------------------------------------------
-- 8. CREATE issue_sla_config (LIKE hostel_maintenance_sla_config)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.issue_sla_config
  (LIKE public.hostel_maintenance_sla_config INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING COMMENTS);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'issue_sla_config_institution_id_fkey') THEN
    ALTER TABLE public.issue_sla_config
      ADD CONSTRAINT issue_sla_config_institution_id_fkey
      FOREIGN KEY (institution_id) REFERENCES public.institutions(id);
  END IF;
EXCEPTION WHEN undefined_column THEN
  RAISE NOTICE 'issue_sla_config.institution_id not present after LIKE — skipping FK';
END $$;

COMMENT ON TABLE public.issue_sla_config IS
  'Per-(category, priority) SLA hours for /issues route. Read by fn_compute_sla_deadline. Reuses fn_business_day_sla_deadline (PR #389) for business-hour math. Cloned shape from hostel_maintenance_sla_config.';

-- ---------------------------------------------------------------------
-- 9. CREATE requirement_approval_thresholds
--     (LIKE approval_authority_config + min/max amount cols)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.requirement_approval_thresholds
  (LIKE public.approval_authority_config INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING COMMENTS);

ALTER TABLE public.requirement_approval_thresholds
  ADD COLUMN IF NOT EXISTS min_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_amount numeric(12,2);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'requirement_approval_thresholds_institution_id_fkey') THEN
    ALTER TABLE public.requirement_approval_thresholds
      ADD CONSTRAINT requirement_approval_thresholds_institution_id_fkey
      FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN undefined_column THEN
  RAISE NOTICE 'requirement_approval_thresholds.institution_id not present after LIKE — skipping FK';
END $$;

COMMENT ON TABLE public.requirement_approval_thresholds IS
  'Budget approval tiers for requirement_requests by approval_authority + amount band. Cloned from approval_authority_config + min/max_amount cols. Defaults: HOD ≤ ₹10k, Principal ≤ ₹50k, super_admin > ₹50k. institution_id NULL = platform-wide; per-institution rows override. super_admin-editable via /admin/issues/approval-thresholds.';

COMMENT ON COLUMN public.requirement_approval_thresholds.min_amount IS
  'Inclusive lower bound for this tier. 0 = no lower limit.';
COMMENT ON COLUMN public.requirement_approval_thresholds.max_amount IS
  'Inclusive upper bound for this tier. NULL = no upper limit (highest tier).';

-- ---------------------------------------------------------------------
-- 10. CREATE requirement_voting_config (LIKE referral_category_eligibility)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.requirement_voting_config
  (LIKE public.referral_category_eligibility INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING COMMENTS);

-- Re-target FKs: category_id should reference requirement_categories.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'requirement_voting_config_category_id_fkey') THEN
    ALTER TABLE public.requirement_voting_config
      ADD CONSTRAINT requirement_voting_config_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES public.requirement_categories(id) ON DELETE CASCADE;
  END IF;
EXCEPTION WHEN undefined_column THEN
  RAISE NOTICE 'requirement_voting_config.category_id not present after LIKE — skipping FK';
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'requirement_voting_config_institution_id_fkey') THEN
    ALTER TABLE public.requirement_voting_config
      ADD CONSTRAINT requirement_voting_config_institution_id_fkey
      FOREIGN KEY (institution_id) REFERENCES public.institutions(id);
  END IF;
EXCEPTION WHEN undefined_column THEN
  RAISE NOTICE 'requirement_voting_config.institution_id not present after LIKE — skipping FK';
END $$;

COMMENT ON TABLE public.requirement_voting_config IS
  'Per-(category, role, institution) voter eligibility for Requirements. Cloned shape from referral_category_eligibility. Default rule (seeded by service layer in B.2): same-institution + parents-on-learner-categories. super_admin-editable via /admin/issues/voting-config.';

-- ---------------------------------------------------------------------
-- 11. CREATE issue_escalation_rules (LIKE counselor_routing_config)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.issue_escalation_rules
  (LIKE public.counselor_routing_config INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES INCLUDING COMMENTS);

COMMENT ON TABLE public.issue_escalation_rules IS
  'Auto-escalation rules for stale /issues tickets. key/value JSONB shape cloned from counselor_routing_config. Read by cron /api/cron/issue-escalation-check (B.3). super_admin-editable via /admin/issues/escalation-rules.';

-- ---------------------------------------------------------------------
-- 12. ALTER grievance_tickets — additive columns
--     (issue_type, requirement_id FK, migrated_from_subdomain,
--      legacy_external_id)
-- requirement_id FK references requirement_requests, which we just
-- created above — order is correct.
-- ---------------------------------------------------------------------
ALTER TABLE public.grievance_tickets
  ADD COLUMN IF NOT EXISTS issue_type             text NOT NULL DEFAULT 'grievance',
  ADD COLUMN IF NOT EXISTS requirement_id         uuid,
  ADD COLUMN IF NOT EXISTS migrated_from_subdomain boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legacy_external_id     text;

-- CHECK constraint for issue_type — only add if missing
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'grievance_tickets_issue_type_check') THEN
    ALTER TABLE public.grievance_tickets
      ADD CONSTRAINT grievance_tickets_issue_type_check
      CHECK (issue_type IN ('grievance', 'requirement_link'));
  END IF;
END $$;

-- FK from grievance_tickets.requirement_id -> requirement_requests.id
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                 WHERE conname = 'grievance_tickets_requirement_id_fkey') THEN
    ALTER TABLE public.grievance_tickets
      ADD CONSTRAINT grievance_tickets_requirement_id_fkey
      FOREIGN KEY (requirement_id) REFERENCES public.requirement_requests(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Helpful indexes for the new discriminator + lookup columns.
CREATE INDEX IF NOT EXISTS idx_grievance_tickets_issue_type
  ON public.grievance_tickets (issue_type, status);
CREATE INDEX IF NOT EXISTS idx_grievance_tickets_legacy_external
  ON public.grievance_tickets (legacy_external_id)
  WHERE legacy_external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grievance_tickets_requirement
  ON public.grievance_tickets (requirement_id)
  WHERE requirement_id IS NOT NULL;

COMMENT ON COLUMN public.grievance_tickets.issue_type IS
  'Discriminator for the unified /issues route. ''grievance'' = standard complaint (existing rows). ''requirement_link'' = grievance promoted to a Requirement (manually via promotion button per spec R2.2). Default ''grievance'' — backward-compatible with all existing rows.';
COMMENT ON COLUMN public.grievance_tickets.requirement_id IS
  'When issue_type=''requirement_link'', references the requirement_requests row this grievance was promoted to. ON DELETE SET NULL preserves the audit trail in grievance_tickets even if the Requirement is removed.';
COMMENT ON COLUMN public.grievance_tickets.migrated_from_subdomain IS
  'Set TRUE for tickets imported from instasolver.jkkn.ac.in via scripts/migrate-instasolver-subdomain.ts (B.3 wave). Used by cutover dashboards + 90-day verdict queries.';
COMMENT ON COLUMN public.grievance_tickets.legacy_external_id IS
  'Original ID from instasolver.jkkn.ac.in subdomain. Used by 301-redirect ?legacy_id=<x> lookups during the 90-day cutover window.';

-- ---------------------------------------------------------------------
-- 13. RLS — enable on all new requirement_* tables and config tables
-- ---------------------------------------------------------------------
ALTER TABLE public.requirement_requests          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_categories        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_history           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_votes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_sla_config              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_approval_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requirement_voting_config     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.issue_escalation_rules        ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 14. RLS — recreate grievance_tickets policies WITH ICC clause
-- The existing grievance_tickets_select policy (PR #608, migration
-- 20260423_unification_crud_retrofit.sql) already gates non-super-admins
-- through user_has_permission + role_has_institution_access. We REPLACE
-- it with a version that adds the ICC clause: ICC-only tickets are
-- visible to ICC-role members + super_admin only; non-ICC-only tickets
-- still flow through the existing permission gate.
--
-- ICC role check uses the existing role registry shape
-- (custom_roles.role_key='icc_member' joined via user_roles), matching
-- the proven pattern from supabase/migrations/20260429_counselor_routing_config.sql.
-- ---------------------------------------------------------------------

-- Reusable predicate helpers — wrap as inline EXISTS to avoid creating
-- new fns in B.1 (B.1 is a substrate phase; helper fns can be promoted
-- to named fns in a follow-up if needed).
-- Pattern: (custom_roles.role_key = 'icc_member')

DROP POLICY IF EXISTS "grievance_tickets_select" ON public.grievance_tickets;
-- INITPLAN DISCIPLINE — every per-row-CONSTANT call below is wrapped in a
-- scalar sub-select, so PostgreSQL evaluates it once per query instead of once
-- per row. This is not decoration: the platform-wide sweep of 2026-07-31
-- (supabase/migrations/rls_initplan_wrap_sweep.sql, applied to production, bare
-- auth.uid() policies 1,273 -> 1) already wrapped the LIVE grievance_tickets
-- policies, and that file records the live text at line 2058. Recreating these
-- policies with bare calls would silently undo that sweep for this table.
-- role_has_institution_access(institution_id) is deliberately NOT wrapped — it
-- takes a per-row column, so it is not a per-row constant. The sweep left it
-- unwrapped for the same reason.
CREATE POLICY "grievance_tickets_select" ON public.grievance_tickets FOR SELECT
USING (
  (SELECT is_super_admin()) OR (SELECT is_admin())
  -- (2) The complainant always sees her own case.
  -- This clause used to sit INSIDE the `is_icc_only = false` branch, so the
  -- moment a complaint was flagged confidential the woman who raised it lost
  -- sight of it entirely — she could file and then never learn what happened.
  -- Hoisted here so it holds for EVERY row, ICC-only included.
  -- Anonymous rows are unaffected: raised_by_id IS NULL there, and
  -- NULL = (SELECT auth.uid()) evaluates to NULL, never TRUE. Their access path is
  -- fn_track_issue_by_token() below.
  OR raised_by_id = (SELECT auth.uid())
  -- (1) ICC-only tickets: that college's committee, and no other.
  -- role_has_institution_access(institution_id) was MISSING here while the
  -- ordinary branch below has always carried it, so a single icc_member role
  -- read confidential complaints from all 8 colleges.
  OR (
    is_icc_only = true
    AND role_has_institution_access(institution_id)
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.custom_roles cr ON ur.role_id = cr.id
      WHERE ur.user_id = (SELECT auth.uid())
        AND cr.role_key = 'icc_member'
    )
  )
  -- Non-ICC-only tickets: existing institution + permission gate.
  -- filed_by and assigned_to stay INSIDE this branch deliberately. Hoisting
  -- them alongside raised_by_id was considered and rejected: both columns are
  -- writable on an existing row, so a hoisted filed_by would let a complainant
  -- editing her own open ICC ticket hand a third party read access to it, and
  -- a hoisted assigned_to would put a confidential complaint in front of a
  -- handler who is not on that college's committee. For an ICC-only row the
  -- assignee must therefore also be an icc_member of that institution — which
  -- is the confidentiality rule, stated as an access rule.
  OR (
    is_icc_only = false
    AND (
      assigned_to = (SELECT auth.uid())         -- assignee sees their queue
      OR filed_by = (SELECT auth.uid())         -- proxy filer sees what they filed
      OR (
        (SELECT user_has_permission('grievance.tickets.view'))
        AND role_has_institution_access(institution_id)
      )
    )
  )
);

-- INSERT, UPDATE, DELETE policies — recreate with the same ICC clause
-- structure where relevant.
DROP POLICY IF EXISTS "grievance_tickets_insert" ON public.grievance_tickets;
CREATE POLICY "grievance_tickets_insert" ON public.grievance_tickets FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated'
  -- Filers can mark a ticket is_icc_only at filing time (sensitive
  -- categories like SH/harassment auto-flag this via service layer).
  -- ICC restriction enforced on SELECT/UPDATE/DELETE, not INSERT —
  -- otherwise filers could not file ICC tickets at all.
);

DROP POLICY IF EXISTS "grievance_tickets_update" ON public.grievance_tickets;
CREATE POLICY "grievance_tickets_update" ON public.grievance_tickets FOR UPDATE
USING (
  (SELECT is_super_admin()) OR (SELECT is_admin())
  -- (2) The complainant can still act on her own case while it is open —
  -- correct it, add to it, withdraw it — whether or not it is confidential.
  -- Hoisted out of the `is_icc_only = false` branch for the same reason as
  -- the SELECT policy. The status guard is kept, so this never lets her edit
  -- a case the committee has already taken up.
  OR (raised_by_id = (SELECT auth.uid()) AND status IN ('open'))
  -- (1) ICC-only tickets: that college's committee only (super_admin handled
  -- by the first branch as break-glass; audit logged via trigger in B.2 wave
  -- per spec R1.3). role_has_institution_access was missing here too.
  OR (
    is_icc_only = true
    AND role_has_institution_access(institution_id)
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.custom_roles cr ON ur.role_id = cr.id
      WHERE ur.user_id = (SELECT auth.uid())
        AND cr.role_key = 'icc_member'
    )
  )
  -- Non-ICC-only: existing rules
  OR (
    is_icc_only = false
    AND (
      assigned_to = (SELECT auth.uid())
      OR (
        (SELECT user_has_permission('grievance.tickets.edit'))
        AND role_has_institution_access(institution_id)
      )
    )
  )
)
WITH CHECK (
  (SELECT is_super_admin()) OR (SELECT is_admin())
  OR raised_by_id = (SELECT auth.uid())
  OR (
    is_icc_only = true
    AND role_has_institution_access(institution_id)
    AND EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.custom_roles cr ON ur.role_id = cr.id
      WHERE ur.user_id = (SELECT auth.uid())
        AND cr.role_key = 'icc_member'
    )
  )
  OR (
    is_icc_only = false
    AND (
      assigned_to = (SELECT auth.uid())
      OR (
        (SELECT user_has_permission('grievance.tickets.edit'))
        AND role_has_institution_access(institution_id)
      )
    )
  )
);

DROP POLICY IF EXISTS "grievance_tickets_delete" ON public.grievance_tickets;
CREATE POLICY "grievance_tickets_delete" ON public.grievance_tickets FOR DELETE
USING (
  (SELECT is_super_admin()) OR (SELECT is_admin())
  -- Tickets should be withdrawn (status=withdrawn), not deleted.
  -- Delete is reserved for super-admin/admin cleanup of test/spam data.
  -- No is_icc_only branch and no identity branch exist here, so the two
  -- defects fixed in the SELECT and UPDATE policies above have no equivalent
  -- in this one. Left byte-for-byte unchanged, deliberately.
);

-- ---------------------------------------------------------------------
-- 14b. ANONYMOUS FILER'S TRACKING CODE
--
-- (3) An anonymous complaint has no account attached: raised_by_id IS NULL,
-- so hoisting `raised_by_id = auth.uid()` in the SELECT policy above does
-- NOT give an anonymous filer her own case back. Her only handle is the
-- anonymous_token issued at filing time. Today that token is WRITTEN by
-- lib/services/grievance/grievance-service.ts and lib/services/issues/
-- issue-service.ts and READ by nothing at all — she receives a code that
-- does not work anywhere.
--
-- A table-level RLS policy cannot serve this: the token arrives in a URL
-- path, not in a JWT, and widening grievance_tickets to the `anon` role at
-- all would be the wrong shape. A narrow SECURITY DEFINER function is the
-- access path instead — it bypasses RLS by design and returns only the
-- columns below, so the surface is fixed at definition time rather than
-- left to whatever the calling route happens to select.
--
-- (4) Status and progress ONLY. Returned: the ticket's own number and the
-- subject she wrote, where it has got to, and `resolution` — the message
-- written FOR her. Deliberately NOT returned: metadata and attachments
-- (internal committee working notes live there), assigned_to (naming the
-- handler of a harassment case to an unauthenticated caller is itself a
-- disclosure), institution/department/category ids, and every raised_by_*
-- column. resolution_letter_pdf_url is also withheld: serving that file
-- needs a signed URL the route must mint, and this migration does not set
-- storage policy.
--
-- Rate limiting is NOT enforced here. The per-IP ceiling is seeded as
-- platform policy `issues.anonymous_track.rate_limit_per_hour` (section 17)
-- and the /track/<token> route must read and enforce it; a bare token
-- lookup is otherwise enumerable.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_track_issue_by_token(p_token text)
RETURNS TABLE (
  ticket_number text,
  subject       text,
  status        text,
  created_at    timestamptz,
  assigned_at   timestamptz,
  resolved_at   timestamptz,
  withdrawn_at  timestamptz,
  resolution    text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn_track$
  SELECT
    gt.ticket_number::text,
    gt.subject::text,
    gt.status::text,
    gt.created_at,
    gt.assigned_at,
    gt.resolved_at,
    gt.withdrawn_at,
    gt.resolution::text
  FROM public.grievance_tickets gt
  WHERE gt.is_anonymous = true
    AND gt.anonymous_token IS NOT NULL
    AND gt.anonymous_token = p_token
    -- Both services mint the code as 'anon_' || crypto.randomUUID() — 41
    -- characters, 122 bits. The shape guard stops a blank or truncated value
    -- being probed at all; it is not the entropy defence, the UUID is.
    AND p_token LIKE 'anon\_%'
    AND length(coalesce(p_token, '')) >= 20
  LIMIT 1;
$fn_track$;

COMMENT ON FUNCTION public.fn_track_issue_by_token(text) IS
  'Status lookup for an anonymously filed /issues ticket, keyed on anonymous_token. Returns at most one row and only filer-facing fields (number, subject, status, the four progress timestamps, and the resolution message written for her) — never committee notes, attachments, handler identity or any raised_by_* column. SECURITY DEFINER because the filer is unauthenticated and has no RLS identity. NOT granted to anon: the /track/<token> route must call this with a service-role client and enforce platform policy issues.anonymous_track.rate_limit_per_hour, which the function itself does not do.';

-- GRANT POSTURE — deliberately service_role, NOT anon.
--
-- Criterion (b) of scripts/ci/check-secdef-anon-revoke.mjs would accept an
-- explicit `GRANT ... TO anon` here as an intentional-public RPC, but that
-- guard's own header sets the bar: treat a lookup as intentional-public only
-- if you can NAME the unauthenticated caller. There is no /track/<token>
-- route under app/ yet — this migration ships the substrate and the route is
-- a follow-up — so naming one would be a fiction, and the fn_get_policy*
-- incident recorded in that header is what happens when the box is ticked
-- anyway.
--
-- Granting anon now would also put a live public RPC on production with no
-- consumer and, crucially, with its rate limit unenforced: the ceiling seeded
-- as issues.anonymous_track.rate_limit_per_hour (section 17) is applied by the
-- calling route, and there is no calling route. service_role keeps the lookup
-- server-side — which is how the existing unauthenticated policy-reading
-- routes in this codebase already work — and makes that ceiling real.
--
-- If the tracking page is later meant to query straight from the browser,
-- widening this to anon is a one-line change; it belongs in the same PR as
-- the route that enforces the limit, not ahead of it.
REVOKE ALL ON FUNCTION public.fn_track_issue_by_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_track_issue_by_token(text) TO service_role;

-- ---------------------------------------------------------------------
-- 15. RLS policies on the new requirement_* + config tables.
-- Pattern follows institution-scoped read + role-tier write.
-- ICC clause applies only to grievance_tickets — Requirements are
-- never confidential by design (institutional feature requests).
-- ---------------------------------------------------------------------

-- requirement_requests
DROP POLICY IF EXISTS "requirement_requests_select" ON public.requirement_requests;
CREATE POLICY "requirement_requests_select" ON public.requirement_requests FOR SELECT
USING (
  is_super_admin() OR is_admin()
  OR raised_by_id = auth.uid()
  OR role_has_institution_access(institution_id)
);

DROP POLICY IF EXISTS "requirement_requests_insert" ON public.requirement_requests;
CREATE POLICY "requirement_requests_insert" ON public.requirement_requests FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "requirement_requests_update" ON public.requirement_requests;
CREATE POLICY "requirement_requests_update" ON public.requirement_requests FOR UPDATE
USING (
  is_super_admin() OR is_admin()
  OR (raised_by_id = auth.uid() AND status IN ('submitted'))   -- filer can edit only while still submitted
  OR (
    role_has_institution_access(institution_id)
    AND (
      approved_by = auth.uid()
      OR budgeted_by = auth.uid()
    )
  )
)
WITH CHECK (
  is_super_admin() OR is_admin()
  OR raised_by_id = auth.uid()
  OR role_has_institution_access(institution_id)
);

DROP POLICY IF EXISTS "requirement_requests_delete" ON public.requirement_requests;
CREATE POLICY "requirement_requests_delete" ON public.requirement_requests FOR DELETE
USING (is_super_admin() OR is_admin());

-- requirement_categories
DROP POLICY IF EXISTS "requirement_categories_select" ON public.requirement_categories;
CREATE POLICY "requirement_categories_select" ON public.requirement_categories FOR SELECT
USING (
  is_super_admin() OR is_admin()
  OR institution_id IS NULL                                    -- platform-wide rows visible to all auth users
  OR role_has_institution_access(institution_id)
);

DROP POLICY IF EXISTS "requirement_categories_manage" ON public.requirement_categories;
CREATE POLICY "requirement_categories_manage" ON public.requirement_categories FOR ALL
USING (is_super_admin() OR is_admin())
WITH CHECK (is_super_admin() OR is_admin());

-- requirement_history
DROP POLICY IF EXISTS "requirement_history_select" ON public.requirement_history;
CREATE POLICY "requirement_history_select" ON public.requirement_history FOR SELECT
USING (
  is_super_admin() OR is_admin()
  OR EXISTS (
    SELECT 1 FROM public.requirement_requests rr
    WHERE rr.id = requirement_history.requirement_id
      AND (
        rr.raised_by_id = auth.uid()
        OR role_has_institution_access(rr.institution_id)
      )
  )
);

DROP POLICY IF EXISTS "requirement_history_insert" ON public.requirement_history;
CREATE POLICY "requirement_history_insert" ON public.requirement_history FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- requirement_votes
DROP POLICY IF EXISTS "requirement_votes_select" ON public.requirement_votes;
CREATE POLICY "requirement_votes_select" ON public.requirement_votes FOR SELECT
USING (
  is_super_admin() OR is_admin()
  OR voter_id = auth.uid()                                     -- voter sees own vote
  -- Per spec R2.1: per-voter visibility hidden in UI; aggregate
  -- counts come from requirement_requests.vote_count_yes/no.
  -- We do NOT expose other voters' rows to peers.
);

DROP POLICY IF EXISTS "requirement_votes_insert" ON public.requirement_votes;
CREATE POLICY "requirement_votes_insert" ON public.requirement_votes FOR INSERT
WITH CHECK (
  voter_id = auth.uid()
  AND auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "requirement_votes_delete" ON public.requirement_votes;
CREATE POLICY "requirement_votes_delete" ON public.requirement_votes FOR DELETE
USING (
  is_super_admin() OR is_admin()
  OR voter_id = auth.uid()                                     -- voter can withdraw their own vote
);

-- issue_sla_config — read-open to authenticated, write super_admin/admin only
DROP POLICY IF EXISTS "issue_sla_config_select" ON public.issue_sla_config;
CREATE POLICY "issue_sla_config_select" ON public.issue_sla_config FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "issue_sla_config_manage" ON public.issue_sla_config;
CREATE POLICY "issue_sla_config_manage" ON public.issue_sla_config FOR ALL
USING (is_super_admin() OR is_admin())
WITH CHECK (is_super_admin() OR is_admin());

-- requirement_approval_thresholds — same pattern
DROP POLICY IF EXISTS "requirement_approval_thresholds_select" ON public.requirement_approval_thresholds;
CREATE POLICY "requirement_approval_thresholds_select" ON public.requirement_approval_thresholds FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "requirement_approval_thresholds_manage" ON public.requirement_approval_thresholds;
CREATE POLICY "requirement_approval_thresholds_manage" ON public.requirement_approval_thresholds FOR ALL
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- requirement_voting_config — same pattern
DROP POLICY IF EXISTS "requirement_voting_config_select" ON public.requirement_voting_config;
CREATE POLICY "requirement_voting_config_select" ON public.requirement_voting_config FOR SELECT
USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "requirement_voting_config_manage" ON public.requirement_voting_config;
CREATE POLICY "requirement_voting_config_manage" ON public.requirement_voting_config FOR ALL
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- issue_escalation_rules — super_admin write only (drives prod routing)
DROP POLICY IF EXISTS "issue_escalation_rules_select" ON public.issue_escalation_rules;
CREATE POLICY "issue_escalation_rules_select" ON public.issue_escalation_rules FOR SELECT
USING (
  is_super_admin() OR is_admin()
  OR auth.role() = 'authenticated'
);

DROP POLICY IF EXISTS "issue_escalation_rules_manage" ON public.issue_escalation_rules;
CREATE POLICY "issue_escalation_rules_manage" ON public.issue_escalation_rules FOR ALL
USING (is_super_admin())
WITH CHECK (is_super_admin());

-- ---------------------------------------------------------------------
-- 16. SEED DEFAULTS — requirement_approval_thresholds (3 tiers,
--     institution_id NULL = platform-wide; super_admin-editable via UI)
-- ---------------------------------------------------------------------
-- Tier 1: HOD authority for ≤ ₹10,000
-- Tier 2: Principal authority for ₹10,001 to ₹50,000
-- Tier 3: super_admin authority for > ₹50,000
INSERT INTO public.requirement_approval_thresholds
  (approval_authority, institution_id, escalate_after_days, fallback_role, is_active, min_amount, max_amount)
VALUES
  ('hod',         NULL, 7,  'principal',   true, 0,        10000),
  ('principal',   NULL, 10, 'super_admin', true, 10001,    50000),
  ('super_admin', NULL, 14, 'super_admin', true, 50001,    NULL)
ON CONFLICT (approval_authority, institution_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 17. SEED DEFAULTS — platform_policies (5 rows)
-- Voting window/quorum, anonymous-track rate limit, attachment limits.
-- Schema: (policy_key, scope_type, scope_id, value jsonb, description,
--          data_type). data_type is NOT NULL with NO default and its CHECK
-- admits only number | string | boolean | array | object | enum
-- (20260429000002_platform_policies_substrate.sql:21). All five rows below
-- hold a scalar number, so all five are 'number'. Omitting the column — as
-- this file did until now — raises a NOT NULL violation that ON CONFLICT
-- cannot rescue, aborting the single transaction this whole file runs in.
--
-- CONFLICT TARGET: uniqueness on this table is the EXPRESSION index
--   uq_platform_policies_key_scope
--     (policy_key, scope_type, COALESCE(scope_id, '000…0'::uuid))
-- (same file, line 32). A bare (policy_key, scope_type, scope_id) target
-- cannot be inferred against an expression index and raises 42P10 — see
-- 20260726193000, 20260809000000 and 20260807100000 for the same lesson.
-- The COALESCE form below is what 66 other migration files already use.
-- ---------------------------------------------------------------------
INSERT INTO public.platform_policies (policy_key, scope_type, scope_id, value, description, data_type)
VALUES
  ('issues.requirement.voting_window_days.default',
   'global', NULL,
   to_jsonb(14),
   'Default voting window in days for new Requirements (used when category does not override). Director-tunable.',
   'number'),

  ('issues.requirement.voting_quorum_pct',
   'global', NULL,
   to_jsonb(0.10),
   'Minimum percent (0.0-1.0) of eligible voters needed for a Requirement to clear voting_closed and become eligible for approval. 0.10 = 10%.',
   'number'),

  ('issues.anonymous_track.rate_limit_per_hour',
   'global', NULL,
   to_jsonb(60),
   'Per-IP rate limit for /track/<token> public unauthenticated status check. Prevents enumeration attacks against anonymous_token.',
   'number'),

  ('issues.attachment.max_files',
   'global', NULL,
   to_jsonb(5),
   'Max number of attachment files per /issues ticket (grievance OR requirement). Closes deferred PR #305 attachment gap.',
   'number'),

  ('issues.attachment.max_size_mb',
   'global', NULL,
   to_jsonb(10),
   'Max size in megabytes per attachment file. Combined with max_files = 50 MB total per ticket.',
   'number')
ON CONFLICT (policy_key, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid)) DO NOTHING;

-- ---------------------------------------------------------------------
-- 18. NOTIFICATION GENERATOR RENAME
--     unresolved_grievance → unresolved_issue
-- The existing config row stays; we UPDATE its name + extend the
-- config payload with an issue_type_filter array. We then DROP the
-- old PL/pgSQL fn and CREATE a renamed version that filters by
-- issue_type. The renamed fn is otherwise identical to the original
-- (adapted from supabase/setup/02_functions.sql:10479-10587).
-- ---------------------------------------------------------------------

-- Update config row in place
UPDATE public.notification_generator_config
SET generator_name = 'unresolved_issue',
    config = jsonb_set(
               COALESCE(config, '{}'::jsonb),
               '{issue_type_filter}',
               '["grievance", "requirement_link"]'::jsonb,
               true
             ),
    updated_at = now()
WHERE generator_name = 'unresolved_grievance';

-- The old signature is deliberately NOT dropped here.
--
-- fn_generate_unresolved_grievance_items() is live in production and has a
-- caller: fn_generate_all_dashboard_work_items() invokes it as
--   BEGIN r8 := fn_generate_unresolved_grievance_items();
--   EXCEPTION WHEN OTHERS THEN e8 := SQLERRM; END;
-- (20260428_hr_command_center_brief_digest.sql:164, and both definitions of
-- the orchestrator in supabase/setup/02_functions.sql, lines 10098 and 10173).
-- That handler swallows the error into a jsonb field nobody reads, so dropping
-- the function would stop grievance work items appearing on dashboards
-- permanently while surfacing nothing to a human — the dashboards would simply
-- go quiet. (The match in 20260817030000 is a comment, not a call.)
--
-- The old name is kept below as a thin delegating wrapper instead, added after
-- the new function exists. The orchestrator keeps working untouched, and the
-- wrapper can be retired in the B.2 wave that rewires it.

-- Recreate as fn_generate_unresolved_issue_items, filtering by
-- issue_type to match the new config row. SECURITY DEFINER + the
-- same search_path discipline as the original, with `extensions`
-- included per pgcrypto-in-extensions-schema memory rule.
CREATE OR REPLACE FUNCTION public.fn_generate_unresolved_issue_items()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn_issue$
DECLARE
  v_created INT := 0; v_griev RECORD; v_key TEXT; v_target UUID;
  v_priority TEXT; v_hours_past_sla INT;
  v_cfg JSONB;
  v_category TEXT;
  v_statuses TEXT[];
  v_max_age_days INT;
  v_batch_limit INT;
  v_urgent_when_emergency BOOLEAN;
  v_urgent_when_escalation_gte INT;
  v_high_when_escalation_eq INT;
  v_high_when_hours_past_sla_gt INT;
  v_ttl_urgent_hours INT;
  v_ttl_normal_hours INT;
  v_fallback_to_director BOOLEAN;
  v_issue_type_filter TEXT[];
BEGIN
  v_cfg := fn_get_generator_config('unresolved_issue', '{
    "category": "dashboard:approval",
    "statuses": ["open","assigned","in_progress","escalated"],
    "max_age_days": 90,
    "batch_limit": 50,
    "issue_type_filter": ["grievance", "requirement_link"],
    "trigger_conditions": ["sla_deadline_breached","escalation_level_gt_0","is_emergency"],
    "filters": {"withdrawn_at_is_null": true, "resolved_at_is_null": true},
    "priority_overrides": {
      "urgent_when_is_emergency": true,
      "urgent_when_escalation_gte": 2,
      "high_when_escalation_eq": 1,
      "high_when_hours_past_sla_gt": 24
    },
    "ttl_hours": {"urgent_or_escalation_gte_2": 4, "normal": 24},
    "fallback_to_director": true
  }'::jsonb);

  v_category             := COALESCE(v_cfg->>'category', 'dashboard:approval');
  v_statuses             := COALESCE(
                              ARRAY(SELECT jsonb_array_elements_text(v_cfg->'statuses')),
                              ARRAY['open','assigned','in_progress','escalated']
                            );
  v_max_age_days         := COALESCE((v_cfg->>'max_age_days')::INT, 90);
  v_batch_limit          := COALESCE((v_cfg->>'batch_limit')::INT, 50);
  v_issue_type_filter    := COALESCE(
                              ARRAY(SELECT jsonb_array_elements_text(v_cfg->'issue_type_filter')),
                              ARRAY['grievance','requirement_link']
                            );
  v_urgent_when_emergency      := COALESCE((v_cfg->'priority_overrides'->>'urgent_when_is_emergency')::BOOLEAN, true);
  v_urgent_when_escalation_gte := COALESCE((v_cfg->'priority_overrides'->>'urgent_when_escalation_gte')::INT, 2);
  v_high_when_escalation_eq    := COALESCE((v_cfg->'priority_overrides'->>'high_when_escalation_eq')::INT, 1);
  v_high_when_hours_past_sla_gt := COALESCE((v_cfg->'priority_overrides'->>'high_when_hours_past_sla_gt')::INT, 24);
  v_ttl_urgent_hours     := COALESCE((v_cfg->'ttl_hours'->>'urgent_or_escalation_gte_2')::INT, 4);
  v_ttl_normal_hours     := COALESCE((v_cfg->'ttl_hours'->>'normal')::INT, 24);
  v_fallback_to_director := COALESCE((v_cfg->>'fallback_to_director')::BOOLEAN, true);

  FOR v_griev IN
    SELECT id, ticket_number, subject, description, institution_id,
           priority, status, sla_deadline, sla_status, escalation_level,
           is_emergency, assigned_to, issue_type,
           CASE WHEN sla_deadline IS NOT NULL
                THEN EXTRACT(EPOCH FROM (NOW() - sla_deadline))/3600
                ELSE 0 END AS hours_past_sla
    FROM public.grievance_tickets
    WHERE status = ANY(v_statuses)
      AND issue_type = ANY(v_issue_type_filter)                 -- NEW: filter by issue_type
      AND created_at > NOW() - make_interval(days => v_max_age_days)
      AND (sla_deadline < NOW() OR escalation_level > 0 OR is_emergency = TRUE)
      AND withdrawn_at IS NULL
      AND resolved_at IS NULL
    ORDER BY escalation_level DESC NULLS LAST, sla_deadline ASC NULLS LAST
    LIMIT v_batch_limit
  LOOP
    IF v_fallback_to_director THEN
      v_target := COALESCE(v_griev.assigned_to, fn_resolve_dashboard_target(v_griev.institution_id));
    ELSE
      v_target := v_griev.assigned_to;
    END IF;
    IF v_target IS NULL THEN CONTINUE; END IF;
    v_hours_past_sla := v_griev.hours_past_sla::INT;
    v_priority := CASE
      WHEN v_urgent_when_emergency AND v_griev.is_emergency THEN 'urgent'
      WHEN v_griev.escalation_level >= v_urgent_when_escalation_gte THEN 'urgent'
      WHEN v_griev.escalation_level = v_high_when_escalation_eq THEN 'high'
      WHEN v_hours_past_sla > v_high_when_hours_past_sla_gt THEN 'high'
      ELSE 'normal'
    END;
    v_key := 'issue:' || v_griev.issue_type || ':' || v_griev.id::text || ':' || CURRENT_DATE::text;
    v_created := v_created + fn_create_dashboard_work_item(
      v_category, v_priority,
      CASE WHEN v_griev.issue_type = 'requirement_link'
           THEN 'Requirement-linked Issue '
           ELSE 'Grievance ' END
        || v_griev.ticket_number || ' — ' || LEFT(v_griev.subject, 80),
      LEFT(v_griev.description, 140) ||
        CASE WHEN v_griev.escalation_level > 0 THEN ' | escalated L' || v_griev.escalation_level::text ELSE '' END ||
        CASE WHEN v_griev.sla_deadline < NOW() THEN ' | SLA breached ' || v_hours_past_sla::text || 'h' ELSE '' END ||
        CASE WHEN v_griev.assigned_to IS NULL THEN ' | UNASSIGNED, routed to Director' ELSE '' END,
      jsonb_build_object(
        'grievance_id',     v_griev.id,
        'issue_type',       v_griev.issue_type,
        'ticket_number',    v_griev.ticket_number,
        'escalation_level', v_griev.escalation_level,
        'sla_breached',     (v_griev.sla_deadline < NOW()),
        'is_emergency',     v_griev.is_emergency,
        'unassigned_fallback', v_griev.assigned_to IS NULL,
        'url', '/issues/grievances/' || v_griev.id::text
      ),
      v_target, v_key,
      CASE
        WHEN v_griev.is_emergency OR v_griev.escalation_level >= v_urgent_when_escalation_gte
          THEN v_ttl_urgent_hours
        ELSE v_ttl_normal_hours
      END
    );
  END LOOP;
  RETURN v_created;
END $fn_issue$;

REVOKE ALL ON FUNCTION public.fn_generate_unresolved_issue_items() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_generate_unresolved_issue_items() IS
  'Renamed from fn_generate_unresolved_grievance_items (Insta Solver B.1). Generates dashboard work items for unresolved /issues tickets (grievance + requirement_link). Filters by issue_type from config. Reads policy from notification_generator_config(name=unresolved_issue). Wired into fn_generate_all_dashboard_work_items in B.2 wave (this PR ships substrate only — the orchestrator update is a follow-up so existing behavior stays intact during deploy window).';

-- ---------------------------------------------------------------------
-- 18b. COMPATIBILITY WRAPPER for the old function name.
--
-- fn_generate_all_dashboard_work_items() still calls the old name inside an
-- EXCEPTION WHEN OTHERS handler, so a missing function there is silent. This
-- keeps the name resolvable and delegates to the renamed implementation, so
-- the orchestrator's r8 slot keeps producing grievance work items across the
-- deploy window with no change to the caller.
--
-- CREATE OR REPLACE (not CREATE) so this is a no-op-shaped rewrite of the
-- function that already exists in production. RETURNS INT matches the live
-- signature exactly (supabase/setup/02_functions.sql:10025-10026) — a return
-- type change would be rejected rather than applied.
--
-- The grant posture of the original is re-asserted below rather than assumed:
-- 20260817030000 measured this family on production and recorded
-- fn_generate_unresolved_grievance_items as postgres | service_role with no
-- `authenticated` grant, and supabase/setup/02_functions.sql:10081 declares
-- the same. Replacing a function does not reset its ACL, but stating it here
-- means a later re-run of the 155-name loop in
-- 20260605191101_revoke_platform_rpcs_anon_access.sql cannot quietly widen it.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_generate_unresolved_grievance_items()
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $fn_griev_comfat$
  SELECT public.fn_generate_unresolved_issue_items();
$fn_griev_comfat$;

REVOKE ALL ON FUNCTION public.fn_generate_unresolved_grievance_items() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.fn_generate_unresolved_grievance_items() IS
  'DEPRECATED compatibility wrapper (Insta Solver B.1). Delegates to fn_generate_unresolved_issue_items(). Kept because fn_generate_all_dashboard_work_items() calls this name inside an EXCEPTION WHEN OTHERS handler, so dropping it would stop grievance work items reaching dashboards silently. Retire together with the orchestrator rewire in the B.2 wave.';

-- ---------------------------------------------------------------------
-- 19. VERIFICATION BLOCK — best-effort sanity checks
-- ---------------------------------------------------------------------
DO $$
DECLARE
  v_new_cols INT;
  v_new_tables INT;
  v_seed_thresholds INT;
  v_seed_policies INT;
  v_renamed_generator INT;
BEGIN
  -- New columns on grievance_tickets
  SELECT COUNT(*) INTO v_new_cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'grievance_tickets'
    AND column_name IN ('issue_type', 'requirement_id', 'migrated_from_subdomain', 'legacy_external_id');

  -- New tables
  SELECT COUNT(*) INTO v_new_tables
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN (
      'requirement_requests', 'requirement_categories', 'requirement_history',
      'requirement_votes', 'issue_sla_config', 'requirement_approval_thresholds',
      'requirement_voting_config', 'issue_escalation_rules'
    );

  -- Seed counts
  SELECT COUNT(*) INTO v_seed_thresholds
  FROM public.requirement_approval_thresholds
  WHERE institution_id IS NULL
    AND approval_authority IN ('hod','principal','super_admin');

  SELECT COUNT(*) INTO v_seed_policies
  FROM public.platform_policies
  WHERE policy_key LIKE 'issues.%';

  -- Renamed generator config
  SELECT COUNT(*) INTO v_renamed_generator
  FROM public.notification_generator_config
  WHERE generator_name = 'unresolved_issue';

  RAISE NOTICE 'Insta Solver B.1 substrate verification:';
  RAISE NOTICE '  grievance_tickets new columns:        % / 4',  v_new_cols;
  RAISE NOTICE '  new requirement_/issue_ tables:       % / 8',  v_new_tables;
  RAISE NOTICE '  approval_threshold seed rows:         % / 3',  v_seed_thresholds;
  RAISE NOTICE '  platform_policies issue.* rows:       % / 5',  v_seed_policies;
  RAISE NOTICE '  unresolved_issue config rows:         %',      v_renamed_generator;

  -- Hard fails — these MUST hold for B.2 + B.3 to function
  IF v_new_cols < 4 THEN
    RAISE EXCEPTION 'B.1 verification failed: expected 4 new grievance_tickets columns, found %', v_new_cols;
  END IF;
  IF v_new_tables < 8 THEN
    RAISE EXCEPTION 'B.1 verification failed: expected 8 new tables, found %', v_new_tables;
  END IF;

  -- The five platform_policies rows are the seed that used to abort this whole
  -- transaction — first on a NOT NULL violation for data_type, then on 42P10
  -- from a bare ON CONFLICT target against an expression unique index. A
  -- NOTICE-only check here would let either regression read as success.
  IF v_seed_policies < 5 THEN
    RAISE EXCEPTION 'B.1 verification failed: expected 5 platform_policies issues.* rows, found %', v_seed_policies;
  END IF;

  -- The orchestrator fn_generate_all_dashboard_work_items() calls the old
  -- generator name inside an EXCEPTION WHEN OTHERS handler. If the wrapper is
  -- missing, grievance work items stop reaching dashboards and nothing tells
  -- anyone. Fail here instead, where a human is watching.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fn_generate_unresolved_grievance_items'
  ) THEN
    RAISE EXCEPTION 'B.1 verification failed: compatibility wrapper fn_generate_unresolved_grievance_items() is absent — fn_generate_all_dashboard_work_items() would silently stop emitting grievance work items';
  END IF;
END $$;

COMMIT;
