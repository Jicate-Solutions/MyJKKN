-- ─── Committee leads may run their own committee's task list ────────────────
-- 2026-09-21
--
-- On the JKKN100 chess & carrom tournament, eleven committees were set up with
-- a named lead each, and not one of them could add a task to their own
-- committee. Only the eight event in-charges could. Thirty-four committee
-- members and nine of the eleven leads saw the board with no "Add a task" box
-- at all, because CommitteesBoard gates that box on canManage — super admin,
-- sports.tournaments.manage, or event in-charge. A lead is none of those.
--
-- There has been a policy for this since the marathon days:
--
--   marathon_tasks_lead_manage ON event_tasks
--     FOR ALL USING (committee_id IN (SELECT id FROM event_committees
--                                     WHERE lead_id = auth.uid()))
--
-- It has never once fired. lead_id is NULL on all 61 committees in production,
-- because the only way to name a lead is the free-text "Lead (name)" box in
-- Add Committee, which writes lead_name and nothing else. The rule was written
-- against a column the UI never fills.
--
-- ── Why lead_ids and not lead_id ───────────────────────────────────────────
-- Five of this event's eleven committees name TWO leads in that text box —
-- "SNEKA & HARINI", "MURALIDHARAN & MANIKANDAN", "SRIKARAN & PRANESHKUMAR".
-- A single lead_id cannot express what the organisers are already doing, so a
-- lead_ids uuid[] is added alongside it. lead_id keeps working and keeps its
-- meaning; nothing that reads it changes.
--
-- lead_name stays the display string. It is what the card shows and what the
-- name-matching read policies compare against, and rewriting those is a
-- separate job.
--
-- ── What this migration does ───────────────────────────────────────────────
--   1. event_committees.lead_ids uuid[] NOT NULL DEFAULT '{}'
--   2. marathon_tasks_lead_manage  — a lead may write their committee's tasks
--   3. marathon_tasks_committee_member_read — a lead may read them
--   4. marathon_committees_member_read — a lead may read their own committee
--   5. fn_is_event_committee_member — a lead counts as a member of the event
--
-- Each widening is ONE new OR arm: auth.uid() = ANY(lead_ids). No existing arm
-- is touched, so nobody loses access. A committee with no lead_ids (every
-- committee today) behaves exactly as it does now — '{}' matches no one.
--
-- Authority to ADD or REMOVE a lead is unchanged: that is a committee-roster
-- write, which still goes through the committees API route behind
-- canManageEventOps. A lead cannot appoint another lead.
--
-- ci:allow-secdef-authenticated SELF-SCOPED: fn_is_event_committee_member takes
-- only an event id and answers whether auth.uid() belongs to one of its
-- committees. authenticated must hold EXECUTE because the RLS policies and the
-- UI gates both call it as the signed-in user.
--
-- No BEGIN/COMMIT: applied through exec_sql (a PL/pgSQL function, where
-- explicit transaction control is illegal). Idempotent.

-- ── 1. The column ───────────────────────────────────────────────────────────
ALTER TABLE public.event_committees
  ADD COLUMN IF NOT EXISTS lead_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

COMMENT ON COLUMN public.event_committees.lead_ids IS
  'Login ids (profiles.id) of this committee''s leads, picked from the MyJKKN directory. A lead may create, edit and delete their own committee''s prep tasks. lead_name remains the free-text display string; lead_id is the legacy single-lead column and is still honoured.';

-- ── 2. Leads may write their own committee's tasks ──────────────────────────
DROP POLICY IF EXISTS "marathon_tasks_lead_manage" ON public.event_tasks;
CREATE POLICY "marathon_tasks_lead_manage" ON public.event_tasks
  FOR ALL TO authenticated
  USING (
    committee_id IN (
      SELECT c.id FROM public.event_committees c
      WHERE c.lead_id = (SELECT auth.uid())
         OR (SELECT auth.uid()) = ANY (c.lead_ids)
    )
  )
  WITH CHECK (
    committee_id IN (
      SELECT c.id FROM public.event_committees c
      WHERE c.lead_id = (SELECT auth.uid())
         OR (SELECT auth.uid()) = ANY (c.lead_ids)
    )
  );

COMMENT ON POLICY "marathon_tasks_lead_manage" ON public.event_tasks IS
  'A committee lead (event_committees.lead_id, or listed in lead_ids) may create, edit and delete the prep tasks of that committee, and no other. Separate from fn_can_manage_committee_tasks, which grants the whole event.';

-- ── 3. Leads may read their committee's tasks ───────────────────────────────
-- Writing rows you cannot then see is a worse bug than not being able to write.
DROP POLICY IF EXISTS "marathon_tasks_committee_member_read" ON public.event_tasks;
CREATE POLICY "marathon_tasks_committee_member_read" ON public.event_tasks
  FOR SELECT TO authenticated
  USING (
    committee_id IN (
      SELECT c.id
      FROM public.event_committees c
      WHERE c.lead_id = (SELECT auth.uid())
        OR (SELECT auth.uid()) = ANY (c.lead_ids)
        OR (SELECT auth.uid()) = ANY (c.member_ids)
        OR c.lead_name IN (
             SELECT p.full_name FROM public.profiles p
             WHERE p.id = (SELECT auth.uid()) AND p.full_name IS NOT NULL
           )
        OR EXISTS (
             SELECT 1 FROM public.profiles p
             WHERE p.id = (SELECT auth.uid())
               AND p.full_name IS NOT NULL
               AND p.full_name = ANY (c.member_names)
           )
    )
  );

-- ── 4. Leads may read their own committee row ───────────────────────────────
DROP POLICY IF EXISTS "marathon_committees_member_read" ON public.event_committees;
CREATE POLICY "marathon_committees_member_read" ON public.event_committees
  FOR SELECT TO authenticated
  USING (
    lead_id = (SELECT auth.uid())
    OR (SELECT auth.uid()) = ANY (lead_ids)
    OR (SELECT auth.uid()) = ANY (member_ids)
    OR lead_name IN (
         SELECT p.full_name FROM public.profiles p
         WHERE p.id = (SELECT auth.uid()) AND p.full_name IS NOT NULL
       )
    OR EXISTS (
         SELECT 1 FROM public.profiles p
         WHERE p.id = (SELECT auth.uid())
           AND p.full_name IS NOT NULL
           AND p.full_name = ANY (event_committees.member_names)
       )
  );

-- ── 5. A lead counts as a committee member of the event ─────────────────────
-- Backs the "view + tasks" tier in useTournamentAccess and the event API gates,
-- so a lead who is not an in-charge can still open the event at all.
CREATE OR REPLACE FUNCTION public.fn_is_event_committee_member(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.event_committees mc
    WHERE mc.event_id = p_event_id
      AND (
        mc.lead_id = auth.uid()
        OR auth.uid() = ANY(mc.lead_ids)
        OR auth.uid() = ANY(mc.member_ids)
        OR EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
            AND p.full_name IS NOT NULL
            AND (p.full_name = mc.lead_name OR p.full_name = ANY(mc.member_names))
        )
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_is_event_committee_member(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_is_event_committee_member(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
