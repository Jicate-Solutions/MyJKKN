-- ============================================================================
-- Sports Tournament Conducting — PR2: registration (entries) + rosters
-- File: 20260622153000_sports_tournament_pr2.sql
-- Spec:   specs/sports-tournament-DECISIONS-LOCKED-2026-06-22.md (PR2)
-- Explore: specs/sports-tournament-conducting-EXPLORE-2026-06-22.md (§4 RLS, §5 data model)
-- Date: 2026-06-22
--
-- What this migration does (additive + idempotent — safe to re-run):
--   1. Creates `tournament_entries` — one competitor (a TEAM or an INDIVIDUAL)
--      in a division. The entry's contact/payment data lives on an existing
--      `events_registrations` row (the canonical, payment-wired registration
--      table — `marathon_registrations` is just a VIEW over it); `registration_id`
--      links to it. `tournament_entries` carries the PUBLIC-SAFE projection
--      (entry_name, institution_name, seed, rank) so the PR4 public scoreboard can
--      read it WITHOUT ever touching the PII-bearing events_registrations row.
--   2. Creates `tournament_team_members` — the roster for team entries.
--   3. RLS on both, inheriting access from the parent `events` row (the §4 model:
--      driven by event scope/visibility, NOT by matching the viewer's institution)
--      and gated by the sports.tournaments.* permission keys (defined in code:
--      lib/constants/permissions.ts).
--   4. Tightens the `sports_coordinator` role: removes the PR1 over-grant
--      events.marathon.view + events.marathon.create (a sports coordinator should
--      NOT be able to create marathons; reaching /events/tournament needs only
--      sports.tournaments.view — verified: events/tournament/layout.tsx guards the
--      subtree via RoutePermissionGuard on its declared perm, and there is no
--      /events layout gate that needs events.marathon.view). Keeps events.view.
--
-- NO new SECURITY DEFINER RPC in PR2 (eligibility is enforced in the register API
-- route, server-side, against learners_profiles). If a later PR adds an RPC it MUST
-- `REVOKE EXECUTE FROM anon, PUBLIC; GRANT TO authenticated` (except the PR4 public
-- scoreboard read RPC, which gets an explicit documented GRANT TO anon).
--
-- Reuse decision (documented fork): the EXPLORE spec named a `tournament_registrations`
-- table cloning marathon_registrations. We instead REUSE `events_registrations` as the
-- entry's registration carrier because EventPaymentService (the HDFC/Razorpay rail the
-- Director told us to reuse) is hard-wired to events_registrations — cloning a parallel
-- table would have meant forking the payment service, violating the reuse mandate. A
-- match's two sides (PR3) then reference two tournament_entries rows uniformly, whether
-- team or individual.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. tournament_entries — a competitor (team OR individual) in a division
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tournament_entries (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id           UUID        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  division_id        UUID        NOT NULL REFERENCES public.tournament_divisions(id) ON DELETE CASCADE,
  -- The payment/PII carrier. SET NULL (not CASCADE) so an entry survives a
  -- registration-row cleanup; normally always populated.
  registration_id    UUID        REFERENCES public.events_registrations(id) ON DELETE SET NULL,
  entry_type         TEXT        NOT NULL DEFAULT 'individual',
  entry_name         TEXT        NOT NULL,                 -- team name OR individual name (public-safe)
  institution_id     UUID        REFERENCES public.institutions(id),
  institution_name   TEXT,                                 -- free text; populated (instead of institution_id) for EXTERNAL entries
  is_external        BOOLEAN     NOT NULL DEFAULT false,
  captain_learner_id UUID        REFERENCES public.learners_profiles(id),  -- team captain (JKKN learner), optional
  seed               INTEGER,                              -- set by the PR3 bracket engine
  status             TEXT        NOT NULL DEFAULT 'registered',
  final_rank         INTEGER,                              -- set by PR4 standings/results
  notes              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tournament_entries_entry_type_check
    CHECK (entry_type IN ('individual', 'team')),
  CONSTRAINT tournament_entries_status_check
    CHECK (status IN ('registered', 'confirmed', 'withdrawn', 'disqualified')),
  -- An external entry carries a free-text institution_name and no institution_id.
  CONSTRAINT tournament_entries_external_institution_check
    CHECK (NOT is_external OR institution_id IS NULL)
);

