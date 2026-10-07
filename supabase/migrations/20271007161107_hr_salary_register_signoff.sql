-- ============================================================================
-- Salary register: a named two-step sign-off (HR harness, proof of done 1)
-- 2027-10-07 — migration 20271007161107
--
-- FILE ONLY. NOT APPLIED BY MERGE. The operator applies it with
-- apply_migration after the PR merges, so the ledger row is written.
-- No BEGIN/COMMIT of its own, so a rollback rehearsal stays a rehearsal.
--
-- WHAT IT ADDS
--   Every frozen salary register run (hr_salary_register_runs) can carry two
--   recorded signatures by named people:
--     1. college_check  — the college confirms the register (key
--                         hr.payroll.register.check, meant for the principal);
--     2. accounts_sign  — accounts signs it off (key hr.payroll.register.sign).
--   The register screen shows who signed and when. Nothing about pay changes:
--   no figure, line, total or generation step is touched here.
--
-- THE RULES (each one has a test in __tests__/hr/register-signoff.pg.test.ts
-- that fails when the rule is deleted)
--   - the person who generated a run cannot sign either step;
--   - accounts cannot sign before an active college check exists;
--   - one person cannot do both steps on one run;
--   - the permission guard is written `IF v_ok IS NOT TRUE THEN RAISE`, never
--     `IF NOT (a OR b)`, because a NULL from a helper must be a refusal;
--   - the stage key only counts for runs of a college the caller can access;
--   - a replaced (superseded) run cannot be signed. Liveness is checked on BOTH
--     superseded_at and superseded_by: 20260830150001 made superseded_at the
--     real liveness column (superseded_by is set best-effort after the
--     successor exists), so checking only superseded_by would let a replaced
--     run be signed in the window where the forward pointer failed;
--   - withdrawing the college check also withdraws an active accounts sign-off.
--
-- Default taken, overrule here: who signs the register (design decision 4) is
--   the recommended split. A college check by a holder of the new key
--   hr.payroll.register.check (meant for the principal) comes first, then the
--   accounts sign-off by a holder of hr.payroll.register.sign.
-- Default taken, overrule here: the two new keys are granted to NO role by this
--   migration. Until the Director grants them in Role Management, only super
--   admins can sign.
-- Default taken, overrule here: the export block ships OFF. The policy
--   hr.harness.proof.register_signoff_required is false, and only a literal
--   true blocks an unsigned export.
-- Default taken, overrule here: a regenerated (superseded) register starts
--   unsigned. Signatures never carry over to the new run.
-- Default taken, overrule here: the person who generated a run cannot sign
--   either step, and one person cannot do both steps.
-- Default taken, overrule here: the dormant five-stage payslip path (design
--   decision 5) is left untouched, neither retired nor revived. Sign-off lives
--   on the live register.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (a) The sign-off table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_salary_register_signoffs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES public.hr_salary_register_runs(id) ON DELETE CASCADE,
  -- Copied from the run at signing so RLS scopes without a join.
  institution_id  uuid NOT NULL,
  stage           text NOT NULL CHECK (stage IN ('college_check', 'accounts_sign')),
  signed_by       uuid NOT NULL REFERENCES auth.users(id),
  signed_at       timestamptz NOT NULL DEFAULT now(),
  note            text,
  revoked_at      timestamptz,
  revoked_by      uuid,
  revoke_reason   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_salary_register_signoffs_revoke_reason_chk
    CHECK (revoked_at IS NULL OR length(btrim(revoke_reason)) >= 10)
);

-- One ACTIVE signature per step per run. Withdrawn rows stay as history.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hr_salary_register_signoffs_active
  ON public.hr_salary_register_signoffs (run_id, stage)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hr_salary_register_signoffs_run
  ON public.hr_salary_register_signoffs (run_id);

