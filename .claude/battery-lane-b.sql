-- battery-lane-b.sql — Event-Date Requests (CARRE instrumentation backlog item 1)
-- Run by the coordinator AFTER applying:
--   supabase/migrations/20260725150000_event_date_requests.sql
--   supabase/migrations/20260725151500_carre_evidence_event_date_requests.sql
-- Single BEGIN transaction, NO COMMIT — every seed and mutation rolls back at
-- connection close. Results come back from the final SELECT (mgmt-API returns
-- only the last statement's rows).
-- Identities (prod test accounts, password-less impersonation via jwt claims):
--   learner  = test.student@jkkn.ac.in    6382240f-1368-4b9d-a317-5325a579cbdf
--   non-owner= test.faculty@jkkn.ac.in    65618434-70bd-4453-a171-f0e13f571bd4
--   owner    = test.hod@jkkn.ac.in        88415a49-46f1-4ef1-b43d-70db455aa886 (seeded as event_proposals.decided_by)
--   leader   = test.superadmin@jkkn.ac.in 1d35bef2-2b62-4f64-b2d0-196eb8047fac
-- Validated end-to-end against prod in a rolled-back txn on 2026-07-25 (12/12 pass).

BEGIN;
CREATE TEMP TABLE _r(test text, pass boolean, detail text);
GRANT ALL ON _r TO authenticated;
CREATE TEMP TABLE _ids(k text PRIMARY KEY, v uuid);
GRANT ALL ON _ids TO authenticated;

-- ── Seeds (owner role; in-txn only) ─────────────────────────────────────────
DO $seed$
DECLARE
  v_student uuid := '6382240f-1368-4b9d-a317-5325a579cbdf';
  v_hod     uuid := '88415a49-46f1-4ef1-b43d-70db455aa886';
  v_inst    uuid;
  v_prop    uuid;
  v_r0      uuid;
BEGIN
  SELECT institution_id INTO v_inst FROM public.profiles WHERE id = v_student;
  IF v_inst IS NULL THEN
    SELECT id INTO v_inst FROM public.institutions LIMIT 1;
  END IF;

  INSERT INTO public.event_proposals (institution_id, proposer_id, title, status, decided_by, decided_at, source)
  VALUES (v_inst, v_student, '[TEST] Lane B battery date-ask', 'approved', v_hod, now(), 'form_intake')
  RETURNING id INTO v_prop;

  -- A pre-existing open ask from a different person, 10 days old
  INSERT INTO public.event_date_requests (proposal_id, institution_id, requested_by, requested_at, note)
  VALUES (v_prop, v_inst, v_hod, now() - interval '10 days', 'seeded old ask')
  RETURNING id INTO v_r0;

  INSERT INTO _ids VALUES ('inst', v_inst), ('prop', v_prop), ('r0', v_r0);
END $seed$;

-- ── T1+T2: raise as learner persona (proposer) + duplicate rejected ─────────
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"6382240f-1368-4b9d-a317-5325a579cbdf","role":"authenticated"}';
DO $t12$
DECLARE j jsonb; v_prop uuid;
BEGIN
  SELECT v INTO v_prop FROM _ids WHERE k = 'prop';
  j := public.fn_event_date_request_raise(v_prop, 'When can this run? Third ask this month.');
  INSERT INTO _r VALUES ('T1 raise as learner (proposer)', (j->>'success')::boolean, j::text);
  IF (j->>'success')::boolean THEN
    INSERT INTO _ids VALUES ('r_learner', (j->>'request_id')::uuid);
  END IF;
  j := public.fn_event_date_request_raise(v_prop, 'again');
  INSERT INTO _r VALUES ('T2 duplicate raise rejected',
    (j->>'success') = 'false' AND j->>'error' = 'duplicate_open_request', j::text);
END $t12$;

-- ── T3: decide by non-owner rejected (not admin, not decision owner, no key) ─
SET LOCAL request.jwt.claims = '{"sub":"65618434-70bd-4453-a171-f0e13f571bd4","role":"authenticated"}';
DO $t3$
DECLARE j jsonb; v_req uuid;
BEGIN
  SELECT v INTO v_req FROM _ids WHERE k = 'r_learner';
  j := public.fn_event_date_request_decide(v_req, 'confirmed', 'not mine to decide');
  INSERT INTO _r VALUES ('T3 decide by non-owner rejected',
    (j->>'success') = 'false' AND j->>'error' = 'forbidden', j::text);
END $t3$;

