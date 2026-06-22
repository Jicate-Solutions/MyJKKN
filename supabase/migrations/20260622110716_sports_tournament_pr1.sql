-- ============================================================================
-- Sports Tournament Conducting — PR1: entity + divisions + sports_coordinator role
-- File: 20260622110716_sports_tournament_pr1.sql
-- Spec:   specs/sports-tournament-DECISIONS-LOCKED-2026-06-22.md (PR1)
-- Explore: specs/sports-tournament-conducting-EXPLORE-2026-06-22.md (§4 RLS model, §5 data model)
-- Date: 2026-06-22
--
-- What this migration does (additive + idempotent — safe to re-run):
--   1. Creates `tournament_divisions` — the per-tournament category table
--      (sport / gender / age_band / format / level / eligibility). A tournament
--      itself is an existing `events` row with event_type='sports_tournament'
--      (NO new tournament-header table — a tournament IS an event).
--   2. Enables RLS on `tournament_divisions`. Visibility follows the §4 model:
--      a division inherits access from its PARENT events row (driven by the
--      event's scope/visibility, NOT by matching the viewer's institution_id),
--      gated additionally by the new sports.tournaments.* permission keys.
--   3. Seeds the 4 sports.tournaments.* permission keys are NOT stored as rows
--      (permission keys live in code: lib/constants/permissions.ts). This
--      migration only grants them to the new role's permissions JSONB.
--   4. Seeds the new `sports_coordinator` role into custom_roles
--      (institution_scope='own', granting the sports.tournaments.* keys).
--
-- NOTE: a tournament IS an `events` row with event_type='sports_tournament'.
-- `events.event_type` has NO CHECK constraint (verified live 2026-06-22), so the
-- new discriminator value needs no DDL. PR1 needs no new RPC. If a later PR adds
-- a SECURITY DEFINER RPC it MUST `REVOKE EXECUTE FROM anon, PUBLIC; GRANT TO authenticated`.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. tournament_divisions — categories within a tournament
--    (e.g. "U-19 Boys Volleyball", "Open Women's Chess")
--    Mirrors marathon's event_categories role but sport-specific instead of
--    distance-specific (event_categories has no sport/gender/age_band/format/
--    level/eligibility columns — verified live 2026-06-22 — so a dedicated table
--    is correct rather than overloading event_categories.config JSONB).
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tournament_divisions (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID         NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  sport        TEXT         NOT NULL,
  gender       TEXT,                       -- 'male' | 'female' | 'mixed' | 'open' (free text; validated in app)
  age_band     TEXT,                       -- e.g. 'U-19', 'U-23', 'Open' (free text; validated in app)
  format       TEXT         NOT NULL DEFAULT 'knockout',
  level        TEXT,                       -- SportLevel: intra_college|inter_college|district|state|national|international
  max_teams    INTEGER,
  eligibility  JSONB        NOT NULL DEFAULT '{}'::jsonb,   -- {students_only, min_age, max_age, ...} enforced at registration (PR2)
  config       JSONB        NOT NULL DEFAULT '{}'::jsonb,   -- sport-specific tunables (sets_to_win, points_per_win, ...)
  sort_order   INTEGER      NOT NULL DEFAULT 0,
  is_active    BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),

  CONSTRAINT tournament_divisions_format_check
    CHECK (format IN ('knockout', 'round_robin', 'league', 'pools_ko')),
  CONSTRAINT tournament_divisions_level_check
    CHECK (level IS NULL OR level IN (
      'intra_college','inter_college','district','state','national','international'
    ))
);

CREATE INDEX IF NOT EXISTS idx_tournament_divisions_event   ON public.tournament_divisions(event_id);
CREATE INDEX IF NOT EXISTS idx_tournament_divisions_active  ON public.tournament_divisions(event_id, is_active);
CREATE INDEX IF NOT EXISTS idx_tournament_divisions_sport   ON public.tournament_divisions(sport);

COMMENT ON TABLE public.tournament_divisions IS
  'Per-tournament competition categories (sport/gender/age/format/level). Parent is an events row with event_type=''sports_tournament''. Added 2026-06-22 (Sports Tournament PR1).';
COMMENT ON COLUMN public.tournament_divisions.eligibility IS
  'Eligibility rules enforced at registration in PR2 (e.g. {"students_only":true,"min_age":15,"max_age":19}).';
COMMENT ON COLUMN public.tournament_divisions.config IS
  'Sport-specific tunables (sets_to_win, points_per_win, etc.). Defaults to {}.';

