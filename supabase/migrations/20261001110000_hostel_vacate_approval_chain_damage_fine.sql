-- ============================================================================
-- Hostel vacate: 6-step approval chain + room damage + auto fine bill
-- ============================================================================
-- draft -> [submit] -> pending_dues (auto bill check) -> pending_principal
--       -> pending_warden (checklist + room inspection/damages)
--       -> pending_mess -> pending_cao
--       -> pending_fine (only when damage_total > 0) -> completed
--
-- Completion (_cl_vacate_finalize) = vacate allocation + free bed + Day Scholar
-- + clear hostel/mess categories. It runs from the CAO approval (no damage) or
-- from the trigger below when the fine bill is paid (or cancelled by Accounts).
--
-- Every transition is a SECURITY DEFINER RPC that derives the caller from
-- auth.uid(), checks the step's permission + scope and re-checks the gates in
-- the database. Direct writes to the vacate tables stay admin / own-draft only.
-- ============================================================================

-- ─── 0. Backup of the role grants this migration edits ─────────────────────
CREATE TABLE IF NOT EXISTS public.bak_vacate_chain_role_grants_20261001 AS
SELECT id, role_key, permissions, now() AS backed_up_at
FROM public.custom_roles
WHERE role_key IN ('principal', 'school_principal', 'mess_operations', 'cao', 'hostel_office', 'chief_warden');
ALTER TABLE public.bak_vacate_chain_role_grants_20261001 ENABLE ROW LEVEL SECURITY;

-- ─── 1. Damage-type master (global list, like the checklist master) ────────
CREATE TABLE IF NOT EXISTS public.hostel_damage_types (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  default_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (default_amount >= 0),
  is_active      boolean NOT NULL DEFAULT true,
  sort_order     integer NOT NULL DEFAULT 100,
  created_by     uuid REFERENCES auth.users(id),
  updated_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hostel_damage_types ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hostel_damage_types FROM anon;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hdt_name ON public.hostel_damage_types (lower(btrim(name)));
CREATE INDEX IF NOT EXISTS idx_hdt_active_sort ON public.hostel_damage_types (is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_hdt_created_by ON public.hostel_damage_types (created_by);
CREATE INDEX IF NOT EXISTS idx_hdt_updated_by ON public.hostel_damage_types (updated_by);

DROP TRIGGER IF EXISTS tr_hdt_updated_at ON public.hostel_damage_types;
CREATE TRIGGER tr_hdt_updated_at BEFORE UPDATE ON public.hostel_damage_types
  FOR EACH ROW EXECUTE FUNCTION public.set_hostel_vacate_updated_at();

DROP POLICY IF EXISTS hdt_select ON public.hostel_damage_types;
CREATE POLICY hdt_select ON public.hostel_damage_types FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (SELECT public.user_has_permission('campus_living.damage_types.manage'))
    OR (SELECT public.user_has_permission('campus_living.vacate_requests.view'))
  );

DROP POLICY IF EXISTS hdt_insert ON public.hostel_damage_types;
CREATE POLICY hdt_insert ON public.hostel_damage_types FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (SELECT public.user_has_permission('campus_living.damage_types.manage'))
  );

DROP POLICY IF EXISTS hdt_update ON public.hostel_damage_types;
CREATE POLICY hdt_update ON public.hostel_damage_types FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (SELECT public.user_has_permission('campus_living.damage_types.manage'))
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (SELECT public.user_has_permission('campus_living.damage_types.manage'))
  );
-- No DELETE policy: types are deactivated, never deleted (damages keep a name snapshot anyway).

INSERT INTO public.hostel_damage_types (name, default_amount, sort_order)
SELECT v.name, v.amt, v.ord
FROM (VALUES
  ('Window / Glass',            500,  10),
  ('Fan / Light / Switch',      300,  20),
  ('Cot / Mattress',            1500, 30),
  ('Cupboard / Furniture',      1000, 40),
  ('Door / Lock',               800,  50),
  ('Wall / Paint',              600,  60),
  ('Other',                     0,    100)
) AS v(name, amt, ord)
WHERE NOT EXISTS (SELECT 1 FROM public.hostel_damage_types);

