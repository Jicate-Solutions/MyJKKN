-- Scenarios for 20261009234023_procurement_hod_principal_raise (run by run.sh after the
-- approval-chain migrations, the role rows and the migration applied twice).
-- Any failed check raises; the PASSED line prints only when every check held.

CREATE FUNCTION pg_temp.as_user(p uuid) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, false) $$;

CREATE FUNCTION pg_temp.expect_err(p_sql text, p_needle text, p_test text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF position(lower(p_needle) IN lower(SQLERRM)) = 0 THEN
      RAISE EXCEPTION 'FAIL %: expected "%", got "%"', p_test, p_needle, SQLERRM;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'FAIL %: expected an error "%", got none', p_test, p_needle;
END $$;

-- The labels of a request's request-stage steps in order, e.g. 'Principal approval:pending|CAO:waiting'.
CREATE FUNCTION pg_temp.steps(p_req uuid) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(label || ':' || status, '|' ORDER BY step_order), '')
    FROM procurement_request_approvals WHERE request_id = p_req AND stage = 'request' $$;

CREATE FUNCTION pg_temp.check(p_ok boolean, p_test text, p_detail text DEFAULT '') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %: %', p_test, p_detail; END IF;
END $$;

DO $test$
DECLARE
  c_a  constant uuid := 'a0000000-0000-0000-0000-00000000000a';  -- college A (has a principal)
  c_b  constant uuid := 'b0000000-0000-0000-0000-00000000000b';  -- college B (its own principal)
  c_c  constant uuid := 'c0000000-0000-0000-0000-00000000000c';  -- college C (no active principal)
  c_d  constant uuid := 'd0000000-0000-0000-0000-00000000000d';  -- college D (its principal is also a HoD)
  hod_a      uuid := gen_random_uuid();  -- plain HoD of college A
  hod_off    uuid := gen_random_uuid();  -- HoD who also holds procurement_officer + store_admin
  hod_legacy uuid := gen_random_uuid();  -- HoD only through the legacy profiles.role column
  hod_princ  uuid := gen_random_uuid();  -- HoD who is also the principal
  hod_mgr    uuid := gen_random_uuid();  -- HoD who also holds procurement_manager
  hod_c      uuid := gen_random_uuid();  -- HoD of college C
  princ_a    uuid := gen_random_uuid();
  princ_b    uuid := gen_random_uuid();
  princ_c_off uuid := gen_random_uuid();  -- college C's principal, account inactive
  office_a   uuid := gen_random_uuid();
  cao        uuid := gen_random_uuid();
  super      uuid := gen_random_uuid();
  cat_plain  uuid;  -- common list: CAO
  cat_prole  uuid;  -- common list: CAO → Principal (role, same college)
  cat_pnamed uuid;  -- college A list: principal A by name; common: CAO
  cat_empty  uuid;  -- no approvers at all
  r uuid;
  v text;
  v_n int;
  v_res text;
