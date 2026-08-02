-- ============================================================================
-- Migration: 20260731180200_seed_school_of_influence_policies
-- School of Influence — S1 · config substrate, the 14 seed rows
-- Spec: specs/school-of-influence-batches-2026-07-30.md §4, §5, §7 (S1)
-- ============================================================================
-- CORRECTED 2026-07-31 by 20260808190000 — TWO ROWS DESCRIBED THEMSELVES WRONGLY
--   (1) soi.block_multiple_batches REMOVED (was the 15th row). It rendered an
--       on/off switch for a rule that is an unconditional unique index, so
--       turning it off changed nothing. See the marker comment where it stood.
--   (2) soi.eligible_audiences now stores ui_widget = 'multi_select' (underscore),
--       the token the shared widget dispatcher actually switches on. It was
--       seeded 'multi-select' (hyphen), which only rendered because a UI-side
--       normaliser rewrote it on read.
-- Applying THIS file to a fresh database now needs no follow-up; 20260808190000
-- exists to correct a database that already took the original version.
-- ============================================================================
-- Seeds the 14 School of Influence tunables from spec §4 into platform_policies
-- at scope_type='cohort', with the Director's-view metadata every row needs:
-- ui_widget, ui_category='School of Influence', a plain-English ui_consequence,
-- ui_cascade where a change is visible on another screen, enum_options +
-- ui_options for the pickers, and validation_schema documenting the §4 rules.
--
-- scope_id IS NULL — READ THIS BEFORE COMPARING AGAINST THE SPEC
--   Spec §4's heading reads "scope_id=<cohort_id>", but §7 puts a hard serial
--   edge S1 → S3: the `cohorts` rows for Batch A/B/C are created by S3 and do
--   not exist yet. These 14 rows are therefore seeded as the PROGRAMME-WIDE
--   cohort defaults (scope_type='cohort', scope_id IS NULL). A per-batch row
--   written later at scope_id = that cohorts.id shadows the default — that is
--   exactly the precedence 20260731180000 taught fn_get_policy
--   (user > cohort(scope_id) > institution > role > cohort(default) > global).
--   Nothing is orphaned and no batch has to exist for the config to resolve.
--
-- soi.inactivity.enabled IS SEEDED false — NON-NEGOTIABLE (spec §5)
--   cohort_status_events has 0 rows platform-wide and SF100's grace/escalation
--   settings have never fired once; that inertness is why SF100 sat 4 months
--   with nobody noticing. The evaluator (S7) must always WRITE what it WOULD do
--   and gate the ACTIONS behind this flag. Arming it is a separate Director
--   decision after the dry-run list has been inspected.
--
-- soi.eligible_audiences IS SEEDED ["learner","staff"] — DELIBERATE DEVIATION
--   Spec §4 writes this default using the deprecated synonym for "learner".
--   That synonym is a zero-tolerance term in this codebase
--   (.claude/skills/jkkn-terminologies, enforced by scripts/ci/check-terminology-delta.py),
--   so the canonical token is used instead. This is not merely cosmetic:
--   'learner' is also the value cohort_memberships.member_type accepts
--   (verified live 2026-07-30 against its CHECK constraint) and spec §1
--   mandates member_type='learner'. Seeding 'learner' keeps the audience
--   vocabulary and the membership vocabulary the SAME token, so S4 can compare
--   an applicant audience against a membership type directly, with no mapping
--   table and no silent mismatch.
--
-- classification = 'operational' on all 14, per spec §4 ("operational unless
-- noted"). If the Director wants soi.inactivity.enabled routed through the
-- draft/publish gate instead, that is a one-line follow-up flip to 'major' —
-- deliberately not invented here.
--
-- IDEMPOTENT AND EDIT-SAFE. Guarded on IDENTITY (policy_key + scope), never on
-- value, following supabase/migrations/20260711013000_seed_scf_notes_batch_cap_policy.sql:
-- re-running never resurrects a value the Director has since changed.
--
-- ONE STATEMENT ON PURPOSE. The threshold guard installed by
-- 20260731180100 is an AFTER ROW trigger and nudge < pause < remove is a
-- cross-row rule; a single INSERT lets all three siblings land before the guard
-- evaluates them, so the seed is insert-order-independent.
-- ============================================================================

INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type,
   enum_options, ui_options, validation_schema, classification,
   ui_widget, ui_category, ui_consequence, ui_cascade, is_system, is_active)