COMMENT ON TABLE public.hr_salary_register_signoffs IS
  'Named two-step sign-off on a frozen salary register run: college_check (hr.payroll.register.check) then accounts_sign (hr.payroll.register.sign). Written only by fn_hr_register_signoff / fn_hr_register_signoff_revoke. Withdrawn rows are kept. Migration 20271007161107.';

ALTER TABLE public.hr_salary_register_signoffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hr_salary_register_signoffs_select ON public.hr_salary_register_signoffs;
CREATE POLICY hr_salary_register_signoffs_select ON public.hr_salary_register_signoffs
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin() OR public.is_admin()
    OR (public.user_has_permission('hr.payroll.register.view')
        AND public.role_has_institution_access(institution_id))
  );
-- No INSERT / UPDATE / DELETE policies: every write goes through the
-- SECURITY DEFINER functions below.

REVOKE ALL ON public.hr_salary_register_signoffs FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.hr_salary_register_signoffs TO authenticated;

-- ----------------------------------------------------------------------------
-- (b) Sign one step
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_register_signoff(
  p_run_id uuid,
  p_stage  text,
  p_note   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_run   record;
  v_check record;
  v_ok    boolean;
  v_row   public.hr_salary_register_signoffs%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in to sign a salary register.'
      USING ERRCODE = '42501';
  END IF;

  IF p_stage IS NULL OR p_stage NOT IN ('college_check', 'accounts_sign') THEN
    RAISE EXCEPTION 'Unknown sign-off step "%". Use college_check or accounts_sign.', p_stage
      USING ERRCODE = '22023';
  END IF;

  -- Lock the run: two people signing the same run at once are serialised here.
  SELECT r.id, r.institution_id, r.generated_by, r.superseded_by, r.superseded_at
    INTO v_run
    FROM public.hr_salary_register_runs r
   WHERE r.id = p_run_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This salary register was not found.' USING ERRCODE = 'P0002';
  END IF;

  -- A regenerated run starts unsigned; signatures never carry over, and the
  -- replaced run cannot be signed.
  IF v_run.superseded_at IS NOT NULL OR v_run.superseded_by IS NOT NULL THEN
    RAISE EXCEPTION 'This register has been replaced by a newer one. Sign the newer register instead.'
      USING ERRCODE = '55000';
  END IF;

  -- NULL-safe: a NULL from any helper is a refusal, not a pass.
  v_ok := public.is_super_admin()
          OR (public.user_has_permission(
                CASE p_stage
                  WHEN 'college_check' THEN 'hr.payroll.register.check'
                  WHEN 'accounts_sign' THEN 'hr.payroll.register.sign'
                END)
              AND public.role_has_institution_access(v_run.institution_id));
  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'You do not have permission to record the % on this register. It needs %.',
      CASE p_stage WHEN 'college_check' THEN 'college check' ELSE 'accounts sign-off' END,
      CASE p_stage WHEN 'college_check' THEN 'hr.payroll.register.check' ELSE 'hr.payroll.register.sign' END
      USING ERRCODE = '42501';
  END IF;

  -- generated_by is nullable (ON DELETE SET NULL): NULL means nobody to compare.
  IF v_run.generated_by = v_uid THEN
    RAISE EXCEPTION 'You generated this register, so you cannot sign it. Another person must.'
      USING ERRCODE = '42501';
  END IF;

  IF p_stage = 'accounts_sign' THEN
    SELECT s.id, s.signed_by
      INTO v_check
      FROM public.hr_salary_register_signoffs s
     WHERE s.run_id = p_run_id
       AND s.stage = 'college_check'
       AND s.revoked_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'The college check must be recorded before the accounts sign-off.'
        USING ERRCODE = '55000';
    END IF;
    IF v_check.signed_by = v_uid THEN
      RAISE EXCEPTION 'You recorded the college check on this register, so the accounts sign-off must be by another person.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.hr_salary_register_signoffs s
     WHERE s.run_id = p_run_id AND s.stage = p_stage AND s.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'This step is already signed on this register.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.hr_salary_register_signoffs (run_id, institution_id, stage, signed_by, note)
  VALUES (p_run_id, v_run.institution_id, p_stage, v_uid, NULLIF(btrim(p_note), ''))
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id',        v_row.id,
    'stage',     v_row.stage,
    'signed_by', v_row.signed_by,
    'signed_at', v_row.signed_at
  );
