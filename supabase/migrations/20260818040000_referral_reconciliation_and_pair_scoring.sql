-- Referral integrity — Registrar reconciliation + team-member/agency pair scoring
-- Created 2026-08-10. FILE ONLY — NOT APPLIED to any database by this PR.
--
-- WHY THIS EXISTS
--   Today an agency referral credit is created and then verified by the same single
--   person about 94% of the time. Self-verification is not a check. The Director's
--   design adds an independent office to the loop: the Registrar — a different desk
--   from admission — meets each agency under the framing "submit your list so we can
--   release your service charges faster", types the agency's OWN list in, and the
--   system compares that list against the credits the platform already holds.
--   Nobody is accused. The mismatch speaks.
--
-- THE THREE BUCKETS
--   agreed                : on both lists — the healthy case.
--   credited_not_claimed  : the platform credits the agency for a learner the agency
--                           itself does NOT claim. This is the padding signal, and it
--                           is the whole reason the loop exists. An agency has every
--                           incentive to claim everything it actually referred, so a
--                           credit the agency will not own is a credit somebody else
--                           created.
--   claimed_not_credited  : the agency claims a learner the platform does not credit.
--                           Usually a genuine miss (or an over-claim) — worth fixing,
--                           but not the integrity finding.
--
-- WHY THE SCORE IS KEYED ON THE PAIR, NOT THE AGENCY
--   Scoring an agency alone misses the shape that actually matters: one insider
--   spreading fabricated credits thinly across many agencies looks clean on every
--   single agency's row. The (team member, agency) pair is the unit that concentrates
--   the signal, so referral_pair_scores is keyed on both.
--
-- DORMANT BY DESIGN
--   Nothing here pays, generates, approves or issues anything. No rate is set, no
--   commission is created, no backfill runs. fn_generate_referral_commissions is
--   deliberately NOT modified — the `frozen` flag on a pair is recorded and displayed
--   but is not yet consumed by any generator; wiring it into payout eligibility is a
--   separate, explicitly-approved change. Freezing is a human act performed through an
--   admin-only function: this migration exposes the evidence, it never acts on it.
--
-- AUTHORITY MODEL (mirrors referral_rate_config, 20260722120000)
--   read  = admission.consultants.commissions.view   (same key that gates the page,
--           so a user never sees the page and is then denied its data)
--   write = admission.consultants.commissions.manage (the Registrar's desk)
--   freeze= admin / super admin only
--
-- Companion UI      : app/(routes)/admission/consultants/reconciliation/page.tsx
-- Companion service : lib/services/admission/referral-reconciliation-service.ts

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Reconciliation session — one per agency per intake year
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_reconciliation_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL REFERENCES public.education_consultants(id),
  academic_year integer NOT NULL,                 -- 2025 = the "2025-26" intake
  conducted_by  uuid REFERENCES public.profiles(id),   -- the team member holding the meeting
  conducted_at  timestamptz NOT NULL DEFAULT now(),
  notes         text,
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'submitted')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_recon_sessions_agency_year
  ON public.referral_reconciliation_sessions (consultant_id, academic_year, conducted_at DESC);

ALTER TABLE public.referral_reconciliation_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_reconciliation_sessions FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_reconciliation_sessions TO authenticated;

DROP POLICY IF EXISTS referral_recon_sessions_read ON public.referral_reconciliation_sessions;
CREATE POLICY referral_recon_sessions_read ON public.referral_reconciliation_sessions
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('admission.consultants.commissions.view')
  );