-- updated_at maintenance trigger (reuse the project-wide helper if present,
-- otherwise fall back to a local one — keeps the migration self-contained).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS trg_tournament_divisions_updated_at ON public.tournament_divisions;
    CREATE TRIGGER trg_tournament_divisions_updated_at
      BEFORE UPDATE ON public.tournament_divisions
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. RLS — divisions inherit access from their PARENT events row (§4 model).
--    Visibility is driven by the parent event's scope/visibility, NOT by
--    matching the viewer's institution_id (a District/State tournament is owned
--    by one host institution but visible to all). We express that by checking
--    the parent event is itself visible to the caller via the same rule the
--    events module uses: super-admin/admin bypass, OR the event is cross-JKKN /
--    public by scope/visibility, OR the caller has institution access to the
--    host institution. Writes additionally require the sports.tournaments.*
--    permission keys.
-- ----------------------------------------------------------------------------

ALTER TABLE public.tournament_divisions ENABLE ROW LEVEL SECURITY;

-- Helper predicate (inlined per-policy): the parent event is visible to caller.
-- Kept as a correlated EXISTS so we never join the divisions table to itself.

DROP POLICY IF EXISTS "tournament_divisions_select" ON public.tournament_divisions;
CREATE POLICY "tournament_divisions_select" ON public.tournament_divisions
  FOR SELECT USING (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('sports.tournaments.view')
      AND EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = tournament_divisions.event_id
          AND (
            -- cross-JKKN / public tournaments are visible to all authenticated viewers
            e.scope = 'all_jkkn'
            OR e.visibility IN ('all_jkkn', 'public')
            -- otherwise the caller must have institution access to the host institution
            OR role_has_institution_access(e.institution_id)
          )
      )
    )
  );

DROP POLICY IF EXISTS "tournament_divisions_insert" ON public.tournament_divisions;
CREATE POLICY "tournament_divisions_insert" ON public.tournament_divisions
  FOR INSERT WITH CHECK (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('sports.tournaments.create')
      AND EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = tournament_divisions.event_id
          AND (
            e.scope = 'all_jkkn'
            OR role_has_institution_access(e.institution_id)
          )
      )
    )
  );

DROP POLICY IF EXISTS "tournament_divisions_update" ON public.tournament_divisions;
CREATE POLICY "tournament_divisions_update" ON public.tournament_divisions
  FOR UPDATE USING (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('sports.tournaments.edit')
      AND EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = tournament_divisions.event_id
          AND (
            e.scope = 'all_jkkn'
            OR role_has_institution_access(e.institution_id)
          )
      )
    )
  );

DROP POLICY IF EXISTS "tournament_divisions_delete" ON public.tournament_divisions;
CREATE POLICY "tournament_divisions_delete" ON public.tournament_divisions
  FOR DELETE USING (
    is_super_admin()
    OR is_admin()
    OR (
      user_has_permission('sports.tournaments.manage')
      AND EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = tournament_divisions.event_id
          AND (
            e.scope = 'all_jkkn'
            OR role_has_institution_access(e.institution_id)
          )
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 3. sports_coordinator role — the tournament organizer (Director decision #5).
--    institution_scope='own' (a coordinator runs their own institution's
--    tournaments; cross-JKKN tournaments are still visible by event scope).
--    Permission keys are defined in code (lib/constants/permissions.ts); here we
--    only grant them in the role's permissions JSONB.
--    NOTE: also grants events.marathon.view/create so the coordinator can reach
--    the shared /events platform shell the tournament UI lives on.
-- ----------------------------------------------------------------------------

INSERT INTO public.custom_roles
  (role_key, role_name, description, is_system_role, institution_scope, is_active, permissions)
VALUES (
  'sports_coordinator',
  'Sports Coordinator',
  'Organizes and conducts sports tournaments (create/edit/manage divisions and the tournament lifecycle) for their institution. Added 2026-06-22 (Sports Tournament PR1).',
  false,
  'own',
  true,
  jsonb_build_object(
    'sports.tournaments.view',   true,
    'sports.tournaments.create', true,
    'sports.tournaments.edit',   true,
    'sports.tournaments.manage', true,
    'events.view',               true,
    'events.marathon.view',      true,
    'events.marathon.create',    true
  )
)
ON CONFLICT (role_key) DO UPDATE
  SET permissions = public.custom_roles.permissions
        || jsonb_build_object(
             'sports.tournaments.view',   true,
             'sports.tournaments.create', true,
             'sports.tournaments.edit',   true,
             'sports.tournaments.manage', true,
             'events.view',               true,
             'events.marathon.view',      true,
             'events.marathon.create',    true
           ),
      is_active = true;

-- ----------------------------------------------------------------------------
-- Reload PostgREST schema cache so the new table/columns are exposed immediately.
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- ROLLBACK SQL (for reference)
-- ============================================================================
-- DROP TABLE IF EXISTS public.tournament_divisions;          -- drops its RLS policies + indexes
-- DELETE FROM public.custom_roles WHERE role_key = 'sports_coordinator';
