-- ============================================================================
-- MBA Teaching-Enterprise · Part 3 · Team Rotation Engine
-- Created: 2026-07-25  (spec: specs/mba-team-rotation-and-faculty-2026-07-25.md)
--
-- DORMANT migration. Ships as a FILE only; the Director applies it AFTER merge
-- (a MyJKKN deploy ships CODE, not DB migrations). Fully idempotent — safe to
-- re-run. Zero residue on prod from the PR itself.
--
-- Reuses the CRRI/internship engine shapes (internship_posting_cycles /
-- internship_assignments / internship_college_blackouts) for the MBA context:
-- manually-built teams rotate through the 14 improvement_areas (departments)
-- over fixed 2-3 week periods, auto-pausing on exam/holiday blackout weeks.
--
-- WHAT THIS DOES
--   1. mba_teams / mba_team_members  — manual teams of MBA Associates.
--   2. mba_rotation_cycles           — a rotation schedule (period length,
--      start, status, config).
--   3. mba_rotation_cycle_departments — which improvement_areas a cycle rotates
--      through (all 14 by default).
--   4. mba_rotation_blackouts        — exam/holiday weeks to skip (mirrors the
--      internship_college_blackouts pattern), scoped per cycle.
--   5. mba_rotation_slots            — the GENERATED rota grid
--      (cycle × team × period → department).
--   6. fn_mba_rotation_generate(cycle, num_periods) — SECDEF, manager-gated:
--      round-robin the active teams across the cycle's departments, skipping
--      blackout windows. Rebuilds the slot grid.
--   7. fn_mba_rotation_apply(cycle)  — SECDEF, service-role ONLY: for the CURRENT
--      period, (re)activate each team member's posting to their team's current
--      department, and EXPIRE the previous period's postings (need-to-know: lose
--      access on rotate-out). Idempotent. Auto-pauses in blackout gaps.
--
-- ACCESS-GATE PRINCIPLE (unchanged): a posting in mba_associate_postings is the
-- access gate to a department's analyst views. This engine FEEDS that table;
-- it does NOT alter fn_mba_analyst_views or the postings table's own schema.
--
-- Part-2 independence: fn_mba_rotation_apply NEVER names mba_associate_postings.
-- include_financial — it relies on that column's DEFAULT (false). So the
-- scheduler works whether or not the Part-2 money-toggle migration is applied.
--
-- MBA program : 43eed6cf-fa51-4e6b-ba93-1b27c4c16df4  (context; not referenced
--               below — teams/cycles are built by hand, departments resolve from
--               the 14 improvement_areas dynamically for DR-safety).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. mba_teams — a manually-built team of MBA Associates.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mba_teams (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  institution_id uuid REFERENCES public.institutions(id),   -- nullable: MBA is single-institution; access is permission-gated, not institution-scoped
  created_by     uuid,                                       -- profiles.id (not FK-enforced, mirrors mba_associate_postings.assigned_by)
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mba_teams IS
  'A manually-built team of MBA Associates that rotates through improvement_areas together. Access is gated by improvement.board.manage (managers CRUD; any authenticated user may read the roster/rota).';

CREATE INDEX IF NOT EXISTS idx_mba_teams_active ON public.mba_teams (is_active);

DROP TRIGGER IF EXISTS trg_mba_teams_updated_at ON public.mba_teams;
CREATE TRIGGER trg_mba_teams_updated_at
  BEFORE UPDATE ON public.mba_teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 2. mba_team_members — which Associate is on which team.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mba_team_members (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id           uuid NOT NULL REFERENCES public.mba_teams(id) ON DELETE CASCADE,
  associate_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, associate_user_id)
);

COMMENT ON TABLE public.mba_team_members IS
  'Membership of MBA Associates in mba_teams. On rotate, every member of a team inherits the team''s current-period department posting.';