END;
$$;

COMMENT ON FUNCTION public.fn_hr_register_signoff(uuid, text, text) IS
  'Records college_check (hr.payroll.register.check) or accounts_sign (hr.payroll.register.sign) on a live salary register run. Refuses the run''s generator, a replaced run, accounts before the college check, and one person doing both steps. Migration 20271007161107.';

REVOKE EXECUTE ON FUNCTION public.fn_hr_register_signoff(uuid, text, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_hr_register_signoff(uuid, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- (c) Withdraw a signature
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_register_signoff_revoke(
  p_signoff_id uuid,
  p_reason     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_run_id   uuid;
  v_s        public.hr_salary_register_signoffs%ROWTYPE;
  v_ok       boolean;
  v_cascaded integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in to withdraw a signature.' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(btrim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'Give a reason of at least 10 characters for withdrawing the signature.'
      USING ERRCODE = '22023';
  END IF;

  SELECT s.run_id INTO v_run_id
    FROM public.hr_salary_register_signoffs s
   WHERE s.id = p_signoff_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This signature was not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Same lock order as signing (run first), so a withdrawal and a signature on
  -- the same run cannot interleave.
  PERFORM 1 FROM public.hr_salary_register_runs r WHERE r.id = v_run_id FOR UPDATE;

  SELECT * INTO v_s
    FROM public.hr_salary_register_signoffs s
   WHERE s.id = p_signoff_id
     FOR UPDATE;

  IF v_s.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This signature has already been withdrawn.' USING ERRCODE = '55000';
  END IF;

  -- NULL-safe: only the signer or a super admin.
  v_ok := (v_s.signed_by = v_uid) OR public.is_super_admin();
  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'Only the person who signed, or a super admin, can withdraw this signature.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.hr_salary_register_signoffs
     SET revoked_at = now(), revoked_by = v_uid, revoke_reason = btrim(p_reason), updated_at = now()
   WHERE id = p_signoff_id;

  -- The accounts sign-off rests on the college check: withdraw it too.
  IF v_s.stage = 'college_check' THEN
    UPDATE public.hr_salary_register_signoffs
       SET revoked_at = now(), revoked_by = v_uid,
           revoke_reason = 'college check withdrawn', updated_at = now()
     WHERE run_id = v_s.run_id
       AND stage = 'accounts_sign'
       AND revoked_at IS NULL;
    GET DIAGNOSTICS v_cascaded = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'id',                 v_s.id,
    'stage',              v_s.stage,
    'revoked',            true,
    'also_withdrew_sign', v_cascaded > 0
  );
END;
$$;

COMMENT ON FUNCTION public.fn_hr_register_signoff_revoke(uuid, text) IS
  'Withdraws one salary register signature (signer or super admin, reason >= 10 characters). Withdrawing the college check also withdraws an active accounts sign-off. Migration 20271007161107.';

REVOKE EXECUTE ON FUNCTION public.fn_hr_register_signoff_revoke(uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_hr_register_signoff_revoke(uuid, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- (d) Read both steps for one run
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_hr_register_signoff_status(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_run    record;
  v_ok     boolean;
  v_stage  text;
  v_out    jsonb := '{}'::jsonb;
  v_active record;
  v_last   record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'You need to be signed in to read register signatures.' USING ERRCODE = '42501';
  END IF;

  SELECT r.id, r.institution_id, r.superseded_at, r.superseded_by
    INTO v_run
    FROM public.hr_salary_register_runs r
   WHERE r.id = p_run_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This salary register was not found.' USING ERRCODE = 'P0002';
  END IF;

  v_ok := public.is_super_admin() OR public.is_admin()
          OR (public.user_has_permission('hr.payroll.register.view')
              AND public.role_has_institution_access(v_run.institution_id));
  IF v_ok IS NOT TRUE THEN
    RAISE EXCEPTION 'You do not have permission to see the signatures on this register. It needs hr.payroll.register.view for its college.'
      USING ERRCODE = '42501';
  END IF;

  FOREACH v_stage IN ARRAY ARRAY['college_check', 'accounts_sign'] LOOP
    SELECT s.id, s.signed_by, s.signed_at, s.note, p.full_name
      INTO v_active
      FROM public.hr_salary_register_signoffs s
      LEFT JOIN public.profiles p ON p.id = s.signed_by
     WHERE s.run_id = p_run_id AND s.stage = v_stage AND s.revoked_at IS NULL
     LIMIT 1;

    IF FOUND THEN
      v_out := v_out || jsonb_build_object(v_stage, jsonb_build_object(
        'stage',       v_stage,
        'signed',      true,
        'signoff_id',  v_active.id,
        'signed_by',   v_active.signed_by,
        'signer_name', v_active.full_name,
        'signed_at',   v_active.signed_at,
        'note',        v_active.note,
        'is_mine',     v_active.signed_by = v_uid,
        'last_revoked_at',     NULL,
        'last_revoke_reason',  NULL
      ));
    ELSE
      SELECT s.revoked_at, s.revoke_reason
        INTO v_last
        FROM public.hr_salary_register_signoffs s
       WHERE s.run_id = p_run_id AND s.stage = v_stage AND s.revoked_at IS NOT NULL
       ORDER BY s.revoked_at DESC
       LIMIT 1;
      v_out := v_out || jsonb_build_object(v_stage, jsonb_build_object(
        'stage',       v_stage,
        'signed',      false,
        'signoff_id',  NULL,
        'signed_by',   NULL,
        'signer_name', NULL,
        'signed_at',   NULL,
        'note',        NULL,
        'is_mine',     false,
        'last_revoked_at',    CASE WHEN FOUND THEN v_last.revoked_at END,
        'last_revoke_reason', CASE WHEN FOUND THEN v_last.revoke_reason END
      ));
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'run_id',     p_run_id,
    'superseded', (v_run.superseded_at IS NOT NULL OR v_run.superseded_by IS NOT NULL),
    'stages',     v_out
  );
END;
$$;

COMMENT ON FUNCTION public.fn_hr_register_signoff_status(uuid) IS
  'Both sign-off steps for one salary register run: signer, display name, time, and the last withdrawal. Needs hr.payroll.register.view for the run''s college. Migration 20271007161107.';

REVOKE EXECUTE ON FUNCTION public.fn_hr_register_signoff_status(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_hr_register_signoff_status(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- (e) The export block switch — OFF
--     Guarded on identity (policy_key, scope_type, COALESCE(scope_id, zero)),
--     never on value, so a later Director edit is never overwritten by a re-run.
-- ----------------------------------------------------------------------------
INSERT INTO public.platform_policies
  (policy_key, scope_type, scope_id, value, description, data_type, is_system, is_active)
SELECT
  'hr.harness.proof.register_signoff_required',
  'global',
  NULL,
  'false'::jsonb,
  'When true, the salary register workbook export refuses a run that has no active accounts sign-off (college check, then accounts sign-off). The Director flips it. Read as a literal JSON true; anything else, including a missing or unreadable row, means not enforced. Seeded false. Migration 20271007161107.',
  'boolean',
  true,
  true
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_policies pp
   WHERE pp.policy_key = 'hr.harness.proof.register_signoff_required'
     AND pp.scope_type = 'global'
     AND COALESCE(pp.scope_id, '00000000-0000-0000-0000-000000000000'::uuid)
         = '00000000-0000-0000-0000-000000000000'::uuid
);

-- The two new permission keys (hr.payroll.register.check,
-- hr.payroll.register.sign) are deliberately granted to NO role here.
