-- ─── Event Logistics boards — admit the event's own team, and cross-institution ─
-- 2026-09-16
--
-- Follows 20261220092000 (event_budget_items / BUG-006124), which fixed ONE
-- table. The same defective policy is on four more, all created from the same
-- marathon-era template:
--
--     event_sponsors      marathon_sponsors_auth_all       → Sponsors tab
--     event_committees    marathon_committees_auth_all     → Committees tab
--     event_incidents     marathon_incidents_auth_all      → Incidents tab
--     event_categories    event_categories_auth_all        → event categories
--
-- Each is:
--
--     FOR ALL TO authenticated USING (
--       is_super_admin()
--       OR get_current_user_role() = ANY(ARRAY['super_admin','admin',
--                                              'administrator','event_coordinator'])
--       OR event_id IN (SELECT id FROM events
--                       WHERE institution_id IN (SELECT institution_id FROM profiles
--                                                WHERE id = auth.uid()
--                                                  AND institution_id IS NOT NULL))
--     );
--
-- with NO WITH CHECK, so Postgres reuses USING as the INSERT gate — the write
-- fails with "new row violates row-level security policy", the same error the
-- budget board produced.
--
-- Measured on the live database against "School Zonal 2026" (2026-09-16):
--
--     event_coordinator   in4names=true   sameInst=false   => CREATE: TRUE
--     administrator       in4names=true   sameInst=false   => CREATE: TRUE
--     coo                 in4names=false  sameInst=false   => CREATE: FALSE
--     cao                 in4names=false  sameInst=false   => CREATE: FALSE
--
-- The COO sits at JKKN Main Office and the CAO at JKKN College of Education;
-- neither hosts this event, and no institution-scoped test can ever admit a
-- cross-institution executive to an event held somewhere else. Both would have
-- hit the budget error again on every one of these tabs.
--
-- Excluded from the institution arm just as surely: the event's own APPOINTED
-- IN-CHARGE and its CREATOR, whenever they are borrowed from another college.
-- EventLogistics hands every one of these boards the SAME canManage prop
-- (sports.tournaments.manage OR isIncharge), so the UI shows them the create
-- button and the database then refuses the row.
--
-- ── One key, not four ───────────────────────────────────────────────────────
-- events.logistics.manage covers all four boards because the UI already treats
-- them as one permission: EventLogistics passes a single canManage to each.
-- Splitting the DB gate finer than the UI gate would grant rights nobody can
-- exercise. Budget keeps its own key (events.budget.manage) because it alone
-- has a separate finance sign-off flow (events.budget.approve).
--
-- ADDITIVE: every existing policy is left in place, so nobody loses access.
-- PERMISSIVE policies OR together.
--
-- No BEGIN/COMMIT: applied through exec_sql (scripts/apply-migration-file.mjs).
-- Idempotent.

-- ── 1. The key ──────────────────────────────────────────────────────────────
UPDATE public.custom_roles
   SET permissions = COALESCE(permissions, '{}'::jsonb)
                     || jsonb_build_object('events.logistics.manage', true),
       updated_at  = now()
 WHERE role_key IN ('administrator', 'event_coordinator', 'coo', 'cao')
   AND (permissions->>'events.logistics.manage')::boolean IS NOT TRUE;

-- ── 2. The policy, identical on all four tables ─────────────────────────────
-- Written as a loop because the predicate is the same on every table: all four
-- key off an event_id column. USING and WITH CHECK are stated separately so the
-- write arm is never inherited by accident — the bug this migration exists for.
DO $mig$
DECLARE
  t text;
  predicate constant text := $pred$(
    public.fn_is_event_incharge(event_id)
    OR EXISTS (
         SELECT 1 FROM public.events e
         WHERE e.id = event_id AND e.created_by = (SELECT auth.uid())
       )
    OR (
      (SELECT public.user_has_permission('events.logistics.manage'))
      AND EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = event_id
          AND public.role_has_institution_access(e.institution_id)
      )
    )
  )$pred$;
BEGIN
  FOREACH t IN ARRAY ARRAY['event_sponsors','event_committees',
                           'event_incidents','event_categories']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',
                   t || '_event_team_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING %s WITH CHECK %s',
      t || '_event_team_write', t, predicate, predicate);
    EXECUTE format(
      'COMMENT ON POLICY %I ON public.%I IS %L',
      t || '_event_team_write', t,
      'Read and write this event''s logistics rows: the event in-charge, the event creator, '
      || 'or a holder of events.logistics.manage with access to the owning institution. '
      || 'Added 2026-09-16 alongside the event_budget_items fix (BUG-006124) — the pre-existing '
      || '*_auth_all policy is FOR ALL with USING and no WITH CHECK, so its institution-equality '
      || 'test silently became the INSERT gate, refusing both the in-charge the UI authorises and '
      || 'every cross-institution executive (coo, cao).');
  END LOOP;
END
$mig$;

NOTIFY pgrst, 'reload schema';