CREATE INDEX IF NOT EXISTS idx_mba_team_members_team      ON public.mba_team_members (team_id);
CREATE INDEX IF NOT EXISTS idx_mba_team_members_associate ON public.mba_team_members (associate_user_id);

-- ============================================================================
-- 3. mba_rotation_cycles — a rotation schedule.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mba_rotation_cycles (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  institution_id uuid REFERENCES public.institutions(id),
  period_weeks   integer NOT NULL DEFAULT 2 CHECK (period_weeks BETWEEN 2 AND 3),
  start_date     date NOT NULL,
  status         text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','active','paused','completed')),
  config         jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.mba_rotation_cycles IS
  'A team-rotation schedule: teams cycle through the cycle''s departments in fixed 2-3 week periods from start_date. status draft→active→paused/completed. The daily cron applies only active cycles.';

CREATE INDEX IF NOT EXISTS idx_mba_rotation_cycles_status ON public.mba_rotation_cycles (status);

DROP TRIGGER IF EXISTS trg_mba_rotation_cycles_updated_at ON public.mba_rotation_cycles;
CREATE TRIGGER trg_mba_rotation_cycles_updated_at
  BEFORE UPDATE ON public.mba_rotation_cycles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 4. mba_rotation_cycle_departments — which improvement_areas a cycle visits.
--    All 14 by default (seeded by the UI at cycle creation).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mba_rotation_cycle_departments (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id   uuid NOT NULL REFERENCES public.mba_rotation_cycles(id) ON DELETE CASCADE,
  area_id    uuid NOT NULL REFERENCES public.improvement_areas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, area_id)
);

COMMENT ON TABLE public.mba_rotation_cycle_departments IS
  'The department set a rotation cycle rotates teams through. All 14 improvement_areas by default; a manager may narrow it. Departments with no analyst views are still visited (observe + file ideas).';

CREATE INDEX IF NOT EXISTS idx_mba_rotation_cycle_depts_cycle ON public.mba_rotation_cycle_departments (cycle_id);

-- ============================================================================
-- 5. mba_rotation_blackouts — exam/holiday weeks to skip (per cycle).
--    Mirrors internship_college_blackouts (the EXAM-PAUSE mechanism).
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mba_rotation_blackouts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id     uuid NOT NULL REFERENCES public.mba_rotation_cycles(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  reason       text,
  start_date   date NOT NULL,
  end_date     date NOT NULL,
  is_active    boolean     NOT NULL DEFAULT true,
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mba_rotation_blackouts_valid_dates CHECK (end_date >= start_date)
);

COMMENT ON TABLE public.mba_rotation_blackouts IS
  'Exam/holiday windows a rotation cycle skips when generating slots (reuses the internship_college_blackouts pattern). fn_mba_rotation_generate jumps period windows past any active blackout; today falling in a blackout gap auto-pauses fn_mba_rotation_apply.';

CREATE INDEX IF NOT EXISTS idx_mba_rotation_blackouts_cycle ON public.mba_rotation_blackouts (cycle_id, is_active);

DROP TRIGGER IF EXISTS trg_mba_rotation_blackouts_updated_at ON public.mba_rotation_blackouts;
CREATE TRIGGER trg_mba_rotation_blackouts_updated_at
  BEFORE UPDATE ON public.mba_rotation_blackouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 6. mba_rotation_slots — the GENERATED rota grid.
--    One row per (cycle, team, period): the department that team occupies that
--    period, and the concrete (blackout-adjusted) date window.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.mba_rotation_slots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id      uuid NOT NULL REFERENCES public.mba_rotation_cycles(id) ON DELETE CASCADE,
  team_id       uuid NOT NULL REFERENCES public.mba_teams(id) ON DELETE CASCADE,
  area_id       uuid NOT NULL REFERENCES public.improvement_areas(id) ON DELETE CASCADE,
  period_index  integer NOT NULL,
  period_start  date NOT NULL,
  period_end    date NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, team_id, period_index),
  CONSTRAINT mba_rotation_slots_valid_dates CHECK (period_end >= period_start)
);