CREATE INDEX IF NOT EXISTS idx_tournament_entries_event       ON public.tournament_entries(event_id);
CREATE INDEX IF NOT EXISTS idx_tournament_entries_division    ON public.tournament_entries(division_id);
CREATE INDEX IF NOT EXISTS idx_tournament_entries_div_status  ON public.tournament_entries(division_id, status);
CREATE INDEX IF NOT EXISTS idx_tournament_entries_reg         ON public.tournament_entries(registration_id);

COMMENT ON TABLE public.tournament_entries IS
  'A competitor (team OR individual) entered into a tournament_divisions row. registration_id links to the events_registrations payment/PII carrier. Public-safe fields (entry_name, institution_name, seed, final_rank) are read by the PR4 public scoreboard. Added 2026-06-22 (Sports Tournament PR2).';
COMMENT ON COLUMN public.tournament_entries.registration_id IS
  'FK to events_registrations (the canonical, payment-wired registration table). Carries phone/email/payment_status — read server-side only, never by the public scoreboard.';
COMMENT ON COLUMN public.tournament_entries.is_external IS
  'true ⇒ non-JKKN entry: institution_id NULL, institution_name free text.';

-- ----------------------------------------------------------------------------
-- 2. tournament_team_members — roster for team entries
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tournament_team_members (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id     UUID        NOT NULL REFERENCES public.tournament_entries(id) ON DELETE CASCADE,
  learner_id   UUID        REFERENCES public.learners_profiles(id),  -- NULL for external/guest players
  member_name  TEXT        NOT NULL,
  jersey_no    TEXT,
  role         TEXT        NOT NULL DEFAULT 'player',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT tournament_team_members_role_check
    CHECK (role IN ('captain', 'player', 'substitute', 'coach', 'manager'))
);

CREATE INDEX IF NOT EXISTS idx_tournament_team_members_entry   ON public.tournament_team_members(entry_id);
CREATE INDEX IF NOT EXISTS idx_tournament_team_members_learner ON public.tournament_team_members(learner_id);

COMMENT ON TABLE public.tournament_team_members IS
  'Roster rows for a team tournament_entries row. learner_id NULL ⇒ external/guest player. Added 2026-06-22 (Sports Tournament PR2).';

-- updated_at maintenance triggers (reuse the project-wide helper if present).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS trg_tournament_entries_updated_at ON public.tournament_entries;
    CREATE TRIGGER trg_tournament_entries_updated_at
      BEFORE UPDATE ON public.tournament_entries
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

    DROP TRIGGER IF EXISTS trg_tournament_team_members_updated_at ON public.tournament_team_members;
    CREATE TRIGGER trg_tournament_team_members_updated_at
      BEFORE UPDATE ON public.tournament_team_members
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3. RLS — entries & roster inherit access from the parent `events` row (§4).
--    Visibility follows the parent event's scope/visibility (cross-JKKN/public
--    tournaments are visible to all authenticated viewers), NOT a viewer
--    institution match. Writes additionally require sports.tournaments.manage.
--    (Registration writes go through a service-role API route that enforces
--    eligibility + the manage permission in code; these policies are the backstop
--    for any direct browser-client access.)
--    NOTE: NO anon access here. The PR4 public scoreboard will expose a dedicated
--    anon-readable VIEW/RPC over the public-safe fields — never this table.
-- ----------------------------------------------------------------------------

ALTER TABLE public.tournament_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_team_members ENABLE ROW LEVEL SECURITY;

-- ---- tournament_entries policies ----
DROP POLICY IF EXISTS "tournament_entries_select" ON public.tournament_entries;
CREATE POLICY "tournament_entries_select" ON public.tournament_entries
  FOR SELECT USING (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('sports.tournaments.view')
      AND EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = tournament_entries.event_id
          AND (
            e.scope = 'all_jkkn'
            OR e.visibility IN ('all_jkkn', 'public')
            OR role_has_institution_access(e.institution_id)
          )
      )
    )
  );

