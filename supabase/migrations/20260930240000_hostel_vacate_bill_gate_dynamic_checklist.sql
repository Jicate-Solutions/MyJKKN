-- ============================================================================
-- Hostel vacate: bill gate + dynamic checklist + auto day-scholar conversion
-- ============================================================================
-- Flow: learner (or warden on behalf) raises -> submit (pending_warden) ->
-- warden reviews bills + ticks checklist -> approve -> atomic auto-vacate.
-- Parent OTP / chief warden / dues stages and the approval-chain engine are no
-- longer used by this flow (approval_chain_run_id stays NULL).
--
-- Every state change goes through a SECURITY DEFINER RPC that derives the
-- caller from auth.uid(), checks permission + scope, and re-checks the bill
-- gate and required checklist items IN THE DATABASE (a UI-only guard on an
-- RLS-writable column is decorative). Direct INSERT/UPDATE on the vacate
-- tables is therefore reduced to admin / own-draft only.
--
-- Triggers on hostel_allocations that matter here:
--   trg_allocation_sync_accommodation_type  (status active/pending_approval
--       -> accommodation = hostel): does NOT fire once status = 'vacated', so
--       vacate FIRST, then flip the learner to day scholar.
--   trg_allocation_sync_learner_categories  (status = active only).
--   learners_profiles.trg_detect_fee_dimension_change fires on the
--       accommodation flip for non-legacy, non-fees_confirmed learners and
--       opens an admission_fee_change_events row (pending_review).
-- ============================================================================

-- ─── 0. Backup of the role grants this migration edits ─────────────────────
CREATE TABLE IF NOT EXISTS public.bak_vacate_role_grants_20260930 AS
SELECT id, role_key, permissions, now() AS backed_up_at
FROM public.custom_roles
WHERE role_key IN ('student', 'warden', 'hostel_office', 'chief_warden');
ALTER TABLE public.bak_vacate_role_grants_20260930 ENABLE ROW LEVEL SECURITY;

-- ─── 1. Master checklist (one global list) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hostel_vacate_checklist_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_label          text NOT NULL CHECK (char_length(btrim(item_label)) BETWEEN 3 AND 200),
  description         text CHECK (description IS NULL OR char_length(description) <= 1000),
  is_required         boolean NOT NULL DEFAULT true,
  -- NULL = applies to every vacate reason
  applies_to_reasons  public.vacate_reason_enum[],
  sort_order          integer NOT NULL DEFAULT 100,
  is_active           boolean NOT NULL DEFAULT true,
  created_by          uuid REFERENCES auth.users(id),
  updated_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.hostel_vacate_checklist_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hostel_vacate_checklist_items FROM anon;

CREATE INDEX IF NOT EXISTS idx_hvci_active_sort
  ON public.hostel_vacate_checklist_items (is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_hvci_created_by ON public.hostel_vacate_checklist_items (created_by);
CREATE INDEX IF NOT EXISTS idx_hvci_updated_by ON public.hostel_vacate_checklist_items (updated_by);

DROP TRIGGER IF EXISTS tr_hvci_updated_at ON public.hostel_vacate_checklist_items;
CREATE TRIGGER tr_hvci_updated_at BEFORE UPDATE ON public.hostel_vacate_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.set_hostel_vacate_updated_at();

DROP POLICY IF EXISTS hvci_select ON public.hostel_vacate_checklist_items;
CREATE POLICY hvci_select ON public.hostel_vacate_checklist_items FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (SELECT public.user_has_permission('campus_living.vacate_checklist.manage'))
    OR (SELECT public.user_has_permission('campus_living.vacate_requests.view'))
  );

DROP POLICY IF EXISTS hvci_insert ON public.hostel_vacate_checklist_items;
CREATE POLICY hvci_insert ON public.hostel_vacate_checklist_items FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (SELECT public.user_has_permission('campus_living.vacate_checklist.manage'))
  );

