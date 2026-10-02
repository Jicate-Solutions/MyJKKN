-- Admissions — a "Certificate Submitted" checklist for every programme that has
-- newly admitted learners (BUG-006182, Director's ruling 29 Sep 2026)
--
-- WHY. BUG-006182 (admission office, 19 Sep): "Certificate Submitted checklist is
-- not visible for newly admitted candidates." #4072 fixed the stages a checklist
-- can target; this adds the checklist itself, which never existed (production
-- held one test checklist, "tsetsdfsdf1").
--
-- THE DIRECTOR'S ANSWERS (Bugs desk interview, 29 Sep, by tap):
--   · the desk creates the checklist, rather than the admission office;
--   · on EVERY programme that has newly admitted learners (42 on 29 Sep, 36 on
--     30 Sep: the set is computed when this runs, not frozen here);
--   · a standard list of four certificates. The list is the desk's guess, which
--     he accepted; the office edits it on Settings → Admission checklists.
--
-- SHAPE.
--   · One checklist per programme, scope_type 'program', so each programme's
--     office can change its own list without touching the others.
--   · applies_to_lifecycle = account, reserved, admitted: the stages a newly
--     admitted candidate is in (#4072). Not enquiry: the report is about admitted
--     candidates.
--   · Every item is is_required = false, so a wrong guess blocks nobody.
--   · created_by stays NULL (a migration has no user); nothing reads it — the
--     select policies gate on permissions only.
--
-- RE-RUNNABLE. A programme that already has an active checklist with this name is
-- skipped, and items are only added to checklists this file creates.
--
-- Additive only: no DROP, DELETE or UPDATE.

DO $certificate_submitted$
DECLARE
  v_program uuid;
  v_checklist uuid;
  v_created integer := 0;
BEGIN
  FOR v_program IN
    SELECT DISTINCT lp.program_id
      FROM public.learners_profiles lp
     WHERE lp.lifecycle_status::text IN ('account', 'reserved', 'admitted')
       AND lp.program_id IS NOT NULL
       AND NOT EXISTS (
             SELECT 1
               FROM public.admission_checklists c
              WHERE c.scope_type = 'program'
                AND c.scope_id = lp.program_id
                AND c.name = 'Certificate Submitted'
                AND c.is_active
           )
  LOOP
    INSERT INTO public.admission_checklists
      (scope_type, scope_id, name, description, applies_to_lifecycle, is_active)
    VALUES
      ('program', v_program, 'Certificate Submitted',
       'Original certificates the admission office has received from the candidate.',
       ARRAY['account', 'reserved', 'admitted'], true)
    RETURNING id INTO v_checklist;

    INSERT INTO public.admission_checklist_items
      (checklist_id, title, order_index, is_required, is_active)
    VALUES
      (v_checklist, '10th mark sheet',              1, false, true),
      (v_checklist, '12th mark sheet',              2, false, true),
      (v_checklist, 'Transfer Certificate (TC)',    3, false, true),
      (v_checklist, 'Community certificate',        4, false, true);

    v_created := v_created + 1;
  END LOOP;

  RAISE NOTICE 'Certificate Submitted checklists created: %', v_created;
END
$certificate_submitted$;

-- Assert the end state: every programme with a newly admitted learner now has
-- the checklist (an error if not); a checklist whose item count differs from
-- four only raises a NOTICE.
DO $certificate_submitted_assert$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.learners_profiles lp
     WHERE lp.lifecycle_status::text IN ('account', 'reserved', 'admitted')
       AND lp.program_id IS NOT NULL
       AND NOT EXISTS (
             SELECT 1
               FROM public.admission_checklists c
              WHERE c.scope_type = 'program'
                AND c.scope_id = lp.program_id
                AND c.name = 'Certificate Submitted'
                AND c.is_active
           )
  ) THEN
    RAISE EXCEPTION 'a programme with newly admitted learners has no Certificate Submitted checklist';
  END IF;

  -- A NOTICE, not an error: once the office edits a copy (adds or retires an
  -- item) the count legitimately differs, and a re-apply must not fail on that.
  IF EXISTS (
    SELECT 1
      FROM public.admission_checklists c
     WHERE c.name = 'Certificate Submitted'
       AND c.scope_type = 'program'
       AND c.created_by IS NULL
       AND (SELECT count(*) FROM public.admission_checklist_items i
             WHERE i.checklist_id = c.id AND i.is_active) <> 4
  ) THEN
    RAISE NOTICE 'a Certificate Submitted checklist does not have exactly four active items (edited by the office?)';
  END IF;
END
$certificate_submitted_assert$;
