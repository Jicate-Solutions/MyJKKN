-- ============================================================================
-- Migration: 20271008110105_hr_duty_proofs_review_fixes
-- Added: 2026-10-08 — follow-up to #4226 (20271007161123_hr_duty_proofs.sql)
-- after its deep review. FILE ONLY: not applied by this PR.
-- ============================================================================
--
-- WHAT THIS CHANGES (each line is one review finding)
--   1. A second check now records WHAT it checked: the amount and the decider
--      of the item at that moment (hr_duty_proofs.checked_amount, decider_id).
--      A check whose amount or decider no longer matches the item is STALE:
--      fn_hr_duty_proof_gaps lists the item again, and the screen stops saying
--      "Checked by". A new check on a stale item marks the old row revoked
--      (revoked_at = now(), revoked_by = the new checker; an UPDATE, nothing
--      is deleted) and records the new one.
--      Confirmed checks recorded before this file have no checked_amount /
--      decider_id and so count as stale: they are NOT back-filled from today's
--      amount, because that would claim the old check covered an amount it may
--      never have seen. Those items need one fresh check.
--  1b. Open "the amount is wrong" corrections recorded before this file ARE
--      back-filled (section 10), while the item's amount still differs from
--      the corrected amount: a correction is a flag that HR must act on, and
--      treating it as stale would replace "the amount is wrong" with "second
--      check needed again", let the next checker confirm the same wrong amount
--      and revoke the flag. A correction whose item already carries the
--      corrected amount stays without them, so the fix gets a fresh check.
--   3. G6: whoever calculated the F&F settlement (hr_fnf_calculations.
--      calculated_by) is now one of the doers, so cannot second-check it.
--   5. G5: a malformed 'acted_at' in the approval chain (e.g. '2026-13-40')
--      no longer raises 22008 for every caller of gaps, attach and the bucket
--      policy. It is read through fn_hr_duty_proof_try_timestamptz (NULL on a
--      bad value) and falls back to the case's updated_at.
--   7. A 'confirmed' check stores no note (the screen hides the note box for
--      it; an abandoned correction note was being saved on a confirmation).
--   8. The rule audit trigger also fires on INSERT, so a new or replacement
--      rule row is audited. NOT on DELETE: hr_duty_proof_rules_audit.config_id
--      is a foreign key to the rule row, so an audit row written after a
--      delete would make every delete fail.
--   9. gaps compares the "since" date in India time
--      ((done_at AT TIME ZONE 'Asia/Kolkata')::date), so an item decided
--      between 00:00 and 05:30 IST on the 1st counts in that month.
--   +  A corrected amount below zero, or too large for the column, is refused
--      with 22023 (a 400) instead of a 500.
--
-- BACK-FILLED (section 10, an UPDATE that runs once; a re-run finds nothing):
--   hr_duty_proofs.checked_amount, decider_id on open legacy corrections.
-- REPLACED (CREATE OR REPLACE, same signatures, same grants):
--   fn_hr_duty_proof_done_items(text, uuid)
--   fn_hr_duty_proof_second_check(text, uuid, text, numeric, text)
--   fn_hr_duty_proof_gaps(text, date)
-- NEW: fn_hr_duty_proof_try_timestamptz(text) (internal, granted to nobody).
-- The trigger hr_duty_proof_rules_audit_trg is re-created with CREATE OR
-- REPLACE TRIGGER (no DROP). Nothing is deleted or dropped.
--
-- DRIFT CHECK (runs first, changes nothing on a mismatch). For each replaced
-- function the body md5 (prosrc, carriage returns removed, outer whitespace
-- trimmed), the SECURITY DEFINER flag and the settings must equal either
-- main's definition (20271007161123) or the one this file installs (a re-run).
--   Main's definitions:
--     fn_hr_duty_proof_done_items    body md5 760cbba7281aa4d1b6d44dfe3bbfc74b  definer f  {search_path=public}
--     fn_hr_duty_proof_second_check  body md5 bf4a45ad06fbd41daacdd441526aab41  definer t  {search_path=public}
--     fn_hr_duty_proof_gaps          body md5 277c16cfd776254d4d1761e21db463f5  definer t  {search_path=public}
--   The ones this file installs:
--     fn_hr_duty_proof_done_items    body md5 7b32c5d8b21b54f67b1a68a74b2317b7  definer f  {search_path=public}
--     fn_hr_duty_proof_second_check  body md5 9dab9ac532792dbe347d6a0a3769d2a1  definer t  {search_path=public}
--     fn_hr_duty_proof_gaps          body md5 a24d804f1563721fe0eaf6536c887c47  definer t  {search_path=public}
--   Read them with:
--     SELECT p.oid::regprocedure, md5(btrim(replace(p.prosrc, E'\r', ''), E' \t\n')),
--            p.prosecdef, p.proconfig
--       FROM pg_proc p
--      WHERE p.proname IN ('fn_hr_duty_proof_done_items', 'fn_hr_duty_proof_second_check',
--                          'fn_hr_duty_proof_gaps');
-- ============================================================================

