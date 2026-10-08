-- Run as postgres AFTER the hardening migration. Covers what the service role
-- does, which the non-owner assertions cannot: v_ig_post_latest_metrics returns
-- exactly one row per post (the latest real one) even past PostgREST's 1,000-row
-- cap, only the service role may read it, and a service-role insert keeps the
-- filer it names but is still born pending.
\set ON_ERROR_STOP 1
INSERT INTO public.ig_post_metrics (post_id, snapshot_at, saves, shares, comments, likes, reach)
SELECT 'd1000000-0000-0000-0000-000000000001', now() - make_interval(hours => g), g, 0, 0, g, 0
  FROM generate_series(1, 1500) g;
INSERT INTO public.ig_post_metrics (post_id, snapshot_at, saves, shares, comments, likes, reach)
VALUES ('d2000000-0000-0000-0000-000000000002', now(), 7, 0, 0, 7, 0),
       ('d1000000-0000-0000-0000-000000000001', NULL, 999, 0, 0, 999, 0);  -- a NULL snapshot must never read as latest
SET ROLE service_role;
DO $$ DECLARE n int; s int; BEGIN
  SELECT count(*) INTO n FROM public.v_ig_post_latest_metrics;
  IF n <> 2 THEN RAISE EXCEPTION 'V1 FAIL: % rows, expected one per post (2)', n; END IF;
  SELECT saves INTO s FROM public.v_ig_post_latest_metrics WHERE post_id = 'd1000000-0000-0000-0000-000000000001';
  IF s <> 1 THEN RAISE EXCEPTION 'V1 FAIL: latest snapshot not chosen (saves=%)', s; END IF;
  RAISE NOTICE 'V1 ok';
END $$;
RESET ROLE;
SET ROLE authenticated;
DO $$ BEGIN
  PERFORM 1 FROM public.v_ig_post_latest_metrics;
  RAISE EXCEPTION 'V2 FAIL: a signed-in caller read the view';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'V2 ok'; END $$;
RESET ROLE;

-- S1 (review #1 on #4247): as service_role (BYPASSRLS, as in production), no auth.uid(). The named filer is kept;
-- the decision fields are still discarded.
SELECT set_config('test.uid', '', false);
SET ROLE service_role;
INSERT INTO public.ig_learner_post_claims (learner_id, ig_post_id, institution_id, origin, status, reviewed_by, reviewed_at, claimed_by)
VALUES ('a2000000-0000-0000-0000-000000000002','d1000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001',
        'auto_collab','confirmed','c1000000-0000-0000-0000-000000000001', now(), 'c2000000-0000-0000-0000-000000000002');
DO $$ DECLARE r record; BEGIN
  SELECT status, reviewed_by, claimed_by INTO r FROM public.ig_learner_post_claims
   WHERE learner_id='a2000000-0000-0000-0000-000000000002' AND ig_post_id='d1000000-0000-0000-0000-000000000001';
  IF r.status <> 'pending' OR r.reviewed_by IS NOT NULL THEN RAISE EXCEPTION 'S1 FAIL: service insert born %', r.status; END IF;
  IF r.claimed_by IS DISTINCT FROM 'c2000000-0000-0000-0000-000000000002' THEN RAISE EXCEPTION 'S1 FAIL: filer lost (%)', r.claimed_by; END IF;
  RAISE NOTICE 'S1 ok';
END $$;

-- S2 (third review on #4247): a service-role decision naming the credited learner is refused.
DO $$ BEGIN
  UPDATE public.ig_learner_post_claims SET status='confirmed', reviewed_by='b1000000-0000-0000-0000-000000000001'
   WHERE learner_id='a1000000-0000-0000-0000-000000000001' AND ig_post_id='d2000000-0000-0000-0000-000000000002';
  IF NOT FOUND THEN RAISE EXCEPTION 'S2 FAIL: no pending claim for learner L1 to test against'; END IF;
  RAISE EXCEPTION 'S2 FAIL: service role let the credited learner decide';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'S2 ok'; END $$;
RESET ROLE;

-- S3 (third review on #4247): created_at cannot be backdated on INSERT.
INSERT INTO public.ig_posts VALUES ('d3000000-0000-0000-0000-000000000003');
SELECT set_config('test.uid', 'b1000000-0000-0000-0000-000000000001', false);
INSERT INTO public.ig_learner_post_claims (learner_id, ig_post_id, institution_id, origin, created_at)
VALUES ('a1000000-0000-0000-0000-000000000001','d3000000-0000-0000-0000-000000000003','11111111-0000-0000-0000-000000000001','learner_link','2020-01-01');
DO $$ DECLARE c timestamptz; BEGIN
  SELECT created_at INTO c FROM public.ig_learner_post_claims
   WHERE learner_id='a1000000-0000-0000-0000-000000000001' AND ig_post_id='d3000000-0000-0000-0000-000000000003';
  IF c IS NULL THEN RAISE EXCEPTION 'S3 FAIL: claim not filed'; END IF;
  IF c < now() - interval '1 day' THEN RAISE EXCEPTION 'S3 FAIL: created_at backdated to %', c; END IF;
  RAISE NOTICE 'S3 ok';
END $$;
\echo 'OWNER ASSERTIONS PASSED'
