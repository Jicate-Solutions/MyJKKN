-- ============================================================================
-- battery-lane-a.sql — Lane A (CARRE recognition pipe) post-apply battery
-- ============================================================================
-- Run AFTER applying 20260725123000_carre_recognition_pipe_wiring.sql.
-- Single BEGIN .. (NO COMMIT) transaction: every write below rolls back when
-- the session ends. Results come from the final SELECT * FROM _r.
-- Covers: trigger allow paths, idempotency (re-fire), anon/PUBLIC locks,
-- RLS deny (direct claim), RLS allow/deny on private rows per identity.
-- ============================================================================
BEGIN;

CREATE TEMP TABLE _r (test text, pass boolean, detail text);
GRANT ALL ON _r TO authenticated;

-- ────────────────────────────────────────────────────────────────────────
-- r1/r2: system fire — synthetic gold build → first_prompt + gold_prompt;
--        re-fire does not duplicate. (Runs as the connection role: system writer.)
-- ────────────────────────────────────────────────────────────────────────
DO $do$
DECLARE
  v_learner uuid; v_build uuid; v_first int; v_gold int;
BEGIN
  SELECT lp.id INTO v_learner
  FROM learners_profiles lp
  WHERE NOT EXISTS (SELECT 1 FROM ai_pulse_prompt_builds b WHERE b.learner_id = lp.id)
    AND NOT EXISTS (SELECT 1 FROM campus_living_recognition r
                    WHERE r.learner_id = lp.id AND r.event_type = 'first_prompt')
  LIMIT 1;

  INSERT INTO ai_pulse_prompt_builds
    (learner_id, parts, assembled_prompt, grade, grade_status, graded_at)
  VALUES
    (v_learner, '{}'::jsonb, 'battery synthetic prompt',
     '{"has_role":true,"has_context":true,"has_task":true,"has_format":true,"score":95}'::jsonb,
     'graded', now())
  RETURNING id INTO v_build;

  SELECT count(*) INTO v_first FROM campus_living_recognition
   WHERE learner_id = v_learner AND module = 'academic' AND event_type = 'first_prompt';
  SELECT count(*) INTO v_gold FROM campus_living_recognition
   WHERE module = 'academic' AND event_type = 'gold_prompt' AND ref->>'build_id' = v_build::text;

  INSERT INTO _r VALUES ('r1_gold_build_fires',
    v_first = 1 AND v_gold = 1, format('first=%s gold=%s', v_first, v_gold));

  UPDATE ai_pulse_prompt_builds SET grade = grade, updated_at = now() WHERE id = v_build;
  UPDATE ai_pulse_prompt_builds SET grade_status = 'graded' WHERE id = v_build;

  SELECT count(*) INTO v_first FROM campus_living_recognition
   WHERE learner_id = v_learner AND module = 'academic' AND event_type = 'first_prompt';
  SELECT count(*) INTO v_gold FROM campus_living_recognition
   WHERE module = 'academic' AND event_type = 'gold_prompt' AND ref->>'build_id' = v_build::text;

  INSERT INTO _r VALUES ('r2_refire_no_dup',
    v_first = 1 AND v_gold = 1, format('first=%s gold=%s', v_first, v_gold));
END $do$;

-- ────────────────────────────────────────────────────────────────────────
-- Identity picks for the RLS tests: owner (has a profiles row, non-admin,
-- no vote yet on the chosen suggestion) + a different non-admin learner.
-- ────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE _ids (owner_profile uuid, owner_learner uuid, other_profile uuid, other_learner uuid, sugg uuid, pub_row uuid);

INSERT INTO _ids (owner_profile, owner_learner, sugg)
SELECT p.id, p.learner_id, s.id
FROM profiles p
CROSS JOIN LATERAL (SELECT id FROM scf_ai_suggestions LIMIT 1) s
WHERE p.learner_id IS NOT NULL
  AND COALESCE(p.is_super_admin, false) = false
  AND p.role NOT IN ('admin', 'super_admin', 'administrator')
  AND NOT EXISTS (SELECT 1 FROM scf_note_resolution_votes v
                  WHERE v.suggestion_id = s.id AND v.learner_id = p.learner_id)
LIMIT 1;

UPDATE _ids SET (other_profile, other_learner) = (
  SELECT p.id, p.learner_id FROM profiles p
  WHERE p.learner_id IS NOT NULL
    AND p.learner_id <> _ids.owner_learner
    AND COALESCE(p.is_super_admin, false) = false
    AND p.role NOT IN ('admin', 'super_admin', 'administrator')
  LIMIT 1
);