COMMENT ON TABLE public.mba_rotation_slots IS
  'The generated rota: for cycle × team × period_index, the department (area_id) that team occupies and its date window. Rebuilt by fn_mba_rotation_generate. Read by the rota chart and fn_mba_rotation_apply.';

CREATE INDEX IF NOT EXISTS idx_mba_rotation_slots_cycle_period ON public.mba_rotation_slots (cycle_id, period_index);
CREATE INDEX IF NOT EXISTS idx_mba_rotation_slots_window       ON public.mba_rotation_slots (cycle_id, period_start, period_end);

-- ============================================================================
-- 7. RLS — managers (improvement.board.manage) CRUD; any authenticated user
--    may READ the roster/rota (the chart is visible to Associates too). The
--    actual analyst DATA stays gated by fn_mba_analyst_views, not these tables.
-- ============================================================================
ALTER TABLE public.mba_teams                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mba_team_members              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mba_rotation_cycles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mba_rotation_cycle_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mba_rotation_blackouts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mba_rotation_slots            ENABLE ROW LEVEL SECURITY;

DO $rls$
DECLARE
  t text;
  mgr text := 'is_super_admin() OR is_admin() OR user_has_permission(''improvement.board.manage'')';
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'mba_teams','mba_team_members','mba_rotation_cycles',
    'mba_rotation_cycle_departments','mba_rotation_blackouts','mba_rotation_slots'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_manage_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (%s) WITH CHECK (%s)',
      t || '_manage_all', t, mgr, mgr);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT USING (auth.uid() IS NOT NULL)',
      t || '_read', t);
  END LOOP;
END
$rls$;