-- ── T5a: CARRE-C5 evidence line appears (2 open, oldest 10d; in-txn rows) ────
SET LOCAL request.jwt.claims = '{"sub":"1d35bef2-2b62-4f64-b2d0-196eb8047fac","role":"authenticated"}';
DO $t5a$
DECLARE v_line record; v_base_open int;
BEGIN
  SELECT e.evidence, e.basis INTO v_line
  FROM public.fn_carre_item_evidence('d8cc1859-16e5-47b3-b503-478ebd861a8d') e
  WHERE e.parameter_code = 'CARRE-C5';
  -- Prod may hold real open requests beyond the 2 seeded here → assert >= 2 and oldest >= 10.
  INSERT INTO _r VALUES ('T5a evidence CARRE-C5 line (>=2 open, oldest >=10d)',
    (v_line.basis->>'edr_open')::int >= 2 AND (v_line.basis->>'edr_oldest_days')::int >= 10,
    COALESCE(v_line.evidence, 'NO C5 ROW'));
END $t5a$;

-- ── T4a: decide by the event decision owner (event_proposals.decided_by) ─────
SET LOCAL request.jwt.claims = '{"sub":"88415a49-46f1-4ef1-b43d-70db455aa886","role":"authenticated"}';
DO $t4a$
DECLARE j jsonb; v_req uuid;
BEGIN
  SELECT v INTO v_req FROM _ids WHERE k = 'r0';
  j := public.fn_event_date_request_decide(v_req, 'confirmed', 'date fixed at review meeting');
  INSERT INTO _r VALUES ('T4a decide by event decision owner works', (j->>'success')::boolean, j::text);
END $t4a$;

-- ── T4b+T4c: decide by leadership + re-decide blocked ───────────────────────
SET LOCAL request.jwt.claims = '{"sub":"1d35bef2-2b62-4f64-b2d0-196eb8047fac","role":"authenticated"}';
DO $t4b$
DECLARE j jsonb; v_req uuid;
BEGIN
  SELECT v INTO v_req FROM _ids WHERE k = 'r_learner';
  j := public.fn_event_date_request_decide(v_req, 'declined', 'clashes with exams window');
  INSERT INTO _r VALUES ('T4b decide by leadership works', (j->>'success')::boolean, j::text);
  j := public.fn_event_date_request_decide(v_req, 'confirmed', NULL);
  INSERT INTO _r VALUES ('T4c re-decide blocked',
    (j->>'success') = 'false' AND j->>'error' = 'already_decided', j::text);
END $t4b$;

-- ── T6: base-table direct write locked (writes are RPC-only) ────────────────
SET LOCAL request.jwt.claims = '{"sub":"6382240f-1368-4b9d-a317-5325a579cbdf","role":"authenticated"}';
DO $t6$
DECLARE v_prop uuid; v_inst uuid;
BEGIN
  SELECT v INTO v_prop FROM _ids WHERE k = 'prop';
  SELECT v INTO v_inst FROM _ids WHERE k = 'inst';
  BEGIN
    INSERT INTO public.event_date_requests (proposal_id, institution_id, requested_by)
    VALUES (v_prop, v_inst, '6382240f-1368-4b9d-a317-5325a579cbdf');
    INSERT INTO _r VALUES ('T6 direct INSERT blocked', false, 'INSERT unexpectedly succeeded');
  EXCEPTION WHEN insufficient_privilege THEN
    INSERT INTO _r VALUES ('T6 direct INSERT blocked', true, 'insufficient_privilege as expected');
  END;
END $t6$;

-- ── T7: RLS read — proposer sees the requests on their proposal ─────────────
DO $t7$
DECLARE v_prop uuid; n int;
BEGIN
  SELECT v INTO v_prop FROM _ids WHERE k = 'prop';
  SELECT count(*) INTO n FROM public.event_date_requests WHERE proposal_id = v_prop;
  INSERT INTO _r VALUES ('T7 proposer sees requests via RLS', n = 2, format('visible=%s (expect 2)', n));
END $t7$;

RESET ROLE;

-- ── T8: anon lock on both RPCs and the evidence fn ──────────────────────────
INSERT INTO _r
SELECT 'T8 anon EXECUTE revoked', NOT (
    has_function_privilege('anon', 'public.fn_event_date_request_raise(uuid,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.fn_event_date_request_decide(uuid,text,text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.fn_carre_item_evidence(uuid)', 'EXECUTE')
  ) AND has_function_privilege('authenticated', 'public.fn_event_date_request_raise(uuid,text)', 'EXECUTE'),
  'anon=false on all three, authenticated=true on raise';

SELECT * FROM _r ORDER BY test;
-- NO COMMIT — connection close rolls everything back.