DROP POLICY IF EXISTS hvci_update ON public.hostel_vacate_checklist_items;
CREATE POLICY hvci_update ON public.hostel_vacate_checklist_items FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (SELECT public.user_has_permission('campus_living.vacate_checklist.manage'))
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (SELECT public.user_has_permission('campus_living.vacate_checklist.manage'))
  );

-- No DELETE policy: items are deactivated, never deleted, so a request's
-- frozen copy keeps a valid checklist_item_id.

-- Seed = the six items that used to be hard-coded (now editable).
INSERT INTO public.hostel_vacate_checklist_items (item_label, is_required, sort_order)
SELECT v.item_label, v.is_required, v.sort_order
FROM (VALUES
  ('Mess dues cleared',                          true,  10),
  ('Library dues cleared',                       true,  20),
  ('Room / furniture damage assessment',         true,  30),
  ('Deposit refund processed by Accounts',       true,  40),
  ('Room keys returned',                         true,  50),
  ('Hostel ID card returned',                    false, 60)
) AS v(item_label, is_required, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.hostel_vacate_checklist_items);

-- ─── 2. Request-side columns ───────────────────────────────────────────────
ALTER TABLE public.hostel_clearance_items
  ADD COLUMN IF NOT EXISTS checklist_item_id uuid
    REFERENCES public.hostel_vacate_checklist_items(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_hci_checklist_item ON public.hostel_clearance_items (checklist_item_id);

ALTER TABLE public.hostel_vacate_requests
  ADD COLUMN IF NOT EXISTS room_snapshot          jsonb,
  ADD COLUMN IF NOT EXISTS bills_snapshot         jsonb,
  ADD COLUMN IF NOT EXISTS outstanding_at_approval numeric,
  ADD COLUMN IF NOT EXISTS approved_by            uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at            timestamptz,
  ADD COLUMN IF NOT EXISTS approval_remarks       text;
CREATE INDEX IF NOT EXISTS idx_hvr_approved_by ON public.hostel_vacate_requests (approved_by);

-- One open request per allocation.
CREATE UNIQUE INDEX IF NOT EXISTS hvr_one_open_per_allocation
  ON public.hostel_vacate_requests (allocation_id)
  WHERE status IN ('draft', 'pending_parent', 'pending_warden', 'pending_chief', 'pending_dues', 'approved');

-- ─── 3. Scope helper (institution OR block — a block grant is a SCOPE) ─────
CREATE OR REPLACE FUNCTION public.fn_cl_vacate_scope_ok(p_institution_id uuid, p_allocation_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT public.role_has_institution_access(p_institution_id)
      OR EXISTS (
           SELECT 1 FROM public.hostel_allocations a
            WHERE a.id = p_allocation_id
              AND public.role_has_block_access(a.block_id)
         );
$$;
REVOKE EXECUTE ON FUNCTION public.fn_cl_vacate_scope_ok(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_vacate_scope_ok(uuid, uuid) TO authenticated, service_role;

-- ─── 4. RLS on the vacate tables ───────────────────────────────────────────
-- SELECT becomes block-aware (wardens own a block, not an institution).
-- INSERT/UPDATE by staff go through the RPCs below, so the direct paths shrink
-- to admin (+ the submitter editing their own draft).
DROP POLICY IF EXISTS hvr_select_permission ON public.hostel_vacate_requests;
CREATE POLICY hvr_select_permission ON public.hostel_vacate_requests FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR ((SELECT public.user_has_permission('campus_living.vacate_requests.view'))
        AND public.fn_cl_vacate_scope_ok(institution_id, allocation_id))
    OR ((SELECT public.user_has_permission('campus_living.vacate_requests.view_own'))
        AND (submitted_by_id = (SELECT auth.uid()) OR learner_id = (SELECT auth.uid())))
  );

DROP POLICY IF EXISTS hvr_insert_permission ON public.hostel_vacate_requests;
CREATE POLICY hvr_insert_permission ON public.hostel_vacate_requests FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_super_admin()) OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS hvr_update_permission ON public.hostel_vacate_requests;
CREATE POLICY hvr_update_permission ON public.hostel_vacate_requests FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (submitted_by_id = (SELECT auth.uid()) AND status = 'draft')
  )
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR (submitted_by_id = (SELECT auth.uid()) AND status = 'draft')
  );