DROP POLICY IF EXISTS referral_recon_sessions_write ON public.referral_reconciliation_sessions;
CREATE POLICY referral_recon_sessions_write ON public.referral_reconciliation_sessions
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('admission.consultants.commissions.manage')
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('admission.consultants.commissions.manage')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Claims — one row per learner in the reconciled picture
--
--    `source` exists because the three buckets are only a complete partition if
--    the table can also hold the learners the agency did NOT mention. Rows the
--    Registrar types are source='agency'; the reconcile function adds the
--    credited-but-unclaimed learners as source='system' so every bucket is
--    visible, markable and countable in one place. Re-running reconcile replaces
--    only the 'system' rows and never touches what a person typed.
--
--    `evidence_status` is the Registrar's structured mark, separate from the free
--    text in evidence_note, because the pair score has to read it.
--    has_dated_proof means the agency named this learner BEFORE the admission —
--    which is the only evidence that settles a contested credit in the agency's
--    favour.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_reconciliation_claims (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        uuid NOT NULL REFERENCES public.referral_reconciliation_sessions(id) ON DELETE CASCADE,
  claimed_name      text,
  claimed_phone     text,
  matched_learner_id uuid REFERENCES public.learners_profiles(id),
  match_confidence  text,          -- 'phone' | 'name' | 'none' (set by reconcile)
  bucket            text CHECK (bucket IN ('agreed', 'credited_not_claimed', 'claimed_not_credited')),
  evidence_note     text,
  has_dated_proof   boolean NOT NULL DEFAULT false,
  evidence_status   text CHECK (evidence_status IN
                      ('agency_confirmed', 'agency_does_not_recognise', 'agency_has_dated_proof')),
  source            text NOT NULL DEFAULT 'agency' CHECK (source IN ('agency', 'system')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_recon_claims_session
  ON public.referral_reconciliation_claims (session_id, bucket);
CREATE INDEX IF NOT EXISTS idx_referral_recon_claims_learner
  ON public.referral_reconciliation_claims (matched_learner_id)
  WHERE matched_learner_id IS NOT NULL;

ALTER TABLE public.referral_reconciliation_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_reconciliation_claims FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_reconciliation_claims TO authenticated;

DROP POLICY IF EXISTS referral_recon_claims_read ON public.referral_reconciliation_claims;
CREATE POLICY referral_recon_claims_read ON public.referral_reconciliation_claims
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('admission.consultants.commissions.view')
  );

DROP POLICY IF EXISTS referral_recon_claims_write ON public.referral_reconciliation_claims;
CREATE POLICY referral_recon_claims_write ON public.referral_reconciliation_claims
  FOR ALL USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('admission.consultants.commissions.manage')
  )
  WITH CHECK (
    is_super_admin() OR is_admin()
    OR user_has_permission('admission.consultants.commissions.manage')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Pair scores — the memory of the loop, keyed on (team member, agency)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referral_pair_scores (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id    uuid NOT NULL REFERENCES public.profiles(id),
  consultant_id     uuid NOT NULL REFERENCES public.education_consultants(id),
  credits_total     integer NOT NULL DEFAULT 0,
  credits_confirmed integer NOT NULL DEFAULT 0,
  credits_disputed  integer NOT NULL DEFAULT 0,
  risk_level        text NOT NULL DEFAULT 'normal'
                    CHECK (risk_level IN ('normal', 'watch', 'red')),
  frozen            boolean NOT NULL DEFAULT false,
  frozen_at         timestamptz,
  frozen_by         uuid REFERENCES public.profiles(id),   -- who froze; the reason is below
  frozen_reason     text,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT referral_pair_scores_pair_unique UNIQUE (team_member_id, consultant_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_pair_scores_risk
  ON public.referral_pair_scores (risk_level, credits_disputed DESC);

ALTER TABLE public.referral_pair_scores ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_pair_scores FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.referral_pair_scores TO authenticated;

DROP POLICY IF EXISTS referral_pair_scores_read ON public.referral_pair_scores;
CREATE POLICY referral_pair_scores_read ON public.referral_pair_scores
  FOR SELECT USING (
    is_super_admin() OR is_admin()
    OR user_has_permission('admission.consultants.commissions.view')
  );

-- Writing a score is done through the SECURITY DEFINER functions below, which
-- carry their own gate. Direct writes are admin-only: a risk level nobody can
-- hand-edit is the point of keeping the memory.
DROP POLICY IF EXISTS referral_pair_scores_write ON public.referral_pair_scores;
CREATE POLICY referral_pair_scores_write ON public.referral_pair_scores
  FOR ALL USING (is_super_admin() OR is_admin())
  WITH CHECK (is_super_admin() OR is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Reconcile — compare the agency's list against the credits the platform holds
--
--    Matching runs against EVERY learner of that intake year, not only the
--    credited ones: a claim the platform does not credit must still resolve to a
--    real learner, otherwise claimed_not_credited could never be told apart from
--    a name nobody recognises.
--
--    Phone is compared on the last 10 digits so +91 / 0-prefix / spacing noise in
--    a hand-typed agency list does not manufacture a mismatch. A phone hit is a
--    stronger match than a name hit and wins.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_reconcile_referral_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_consultant_id uuid;
  v_year          integer;
  v_summary       jsonb;
BEGIN
  -- SECURITY DEFINER bypasses RLS, so the gate has to be explicit here.
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('admission.consultants.commissions.manage')) THEN
    RAISE EXCEPTION 'Not authorised to reconcile referral sessions';
  END IF;

  SELECT consultant_id, academic_year
    INTO v_consultant_id, v_year
    FROM public.referral_reconciliation_sessions
   WHERE id = p_session_id;

  IF v_consultant_id IS NULL THEN
    RAISE EXCEPTION 'Reconciliation session % not found', p_session_id;
  END IF;

  -- (a) Every learner the platform currently credits to this agency for this year.
  CREATE TEMP TABLE _credited ON COMMIT DROP AS
  SELECT lp.id AS learner_id,
         btrim(coalesce(lp.first_name, '') || ' ' || coalesce(lp.last_name, '')) AS learner_name,
         right(regexp_replace(coalesce(lp.student_mobile, ''), '[^0-9]', '', 'g'), 10) AS phone10
    FROM public.learners_profiles lp
    JOIN public.admission_years ay ON ay.id = lp.admission_year_id AND ay.year = v_year
   WHERE lp.referral_type = 'consultant'
     AND lp.referred_by_id = v_consultant_id;

  -- (b) Every learner of that intake year, for resolving the agency's claims.
  CREATE TEMP TABLE _pool ON COMMIT DROP AS
  SELECT lp.id AS learner_id,
         lower(btrim(coalesce(lp.first_name, '') || ' ' || coalesce(lp.last_name, ''))) AS name_key,
         right(regexp_replace(coalesce(lp.student_mobile, ''), '[^0-9]', '', 'g'), 10) AS phone10
    FROM public.learners_profiles lp
    JOIN public.admission_years ay ON ay.id = lp.admission_year_id AND ay.year = v_year;

  -- (c) Resolve each row the Registrar typed to a learner, phone first then name.
  --     Both keys are required to be UNAMBIGUOUS in the pool. Two learners of the
  --     same intake can share a name, and UPDATE ... FROM would silently pick one
  --     of them at random; an ambiguous key is not a match, it is a question for a
  --     person, so it is left unmatched instead of guessed.
  UPDATE public.referral_reconciliation_claims c
     SET matched_learner_id = m.learner_id,
         match_confidence   = m.confidence,
         updated_at         = now()
    FROM (
      SELECT DISTINCT ON (claim_id) claim_id, learner_id, confidence
        FROM (
          SELECT c2.id AS claim_id, p.learner_id, 'phone'::text AS confidence, 1 AS rank
            FROM public.referral_reconciliation_claims c2
            JOIN _pool p
              ON p.phone10 <> ''
             AND p.phone10 = right(regexp_replace(coalesce(c2.claimed_phone, ''), '[^0-9]', '', 'g'), 10)
           WHERE c2.session_id = p_session_id AND c2.source = 'agency'
             AND (SELECT count(*) FROM _pool q WHERE q.phone10 = p.phone10) = 1
           UNION ALL
          SELECT c3.id, p.learner_id, 'name', 2
            FROM public.referral_reconciliation_claims c3
            JOIN _pool p
              ON p.name_key <> ''
             AND p.name_key = lower(btrim(coalesce(c3.claimed_name, '')))
           WHERE c3.session_id = p_session_id AND c3.source = 'agency'
             AND (SELECT count(*) FROM _pool q WHERE q.name_key = p.name_key) = 1
        ) cand
       ORDER BY claim_id, rank          -- a phone hit always beats a name hit
    ) m
   WHERE c.id = m.claim_id;

  -- A claim that resolved to nothing is recorded as such rather than left blank,
  -- so "not matched" is a stated outcome and not an unfinished run.
  UPDATE public.referral_reconciliation_claims
     SET match_confidence = 'none', updated_at = now()
   WHERE session_id = p_session_id
     AND source = 'agency'
     AND matched_learner_id IS NULL;

  -- (d) Bucket the agency's own rows.
  UPDATE public.referral_reconciliation_claims c
     SET bucket = CASE
                    WHEN c.matched_learner_id IS NOT NULL
                     AND EXISTS (SELECT 1 FROM _credited cr WHERE cr.learner_id = c.matched_learner_id)
                    THEN 'agreed'
                    ELSE 'claimed_not_credited'
                  END,
         updated_at = now()
   WHERE c.session_id = p_session_id
     AND c.source = 'agency';

  -- (e) Rebuild the credited-but-unclaimed rows. Only 'system' rows are replaced;
  --     anything a person typed or marked survives a re-run untouched.
  DELETE FROM public.referral_reconciliation_claims
   WHERE session_id = p_session_id AND source = 'system';

  INSERT INTO public.referral_reconciliation_claims
    (session_id, claimed_name, claimed_phone, matched_learner_id, match_confidence, bucket, source)
  SELECT p_session_id, NULLIF(cr.learner_name, ''), NULLIF(cr.phone10, ''),
         cr.learner_id, 'phone', 'credited_not_claimed', 'system'
    FROM _credited cr
   WHERE NOT EXISTS (
     SELECT 1 FROM public.referral_reconciliation_claims c
      WHERE c.session_id = p_session_id
        AND c.source = 'agency'
        AND c.matched_learner_id = cr.learner_id
   );

  SELECT jsonb_build_object(
    'session_id',           p_session_id,
    'consultant_id',        v_consultant_id,
    'academic_year',        v_year,
    'credited_by_platform', (SELECT count(*) FROM _credited),
    'claimed_by_agency',    (SELECT count(*) FROM public.referral_reconciliation_claims
                              WHERE session_id = p_session_id AND source = 'agency'),
    'agreed',               (SELECT count(*) FROM public.referral_reconciliation_claims
                              WHERE session_id = p_session_id AND bucket = 'agreed'),
    'credited_not_claimed', (SELECT count(*) FROM public.referral_reconciliation_claims
                              WHERE session_id = p_session_id AND bucket = 'credited_not_claimed'),
    'claimed_not_credited', (SELECT count(*) FROM public.referral_reconciliation_claims
                              WHERE session_id = p_session_id AND bucket = 'claimed_not_credited'),
    'unmatched_claims',     (SELECT count(*) FROM public.referral_reconciliation_claims
                              WHERE session_id = p_session_id AND source = 'agency'
                                AND matched_learner_id IS NULL)
  ) INTO v_summary;

  RETURN v_summary;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_reconcile_referral_session(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_reconcile_referral_session(uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_reconcile_referral_session(uuid) IS
  'Compares one agency''s own submitted list against the credits the platform holds for that agency and intake year, writes the three-way bucket onto every claim row, and returns a jsonb count summary. Writes nothing outside the reconciliation tables — it never creates, approves or pays a commission.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Pair score — recompute from reconciliation outcomes
--
--    A credit is attributed to the team member who verified the attribution, and
--    where nothing was verified, to whoever created the learner record. That
--    fallback matters: a credit nobody verified is exactly the shape this loop is
--    looking for, so it must not fall out of the count.
--
--    NEVER auto-freezes. Raising a risk level is a measurement; stopping money is
--    a decision, and a decision needs a person's name on it.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_recompute_referral_pair_score(
  p_team_member_id uuid,
  p_consultant_id  uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total     integer := 0;
  v_confirmed integer := 0;
  v_disputed  integer := 0;
  v_risk      text;
BEGIN
  IF NOT (is_super_admin() OR is_admin()
          OR user_has_permission('admission.consultants.commissions.manage')) THEN
    RAISE EXCEPTION 'Not authorised to recompute referral pair scores';
  END IF;

  WITH pair_credits AS (
    -- every credit this agency holds that traces back to this team member
    SELECT lp.id AS learner_id
      FROM public.learners_profiles lp
      LEFT JOIN LATERAL (
        SELECT cla.verified_by
          FROM public.consultant_lead_attributions cla
         WHERE cla.learner_profile_id = lp.id
           AND cla.consultant_id = p_consultant_id
           AND cla.verified_by IS NOT NULL
         ORDER BY cla.verified_at DESC NULLS LAST
         LIMIT 1
      ) v ON true
     WHERE lp.referral_type = 'consultant'
       AND lp.referred_by_id = p_consultant_id
       AND COALESCE(v.verified_by, lp.created_by) = p_team_member_id
  ),
  outcomes AS (
    -- The most recent reconciliation verdict recorded for each of those credits.
    -- One LATERAL, not two scalar subqueries: bucket and evidence_status must come
    -- from the SAME claim row, and two independent ORDER BY ... LIMIT 1 can break a
    -- tie differently and pair a bucket with another row's evidence.
    SELECT pc.learner_id, v.bucket, v.evidence_status
      FROM pair_credits pc
      LEFT JOIN LATERAL (
        SELECT c.bucket, c.evidence_status
          FROM public.referral_reconciliation_claims c
          JOIN public.referral_reconciliation_sessions s ON s.id = c.session_id
         WHERE c.matched_learner_id = pc.learner_id
           AND s.consultant_id = p_consultant_id
         ORDER BY s.conducted_at DESC, c.updated_at DESC, c.id DESC
         LIMIT 1
      ) v ON true
  )
  SELECT count(*),
         count(*) FILTER (
           WHERE bucket = 'agreed'
             AND evidence_status IS DISTINCT FROM 'agency_does_not_recognise'),
         count(*) FILTER (
           WHERE bucket = 'credited_not_claimed'
              OR evidence_status = 'agency_does_not_recognise')
    INTO v_total, v_confirmed, v_disputed
    FROM outcomes;

  -- Thresholds are deliberately blunt and readable. 'red' also fires on the ratio
  -- so a small agency with 3 credits and 2 disputed is not hidden behind a count.
  v_risk := CASE
              WHEN v_disputed >= 4 THEN 'red'
              WHEN v_total > 0 AND v_disputed::numeric > (v_total::numeric / 3.0) THEN 'red'
              WHEN v_disputed >= 2 THEN 'watch'
              ELSE 'normal'
            END;

  INSERT INTO public.referral_pair_scores AS s
    (team_member_id, consultant_id, credits_total, credits_confirmed, credits_disputed,
     risk_level, updated_at)
  VALUES
    (p_team_member_id, p_consultant_id, v_total, v_confirmed, v_disputed, v_risk, now())
  ON CONFLICT ON CONSTRAINT referral_pair_scores_pair_unique DO UPDATE
    SET credits_total     = EXCLUDED.credits_total,
        credits_confirmed = EXCLUDED.credits_confirmed,
        credits_disputed  = EXCLUDED.credits_disputed,
        risk_level        = EXCLUDED.risk_level,
        updated_at        = now();
    -- frozen / frozen_at / frozen_by / frozen_reason are intentionally absent from
    -- this SET list. Recomputing evidence must never lift or apply a human freeze.

  RETURN jsonb_build_object(
    'team_member_id',    p_team_member_id,
    'consultant_id',     p_consultant_id,
    'credits_total',     v_total,
    'credits_confirmed', v_confirmed,
    'credits_disputed',  v_disputed,
    'risk_level',        v_risk
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_recompute_referral_pair_score(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_recompute_referral_pair_score(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.fn_recompute_referral_pair_score(uuid, uuid) IS
  'Recomputes the (team member, agency) pair score from reconciliation outcomes and sets risk_level normal/watch/red. Never freezes and never lifts a freeze — freezing is a human act performed through fn_set_referral_pair_freeze.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Freeze / unfreeze — the human act, admin-only, always with a reason
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_set_referral_pair_freeze(
  p_team_member_id uuid,
  p_consultant_id  uuid,
  p_frozen         boolean,
  p_reason         text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_row public.referral_pair_scores;
BEGIN
  IF NOT (is_super_admin() OR is_admin()) THEN
    RAISE EXCEPTION 'Only an administrator can freeze or unfreeze a referral pair';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required to freeze or unfreeze a referral pair';
  END IF;

  INSERT INTO public.referral_pair_scores AS s
    (team_member_id, consultant_id, frozen, frozen_at, frozen_by, frozen_reason, updated_at)
  VALUES
    (p_team_member_id, p_consultant_id, p_frozen,
     CASE WHEN p_frozen THEN now() ELSE NULL END,
     auth.uid(), btrim(p_reason), now())
  ON CONFLICT ON CONSTRAINT referral_pair_scores_pair_unique DO UPDATE
    SET frozen        = EXCLUDED.frozen,
        frozen_at     = EXCLUDED.frozen_at,
        frozen_by     = EXCLUDED.frozen_by,
        frozen_reason = EXCLUDED.frozen_reason,
        updated_at    = now()
  RETURNING s.* INTO v_row;

  RETURN jsonb_build_object(
    'team_member_id', v_row.team_member_id,
    'consultant_id',  v_row.consultant_id,
    'frozen',         v_row.frozen,
    'frozen_at',      v_row.frozen_at,
    'frozen_by',      v_row.frozen_by,
    'frozen_reason',  v_row.frozen_reason,
    'risk_level',     v_row.risk_level
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_set_referral_pair_freeze(uuid, uuid, boolean, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_set_referral_pair_freeze(uuid, uuid, boolean, text) TO authenticated;

COMMENT ON FUNCTION public.fn_set_referral_pair_freeze(uuid, uuid, boolean, text) IS
  'Records an administrator freezing or unfreezing a (team member, agency) pair, with who and why. The flag is recorded and displayed only — no generator or payout path reads it yet.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Table + column comments
-- ─────────────────────────────────────────────────────────────────────────────
COMMENT ON TABLE public.referral_reconciliation_sessions IS
  'One Registrar reconciliation meeting with one agency for one intake year. The Registrar is a different office from the admission desk, which is what makes the check independent.';
COMMENT ON TABLE public.referral_reconciliation_claims IS
  'One row per learner in a reconciliation: what the agency claimed, what the platform holds, which of the three buckets it falls in, and the evidence the Registrar recorded.';
COMMENT ON COLUMN public.referral_reconciliation_claims.source IS
  'agency = typed in from the agency''s own list. system = added by fn_reconcile_referral_session to represent a learner the platform credits but the agency did not claim.';
COMMENT ON COLUMN public.referral_reconciliation_claims.has_dated_proof IS
  'True when the agency can show it named this learner BEFORE the admission — the only evidence that settles a contested credit in the agency''s favour.';
COMMENT ON TABLE public.referral_pair_scores IS
  'Running score for a (team member, agency) pair. Keyed on the pair because an insider spreading fabricated credits across many agencies looks clean on every single agency row.';
COMMENT ON COLUMN public.referral_pair_scores.frozen IS
  'Set only by fn_set_referral_pair_freeze. Recorded and displayed; no generator or payout path consumes it yet.';
