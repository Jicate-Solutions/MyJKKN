-- ============================================================================
-- 20271008110106_hr_playbooks_review_followup.sql
-- ----------------------------------------------------------------------------
-- Follow-up to the review of #4229 (20271007161139_hr_duty_playbooks_and_lessons).
-- FILE ONLY — not applied by its author. It changes two functions and adds one
-- helper; it creates no table and no policy.
--
-- 1. MEDIUM — one bad HR form date stopped the whole G2 harvest.
--    fn_hr_duty_lessons_harvest read each approval_history entry's time with
--    (e->>'at')::timestamptz. The shape test before it lets an impossible date
--    such as '2026-13-45T25:99' through, and the cast then raises; the source's
--    handler turns that into {"G2": {"error": ...}}, so no G2 lesson is gathered
--    and the weekly cron answers 500 until that entry is older than 35 days.
--    Now the time goes through fn_hr_duty_safe_timestamptz, which returns NULL
--    for a value it cannot read, and only that entry is skipped. Every other
--    line of the harvest is unchanged.
--
-- 2. LOW — accepting a line with a note over 500 characters hit the
--    decision_note CHECK (an opaque 23514). fn_hr_playbook_decide now keeps the
--    first 500 characters on accept, as decline already did. Nothing else in
--    the function changed.
--
-- DRIFT CHECK. 20271007161139 may or may not have been applied by the time
-- this runs. Before replacing anything, the DO block below compares each
-- function's current body (md5 of prosrc with \r removed and outer space, tab
-- and newline trimmed), SECURITY DEFINER flag and settings with the bytes of
-- 20271007161139 on main — or with this file's own version, so a second run is
-- harmless. Anything else (missing, or edited by hand on this database) RAISEs
-- and nothing is changed.
--   fn_hr_duty_lessons_harvest(timestamptz)        main md5 5a8309ef4140d64a1ad85e240df2de5b
--   fn_hr_playbook_decide(uuid,text,text,text)     main md5 0df19607d4dbe042db23dc8b2ee4bd04
--   this file's versions: harvest 00d4fb3b9b3d5921cdf89e0f86ea4ec7, decide 59adcadba842c9afc35e3132571e690e
-- Both: SECURITY DEFINER, {search_path=public}.
-- ============================================================================

DO $drift$
DECLARE
  r record;
  v record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.fn_hr_duty_lessons_harvest(timestamptz)',
       '5a8309ef4140d64a1ad85e240df2de5b', true, '{search_path=public}',
       '00d4fb3b9b3d5921cdf89e0f86ea4ec7', true, '{search_path=public}'),
      ('public.fn_hr_playbook_decide(uuid,text,text,text)',
       '0df19607d4dbe042db23dc8b2ee4bd04', true, '{search_path=public}',
       '59adcadba842c9afc35e3132571e690e', true, '{search_path=public}')
    ) AS t(fn, main_md5, main_definer, main_config, new_md5, new_definer, new_config)
  LOOP
    SELECT md5(btrim(replace(p.prosrc, E'\r', ''), E' \t\n')) AS body_md5,
           p.prosecdef AS definer,
           coalesce(p.proconfig::text, '') AS config
      INTO v
      FROM pg_proc p
     WHERE p.oid = to_regprocedure(r.fn);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Drift: % does not exist on this database. Apply 20271007161139 first. Nothing was changed.', r.fn;
    END IF;
    IF NOT ((v.body_md5, v.definer, v.config) = (r.main_md5, r.main_definer, r.main_config)
            OR (v.body_md5, v.definer, v.config) = (r.new_md5, r.new_definer, r.new_config)) THEN
      RAISE EXCEPTION 'Drift: % on this database (body md5 %, security definer %, settings %) is neither the definition in 20271007161139 nor the one this file installs. Nothing was changed. Compare it with 20271007161139 before applying 20271008110106.',
        r.fn, v.body_md5, v.definer, v.config;
    END IF;
  END LOOP;
END
$drift$;

