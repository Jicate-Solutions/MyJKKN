-- ============================================================================
-- Migration: 20271007161123_hr_duty_proofs
-- Added: 2026-10-07 — HR staff harness, "Proof of done (2)": a required file
-- or a second-person check on the duties that move money or end a job.
-- Design: artifacts/hr-staff-harness-design-2026-10-01.html ("Proof of done").
-- ============================================================================
--
-- WHAT THIS ADDS
--   1. hr_duty_proof_rules (config table, docs/architecture/config-table-pattern.md:
--      shared mixin + typed columns + audit table + super-admin write).
--      One row per duty that needs a proof. Seeded with 3 rows:
--        L4  leave encashment          second_check  hr.leave.encashment.approve
--        G5  termination order         file          hr.employees.edit
--        G6  termination settlement    second_check  hr.payroll.salary.manage
--      duty_code is the same code set as hr_duty_definitions.config_key
--      (#4152, 20270613101207). The two are joined on that code by readers;
--      there is deliberately NO foreign key, so this file does not depend on
--      #4152 landing first.
--   2. hr_duty_proofs — one row per proof (who, when, what). A file row holds
--      a storage path; a second-check row holds 'confirmed' or 'corrected'
--      (+ the right amount and a note of at least 10 characters).
--      One ACTIVE proof per (duty, item, kind); revoked rows stay as history.
--   3. Functions (all SECURITY DEFINER, search_path pinned, REVOKEd from
--      anon + PUBLIC, GRANTed to authenticated only where a signed-in caller
--      needs them):
--        fn_hr_duty_proof_can_view(duty, institution)   RLS helper
--        fn_hr_duty_proof_can_view_object(object name)  storage RLS helper
--        fn_hr_duty_proof_second_check(...)             record a second check
--        fn_hr_duty_proof_attach_file(...)              record a file proof
--        fn_hr_duty_proof_gaps(duty, since)             done items with no proof
--      plus fn_hr_duty_proof_done_items (SECURITY INVOKER, internal, no grant):
--      the ONE definition of "this item is done" per duty, used by all of the
--      above.
--   4. A NEW private storage bucket 'hr-duty-proofs'. Object path shape:
--      <duty>/<item_id>/<uuid>-<file name>. Insert and select only for
--      signed-in users who can see that duty in that item's college.
--
-- WHAT "DONE" MEANS PER DUTY (fn_hr_duty_proof_done_items)
--   L4  hr_leave_encashments.status IN ('approved','paid'). Done at approved_at.
--       Doers: approved_by, and the team member being paid (staff.profile_id).
--       College: hr_organizations.institution_id of the encashment's HR org.
--   G5  hr_offboarding_cases.separation_type = 'termination' and the
--       'director' entry of termination_approval_chain is 'approved' (the
--       Director's sign-off IS the termination order). Done at its acted_at.
--   G6  hr_offboarding_cases.separation_type = 'termination' and the
--       'final_settlement' row exists in hr_offboarding_step_completions.
--       Done at its completed_at. Doers: completed_by, every approved_by on
--       hr_fnf_calculations for the case, and the team member leaving.
--       Amount shown to the checker: the latest approved F&F net_payable.
--   FAIL CLOSED on an unrecorded decider: a second check is refused when the
--   item's decider is NULL (L4 approved_by, G6 completed_by), because "someone
--   other than the person who decided it" cannot be enforced without it.
--   The rule row's applies_when column records this in words for the HR head;
--   it is NOT evaluated (no SQL text is ever executed from a config row). A
--   new rule row for any other duty code lists nothing until an adapter for
--   that code is added to fn_hr_duty_proof_done_items.
--
-- NOTHING IS BLOCKED. No approval, payment or step in any HR flow reads this
-- file. Proof is shown on the duty screens, never enforced, so no switch ships.
-- A 'corrected' check NEVER updates the encashment or the settlement: it is a
-- recorded disagreement and the right amount; HR corrects the source by hand.
--
-- Default taken, overrule here: proof covers three duties. L4 leave encashment
--   gets a second check of the amount. G5 termination gets the signed order as
--   a file. G6 final settlement on a termination case gets a second check.
--   Disciplinary cases (G4) already carry an evidence field and are left alone.
-- Default taken, overrule here: proof is shown, never enforced. No approval or
--   payment is blocked when proof is missing, so no switch is shipped.
-- Default taken, overrule here: the second checker is any holder of the duty's
--   own approve key in that college, except the person who approved the item.
--   The team member being paid (or leaving) cannot check their own amount either.
-- Default taken, overrule here: a 'corrected' check records the disagreement
--   and the right amount. It never changes the encashment or settlement amount
--   itself; HR corrects that by hand.
-- Default taken, overrule here: proof files go in a new private storage bucket,
--   hr-duty-proofs, readable only by people who can see that duty in that college.
-- Default taken, overrule here: no permission key for offboarding exists on
--   main (hr.offboarding.workflow_steps is a platform_policies key, not a
--   permission). G6 uses hr.payroll.salary.manage (the people who manage pay
--   confirm a settlement amount); G5 uses hr.employees.edit. Both are one
--   config row each — a super admin can change them without a deploy.
-- Default taken, overrule here: a wrong file or a mistaken check is not
--   withdrawn from the screen in this build (revoked_at/revoked_by exist for
--   it; no revoke action ships). A super admin can set revoked_at by hand.
--
-- NO existing function, table or policy is replaced by this migration.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. The proof rules (config table)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_duty_proof_rules (
  -- shared config mixin (config-table-pattern.md, verbatim)
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key    text NOT NULL,                  -- the duty code, e.g. 'L4'
  display_name  text NOT NULL,
  description   text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES public.profiles(id),
  change_reason text,

  -- typed columns
  -- Same code set as hr_duty_definitions.config_key (#4152). Joined on this
  -- code by readers; no FK on purpose.
  duty_code              text NOT NULL
                           CHECK (duty_code ~ '^(R[1-9]|L[1-5]|A[1-6]|P[1-4]|S[1-4]|G([1-9]|10))$'),
  item_table             text NOT NULL
                           CHECK (item_table IN ('hr_leave_encashments','hr_offboarding_cases')),
  proof_kind             text NOT NULL
                           CHECK (proof_kind IN ('file','second_check')),
  -- For a second_check rule: the key a checker must hold. For a file rule:
  -- the key that may attach and read the file. NULL = super admins / admins only.
  checker_permission_key text,
  applies_when           text,
  href                   text,

  CONSTRAINT hr_duty_proof_rules_key_is_code CHECK (config_key = duty_code),
  CONSTRAINT hr_duty_proof_rules_checker_named
    CHECK (proof_kind <> 'second_check' OR checker_permission_key IS NOT NULL)
);

COMMENT ON TABLE public.hr_duty_proof_rules IS
  'HR staff harness proof rules (20271007161123): which duty needs which proof (a file or a second-person check) and which permission key the checker holds. Config-table pattern; super admins write, every change audited in hr_duty_proof_rules_audit. Shown, never enforced.';
COMMENT ON COLUMN public.hr_duty_proof_rules.applies_when IS
  'Plain words for the HR head. NOT evaluated: what "done" means per duty lives in fn_hr_duty_proof_done_items.';

CREATE UNIQUE INDEX IF NOT EXISTS hr_duty_proof_rules_active_unique
  ON public.hr_duty_proof_rules (config_key)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.hr_duty_proof_rules_audit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id     uuid NOT NULL REFERENCES public.hr_duty_proof_rules(id),
  changed_at    timestamptz NOT NULL DEFAULT now(),
  changed_by    uuid REFERENCES public.profiles(id),
  old_value     jsonb,
  new_value     jsonb,
  change_reason text
);

CREATE INDEX IF NOT EXISTS idx_hr_duty_proof_rules_audit_config
  ON public.hr_duty_proof_rules_audit (config_id, changed_at DESC);

CREATE OR REPLACE FUNCTION public.fn_hr_duty_proof_rules_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := COALESCE(auth.uid(), NEW.updated_by);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fn_hr_duty_proof_rules_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.hr_duty_proof_rules_audit (config_id, changed_by, old_value, new_value, change_reason)
  VALUES (NEW.id, auth.uid(), to_jsonb(OLD), to_jsonb(NEW), NEW.change_reason);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS hr_duty_proof_rules_touch_trg ON public.hr_duty_proof_rules;
CREATE TRIGGER hr_duty_proof_rules_touch_trg
  BEFORE UPDATE ON public.hr_duty_proof_rules
  FOR EACH ROW EXECUTE FUNCTION public.fn_hr_duty_proof_rules_touch();

DROP TRIGGER IF EXISTS hr_duty_proof_rules_audit_trg ON public.hr_duty_proof_rules;
CREATE TRIGGER hr_duty_proof_rules_audit_trg
  AFTER UPDATE ON public.hr_duty_proof_rules
  FOR EACH ROW EXECUTE FUNCTION public.fn_hr_duty_proof_rules_audit();

REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_proof_rules_audit() FROM anon, PUBLIC, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_proof_rules_touch() FROM anon, PUBLIC, authenticated;

-- Warm-read config (read per screen load / per call), so no pg_notify trigger.

ALTER TABLE public.hr_duty_proof_rules       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_duty_proof_rules_audit ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.hr_duty_proof_rules       FROM anon, PUBLIC;
REVOKE ALL ON public.hr_duty_proof_rules_audit FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.hr_duty_proof_rules TO authenticated;
GRANT SELECT ON public.hr_duty_proof_rules_audit TO authenticated;
GRANT ALL ON public.hr_duty_proof_rules, public.hr_duty_proof_rules_audit TO service_role;

DROP POLICY IF EXISTS hr_duty_proof_rules_read ON public.hr_duty_proof_rules;
CREATE POLICY hr_duty_proof_rules_read ON public.hr_duty_proof_rules
  FOR SELECT USING ((SELECT auth.uid()) IS NOT NULL);

DROP POLICY IF EXISTS hr_duty_proof_rules_write ON public.hr_duty_proof_rules;
CREATE POLICY hr_duty_proof_rules_write ON public.hr_duty_proof_rules
  FOR ALL USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS hr_duty_proof_rules_audit_read ON public.hr_duty_proof_rules_audit;
CREATE POLICY hr_duty_proof_rules_audit_read ON public.hr_duty_proof_rules_audit
  FOR SELECT USING (public.is_super_admin() OR public.is_admin());

-- Seed (idempotent: only when no active row for that duty exists).
INSERT INTO public.hr_duty_proof_rules
  (config_key, duty_code, display_name, description, item_table, proof_kind,
   checker_permission_key, applies_when, href, change_reason)
SELECT v.code, v.code, v.display_name, v.description, v.item_table, v.proof_kind,
       v.checker_key, v.applies_when, v.href, 'Seeded by 20271007161123'
FROM (VALUES
  ('L4', 'Leave encashment: second check of the amount',
   'A second team member confirms the encashment amount, someone other than the approver and the team member being paid.',
   'hr_leave_encashments', 'second_check', 'hr.leave.encashment.approve',
   'status is approved or paid', '/hr/leave/encashment'),
  ('G5', 'Termination: signed order on file',
   'The signed termination order is attached as a file once the Director has signed off.',
   'hr_offboarding_cases', 'file', 'hr.employees.edit',
   'separation_type = termination and the Director step of the approval chain is approved', '/hr/admin/terminations'),
  ('G6', 'Termination final settlement: second check of the amount',
   'A second team member confirms the full and final settlement amount, someone other than whoever completed or approved it.',
   'hr_offboarding_cases', 'second_check', 'hr.payroll.salary.manage',
   'separation_type = termination and the final_settlement step is complete', '/hr/admin/terminations')
) AS v(code, display_name, description, item_table, proof_kind, checker_key, applies_when, href)
WHERE NOT EXISTS (
  SELECT 1 FROM public.hr_duty_proof_rules r WHERE r.config_key = v.code AND r.is_active
);

-- ----------------------------------------------------------------------------
-- 2. The proofs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.hr_duty_proofs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  duty_code        text NOT NULL
                     CHECK (duty_code ~ '^(R[1-9]|L[1-5]|A[1-6]|P[1-4]|S[1-4]|G([1-9]|10))$'),
  item_table       text NOT NULL
                     CHECK (item_table IN ('hr_leave_encashments','hr_offboarding_cases')),
  item_id          uuid NOT NULL,
  institution_id   uuid,
  kind             text NOT NULL CHECK (kind IN ('file','second_check')),
  storage_path     text,
  file_name        text,
  recorded_by      uuid NOT NULL REFERENCES public.profiles(id),
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  check_result     text CHECK (check_result IN ('confirmed','corrected')),
  corrected_amount numeric(12,2),
  check_note       text,
  revoked_at       timestamptz,
  revoked_by       uuid REFERENCES public.profiles(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hr_duty_proofs_file_has_path
    CHECK (kind <> 'file' OR (storage_path IS NOT NULL AND file_name IS NOT NULL AND check_result IS NULL)),
  CONSTRAINT hr_duty_proofs_check_has_result
    CHECK (kind <> 'second_check' OR (check_result IS NOT NULL AND storage_path IS NULL)),
  CONSTRAINT hr_duty_proofs_corrected_has_amount_and_note
    CHECK (check_result IS DISTINCT FROM 'corrected'
           OR (corrected_amount IS NOT NULL AND char_length(btrim(COALESCE(check_note, ''))) >= 10)),
  CONSTRAINT hr_duty_proofs_confirmed_has_no_amount
    CHECK (check_result IS DISTINCT FROM 'confirmed' OR corrected_amount IS NULL),
  CONSTRAINT hr_duty_proofs_revoke_pair
    CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);

COMMENT ON TABLE public.hr_duty_proofs IS
  'HR staff harness proof of done (20271007161123): a file or a second-person check per done item. Written only by fn_hr_duty_proof_second_check / fn_hr_duty_proof_attach_file. A corrected check never changes the source item.';

CREATE UNIQUE INDEX IF NOT EXISTS hr_duty_proofs_one_active
  ON public.hr_duty_proofs (duty_code, item_id, kind)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_hr_duty_proofs_item
  ON public.hr_duty_proofs (item_id);

ALTER TABLE public.hr_duty_proofs ENABLE ROW LEVEL SECURITY;

-- No write policies: rows are written only through the SECURITY DEFINER
-- functions below. Signed-in users may SELECT, RLS decides which rows.
REVOKE ALL ON public.hr_duty_proofs FROM anon, PUBLIC;
GRANT SELECT ON public.hr_duty_proofs TO authenticated;
GRANT ALL ON public.hr_duty_proofs TO service_role;

-- ----------------------------------------------------------------------------
-- 3. Who may see a duty's proofs in a college (RLS helper)
-- ----------------------------------------------------------------------------
-- A SECURITY DEFINER helper so the hr_duty_proofs policy reads the rule row
-- without the policy querying a table of its own. Fails CLOSED: no active rule,
-- no key, or a NULL from either permission helper all mean "not visible".
CREATE OR REPLACE FUNCTION public.fn_hr_duty_proof_can_view(p_duty text, p_institution_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text;
BEGIN
  IF COALESCE(public.is_super_admin(), false) OR COALESCE(public.is_admin(), false) THEN
    RETURN true;
  END IF;

  SELECT r.checker_permission_key INTO v_key
  FROM public.hr_duty_proof_rules r
  WHERE r.config_key = p_duty AND r.is_active;

  IF v_key IS NULL THEN
    RETURN false;
  END IF;

  RETURN COALESCE(public.user_has_permission(v_key)
                  AND public.role_has_institution_access(p_institution_id), false);
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_proof_can_view(text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_duty_proof_can_view(text, uuid) TO authenticated;

DROP POLICY IF EXISTS hr_duty_proofs_select ON public.hr_duty_proofs;
CREATE POLICY hr_duty_proofs_select ON public.hr_duty_proofs
  FOR SELECT USING (
    public.is_super_admin() OR public.is_admin()
    OR public.fn_hr_duty_proof_can_view(duty_code, institution_id)
  );

-- ----------------------------------------------------------------------------
-- 4. The one definition of "done" per duty (internal)
-- ----------------------------------------------------------------------------
-- SECURITY INVOKER and granted to nobody: it is only ever called from inside
-- the SECURITY DEFINER functions below, so it reads as their owner.
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
    RETURN QUERY
    SELECT c.id,
           CASE WHEN (d.entry->>'acted_at') ~ '^\d{4}-\d{2}-\d{2}'
                THEN (d.entry->>'acted_at')::timestamptz
                ELSE c.updated_at END,
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
    RETURN QUERY
    SELECT c.id,
           sc.completed_at,
           c.institution_id,
           array_remove(
             ARRAY[sc.completed_by, s.profile_id]
             || ARRAY(SELECT f.approved_by FROM public.hr_fnf_calculations f
                      WHERE f.case_id = c.id AND f.approved_by IS NOT NULL),
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
-- 5. Storage: a private bucket for proof files
-- ----------------------------------------------------------------------------
-- Path: <duty>/<item_id>/<uuid>-<file name>. The object is readable and
-- writable only by a signed-in user who can see that duty in the item's
-- college, and only for a done item of a 'file' rule.
CREATE OR REPLACE FUNCTION public.fn_hr_duty_proof_can_view_object(p_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parts text[] := string_to_array(COALESCE(p_name, ''), '/');
  v_item  uuid;
  v_inst  uuid;
  v_key   text;
BEGIN
  IF array_length(v_parts, 1) IS DISTINCT FROM 3
     OR v_parts[2] !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR COALESCE(v_parts[3], '') = '' THEN
    RETURN false;
  END IF;

  SELECT r.checker_permission_key INTO v_key
  FROM public.hr_duty_proof_rules r
  WHERE r.config_key = v_parts[1] AND r.is_active AND r.proof_kind = 'file';
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_item := v_parts[2]::uuid;
  SELECT d.institution_id INTO v_inst
  FROM public.fn_hr_duty_proof_done_items(v_parts[1], v_item) d
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF COALESCE(public.is_super_admin(), false) OR COALESCE(public.is_admin(), false) THEN
    RETURN true;
  END IF;

  -- The caller holds the rule's key in the item's college. A NULL from either
  -- helper is "no".
  RETURN COALESCE(public.user_has_permission(v_key)
                  AND public.role_has_institution_access(v_inst), false);
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_proof_can_view_object(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_duty_proof_can_view_object(text) TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hr-duty-proofs', 'hr-duty-proofs', false,
  10485760,  -- 10 MB: a scanned signed order
  ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS hr_duty_proofs_objects_insert ON storage.objects;
CREATE POLICY hr_duty_proofs_objects_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'hr-duty-proofs' AND public.fn_hr_duty_proof_can_view_object(name));

DROP POLICY IF EXISTS hr_duty_proofs_objects_select ON storage.objects;
CREATE POLICY hr_duty_proofs_objects_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'hr-duty-proofs' AND public.fn_hr_duty_proof_can_view_object(name));

-- ----------------------------------------------------------------------------
-- 6. Record a second check
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

  -- 7. Insert. The source item is never updated.
  BEGIN
    INSERT INTO public.hr_duty_proofs
      (duty_code, item_table, item_id, institution_id, kind, recorded_by,
       check_result, corrected_amount, check_note)
    VALUES
      (p_duty, v_rule.item_table, p_item_id, v_item.institution_id, 'second_check', v_uid,
       p_result,
       CASE WHEN p_result = 'corrected' THEN p_corrected_amount END,
       NULLIF(btrim(COALESCE(p_note, '')), ''))
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This item already has a second check' USING ERRCODE = '23505';
  END;

  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_proof_second_check(text, uuid, text, numeric, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_duty_proof_second_check(text, uuid, text, numeric, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7. Record a file proof
-- ----------------------------------------------------------------------------
-- The browser uploads the file to the bucket first (the bucket's own policy
-- checks the caller), then calls this with the path.
CREATE OR REPLACE FUNCTION public.fn_hr_duty_proof_attach_file(
  p_duty text,
  p_item_id uuid,
  p_storage_path text,
  p_file_name text
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
    RAISE EXCEPTION 'Sign in to attach a file' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_rule FROM public.hr_duty_proof_rules r
  WHERE r.config_key = p_duty AND r.is_active;
  IF NOT FOUND OR v_rule.proof_kind <> 'file' THEN
    RAISE EXCEPTION 'Duty % does not take a file', p_duty USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_item FROM public.fn_hr_duty_proof_done_items(p_duty, p_item_id) d LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This item is not at the step that needs a file yet' USING ERRCODE = '22023';
  END IF;

  IF public.fn_hr_duty_proof_can_view(p_duty, v_item.institution_id) IS NOT TRUE THEN
    RAISE EXCEPTION 'You do not have the permission to attach a file to this duty in this college'
      USING ERRCODE = '42501';
  END IF;

  IF p_storage_path IS NULL
     OR position(p_duty || '/' || p_item_id::text || '/' IN p_storage_path) <> 1
     OR p_storage_path LIKE '%..%'
     OR char_length(btrim(COALESCE(p_file_name, ''))) = 0 THEN
    RAISE EXCEPTION 'The file path must be %/%/<file>', p_duty, p_item_id USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM storage.objects o
                 WHERE o.bucket_id = 'hr-duty-proofs' AND o.name = p_storage_path) THEN
    RAISE EXCEPTION 'The file has not been uploaded' USING ERRCODE = '22023';
  END IF;

  BEGIN
    INSERT INTO public.hr_duty_proofs
      (duty_code, item_table, item_id, institution_id, kind, storage_path, file_name, recorded_by)
    VALUES
      (p_duty, v_rule.item_table, p_item_id, v_item.institution_id, 'file',
       p_storage_path, btrim(p_file_name), v_uid)
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This item already has a file attached' USING ERRCODE = '23505';
  END;

  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_proof_attach_file(text, uuid, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_duty_proof_attach_file(text, uuid, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8. Done items still missing their proof
-- ----------------------------------------------------------------------------
-- Limited to the caller's colleges. Also returns the amount (so the checker
-- can confirm it) and whether the caller is one of the item's doers (so the
-- screen hides the check button for them; the check function refuses anyway).
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

  RETURN QUERY
  SELECT d.item_id, d.done_at, d.institution_id, d.amount,
         COALESCE(v_uid = ANY (d.doer_ids), false)
  FROM public.fn_hr_duty_proof_done_items(p_duty) d
  WHERE (p_since IS NULL OR d.done_at >= p_since)
    AND public.fn_hr_duty_proof_can_view(p_duty, d.institution_id)
    AND NOT EXISTS (
      SELECT 1 FROM public.hr_duty_proofs p
      WHERE p.duty_code = p_duty
        AND p.item_id = d.item_id
        AND p.kind = v_rule.proof_kind
        AND p.revoked_at IS NULL
    )
  ORDER BY d.done_at DESC;
END $$;

REVOKE EXECUTE ON FUNCTION public.fn_hr_duty_proof_gaps(text, date) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_hr_duty_proof_gaps(text, date) TO authenticated;