DO $drift$
DECLARE
  r record;
  v record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.fn_hr_duty_proof_done_items(text,uuid)',
       '760cbba7281aa4d1b6d44dfe3bbfc74b', false, '{search_path=public}',
       '7b32c5d8b21b54f67b1a68a74b2317b7', false, '{search_path=public}'),
      ('public.fn_hr_duty_proof_second_check(text,uuid,text,numeric,text)',
       'bf4a45ad06fbd41daacdd441526aab41', true, '{search_path=public}',
       '9dab9ac532792dbe347d6a0a3769d2a1', true, '{search_path=public}'),
      ('public.fn_hr_duty_proof_gaps(text,date)',
       '277c16cfd776254d4d1761e21db463f5', true, '{search_path=public}',
       'a24d804f1563721fe0eaf6536c887c47', true, '{search_path=public}')
    ) AS t(fn, main_md5, main_definer, main_config, new_md5, new_definer, new_config)
  LOOP
    SELECT md5(btrim(replace(p.prosrc, E'\r', ''), E' \t\n')) AS body_md5,
           p.prosecdef AS definer,
           coalesce(p.proconfig::text, '') AS config
      INTO v
      FROM pg_proc p
     WHERE p.oid = to_regprocedure(r.fn);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Drift: % does not exist on this database (20271007161123 must be applied first). Nothing was changed.', r.fn;
    END IF;
    IF NOT ((v.body_md5, v.definer, v.config) = (r.main_md5, r.main_definer, r.main_config)
            OR (v.body_md5, v.definer, v.config) = (r.new_md5, r.new_definer, r.new_config)) THEN
      RAISE EXCEPTION 'Drift: % on this database (body md5 %, security definer %, settings %) is neither main''s definition nor the one this file installs. Nothing was changed. Compare it with main before applying 20271008110105.',
        r.fn, v.body_md5, v.definer, v.config;
    END IF;
  END LOOP;
END
$drift$;

-- ----------------------------------------------------------------------------
-- 1. What a second check checked
-- ----------------------------------------------------------------------------
-- Unconstrained numeric on purpose: it must equal the item's amount exactly
-- (hr_leave_encashments.total_amount is unconstrained numeric), or a rounded
-- copy would make every check look stale.
ALTER TABLE public.hr_duty_proofs
  ADD COLUMN IF NOT EXISTS checked_amount numeric,
  ADD COLUMN IF NOT EXISTS decider_id     uuid;

COMMENT ON COLUMN public.hr_duty_proofs.checked_amount IS
  'Second check only (20271008110105): the item''s amount when it was checked. When the item''s amount differs now, the check is stale and the item needs a new check.';
COMMENT ON COLUMN public.hr_duty_proofs.decider_id IS
  'Second check only (20271008110105): who decided the item when it was checked (L4 approved_by, G6 completed_by). When that differs now, the check is stale.';