-- ============================================================================
-- 8. fn_mba_rotation_generate — build the rota grid (manager-gated).
--    Round-robins the active teams across the cycle's departments: team i in
--    period p occupies department ((i + p) mod D). Skips any period window that
--    overlaps an active blackout by jumping the window past the blackout.
--    Rebuilds slots for the cycle (delete-then-insert), idempotent.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_mba_rotation_generate(
  p_cycle_id    uuid,
  p_num_periods integer DEFAULT NULL
)
RETURNS TABLE (periods integer, teams integer, departments integer, slots_created integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid       uuid := auth.uid();
  v_period_wk integer;
  v_start     date;
  v_num_dept  integer;
  v_num_team  integer;
  v_periods   integer;
  v_created   integer := 0;
  v_rows      integer;
  v_cursor    date;
  v_win_start date;
  v_win_end   date;
  v_bo_end    date;
  v_guard     integer;
  p_idx       integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('improvement.board.manage')) THEN
    RAISE EXCEPTION 'not authorized: improvement.board.manage required'
      USING ERRCODE = '42501';
  END IF;

  SELECT period_weeks, start_date INTO v_period_wk, v_start
  FROM mba_rotation_cycles WHERE id = p_cycle_id;
  IF v_start IS NULL THEN
    RAISE EXCEPTION 'rotation cycle % not found (or missing start_date)', p_cycle_id;
  END IF;

  -- Ordered departments for this cycle (stable by display_order then label).
  -- DROP-first so the function is safe to call more than once per transaction
  -- (ON COMMIT DROP only fires at commit; a batch caller would otherwise collide).
  DROP TABLE IF EXISTS _depts;
  DROP TABLE IF EXISTS _teams;
  CREATE TEMP TABLE _depts ON COMMIT DROP AS
  SELECT a.id AS area_id,
         (row_number() OVER (ORDER BY a.display_order, a.label)) - 1 AS di
  FROM mba_rotation_cycle_departments cd
  JOIN improvement_areas a ON a.id = cd.area_id
  WHERE cd.cycle_id = p_cycle_id AND a.is_active;
  SELECT count(*) INTO v_num_dept FROM _depts;

  -- Active teams (round-robin participants), stable by creation order.
  CREATE TEMP TABLE _teams ON COMMIT DROP AS
  SELECT t.id AS team_id,
         (row_number() OVER (ORDER BY t.created_at, t.id)) - 1 AS ti
  FROM mba_teams t WHERE t.is_active;
  SELECT count(*) INTO v_num_team FROM _teams;

  -- Regenerate from scratch.
  DELETE FROM mba_rotation_slots WHERE cycle_id = p_cycle_id;

  IF v_num_dept = 0 OR v_num_team = 0 THEN
    RETURN QUERY SELECT 0, v_num_team, v_num_dept, 0;
    RETURN;
  END IF;

  v_periods := COALESCE(p_num_periods, v_num_dept);   -- default: one full rotation
  IF v_periods < 1 THEN v_periods := 1; END IF;

  v_cursor := v_start;
  FOR p_idx IN 0 .. (v_periods - 1) LOOP
    -- Advance to the next period window that clears every active blackout.
    v_guard := 0;
    LOOP
      v_win_start := v_cursor;
      v_win_end   := v_cursor + (v_period_wk * 7 - 1);
      SELECT max(b.end_date) INTO v_bo_end
      FROM mba_rotation_blackouts b
      WHERE b.cycle_id = p_cycle_id
        AND b.is_active
        AND b.start_date <= v_win_end
        AND b.end_date   >= v_win_start;
      EXIT WHEN v_bo_end IS NULL;              -- clean window
      v_cursor := v_bo_end + 1;                -- jump past the blackout, retry
      v_guard  := v_guard + 1;
      IF v_guard > 520 THEN                    -- ~10yr safety valve
        RAISE EXCEPTION 'blackout resolution exceeded safety bound for cycle %', p_cycle_id;
      END IF;
    END LOOP;

    INSERT INTO mba_rotation_slots
      (cycle_id, team_id, area_id, period_index, period_start, period_end)
    SELECT p_cycle_id, t.team_id, d.area_id, p_idx, v_win_start, v_win_end
    FROM _teams t
    JOIN _depts d ON d.di = ((t.ti + p_idx) % v_num_dept);
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_created := v_created + v_rows;

    v_cursor := v_win_end + 1;
  END LOOP;

  RETURN QUERY SELECT v_periods, v_num_team, v_num_dept, v_created;
END;
$fn$;

COMMENT ON FUNCTION public.fn_mba_rotation_generate(uuid, integer) IS
  'Manager-gated (improvement.board.manage) rebuild of a cycle''s rota grid. Round-robins active mba_teams across the cycle''s departments, skipping blackout windows. Returns {periods, teams, departments, slots_created}.';

REVOKE EXECUTE ON FUNCTION public.fn_mba_rotation_generate(uuid, integer) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_mba_rotation_generate(uuid, integer) TO authenticated;