DROP POLICY IF EXISTS hci_select_permission ON public.hostel_clearance_items;
CREATE POLICY hci_select_permission ON public.hostel_clearance_items FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR EXISTS (
      SELECT 1 FROM public.hostel_vacate_requests r
       WHERE r.id = hostel_clearance_items.vacate_request_id
         AND (
           ((SELECT public.user_has_permission('campus_living.vacate_requests.view'))
             AND public.fn_cl_vacate_scope_ok(r.institution_id, r.allocation_id))
           OR ((SELECT public.user_has_permission('campus_living.vacate_requests.view_own'))
             AND (r.submitted_by_id = (SELECT auth.uid()) OR r.learner_id = (SELECT auth.uid())))
         )
    )
  );

DROP POLICY IF EXISTS hci_insert_permission ON public.hostel_clearance_items;
CREATE POLICY hci_insert_permission ON public.hostel_clearance_items FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_super_admin()) OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS hci_update_permission ON public.hostel_clearance_items;
CREATE POLICY hci_update_permission ON public.hostel_clearance_items FOR UPDATE TO authenticated
  USING ((SELECT public.is_super_admin()) OR (SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_super_admin()) OR (SELECT public.is_admin()));

DROP POLICY IF EXISTS hvd_select_permission ON public.hostel_vacate_documents;
CREATE POLICY hvd_select_permission ON public.hostel_vacate_documents FOR SELECT TO authenticated
  USING (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR EXISTS (
      SELECT 1 FROM public.hostel_vacate_requests r
       WHERE r.id = hostel_vacate_documents.vacate_request_id
         AND (
           ((SELECT public.user_has_permission('campus_living.vacate_requests.view'))
             AND public.fn_cl_vacate_scope_ok(r.institution_id, r.allocation_id))
           OR ((SELECT public.user_has_permission('campus_living.vacate_requests.view_own'))
             AND (r.submitted_by_id = (SELECT auth.uid()) OR r.learner_id = (SELECT auth.uid())))
         )
    )
  );

DROP POLICY IF EXISTS hvd_insert_permission ON public.hostel_vacate_documents;
CREATE POLICY hvd_insert_permission ON public.hostel_vacate_documents FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.is_super_admin())
    OR (SELECT public.is_admin())
    OR EXISTS (
      SELECT 1 FROM public.hostel_vacate_requests r
       WHERE r.id = hostel_vacate_documents.vacate_request_id
         AND r.status = 'draft'
         AND r.submitted_by_id = (SELECT auth.uid())
    )
  );

