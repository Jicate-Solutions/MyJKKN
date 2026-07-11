-- ─── Student tournament browsing + manage-grant narrowing ────────────────────
-- 2026-07-10 (applied via MCP as `tournament_student_browse_and_grant_narrowing`)
--
-- (a) NEW KEY `sports.tournaments.browse` — lets a student open a read-only page
--     listing tournaments that are open for registration. Deliberately NOT
--     `sports.tournaments.view`: that key gates the ADMIN subtree, whose detail
--     page renders sponsors (₹ pledged/received), the full budget, committees,
--     volunteers, incidents and every entrant's payment status.
--
-- (b) NEW RPC `fn_open_tournaments()` — the only data source for that page.
--     Returns PII-free tournament + division rows scoped to the caller's
--     institution (or all-JKKN tournaments). No entries, no payments, no budget.
--     Registration itself continues to go through the existing public-register
--     endpoint, which enforces the open window + eligibility server-side.
--
-- (c) GRANT NARROWING — 14 roles held sports.tournaments.manage, including
--     `faculty` (441 users) and `hod` (72). Because delete is gated on .manage,
--     and .manage is the only non-super-admin key allowed to appoint in-charges
--     (fn_guard_event_privileged_fields tier 1), those roles could delete any
--     tournament and grant themselves control of one. Per-tournament control is
--     what the in-charge appointment is for. Full control now stays with the
--     sports + admin tier; everyone else keeps read-only `view`.

-- ── (a) grant the browse key ──
UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('sports.tournaments.browse', true),
       updated_at  = now()
 WHERE role_key IN ('student', 'graduated_student')
   AND NOT (permissions ? 'sports.tournaments.browse');

-- Roles that keep view also get browse, so they can see the student view.
UPDATE public.custom_roles
   SET permissions = permissions || jsonb_build_object('sports.tournaments.browse', true),
       updated_at  = now()
 WHERE permissions ? 'sports.tournaments.view'
   AND NOT (permissions ? 'sports.tournaments.browse');

-- ── (c) narrow create/edit/manage to the sports + admin tier ──
UPDATE public.custom_roles
   SET permissions = (permissions
                       - 'sports.tournaments.create'
                       - 'sports.tournaments.edit'
                       - 'sports.tournaments.manage'),
       updated_at  = now()
 WHERE role_key IN (
   'faculty', 'hod', 'chief_warden', 'hostel_office',
   'seo', 'digital_coordinator', 'cdc_coordinator'
 );

-- ── (b) open-tournament feed for the student page ──
-- SECURITY DEFINER because tournament_divisions RLS requires sports.tournaments.view,
-- which students deliberately do not hold. Self-authorizing: requires a logged-in
-- caller and clamps rows to that caller's institution (or all-JKKN scope).
CREATE OR REPLACE FUNCTION public.fn_open_tournaments()
RETURNS TABLE (
  id uuid, name text, description text, venue text,
  start_date date, end_date date,
  registration_open_date date, registration_close_date date,
  status text, scope text, is_registration_open boolean, divisions jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    e.id, e.name, e.description,
    COALESCE(NULLIF(e.venue, ''), e.venue_text) AS venue,
    e.start_date, e.end_date,
    e.registration_open_date, e.registration_close_date,
    e.status, e.scope,
    (
      (e.registration_open_date  IS NULL OR CURRENT_DATE >= e.registration_open_date)
      AND (e.registration_close_date IS NULL OR CURRENT_DATE <= e.registration_close_date)
    ) AS is_registration_open,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', d.id, 'sport', d.sport, 'gender', d.gender,
               'age_band', d.age_band, 'format', d.format, 'level', d.level,
               'max_teams', d.max_teams,
               'entry_fee', COALESCE((d.config->>'entry_fee')::numeric, 0)
             ) ORDER BY d.sort_order)
        FROM public.tournament_divisions d
       WHERE d.event_id = e.id AND d.is_active
    ), '[]'::jsonb) AS divisions
  FROM public.events e
  WHERE auth.uid() IS NOT NULL
    AND e.event_type = 'sports_tournament'
    AND e.status NOT IN ('draft', 'cancelled', 'archived')
    AND (
      e.scope = 'all_jkkn'
      OR e.institution_id IN (
        SELECT p.institution_id FROM public.profiles p
        WHERE p.id = auth.uid() AND p.institution_id IS NOT NULL
      )
    )
  ORDER BY e.start_date NULLS LAST, e.name;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_open_tournaments() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_open_tournaments() TO authenticated;

COMMENT ON FUNCTION public.fn_open_tournaments() IS
  'PII-free feed of non-draft/cancelled/archived sports tournaments visible to the caller (own institution or all-JKKN), with active divisions and an is_registration_open flag. Backs the student-facing /events/tournaments page. Returns no entries, payments, budget or sponsor data.';