-- ----------------------------------------------------------------------------
-- 5. A safe read of a timestamp held as text
-- ----------------------------------------------------------------------------
-- NULL instead of an error on a value such as '2026-13-40'. Internal: called
-- only from fn_hr_duty_proof_done_items inside the SECURITY DEFINER functions.
CREATE OR REPLACE FUNCTION public.fn_hr_duty_proof_try_timestamptz(p_value text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN p_value::timestamptz;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_proof_try_timestamptz(text) FROM anon, PUBLIC, authenticated;

-- ----------------------------------------------------------------------------
-- 3 + 5. The one definition of "done" per duty (internal)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_duty_proof_done_items(p_duty text, p_item_id uuid DEFAULT NULL)
RETURNS TABLE (item_id uuid, done_at timestamptz, institution_id uuid, doer_ids uuid[], amount numeric,
               decider_id uuid)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  IF p_duty = 'L4' THEN
    RETURN QUERY
    SELECT e.id,
           COALESCE(e.approved_at, e.updated_at),
           o.institution_id,
           array_remove(ARRAY[e.approved_by, s.profile_id], NULL),
           e.total_amount::numeric,
           e.approved_by
    FROM public.hr_leave_encashments e
    LEFT JOIN public.hr_organizations o ON o.id = e.hr_organization_id
    LEFT JOIN public.staff s ON s.id = e.employee_id
    WHERE e.status IN ('approved', 'paid')
      AND (p_item_id IS NULL OR e.id = p_item_id);

  ELSIF p_duty = 'G5' THEN
    -- 2026-10-08: a malformed acted_at falls back to updated_at instead of
    -- raising for every caller.
    RETURN QUERY
    SELECT c.id,
           COALESCE(
             CASE WHEN (d.entry->>'acted_at') ~ '^\d{4}-\d{2}-\d{2}'
                  THEN public.fn_hr_duty_proof_try_timestamptz(d.entry->>'acted_at') END,
             c.updated_at),
           c.institution_id,
           ARRAY[]::uuid[],
           NULL::numeric,
           NULL::uuid
    FROM public.hr_offboarding_cases c
    CROSS JOIN LATERAL (
      SELECT x.entry
      FROM jsonb_array_elements(
             CASE WHEN jsonb_typeof(c.termination_approval_chain) = 'array'
                  THEN c.termination_approval_chain ELSE '[]'::jsonb END) AS x(entry)
      WHERE x.entry->>'step' = 'director' AND x.entry->>'status' = 'approved'
      LIMIT 1
    ) d
    WHERE c.separation_type = 'termination'
      AND (p_item_id IS NULL OR c.id = p_item_id);

  ELSIF p_duty = 'G6' THEN
    -- 2026-10-08: whoever calculated an F&F settlement for the case is a doer
    -- too, alongside its approvers.
    RETURN QUERY
    SELECT c.id,
           sc.completed_at,
           c.institution_id,
           array_remove(
             ARRAY[sc.completed_by, s.profile_id]
             || ARRAY(SELECT f.approved_by FROM public.hr_fnf_calculations f
                      WHERE f.case_id = c.id AND f.approved_by IS NOT NULL)
             || ARRAY(SELECT f.calculated_by FROM public.hr_fnf_calculations f
                      WHERE f.case_id = c.id AND f.calculated_by IS NOT NULL),
             NULL),
           (SELECT f.net_payable::numeric FROM public.hr_fnf_calculations f
            WHERE f.case_id = c.id AND f.approved_at IS NOT NULL
            ORDER BY f.approved_at DESC LIMIT 1),
           sc.completed_by
    FROM public.hr_offboarding_cases c
    JOIN public.hr_offboarding_step_completions sc
      ON sc.case_id = c.id AND sc.step_key = 'final_settlement'
    LEFT JOIN public.staff s ON s.id = c.staff_id
    WHERE c.separation_type = 'termination'
      AND (p_item_id IS NULL OR c.id = p_item_id);
  END IF;
  -- Any other duty code: no adapter yet, so nothing is listed as done.
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_proof_done_items(text, uuid) FROM anon, PUBLIC, authenticated;

-- ----------------------------------------------------------------------------
-- 1 + 7. Record a second check
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_duty_proof_second_check(
  p_duty text,
  p_item_id uuid,
  p_result text,
  p_corrected_amount numeric DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_rule public.hr_duty_proof_rules%ROWTYPE;
  v_item record;
  v_id   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in to record a second check' USING ERRCODE = '42501';
  END IF;

  -- 1. The rule, and it must be a second-check rule.
  SELECT * INTO v_rule FROM public.hr_duty_proof_rules r
  WHERE r.config_key = p_duty AND r.is_active;
  IF NOT FOUND OR v_rule.proof_kind <> 'second_check' THEN
    RAISE EXCEPTION 'Duty % does not take a second check', p_duty USING ERRCODE = '22023';
  END IF;

  IF p_result IS NULL OR p_result NOT IN ('confirmed', 'corrected') THEN
    RAISE EXCEPTION 'A second check is either confirmed or corrected' USING ERRCODE = '22023';
  END IF;

  -- 6. A correction needs the right amount and a note of at least 10 characters.
  IF p_result = 'corrected'
     AND (p_corrected_amount IS NULL OR char_length(btrim(COALESCE(p_note, ''))) < 10) THEN
    RAISE EXCEPTION 'A correction needs the right amount and a note of at least 10 characters'
      USING ERRCODE = '22023';
  END IF;

  -- 6b. 2026-10-08: the right amount is zero or more and fits numeric(12,2).
  -- The upper bound checks the ROUNDED value: 9999999999.995 rounds up to
  -- 10000000000.00 on insert, which would overflow numeric(12,2) as a 500.
  IF p_result = 'corrected'
     AND (p_corrected_amount < 0 OR round(p_corrected_amount, 2) >= 10000000000) THEN
    RAISE EXCEPTION 'The right amount must be between 0 and 9,999,999,999.99' USING ERRCODE = '22023';
  END IF;

  -- 2 + 3. The item, from its own table, and it must be done.
  SELECT * INTO v_item FROM public.fn_hr_duty_proof_done_items(p_duty, p_item_id) d LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This item is not decided yet, so there is nothing to check' USING ERRCODE = '22023';
  END IF;

  -- 4. The checker holds the rule's key AND has access to the item's college.
  --    IS NOT TRUE, so a NULL from either helper is refused.
  IF (public.is_super_admin()
      OR (public.user_has_permission(v_rule.checker_permission_key)
          AND public.role_has_institution_access(v_item.institution_id))) IS NOT TRUE THEN
    RAISE EXCEPTION 'You do not have the permission to check this duty in this college'
      USING ERRCODE = '42501';
  END IF;

  -- 5a. Fail closed when the decider is not recorded (L4 approved_by, G6
  --     completed_by): the "not the person who decided it" rule below cannot
  --     be enforced without it, so a 'Checked by' badge would be false comfort.
  IF v_item.decider_id IS NULL THEN
    RAISE EXCEPTION 'The approver of this item is not recorded, so an independent check cannot be confirmed'
      USING ERRCODE = '22023';
  END IF;

  -- 5. Not the person who decided it, nor the team member it pays.
  IF v_uid = ANY (v_item.doer_ids) THEN
    RAISE EXCEPTION 'You decided this item or it pays you; another team member must check it'
      USING ERRCODE = '42501';
  END IF;

  -- 5b. 2026-10-08: an active check whose amount or decider no longer matches
  --     the item is stale. Mark it revoked (kept as history) so the new check
  --     can be recorded. A current check stays, and the insert below refuses.
  UPDATE public.hr_duty_proofs p
     SET revoked_at = now(), revoked_by = v_uid, updated_at = now()
   WHERE p.duty_code = p_duty
     AND p.item_id = p_item_id
     AND p.kind = 'second_check'
     AND p.revoked_at IS NULL
     AND (p.checked_amount IS DISTINCT FROM v_item.amount
          OR p.decider_id IS DISTINCT FROM v_item.decider_id);

  -- 7. Insert, with the amount and decider that were checked. A note is kept
  --    only on a correction. The source item is never updated.
  BEGIN
    INSERT INTO public.hr_duty_proofs
      (duty_code, item_table, item_id, institution_id, kind, recorded_by,
       check_result, corrected_amount, check_note, checked_amount, decider_id)
    VALUES
      (p_duty, v_rule.item_table, p_item_id, v_item.institution_id, 'second_check', v_uid,
       p_result,
       CASE WHEN p_result = 'corrected' THEN p_corrected_amount END,
       CASE WHEN p_result = 'corrected' THEN NULLIF(btrim(COALESCE(p_note, '')), '') END,
       v_item.amount,
       v_item.decider_id)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This item already has a second check' USING ERRCODE = '23505';
  END;

  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_proof_second_check(text, uuid, text, numeric, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_duty_proof_second_check(text, uuid, text, numeric, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 1 + 9. Done items still missing their proof
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_duty_proof_gaps(p_duty text, p_since date DEFAULT NULL)
RETURNS TABLE (item_id uuid, done_at timestamptz, institution_id uuid, amount numeric, caller_is_doer boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_rule public.hr_duty_proof_rules%ROWTYPE;
  v_uid  uuid := auth.uid();
BEGIN
  SELECT * INTO v_rule FROM public.hr_duty_proof_rules r
  WHERE r.config_key = p_duty AND r.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Duty % has no proof rule', p_duty USING ERRCODE = '22023';
  END IF;

  IF (public.is_super_admin() OR public.is_admin()
      OR public.user_has_permission(v_rule.checker_permission_key)) IS NOT TRUE THEN
    RAISE EXCEPTION 'You do not have the permission to see proof for this duty' USING ERRCODE = '42501';
  END IF;

  -- 2026-10-08: "since" is a date in India time; a second check covers the
  -- item only while its amount and decider still match the item.
  RETURN QUERY
  SELECT d.item_id, d.done_at, d.institution_id, d.amount,
         COALESCE(v_uid = ANY (d.doer_ids), false)
  FROM public.fn_hr_duty_proof_done_items(p_duty) d
  WHERE (p_since IS NULL OR (d.done_at AT TIME ZONE 'Asia/Kolkata')::date >= p_since)
    AND public.fn_hr_duty_proof_can_view(p_duty, d.institution_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.hr_duty_proofs p
      WHERE p.duty_code = p_duty
        AND p.item_id = d.item_id
        AND p.kind = v_rule.proof_kind
        AND p.revoked_at IS NULL
        AND (p.kind <> 'second_check'
             OR (p.checked_amount IS NOT DISTINCT FROM d.amount
                 AND p.decider_id IS NOT DISTINCT FROM d.decider_id))
    )
  ORDER BY d.done_at DESC;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_proof_gaps(text, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_duty_proof_gaps(text, date) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. Audit a new rule row too
-- ----------------------------------------------------------------------------
-- fn_hr_duty_proof_rules_audit is unchanged: on INSERT, OLD is NULL and
-- to_jsonb(OLD) stores NULL as the old value.
CREATE OR REPLACE TRIGGER hr_duty_proof_rules_audit_trg
  AFTER INSERT OR UPDATE ON public.hr_duty_proof_rules
  FOR EACH ROW EXECUTE FUNCTION public.fn_hr_duty_proof_rules_audit();

-- ----------------------------------------------------------------------------
-- 10. Open corrections recorded before this file stay open (see 1b)
-- ----------------------------------------------------------------------------
-- Runs after fn_hr_duty_proof_done_items above, which returns decider_id.
-- Only active 'corrected' second checks with nothing saved about what they
-- checked, on an item that is still done, whose amount still differs from the
-- corrected amount. They take the item's amount and decider as of now, so the
-- correction stays the item's current proof until the amount or the decider
-- changes. Confirmed checks are left as they are (stale, see 1). Idempotent:
-- a back-filled row no longer has a NULL decider_id.
UPDATE public.hr_duty_proofs p
   SET (checked_amount, decider_id) = (
         SELECT d.amount, d.decider_id
           FROM public.fn_hr_duty_proof_done_items(p.duty_code, p.item_id) d
          LIMIT 1),
       updated_at = now()
 WHERE p.kind = 'second_check'
   AND p.check_result = 'corrected'
   AND p.revoked_at IS NULL
   AND p.checked_amount IS NULL
   AND p.decider_id IS NULL
   AND EXISTS (
         SELECT 1
           FROM public.fn_hr_duty_proof_done_items(p.duty_code, p.item_id) d
          WHERE d.decider_id IS NOT NULL
            AND d.amount IS DISTINCT FROM p.corrected_amount);