DROP POLICY IF EXISTS "tournament_entries_insert" ON public.tournament_entries;
CREATE POLICY "tournament_entries_insert" ON public.tournament_entries
  FOR INSERT WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = tournament_entries.event_id
          AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id))
      )
    )
  );

DROP POLICY IF EXISTS "tournament_entries_update" ON public.tournament_entries;
CREATE POLICY "tournament_entries_update" ON public.tournament_entries
  FOR UPDATE USING (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = tournament_entries.event_id
          AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id))
      )
    )
  );

DROP POLICY IF EXISTS "tournament_entries_delete" ON public.tournament_entries;
CREATE POLICY "tournament_entries_delete" ON public.tournament_entries
  FOR DELETE USING (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = tournament_entries.event_id
          AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id))
      )
    )
  );

-- ---- tournament_team_members policies (correlate through entry -> event) ----
DROP POLICY IF EXISTS "tournament_team_members_select" ON public.tournament_team_members;
CREATE POLICY "tournament_team_members_select" ON public.tournament_team_members
  FOR SELECT USING (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('sports.tournaments.view')
      AND EXISTS (
        SELECT 1
        FROM public.tournament_entries te
        JOIN public.events e ON e.id = te.event_id
        WHERE te.id = tournament_team_members.entry_id
          AND (
            e.scope = 'all_jkkn'
            OR e.visibility IN ('all_jkkn', 'public')
            OR role_has_institution_access(e.institution_id)
          )
      )
    )
  );

DROP POLICY IF EXISTS "tournament_team_members_insert" ON public.tournament_team_members;
CREATE POLICY "tournament_team_members_insert" ON public.tournament_team_members
  FOR INSERT WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1
        FROM public.tournament_entries te
        JOIN public.events e ON e.id = te.event_id
        WHERE te.id = tournament_team_members.entry_id
          AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id))
      )
    )
  );

DROP POLICY IF EXISTS "tournament_team_members_update" ON public.tournament_team_members;
CREATE POLICY "tournament_team_members_update" ON public.tournament_team_members
  FOR UPDATE USING (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1
        FROM public.tournament_entries te
        JOIN public.events e ON e.id = te.event_id
        WHERE te.id = tournament_team_members.entry_id
          AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id))
      )
    )
  );

DROP POLICY IF EXISTS "tournament_team_members_delete" ON public.tournament_team_members;
CREATE POLICY "tournament_team_members_delete" ON public.tournament_team_members
  FOR DELETE USING (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1
        FROM public.tournament_entries te
        JOIN public.events e ON e.id = te.event_id
        WHERE te.id = tournament_team_members.entry_id
          AND (e.scope = 'all_jkkn' OR role_has_institution_access(e.institution_id))
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 4. Tighten the sports_coordinator role (item (b)): drop the marathon over-grant.
--    Reaching /events/tournament needs only sports.tournaments.view; a sports
--    coordinator has no business creating marathons. Idempotent: removing an
--    absent key is a no-op.
-- ----------------------------------------------------------------------------
UPDATE public.custom_roles
   SET permissions = (permissions - 'events.marathon.view' - 'events.marathon.create')
 WHERE role_key = 'sports_coordinator';

-- ----------------------------------------------------------------------------
-- Reload PostgREST schema cache so the new tables/columns are exposed immediately.
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK SQL (for reference)
-- ============================================================================
-- DROP TABLE IF EXISTS public.tournament_team_members;   -- drops its RLS + indexes
-- DROP TABLE IF EXISTS public.tournament_entries;        -- drops its RLS + indexes
-- -- (role re-grant, if ever needed:)
-- -- UPDATE public.custom_roles
-- --   SET permissions = permissions || jsonb_build_object('events.marathon.view',true,'events.marathon.create',true)
-- --   WHERE role_key='sports_coordinator';