BEGIN
  INSERT INTO institutions (id, name) VALUES (c_a, 'College A'), (c_b, 'College B'), (c_c, 'College C'), (c_d, 'College D');
  INSERT INTO profiles (id, full_name, institution_id, role, is_active, is_super_admin) VALUES
    (hod_a, 'HoD A', c_a, 'staff', true, false), (hod_off, 'HoD Officer', c_a, 'staff', true, false),
    (hod_legacy, 'HoD Legacy', c_a, 'hod', true, false), (hod_princ, 'HoD Principal', c_d, 'staff', true, false),
    (hod_mgr, 'HoD Manager', c_a, 'staff', true, false), (hod_c, 'HoD C', c_c, 'staff', true, false),
    (princ_a, 'Principal A', c_a, 'staff', true, false), (princ_b, 'Principal B', c_b, 'staff', true, false),
    (princ_c_off, 'Principal C (left)', c_c, 'staff', false, false),
    (office_a, 'Office A', c_a, 'staff', true, false), (cao, 'CAO', c_b, 'staff', true, false),
    (super, 'Super', c_a, 'staff', true, true);
  INSERT INTO user_roles (user_id, role_id)
  SELECT u, (SELECT id FROM custom_roles WHERE role_key = k) FROM (VALUES
    (hod_a, 'hod'), (hod_off, 'hod'), (hod_off, 'procurement_officer'), (hod_off, 'store_admin'),
    (hod_princ, 'hod'), (hod_princ, 'principal'), (hod_mgr, 'hod'), (hod_mgr, 'procurement_manager'),
    (hod_c, 'hod'), (princ_a, 'principal'), (princ_b, 'principal'), (princ_c_off, 'principal'),
    (office_a, 'office_assistant')) x(u, k);

  -- ── 1. The grant ─────────────────────────────────────────────────────────────────
  SELECT string_agg(role_key || '=' || (permissions ->> 'procurement.request_create'), ',' ORDER BY role_key) INTO v
    FROM custom_roles WHERE role_key IN ('hod', 'principal', 'office_assistant');
  PERFORM pg_temp.check(v = 'hod=true,office_assistant=true,principal=true', 'G1 raise granted to the three roles', v);
  PERFORM pg_temp.check(
    (SELECT permissions FROM custom_roles WHERE role_key = 'hod')
      = '{"procurement.request_create": true, "procurement.request_approve": false, "attendance.view": true}'::jsonb
    AND (SELECT permissions FROM custom_roles WHERE role_key = 'principal')
      = '{"procurement.request_create": true, "procurement.request_approve": false, "reports.view": true}'::jsonb
    AND (SELECT permissions FROM custom_roles WHERE role_key = 'office_assistant')
      = '{"procurement.request_create": true, "fees.view": true}'::jsonb,
    'G2 no other key changed; request_approve not granted');
  PERFORM pg_temp.check(
    (SELECT permissions FROM custom_roles WHERE role_key = 'lab_assistant') = '{"ims.view": true}'::jsonb
    AND (SELECT permissions FROM custom_roles WHERE role_key = 'procurement_officer')
      = '{"procurement.request_create": true, "procurement.request_approve": false}'::jsonb,
    'G3 other roles untouched');
  SELECT count(*) INTO v_n FROM custom_roles WHERE (permissions ->> 'procurement.request_approve')::boolean;
  PERFORM pg_temp.check(v_n = 1, 'G4 request_approve still only procurement_manager', v_n::text);

  -- ── 2. Patched bodies (applied twice: each patch is in exactly once) ─────────────
  v := pg_get_functiondef('public.fn_procurement_build_approval_chain()'::regprocedure);
  PERFORM pg_temp.check(
    (length(v) - length(replace(v, 'procurement_request_chain_steps(NEW.category_id, NEW.institution_id, NEW.requested_by)', '')))
      / length('procurement_request_chain_steps(NEW.category_id, NEW.institution_id, NEW.requested_by)') = 1
    AND position($p$SELECT 1 FROM procurement_chain_steps(NEW.category_id, NEW.institution_id, 'request')$p$ IN v) > 0
    AND (length(v) - length(replace(v, $p$WHEN 'role' THEN$p$, ''))) / length($p$WHEN 'role' THEN$p$) = 1,
    'B1 submit trigger patched once; the "any approvers set?" check still reads the plain list');
  v := pg_get_functiondef('public.procurement_preview_chain(uuid,uuid,uuid)'::regprocedure);
  PERFORM pg_temp.check(
    (length(v) - length(replace(v, 'procurement_request_chain_steps(', ''))) / length('procurement_request_chain_steps(') = 1,
    'B2 preview patched once');
  PERFORM pg_temp.check(NOT has_function_privilege('authenticated', 'public.procurement_request_chain_steps(uuid,uuid,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.procurement_holds_role(uuid,text)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.procurement_holds_role(uuid,text)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.procurement_preview_chain(uuid,uuid,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.procurement_preview_chain(uuid,uuid,uuid)', 'EXECUTE'),
    'B3 helpers are internal; preview callable by signed-in users only');

  -- ── 3. Categories ────────────────────────────────────────────────────────────────
  INSERT INTO procurement_categories (name) VALUES ('ZZ plain') RETURNING id INTO cat_plain;
  INSERT INTO procurement_categories (name) VALUES ('ZZ principal role') RETURNING id INTO cat_prole;
  INSERT INTO procurement_categories (name) VALUES ('ZZ principal named') RETURNING id INTO cat_pnamed;
  INSERT INTO procurement_categories (name) VALUES ('ZZ empty') RETURNING id INTO cat_empty;
  PERFORM pg_temp.as_user(super);
  PERFORM procurement_save_category_steps(cat_plain, jsonb_build_array(
    jsonb_build_object('label', 'CAO', 'approver_kind', 'user', 'user_id', cao)), 'request', NULL);
  PERFORM procurement_save_category_steps(cat_prole, jsonb_build_array(
    jsonb_build_object('label', 'CAO', 'approver_kind', 'user', 'user_id', cao),
    jsonb_build_object('label', 'Principal', 'approver_kind', 'role', 'role_key', 'principal', 'same_college', true)),
    'request', NULL);
  PERFORM procurement_save_category_steps(cat_pnamed, jsonb_build_array(
    jsonb_build_object('label', 'CAO', 'approver_kind', 'user', 'user_id', cao)), 'request', NULL);
  PERFORM procurement_save_category_steps(cat_pnamed, jsonb_build_array(
    jsonb_build_object('label', 'Principal (A)', 'approver_kind', 'user', 'user_id', princ_a)), 'request', c_a);

  -- ── 4. A HoD's request: principal first, then the existing steps ─────────────────
  PERFORM pg_temp.as_user(hod_a);
  SELECT string_agg(step_order || ' ' || label || ' ' || coalesce(approver_names, '-') || ' ' || ok, ' | ' ORDER BY step_order)
    INTO v FROM procurement_preview_chain(cat_plain, c_a, NULL);
  PERFORM pg_temp.check(v = '1 Principal approval Principal A true | 2 CAO CAO true', 'P1 HoD preview shows principal first', v);

  INSERT INTO procurement_purchase_requests (request_number, title, institution_id, requested_by, status, category_id)
  VALUES ('PR-1', 'Glassware', c_a, hod_a, 'submitted', cat_plain) RETURNING id INTO r;
  v := pg_temp.steps(r);
  PERFORM pg_temp.check(v = 'Principal approval:pending|CAO:waiting', 'H1 HoD request starts at the principal', v);
  PERFORM pg_temp.check((SELECT approver_ids = ARRAY[princ_a] AND approver_kind = 'role'
                           FROM procurement_request_approvals WHERE request_id = r AND step_order = 1),
                        'H2 only the principal of the HoD''s own college is the approver');
  PERFORM pg_temp.check(EXISTS (SELECT 1 FROM user_notifications WHERE user_id = princ_a),
                        'H3 the principal is notified');
  PERFORM pg_temp.check(NOT EXISTS (SELECT 1 FROM user_notifications WHERE user_id = cao),
                        'H4 the procurement office is not notified yet');

  -- the HoD sees "waiting for principal"; the principal sees it in My approvals
  PERFORM pg_temp.as_user(princ_a);
  PERFORM pg_temp.check(EXISTS (SELECT 1 FROM procurement_my_approvals() m
                                 WHERE m.request_id = r AND m.step_label = 'Principal approval' AND m.steps_total = 2),
                        'H5 principal sees it in My approvals');
  PERFORM pg_temp.check(procurement_has_approval_work(), 'H6 principal passes the procurement layout gate');
  PERFORM pg_temp.check(NOT user_has_permission('procurement.request_approve'), 'H7 principal holds no request_approve');

  -- another college's principal cannot act; the HoD cannot approve their own request
  PERFORM pg_temp.as_user(princ_b);
  PERFORM pg_temp.expect_err(format('SELECT procurement_approve_request_step(%L)', r), 'waiting for Principal approval', 'H8 other college''s principal refused');
  PERFORM pg_temp.as_user(hod_a);
  PERFORM pg_temp.expect_err(format('SELECT procurement_approve_request_step(%L)', r), 'waiting for Principal approval', 'H9 HoD cannot approve the principal step');

  -- the principal approves → the procurement office is next
  PERFORM pg_temp.as_user(princ_a);
  v_res := procurement_approve_request_step(r, 'ok');
  v := pg_temp.steps(r);
  PERFORM pg_temp.check(v_res = 'next' AND v = 'Principal approval:approved|CAO:pending', 'H10 principal approval moves it on', v_res || ' ' || v);
  PERFORM pg_temp.check((SELECT status FROM procurement_purchase_requests WHERE id = r) = 'submitted', 'H11 not approved yet');
  PERFORM pg_temp.as_user(cao);
  v_res := procurement_approve_request_step(r, NULL);
  PERFORM pg_temp.check(v_res = 'approved' AND (SELECT status FROM procurement_purchase_requests WHERE id = r) = 'approved',
                        'H12 last step approves the request', v_res);

  -- ── 5. The principal rejects: the request stops ─────────────────────────────────
  INSERT INTO procurement_purchase_requests (request_number, institution_id, requested_by, status, category_id)
  VALUES ('PR-2', c_a, hod_a, 'submitted', cat_plain) RETURNING id INTO r;
  PERFORM pg_temp.as_user(princ_a);
  PERFORM procurement_decide_request_step(r, 'reject', 'Not needed this term');
  v := pg_temp.steps(r);
  PERFORM pg_temp.check(v = 'Principal approval:rejected|CAO:cancelled'
                        AND (SELECT status FROM procurement_purchase_requests WHERE id = r) = 'rejected',
                        'R1 principal rejection stops the request', v);
  PERFORM pg_temp.check(NOT EXISTS (SELECT 1 FROM user_notifications un JOIN notifications n ON n.id = un.notification_id
                                     WHERE un.user_id = cao AND n.metadata ->> 'request_id' = r::text),
                        'R2 the procurement office never hears of it');

  -- ── 6. Who does NOT get the extra step ─────────────────────────────────────────
  -- a HoD who is also the principal: no step to approve their own request
  INSERT INTO procurement_purchase_requests (request_number, institution_id, requested_by, status, category_id)
  VALUES ('PR-3', c_d, hod_princ, 'submitted', cat_plain) RETURNING id INTO r;
  v := pg_temp.steps(r);
  PERFORM pg_temp.check(v = 'CAO:pending', 'S1 HoD who is principal: no principal step', v);
  PERFORM pg_temp.check(NOT EXISTS (SELECT 1 FROM procurement_request_approvals WHERE request_id = r AND acted_by = hod_princ),
                        'S2 and nothing is self-approved');
  -- procurement manager (the central office) raising as a HoD
  INSERT INTO procurement_purchase_requests (request_number, institution_id, requested_by, status, category_id)
  VALUES ('PR-4', c_a, hod_mgr, 'submitted', cat_plain) RETURNING id INTO r;
  PERFORM pg_temp.check(pg_temp.steps(r) = 'CAO:pending', 'S3 HoD who is procurement manager: today''s path', pg_temp.steps(r));
  -- a principal's and an office assistant's own requests: today's path
  INSERT INTO procurement_purchase_requests (request_number, institution_id, requested_by, status, category_id)
  VALUES ('PR-5', c_a, princ_a, 'submitted', cat_plain) RETURNING id INTO r;
  PERFORM pg_temp.check(pg_temp.steps(r) = 'CAO:pending', 'S4 principal''s request: today''s path', pg_temp.steps(r));
  INSERT INTO procurement_purchase_requests (request_number, institution_id, requested_by, status, category_id)
  VALUES ('PR-6', c_a, office_a, 'submitted', cat_plain) RETURNING id INTO r;
  PERFORM pg_temp.check(pg_temp.steps(r) = 'CAO:pending', 'S5 office assistant''s request: today''s path', pg_temp.steps(r));
  PERFORM pg_temp.as_user(office_a);
  SELECT string_agg(label, '|' ORDER BY step_order) INTO v FROM procurement_preview_chain(cat_plain, c_a, NULL);
  PERFORM pg_temp.check(v = 'CAO', 'S6 office assistant preview: today''s path', v);

  -- ── 7. Who DOES get it ─────────────────────────────────────────────────────────
  -- a HoD who also holds procurement_officer + store_admin (how HoDs bought until now)
  INSERT INTO procurement_purchase_requests (request_number, institution_id, requested_by, status, category_id)
  VALUES ('PR-7', c_a, hod_off, 'submitted', cat_plain) RETURNING id INTO r;
  PERFORM pg_temp.check(pg_temp.steps(r) = 'Principal approval:pending|CAO:waiting', 'D1 HoD with officer/store roles: principal first', pg_temp.steps(r));
  -- a HoD only through the legacy single-role column
  INSERT INTO procurement_purchase_requests (request_number, institution_id, requested_by, status, category_id)
  VALUES ('PR-8', c_a, hod_legacy, 'submitted', cat_plain) RETURNING id INTO r;
  PERFORM pg_temp.check(pg_temp.steps(r) = 'Principal approval:pending|CAO:waiting', 'D2 legacy profiles.role HoD: principal first', pg_temp.steps(r));

  -- ── 8. Asked once when the category already asks the principal ───────────────
  INSERT INTO procurement_purchase_requests (request_number, institution_id, requested_by, status, category_id)
  VALUES ('PR-9', c_a, hod_a, 'submitted', cat_prole) RETURNING id INTO r;
  -- the list's own principal step (2nd on the list) is moved to the front: asked once, first
  PERFORM pg_temp.check(pg_temp.steps(r) = 'Principal:pending|CAO:waiting'
                        AND (SELECT approver_ids FROM procurement_request_approvals WHERE request_id = r AND step_order = 1) = ARRAY[princ_a],
                        'Q1 category principal role step: moved first, no second one', pg_temp.steps(r));
  PERFORM pg_temp.as_user(hod_a);
  SELECT string_agg(step_order || ' ' || label, ' | ' ORDER BY step_order) INTO v FROM procurement_preview_chain(cat_prole, c_a, NULL);
  PERFORM pg_temp.check(v = '1 Principal | 2 CAO', 'Q1b HoD preview: the list''s principal step first', v);
  -- not a HoD: the list's own order is kept
  INSERT INTO procurement_purchase_requests (request_number, institution_id, requested_by, status, category_id)
  VALUES ('PR-9b', c_a, office_a, 'submitted', cat_prole) RETURNING id INTO r;
  PERFORM pg_temp.check(pg_temp.steps(r) = 'CAO:pending|Principal:waiting', 'Q1c office assistant: list order unchanged', pg_temp.steps(r));
  INSERT INTO procurement_purchase_requests (request_number, institution_id, requested_by, status, category_id)
  VALUES ('PR-10', c_a, hod_a, 'submitted', cat_pnamed) RETURNING id INTO r;
  PERFORM pg_temp.check(pg_temp.steps(r) = 'Principal (A):pending|CAO:waiting', 'Q2 college list names the principal: no second one', pg_temp.steps(r));
  -- the same category for college B (whose list is only the common CAO) still adds B's principal
  INSERT INTO profiles (id, full_name, institution_id, role) VALUES (gen_random_uuid(), 'HoD B', c_b, 'hod') RETURNING id INTO r;
  INSERT INTO procurement_purchase_requests (request_number, institution_id, requested_by, status, category_id)
  VALUES ('PR-11', c_b, r, 'submitted', cat_pnamed) RETURNING id INTO r;
  PERFORM pg_temp.check(pg_temp.steps(r) = 'Principal approval:pending|CAO:waiting'
                        AND (SELECT approver_ids FROM procurement_request_approvals WHERE request_id = r AND step_order = 1) = ARRAY[princ_b],
                        'Q3 college B: B''s principal first', pg_temp.steps(r));

  -- ── 9. No active principal in the college: held with a clear message ───────────
  PERFORM pg_temp.as_user(hod_c);
  SELECT string_agg(label || ':' || ok || ':' || coalesce(problem, ''), '|' ORDER BY step_order) INTO v
    FROM procurement_preview_chain(cat_plain, c_c, NULL);
  PERFORM pg_temp.check(v = 'Principal approval:false:Nobody holds this role|CAO:true:', 'N1 preview names the missing principal', v);
  PERFORM pg_temp.expect_err(
    format($q$INSERT INTO procurement_purchase_requests (request_number, institution_id, requested_by, status, category_id)
              VALUES ('PR-12', %L, %L, 'submitted', %L)$q$, c_c, hod_c, cat_plain),
    'Principal approval: nobody holds the principal role in this college', 'N2 submit refused, naming the step');
  PERFORM pg_temp.check(NOT EXISTS (SELECT 1 FROM procurement_purchase_requests WHERE request_number = 'PR-12'),
                        'N3 nothing saved, nothing approved');
  -- a draft can still be saved and submitted once a principal is set
  INSERT INTO procurement_purchase_requests (request_number, institution_id, requested_by, status, category_id)
  VALUES ('PR-13', c_c, hod_c, 'draft', cat_plain) RETURNING id INTO r;
  UPDATE profiles SET is_active = true WHERE id = princ_c_off;
  UPDATE procurement_purchase_requests SET status = 'submitted' WHERE id = r;
  PERFORM pg_temp.check(pg_temp.steps(r) = 'Principal approval:pending|CAO:waiting', 'N4 submits once the principal is active', pg_temp.steps(r));

  -- ── 10. A category with no approvers is still refused ───────────────────────────
  PERFORM pg_temp.expect_err(
    format($q$INSERT INTO procurement_purchase_requests (request_number, institution_id, requested_by, status, category_id)
              VALUES ('PR-14', %L, %L, 'submitted', %L)$q$, c_a, hod_a, cat_empty),
    'No approvers are set for this category', 'E1 empty category still refused for a HoD');
END $test$;

SELECT 'PRINCIPAL-FIRST SCENARIOS PASSED';