-- ────────────────────────────────────────────────────────────────────────
-- r3/r4: system fire — synthetic SCF 'better' vote by the OWNER learner →
--        PRIVATE academic row; re-fire does not duplicate.
-- ────────────────────────────────────────────────────────────────────────
DO $do$
DECLARE v_n int; v_priv boolean; i record;
BEGIN
  SELECT * INTO i FROM _ids;

  INSERT INTO scf_note_resolution_votes (suggestion_id, learner_id, vote)
  VALUES (i.sugg, i.owner_learner, 'better');

  SELECT count(*), bool_and(NOT is_public) INTO v_n, v_priv
  FROM campus_living_recognition
  WHERE learner_id = i.owner_learner AND event_type = 'voice_confirmed_better'
    AND ref->>'suggestion_id' = i.sugg::text;

  INSERT INTO _r VALUES ('r3_scf_vote_fires_private',
    v_n = 1 AND v_priv, format('rows=%s private=%s', v_n, v_priv));

  UPDATE scf_note_resolution_votes SET vote = 'better', updated_at = now()
  WHERE suggestion_id = i.sugg AND learner_id = i.owner_learner;

  SELECT count(*) INTO v_n
  FROM campus_living_recognition
  WHERE learner_id = i.owner_learner AND event_type = 'voice_confirmed_better'
    AND ref->>'suggestion_id' = i.sugg::text;

  INSERT INTO _r VALUES ('r4_scf_refire_no_dup', v_n = 1, 'rows=' || v_n);
END $do$;

-- Seed one PUBLIC probe row for the visibility tests (system write, rolls back).
WITH ins AS (
  INSERT INTO campus_living_recognition (learner_id, module, event_type, title, ref, is_public)
  SELECT owner_learner, 'academic', 'battery_public_probe', 'Battery public visibility probe', '{}'::jsonb, true
  FROM _ids
  RETURNING id
)
UPDATE _ids SET pub_row = (SELECT id FROM ins);

-- ────────────────────────────────────────────────────────────────────────
-- r5: anon EXECUTE revoked on both trigger functions
-- ────────────────────────────────────────────────────────────────────────
INSERT INTO _r
SELECT 'r5_anon_locked',
       NOT has_function_privilege('anon', 'public.fn_recognition_from_prompt_build()', 'EXECUTE')
   AND NOT has_function_privilege('anon', 'public.fn_recognition_from_scf_resolution_vote()', 'EXECUTE'),
       'anon EXECUTE=false on both';

-- ────────────────────────────────────────────────────────────────────────
-- r6: DENY — an authenticated learner cannot claim recognition directly
--     (RLS write is admin-only; recognition is conferred, never claimed).
-- ────────────────────────────────────────────────────────────────────────
DO $do$
DECLARE i record; v_pass boolean := false; v_detail text := 'insert unexpectedly succeeded';
BEGIN
  SELECT * INTO i FROM _ids;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', i.owner_profile, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO campus_living_recognition (learner_id, module, event_type, title, ref, is_public)
    VALUES (i.owner_learner, 'academic', 'self_claim_attempt', 'should never land', '{}'::jsonb, true);
  EXCEPTION WHEN others THEN
    v_pass := true; v_detail := 'blocked: ' || SQLSTATE;
  END;
  RESET ROLE;
  INSERT INTO _r VALUES ('r6_deny_direct_claim', v_pass, v_detail);
END $do$;

-- ────────────────────────────────────────────────────────────────────────
-- r7: ALLOW — owner sees their own PRIVATE voice_confirmed_better row.
-- r8: DENY  — a different learner cannot see that private row.
-- r9: ALLOW — the public probe row is visible to the other learner.
-- ────────────────────────────────────────────────────────────────────────
DO $do$
DECLARE i record; v_n int;
BEGIN
  SELECT * INTO i FROM _ids;

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', i.owner_profile, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM campus_living_recognition
  WHERE learner_id = i.owner_learner AND event_type = 'voice_confirmed_better'
    AND ref->>'suggestion_id' = i.sugg::text;
  RESET ROLE;
  INSERT INTO _r VALUES ('r7_owner_sees_private', v_n = 1, 'rows=' || v_n);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', i.other_profile, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM campus_living_recognition
  WHERE learner_id = i.owner_learner AND event_type = 'voice_confirmed_better'
    AND ref->>'suggestion_id' = i.sugg::text;
  RESET ROLE;
  INSERT INTO _r VALUES ('r8_other_denied_private', v_n = 0, 'rows=' || v_n);

  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', i.other_profile, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO v_n FROM campus_living_recognition WHERE id = i.pub_row;
  RESET ROLE;
  INSERT INTO _r VALUES ('r9_other_sees_public', v_n = 1, 'rows=' || v_n);
END $do$;

-- ────────────────────────────────────────────────────────────────────────
-- r10: DENY — authenticated cannot write the source table directly
--      (ai_pulse_prompt_builds is locked; writes flow through RPCs only).
-- ────────────────────────────────────────────────────────────────────────
DO $do$
DECLARE i record; v_pass boolean := false; v_detail text := 'insert unexpectedly succeeded';
BEGIN
  SELECT * INTO i FROM _ids;
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', i.owner_profile, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO ai_pulse_prompt_builds (learner_id, parts, assembled_prompt, grade_status)
    VALUES (i.owner_learner, '{}'::jsonb, 'direct write attempt', 'pending');
  EXCEPTION WHEN others THEN
    v_pass := true; v_detail := 'blocked: ' || SQLSTATE;
  END;
  RESET ROLE;
  INSERT INTO _r VALUES ('r10_deny_source_direct_write', v_pass, v_detail);
END $do$;

SELECT * FROM _r ORDER BY test;
-- NO COMMIT — the coordinator's session close rolls every write above back.
