-- ============================================================================
-- Schools Network — Visit Worklist (turn the feeder priority ranking into
-- assigned, nudged, done-gated outreach)
-- File:  20260705130000_schools_network_visit_worklist.sql
-- Date:  2026-07-05
--
-- WHAT THIS MIGRATION DOES (additive + idempotent — safe to re-run):
--   1. Table  school_visit_assignments — one owner (JKKN user) per adopted
--      school for visit outreach. Writes go THROUGH the SECDEF RPCs (or the
--      service-role nudge cron); no INSERT/UPDATE/DELETE RLS policy. Adds a
--      last_nudged_at column the cron stamps so a still-slipping school is not
--      re-nudged inside the realert window.
--   2. fn_schools_network_visit_worklist_core() — the ONE computation. NO user
--      gate: one row per school in `schools` with cycle_delta (feeder momentum,
--      joined by the canonical name key — IDENTICAL key to fn_schools_network_
--      feeders v3.6, KEEP IN SYNC), assigned_to, last_visit (max
--      school_sessions.conducted_at), has_contribution, is_done (visit AND
--      contribution — BOTH required), nudge_eligible (cycle_delta<0 OR last
--      visit older than 60 days / never — BOTH triggers). Granted to
--      service_role only; the two wrappers below reach it as SECDEF owner.
--   3. fn_schools_network_visit_worklist() — thin schools.view-GATED wrapper
--      that SELECTs from _core. This is what the UI/API calls.
--   4. fn_schools_network_nudge_candidates(p_realert_days) — service_role-only
--      cron feed: assigned + nudge_eligible + NOT done + outside the realert
--      window. No user gate (called under the service-role key, which has no
--      auth.uid() to gate on — the whole reason _core exists).
--   5. fn_schools_network_assign_visit(p_school_id, p_assigned_to) —
--      schools.edit-gated upsert of one assignment.
--   6. fn_schools_network_auto_assign_visits() — schools.edit-gated. Pass 1:
--      assign each unassigned school to its active school_jkkn_owners owner
--      (prefer outreach_coordinator). Pass 2: district inheritance — an
--      unassigned school in a district that already has assignments inherits
--      that district's most-common coordinator. Admin fills whatever is left.
--
-- SCOPE NOTE (mirrors the feeder panel, Director ruling carried from #1780):
--   The worklist is an ORG-WIDE operational list of adopted schools + counts +
--   coordinator names. It carries NO learner PII (unlike the roster fn), so it
--   is NOT institution-scoped — every schools.view holder sees the same list.
--   Adopted feeder schools are external (schools.institution_id IS NULL by the
--   ownership CHECK), so an institution filter here would hide the entire
--   worklist from scope='own' users. Do NOT add one.
--
-- ALL new RPCs: SECURITY DEFINER, SET search_path=public, REVOKE anon+PUBLIC,
-- GRANT the intended role only (authenticated / service_role).
-- ============================================================================

-- ─── 1. school_visit_assignments ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.school_visit_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
  assigned_to    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_nudged_at timestamptz,          -- stamped by the nudge cron (realert de-dupe)
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS school_visit_assignments_assigned_to_idx
  ON public.school_visit_assignments (assigned_to) WHERE assigned_to IS NOT NULL;

ALTER TABLE public.school_visit_assignments ENABLE ROW LEVEL SECURITY;

-- Reads for schools.view holders (org-wide, no PII). The worklist fn is SECDEF
-- and reads this internally regardless; this only governs a direct SELECT.
DROP POLICY IF EXISTS school_visit_assignments_select ON public.school_visit_assignments;
CREATE POLICY school_visit_assignments_select ON public.school_visit_assignments
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('schools_network.schools.view')
  );
-- No INSERT/UPDATE/DELETE policy → all writes via the SECDEF RPCs (schools.edit)
-- or the service-role nudge cron. anon gets nothing.
GRANT SELECT ON public.school_visit_assignments TO authenticated;
REVOKE ALL ON public.school_visit_assignments FROM anon;

