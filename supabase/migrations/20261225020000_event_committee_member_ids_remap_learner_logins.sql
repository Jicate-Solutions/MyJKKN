-- ─── Event committees — member_ids back to login ids ────────────────────────
-- 2026-09-18 · BUG-006132
--
-- A student sports in-charge could not assign a committee task:
--   insert on event_tasks violates marathon_tasks_assigned_to_fkey
--   Key is not present in table "profiles".
--
-- The member picker's directory returned `member_id: l.profile_id ?? l.id`. For
-- a learner whose learners_profiles.profile_id is NULL (1,121 active learners)
-- that stored the learners_profiles ROW id in event_committees.member_ids. The
-- assignee dropdown then sent it as event_tasks.assigned_to, which references
-- profiles(id). The same ids also failed fn_is_event_committee_member and
-- fn_has_any_tournament_role, so those students were silently not treated as
-- committee members either. The directory is fixed in code; this repairs the
-- rows already written.
--
-- Every such learner does have a login: the reverse link profiles.learner_id
-- resolves all of them (learners_profiles.profile_id is the unreliable
-- direction). Prod on 2026-09-18: 17 array entries across 2 events resolve this
-- way, no learner maps to two profiles, and no remap creates a duplicate within
-- a committee. The migration 20260801002500 backfill only followed
-- lp.profile_id, which is exactly the side that is NULL here, so it skipped them.
--
-- Positions are preserved, so member_names (a parallel array) stays aligned.
-- Ids that resolve through neither direction (2 on e9b0197b, not learner rows)
-- are left untouched: there is no login to point them at.
--
-- No BEGIN/COMMIT: applied through exec_sql (scripts/apply-migration-file.mjs).
-- Idempotent — a second run finds nothing to remap.

UPDATE public.event_committees c
   SET member_ids = remapped.ids
  FROM (
    SELECT c2.id,
           array_agg(COALESCE(p.id, m.mid) ORDER BY m.ord) AS ids
      FROM public.event_committees c2
     CROSS JOIN LATERAL unnest(c2.member_ids) WITH ORDINALITY AS m(mid, ord)
      LEFT JOIN public.profiles p
             ON p.learner_id = m.mid
            AND NOT EXISTS (SELECT 1 FROM public.profiles px WHERE px.id = m.mid)
     GROUP BY c2.id
  ) AS remapped
 WHERE remapped.id = c.id
   AND remapped.ids IS DISTINCT FROM c.member_ids;