-- ----------------------------------------------------------------------------
-- Read a text as timestamptz, or NULL when it cannot be read. Not SECURITY
-- DEFINER (it reads nothing); STABLE because the result depends on the
-- session's time zone. Service role only, like the file's other helpers.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_duty_safe_timestamptz(p_text text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN p_text::timestamptz;
EXCEPTION WHEN data_exception THEN
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_safe_timestamptz(text) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_duty_safe_timestamptz(text) TO service_role;

-- ----------------------------------------------------------------------------
-- 1. The harvest — only the G2 block differs from 20271007161139.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_duty_lessons_harvest(p_since timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out jsonb := '{}'::jsonb;
  v_n   integer;
BEGIN
  IF p_since IS NULL THEN
    RAISE EXCEPTION 'p_since is required' USING ERRCODE = '22004';
  END IF;

  -- L1 — leave: a rejection, or a reversal of an approved request (revoked_at set).
  BEGIN
    INSERT INTO public.hr_duty_lessons
      (duty_code, institution_id, item_table, item_id, kind, reason_code, source, occurred_at)
    SELECT 'L1', s.institution_id, 'hr_leave_applications', a.id, x.kind,
           public.fn_hr_duty_reason_match('L1', x.txt), 'harvest', x.at
      FROM public.hr_leave_applications a
      LEFT JOIN public.staff s ON s.id = a.employee_id
      CROSS JOIN LATERAL (SELECT
        CASE WHEN a.revoked_at IS NOT NULL THEN 'reversal' ELSE 'reject' END AS kind,
        CASE WHEN a.revoked_at IS NOT NULL THEN COALESCE(a.revoke_reason, a.rejection_reason)
             ELSE a.rejection_reason END AS txt,
        CASE WHEN a.revoked_at IS NOT NULL THEN a.revoked_by ELSE a.final_approver_id END AS decider,
        COALESCE(a.revoked_at, a.final_decided_at) AS at) x
     WHERE a.status = 'rejected'
       AND x.at IS NOT NULL AND x.at >= p_since
       AND x.decider IS NOT NULL
       AND NOT public.fn_hr_duty_reason_is_system(x.txt)
    ON CONFLICT (duty_code, item_table, item_id, kind, occurred_at) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_out := v_out || jsonb_build_object('L1', v_n);
  EXCEPTION WHEN undefined_table OR undefined_column OR data_exception THEN
    v_out := v_out || jsonb_build_object('L1', jsonb_build_object('error', SQLERRM));
  END;

  -- L2 — comp-off claims. A claim decided before its decider was recorded
  -- (approved_by NULL) is skipped: nothing tells it apart from the nightly
  -- automatic rejection.
  BEGIN
    INSERT INTO public.hr_duty_lessons
      (duty_code, institution_id, item_table, item_id, kind, reason_code, source, occurred_at)
    SELECT 'L2', s.institution_id, 'hr_comp_off_credits', c.id, x.kind,
           public.fn_hr_duty_reason_match('L2', x.txt), 'harvest', x.at
      FROM public.hr_comp_off_credits c
      LEFT JOIN public.staff s ON s.id = c.employee_id
      CROSS JOIN LATERAL (SELECT
        CASE WHEN c.revoked_at IS NOT NULL THEN 'reversal' ELSE 'reject' END AS kind,
        CASE WHEN c.revoked_at IS NOT NULL THEN COALESCE(c.revoke_reason, c.rejection_reason)
             ELSE c.rejection_reason END AS txt,
        CASE WHEN c.revoked_at IS NOT NULL THEN c.revoked_by ELSE c.approved_by END AS decider,
        COALESCE(c.revoked_at, c.approved_at) AS at) x
     WHERE c.status = 'rejected'
       AND x.at IS NOT NULL AND x.at >= p_since
       AND x.decider IS NOT NULL
       AND NOT public.fn_hr_duty_reason_is_system(x.txt)
    ON CONFLICT (duty_code, item_table, item_id, kind, occurred_at) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_out := v_out || jsonb_build_object('L2', v_n);
  EXCEPTION WHEN undefined_table OR undefined_column OR data_exception THEN
    v_out := v_out || jsonb_build_object('L2', jsonb_build_object('error', SQLERRM));
  END;

  -- A3 — attendance corrections.
  BEGIN
    INSERT INTO public.hr_duty_lessons
      (duty_code, institution_id, item_table, item_id, kind, reason_code, source, occurred_at)
    SELECT 'A3', s.institution_id, 'hr_attendance_regularizations', r.id, 'reject',
           public.fn_hr_duty_reason_match('A3', r.rejection_reason), 'harvest', r.approved_at
      FROM public.hr_attendance_regularizations r
      LEFT JOIN public.staff s ON s.id = r.employee_id
     WHERE r.status = 'rejected'
       AND r.approved_at >= p_since
       AND r.approver_id IS NOT NULL
       AND NOT public.fn_hr_duty_reason_is_system(r.rejection_reason)
    ON CONFLICT (duty_code, item_table, item_id, kind, occurred_at) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_out := v_out || jsonb_build_object('A3', v_n);
  EXCEPTION WHEN undefined_table OR undefined_column OR data_exception THEN
    v_out := v_out || jsonb_build_object('A3', jsonb_build_object('error', SQLERRM));
  END;

  -- S2 — document verification.
  BEGIN
    INSERT INTO public.hr_duty_lessons
      (duty_code, institution_id, item_table, item_id, kind, reason_code, source, occurred_at)
    SELECT 'S2', d.institution_id, 'hr_employee_documents', d.id, 'reject',
           public.fn_hr_duty_reason_match('S2', d.verification_notes), 'harvest', d.verified_at
      FROM public.hr_employee_documents d
     WHERE d.verification_status = 'rejected'
       AND d.verified_at >= p_since
       AND d.verified_by IS NOT NULL
       AND NOT public.fn_hr_duty_reason_is_system(d.verification_notes)
    ON CONFLICT (duty_code, item_table, item_id, kind, occurred_at) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_out := v_out || jsonb_build_object('S2', v_n);
  EXCEPTION WHEN undefined_table OR undefined_column OR data_exception THEN
    v_out := v_out || jsonb_build_object('S2', jsonb_build_object('error', SQLERRM));
  END;

  -- S3 — team member photographs.
  BEGIN
    INSERT INTO public.hr_duty_lessons
      (duty_code, institution_id, item_table, item_id, kind, reason_code, source, occurred_at)
    SELECT 'S3', p.institution_id, 'hr_staff_photo_submissions', p.id, 'reject',
           public.fn_hr_duty_reason_match('S3', p.review_note), 'harvest', p.reviewed_at
      FROM public.hr_staff_photo_submissions p
     WHERE p.status = 'rejected'
       AND p.reviewed_at >= p_since
       AND p.reviewed_by IS NOT NULL
       AND NOT public.fn_hr_duty_reason_is_system(p.review_note)
    ON CONFLICT (duty_code, item_table, item_id, kind, occurred_at) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_out := v_out || jsonb_build_object('S3', v_n);
  EXCEPTION WHEN undefined_table OR undefined_column OR data_exception THEN
    v_out := v_out || jsonb_build_object('S3', jsonb_build_object('error', SQLERRM));
  END;

  -- G2 — HR forms: each 'reject' entry in approval_history made by a person
  -- (actor_id set; the service writes the actor of every entry).
  BEGIN
    INSERT INTO public.hr_duty_lessons
      (duty_code, institution_id, item_table, item_id, kind, reason_code, source, occurred_at)
    SELECT 'G2', f.institution_id, 'hr_form_submissions', f.id, 'reject',
           public.fn_hr_duty_reason_match('G2', e->>'reason'), 'harvest', t.at
      FROM public.hr_form_submissions f
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(f.approval_history) = 'array' THEN f.approval_history ELSE '[]'::jsonb END
      ) e
      -- the entry's time, or NULL when it does not read as a date: the shape
      -- test keeps out words such as 'yesterday' or 'now' that Postgres would
      -- accept, and the safe parse turns an impossible date such as
      -- '2026-13-45T25:99' into NULL instead of an error (20271008110106)
      CROSS JOIN LATERAL (SELECT CASE
        WHEN (e->>'at') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}'
        THEN public.fn_hr_duty_safe_timestamptz(e->>'at') END AS at) t
     WHERE e->>'action' = 'reject'
       AND NULLIF(btrim(e->>'actor_id'), '') IS NOT NULL
       AND NOT public.fn_hr_duty_reason_is_system(e->>'reason')
       -- only entries whose time reads as a date; one malformed entry is
       -- skipped and must not stop the whole source
       AND t.at IS NOT NULL AND t.at >= p_since
    ON CONFLICT (duty_code, item_table, item_id, kind, occurred_at) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_out := v_out || jsonb_build_object('G2', v_n);
  EXCEPTION WHEN undefined_table OR undefined_column OR data_exception THEN
    v_out := v_out || jsonb_build_object('G2', jsonb_build_object('error', SQLERRM));
  END;

  RETURN v_out;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_lessons_harvest(timestamptz) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_hr_duty_lessons_harvest(timestamptz) TO service_role;