-- updated_at bump (same trigger fn every Schools Network table uses).
DROP TRIGGER IF EXISTS set_updated_at ON public.school_visit_assignments;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.school_visit_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── 2. _core (the single computation — NO user gate, service_role only) ─────
-- Callable by the two SECDEF wrappers below (they execute as owner, so the
-- invoker's lack of a direct grant does not matter) AND by the nudge cron
-- (service_role). The canonical name key and v_cycle/v_prior momentum here are
-- IDENTICAL to fn_schools_network_feeders v3.6 — KEEP IN SYNC.
CREATE OR REPLACE FUNCTION public.fn_schools_network_visit_worklist_core()
RETURNS TABLE(
  school_id       uuid,
  school_name     text,
  district        text,
  cycle_delta     bigint,
  assigned_to     uuid,
  assigned_to_name text,
  last_visit      timestamptz,
  has_contribution boolean,
  has_session     boolean,
  is_done         boolean,
  nudge_eligible  boolean,
  last_nudged_at  timestamptz,
  total_count     bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cycle int;
  v_prior int;
BEGIN
  -- Active admission cycle + prior comparison year — identical derivation to
  -- fn_schools_network_feeders so cycle_delta matches the discovery panel.
  v_cycle := COALESCE(
    (SELECT max(ay.year) FROM public.admission_years ay
      WHERE ay.year BETWEEN 2000 AND EXTRACT(YEAR FROM now())::int + 1
        AND EXISTS (SELECT 1 FROM public.learners_profiles lp2 WHERE lp2.admission_year_id = ay.id)),
    NULL);
  v_prior := (SELECT max(ay.year) FROM public.admission_years ay
     WHERE ay.year < v_cycle AND ay.year >= 2000
       AND EXISTS (SELECT 1 FROM public.learners_profiles lp2 WHERE lp2.admission_year_id = ay.id));

  RETURN QUERY
  WITH momentum AS (
    -- per RESOLVED feeder key: current-cycle vs prior-cycle enrolled counts
    SELECT COALESCE(al.to_key, base.raw_key) AS k,
           count(*) FILTER (WHERE base.yr = v_cycle) AS cur_n,
           count(*) FILTER (WHERE base.yr = v_prior) AS pri_n
      FROM (
        SELECT (CASE WHEN lp.last_school ~ '[^[:ascii:]]'
                  THEN regexp_replace(trim(lower(lp.last_school)), '\s+', ' ', 'g')
                  ELSE COALESCE(
                    NULLIF(regexp_replace(lower(lp.last_school), '[^a-z0-9]', '', 'g'), ''),
                    regexp_replace(trim(lower(lp.last_school)), '\s+', ' ', 'g'))
                END) AS raw_key,
               ay.year AS yr
          FROM public.learners_profiles lp
          LEFT JOIN public.admission_years ay ON ay.id = lp.admission_year_id
         WHERE lp.last_school IS NOT NULL
           AND length(trim(lp.last_school)) >= 6
           AND lower(lp.last_school) NOT LIKE '%unknown%'
           AND lower(trim(lp.last_school)) NOT IN ('nil','na','n/a','-','nothing')
      ) base
      LEFT JOIN public.schools_network_feeder_aliases al ON al.from_key = base.raw_key
     GROUP BY COALESCE(al.to_key, base.raw_key)
  ),
  base AS (
    -- every adopted feeder school, resolved to its canonical (alias-merged) key.
    -- Adopted feeders are EXTERNAL (institution_id IS NULL by the ownership CHECK);
    -- filter to them so an internal/JKKN-own school (should the `schools` table
    -- ever hold one) can never leak into the worklist / auto-assign / nudges.
    SELECT s.id AS school_id, s.name AS school_name, s.district,
           COALESCE(sa.to_key, skey.k) AS name_key
      FROM public.schools s
      CROSS JOIN LATERAL (
        SELECT (CASE WHEN s.name ~ '[^[:ascii:]]'
                  THEN regexp_replace(trim(lower(s.name)), '\s+', ' ', 'g')
                  ELSE COALESCE(
                    NULLIF(regexp_replace(lower(s.name), '[^a-z0-9]', '', 'g'), ''),
                    regexp_replace(trim(lower(s.name)), '\s+', ' ', 'g'))
                END) AS k
      ) skey
      LEFT JOIN public.schools_network_feeder_aliases sa ON sa.from_key = skey.k
     WHERE s.institution_id IS NULL
  ),
  computed AS (
    SELECT b.school_id, b.school_name, b.district,
           CASE WHEN v_prior IS NULL OR (COALESCE(m.cur_n,0) + COALESCE(m.pri_n,0)) = 0
                THEN NULL ELSE (m.cur_n - m.pri_n) END AS cycle_delta,
           va.assigned_to,
           va.last_nudged_at,
           (SELECT max(ss.conducted_at) FROM public.school_sessions ss
             WHERE ss.school_id = b.school_id) AS last_visit,
           EXISTS (SELECT 1 FROM public.school_contributions sc
                    WHERE sc.school_id = b.school_id) AS has_contribution
      FROM base b
      LEFT JOIN momentum m ON m.k = b.name_key
      LEFT JOIN public.school_visit_assignments va ON va.school_id = b.school_id
  )
  SELECT c.school_id, c.school_name, c.district, c.cycle_delta, c.assigned_to,
         p.full_name AS assigned_to_name,
         c.last_visit,
         c.has_contribution,
         (c.last_visit IS NOT NULL) AS has_session,
         ((c.last_visit IS NOT NULL) AND c.has_contribution) AS is_done,
         -- BOTH triggers: slipping in the ranking (cycle_delta < 0) OR overdue/
         -- never visited. COALESCE(delta,0) so an unmeasurable (NULL) momentum
         -- never counts as "slipping".
         (COALESCE(c.cycle_delta, 0) < 0
           OR c.last_visit IS NULL
           OR c.last_visit < now() - interval '60 days') AS nudge_eligible,
         c.last_nudged_at,
         count(*) OVER () AS total_count
    FROM computed c
    -- profiles.id == auth.users.id (1:1); assigned_to FKs auth.users, so this
    -- resolves the coordinator's display name for the UI.
    LEFT JOIN public.profiles p ON p.id = c.assigned_to
   ORDER BY
     -- worst-first: needs-nudge, then not-done, then most-slipping, then
     -- longest-since-visit; school_id is the stable unique tiebreaker.
     (COALESCE(c.cycle_delta, 0) < 0
       OR c.last_visit IS NULL
       OR c.last_visit < now() - interval '60 days') DESC,
     ((c.last_visit IS NOT NULL) AND c.has_contribution) ASC,
     c.cycle_delta ASC NULLS LAST,
     c.last_visit ASC NULLS FIRST,
     c.school_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schools_network_visit_worklist_core() FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_schools_network_visit_worklist_core() TO service_role;

-- ─── 3. visit_worklist() — schools.view-gated UI/API wrapper ─────────────────
CREATE OR REPLACE FUNCTION public.fn_schools_network_visit_worklist()
RETURNS TABLE(
  school_id       uuid,
  school_name     text,
  district        text,
  cycle_delta     bigint,
  assigned_to     uuid,
  assigned_to_name text,
  last_visit      timestamptz,
  has_contribution boolean,
  has_session     boolean,
  is_done         boolean,
  nudge_eligible  boolean,
  last_nudged_at  timestamptz,
  total_count     bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('schools_network.schools.view')) THEN
    RAISE EXCEPTION 'permission denied for schools_network.schools.view'
      USING ERRCODE = '42501';
  END IF;
  -- SECDEF: this call runs as the function owner, so it reaches _core even
  -- though `authenticated` has no direct grant on it.
  RETURN QUERY SELECT * FROM public.fn_schools_network_visit_worklist_core();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schools_network_visit_worklist() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_schools_network_visit_worklist() TO authenticated;

-- ─── 4. nudge_candidates() — service_role-only cron feed ─────────────────────
CREATE OR REPLACE FUNCTION public.fn_schools_network_nudge_candidates(
  p_realert_days int DEFAULT 7
)
RETURNS TABLE(
  school_id   uuid,
  school_name text,
  assigned_to uuid,
  cycle_delta bigint,
  last_visit  timestamptz,
  reason      text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT c.school_id, c.school_name, c.assigned_to, c.cycle_delta, c.last_visit,
         CASE
           WHEN COALESCE(c.cycle_delta, 0) < 0
             AND (c.last_visit IS NULL OR c.last_visit < now() - interval '60 days')
             THEN 'slipping_and_overdue'
           WHEN COALESCE(c.cycle_delta, 0) < 0 THEN 'slipping'
           ELSE 'overdue'
         END AS reason
    FROM public.fn_schools_network_visit_worklist_core() c
   WHERE c.assigned_to IS NOT NULL
     AND c.nudge_eligible
     AND NOT c.is_done
     AND (c.last_nudged_at IS NULL
          OR c.last_nudged_at < now() - make_interval(days => greatest(1, p_realert_days)));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schools_network_nudge_candidates(int) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_schools_network_nudge_candidates(int) TO service_role;

-- ─── 5. assign_visit() — schools.edit-gated upsert ──────────────────────────
CREATE OR REPLACE FUNCTION public.fn_schools_network_assign_visit(
  p_school_id   uuid,
  p_assigned_to uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('schools_network.schools.edit')) THEN
    RAISE EXCEPTION 'permission denied for schools_network.schools.edit'
      USING ERRCODE = '42501';
  END IF;
  IF p_school_id IS NULL THEN
    RAISE EXCEPTION 'school_id is required';
  END IF;
  -- Only external adopted feeders are on the worklist (institution_id IS NULL);
  -- reject an internal/JKKN-own school so it can't get a never-nudged assignment.
  IF NOT EXISTS (SELECT 1 FROM public.schools s
                  WHERE s.id = p_school_id AND s.institution_id IS NULL) THEN
    RAISE EXCEPTION 'school not found or not an external feeder school';
  END IF;
  -- Enforce the Director "coordinators & owners only" rule server-side (the
  -- picker enforces it only client-side): the assignee must be an active school
  -- owner OR hold an active outreach_coordinator / program_lead role. NULL clears.
  IF p_assigned_to IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.school_jkkn_owners o
        WHERE o.jkkn_user_id = p_assigned_to AND o.is_active
       UNION
       SELECT 1 FROM public.user_roles ur
         JOIN public.custom_roles cr ON cr.id = ur.role_id
        WHERE ur.user_id = p_assigned_to AND cr.is_active
          AND cr.role_key IN ('outreach_coordinator', 'program_lead')
     ) THEN
    RAISE EXCEPTION 'assignee must be an active outreach coordinator or school owner';
  END IF;

  INSERT INTO public.school_visit_assignments (school_id, assigned_to, assigned_by)
  VALUES (p_school_id, p_assigned_to, auth.uid())
  ON CONFLICT (school_id) DO UPDATE
    SET assigned_to = EXCLUDED.assigned_to,
        assigned_by = auth.uid(),
        updated_at  = now();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schools_network_assign_visit(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_schools_network_assign_visit(uuid, uuid) TO authenticated;

-- ─── 6. auto_assign_visits() — schools.edit-gated bulk fill ──────────────────
CREATE OR REPLACE FUNCTION public.fn_schools_network_auto_assign_visits()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count int := 0;
  v_n     int := 0;
BEGIN
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('schools_network.schools.edit')) THEN
    RAISE EXCEPTION 'permission denied for schools_network.schools.edit'
      USING ERRCODE = '42501';
  END IF;

  -- Pass 1 — direct owner: each UNASSIGNED external feeder → its active
  -- school_jkkn_owners owner (prefer outreach_coordinator; else most recent).
  -- "Unassigned" = no row OR a row with assigned_to IS NULL (Unassign leaves the
  -- row with a NULL owner) — so a manually-cleared school can be re-filled, not
  -- skipped forever. institution_id IS NULL keeps it to external feeders.
  WITH candidates AS (
    SELECT s.id AS school_id,
           (SELECT o.jkkn_user_id
              FROM public.school_jkkn_owners o
             WHERE o.school_id = s.id AND o.is_active
             ORDER BY (o.role = 'outreach_coordinator') DESC, o.assigned_at DESC
             LIMIT 1) AS owner_id
      FROM public.schools s
     WHERE s.institution_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.school_visit_assignments va
                        WHERE va.school_id = s.id AND va.assigned_to IS NOT NULL)
  ),
  ins AS (
    INSERT INTO public.school_visit_assignments (school_id, assigned_to, assigned_by)
    SELECT school_id, owner_id, auth.uid() FROM candidates WHERE owner_id IS NOT NULL
    -- re-fill a persisting NULL row; never overwrite an active assignment.
    ON CONFLICT (school_id) DO UPDATE
      SET assigned_to = EXCLUDED.assigned_to,
          assigned_by = EXCLUDED.assigned_by,
          updated_at  = now()
      WHERE public.school_visit_assignments.assigned_to IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM ins;
  v_count := v_count + v_n;

  -- Pass 2 — district inheritance: a still-unassigned school in a district that
  -- already has assignments inherits that district's most-common coordinator.
  -- (Pass 1's inserts are already visible here — separate statements.)
  WITH assigned_by_district AS (
    SELECT s.district, mode() WITHIN GROUP (ORDER BY va.assigned_to) AS common_owner
      FROM public.school_visit_assignments va
      JOIN public.schools s ON s.id = va.school_id
     WHERE va.assigned_to IS NOT NULL AND s.district IS NOT NULL
       AND s.institution_id IS NULL
     GROUP BY s.district
  ),
  district_candidates AS (
    SELECT s.id AS school_id, abd.common_owner AS owner_id
      FROM public.schools s
      JOIN assigned_by_district abd ON abd.district = s.district
     WHERE s.district IS NOT NULL
       AND s.institution_id IS NULL
       AND abd.common_owner IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.school_visit_assignments va
                        WHERE va.school_id = s.id AND va.assigned_to IS NOT NULL)
  ),
  ins2 AS (
    INSERT INTO public.school_visit_assignments (school_id, assigned_to, assigned_by)
    SELECT school_id, owner_id, auth.uid() FROM district_candidates
    ON CONFLICT (school_id) DO UPDATE
      SET assigned_to = EXCLUDED.assigned_to,
          assigned_by = EXCLUDED.assigned_by,
          updated_at  = now()
      WHERE public.school_visit_assignments.assigned_to IS NULL
    RETURNING 1
  )
  SELECT count(*) INTO v_n FROM ins2;
  v_count := v_count + v_n;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schools_network_auto_assign_visits() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_schools_network_auto_assign_visits() TO authenticated;

-- ─── 7. list_assignable_owners() — the assign picker's source (Director ruling) ─
-- The per-row assign picker shows ONLY people already set up for outreach, not
-- every staff member (Director decision 2026-07-05: "coordinators & owners only").
-- Eligible = active school_jkkn_owners OR holders of the outreach_coordinator /
-- program_lead custom role. Small list → the UI fetches it once and filters
-- client-side (no debounced all-staff search, which also fixes the prior empty-
-- picker: that reused searchStaff gated on owners.manage). schools.edit-gated.
CREATE OR REPLACE FUNCTION public.fn_schools_network_list_assignable_owners()
RETURNS TABLE(id uuid, full_name text, email text, role_label text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('schools_network.schools.edit')) THEN
    RAISE EXCEPTION 'permission denied for schools_network.schools.edit'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH people AS (
    -- active school owners / coordinators
    SELECT o.jkkn_user_id AS uid, o.role::text AS r
      FROM public.school_jkkn_owners o
     WHERE o.is_active AND o.jkkn_user_id IS NOT NULL
    UNION
    -- staff explicitly holding the (active) outreach coordinator / program lead
    -- role. cr.is_active so a deactivated role's holders drop out of the picker.
    SELECT ur.user_id AS uid, cr.role_key AS r
      FROM public.user_roles ur
      JOIN public.custom_roles cr ON cr.id = ur.role_id
     WHERE cr.is_active
       AND cr.role_key IN ('outreach_coordinator', 'program_lead')
  ),
  dedup AS (
    -- one row per person; prefer 'outreach_coordinator', then 'program_lead',
    -- then anything else. (min(r) would pick the lexicographically-smallest role,
    -- which is NOT the same as this preference.)
    SELECT uid, (array_agg(r ORDER BY
      CASE r WHEN 'outreach_coordinator' THEN 0
             WHEN 'program_lead'         THEN 1
             ELSE 2 END))[1] AS r
      FROM people GROUP BY uid
  )
  SELECT p.id, p.full_name, p.email,
         CASE d.r
           WHEN 'outreach_coordinator' THEN 'Outreach Coordinator'
           WHEN 'program_lead'         THEN 'Program Lead'
           ELSE initcap(replace(d.r, '_', ' '))
         END AS role_label
    FROM dedup d
    JOIN public.profiles p ON p.id = d.uid
   ORDER BY p.full_name NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_schools_network_list_assignable_owners() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_schools_network_list_assignable_owners() TO authenticated;

-- Expose new table + RPCs to PostgREST immediately.
NOTIFY pgrst, 'reload schema';
