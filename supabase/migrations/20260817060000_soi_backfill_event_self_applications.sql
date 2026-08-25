-- School of Influence — reclassify the applications that came in through the
-- WRONG DOOR, so the programme's own console can see them.
--
-- ── WHAT HAPPENED ────────────────────────────────────────────────────────────
-- The SoI apply flow (spec §7 S4) writes events_registrations rows stamped
-- `source = 'soi_apply'`, `status = 'pending'`. Every SoI surface — the review
-- queue (fn_soi_list_applications), acceptance (fn_soi_prepare_acceptance),
-- rejection (fn_soi_reject_application), the waiting list — filters on exactly
-- that stamp.
--
-- The 17 people who signed up for "JKKN School of Influencer" never went
-- through that door. They used the events module's GENERIC registration form
-- (POST /api/events/[eventId]/public-register), which stamps
-- `source = 'event_self'`, `status = 'registered'`. Both doors write the same
-- table, so the rows look healthy in the database and are invisible to every
-- screen the coordinators actually open. Platform-wide there has never been a
-- single `source = 'soi_apply'` row.
--
-- ── WHAT THIS DOES ───────────────────────────────────────────────────────────
-- Restamps those rows as the applications they plainly are, and synthesises the
-- `custom_data.soi` envelope the S4 insert would have written, so the review and
-- acceptance RPCs read them without any change to the RPCs themselves.
--
-- Their ANSWERS are already intact: all 17 carry form_id and a populated
-- custom_fields, which is where fn_soi_list_applications reads answers from.
-- Nothing about what anybody wrote is touched here.
--
-- ── WHAT THIS DELIBERATELY DOES NOT DO ───────────────────────────────────────
-- Two of the 17 registered while signed out and carry no profile_id. Their
-- typed emails match NO profiles row, so there is nothing to link them to.
-- They are restamped like the rest — a coordinator must be able to SEE that
-- they applied — but fn_soi_prepare_acceptance already refuses a row with a null
-- profile_id, in words ("not linked to a MyJKKN account … ask the applicant to
-- apply again while signed in"). That refusal is the correct outcome and is left
-- exactly as it is. Guessing an identity from a typed email address is the
-- precise failure this module was built to prevent: SF100's 23 fabricated roster
-- rows (audit 2026-07-27) came from somebody typing other people's details in.
-- `audiences` is therefore left EMPTY for those two rather than asserting a
-- member type nobody established.
--
-- ── REVERSIBLE ───────────────────────────────────────────────────────────────
-- Every touched row is marked custom_data.soi.backfill, carrying its original
-- source and status. To undo:
--
--   UPDATE public.events_registrations r
--      SET source = r.custom_data -> 'soi' -> 'backfill' ->> 'original_source',
--          status = r.custom_data -> 'soi' -> 'backfill' ->> 'original_status',
--          custom_data = r.custom_data - 'soi'
--    WHERE r.custom_data -> 'soi' ? 'backfill';
--
-- Scoped to ONE event id on purpose. This is a repair of a specific intake, not
-- a rule: the durable fix is to stop the SoI event offering the generic
-- registration form at all, which is a separate change.

UPDATE public.events_registrations r
SET
  source = 'soi_apply',
  -- 'pending' is inside events_registrations_status_check and is the exact
  -- status fn_soi_list_applications treats as awaiting review.
  status = 'pending',
  custom_data = COALESCE(r.custom_data, '{}'::jsonb) || jsonb_build_object(
    'soi', jsonb_build_object(
      -- Member type, derived from the account the row is ALREADY linked to —
      -- never from anything the applicant typed. Empty when there is no account,
      -- because then nobody has established one.
      'audiences',
        CASE
          WHEN r.profile_id IS NULL THEN '[]'::jsonb
          WHEN EXISTS (SELECT 1 FROM public.profiles p
                        WHERE p.id = r.profile_id AND p.learner_id IS NOT NULL)
            THEN jsonb_build_array('learner')
          ELSE jsonb_build_array('staff')
        END,
      -- Read from the live policy rather than hardcoded, so this row agrees with
      -- whatever the programme is actually set to. Under 'staff_assign' a NULL
      -- requested batch is correct and expected: the coordinator picks the batch
      -- at acceptance time.
      'batch_choice_mode', public.fn_get_policy_text('soi.batch_choice_mode', 'staff_assign', NULL),
      -- These people were never shown a batch chooser, so they asked for none.
      'requested_batch_cohort_id', NULL,
      'requested_batch_name', NULL,
      'require_approval', true,
      -- When they actually signed up, not when this migration ran — the queue
      -- orders oldest-first so that whoever waited longest is seen first.
      'applied_at', to_jsonb(r.created_at),
      'backfill', jsonb_build_object(
        'reason', 'Registered through the generic event form before the School of Influence apply door was in use; restamped so the programme console can see the application.',
        'original_source', r.source,
        'original_status', r.status,
        'backfilled_at', to_jsonb(now()),
        'migration', '20260817060000_soi_backfill_event_self_applications'
      )
    )
  )
WHERE r.event_id = '84a49ec4-8fc8-44f9-a6a1-e84df5330f07'::uuid
  AND r.source = 'event_self'
  AND r.status = 'registered'
  -- Never touch a row that already carries an SoI envelope.
  AND NOT (COALESCE(r.custom_data, '{}'::jsonb) ? 'soi');