-- ─── 5. Bill gate ──────────────────────────────────────────────────────────
-- Internal: every hostel / mess (incl. upgrade) bill of the learner, ALL years,
-- non-cancelled/superseded. billing_student_bills.student_id is the
-- learners_profiles id; a request stores profiles.id, linked via
-- profiles.learner_id. Not granted to clients — used by the RPCs below.
CREATE OR REPLACE FUNCTION public._cl_vacate_bills(p_profile_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  WITH lp AS (
    SELECT p.learner_id AS lp_id FROM public.profiles p WHERE p.id = p_profile_id
  ),
  bills AS (
    SELECT b.id,
           public.fn_cl_billing_audit_bill_class(bc.kind::text, bc.category_name::text, b.fee_source) AS cls,
           bc.category_name::text                          AS category_name,
           b.bill_description,
           COALESCE(ay.academic_year_name::text, hy.name::text) AS year_name,
           b.final_amount                                  AS amount,
           (b.final_amount - COALESCE(b.balance_amount, 0)) AS paid,
           COALESCE(b.balance_amount, 0)                   AS pending,
           b.status::text                                  AS status,
           b.due_date,
           (COALESCE(b.balance_amount, 0) > 0 AND b.due_date < CURRENT_DATE) AS is_overdue
      FROM lp
      JOIN public.billing_student_bills b
        ON b.student_id = lp.lp_id
       AND COALESCE(b.status, '') NOT IN ('cancelled', 'superseded')
      JOIN public.billing_categories bc
        ON bc.id = b.item_category_id AND bc.kind IN ('hostel', 'mess')
      LEFT JOIN public.academic_years ay ON ay.id = b.academic_year_id
      LEFT JOIN public.hostel_years   hy ON hy.id = b.hostel_year_id
  )
  SELECT jsonb_build_object(
    'bills',             COALESCE((SELECT jsonb_agg(jsonb_build_object(
                            'bill_id', id, 'class', cls, 'category_name', category_name,
                            'description', bill_description, 'year_name', year_name,
                            'amount', amount, 'paid', paid, 'pending', pending,
                            'status', status, 'due_date', due_date, 'is_overdue', is_overdue)
                            ORDER BY due_date NULLS LAST, category_name) FROM bills), '[]'::jsonb),
    'total_billed',      COALESCE((SELECT SUM(amount)  FROM bills), 0),
    'total_paid',        COALESCE((SELECT SUM(paid)    FROM bills), 0),
    'total_outstanding', COALESCE((SELECT SUM(pending) FROM bills), 0),
    'overdue_amount',    COALESCE((SELECT SUM(pending) FROM bills WHERE is_overdue), 0),
    'unpaid_count',      COALESCE((SELECT COUNT(*) FROM bills WHERE pending > 0), 0),
    'has_learner_link',  EXISTS (SELECT 1 FROM lp WHERE lp_id IS NOT NULL)
  );
$$;
REVOKE EXECUTE ON FUNCTION public._cl_vacate_bills(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._cl_vacate_bills(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fn_cl_vacate_bill_status(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  r     public.hostel_vacate_requests%ROWTYPE;
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

  RETURN public._cl_vacate_bills(r.learner_id);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_cl_vacate_bill_status(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_vacate_bill_status(uuid) TO authenticated, service_role;

-- ─── 6. Create (draft) ─────────────────────────────────────────────────────
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
       AND x.status IN ('draft', 'pending_parent', 'pending_warden', 'pending_chief', 'pending_dues', 'approved')
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

-- ─── 7. Submit: freeze the checklist, hold the bed ─────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cl_vacate_submit(p_request_id uuid)
RETURNS public.hostel_vacate_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  r     public.hostel_vacate_requests%ROWTYPE;
  v_row public.hostel_vacate_requests;
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

  -- Frozen copy of the master list for this reason. Later edits to the master
  -- list never touch a request already in flight.
  INSERT INTO public.hostel_clearance_items
    (vacate_request_id, item_key, item_label, is_required, sort_order, checklist_item_id)
  SELECT r.id, 'chk_' || replace(m.id::text, '-', ''), m.item_label, m.is_required, m.sort_order, m.id
    FROM public.hostel_vacate_checklist_items m
   WHERE m.is_active
     AND (m.applies_to_reasons IS NULL OR r.reason_type = ANY (m.applies_to_reasons))
  ON CONFLICT (vacate_request_id, item_key) DO NOTHING;

  UPDATE public.hostel_vacate_requests
     SET status = 'pending_warden',
         warden_last_action_at = now(),
         updated_at = now()
   WHERE id = r.id
  RETURNING * INTO v_row;

  -- Hold the bed while the request is open (still occupied, not reallocatable).
  UPDATE public.hostel_allocations
     SET status = 'pending_vacate', updated_at = now()
   WHERE id = r.allocation_id AND status = 'active';

  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_cl_vacate_submit(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_vacate_submit(uuid) TO authenticated, service_role;

-- ─── 8. Tick a checklist item ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cl_vacate_set_item(
  p_item_id uuid,
  p_cleared boolean,
  p_notes   text DEFAULT NULL
)
RETURNS public.hostel_clearance_items
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  i     public.hostel_clearance_items%ROWTYPE;
  r     public.hostel_vacate_requests%ROWTYPE;
  v_row public.hostel_clearance_items;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO i FROM public.hostel_clearance_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Checklist item % not found', p_item_id USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO r FROM public.hostel_vacate_requests WHERE id = i.vacate_request_id;

  IF NOT (public.is_super_admin() OR public.is_admin()
          OR (public.user_has_permission('campus_living.vacate_requests.mark_clearance')
              AND public.fn_cl_vacate_scope_ok(r.institution_id, r.allocation_id))) THEN
    RAISE EXCEPTION 'Not authorized to tick checklist items' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'pending_warden' THEN
    RAISE EXCEPTION 'Checklist can only be changed while the request is with the warden (status=%)', r.status
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.hostel_clearance_items
     SET is_cleared = p_cleared,
         cleared_at = CASE WHEN p_cleared THEN now() END,
         cleared_by = CASE WHEN p_cleared THEN v_uid END,
         notes      = NULLIF(btrim(COALESCE(p_notes, '')), ''),
         updated_at = now()
   WHERE id = p_item_id
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_cl_vacate_set_item(uuid, boolean, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_vacate_set_item(uuid, boolean, text) TO authenticated, service_role;

-- ─── 9. Approve = auto-vacate (atomic) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cl_vacate_warden_approve(
  p_request_id uuid,
  p_remarks    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  r            public.hostel_vacate_requests%ROWTYPE;
  a            public.hostel_allocations%ROWTYPE;
  v_bills      jsonb;
  v_outstanding numeric;
  v_unpaid     integer;
  v_pending    integer;
  v_lp         uuid;
  v_daysch     uuid;
  v_snapshot   jsonb;
  v_freed_bed  uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO r FROM public.hostel_vacate_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Vacate request % not found', p_request_id USING ERRCODE = 'P0002';
  END IF;

  IF NOT (public.is_super_admin() OR public.is_admin()
          OR (public.user_has_permission('campus_living.vacate_requests.approve_warden')
              AND public.fn_cl_vacate_scope_ok(r.institution_id, r.allocation_id))) THEN
    RAISE EXCEPTION 'Not authorized to approve vacate requests' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'pending_warden' THEN
    RAISE EXCEPTION 'Request is not with the warden (status=%)', r.status USING ERRCODE = 'P0001';
  END IF;

  -- Gate 1: every hostel / mess bill, all years, must be settled. No override.
  v_bills       := public._cl_vacate_bills(r.learner_id);
  v_outstanding := (v_bills->>'total_outstanding')::numeric;
  v_unpaid      := (v_bills->>'unpaid_count')::integer;
  IF v_outstanding > 0 THEN
    RAISE EXCEPTION 'Unpaid hostel bills: % outstanding across % bill(s). Clear them before approving.',
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

  -- Record what the learner had BEFORE anything is cleared.
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

  -- Step 1 — vacate the allocation and free the bed (same rules as
  -- fn_cl_vacate_allocation: check_out_date releases the unique slot, the bed
  -- row is freed explicitly because no trigger does it).
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

  -- Step 2 — AFTER the vacate (the accommodation sync trigger only acts on
  -- active/pending_approval rows): learner -> Day Scholar, categories cleared.
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
         approved_by             = v_uid,
         approved_at             = now(),
         approval_remarks        = NULLIF(btrim(COALESCE(p_remarks, '')), ''),
         bills_snapshot          = v_bills,
         outstanding_at_approval = v_outstanding,
         room_snapshot           = v_snapshot,
         warden_last_action_at   = now(),
         updated_at              = now()
   WHERE id = r.id;

  RETURN jsonb_build_object(
    'success',          true,
    'request_id',       r.id,
    'allocation_id',    a.id,
    'freed_bed_id',     v_freed_bed,
    'day_scholar_set',  v_lp IS NOT NULL
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_cl_vacate_warden_approve(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_vacate_warden_approve(uuid, text) TO authenticated, service_role;

-- ─── 10. Reject / cancel ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_cl_vacate_reject(p_request_id uuid, p_reason text)
RETURNS public.hostel_vacate_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  r     public.hostel_vacate_requests%ROWTYPE;
  v_row public.hostel_vacate_requests;
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
  IF NOT (public.is_super_admin() OR public.is_admin()
          OR (public.user_has_permission('campus_living.vacate_requests.approve_warden')
              AND public.fn_cl_vacate_scope_ok(r.institution_id, r.allocation_id))) THEN
    RAISE EXCEPTION 'Not authorized to reject vacate requests' USING ERRCODE = '42501';
  END IF;
  IF r.status <> 'pending_warden' THEN
    RAISE EXCEPTION 'Request is not with the warden (status=%)', r.status USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.hostel_vacate_requests
     SET status = 'rejected', rejected_reason = btrim(p_reason),
         completed_at = now(), warden_last_action_at = now(), updated_at = now()
   WHERE id = r.id
  RETURNING * INTO v_row;

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
  v_uid uuid := auth.uid();
  r     public.hostel_vacate_requests%ROWTYPE;
  v_row public.hostel_vacate_requests;
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

  IF NOT (public.is_super_admin() OR public.is_admin()
          OR r.submitted_by_id = v_uid OR r.learner_id = v_uid
          OR ((public.user_has_permission('campus_living.vacate_requests.cancel')
               OR public.user_has_permission('campus_living.vacate_requests.approve_warden'))
              AND public.fn_cl_vacate_scope_ok(r.institution_id, r.allocation_id))) THEN
    RAISE EXCEPTION 'Not authorized to cancel this vacate request' USING ERRCODE = '42501';
  END IF;
  IF r.status NOT IN ('draft', 'pending_warden') THEN
    RAISE EXCEPTION 'Cannot cancel a request in status %', r.status USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.hostel_vacate_requests
     SET status = 'cancelled', cancelled_reason = btrim(p_reason),
         completed_at = now(), updated_at = now()
   WHERE id = r.id
  RETURNING * INTO v_row;

  UPDATE public.hostel_allocations
     SET status = 'active', updated_at = now()
   WHERE id = r.allocation_id AND status = 'pending_vacate';

  RETURN v_row;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.fn_cl_vacate_cancel(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fn_cl_vacate_cancel(uuid, text) TO authenticated, service_role;

-- ─── 11. Role grants (merge with ||, never replace) ────────────────────────
DO $$
DECLARE
  v_role text;
  v_hit  int;
BEGIN
  -- Learners raise their own request again (reverses the 2026-08-10 revoke).
  UPDATE public.custom_roles
     SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
           'campus_living.vacate_requests.submit',   true,
           'campus_living.vacate_requests.view_own', true),
         updated_at = now()
   WHERE role_key = 'student';

  -- Wardens review, tick and approve for their blocks.
  UPDATE public.custom_roles
     SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
           'campus_living.vacate_requests.view',             true,
           'campus_living.vacate_requests.submit_on_behalf', true,
           'campus_living.vacate_requests.approve_warden',   true,
           'campus_living.vacate_requests.mark_clearance',   true),
         updated_at = now()
   WHERE role_key = 'warden';

  FOREACH v_role IN ARRAY ARRAY['hostel_office', 'chief_warden'] LOOP
    UPDATE public.custom_roles
       SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
             'campus_living.vacate_checklist.manage', true),
           updated_at = now()
     WHERE role_key = v_role;
    GET DIAGNOSTICS v_hit = ROW_COUNT;
    IF v_hit = 0 THEN
      RAISE WARNING 'role % not found; vacate_checklist.manage not granted', v_role;
    END IF;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.fn_cl_vacate_warden_approve(uuid, text) IS
  'Warden approve = auto-vacate. Re-checks in the DB: all hostel/mess bills (all years) settled, all required checklist items ticked. Then vacates the allocation + frees the bed, flips the learner to dayscholar and clears hostel/mess categories, all in one transaction. No override path.';
