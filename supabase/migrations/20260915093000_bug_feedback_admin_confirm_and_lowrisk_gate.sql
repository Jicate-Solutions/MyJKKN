-- =====================================================================
-- Groups tab: admin confirmation on silent reporters + low-risk "fix this" gate
-- Date: 2026-09-15   (two Director rulings, 07:18-07:20, by tap)
-- Merge order: AFTER PR #3791 (single-report clusters) — this file's
--   fn_bug_cluster_list body is #3791's body plus one key.
--
-- RULING 1 — a reporter never answers "is this fixed?" and it expires →
--   a super admin may confirm instead, recorded as ITS OWN kind of evidence,
--   never disguised as the reporter's.
--   * bug_fix_feedback_requests.answered_by ('reporter'|'admin'), admin_user_id, admin_note
--   * fn_bug_feedback_admin_confirm(p_request_id, p_answer 'pos'|'neg', p_note, p_admin_user_id)
--       gate = the admin routes' exact role set (is_super_admin OR role IN
--       super_admin/administrator/ceo); only when the request is expired or
--       within 3 days of expires_at; never on a reporter-answered row.
--   * bug_fix_outcomes.admin_pos / admin_neg; reporter_confirmed gains 'admin'
--       (= the ONLY confirmation is staff). fn_bug_fix_outcome_record tallies
--       reporter and admin answers apart. fn_bug_fix_outcomes_match returns
--       reporter-confirmed rows first, admin-confirmed after, labelled
--       confirmed_by so the Learn prompt can say "confirmed by staff".
--   * fn_bug_feedback_answer: a reporter's late word replaces an admin's.
--   * fn_loops_regress_bug_triage: cases C and D ADDED; A and B unchanged.
--   * auto-resolve is untouched: its clean-track counts reporter_confirmed =
--     'positive' only, so an admin-only confirmation never earns it.
--
-- RULING 2 — a super admin may press "fix this" in the app today for LOW-risk
--   groups only. fn_bug_cluster_fix_request refuses HELD groups for any
--   person (an admin JWT, or the route acting for an admin via the new
--   p_actor_user_id); the bugs desk (service role, no actor) is not gated.
--   Risk = the SAME regex as lib/bug-reports/fix-risk.ts (composed from the
--   Orchestration Console's HELD_KEYWORDS + the /fixallbugs danger-zone paths
--   + attendance/admissions per the ruling). A vitest asserts the literal below
--   equals the module's buildHeldRegexSource().
--   fn_bug_cluster_list exposes members' page_url so the tab can classify a
--   group before a verdict exists.
--
-- DROP FUNCTION below is required: adding a DEFAULT parameter to
-- fn_bug_cluster_fix_request would otherwise create an OVERLOAD, and
-- PostgREST refuses an ambiguous one-argument call. Grants are re-issued.
-- =====================================================================

-- ── Ruling 1: columns ────────────────────────────────────────────────────
ALTER TABLE public.bug_fix_feedback_requests
  ADD COLUMN IF NOT EXISTS answered_by text NOT NULL DEFAULT 'reporter'
    CONSTRAINT bug_fix_feedback_requests_answered_by_check CHECK (answered_by IN ('reporter', 'admin')),
  ADD COLUMN IF NOT EXISTS admin_user_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_note text NULL;
COMMENT ON COLUMN public.bug_fix_feedback_requests.answered_by IS
  'reporter = the reporter''s own thumbs (ground truth); admin = a super admin confirmed on the reporter''s silence (fn_bug_feedback_admin_confirm). Tallied apart in bug_fix_outcomes.';

ALTER TABLE public.bug_fix_outcomes
  ADD COLUMN IF NOT EXISTS admin_pos int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS admin_neg int NOT NULL DEFAULT 0;
ALTER TABLE public.bug_fix_outcomes DROP CONSTRAINT IF EXISTS bug_fix_outcomes_reporter_confirmed_check;
ALTER TABLE public.bug_fix_outcomes
  ADD CONSTRAINT bug_fix_outcomes_reporter_confirmed_check
  CHECK (reporter_confirmed IN ('positive', 'negative', 'admin', 'none'));
