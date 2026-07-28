-- ─── Backfill: event member ids stored as learners_profiles.id → auth uid ─────
-- 2026-07-21
--
-- BUG (origin fixed in the same change):
--   /api/events/committees/member-directory mapped the picker's `member_id` as
--     staff   -> s.profile_id ?? s.id   (auth uid — correct)
--     student -> l.id                   (learners_profiles.id — WRONG)
--   Every per-event authorization compares that value to auth.uid():
--     fn_is_event_incharge(), fn_is_event_committee_member(),
--     fn_has_any_tournament_role(), and the RLS policies they back.
--   A learners_profiles.id never equals an auth uid, so any STUDENT appointed as
--   a tournament in-charge, committee lead/member or volunteer was silently
--   unauthorized: no error anywhere, the module simply never appeared for them.
--   Staff appointments were unaffected (their branch already used profile_id),
--   which is why the feature looked healthy in testing.
--
-- This migration remaps the already-stored ids. It ONLY touches values that
--   (a) are not a real profiles.id, AND
--   (b) resolve to a learners_profiles row that HAS a linked profile_id.
-- Anything else (valid uids, learners with no login, unknown orphans) is left
-- exactly as-is, so the migration is safe to re-run.
--
-- NOTE: trg_events_guard_privileged_fields gates config->'incharges' writes to
-- super admins, but skips when auth.uid() IS NULL — true for this migration.

-- 1. events.config->'incharges'[].member_id  (tournament in-charges)
WITH remapped AS (
  SELECT e.id AS event_id,
         jsonb_agg(
           CASE WHEN lp.profile_id IS NOT NULL
                THEN jsonb_set(t.i, '{member_id}', to_jsonb(lp.profile_id::text))
                ELSE t.i
           END
           ORDER BY t.ord
         ) AS incharges
  FROM public.events e
  CROSS JOIN LATERAL jsonb_array_elements(e.config->'incharges') WITH ORDINALITY AS t(i, ord)
  LEFT JOIN public.profiles p
         ON (t.i->>'member_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        AND p.id = (t.i->>'member_id')::uuid
  LEFT JOIN public.learners_profiles lp
         ON (t.i->>'member_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
        AND lp.id = (t.i->>'member_id')::uuid
        AND p.id IS NULL
        AND lp.profile_id IS NOT NULL
  WHERE jsonb_typeof(e.config->'incharges') = 'array'
    AND jsonb_array_length(e.config->'incharges') > 0
  GROUP BY e.id
)
UPDATE public.events e
SET config = jsonb_set(e.config, '{incharges}', r.incharges)
FROM remapped r
WHERE e.id = r.event_id
  AND e.config->'incharges' IS DISTINCT FROM r.incharges;

-- 2. event_committees.member_ids (uuid[])
UPDATE public.event_committees c
SET member_ids = s.new_ids
FROM (
  SELECT c2.id,
         ARRAY(
           SELECT COALESCE(lp.profile_id, u.m)
           FROM unnest(c2.member_ids) WITH ORDINALITY AS u(m, ord)
           LEFT JOIN public.profiles p ON p.id = u.m
           LEFT JOIN public.learners_profiles lp
                  ON lp.id = u.m AND p.id IS NULL AND lp.profile_id IS NOT NULL
           ORDER BY u.ord
         ) AS new_ids
  FROM public.event_committees c2
  WHERE COALESCE(array_length(c2.member_ids, 1), 0) > 0
) s
WHERE c.id = s.id
  AND c.member_ids IS DISTINCT FROM s.new_ids;

-- 3. event_committees.lead_id
UPDATE public.event_committees c
SET lead_id = lp.profile_id
FROM public.learners_profiles lp
WHERE c.lead_id IS NOT NULL
  AND lp.id = c.lead_id
  AND lp.profile_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = c.lead_id);

-- 4. event_volunteer_checkins.member_id
UPDATE public.event_volunteer_checkins v
SET member_id = lp.profile_id
FROM public.learners_profiles lp
WHERE v.member_id IS NOT NULL
  AND lp.id = v.member_id
  AND lp.profile_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v.member_id);
