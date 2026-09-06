-- =============================================================================
-- OneMark Wave 2, Lane S follow-up — provisioning + RPC hardening
-- File: 20260918130000_onemark_provisioning_hardening.sql
-- Date: 2026-09-05 (Director ruling 18:20 IST, relayed through the W12 drain)
--
-- 20260918101500 was APPLIED to production at 17:30 IST (Director-authorised).
-- Seven minutes later a Claude Deep Review of PR #3275 landed four HIGH
-- findings against objects that are therefore LIVE. This file fixes them in
-- place. Additive only: CREATE OR REPLACE FUNCTION x2, REVOKE x2, one DO block.
-- No trigger DDL — trg_onemark_provision_school_owner keeps its definition
-- (AFTER INSERT OR UPDATE OF institution_id, role, is_active ON profiles); the
-- UPDATE arm is what now carries de-provisioning.
--
--   1. UPDATE-driven provisioning  → provisioning on INSERT only.
--   2. Nothing ever de-provisioned → UPDATE out of the qualifying shape sets
--      this trigger's own outreach_coordinator owner rows inactive (never
--      user_roles: no is_active column there, and this file deletes nothing).
--   3. fn_onemark_record_response had no row lock → FOR NO KEY UPDATE OF a on
--      the fp_attempts read (serialises with finalize's FOR UPDATE).
--   4. fn_onemark_grade / fn_onemark_apply_vault kept the default EXECUTE grant
--      for service_role → REVOKED. Owner (postgres) still runs them from inside
--      the SECURITY DEFINER RPCs; nothing in app code calls them directly.
--
-- What this does NOT do (disclosed): it does not revoke the school_faculty
-- role on de-provisioning (an admin does that in Role Management), and it does
-- not add a "revoked, never re-insert" sentinel — with INSERT-only provisioning
-- the only re-insert path is a fresh profile INSERT for the same person, which
-- happens once, at first sign-in.
--
-- Rehearsal: BEGIN … ROLLBACK on production via the Management API before the
-- PR was opened; the DO block below re-proves it at apply (catalog checks +
-- a rolled-back behaviour test on one real signed-in owner).
-- Reversal (not recommended): re-run the two CREATE OR REPLACE FUNCTION
-- statements of 20260918101500 §3 and §6b, then
--   GRANT EXECUTE ON FUNCTION public.fn_onemark_grade(jsonb, jsonb),
--     public.fn_onemark_apply_vault(uuid, uuid, uuid, boolean) TO service_role;
-- =============================================================================

-- 1 + 2. Provisioning trigger function -----------------------------------------
CREATE OR REPLACE FUNCTION public.fn_onemark_provision_school_owner()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_institutions jsonb;
  v_school_id    uuid;
  v_role_id      uuid;
BEGIN
  -- Hardening 20260918130000 (Director ruling 2026-09-05 18:20 IST, after the
  -- 12:07Z Deep Review of the applied 20260918101500):
  --   * provisioning happens on INSERT only — the profile INSERT that
  --     migrate_pre_registered_profile_to_auth performs at first sign-in. An
  --     UPDATE never provisions, so editing a profile INTO (listed institution,
  --     faculty|hod|principal, active) no longer self-provisions ownership.
  --   * an UPDATE that takes the profile OUT of that shape (deactivated,
  --     demoted, moved) de-provisions: the outreach_coordinator owner rows
  --     this trigger owns (internal school of a policy-listed institution,
  --     program_partner_id NULL) are set inactive. Every predicate the review
  --     named — user_owns_school, fn_fp_manages_school, fn_fp_can_view_student,
  --     fn_fp_can_manage_student — requires o.is_active (read live 2026-09-05),
  --     so the standing ends with the row. user_roles is NOT touched: it has no
  --     is_active column and this file deletes nothing; the school_faculty role
  --     is permission keys only and gates nothing without an active owner row.
  --   * a profile moved between two listed institutions keeps qualifying but
  --     gets NO new owner row (INSERT-only); its rows at the old institution's
  --     school go inactive. Today only Nattraja is listed.
  IF TG_OP = 'UPDATE' THEN
    DECLARE
      v_keep_institution uuid;
      v_qualifies        boolean;
      v_touched          int;
    BEGIN
      v_institutions := public.fn_get_policy_json('onemark.provision.institution_ids', '[]'::jsonb);
      IF v_institutions IS NULL OR jsonb_typeof(v_institutions) <> 'array' THEN
        v_institutions := '[]'::jsonb;
      END IF;
      v_qualifies := NEW.institution_id IS NOT NULL
                     AND NEW.role IN ('faculty', 'hod', 'principal')
                     AND COALESCE(NEW.is_active, false) IS TRUE
                     AND (v_institutions ? NEW.institution_id::text);
      v_keep_institution := CASE WHEN v_qualifies THEN NEW.institution_id END;

      UPDATE public.school_jkkn_owners o
         SET is_active = false
       WHERE o.jkkn_user_id = NEW.id
         AND o.is_active
         AND o.role = 'outreach_coordinator'::public.school_owner_role
         AND o.program_partner_id IS NULL
         AND o.school_id IN (
               SELECT s.id
                 FROM public.schools s
                WHERE s.ownership = 'internal'::public.school_ownership
                  AND (v_institutions ? s.institution_id::text)
                  AND (v_keep_institution IS NULL OR s.institution_id <> v_keep_institution)
             );
      GET DIAGNOSTICS v_touched = ROW_COUNT;
      IF v_touched > 0 THEN
        RAISE WARNING '[onemark provision] profile % (institution %, role %, active %): % owner row(s) deactivated — no longer qualifies here', NEW.id, NEW.institution_id, NEW.role, NEW.is_active, v_touched;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[onemark provision] profile % de-provisioning failed: % (%)', NEW.id, SQLERRM, SQLSTATE;
    END;
    RETURN NULL;
  END IF;

  -- TG_OP = 'INSERT' from here: the applied 20260918101500 body, unchanged.
  -- Cheap exits first: this trigger sits on a 7,000-row table that every
  -- sign-in touches.
  IF NEW.institution_id IS NULL
     OR NEW.role IS NULL
     OR NEW.role NOT IN ('faculty', 'hod', 'principal')
     OR COALESCE(NEW.is_active, false) IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  v_institutions := public.fn_get_policy_json('onemark.provision.institution_ids', '[]'::jsonb);
  IF v_institutions IS NULL
     OR jsonb_typeof(v_institutions) <> 'array'
     OR NOT (v_institutions ? NEW.institution_id::text) THEN
    RETURN NULL;
  END IF;

  -- An owner row references auth.users; a pre-registered profile (admin-created,
  -- not yet signed in) has none and must not raise 23503 here.
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = NEW.id) THEN
    RETURN NULL;
  END IF;

  SELECT s.id INTO v_school_id
    FROM public.schools s
   WHERE s.institution_id = NEW.institution_id
     AND s.ownership = 'internal'::public.school_ownership
   ORDER BY s.created_at ASC
   LIMIT 1;
  IF v_school_id IS NULL THEN
    RAISE WARNING '[onemark provision] no internal schools row for institution % — profile % not provisioned', NEW.institution_id, NEW.id;
    RETURN NULL;
  END IF;

  -- Two independently guarded sub-blocks: the owner row is what
  -- fn_fp_manages_school / fn_fp_can_manage_student need, and it must survive
  -- a failure of the role insert (one function-level handler would roll both
  -- back together and leave only a WARNING).
  BEGIN
    INSERT INTO public.school_jkkn_owners (school_id, jkkn_user_id, role, is_active, assigned_at)
    SELECT v_school_id, NEW.id, 'outreach_coordinator'::public.school_owner_role, true, now()
    WHERE NOT EXISTS (
      SELECT 1 FROM public.school_jkkn_owners o
       WHERE o.school_id = v_school_id AND o.jkkn_user_id = NEW.id AND o.is_active
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[onemark provision] profile % (institution %): owner row not inserted: % (%)', NEW.id, NEW.institution_id, SQLERRM, SQLSTATE;
  END;

  BEGIN
    SELECT cr.id INTO v_role_id FROM public.custom_roles cr WHERE cr.role_key = 'school_faculty';
    IF v_role_id IS NOT NULL THEN
      -- Wave 1 (20260917111500, step 12) REFUSED to apply when a target profile
      -- had no staff-email match, because a user_roles INSERT fires
      -- trg_jkkn_auto_issue_associate (20260827110000), which mints a PERMANENT
      -- 'associate' JKKN ID for a profile with learner_id NULL, no staff match
      -- and no jkkn_identities row. A trigger cannot block a sign-in, so it
      -- mirrors that ruling the only way it can: the role is NOT inserted
      -- for such a profile, and the WARNING names the repair (fix the staff
      -- row, then re-run step 6's INSERT on its own / re-save the profile).
      -- The owner row above
      -- is unaffected.
      IF EXISTS (
           SELECT 1 FROM public.profiles p
            WHERE p.id = NEW.id
              AND p.learner_id IS NULL
              AND NOT EXISTS (SELECT 1 FROM public.jkkn_identities ji WHERE ji.profile_id = p.id)
              AND NOT (
                p.email IS NOT NULL AND btrim(p.email) <> '' AND EXISTS (
                  SELECT 1 FROM public.staff st
                   WHERE lower(btrim(coalesce(st.institution_email, ''))) = lower(btrim(p.email))
                      OR lower(btrim(coalesce(st.email, '')))             = lower(btrim(p.email))
                )
              )
         ) THEN
        RAISE WARNING '[onemark provision] profile % (institution %): school_faculty NOT assigned — no staff row matches its email, and the user_roles insert would mint a permanent ''associate'' JKKN ID (trg_jkkn_auto_issue_associate); fix the staff row first', NEW.id, NEW.institution_id;
      ELSE
        INSERT INTO public.user_roles (user_id, role_id, is_primary, assigned_at)
        SELECT NEW.id, v_role_id, false, now()
        WHERE NOT EXISTS (
          SELECT 1 FROM public.user_roles ur WHERE ur.user_id = NEW.id AND ur.role_id = v_role_id
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[onemark provision] profile % (institution %): school_faculty role not inserted: % (%)', NEW.id, NEW.institution_id, SQLERRM, SQLSTATE;
  END;

  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  -- Never break a sign-in. The miss is visible in the logs and repairable by
  -- re-running step 6's INSERT statement on its own (not the whole file —
  -- see the header's SILENT-FAILURE SURFACING block).
  RAISE WARNING '[onemark provision] profile % (institution %) not provisioned: % (%)', NEW.id, NEW.institution_id, SQLERRM, SQLSTATE;
  RETURN NULL;
END;
$function$;

-- 3. Answer-recording RPC: lock the attempt row --------------------------------
CREATE OR REPLACE FUNCTION public.fn_onemark_record_response(p_attempt_id uuid, p_item_id uuid, p_chosen jsonb, p_skipped boolean, p_time_ms integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_attempt        record;
  v_item           record;
  v_session        uuid;
  v_is_correct     boolean;
  v_skipped        boolean := COALESCE(p_skipped, false);
  v_existed        boolean;
  v_prev_skipped   boolean;
  v_first_graded   boolean;
  v_reveal         boolean;
  v_vault_status   text;
  v_streak         int;
BEGIN
  IF p_attempt_id IS NULL OR p_item_id IS NULL THEN
    RAISE EXCEPTION 'fn_onemark_record_response: attempt_id and item_id are required';
  END IF;

  SELECT a.id, a.student_id, a.status, a.session_id, a.mode, a.assessment_id,
         s.exam_definition_id AS assessment_exam_id
    INTO v_attempt
    FROM public.fp_attempts a
    JOIN public.fp_assessments s ON s.id = a.assessment_id
   WHERE a.id = p_attempt_id
   -- Hardening 20260918130000: lock the attempt for the rest of this call.
   -- Two concurrent calls for the same (attempt, item) both saw NOT FOUND on
   -- fp_responses and double-bumped fp_items counters / the vault. NO KEY UPDATE
   -- conflicts with fn_onemark_finalize_attempt's FOR UPDATE, so record and
   -- finalize serialise too; the status check below reads the post-lock row.
   FOR NO KEY UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_onemark_record_response: attempt % not found', p_attempt_id;
  END IF;

  -- WRITE gate = the estate's own attempt-write predicate (fn_fp_record_attempt,
  -- 20260808220000): the learner / guardian, a registered manager of the
  -- learner's school, or the Senior Learner running a cohort this learner is
  -- enrolled in. NOT fn_fp_can_view_student — that is a READ predicate, and it
  -- also admits every bare school_jkkn_owners row.
  IF NOT (
    public.fn_fp_can_manage_student(v_attempt.student_id)
    OR public.fn_fp_is_own_or_guardian(v_attempt.student_id)
    OR public.fn_fp_teaches_student(v_attempt.student_id)
  ) THEN
    RAISE EXCEPTION 'fn_onemark_record_response: not authorized for attempt %', p_attempt_id
      USING ERRCODE = '42501';
  END IF;

  IF v_attempt.status <> 'in_progress' THEN
    RAISE EXCEPTION 'fn_onemark_record_response: attempt % is %, not in_progress (single submission, decision 19)',
      p_attempt_id, v_attempt.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_attempt.mode IS NULL THEN
    RAISE EXCEPTION 'fn_onemark_record_response: attempt % has no mode — a legacy Foundation attempt is recorded by fn_fp_record_attempt, not here', p_attempt_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT i.id, i.answer, i.exam_definition_id
    INTO v_item
    FROM public.fp_items i
   WHERE i.id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'fn_onemark_record_response: item % not found', p_item_id;
  END IF;

  -- Item membership. The item must be on the attempt's exam, and when the
  -- assessment is a fixed paper (it has fp_assessment_items rows) the item
  -- must be one of them. A standing pool (step 1) has no fp_assessment_items,
  -- so the exam match is the whole test there. Without this an in_progress
  -- attempt could drive fp_items serve counters and Mistake Vault rows for
  -- any item in the shared bank.
  IF v_item.exam_definition_id IS DISTINCT FROM v_attempt.assessment_exam_id THEN
    RAISE EXCEPTION 'fn_onemark_record_response: item % is not on the exam of attempt %', p_item_id, p_attempt_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fp_assessment_items ai WHERE ai.assessment_id = v_attempt.assessment_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.fp_assessment_items ai
        WHERE ai.assessment_id = v_attempt.assessment_id AND ai.item_id = p_item_id
     ) THEN
    RAISE EXCEPTION 'fn_onemark_record_response: item % is not part of assessment %', p_item_id, v_attempt.assessment_id
      USING ERRCODE = 'check_violation';
  END IF;

  v_session := COALESCE(v_attempt.session_id, v_attempt.id);
  v_reveal  := v_attempt.mode IN ('practice', 'vault_review');

  -- Verdict: graded now only in a revealed mode; a skip is never graded
  -- (decision 18). In a withheld mode the column stays NULL until finalize.
  IF v_skipped OR NOT v_reveal THEN
    v_is_correct := NULL;
  ELSE
    v_is_correct := public.fn_onemark_grade(p_chosen, v_item.answer);
  END IF;

  -- What was there before decides whether this is the first response / the
  -- first graded answer to this item in this attempt.
  SELECT r.skipped INTO v_prev_skipped
    FROM public.fp_responses r
   WHERE r.attempt_id = p_attempt_id AND r.item_id = p_item_id;
  v_existed      := FOUND;
  v_first_graded := (NOT v_existed) OR COALESCE(v_prev_skipped, false);

  INSERT INTO public.fp_responses (attempt_id, item_id, chosen, is_correct, time_ms, skipped)
  VALUES (p_attempt_id, p_item_id,
          CASE WHEN v_skipped THEN NULL ELSE p_chosen END,
          v_is_correct, p_time_ms, v_skipped)
  ON CONFLICT (attempt_id, item_id)
  DO UPDATE SET chosen     = EXCLUDED.chosen,
                is_correct = EXCLUDED.is_correct,
                time_ms    = EXCLUDED.time_ms,
                skipped    = EXCLUDED.skipped;

  IF v_reveal THEN
    -- Bank counters: served once per attempt-item (on the first response of
    -- any kind), correct once per attempt-item (on the first graded answer).
    IF NOT v_existed THEN
      UPDATE public.fp_items
         SET times_served  = times_served + 1,
             times_correct = times_correct + CASE WHEN v_is_correct IS TRUE THEN 1 ELSE 0 END
       WHERE id = p_item_id;
    ELSIF v_first_graded AND v_is_correct IS TRUE THEN
      UPDATE public.fp_items
         SET times_correct = times_correct + 1
       WHERE id = p_item_id;
    END IF;

    -- Vault: the first graded answer, once.
    IF v_first_graded AND NOT v_skipped THEN
      PERFORM public.fn_onemark_apply_vault(v_attempt.student_id, p_item_id, v_session, v_is_correct);
    END IF;

    SELECT v.status, v.consecutive_correct_count
      INTO v_vault_status, v_streak
      FROM public.onemark_mistake_vault v
     WHERE v.student_id = v_attempt.student_id AND v.item_id = p_item_id;
  END IF;

  RETURN jsonb_build_object(
    'is_correct',   v_is_correct,     -- NULL when skipped or withheld
    'skipped',      v_skipped,
    'vault_status', v_vault_status,   -- NULL when withheld or no row
    'streak',       v_streak,
    'revealed',     v_reveal
  );
END;
$function$;

-- Re-state the anon lock on both replaced functions (CREATE OR REPLACE keeps the
-- existing grants, but the lock must be explicit in the file that redefines them).
REVOKE EXECUTE ON FUNCTION public.fn_onemark_record_response(uuid, uuid, jsonb, boolean, int) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_onemark_record_response(uuid, uuid, jsonb, boolean, int) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_onemark_provision_school_owner() FROM anon, PUBLIC;

-- 4. Internal helpers: close the service_role door ------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_onemark_grade(jsonb, jsonb) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.fn_onemark_apply_vault(uuid, uuid, uuid, boolean) FROM service_role;

-- 5. Assertions (raise = whole file rolls back) --------------------------------
DO $chk$
DECLARE
  v_src     text;
  v_uid     uuid;
  v_before  int;
  v_after   int;
BEGIN
  IF has_function_privilege('service_role', 'public.fn_onemark_grade(jsonb, jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hardening: service_role can still execute fn_onemark_grade';
  END IF;
  IF has_function_privilege('service_role', 'public.fn_onemark_apply_vault(uuid, uuid, uuid, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hardening: service_role can still execute fn_onemark_apply_vault';
  END IF;
  IF has_function_privilege('anon', 'public.fn_onemark_record_response(uuid, uuid, jsonb, boolean, integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fn_onemark_provision_school_owner()', 'EXECUTE') THEN
    RAISE EXCEPTION 'hardening: anon regained EXECUTE on a replaced function';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.fn_onemark_record_response(uuid, uuid, jsonb, boolean, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'hardening: authenticated lost EXECUTE on fn_onemark_record_response';
  END IF;

  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_onemark_record_response';
  IF v_src IS NULL OR v_src !~ 'FOR NO KEY UPDATE OF a' THEN
    RAISE EXCEPTION 'hardening: fn_onemark_record_response is not the locked version';
  END IF;
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'fn_onemark_provision_school_owner';
  IF v_src IS NULL OR position('TG_OP' in v_src) = 0 THEN
    RAISE EXCEPTION 'hardening: fn_onemark_provision_school_owner is not the INSERT-only version';
  END IF;
  IF (SELECT pg_get_triggerdef(t.oid) FROM pg_trigger t WHERE t.tgname = 'trg_onemark_provision_school_owner')
     !~ 'AFTER INSERT OR UPDATE OF institution_id, role, is_active ON public.profiles' THEN
    RAISE EXCEPTION 'hardening: trigger definition is not the expected one';
  END IF;

  -- Behaviour, on one real signed-in owner, entirely rolled back.
  SELECT o.jkkn_user_id INTO v_uid
    FROM public.school_jkkn_owners o
    JOIN public.schools  s ON s.id = o.school_id
    JOIN public.profiles p ON p.id = o.jkkn_user_id
   WHERE s.name = 'Nattraja Vidhyalya CBSE' AND o.is_active
     AND p.is_active AND p.role IN ('faculty', 'hod', 'principal')
     AND o.role = 'outreach_coordinator'::public.school_owner_role AND o.program_partner_id IS NULL
   ORDER BY p.email
   LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE WARNING 'hardening: no live Nattraja owner to rehearse against — catalog checks only';
    RETURN;
  END IF;
  SELECT count(*) INTO v_before FROM public.school_jkkn_owners WHERE jkkn_user_id = v_uid AND is_active;

  BEGIN
    -- (a) an UPDATE that keeps the profile qualifying changes nothing
    UPDATE public.profiles SET role = role WHERE id = v_uid;
    SELECT count(*) INTO v_after FROM public.school_jkkn_owners WHERE jkkn_user_id = v_uid AND is_active;
    IF v_after <> v_before THEN
      RAISE EXCEPTION 'hardening: a qualifying UPDATE changed active owner rows % -> %', v_before, v_after;
    END IF;
    -- (b) an UPDATE never re-provisions
    UPDATE public.school_jkkn_owners SET is_active = false WHERE jkkn_user_id = v_uid AND is_active;
    UPDATE public.profiles SET role = role WHERE id = v_uid;
    SELECT count(*) INTO v_after FROM public.school_jkkn_owners WHERE jkkn_user_id = v_uid AND is_active;
    IF v_after <> 0 THEN
      RAISE EXCEPTION 'hardening: an UPDATE re-provisioned % owner row(s)', v_after;
    END IF;
    -- (c) deactivating the profile de-provisions
    UPDATE public.school_jkkn_owners SET is_active = true
     WHERE jkkn_user_id = v_uid AND role = 'outreach_coordinator'::public.school_owner_role AND program_partner_id IS NULL;
    UPDATE public.profiles SET is_active = false WHERE id = v_uid;
    SELECT count(*) INTO v_after FROM public.school_jkkn_owners WHERE jkkn_user_id = v_uid AND is_active;
    IF v_after <> 0 THEN
      RAISE EXCEPTION 'hardening: profile deactivation left % active owner row(s)', v_after;
    END IF;
    RAISE EXCEPTION 'onemark-hardening-rehearsal-rollback';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'onemark-hardening-rehearsal-rollback' THEN
      RAISE;
    END IF;
    -- the sub-transaction is rolled back either way: the real owner keeps every row
  END;

  SELECT count(*) INTO v_after FROM public.school_jkkn_owners WHERE jkkn_user_id = v_uid AND is_active;
  IF v_after <> v_before THEN
    RAISE EXCEPTION 'hardening: rehearsal did not roll back (% -> %)', v_before, v_after;
  END IF;
END
$chk$;