-- ----------------------------------------------------------------------------
-- 2. Decide — only decision_note on accept differs from 20271007161139.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_playbook_decide(
  p_id uuid, p_decision text, p_edited_text text, p_note text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok   boolean;
  v_uid  uuid := auth.uid();
  v_p    public.hr_playbook_line_proposals%ROWTYPE;
  v_text text;
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_pos  integer;
  v_line uuid;
BEGIN
  -- 1. NULL from either check must refuse, so test IS NOT TRUE, never NOT (a OR b).
  v_ok := public.is_super_admin() OR public.user_has_permission('hr.harness.playbooks.manage');
  IF v_ok IS NOT TRUE OR v_uid IS NULL THEN
    RAISE EXCEPTION 'Only the HR head can decide playbook lines.' USING ERRCODE = '42501';
  END IF;

  -- 2. Must still be waiting.
  SELECT * INTO v_p FROM public.hr_playbook_line_proposals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_p.status <> 'proposed' THEN
    RAISE EXCEPTION 'This proposal was already %.', v_p.status USING ERRCODE = '55000';
  END IF;

  -- 3. Nobody decides their own suggestion.
  IF v_p.suggested_by = v_uid THEN
    RAISE EXCEPTION 'You cannot decide your own suggestion. Another person with this duty must decide it.'
      USING ERRCODE = '42501';
  END IF;

  IF p_decision = 'accept' THEN
    v_text := COALESCE(NULLIF(btrim(COALESCE(p_edited_text, '')), ''), v_p.proposed_text);
    IF char_length(v_text) NOT BETWEEN 10 AND 240 THEN
      RAISE EXCEPTION 'A playbook line is 10 to 240 characters.' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(max(position), 0) + 1 INTO v_pos
      FROM public.hr_playbook_lines WHERE duty_code = v_p.duty_code AND status = 'active';

    -- 4. Credit: the suggester for a suggestion; the decider for a drafted line.
    --    If the decider changed the words, they are named too (edited_by), so a
    --    rewritten line is never shown as the suggester's alone.
    INSERT INTO public.hr_playbook_lines
      (duty_code, line_text, position, status, authored_by, source, source_proposal_id,
       lesson_count, accepted_by, accepted_at, edited_by)
    VALUES
      (v_p.duty_code, v_text, v_pos, 'active',
       CASE WHEN v_p.source = 'suggestion' THEN v_p.suggested_by ELSE v_uid END,
       v_p.source, v_p.id,
       CASE WHEN v_p.source = 'lesson_pattern' THEN (v_p.evidence->>'count')::integer END,
       v_uid, now(),
       CASE WHEN v_text <> v_p.proposed_text THEN v_uid END)
    RETURNING id INTO v_line;

    UPDATE public.hr_playbook_line_proposals
       SET status = 'accepted', decided_by = v_uid, decided_at = now(),
           decision_note = left(v_note, 500),
           edited_text = CASE WHEN v_text <> v_p.proposed_text THEN v_text END
     WHERE id = v_p.id;
    RETURN v_line;

  ELSIF p_decision = 'decline' THEN
    -- 5. A decline says why.
    IF v_note IS NULL THEN
      RAISE EXCEPTION 'Please write a short note saying why this line is declined.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.hr_playbook_line_proposals
       SET status = 'declined', decided_by = v_uid, decided_at = now(), decision_note = left(v_note, 500)
     WHERE id = v_p.id;
    RETURN v_p.id;

  ELSE
    RAISE EXCEPTION 'Decision must be accept or decline.' USING ERRCODE = '22023';
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_hr_playbook_decide(uuid, text, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_playbook_decide(uuid, text, text, text) TO authenticated;