-- ─── 2. Request-side tables / columns ──────────────────────────────────────
ALTER TABLE public.hostel_vacate_requests
  ADD COLUMN IF NOT EXISTS room_inspected boolean       NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS damage_total   numeric(10,2) NOT NULL DEFAULT 0 CHECK (damage_total >= 0),
  ADD COLUMN IF NOT EXISTS fine_bill_id   uuid REFERENCES public.billing_student_bills(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_hvr_fine_bill ON public.hostel_vacate_requests (fine_bill_id) WHERE fine_bill_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hvr_dues_learner ON public.hostel_vacate_requests (learner_id) WHERE status = 'pending_dues';

CREATE TABLE IF NOT EXISTS public.hostel_vacate_damages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vacate_request_id uuid NOT NULL REFERENCES public.hostel_vacate_requests(id) ON DELETE CASCADE,
  damage_type_id    uuid REFERENCES public.hostel_damage_types(id) ON DELETE SET NULL,
  damage_name       text NOT NULL,
  note              text CHECK (note IS NULL OR char_length(note) <= 500),
  amount            numeric(10,2) NOT NULL CHECK (amount > 0),
  recorded_by       uuid REFERENCES auth.users(id),
  created_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hostel_vacate_damages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hostel_vacate_damages FROM anon;
CREATE INDEX IF NOT EXISTS idx_hvdm_request ON public.hostel_vacate_damages (vacate_request_id);
CREATE INDEX IF NOT EXISTS idx_hvdm_type ON public.hostel_vacate_damages (damage_type_id);
CREATE INDEX IF NOT EXISTS idx_hvdm_recorded_by ON public.hostel_vacate_damages (recorded_by);

CREATE TABLE IF NOT EXISTS public.hostel_vacate_approvals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vacate_request_id uuid NOT NULL REFERENCES public.hostel_vacate_requests(id) ON DELETE CASCADE,
  step              text NOT NULL CHECK (step IN ('bills', 'principal', 'warden', 'mess', 'cao', 'fine')),
  action            text NOT NULL CHECK (action IN ('approved', 'rejected', 'cancelled', 'system')),
  actor_id          uuid REFERENCES auth.users(id),
  remarks           text,
  acted_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hostel_vacate_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hostel_vacate_approvals FROM anon;
CREATE INDEX IF NOT EXISTS idx_hva_request ON public.hostel_vacate_approvals (vacate_request_id, acted_at);
CREATE INDEX IF NOT EXISTS idx_hva_actor ON public.hostel_vacate_approvals (actor_id);

-- Same read rule as the request itself (institution OR block scope, or own).
DROP POLICY IF EXISTS hvdm_select ON public.hostel_vacate_damages;
CREATE POLICY hvdm_select ON public.hostel_vacate_damages FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR EXISTS (
      SELECT 1 FROM public.hostel_vacate_requests r
       WHERE r.id = hostel_vacate_damages.vacate_request_id
         AND (
           ((SELECT public.user_has_permission('campus_living.vacate_requests.view'))
             AND public.fn_cl_vacate_scope_ok(r.institution_id, r.allocation_id))
           OR ((SELECT public.user_has_permission('campus_living.vacate_requests.view_own'))
             AND (r.submitted_by_id = (SELECT auth.uid()) OR r.learner_id = (SELECT auth.uid())))
         )
    )
  );

DROP POLICY IF EXISTS hva_select ON public.hostel_vacate_approvals;
CREATE POLICY hva_select ON public.hostel_vacate_approvals FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR EXISTS (
      SELECT 1 FROM public.hostel_vacate_requests r
       WHERE r.id = hostel_vacate_approvals.vacate_request_id
         AND (
           ((SELECT public.user_has_permission('campus_living.vacate_requests.view'))
             AND public.fn_cl_vacate_scope_ok(r.institution_id, r.allocation_id))
           OR ((SELECT public.user_has_permission('campus_living.vacate_requests.view_own'))
             AND (r.submitted_by_id = (SELECT auth.uid()) OR r.learner_id = (SELECT auth.uid())))
         )
    )
  );
-- No INSERT/UPDATE/DELETE policies: only the SECURITY DEFINER RPCs write these.

-- One open request per allocation — now including the new statuses.
DROP INDEX IF EXISTS public.hvr_one_open_per_allocation;
CREATE UNIQUE INDEX hvr_one_open_per_allocation
  ON public.hostel_vacate_requests (allocation_id)
  WHERE status IN ('draft', 'pending_parent', 'pending_warden', 'pending_chief', 'pending_dues', 'approved',
                   'pending_principal', 'pending_mess', 'pending_cao', 'pending_fine');

-- ─── 3. Fine billing category ──────────────────────────────────────────────
-- category_name is globally UNIQUE; kind 'penalty' is excluded from the vacate
-- bill gate (which counts only hostel / mess bills), so the fine never blocks
-- the very vacate it belongs to.
INSERT INTO public.billing_categories
  (category_name, kind, frequency, is_active, description, visible_to_learners, collection_type, applies_to)
SELECT 'Hostel Damage Fine', 'penalty', 'one-time', true,
       'Auto-created at CAO approval of a hostel vacate when room damage was recorded',
       true, 'management', ARRAY['college', 'school']
WHERE NOT EXISTS (SELECT 1 FROM public.billing_categories WHERE category_name = 'Hostel Damage Fine');

