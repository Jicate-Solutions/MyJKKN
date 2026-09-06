-- Seed: curriculum_ai.dryout_threshold — config row for the empty-BoS dry-out
-- guard in app/api/cron/curriculum-lesson-spine-generate (2026-07-26).
--
-- WHY: four BoS-covered course targets with EMPTY syllabi ({"units":[]} +
-- {"clos":[]}) cycled 3-5 delivered model refusals each between 2026-07-16 and
-- 2026-07-26 (e.g. 24UZOGE01, 26PCHC04) — the model refuses honestly every
-- time, no drafts are minted, the course stays a candidate, and every weekly
-- submit run re-enqueues it. After this many delivered same-content refusals
-- for a course whose syllabus is still empty, the cron stops re-enqueueing it
-- and surfaces the parked state (response skipped_dried_out + dried_out[]).
-- The course re-qualifies AUTOMATICALLY once its syllabus content changes
-- (content fingerprint comparison, never a timestamp).
--
-- The cron reads this via fn_get_policy_int with an in-code default of 3, so
-- behaviour is identical whether or not this seed has been applied.
-- FILE ONLY at PR time — application is Director-gated.
--
-- Guarded on IDENTITY (policy_key + global scope), never on value, so a later
-- Director edit is never resurrected by re-running this seed. WHERE NOT EXISTS
-- (not ON CONFLICT) because platform_policies' uniqueness is an EXPRESSION
-- index (42P10 pattern, receipt 2026-07-25).
INSERT INTO public.platform_policies
  (policy_key, scope_type, value, data_type, description, is_system, is_active,
   classification, publication_state, ui_widget, ui_category)
SELECT * FROM (VALUES
  ('curriculum_ai.dryout_threshold','global','3'::jsonb,'number',
   'Empty-BoS dry-out guard: after this many delivered AI refusals for a course whose BoS syllabus has no substance (no units, no CLOs), the weekly lesson-spine bulk-mint cron stops re-enqueueing that course until its syllabus content actually changes. The course re-qualifies automatically the moment content is added — no manual reset.',
   false, true, 'operational','published','number','curriculum_ai')
) v(policy_key, scope_type, value, data_type, description, is_system, is_active,
    classification, publication_state, ui_widget, ui_category)
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies p WHERE p.policy_key = v.policy_key AND p.scope_type = 'global');
