-- Run as app_user (an ordinary signed-in caller, NOT the table owner).
-- Each block impersonates a caller through GUCs and RAISEs on any failure, so
-- psql -v ON_ERROR_STOP=1 exits non-zero the moment a guarantee breaks.
-- Proven 2026-10-07: ./run.sh passes; ./run.sh --original-only fails at A1.
\set ON_ERROR_STOP 1

CREATE OR REPLACE FUNCTION pg_temp.as_caller(p_uid text, p_perms text, p_insts text) RETURNS void
LANGUAGE sql AS $$
  SELECT set_config('test.uid',   p_uid,   false),
         set_config('test.perms', p_perms, false),
         set_config('test.insts', p_insts, false),
         set_config('test.super', '',      false),
         set_config('test.admin', '',      false);
$$;

-- A1 (finding #1, CRITICAL): a learner tries to file a claim already confirmed.
SELECT pg_temp.as_caller('b1000000-0000-0000-0000-000000000001', '', '');
INSERT INTO public.ig_learner_post_claims
  (learner_id, ig_post_id, institution_id, origin, status, reviewed_by, reviewed_at, claimed_by)
VALUES ('a1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000001',
        '11111111-0000-0000-0000-000000000001', 'learner_link',
        'confirmed', 'c2000000-0000-0000-0000-000000000002', now(), 'c2000000-0000-0000-0000-000000000002');
DO $$
DECLARE r record;
BEGIN
  SELECT status, reviewed_by, claimed_by INTO r FROM public.ig_learner_post_claims
   WHERE learner_id = 'a1000000-0000-0000-0000-000000000001' AND ig_post_id = 'd1000000-0000-0000-0000-000000000001';
  IF r.status <> 'pending'  THEN RAISE EXCEPTION 'A1 FAIL: learner self-confirmed - status=%', r.status; END IF;
  IF r.reviewed_by IS NOT NULL THEN RAISE EXCEPTION 'A1 FAIL: reviewed_by survived as %', r.reviewed_by; END IF;
  IF r.claimed_by <> 'b1000000-0000-0000-0000-000000000001' THEN RAISE EXCEPTION 'A1 FAIL: claimed_by forged as %', r.claimed_by; END IF;
  RAISE NOTICE 'A1 ok';
END $$;

-- A2/A3: learner may not use staff_link or auto_collab.
DO $$ BEGIN
  BEGIN
    INSERT INTO public.ig_learner_post_claims (learner_id, ig_post_id, institution_id, origin)
    VALUES ('a1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001','staff_link');
    RAISE EXCEPTION 'A2 FAIL: learner filed staff_link';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'A2 ok'; END;
  BEGIN
    INSERT INTO public.ig_learner_post_claims (learner_id, ig_post_id, institution_id, origin)
    VALUES ('a1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001','auto_collab');
    RAISE EXCEPTION 'A3 FAIL: learner filed auto_collab';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'A3 ok'; END;
END $$;

-- A4: learner may not file for another learner.
DO $$ BEGIN
  INSERT INTO public.ig_learner_post_claims (learner_id, ig_post_id, institution_id, origin)
  VALUES ('a2000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','learner_link');
  RAISE EXCEPTION 'A4 FAIL: learner filed for another learner';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'A4 ok'; END $$;

-- A5: learner may not decide their own claim.
DO $$ DECLARE n int; BEGIN
  UPDATE public.ig_learner_post_claims SET status='confirmed' WHERE learner_id='a1000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'A5 FAIL: learner updated % claim(s)', n; END IF;
  RAISE NOTICE 'A5 ok';
END $$;

-- A6 (#1): an admin insert is born pending too; the guard trusts no caller.
SELECT pg_temp.as_caller('c2000000-0000-0000-0000-000000000002', '', '');
SELECT set_config('test.admin', 'true', false);
INSERT INTO public.ig_learner_post_claims
  (learner_id, ig_post_id, institution_id, origin, status, reviewed_by, reviewed_at)
VALUES ('a2000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000001',
        '11111111-0000-0000-0000-000000000001', 'staff_link',
        'confirmed', 'c1000000-0000-0000-0000-000000000001', now());
DO $$ DECLARE r record; BEGIN
  SELECT status, reviewed_by, claimed_by INTO r FROM public.ig_learner_post_claims
   WHERE learner_id = 'a2000000-0000-0000-0000-000000000002' AND ig_post_id = 'd1000000-0000-0000-0000-000000000001';
  IF r.status <> 'pending' OR r.reviewed_by IS NOT NULL THEN RAISE EXCEPTION 'A6 FAIL: admin filed a decided claim (%)', r.status; END IF;
  IF r.claimed_by <> 'c2000000-0000-0000-0000-000000000002' THEN RAISE EXCEPTION 'A6 FAIL: claimed_by is %', r.claimed_by; END IF;
  DELETE FROM public.ig_learner_post_claims
   WHERE learner_id = 'a2000000-0000-0000-0000-000000000002' AND ig_post_id = 'd1000000-0000-0000-0000-000000000001';
  RAISE NOTICE 'A6 ok';
END $$;

-- B1 (#5): review-only key can read what it decides.
SELECT pg_temp.as_caller('c1000000-0000-0000-0000-000000000001','social.learner_credit.review','11111111-0000-0000-0000-000000000001');
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.ig_learner_post_claims;
  IF n <> 1 THEN RAISE EXCEPTION 'B1 FAIL: sees % claims, expected 1', n; END IF;
  RAISE NOTICE 'B1 ok';
END $$;

-- B2 (#6): confirm while forging decider + moving learner.
UPDATE public.ig_learner_post_claims
   SET status='confirmed', reviewed_by='c2000000-0000-0000-0000-000000000002', learner_id='a2000000-0000-0000-0000-000000000002'
 WHERE ig_post_id='d1000000-0000-0000-0000-000000000001';
DO $$ DECLARE r record; BEGIN
  SELECT status, reviewed_by, learner_id INTO r FROM public.ig_learner_post_claims WHERE ig_post_id='d1000000-0000-0000-0000-000000000001';
  IF r.status <> 'confirmed' THEN RAISE EXCEPTION 'B2 FAIL: not applied (%)', r.status; END IF;
  IF r.reviewed_by <> 'c1000000-0000-0000-0000-000000000001' THEN RAISE EXCEPTION 'B2 FAIL: decider forged as %', r.reviewed_by; END IF;
  IF r.learner_id <> 'a1000000-0000-0000-0000-000000000001' THEN RAISE EXCEPTION 'B2 FAIL: learner moved to %', r.learner_id; END IF;
  RAISE NOTICE 'B2 ok';
END $$;

-- B3 (#9): decision is final.
SELECT pg_temp.as_caller('c2000000-0000-0000-0000-000000000002','social.learner_credit.review','11111111-0000-0000-0000-000000000001');
DO $$ BEGIN
  UPDATE public.ig_learner_post_claims SET status='rejected' WHERE ig_post_id='d1000000-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'B3 FAIL: confirmed flipped to rejected';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'B3 ok'; END $$;

-- B4 (#6): filer cannot also decide.
SELECT pg_temp.as_caller('c1000000-0000-0000-0000-000000000001','social.learner_credit.review','11111111-0000-0000-0000-000000000001');
INSERT INTO public.ig_learner_post_claims (learner_id, ig_post_id, institution_id, origin)
VALUES ('a2000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001','staff_link');
DO $$ BEGIN
  UPDATE public.ig_learner_post_claims SET status='confirmed' WHERE ig_post_id='d2000000-0000-0000-0000-000000000002';
  RAISE EXCEPTION 'B4 FAIL: reviewer confirmed own filing';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'B4 ok'; END $$;

-- B5 (#7): decided kept, pending deletable.
DO $$ DECLARE n int; BEGIN
  DELETE FROM public.ig_learner_post_claims WHERE ig_post_id='d1000000-0000-0000-0000-000000000001';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 0 THEN RAISE EXCEPTION 'B5 FAIL: deleted % decided claim(s)', n; END IF;
  DELETE FROM public.ig_learner_post_claims WHERE ig_post_id='d2000000-0000-0000-0000-000000000002';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'B5 FAIL: pending not deletable (%)', n; END IF;
  RAISE NOTICE 'B5 ok';
END $$;

-- B6 (review #2 on #4247): a reviewer seeing two institutions cannot move a claim by forging institution_id.
SELECT pg_temp.as_caller('c1000000-0000-0000-0000-000000000001','social.learner_credit.review','11111111-0000-0000-0000-000000000001');
INSERT INTO public.ig_learner_post_claims (learner_id, ig_post_id, institution_id, origin)
VALUES ('a2000000-0000-0000-0000-000000000002','d2000000-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001','staff_link');
SELECT pg_temp.as_caller('c2000000-0000-0000-0000-000000000002','social.learner_credit.review',
                         '11111111-0000-0000-0000-000000000001,22222222-0000-0000-0000-000000000002');
UPDATE public.ig_learner_post_claims SET status='confirmed', institution_id='22222222-0000-0000-0000-000000000002'
 WHERE learner_id='a2000000-0000-0000-0000-000000000002' AND ig_post_id='d2000000-0000-0000-0000-000000000002';
DO $$ DECLARE r record; BEGIN
  SELECT status, institution_id INTO r FROM public.ig_learner_post_claims
   WHERE learner_id='a2000000-0000-0000-0000-000000000002' AND ig_post_id='d2000000-0000-0000-0000-000000000002';
  IF r.status <> 'confirmed' THEN RAISE EXCEPTION 'B6 FAIL: decision not applied (%)', r.status; END IF;
  IF r.institution_id <> '11111111-0000-0000-0000-000000000001' THEN RAISE EXCEPTION 'B6 FAIL: claim moved to %', r.institution_id; END IF;
  RAISE NOTICE 'B6 ok';
END $$;

-- B7 (review #3 on #4247): a learner holding the review key cannot decide a claim about themselves.
SELECT pg_temp.as_caller('c1000000-0000-0000-0000-000000000001','social.learner_credit.review','11111111-0000-0000-0000-000000000001');
INSERT INTO public.ig_learner_post_claims (learner_id, ig_post_id, institution_id, origin)
VALUES ('a1000000-0000-0000-0000-000000000001','d2000000-0000-0000-0000-000000000002','11111111-0000-0000-0000-000000000001','staff_link');
SELECT pg_temp.as_caller('b1000000-0000-0000-0000-000000000001','social.learner_credit.review','11111111-0000-0000-0000-000000000001');
DO $$ BEGIN
  UPDATE public.ig_learner_post_claims SET status='confirmed'
   WHERE learner_id='a1000000-0000-0000-0000-000000000001' AND ig_post_id='d2000000-0000-0000-0000-000000000002';
  RAISE EXCEPTION 'B7 FAIL: learner confirmed a claim about themselves';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'B7 ok'; END $$;

-- C1: other-institution reviewer sees nothing.
SELECT pg_temp.as_caller('c1000000-0000-0000-0000-000000000001','social.learner_credit.review','22222222-0000-0000-0000-000000000002');
DO $$ DECLARE n int; BEGIN
  SELECT count(*) INTO n FROM public.ig_learner_post_claims;
  IF n <> 0 THEN RAISE EXCEPTION 'C1 FAIL: sees % claims', n; END IF;
  RAISE NOTICE 'C1 ok';
END $$;

\echo 'ALL CLAIMS ASSERTIONS PASSED'
