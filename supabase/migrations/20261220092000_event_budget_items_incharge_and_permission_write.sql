-- ─── Event budget lines — admit the event's own team, and cross-institution ──
-- 2026-09-16  ·  BUG-006124
--
-- SYMPTOM: "Add Budget Line" fails with
--   new row violates row-level security policy for table "event_budget_items"
--
-- CAUSE: one policy governs the whole table, and it tests neither a permission
-- nor any relationship to the event:
--
--   CREATE POLICY "marathon_budget_auth_all" ON public.marathon_budget_items
--     FOR ALL TO authenticated USING (
--       event_id IN (SELECT id FROM events
--                    WHERE institution_id IN (SELECT institution_id FROM profiles
--                                             WHERE id = auth.uid()))
--     );
--
-- (marathon_budget_items was later renamed to event_budget_items; the initplan
-- sweep re-stated the same body with the four role names OR'd in front.)
--
-- Two consequences:
--
-- 1. It is FOR ALL with USING and NO WITH CHECK. Postgres then reuses the USING
--    expression as the WITH CHECK for INSERT — which is the error above. The
--    failure is on the WRITE arm, so the user can read the budget they cannot
--    add to, which is exactly what the bug report shows.
--
-- 2. The only non-role test is "the EVENT's institution equals MY institution".
--    That admits every staff member of the host college, including ones with no
--    connection to the event, while EXCLUDING:
--      · the event's appointed in-charge, when borrowed from another college —
--        the very person the UI authorises. EventLogistics receives
--        canManage = (sports.tournaments.manage OR isIncharge) from the
--        tournament page, so BudgetBoard renders "Add Budget Line" for an
--        in-charge and the database then refuses the insert. UI and RLS
--        disagree, and the user meets a raw Postgres error.
--      · the event's creator, on the same grounds.
--      · tier-1 executives (coo, cao) — they sit at JKKN Main Office, and no
--        event is hosted by Main Office, so the institution test never matches
--        for them on ANY event.
--
-- This is the same defect already fixed for the review thread (20261130090000)
-- and the registration list (20261220090000): access gated on a hardcoded role
-- name plus a literal institution equality, rather than on a permission and
-- role_has_institution_access().
--
-- FIX: an ADDITIVE policy. marathon_budget_auth_all is left exactly as it is —
-- PERMISSIVE policies OR together, so nobody who can edit a budget today loses
-- it. This one adds the arms that were missing, and states WITH CHECK
-- explicitly so the write path is not inherited by accident a second time.
--
-- No BEGIN/COMMIT: applied through exec_sql (scripts/apply-migration-file.mjs).
-- Every statement is idempotent.

-- ── 1. The key ──────────────────────────────────────────────────────────────
-- Seeded to the roles that already hold this access through the role-name arm
-- (administrator, event_coordinator — no-ops today, but now visible in Role
-- Management) and to coo / cao, both institution_scope = 'all'.
-- Distinct from the existing events.budget.approve, which is the finance
-- SIGN-OFF gate (fn_submit/approve/reopen_event_budget) — approving a budget
-- and drafting its lines are different acts and should stay separately grantable.
UPDATE public.custom_roles
   SET permissions = COALESCE(permissions, '{}'::jsonb)
                     || jsonb_build_object('events.budget.manage', true),
       updated_at  = now()
 WHERE role_key IN ('administrator', 'event_coordinator', 'coo', 'cao')
   AND (permissions->>'events.budget.manage')::boolean IS NOT TRUE;

-- ── 2. The policy ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "event_budget_items_event_team_write" ON public.event_budget_items;
CREATE POLICY "event_budget_items_event_team_write" ON public.event_budget_items
  FOR ALL TO authenticated
  USING (
    public.fn_is_event_incharge(event_id)
    OR EXISTS (
         SELECT 1 FROM public.events e
         WHERE e.id = event_id
           AND e.created_by = (SELECT auth.uid())
       )
    OR (
      (SELECT public.user_has_permission('events.budget.manage'))
      AND EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = event_id
          AND public.role_has_institution_access(e.institution_id)
      )
    )
  )
  WITH CHECK (
    public.fn_is_event_incharge(event_id)
    OR EXISTS (
         SELECT 1 FROM public.events e
         WHERE e.id = event_id
           AND e.created_by = (SELECT auth.uid())
       )
    OR (
      (SELECT public.user_has_permission('events.budget.manage'))
      AND EXISTS (
        SELECT 1 FROM public.events e
        WHERE e.id = event_id
          AND public.role_has_institution_access(e.institution_id)
      )
    )
  );

COMMENT ON POLICY "event_budget_items_event_team_write" ON public.event_budget_items IS
  'Read and write an event''s budget lines: the event in-charge, the event creator, or a holder of events.budget.manage with access to the owning institution. Added 2026-09-16 for BUG-006124 — the pre-existing marathon_budget_auth_all is FOR ALL with USING and no WITH CHECK, so its institution-equality test became the INSERT gate, refusing the very in-charge the UI shows the Add Budget Line button to. Does not gate the finance sign-off, which stays on events.budget.approve.';

NOTIFY pgrst, 'reload schema';
