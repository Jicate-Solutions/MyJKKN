-- Course Events — Phase 2b, Task 1.
-- fn_save_course_package(p_package jsonb, p_installments jsonb) RETURNS jsonb
--
-- WHY AN RPC AND NOT TWO REST CALLS
-- ---------------------------------
-- fn_course_package_amounts_chk is attached to BOTH course_packages and
-- course_package_installments as a CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY
-- DEFERRED (verified in pg_trigger: tgdeferrable = true, tginitdeferred = true),
-- so it evaluates at COMMIT. PostgREST wraps every request in its own
-- transaction, which makes repricing a package impossible in two calls:
--
--   package first      -> new total commits, parts still sum to the old price -> 23514
--   installments first -> new parts commit, total still the old price         -> 23514
--
-- Creating happens to work in two calls, because the trigger permits a package
-- with zero installments (a draft). Editing never can. One function covers both
-- so the UI has a single save path.
--
-- WHY SECURITY INVOKER — do not "harden" this to DEFINER
-- -----------------------------------------------------
-- course_packages_manage and course_package_installments_manage already gate on
-- user_has_permission('courses.packages.manage') AND role_has_institution_access().
-- Running as the caller inherits that predicate for free, and it can never drift
-- out of step with the policy. A SECURITY DEFINER version would bypass RLS and
-- have to re-implement the predicate by hand; this repo has a recorded incident
-- of exactly such a hand-copied predicate diverging and silently over-granting.
-- Atomicity is unaffected: the body runs inside the caller's transaction, so the
-- deferred sum check still fires once, at the outer COMMIT.
--
-- THE CATCH INVOKER INTRODUCES, AND HOW THIS FUNCTION HANDLES IT
-- -------------------------------------------------------------
-- Under RLS a blocked UPDATE or DELETE affects ZERO ROWS SILENTLY — it does not
-- raise. So this function verifies that each write landed and raises 42501
-- itself. INSERT is the exception: a WITH CHECK failure raises 42501 on its own,
-- so reaching the line after an INSERT means the row is really there.
--
-- The amount-sum rule is deliberately NOT re-checked here. The deferred trigger
-- owns it; duplicating it would give two places to drift. Let 23514 surface.