-- ============================================================================
-- 9. fn_mba_rotation_apply — activate current-period postings, expire the
--    previous period's (need-to-know). SERVICE-ROLE ONLY (cron).
--
--    "Current period" = the slot period whose date window contains today. If no
--    period matches (before start, a blackout gap, or past the end) the function
--    writes nothing (auto-pause) and marks the cycle completed once past the end.
--
--    include_financial is deliberately NOT named on the upsert — it relies on
--    the column DEFAULT, keeping this independent of the Part-2 migration.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_mba_rotation_apply(p_cycle_id uuid)
RETURNS TABLE (
  current_period      integer,
  postings_activated  integer,
  postings_expired    integer,
  cycle_status        text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_today     date := current_date;
  v_cur       integer;
  v_activated integer := 0;
  v_expired   integer := 0;
  v_max_end   date;
  v_status    text;
BEGIN
  SELECT status INTO v_status FROM mba_rotation_cycles WHERE id = p_cycle_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'rotation cycle % not found', p_cycle_id;
  END IF;

  -- Which period contains today? (all slots in a period share one window)
  SELECT s.period_index INTO v_cur
  FROM mba_rotation_slots s
  WHERE s.cycle_id = p_cycle_id
    AND s.period_start <= v_today
    AND s.period_end   >= v_today
  ORDER BY s.period_index
  LIMIT 1;

  -- No current period → auto-pause. Complete the cycle if we're past the end.
  IF v_cur IS NULL THEN
    SELECT max(period_end) INTO v_max_end FROM mba_rotation_slots WHERE cycle_id = p_cycle_id;
    IF v_max_end IS NOT NULL AND v_today > v_max_end AND v_status = 'active' THEN
      UPDATE mba_rotation_cycles SET status = 'completed', updated_at = now() WHERE id = p_cycle_id;
      v_status := 'completed';
    END IF;
    RETURN QUERY SELECT NULL::integer, 0, 0, v_status;
    RETURN;
  END IF;

  -- Current-period assignments, restricted to members who currently hold the
  -- active mba_associate role (a member who left the role mid-rotation is
  -- skipped here — their posting is not reactivated, and the RPC denies them).
  -- DROP-first so the function is safe to call more than once per transaction.
  DROP TABLE IF EXISTS _cur;
  DROP TABLE IF EXISTS _prev;
  CREATE TEMP TABLE _cur ON COMMIT DROP AS
  SELECT DISTINCT tm.associate_user_id, s.area_id
  FROM mba_rotation_slots s
  JOIN mba_team_members tm ON tm.team_id = s.team_id
  WHERE s.cycle_id = p_cycle_id
    AND s.period_index = v_cur
    AND EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN custom_roles cr ON cr.id = ur.role_id
      WHERE ur.user_id = tm.associate_user_id
        AND cr.role_key = 'mba_associate'
        AND cr.is_active
    );

  -- Previous-period assignments (ALL members, incl. leavers → they get expired).
  CREATE TEMP TABLE _prev ON COMMIT DROP AS
  SELECT DISTINCT tm.associate_user_id, s.area_id
  FROM mba_rotation_slots s
  JOIN mba_team_members tm ON tm.team_id = s.team_id
  WHERE s.cycle_id = p_cycle_id
    AND s.period_index = v_cur - 1;

  -- ACTIVATE current-period postings (include_financial left to its DEFAULT).
  WITH up AS (
    INSERT INTO mba_associate_postings
      (associate_user_id, area_id, assigned_by, assigned_at, is_active)
    SELECT c.associate_user_id, c.area_id, NULL, now(), true FROM _cur c
    ON CONFLICT (associate_user_id, area_id)
      DO UPDATE SET is_active = true, updated_at = now()
    RETURNING 1
  )
  SELECT count(*) INTO v_activated FROM up;

  -- EXPIRE previous-period postings the member is NOT staying on (need-to-know).
  WITH ex AS (
    UPDATE mba_associate_postings p
       SET is_active = false, updated_at = now()
     WHERE (p.associate_user_id, p.area_id) IN (SELECT associate_user_id, area_id FROM _prev)
       AND (p.associate_user_id, p.area_id) NOT IN (SELECT associate_user_id, area_id FROM _cur)
       AND p.is_active = true
    RETURNING 1
  )
  SELECT count(*) INTO v_expired FROM ex;

  RETURN QUERY SELECT v_cur, v_activated, v_expired, v_status;
END;
$fn$;

COMMENT ON FUNCTION public.fn_mba_rotation_apply(uuid) IS
  'Cron/system-only (service_role). Applies the CURRENT period of a rotation cycle: (re)activates each team member''s posting to their team''s current department, expires the previous period''s postings (need-to-know). Auto-pauses in blackout gaps; completes the cycle past the end. Idempotent.';

-- Cron/system RPC → service_role only (never caller-invokable). CLAUDE.md rule.
REVOKE EXECUTE ON FUNCTION public.fn_mba_rotation_apply(uuid) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_mba_rotation_apply(uuid) TO service_role;

COMMIT;