COMMENT ON COLUMN public.bug_fix_outcomes.reporter_confirmed IS
  'positive/negative = derived ONLY from reporter thumbs; admin = the only confirmation is a super admin''s (see admin_pos/admin_neg); none = silence.';

-- ── Ruling 1: fn_bug_feedback_admin_confirm ──────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_bug_feedback_admin_confirm(
  p_request_id uuid,
  p_answer text,
  p_note text DEFAULT NULL,
  p_admin_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_admin uuid;
  v_role  text;
  v_super boolean;
  v_row   public.bug_fix_feedback_requests%ROWTYPE;
BEGIN
  IF p_answer NOT IN ('pos', 'neg') THEN
    RETURN jsonb_build_object('success', false, 'error', 'answer must be pos or neg');
  END IF;

  -- Who is confirming: the caller's JWT, or (service-role route) the admin it acts for.
  v_admin := COALESCE(auth.uid(), p_admin_user_id);
  IF v_admin IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'an admin user is required');
  END IF;
  -- Exact gate of the admin routes (app/api/bug-reports/clusters/_auth.ts):
  -- is_super_admin OR role IN (super_admin, administrator, ceo). For a JWT
  -- caller public.is_super_admin() reads the same profile; for the service-role
  -- route (auth.uid() IS NULL) the admin it acts for is checked by id.
  SELECT role, is_super_admin INTO v_role, v_super FROM public.profiles WHERE id = v_admin;
  IF NOT FOUND
     OR NOT (public.is_super_admin()
             OR COALESCE(v_super, false)
             OR v_role IN ('super_admin', 'administrator', 'ceo')) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not allowed');
  END IF;

  SELECT * INTO v_row FROM public.bug_fix_feedback_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not found');
  END IF;
  IF v_row.status = 'answered' THEN
    RETURN jsonb_build_object('success', false, 'error',
      CASE WHEN v_row.answered_by = 'admin' THEN 'already confirmed by an admin' ELSE 'the reporter already answered' END);
  END IF;
  IF v_row.status = 'pending_send' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not sent yet — the reporter has not been asked');
  END IF;
  -- Only on silence: expired, or within 3 days of expiring.
  IF v_row.expires_at > now() + interval '3 days' THEN
    RETURN jsonb_build_object('success', false, 'error', 'the reporter still has time to answer',
      'expires_at', v_row.expires_at);
  END IF;

  UPDATE public.bug_fix_feedback_requests
  SET answer        = CASE p_answer WHEN 'pos' THEN 'fixed' ELSE 'not_fixed' END,
      answered_at   = now(),
      status        = 'answered',
      answered_by   = 'admin',
      admin_user_id = v_admin,
      admin_note    = NULLIF(left(p_note, 500), ''),
      delivered_at  = COALESCE(delivered_at, now()),
      updated_at    = now()
  WHERE id = p_request_id;

  -- Re-derive the ledger row (tallies admin answers apart).
  BEGIN
    PERFORM public.fn_bug_fix_outcome_record(v_row.cluster_id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('success', true, 'answered_by', 'admin', 'answer', p_answer, 'admin_user_id', v_admin);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_bug_feedback_admin_confirm(uuid, text, text, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_feedback_admin_confirm(uuid, text, text, uuid) TO authenticated, service_role;

-- ── Ruling 1: fn_bug_feedback_answer (body from 20260719050000 + CHANGED lines) ──
-- ci:allow-secdef-authenticated fn_bug_feedback_answer: every signed-in REPORTER answers their OWN question — the body scopes every read and write by reporter_user_id = auth.uid(); posture unchanged since 20260718180000 (this file only adds answered_by/admin_* resets)
CREATE OR REPLACE FUNCTION public.fn_bug_feedback_answer(p_request_id uuid, p_answer text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.bug_fix_feedback_requests%ROWTYPE;
BEGIN
  IF p_answer NOT IN ('fixed','not_fixed') THEN
    RETURN jsonb_build_object('success', false, 'error', 'answer must be fixed or not_fixed');
  END IF;

  SELECT * INTO v_row
  FROM public.bug_fix_feedback_requests
  WHERE id = p_request_id AND reporter_user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not found');
  END IF;
  IF v_row.status = 'pending_send' THEN
    RETURN jsonb_build_object('success', false, 'error', 'not sent yet');
  END IF;
  -- (unchanged rule) an expired, unanswered question stays expired. An
  -- expired question an ADMIN has confirmed is status='answered', so the
  -- reporter's late word still gets through and replaces the admin's.
  IF v_row.expires_at <= now() AND v_row.status <> 'answered' THEN
    RETURN jsonb_build_object('success', false, 'error', 'this question has expired');
  END IF;

  UPDATE public.bug_fix_feedback_requests
  SET answer = p_answer,
      answered_at = now(),
      status = 'answered',
      delivered_at = COALESCE(delivered_at, now()),
      -- CHANGED 2026-09-15: the reporter's own word always wins and is never
      -- disguised — a late reporter answer over an admin confirmation resets
      -- the row to reporter evidence.
      answered_by = 'reporter',
      admin_user_id = NULL,
      admin_note = NULL,
      updated_at = now()
  WHERE id = p_request_id AND reporter_user_id = auth.uid();

  -- Learn (#3): refresh the measured-outcome ledger. Never fail the answer.
  BEGIN
    PERFORM public.fn_bug_fix_outcome_record(v_row.cluster_id);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- R3 circuit breaker: a still-broken answer on an AUTO-resolved group
  -- switches auto-resolve OFF everywhere until a human reviews. Must never
  -- break the reporter's answer write.
  IF p_answer = 'not_fixed' THEN
    BEGIN
      IF EXISTS (SELECT 1 FROM public.bug_clusters c
                  WHERE c.id = v_row.cluster_id AND (c.metadata ? 'auto_resolved')) THEN
        UPDATE public.platform_policies
           SET value = 'false'::jsonb, updated_at = now()
         WHERE policy_key = 'bug_reports.auto_resolve.enabled' AND scope_type = 'global';
        UPDATE public.platform_policies
           SET value = jsonb_build_object(
                 'suspended_at', now(),
                 'cluster_id', v_row.cluster_id,
                 'reason', 'a reporter answered still-broken after an auto-resolve'),
               updated_at = now()
         WHERE policy_key = 'bug_reports.auto_resolve.suspended' AND scope_type = 'global';
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object('success', true, 'answer', p_answer);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_bug_feedback_answer(uuid, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_feedback_answer(uuid, text) TO authenticated, service_role;

-- ── Ruling 1: fn_bug_fix_outcome_record (body from 20260718190000 + CHANGED lines) ──
CREATE OR REPLACE FUNCTION public.fn_bug_fix_outcome_record(p_cluster_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cluster   public.bug_clusters%ROWTYPE;
  v_verdict   jsonb;
  v_fix       jsonb;
  v_files     text[];
  v_category  text;
  v_pos       int;
  v_neg       int;
  v_apos      int;   -- CHANGED 2026-09-15: admin confirmations, tallied apart
  v_aneg      int;
  v_confirmed text;
  v_resolved  timestamptz;
BEGIN
  SELECT * INTO v_cluster FROM public.bug_clusters WHERE id = p_cluster_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'group not found');
  END IF;

  v_verdict := v_cluster.metadata -> 'fixability' -> 'verdict';
  IF v_verdict IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'no fixability verdict to learn from');
  END IF;
  v_fix := v_cluster.metadata -> 'fixability' -> 'fix';

  SELECT COALESCE(array_agg(f), '{}') INTO v_files
  FROM jsonb_array_elements_text(COALESCE(v_verdict -> 'files', '[]'::jsonb)) f;

  IF array_length(v_files, 1) IS NULL THEN
    v_category := 'uncategorized';
  ELSE
    v_category := array_to_string((string_to_array(v_files[1], '/'))[1:3], '/');
  END IF;

  -- GROUND TRUTH derivation (D5: any 👎 = not clean; E2: silence = none).
  -- CHANGED 2026-09-15: reporter answers and admin confirmations are two
  -- kinds of evidence. reporter_pos/neg count ONLY answered_by='reporter';
  -- admin_pos/neg count ONLY answered_by='admin'. reporter_confirmed is
  -- 'admin' when the ONLY confirmation is an admin's — never 'positive'.
  SELECT count(*) FILTER (WHERE answer = 'fixed'     AND answered_by = 'reporter'),
         count(*) FILTER (WHERE answer = 'not_fixed' AND answered_by = 'reporter'),
         count(*) FILTER (WHERE answer = 'fixed'     AND answered_by = 'admin'),
         count(*) FILTER (WHERE answer = 'not_fixed' AND answered_by = 'admin')
    INTO v_pos, v_neg, v_apos, v_aneg
  FROM public.bug_fix_feedback_requests
  WHERE cluster_id = p_cluster_id AND status = 'answered';

  v_confirmed := CASE
    WHEN v_neg > 0 THEN 'negative'
    WHEN v_pos > 0 THEN 'positive'
    WHEN COALESCE(v_apos, 0) + COALESCE(v_aneg, 0) > 0 THEN 'admin'
    ELSE 'none'
  END;

  SELECT resolved_at INTO v_resolved
  FROM public.bug_reports WHERE id = v_cluster.seed_bug_id;

  INSERT INTO public.bug_fix_outcomes AS o
    (cluster_id, canonical_bug_id, root_cause_category, root_cause, files_touched,
     fix_pattern, fix_pr, verify_verdict, reporter_confirmed, reporter_pos,
     reporter_neg, admin_pos, admin_neg, resolved_at, updated_at)
  VALUES
    (p_cluster_id, v_cluster.seed_bug_id, v_category, v_verdict ->> 'root_cause', v_files,
     CASE WHEN v_fix IS NULL THEN NULL ELSE jsonb_build_object(
       'note', v_fix ->> 'note', 'branch', v_fix ->> 'branch', 'pr_number', v_fix -> 'pr_number') END,
     v_fix ->> 'pr_url',
     v_cluster.metadata -> 'verify' -> 'tally',
     v_confirmed, COALESCE(v_pos, 0), COALESCE(v_neg, 0),
     COALESCE(v_apos, 0), COALESCE(v_aneg, 0), v_resolved, now())
  ON CONFLICT (cluster_id) DO UPDATE SET
    canonical_bug_id    = EXCLUDED.canonical_bug_id,
    root_cause_category = EXCLUDED.root_cause_category,
    root_cause          = EXCLUDED.root_cause,
    files_touched       = EXCLUDED.files_touched,
    fix_pattern         = EXCLUDED.fix_pattern,
    fix_pr              = EXCLUDED.fix_pr,
    verify_verdict      = EXCLUDED.verify_verdict,
    reporter_confirmed  = EXCLUDED.reporter_confirmed,
    reporter_pos        = EXCLUDED.reporter_pos,
    reporter_neg        = EXCLUDED.reporter_neg,
    admin_pos           = EXCLUDED.admin_pos,
    admin_neg           = EXCLUDED.admin_neg,
    resolved_at         = EXCLUDED.resolved_at,
    updated_at          = now();

  RETURN jsonb_build_object('success', true, 'category', v_category,
    'reporter_confirmed', v_confirmed, 'pos', COALESCE(v_pos,0), 'neg', COALESCE(v_neg,0),
    'admin_pos', COALESCE(v_apos,0), 'admin_neg', COALESCE(v_aneg,0));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_bug_fix_outcome_record(uuid) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_bug_fix_outcome_record(uuid) TO service_role;

-- ── Ruling 1: fn_bug_fix_outcomes_match (body from 20260718190000 + CHANGED lines) ──
CREATE OR REPLACE FUNCTION public.fn_bug_fix_outcomes_match(
  p_category text,
  p_limit int DEFAULT 5
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'cluster_id', o.cluster_id,
    'root_cause_category', o.root_cause_category,
    'root_cause', left(o.root_cause, 400),
    'files_touched', to_jsonb(o.files_touched),
    'fix_pattern', o.fix_pattern,
    'fix_pr', o.fix_pr,
    'reporter_confirmed', o.reporter_confirmed,
    'reporter_pos', o.reporter_pos,
    'reporter_neg', o.reporter_neg,
    'admin_pos', o.admin_pos,                                     -- CHANGED 2026-09-15
    'admin_neg', o.admin_neg,
    'confirmed_by', CASE WHEN o.reporter_confirmed = 'admin' THEN 'admin' ELSE 'reporter' END,
    'updated_at', o.updated_at
  ) ORDER BY (o.reporter_confirmed = 'admin') ASC, o.updated_at DESC), '[]'::jsonb)
  FROM (
    SELECT * FROM public.bug_fix_outcomes
    WHERE root_cause_category = p_category
      AND reporter_confirmed <> 'none'   -- measured outcomes ONLY (the moat rule)
    -- CHANGED 2026-09-15: reporter-confirmed rows first, admin-confirmed after
    ORDER BY (reporter_confirmed = 'admin') ASC, updated_at DESC
    LIMIT GREATEST(COALESCE(p_limit, 5), 1)
  ) o;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_bug_fix_outcomes_match(text, int) FROM anon, PUBLIC, authenticated;
GRANT  EXECUTE ON FUNCTION public.fn_bug_fix_outcomes_match(text, int) TO service_role;

-- ── Ruling 1: fn_loops_regress_bug_triage (body from 20260813113000 + cases C/D) ──
CREATE OR REPLACE FUNCTION public.fn_loops_regress_bug_triage()
RETURNS TABLE(loop_key text, verdict text, no_change_lift numeric, known_delta_lift numeric)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_a       numeric;      -- no-change reporter_pos (must be 0.00)
  v_b       numeric;      -- +2-delta reporter_pos  (must be 2.00)
  v_conf_a  text;         -- reporter_confirmed at A (must be 'none')
  v_conf_b  text;         -- reporter_confirmed at B (must be 'positive')
  -- CHANGED 2026-09-15: admin confirmation is its own evidence
  v_c_rpos  numeric;      -- C: one thumb re-attributed to an admin -> reporter_pos 1
  v_c_apos  numeric;      -- C: admin_pos 1
  v_conf_c  text;         -- C: still 'positive' (a reporter answer exists)
  v_d_rpos  numeric;      -- D: both thumbs admin -> reporter_pos 0
  v_d_apos  numeric;      -- D: admin_pos 2
  v_conf_d  text;         -- D: 'admin' (the ONLY confirmation is staff)
  v_err     text := NULL; -- non-sentinel failure inside the sim block
  v_verdict text;
  v_bug     uuid;         -- borrowed REAL bug (seed FK; must not already seed a cluster)
  v_r1      uuid;         -- borrowed REAL reporter profile #1
  v_r2      uuid;         -- borrowed REAL reporter profile #2
  v_cluster uuid;         -- seeded sentinel cluster
  v_res     jsonb;        -- measurer return payload
BEGIN
  -- ── The sim, inside a subtransaction. The sentinel RAISE at the end rolls
  --    back every seeded row; the captured variables survive. Any OTHER error
  --    also rolls the seeds back and is reported as sim-error.
  BEGIN
    -- Deterministic anchor bug: oldest bug_reports row that is NOT already a
    -- cluster seed (seed_bug_id is UNIQUE — reusing a real seed would fail).
    SELECT b.id INTO v_bug
    FROM public.bug_reports b
    WHERE NOT EXISTS (SELECT 1 FROM public.bug_clusters c WHERE c.seed_bug_id = b.id)
    ORDER BY b.created_at ASC, b.id ASC
    LIMIT 1;
    IF v_bug IS NULL THEN
      RAISE EXCEPTION 'no non-seed bug_reports row available to anchor the sim';
    END IF;

    -- Two distinct real reporter profiles (FK + UNIQUE(cluster_id, reporter)).
    SELECT p.id INTO v_r1 FROM public.profiles p ORDER BY p.created_at ASC, p.id ASC LIMIT 1;
    SELECT p.id INTO v_r2 FROM public.profiles p ORDER BY p.created_at ASC, p.id ASC OFFSET 1 LIMIT 1;
    IF v_r1 IS NULL OR v_r2 IS NULL THEN
      RAISE EXCEPTION 'need two profiles rows to act as sentinel reporters';
    END IF;

    -- Seed: the sentinel cluster, carrying the fixability verdict the
    -- measurer requires. Sentinel file path ⇒ sentinel category.
    INSERT INTO public.bug_clusters
      (seed_bug_id, member_ids, member_count, sample_description, module_names,
       status, metadata)
    VALUES
      (v_bug, ARRAY[v_bug], 1, 'ZZREGRESS bug-triage regress sim', '{}'::text[],
       'proposed',
       jsonb_build_object('fixability', jsonb_build_object('verdict',
         jsonb_build_object(
           'root_cause', 'ZZREGRESS sentinel root cause (loops-regress sim)',
           'files', jsonb_build_array('zzregress/sim/runner')))))
    RETURNING id INTO v_cluster;

    -- Assert A: zero answered thumbs ⇒ pos exactly 0, confirmed 'none'.
    v_res := public.fn_bug_fix_outcome_record(v_cluster);
    IF NOT COALESCE((v_res ->> 'success')::boolean, false) THEN
      RAISE EXCEPTION 'measure returned success=false: %',
        COALESCE(v_res ->> 'error', 'no error detail');
    END IF;
    v_a      := (v_res ->> 'pos')::numeric;
    v_conf_a := v_res ->> 'reporter_confirmed';

    -- Known +2 delta: exactly two answered 'fixed' thumbs (distinct reporters;
    -- status vocabulary and answer vocabulary are CHECK-constrained).
    INSERT INTO public.bug_fix_feedback_requests
      (cluster_id, bug_id, reporter_user_id, status, answer,
       sent_at, delivered_at, answered_at)
    SELECT v_cluster, v_bug, r.rid, 'answered', 'fixed', now(), now(), now()
    FROM (VALUES (v_r1), (v_r2)) AS r(rid);

    -- Assert B: pos exactly 2, confirmed 'positive'. No reset needed — the
    -- measurer re-derives from the request rows on every call.
    v_res := public.fn_bug_fix_outcome_record(v_cluster);
    IF NOT COALESCE((v_res ->> 'success')::boolean, false) THEN
      RAISE EXCEPTION 'measure (delta) returned success=false: %',
        COALESCE(v_res ->> 'error', 'no error detail');
    END IF;
    v_b      := (v_res ->> 'pos')::numeric;
    v_conf_b := v_res ->> 'reporter_confirmed';

    -- Assert C (added 2026-09-15): one of the two answers was an admin's.
    UPDATE public.bug_fix_feedback_requests
       SET answered_by = 'admin', admin_user_id = v_r2
     WHERE cluster_id = v_cluster AND reporter_user_id = v_r2;
    v_res := public.fn_bug_fix_outcome_record(v_cluster);
    IF NOT COALESCE((v_res ->> 'success')::boolean, false) THEN
      RAISE EXCEPTION 'measure (admin C) returned success=false: %', COALESCE(v_res ->> 'error', 'no error detail');
    END IF;
    v_c_rpos := (v_res ->> 'pos')::numeric;
    v_c_apos := (v_res ->> 'admin_pos')::numeric;
    v_conf_c := v_res ->> 'reporter_confirmed';

    -- Assert D (added 2026-09-15): BOTH answers are admins' -> 'admin', never 'positive'.
    UPDATE public.bug_fix_feedback_requests
       SET answered_by = 'admin', admin_user_id = v_r1
     WHERE cluster_id = v_cluster AND reporter_user_id = v_r1;
    v_res := public.fn_bug_fix_outcome_record(v_cluster);
    IF NOT COALESCE((v_res ->> 'success')::boolean, false) THEN
      RAISE EXCEPTION 'measure (admin D) returned success=false: %', COALESCE(v_res ->> 'error', 'no error detail');
    END IF;
    v_d_rpos := (v_res ->> 'pos')::numeric;
    v_d_apos := (v_res ->> 'admin_pos')::numeric;
    v_conf_d := v_res ->> 'reporter_confirmed';

    -- Roll the seeds back. Everything above un-happens; captures survive.
    RAISE EXCEPTION 'LOOPS_REGRESS_ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'LOOPS_REGRESS_ROLLBACK' THEN
      v_err := SQLERRM;   -- real failure: seeds still rolled back with the block
    END IF;
  END;

  v_verdict := CASE
    WHEN v_err IS NOT NULL THEN 'sim-error: ' || left(v_err, 180)
    WHEN v_a = 0.00 AND v_b = 2.00
         AND v_conf_a = 'none' AND v_conf_b = 'positive'
         -- added 2026-09-15 (existing expectations above are unchanged)
         AND v_c_rpos = 1.00 AND v_c_apos = 1.00 AND v_conf_c = 'positive'
         AND v_d_rpos = 0.00 AND v_d_apos = 2.00 AND v_conf_d = 'admin'
      THEN 'measure-verified'
    ELSE 'sim-failed'
  END;

  -- The only persistent write: the verdict, visible on /admin/loops.
  INSERT INTO public.loop_audits (loop_key, layer, verdict, evidence)
  VALUES ('bug-triage', 'sim', v_verdict,
          jsonb_build_object('no_change', v_a, 'known_delta_plus2', v_b,
                             'confirmed_no_change', v_conf_a,
                             'confirmed_known_delta', v_conf_b,
                             'admin_c', jsonb_build_object('reporter_pos', v_c_rpos, 'admin_pos', v_c_apos, 'confirmed', v_conf_c),
                             'admin_d', jsonb_build_object('reporter_pos', v_d_rpos, 'admin_pos', v_d_apos, 'confirmed', v_conf_d),
                             'runner', 'fn_loops_regress_bug_triage'));

  RETURN QUERY SELECT 'bug-triage'::text, v_verdict, v_a, v_b;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_loops_regress_bug_triage() FROM anon, authenticated, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_loops_regress_bug_triage() TO service_role;

-- ── Ruling 2: fn_bug_cluster_fix_request — new signature + held gate ─────
-- (body from 20260718140000 + CHANGED block; DROP needed to avoid an overload)
DROP FUNCTION IF EXISTS public.fn_bug_cluster_fix_request(uuid);
CREATE OR REPLACE FUNCTION public.fn_bug_cluster_fix_request(p_cluster_id uuid, p_actor_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_meta jsonb;
  v_fx_status text;
  v_single text;
  v_fix_status text;
  v_actor      uuid;
  v_held       text;
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.is_super_admin()
     AND NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not allowed');
  END IF;

  SELECT metadata INTO v_meta FROM public.bug_clusters WHERE id = p_cluster_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'cluster not found');
  END IF;

  -- CHANGED 2026-09-15 (Director ruling): a PERSON — an admin's JWT, or the
  -- Groups-tab route acting for an admin (it passes p_actor_user_id) — may
  -- request a fix only for LOW-risk groups. The bugs desk calls as the
  -- service role with no actor and is not gated. Paths judged: the verdict's
  -- files, else the members' page URLs (path part only). The rule is the
  -- SAME regex as lib/bug-reports/fix-risk.ts (a test asserts equality).
  v_actor := COALESCE(auth.uid(), p_actor_user_id);
  IF v_actor IS NOT NULL THEN
    SELECT p INTO v_held
    FROM (
      SELECT regexp_replace(regexp_replace(x, '^https?://[^/]+', ''), '[?#].*$', '') AS p
      FROM (
        SELECT jsonb_array_elements_text(v_meta -> 'fixability' -> 'verdict' -> 'files') AS x
        WHERE jsonb_typeof(v_meta -> 'fixability' -> 'verdict' -> 'files') = 'array'
          AND jsonb_array_length(v_meta -> 'fixability' -> 'verdict' -> 'files') > 0
        UNION ALL
        SELECT br.page_url
        FROM public.bug_clusters bc
        JOIN public.bug_reports br ON br.id = ANY (bc.member_ids)
        WHERE bc.id = p_cluster_id
          AND br.page_url IS NOT NULL
          AND NOT (jsonb_typeof(v_meta -> 'fixability' -> 'verdict' -> 'files') = 'array'
                   AND jsonb_array_length(v_meta -> 'fixability' -> 'verdict' -> 'files') > 0)
      ) u
    ) paths
    WHERE regexp_replace(p, '([a-z0-9])([A-Z])', '\1 \2', 'g')
          ~* '(^|[^a-z0-9])(fee|fees|billing|bill|invoice|payment|payroll|salary|refund|ledger|scholarship|score|scores|mark|marks|grade|grades|grading|result|results|exam|assessment|transcript|attendance|admission|admissions)([^a-z0-9]|$)|(^|/)supabase/migrations/|\.sql$|(^|/)\.github/workflows/|(^|/)(auth|middleware[^/]*|rls|policies|payment[^/]*|billing[^/]*|checkout[^/]*)(/|$)|(^|/)\.env|(^|/)vercel\.json$|(^|/)CLAUDE\.md$'
    LIMIT 1;
    IF v_held IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', 'held — bugs desk / Director',
        'risk', 'held',
        'held_path', v_held
      );
    END IF;
  END IF;

  v_fx_status := v_meta -> 'fixability' ->> 'status';
  v_single    := v_meta -> 'fixability' -> 'verdict' ->> 'single_fix_feasible';
  v_fix_status := v_meta -> 'fixability' -> 'fix' ->> 'status';

  IF v_fx_status IS DISTINCT FROM 'done' OR v_single IS DISTINCT FROM 'true' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'a completed single-fix fixability verdict is required before auto-fix'
    );
  END IF;

  IF v_fix_status IN ('requested', 'running') THEN
    RETURN jsonb_build_object('success', true, 'status', v_fix_status, 'note', 'already_queued');
  END IF;

  UPDATE public.bug_clusters
  SET metadata = jsonb_set(
        metadata,
        '{fixability,fix}',
        jsonb_build_object(
          'status', 'requested',
          'requested_at', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'requested_by', COALESCE(auth.uid(), p_actor_user_id)   -- CHANGED 2026-09-15
        ),
        true
      ),
      updated_at = now()
  WHERE id = p_cluster_id;

  RETURN jsonb_build_object('success', true, 'status', 'requested');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_bug_cluster_fix_request(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_cluster_fix_request(uuid, uuid) TO authenticated, service_role;

-- ── Ruling 2: fn_bug_cluster_list (body from 20260915073000 + page_url) ──
CREATE OR REPLACE FUNCTION public.fn_bug_cluster_list(p_status text DEFAULT 'proposed'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '15s'
AS $function$
BEGIN
  -- Service role (cron/route) or platform admins.
  IF auth.uid() IS NOT NULL
     AND NOT public.is_super_admin()
     AND NOT public.is_admin() THEN
    RETURN jsonb_build_object('success', false, 'error', 'not allowed');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'clusters', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', bc.id,
        'seed_bug_id', bc.seed_bug_id,
        'member_count', bc.member_count,
        'sample_description', bc.sample_description,
        'module_names', bc.module_names,
        'status', bc.status,
        'origin', bc.origin,                       -- CHANGED 2026-09-15
        'first_seen_at', bc.first_seen_at,
        'last_scan_at', bc.last_scan_at,
        'fixability', bc.metadata -> 'fixability',
        'verify', bc.metadata -> 'verify',
        'members', (
          SELECT jsonb_agg(jsonb_build_object(
            'id', br.id,
            'display_id', br.display_id,
            'description', left(br.description, 200),
            'status', br.status,
            'module_name', br.module_name,
            'page_url', br.page_url,                   -- CHANGED 2026-09-15 (risk tier pre-verdict)
            'created_at', br.created_at,
            'reporter_name', p.full_name
          ) ORDER BY br.created_at ASC)
          FROM public.bug_reports br
          LEFT JOIN public.profiles p ON p.id = br.reporter_user_id
          WHERE br.id = ANY (bc.member_ids)
        )
      ) ORDER BY bc.member_count DESC, bc.last_scan_at DESC)
      FROM public.bug_clusters bc
      WHERE bc.status = COALESCE(NULLIF(p_status, ''), 'proposed')
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_bug_cluster_list(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_bug_cluster_list(text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