CREATE OR REPLACE FUNCTION public.fn_save_course_package(
  p_package      jsonb,
  p_installments jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_package_id      uuid;
  v_course_event_id uuid;
  v_institution_id  uuid;
  v_rows            int;
  v_remaining       int;
  v_installments    jsonb;
  v_inst            jsonb;
  v_no              smallint := 0;
BEGIN
  v_package_id      := NULLIF(btrim(COALESCE(p_package->>'id', '')), '')::uuid;
  v_course_event_id := NULLIF(btrim(COALESCE(p_package->>'course_event_id', '')), '')::uuid;

  IF v_course_event_id IS NULL THEN
    RAISE EXCEPTION 'course_event_id is required to save a package'
      USING ERRCODE = '22023';
  END IF;

  -- The tenant is resolved from the course, NEVER trusted from the payload —
  -- otherwise a caller could write a package into another institution by lying
  -- about institution_id. A miss here is either a bad id or an RLS denial on
  -- course_events (courses.view); both mean "you cannot save against this course".
  SELECT institution_id INTO v_institution_id
    FROM course_events
   WHERE id = v_course_event_id;

  IF v_institution_id IS NULL THEN
    RAISE EXCEPTION 'Course % was not found, or you do not have access to it', v_course_event_id
      USING ERRCODE = '42501';
  END IF;

  -- ── the package itself ────────────────────────────────────────────────────
  IF v_package_id IS NULL THEN
    INSERT INTO course_packages (
      course_event_id, institution_id, name, description, total_amount, currency,
      seat_cap, sale_opens_at, sale_closes_at, is_active, display_order
    ) VALUES (
      v_course_event_id,
      v_institution_id,
      btrim(p_package->>'name'),
      NULLIF(btrim(COALESCE(p_package->>'description', '')), ''),
      (p_package->>'total_amount')::numeric,
      COALESCE(NULLIF(btrim(COALESCE(p_package->>'currency', '')), ''), 'INR'),
      NULLIF(btrim(COALESCE(p_package->>'seat_cap', '')), '')::int,
      NULLIF(btrim(COALESCE(p_package->>'sale_opens_at', '')), '')::timestamptz,
      NULLIF(btrim(COALESCE(p_package->>'sale_closes_at', '')), '')::timestamptz,
      COALESCE((p_package->>'is_active')::boolean, true),
      COALESCE(NULLIF(btrim(COALESCE(p_package->>'display_order', '')), '')::int, 0)
    )
    RETURNING id INTO v_package_id;
    -- No row-count check needed: an RLS WITH CHECK failure on INSERT raises 42501.
  ELSE
    -- course_event_id is in the WHERE, not the SET: a package must never move
    -- between courses, and this also stops a caller from editing some other
    -- course's package by pairing its id with a course they can reach.
    UPDATE course_packages SET
      name           = btrim(p_package->>'name'),
      description    = NULLIF(btrim(COALESCE(p_package->>'description', '')), ''),
      total_amount   = (p_package->>'total_amount')::numeric,
      currency       = COALESCE(NULLIF(btrim(COALESCE(p_package->>'currency', '')), ''), 'INR'),
      seat_cap       = NULLIF(btrim(COALESCE(p_package->>'seat_cap', '')), '')::int,
      sale_opens_at  = NULLIF(btrim(COALESCE(p_package->>'sale_opens_at', '')), '')::timestamptz,
      sale_closes_at = NULLIF(btrim(COALESCE(p_package->>'sale_closes_at', '')), '')::timestamptz,
      is_active      = COALESCE((p_package->>'is_active')::boolean, true),
      display_order  = COALESCE(NULLIF(btrim(COALESCE(p_package->>'display_order', '')), '')::int, 0)
    WHERE id = v_package_id
      AND course_event_id = v_course_event_id;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows = 0 THEN
      -- Silent zero-row UPDATE: either the RLS manage policy filtered the row out,
      -- or the package does not belong to this course. Both are refusals.
      RAISE EXCEPTION
        'Package % could not be updated — it does not belong to course %, or you lack courses.packages.manage on it',
        v_package_id, v_course_event_id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ── the schedule: full replace, never a diff ──────────────────────────────
  -- Replacing is simpler and safer than diffing, and the deferred trigger
  -- validates the end state regardless of how it was reached.
  DELETE FROM course_package_installments WHERE package_id = v_package_id;

  -- Zero deleted rows is legitimate (a package that had no schedule), so the
  -- check cannot be "did we delete anything?". It has to be "is anything still
  -- there?" — which is what an RLS-blocked DELETE would leave behind.
  SELECT count(*) INTO v_remaining
    FROM course_package_installments
   WHERE package_id = v_package_id;

  IF v_remaining > 0 THEN
    RAISE EXCEPTION
      'Could not clear the existing schedule for package % — % row(s) remain; you lack courses.packages.manage on them',
      v_package_id, v_remaining
      USING ERRCODE = '42501';
  END IF;

  -- A JSON null, a missing key or a non-array all mean "no schedule". Plain
  -- COALESCE would not catch a JSON null, and jsonb_array_elements raises on a
  -- scalar, so the type is tested rather than assumed.
  v_installments := CASE
    WHEN jsonb_typeof(p_installments) = 'array' THEN p_installments
    ELSE '[]'::jsonb
  END;

  FOR v_inst IN SELECT * FROM jsonb_array_elements(v_installments)
  LOOP
    -- installment_no is renumbered from 1 in array order rather than taken from
    -- the client, so a reordered or partially-edited UI can never violate
    -- UNIQUE (package_id, installment_no).
    v_no := v_no + 1;

    INSERT INTO course_package_installments (package_id, installment_no, label, amount, due_date)
    VALUES (
      v_package_id,
      v_no,
      NULLIF(btrim(COALESCE(v_inst->>'label', '')), ''),
      (v_inst->>'amount')::numeric,
      NULLIF(btrim(COALESCE(v_inst->>'due_date', '')), '')::date
    );
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'package_id', v_package_id,
    'installment_count', v_no
  );
END;
$function$;

-- Supabase's default privileges grant EXECUTE to anon DIRECTLY, so revoking from
-- PUBLIC alone leaves anon holding it. Revoke from both, explicitly.
REVOKE ALL ON FUNCTION public.fn_save_course_package(jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_save_course_package(jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_save_course_package(jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.fn_save_course_package(jsonb, jsonb) IS
  'Saves a course package and replaces its installment schedule in ONE transaction. '
  'Required because fn_course_package_amounts_chk is a DEFERRABLE INITIALLY DEFERRED '
  'constraint trigger evaluated at COMMIT, so a reprice cannot be split across two '
  'PostgREST calls. SECURITY INVOKER: the caller''s own RLS (courses.packages.manage) '
  'applies inside the body. Because a blocked UPDATE/DELETE affects zero rows silently '
  'under RLS, the function verifies its writes and raises 42501 rather than assuming.';