-- ─── 4. Helpers ────────────────────────────────────────────────────────────
-- Permission key that gates the step a request is currently at.
CREATE OR REPLACE FUNCTION public._cl_vacate_step_perm(p_status text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE p_status
    WHEN 'pending_principal' THEN 'campus_living.vacate_requests.approve_principal'
    WHEN 'pending_warden'    THEN 'campus_living.vacate_requests.approve_warden'
    WHEN 'pending_mess'      THEN 'campus_living.vacate_requests.approve_mess'
    WHEN 'pending_cao'       THEN 'campus_living.vacate_requests.approve_cao'
  END;
$$;
REVOKE EXECUTE ON FUNCTION public._cl_vacate_step_perm(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public._cl_vacate_step_perm(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._cl_vacate_step_name(p_status text)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE p_status
    WHEN 'pending_principal' THEN 'principal'
    WHEN 'pending_warden'    THEN 'warden'
    WHEN 'pending_mess'      THEN 'mess'
    WHEN 'pending_cao'       THEN 'cao'
    WHEN 'pending_fine'      THEN 'fine'
    WHEN 'pending_dues'      THEN 'bills'
  END;
$$;
REVOKE EXECUTE ON FUNCTION public._cl_vacate_step_name(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public._cl_vacate_step_name(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._cl_vacate_log(
  p_request_id uuid, p_step text, p_action text, p_actor uuid, p_remarks text
) RETURNS void
LANGUAGE sql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  INSERT INTO public.hostel_vacate_approvals (vacate_request_id, step, action, actor_id, remarks)
  VALUES (p_request_id, p_step, p_action, p_actor, NULLIF(btrim(COALESCE(p_remarks, '')), ''));
$$;
REVOKE EXECUTE ON FUNCTION public._cl_vacate_log(uuid, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._cl_vacate_log(uuid, text, text, uuid, text) TO service_role;

-- Step 1 -> 2 when every hostel/mess bill is settled. Used by recheck + trigger.
CREATE OR REPLACE FUNCTION public._cl_vacate_advance_from_dues(p_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r     public.hostel_vacate_requests%ROWTYPE;
  v_out numeric;
BEGIN
  SELECT * INTO r FROM public.hostel_vacate_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'pending_dues' THEN
    RETURN false;
  END IF;
  v_out := (public._cl_vacate_bills(r.learner_id)->>'total_outstanding')::numeric;
  IF v_out > 0 THEN
    RETURN false;
  END IF;
  UPDATE public.hostel_vacate_requests
     SET status = 'pending_principal', updated_at = now()
   WHERE id = r.id;
  PERFORM public._cl_vacate_log(r.id, 'bills', 'system', NULL, 'All hostel and mess bills are cleared');
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._cl_vacate_advance_from_dues(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._cl_vacate_advance_from_dues(uuid) TO service_role;

-- ─── 5. Submit: freeze checklist, hold bed, run the Step-1 bill check ──────
CREATE OR REPLACE FUNCTION public.fn_cl_vacate_submit(p_request_id uuid)
RETURNS public.hostel_vacate_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  r     public.hostel_vacate_requests%ROWTYPE;
  v_row public.hostel_vacate_requests;
  v_out numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.hostel_vacate_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vacate request % not found', p_request_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.is_super_admin() OR public.is_admin() OR r.submitted_by_id = v_uid) THEN
    RAISE EXCEPTION 'Only the person who raised this request can submit it' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'draft' THEN
    RAISE EXCEPTION 'Request is not a draft (status=%)', r.status USING ERRCODE = 'P0001';
  END IF;

  IF r.reason_type = 'medical' AND NOT EXISTS (
    SELECT 1 FROM public.hostel_vacate_documents d
     WHERE d.vacate_request_id = r.id AND d.document_type = 'medical_certificate'
  ) THEN
    RAISE EXCEPTION 'Medical-reason vacates require a medical certificate before submit'
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.hostel_clearance_items
    (vacate_request_id, item_key, item_label, is_required, sort_order, checklist_item_id)
  SELECT r.id, 'chk_' || replace(m.id::text, '-', ''), m.item_label, m.is_required, m.sort_order, m.id
    FROM public.hostel_vacate_checklist_items m
   WHERE m.is_active
     AND (m.applies_to_reasons IS NULL OR r.reason_type = ANY (m.applies_to_reasons))
  ON CONFLICT (vacate_request_id, item_key) DO NOTHING;

  -- Step 1: automatic bill check. Cleared -> straight to the principal.
  v_out := (public._cl_vacate_bills(r.learner_id)->>'total_outstanding')::numeric;

  UPDATE public.hostel_vacate_requests
     SET status = CASE WHEN v_out > 0 THEN 'pending_dues' ELSE 'pending_principal' END::public.vacate_request_status_enum,
         warden_last_action_at = now(),
         updated_at = now()
   WHERE id = r.id
  RETURNING * INTO v_row;

  PERFORM public._cl_vacate_log(
    r.id, 'bills', 'system', NULL,
    CASE WHEN v_out > 0
         THEN 'Submitted — outstanding hostel/mess bills: ' || v_out::text
         ELSE 'Submitted — all hostel and mess bills are cleared' END);

  -- Hold the bed while the request is open (still occupied, not reallocatable).
  UPDATE public.hostel_allocations
     SET status = 'pending_vacate', updated_at = now()
   WHERE id = r.allocation_id AND status = 'active';

  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_cl_vacate_submit(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_vacate_submit(uuid) TO authenticated, service_role;

-- Duplicate-open check in create must know the new statuses too.
CREATE OR REPLACE FUNCTION public.fn_cl_vacate_create(
  p_allocation_id  uuid,
  p_reason_type    public.vacate_reason_enum,
  p_reason_text    text,
  p_requested_date date,
  p_medical_notes  text DEFAULT NULL
)
RETURNS public.hostel_vacate_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  a           public.hostel_allocations%ROWTYPE;
  v_on_behalf boolean;
  v_type      public.hostel_resident_type_enum;
  v_row       public.hostel_vacate_requests;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO a FROM public.hostel_allocations WHERE id = p_allocation_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation % not found', p_allocation_id USING ERRCODE = 'P0002';
  END IF;
  IF a.status <> 'active' THEN
    RAISE EXCEPTION 'Only an active allocation can be vacated (current status: %)', a.status
      USING ERRCODE = 'P0001';
  END IF;

  v_on_behalf := a.learner_id IS DISTINCT FROM v_uid;

  IF v_on_behalf THEN
    IF NOT (public.is_super_admin() OR public.is_admin()
            OR (public.user_has_permission('campus_living.vacate_requests.submit_on_behalf')
                AND public.fn_cl_vacate_scope_ok(a.institution_id, a.id))) THEN
      RAISE EXCEPTION 'Not authorized to raise a vacate request for this resident'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (public.is_super_admin() OR public.is_admin()
             OR public.user_has_permission('campus_living.vacate_requests.submit')) THEN
    RAISE EXCEPTION 'Not authorized to submit a vacate request' USING ERRCODE = '42501';
  END IF;

  IF p_reason_text IS NULL OR char_length(btrim(p_reason_text)) < 10 THEN
    RAISE EXCEPTION 'Reason must be at least 10 characters' USING ERRCODE = '22023';
  END IF;
  IF p_requested_date IS NULL THEN
    RAISE EXCEPTION 'Requested vacate date is required' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.hostel_vacate_requests x
     WHERE x.allocation_id = a.id
       AND x.status IN ('draft', 'pending_parent', 'pending_warden', 'pending_chief', 'pending_dues', 'approved',
                        'pending_principal', 'pending_mess', 'pending_cao', 'pending_fine')
  ) THEN
    RAISE EXCEPTION 'An open vacate request already exists for this allocation' USING ERRCODE = '23505';
  END IF;

  SELECT COALESCE((SELECT resident_type FROM public.hostel_residents WHERE id = a.resident_id), 'learner')
    INTO v_type;

  INSERT INTO public.hostel_vacate_requests (
    institution_id, allocation_id, resident_id, learner_id, resident_type,
    reason_type, reason_text, requested_vacate_date,
    is_permanent, is_scheduled, has_medical_grounds, medical_notes,
    status, submitted_by_id, submitted_on_behalf_of_id
  ) VALUES (
    a.institution_id, a.id, a.resident_id, a.learner_id, v_type,
    p_reason_type, btrim(p_reason_text), p_requested_date,
    p_reason_type <> 'semester_end',
    p_reason_type IN ('graduation', 'semester_end', 'transfer'),
    p_reason_type = 'medical',
    CASE WHEN p_reason_type = 'medical' THEN NULLIF(btrim(COALESCE(p_medical_notes, '')), '') END,
    'draft', v_uid,
    CASE WHEN v_on_behalf THEN a.learner_id END
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_cl_vacate_create(uuid, public.vacate_reason_enum, text, date, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_vacate_create(uuid, public.vacate_reason_enum, text, date, text) TO authenticated, service_role;

-- ─── 6. Re-check bills (Step 1 refresh button) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cl_vacate_recheck_bills(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  r       public.hostel_vacate_requests%ROWTYPE;
  v_moved boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.hostel_vacate_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vacate request % not found', p_request_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.is_super_admin() OR public.is_admin()
    OR (public.user_has_permission('campus_living.vacate_requests.view')
        AND public.fn_cl_vacate_scope_ok(r.institution_id, r.allocation_id))
    OR (public.user_has_permission('campus_living.vacate_requests.view_own')
        AND (r.submitted_by_id = v_uid OR r.learner_id = v_uid))
  ) THEN
    RAISE EXCEPTION 'Not authorized to view this vacate request' USING ERRCODE = '42501';
  END IF;

  IF r.status = 'pending_dues' THEN
    v_moved := public._cl_vacate_advance_from_dues(r.id);
  END IF;

  RETURN jsonb_build_object(
    'advanced', v_moved,
    'status',   (SELECT status FROM public.hostel_vacate_requests WHERE id = r.id),
    'bills',    public._cl_vacate_bills(r.learner_id));
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_cl_vacate_recheck_bills(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_vacate_recheck_bills(uuid) TO authenticated, service_role;

-- ─── 7. Warden: record room inspection (damages) ───────────────────────────
-- p_lines = [{ "damage_type_id": uuid, "amount": number, "note": text }, ...]
-- p_no_damage = true  <=> no lines; false <=> at least one line. The warden has
-- to take an explicit decision either way before approving.
CREATE OR REPLACE FUNCTION public.fn_cl_vacate_set_damages(
  p_request_id uuid,
  p_lines      jsonb,
  p_no_damage  boolean
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  r       public.hostel_vacate_requests%ROWTYPE;
  v_n     integer;
  v_total numeric(10,2);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.hostel_vacate_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vacate request % not found', p_request_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.is_super_admin() OR public.is_admin()
          OR (public.user_has_permission('campus_living.vacate_requests.mark_clearance')
              AND public.fn_cl_vacate_scope_ok(r.institution_id, r.allocation_id))) THEN
    RAISE EXCEPTION 'Not authorized to record room damages' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'pending_warden' THEN
    RAISE EXCEPTION 'Damages can only be recorded while the request is with the warden (status=%)', r.status
      USING ERRCODE = 'P0001';
  END IF;

  p_lines := COALESCE(p_lines, '[]'::jsonb);
  IF jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'Damage lines must be a JSON array' USING ERRCODE = '22023';
  END IF;
  v_n := jsonb_array_length(p_lines);

  IF p_no_damage AND v_n > 0 THEN
    RAISE EXCEPTION 'Remove the damage lines or untick "No damage"' USING ERRCODE = '22023';
  END IF;
  IF NOT p_no_damage AND v_n = 0 THEN
    RAISE EXCEPTION 'Add at least one damage, or confirm "No damage"' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.hostel_vacate_damages WHERE vacate_request_id = r.id;

  IF v_n > 0 THEN
    INSERT INTO public.hostel_vacate_damages
      (vacate_request_id, damage_type_id, damage_name, note, amount, recorded_by)
    SELECT r.id, t.id, t.name, NULLIF(btrim(COALESCE(x.note, '')), ''),
           COALESCE(x.amount, t.default_amount), v_uid
      FROM jsonb_to_recordset(p_lines) AS x(damage_type_id uuid, amount numeric, note text)
      JOIN public.hostel_damage_types t ON t.id = x.damage_type_id AND t.is_active;

    IF (SELECT COUNT(*) FROM public.hostel_vacate_damages WHERE vacate_request_id = r.id) <> v_n THEN
      RAISE EXCEPTION 'A damage line refers to an unknown or inactive damage type' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_total
    FROM public.hostel_vacate_damages WHERE vacate_request_id = r.id;

  UPDATE public.hostel_vacate_requests
     SET room_inspected = true, damage_total = v_total,
         warden_last_action_at = now(), updated_at = now()
   WHERE id = r.id;

  RETURN jsonb_build_object('room_inspected', true, 'damage_total', v_total, 'lines', v_n);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_cl_vacate_set_damages(uuid, jsonb, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_vacate_set_damages(uuid, jsonb, boolean) TO authenticated, service_role;

-- ─── 8. Completion (internal) ──────────────────────────────────────────────
-- Same atomic body the one-step warden approve used to run: vacate the
-- allocation + free the bed FIRST, then flip the learner to Day Scholar and
-- clear the hostel/mess categories (trg_allocation_sync_accommodation_type only
-- acts on active/pending_approval rows). Idempotent for a completed request.
-- No auth.uid(): it runs from the CAO approval or from the payment trigger.
CREATE OR REPLACE FUNCTION public._cl_vacate_finalize(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r             public.hostel_vacate_requests%ROWTYPE;
  a             public.hostel_allocations%ROWTYPE;
  v_bills       jsonb;
  v_outstanding numeric;
  v_unpaid      integer;
  v_pending     integer;
  v_lp          uuid;
  v_daysch      uuid;
  v_snapshot    jsonb;
  v_freed_bed   uuid;
BEGIN
  SELECT * INTO r FROM public.hostel_vacate_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vacate request % not found', p_request_id USING ERRCODE = 'P0002';
  END IF;
  IF r.status = 'completed' THEN
    RETURN jsonb_build_object('success', true, 'already_completed', true, 'request_id', r.id);
  END IF;
  IF r.status NOT IN ('pending_cao', 'pending_fine') THEN
    RAISE EXCEPTION 'Request cannot be completed from status %', r.status USING ERRCODE = 'P0001';
  END IF;

  -- Gate 1: every hostel / mess bill, all years, settled. No override.
  v_bills       := public._cl_vacate_bills(r.learner_id);
  v_outstanding := (v_bills->>'total_outstanding')::numeric;
  v_unpaid      := (v_bills->>'unpaid_count')::integer;
  IF v_outstanding > 0 THEN
    RAISE EXCEPTION 'Unpaid hostel bills: % outstanding across % bill(s). Clear them before completing.',
      v_outstanding, v_unpaid USING ERRCODE = 'P0001';
  END IF;

  -- Gate 2: every required checklist item ticked.
  SELECT COUNT(*) INTO v_pending
    FROM public.hostel_clearance_items
   WHERE vacate_request_id = r.id AND is_required AND NOT is_cleared;
  IF v_pending > 0 THEN
    RAISE EXCEPTION '% required checklist item(s) are not cleared yet', v_pending USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO a FROM public.hostel_allocations WHERE id = r.allocation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Allocation % not found', r.allocation_id USING ERRCODE = 'P0002';
  END IF;
  IF a.status NOT IN ('active', 'pending_vacate', 'vacated') THEN
    RAISE EXCEPTION 'Allocation cannot be vacated from status %', a.status USING ERRCODE = 'P0001';
  END IF;

  SELECT jsonb_build_object(
           'block_id', a.block_id, 'block_name', b.name,
           'room_id',  a.room_id,  'room_number', rm.room_number,
           'bed_id',   a.bed_id,   'bed_number', bd.bed_number,
           'hostel_category_id',   lp.hostel_category_id,
           'hostel_category_name', hc.name,
           'mess_category_id',     lp.mess_category_id,
           'mess_category_name',   mc.name,
           'accommodation_type_id', lp.accommodation_type_id)
    INTO v_snapshot
    FROM public.hostel_allocations x
    LEFT JOIN public.hostel_blocks b   ON b.id  = x.block_id
    LEFT JOIN public.hostel_rooms  rm  ON rm.id = x.room_id
    LEFT JOIN public.hostel_beds   bd  ON bd.id = x.bed_id
    LEFT JOIN public.profiles      pr  ON pr.id = r.learner_id
    LEFT JOIN public.learners_profiles lp ON lp.id = pr.learner_id
    LEFT JOIN public.hostel_categories hc ON hc.id = lp.hostel_category_id
    LEFT JOIN public.mess_categories   mc ON mc.id = lp.mess_category_id
   WHERE x.id = a.id;

  -- Step 1 — vacate the allocation and free the bed.
  IF a.status <> 'vacated' THEN
    UPDATE public.hostel_allocations
       SET status             = 'vacated',
           vacate_reason      = r.reason_type,
           actual_vacate_date = CURRENT_DATE,
           check_out_date     = COALESCE(check_out_date, CURRENT_DATE),
           updated_at         = now()
     WHERE id = a.id;
  ELSE
    UPDATE public.hostel_allocations
       SET check_out_date = COALESCE(check_out_date, actual_vacate_date, CURRENT_DATE),
           updated_at     = now()
     WHERE id = a.id;
  END IF;

  IF a.bed_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.hostel_allocations o
     WHERE o.bed_id = a.bed_id
       AND o.id <> a.id
       AND o.status IN ('active', 'pending_approval', 'pending_vacate')
       AND o.check_out_date IS NULL
  ) THEN
    UPDATE public.hostel_beds
       SET status = 'available', current_occupant_id = NULL, updated_at = now()
     WHERE id = a.bed_id;
    v_freed_bed := a.bed_id;
  END IF;

  -- Step 2 — learner -> Day Scholar, categories cleared.
  SELECT learner_id INTO v_lp FROM public.profiles WHERE id = r.learner_id;
  IF v_lp IS NOT NULL THEN
    SELECT id INTO v_daysch FROM public.accommodation_types WHERE code = 'dayscholar';
    IF v_daysch IS NULL THEN
      RAISE EXCEPTION 'accommodation_types has no dayscholar row' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.learners_profiles
       SET accommodation_type_id = v_daysch,
           hostel_category_id    = NULL,
           mess_category_id      = NULL,
           updated_at            = now()
     WHERE id = v_lp;
  END IF;

  UPDATE public.hostel_vacate_requests
     SET status                  = 'completed',
         completed_at            = now(),
         actual_vacate_date      = CURRENT_DATE,
         bills_snapshot          = v_bills,
         outstanding_at_approval = v_outstanding,
         room_snapshot           = v_snapshot,
         warden_last_action_at   = now(),
         updated_at              = now()
   WHERE id = r.id;

  PERFORM public._cl_vacate_log(
    r.id, CASE WHEN r.status = 'pending_fine' THEN 'fine' ELSE 'cao' END, 'system', NULL,
    CASE WHEN r.status = 'pending_fine'
         THEN 'Fine settled — learner vacated, room and bed released'
         ELSE 'Learner vacated, room and bed released' END);

  RETURN jsonb_build_object(
    'success',         true,
    'request_id',      r.id,
    'allocation_id',   a.id,
    'freed_bed_id',    v_freed_bed,
    'day_scholar_set', v_lp IS NOT NULL
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public._cl_vacate_finalize(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._cl_vacate_finalize(uuid) TO service_role;

-- ─── 9. Fine bill (internal, idempotent) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public._cl_vacate_create_fine_bill(p_request_id uuid, p_actor uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  r      public.hostel_vacate_requests%ROWTYPE;
  v_lp   uuid;
  v_inst uuid;
  v_ay   uuid;
  v_cat  uuid;
  v_desc text;
  v_bill uuid;
BEGIN
  SELECT * INTO r FROM public.hostel_vacate_requests WHERE id = p_request_id;
  IF r.fine_bill_id IS NOT NULL THEN
    RETURN r.fine_bill_id;
  END IF;
  IF COALESCE(r.damage_total, 0) <= 0 THEN
    RETURN NULL;
  END IF;

  SELECT learner_id INTO v_lp FROM public.profiles WHERE id = r.learner_id;
  IF v_lp IS NULL THEN
    RAISE EXCEPTION 'Learner has no learner profile — cannot raise the damage fine bill' USING ERRCODE = 'P0001';
  END IF;
  SELECT institution_id, academic_year_id INTO v_inst, v_ay
    FROM public.learners_profiles WHERE id = v_lp;

  SELECT id INTO v_cat FROM public.billing_categories WHERE category_name = 'Hostel Damage Fine' LIMIT 1;
  IF v_cat IS NULL THEN
    RAISE EXCEPTION 'Billing category "Hostel Damage Fine" is missing' USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.billing_categories SET is_active = true, updated_at = now() WHERE id = v_cat AND NOT is_active;

  SELECT left('Hostel room damage fine — ' ||
              string_agg(damage_name || ' (' || amount::text || ')', ', ' ORDER BY created_at), 500)
    INTO v_desc
    FROM public.hostel_vacate_damages WHERE vacate_request_id = r.id;

  INSERT INTO public.billing_student_bills (
    student_id, institution_id, academic_year_id, item_category_id, fee_source,
    bill_description, due_date, quantity, unit_amount, total_amount, final_amount,
    balance_amount, status, created_by
  ) VALUES (
    v_lp, v_inst, v_ay, v_cat, 'ad_hoc',
    v_desc, CURRENT_DATE + 7, 1, r.damage_total, r.damage_total, r.damage_total,
    r.damage_total, 'unpaid', p_actor
  ) RETURNING id INTO v_bill;

  UPDATE public.hostel_vacate_requests SET fine_bill_id = v_bill, updated_at = now() WHERE id = r.id;
  RETURN v_bill;
END;
$$;
REVOKE EXECUTE ON FUNCTION public._cl_vacate_create_fine_bill(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._cl_vacate_create_fine_bill(uuid, uuid) TO service_role;

-- ─── 10. Approve — one RPC, dispatches on the current step ─────────────────
DROP FUNCTION IF EXISTS public.fn_cl_vacate_warden_approve(uuid, text);

CREATE OR REPLACE FUNCTION public.fn_cl_vacate_advance(
  p_request_id uuid,
  p_remarks    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  r          public.hostel_vacate_requests%ROWTYPE;
  v_perm     text;
  v_step     text;
  v_pending  integer;
  v_out      numeric;
  v_fine     uuid;
  v_final    jsonb;
  v_next     text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.hostel_vacate_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vacate request % not found', p_request_id USING ERRCODE = 'P0002';
  END IF;

  v_perm := public._cl_vacate_step_perm(r.status::text);
  v_step := public._cl_vacate_step_name(r.status::text);
  IF v_perm IS NULL THEN
    RAISE EXCEPTION 'Request is not waiting for an approval (status=%)', r.status USING ERRCODE = 'P0001';
  END IF;

  IF NOT (public.is_super_admin() OR public.is_admin()
          OR (public.user_has_permission(v_perm)
              AND public.fn_cl_vacate_scope_ok(r.institution_id, r.allocation_id))) THEN
    RAISE EXCEPTION 'Not authorized to approve this step (%)', v_step USING ERRCODE = '42501';
  END IF;

  IF r.status = 'pending_principal' THEN
    v_next := 'pending_warden';

  ELSIF r.status = 'pending_warden' THEN
    SELECT COUNT(*) INTO v_pending
      FROM public.hostel_clearance_items
     WHERE vacate_request_id = r.id AND is_required AND NOT is_cleared;
    IF v_pending > 0 THEN
      RAISE EXCEPTION '% required checklist item(s) are not cleared yet', v_pending USING ERRCODE = 'P0001';
    END IF;
    IF NOT r.room_inspected THEN
      RAISE EXCEPTION 'Record the room inspection (damages, or "No damage") before approving'
        USING ERRCODE = 'P0001';
    END IF;
    v_next := 'pending_mess';

  ELSIF r.status = 'pending_mess' THEN
    v_next := 'pending_cao';

  ELSE -- pending_cao
    v_out := (public._cl_vacate_bills(r.learner_id)->>'total_outstanding')::numeric;
    IF v_out > 0 THEN
      RAISE EXCEPTION 'Unpaid hostel bills: % outstanding. Clear them before approving.', v_out
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  PERFORM public._cl_vacate_log(r.id, v_step, 'approved', v_uid, p_remarks);

  IF r.status <> 'pending_cao' THEN
    UPDATE public.hostel_vacate_requests
       SET status = v_next::public.vacate_request_status_enum,
           warden_last_action_at = now(), updated_at = now()
     WHERE id = r.id;
    RETURN jsonb_build_object('success', true, 'request_id', r.id, 'status', v_next);
  END IF;

  -- CAO: final approval.
  UPDATE public.hostel_vacate_requests
     SET approved_by = v_uid, approved_at = now(),
         approval_remarks = NULLIF(btrim(COALESCE(p_remarks, '')), ''),
         updated_at = now()
   WHERE id = r.id;

  IF COALESCE(r.damage_total, 0) > 0 THEN
    v_fine := public._cl_vacate_create_fine_bill(r.id, v_uid);
    UPDATE public.hostel_vacate_requests
       SET status = 'pending_fine', updated_at = now()
     WHERE id = r.id;
    PERFORM public._cl_vacate_log(r.id, 'fine', 'system', NULL,
      'Fine bill raised for room damage: ' || r.damage_total::text);
    RETURN jsonb_build_object('success', true, 'request_id', r.id, 'status', 'pending_fine',
                              'fine_bill_id', v_fine, 'fine_amount', r.damage_total);
  END IF;

  v_final := public._cl_vacate_finalize(r.id);
  RETURN v_final || jsonb_build_object('status', 'completed');
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_cl_vacate_advance(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_vacate_advance(uuid, text) TO authenticated, service_role;

-- Manual retry if the fine was settled but completion failed (see trigger).
CREATE OR REPLACE FUNCTION public.fn_cl_vacate_complete_after_fine(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  r     public.hostel_vacate_requests%ROWTYPE;
  b     public.billing_student_bills%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.hostel_vacate_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vacate request % not found', p_request_id USING ERRCODE = 'P0002';
  END IF;
  IF NOT (public.is_super_admin() OR public.is_admin()
          OR (public.user_has_permission('campus_living.vacate_requests.approve_cao')
              AND public.fn_cl_vacate_scope_ok(r.institution_id, r.allocation_id))) THEN
    RAISE EXCEPTION 'Not authorized to complete this request' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'pending_fine' THEN
    RAISE EXCEPTION 'Request is not waiting for the fine (status=%)', r.status USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO b FROM public.billing_student_bills WHERE id = r.fine_bill_id;
  IF NOT FOUND OR NOT (COALESCE(b.balance_amount, 0) = 0 OR b.status IN ('cancelled', 'superseded')) THEN
    RAISE EXCEPTION 'The fine bill is not settled yet' USING ERRCODE = 'P0001';
  END IF;
  RETURN public._cl_vacate_finalize(r.id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_cl_vacate_complete_after_fine(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_vacate_complete_after_fine(uuid) TO authenticated, service_role;

-- ─── 11. Reject / cancel ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cl_vacate_reject(p_request_id uuid, p_reason text)
RETURNS public.hostel_vacate_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  r      public.hostel_vacate_requests%ROWTYPE;
  v_perm text;
  v_row  public.hostel_vacate_requests;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A rejection reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO r FROM public.hostel_vacate_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vacate request % not found', p_request_id USING ERRCODE = 'P0002';
  END IF;

  v_perm := public._cl_vacate_step_perm(r.status::text);
  IF v_perm IS NULL THEN
    RAISE EXCEPTION 'Request is not waiting for an approval (status=%)', r.status USING ERRCODE = 'P0001';
  END IF;
  IF NOT (public.is_super_admin() OR public.is_admin()
          OR (public.user_has_permission(v_perm)
              AND public.fn_cl_vacate_scope_ok(r.institution_id, r.allocation_id))) THEN
    RAISE EXCEPTION 'Not authorized to reject at this step' USING ERRCODE = '42501';
  END IF;

  UPDATE public.hostel_vacate_requests
     SET status = 'rejected', rejected_reason = btrim(p_reason),
         completed_at = now(), warden_last_action_at = now(), updated_at = now()
   WHERE id = r.id
  RETURNING * INTO v_row;

  PERFORM public._cl_vacate_log(r.id, public._cl_vacate_step_name(r.status::text), 'rejected', v_uid, p_reason);

  UPDATE public.hostel_allocations
     SET status = 'active', updated_at = now()
   WHERE id = r.allocation_id AND status = 'pending_vacate';

  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_cl_vacate_reject(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_vacate_reject(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_cl_vacate_cancel(p_request_id uuid, p_reason text)
RETURNS public.hostel_vacate_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  r      public.hostel_vacate_requests%ROWTYPE;
  v_perm text;
  v_row  public.hostel_vacate_requests;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A cancellation reason is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO r FROM public.hostel_vacate_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vacate request % not found', p_request_id USING ERRCODE = 'P0002';
  END IF;

  v_perm := public._cl_vacate_step_perm(r.status::text);
  IF NOT (public.is_super_admin() OR public.is_admin()
          OR r.submitted_by_id = v_uid OR r.learner_id = v_uid
          OR ((public.user_has_permission('campus_living.vacate_requests.cancel')
               OR (v_perm IS NOT NULL AND public.user_has_permission(v_perm)))
              AND public.fn_cl_vacate_scope_ok(r.institution_id, r.allocation_id))) THEN
    RAISE EXCEPTION 'Not authorized to cancel this vacate request' USING ERRCODE = '42501';
  END IF;
  -- pending_fine is past the point of no return: the CAO already approved and a
  -- bill exists. Accounts cancels that bill through its own flow instead.
  IF r.status NOT IN ('draft', 'pending_dues', 'pending_principal', 'pending_warden', 'pending_mess', 'pending_cao') THEN
    RAISE EXCEPTION 'Cannot cancel a request in status %', r.status USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.hostel_vacate_requests
     SET status = 'cancelled', cancelled_reason = btrim(p_reason),
         completed_at = now(), updated_at = now()
   WHERE id = r.id
  RETURNING * INTO v_row;

  IF r.status <> 'draft' THEN
    PERFORM public._cl_vacate_log(r.id, COALESCE(public._cl_vacate_step_name(r.status::text), 'bills'),
                                  'cancelled', v_uid, p_reason);
  END IF;

  UPDATE public.hostel_allocations
     SET status = 'active', updated_at = now()
   WHERE id = r.allocation_id AND status = 'pending_vacate';

  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_cl_vacate_cancel(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_vacate_cancel(uuid, text) TO authenticated, service_role;

-- ─── 12. Bill-cleared trigger (payments arrive from webhooks, no user) ─────
-- Fires only when a bill's balance reaches 0 or the bill is cancelled. A failure
-- here must NEVER roll back the payment, so every action is wrapped: on error
-- the request just stays where it is (pending_fine can be retried with
-- fn_cl_vacate_complete_after_fine, pending_dues with the Re-check button).
CREATE OR REPLACE FUNCTION public.trg_vacate_on_bill_cleared()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_req uuid;
BEGIN
  -- Fine bill settled (paid, or cancelled by Accounts) -> complete the vacate.
  FOR v_req IN
    SELECT id FROM public.hostel_vacate_requests
     WHERE fine_bill_id = NEW.id AND status = 'pending_fine'
  LOOP
    BEGIN
      PERFORM public._cl_vacate_finalize(v_req);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'vacate finalize after fine failed for request %: %', v_req, SQLERRM;
    END;
  END LOOP;

  -- A hostel/mess bill cleared -> advance this learner's Step-1 requests.
  FOR v_req IN
    SELECT r.id
      FROM public.profiles p
      JOIN public.hostel_vacate_requests r ON r.learner_id = p.id AND r.status = 'pending_dues'
     WHERE p.learner_id = NEW.student_id
  LOOP
    BEGIN
      PERFORM public._cl_vacate_advance_from_dues(v_req);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'vacate bill re-check failed for request %: %', v_req, SQLERRM;
    END;
  END LOOP;

  RETURN NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.trg_vacate_on_bill_cleared() FROM PUBLIC, anon, authenticated;

-- "zz" so it runs after the other row triggers on this table (alphabetical order).
DROP TRIGGER IF EXISTS trg_zz_vacate_on_bill_cleared ON public.billing_student_bills;
CREATE TRIGGER trg_zz_vacate_on_bill_cleared
  AFTER UPDATE OF balance_amount, status ON public.billing_student_bills
  FOR EACH ROW
  WHEN (
    (NEW.balance_amount = 0 AND OLD.balance_amount IS DISTINCT FROM 0)
    OR (NEW.status IN ('cancelled', 'superseded') AND OLD.status NOT IN ('cancelled', 'superseded'))
  )
  EXECUTE FUNCTION public.trg_vacate_on_bill_cleared();

-- ─── 13. Permission grants (merge with ||, never replace) ──────────────────
DO $$
DECLARE
  v_role text;
  v_hit  int;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['principal', 'school_principal'] LOOP
    UPDATE public.custom_roles
       SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
             'campus_living.vacate_requests.view',              true,
             'campus_living.vacate_requests.approve_principal', true),
           updated_at = now()
     WHERE role_key = v_role;
    GET DIAGNOSTICS v_hit = ROW_COUNT;
    IF v_hit = 0 THEN RAISE WARNING 'role % not found; principal vacate keys not granted', v_role; END IF;
  END LOOP;

  UPDATE public.custom_roles
     SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
           'campus_living.vacate_requests.view',         true,
           'campus_living.vacate_requests.approve_mess', true),
         updated_at = now()
   WHERE role_key = 'mess_operations';
  GET DIAGNOSTICS v_hit = ROW_COUNT;
  IF v_hit = 0 THEN RAISE WARNING 'role mess_operations not found; approve_mess not granted'; END IF;

  UPDATE public.custom_roles
     SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
           'campus_living.vacate_requests.view',        true,
           'campus_living.vacate_requests.approve_cao', true),
         updated_at = now()
   WHERE role_key = 'cao';
  GET DIAGNOSTICS v_hit = ROW_COUNT;
  IF v_hit = 0 THEN RAISE WARNING 'role cao not found; approve_cao not granted'; END IF;

  FOREACH v_role IN ARRAY ARRAY['hostel_office', 'chief_warden'] LOOP
    UPDATE public.custom_roles
       SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
             'campus_living.damage_types.manage', true),
           updated_at = now()
     WHERE role_key = v_role;
    GET DIAGNOSTICS v_hit = ROW_COUNT;
    IF v_hit = 0 THEN RAISE WARNING 'role % not found; damage_types.manage not granted', v_role; END IF;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.fn_cl_vacate_advance(uuid, text) IS
  'Approve the step a vacate request is at (principal -> warden -> mess -> CAO). Permission per step + scope checked in the DB. Warden step needs required checklist ticked and the room inspection recorded; CAO step re-checks hostel/mess bills, then raises ONE fine bill (pending_fine) when damages exist, else completes.';
COMMENT ON FUNCTION public._cl_vacate_finalize(uuid) IS
  'Atomic completion: vacate allocation + free bed, then learner -> dayscholar and categories cleared. Idempotent. Internal: called by fn_cl_vacate_advance (no damage) or trg_vacate_on_bill_cleared (fine settled).';