SELECT
  s.policy_key,
  'cohort',
  NULL,
  s.value,
  s.description,
  s.data_type,
  s.enum_options,
  s.ui_options,
  s.validation_schema,
  'operational',
  s.ui_widget,
  'School of Influence',
  s.ui_consequence,
  s.ui_cascade,
  false,
  true
FROM (VALUES
  -- ---------------------------------------------------------------- intake ---
  (
    'soi.batch_choice_mode'::text,
    '"staff_assign"'::jsonb,
    'How an accepted applicant ends up in a specific School of Influence batch: the applicant picks, or a coordinator assigns.'::text,
    'enum'::text,
    '["participant_choose","staff_assign"]'::jsonb,
    '[{"value":"participant_choose","label":"Applicants pick their own batch"},{"value":"staff_assign","label":"A coordinator assigns each applicant (default)"}]'::jsonb,
    '{"type":"string","enum":["participant_choose","staff_assign"]}'::jsonb,
    'dropdown'::text,
    'Controls whether applicants pick their own batch or a coordinator assigns them. Switching to participant-choose removes the assignment step but batches may become uneven.'::text,
    '[{"effect":"Participant-choose removes the assignment step from the review queue, so coordinators lose the lever that keeps batch sizes even","severity":"medium"},{"effect":"Participant-choose adds a batch picker to the application form, which then has to respect the open and close dates of each batch","severity":"medium"}]'::jsonb
  ),
  (
    'soi.batch_capacity',
    '30'::jsonb,
    'Maximum number of members one School of Influence batch may hold.',
    'number',
    NULL,
    NULL,
    '{"type":"integer","minimum":1}'::jsonb,
    'number',
    'The most people one batch can hold. Once reached, new applicants are handled by the rule below.',
    '[{"effect":"Lowering this below the current headcount removes nobody, but every further applicant is diverted by the batch-full rule","severity":"medium"},{"effect":"Raising it admits more people per batch and lengthens the attendance list a coordinator ticks each session","severity":"low"}]'::jsonb
  ),
  (
    'soi.batch_full_behaviour',
    '"offer_another_batch"'::jsonb,
    'What the intake does with an applicant once their batch has reached soi.batch_capacity.',
    'enum',
    '["waitlist","offer_another_batch"]'::jsonb,
    '[{"value":"waitlist","label":"Hold them on a waiting list"},{"value":"offer_another_batch","label":"Point them to a batch that still has room (default)"}]'::jsonb,
    '{"type":"string","enum":["waitlist","offer_another_batch"]}'::jsonb,
    'dropdown',
    'What happens when a batch is full: hold applicants on a waiting list, or point them to a batch that still has room.',
    '[{"effect":"A waiting list leaves applicants with no access until a place frees up, so somebody has to work that list","severity":"high"},{"effect":"Offering another batch fills quieter batches automatically, but an applicant may not get the batch they asked for","severity":"medium"}]'::jsonb
  ),
  (
    'soi.require_approval',
    'true'::jsonb,
    'Whether submitting the application form is an application only (a coordinator must accept) or grants access straight away.',
    'boolean',
    NULL,
    NULL,
    '{"type":"boolean"}'::jsonb,
    'toggle',
    'When on, submitting the form is an application only — nobody gets access until a coordinator accepts them. Turning this off admits everyone who is eligible, immediately.',
    '[{"effect":"Turning this off empties the coordinator review queue and grants programme access the moment a form is submitted","severity":"high"},{"effect":"With approval off there is no rejection step left, so the rejection-reason setting stops governing anything","severity":"low"}]'::jsonb
  ),
  (
    'soi.eligible_audiences',
    '["learner","staff"]'::jsonb,
    'Which JKKN audiences may apply. No external or public applicants (decision 4). Values match cohort_memberships.member_type.',
    'array',
    '["learner","staff"]'::jsonb,
    '[{"value":"learner","label":"Learners"},{"value":"staff","label":"Staff"}]'::jsonb,
    '{"type":"array","items":{"type":"string","enum":["learner","staff"]},"minItems":1}'::jsonb,
    'multi_select',
    'Who may apply. Removing ''staff'' hides the programme from staff logins.',
    '[{"effect":"Removing an audience hides the apply button from those logins; people already in a batch keep the access they have","severity":"high"},{"effect":"An empty list would leave nobody able to apply, so at least one audience has to stay selected","severity":"high"}]'::jsonb
  ),
  (
    'soi.intake_dates_per_batch',
    'true'::jsonb,
    'Whether each batch carries its own application open and close dates, or one window covers the whole programme (decision 13).',
    'boolean',
    NULL,
    NULL,
    '{"type":"boolean"}'::jsonb,
    'toggle',
    'When on, each batch opens and closes applications on its own dates. When off, one set of dates covers the whole programme.',
    '[{"effect":"Turning this off makes every batch share one application window, so a batch can no longer open late or close early on its own","severity":"medium"}]'::jsonb
  ),
  -- ---------------------------------------------------------------- roster ---
  (
    'soi.transfer_staff_only',
    'true'::jsonb,
    'Whether only a coordinator may move a member between batches (decision 7). History is preserved either way.',
    'boolean',
    NULL,
    NULL,
    '{"type":"boolean"}'::jsonb,
    'toggle',
    'When on, only a coordinator can move someone between batches; the record keeps the full history either way.',
    NULL
  ),
  -- soi.block_multiple_batches WAS SEEDED HERE AND HAS BEEN REMOVED — do not
  -- restore it. Decision 10 is enforced by uniq_soi_one_active_batch_per_person
  -- (20260808130000), an UNCONDITIONAL partial unique index that consults no
  -- policy value, so the row could only ever render a switch that did nothing.
  -- Removed by 20260808190000; see that file for the full reasoning and for the
  -- sweep proving no code reads the key.
  (
    'soi.roster.visible_to_batchmates',
    'true'::jsonb,
    'Whether members of a batch can see each other. Staff always can; the roster is never public (decision 14).',
    'boolean',
    NULL,
    NULL,
    '{"type":"boolean"}'::jsonb,
    'toggle',
    'When on, people in a batch can see each other''s names. When off, only staff see the list. Never public either way.',
    '[{"effect":"Turning this off hides the member list from everyone except staff; the roster is never public in either setting","severity":"medium"}]'::jsonb
  ),
  -- ------------------------------------------------------- inactivity (§5) ---
  (
    'soi.inactivity.enabled',
    'false'::jsonb,
    'Master switch for the reminder / pause / remove engine. SEEDED false per spec §5: the evaluator always records what it WOULD do in cohort_status_events; only the actions are gated by this flag. Arming it is a separate Director decision after the dry-run list has been inspected.',
    'boolean',
    NULL,
    NULL,
    '{"type":"boolean"}'::jsonb,
    'toggle',
    '⚠ Master switch for automatic reminders, pausing and removal. Leave OFF until the dry-run has been checked — when off, the system still records who has gone quiet but takes no action.',
    '[{"effect":"Turning this on lets the engine actually remind, pause and remove people, so the three day settings stop being a preview and start acting on real members","severity":"high"},{"effect":"While it is off the engine still records who has gone quiet, so the dry-run list stays accurate and can be inspected before arming","severity":"low"}]'::jsonb
  ),
  (
    'soi.inactivity.nudge_days',
    '7'::jsonb,
    'Days of no recorded attendance before a reminder is due. Must be smaller than soi.inactivity.pause_days — enforced by trg_guard_soi_policy_thresholds.',
    'number',
    NULL,
    NULL,
    '{"type":"integer","lessThanPolicy":"soi.inactivity.pause_days"}'::jsonb,
    'number',
    'Days of no attendance before the person gets a reminder.',
    '[{"effect":"Shortening this reminds people sooner but risks nudging someone who simply missed one session","severity":"medium"},{"effect":"It has to stay smaller than the pause value; the database rejects a change that breaks that order","severity":"high"}]'::jsonb
  ),
  (
    'soi.inactivity.pause_days',
    '14'::jsonb,
    'Days of no recorded attendance before access is paused. Must sit between soi.inactivity.nudge_days and soi.inactivity.remove_days — enforced by trg_guard_soi_policy_thresholds.',
    'number',
    NULL,
    NULL,
    '{"type":"integer","greaterThanPolicy":"soi.inactivity.nudge_days","lessThanPolicy":"soi.inactivity.remove_days"}'::jsonb,
    'number',
    'Days of no attendance before access is paused. Must be larger than the reminder value.',
    '[{"effect":"Pausing hides the programme pages from that person until a coordinator restores them","severity":"high"},{"effect":"It has to sit between the reminder and removal values; the database rejects a change that breaks that order","severity":"high"}]'::jsonb
  ),
  (
    'soi.inactivity.remove_days',
    '28'::jsonb,
    'Days of no recorded attendance before the member is removed from the batch. Must be larger than soi.inactivity.pause_days — enforced by trg_guard_soi_policy_thresholds.',
    'number',
    NULL,
    NULL,
    '{"type":"integer","greaterThanPolicy":"soi.inactivity.pause_days"}'::jsonb,
    'number',
    'Days of no attendance before the person is removed from the batch. Must be larger than the pause value.',
    '[{"effect":"Removal frees a place in the batch, so the next waiting applicant can be admitted","severity":"medium"},{"effect":"A removed member drops off the attendance list and out of the completion figures for that batch","severity":"high"}]'::jsonb
  ),
  -- --------------------------------------------------- completion & review ---
  (
    'soi.completion.min_attendance_pct',
    '75'::jsonb,
    'Share of sessions a member must attend to be recorded as having completed the programme (decision 9). Greater than 0 and at most 100 — enforced by trg_guard_soi_policy_thresholds.',
    'number',
    NULL,
    NULL,
    '{"type":"integer","exclusiveMinimum":0,"maximum":100}'::jsonb,
    'number',
    'The share of sessions someone must attend to be recorded as having completed the programme. Changing this changes who is eligible for a certificate.',
    '[{"effect":"Raising the bar moves people out of the completed list, including people already marked complete once the figure is recomputed","severity":"high"},{"effect":"Lowering it records more people as having completed, and certificate eligibility is read from that record","severity":"high"}]'::jsonb
  ),
  (
    'soi.rejection.reason_required',
    'true'::jsonb,
    'Whether a coordinator must type a reason before rejecting an application, which the applicant then sees (decision 12).',
    'boolean',
    NULL,
    NULL,
    '{"type":"boolean"}'::jsonb,
    'toggle',
    'When on, a coordinator must type a reason before rejecting an application, and the applicant sees it.',
    '[{"effect":"Turning this off lets an application be rejected with no explanation, and the applicant is shown nothing","severity":"medium"}]'::jsonb
  )
) AS s(policy_key, value, description, data_type, enum_options, ui_options,
       validation_schema, ui_widget, ui_consequence, ui_cascade)
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies p
  WHERE p.policy_key = s.policy_key
    AND p.scope_type = 'cohort'
    AND p.scope_id IS NULL
);

-- ROLLBACK (down migration) — removes only the programme-wide defaults this
-- migration seeded; any per-batch override written later is left untouched:
--   DELETE FROM public.platform_policies
--    WHERE scope_type = 'cohort'
--      AND scope_id IS NULL
--      AND policy_key LIKE 'soi.%';
