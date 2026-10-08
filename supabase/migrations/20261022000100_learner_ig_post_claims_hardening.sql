-- Updated: 2026-10-07 - Close the holes a multi-agent review found in 20261022000000.
--
-- PR #4193 created ig_learner_post_claims and merged on 2026-10-07 13:13 IST over
-- a "request changes" verdict; its migration had been live since 2026-10-03.
-- The review's findings that live in the DATABASE are fixed here. The table held
-- 0 rows when this was written, so no claim was ever filed through the holes.
--
--  #1 CRITICAL  A learner could INSERT straight through PostgREST with
--               status='confirmed', any reviewed_by, any origin and any
--               claimed_by — putting an unreviewed claim on the award board.
--               The old UPDATE policy excluded learners, but INSERT lets a
--               caller set every column at once. RLS grants a whole ROW.
--               → guard trigger forces every new claim to pending, unreviewed,
--                 filed by the caller; the INSERT policy ties origin to who may
--                 use it (auto_collab is service-role only).
--  #5 MEDIUM    The SELECT policy admitted only the .view key, so a holder of
--               just .review got a false 404 on every decision (PATCH is
--               UPDATE ... RETURNING) and 42501 on staff_link inserts.
--               → SELECT also admits the review key.
--  #6 MEDIUM    The UPDATE policy covered the whole row. A reviewer could name
--               someone else as decider, rewrite learner/post/origin, move a
--               claim back to pending, or confirm a claim they filed themselves.
--               → guard pins every non-decision column, stamps reviewed_by from
--                 the caller, refuses self-review, and makes a decision final.
--  #7 MEDIUM    A reviewer could hard-delete a decided claim, destroying the
--               audit trail and letting a rejected learner re-file.
--               → only pending claims may be deleted (super admin excepted).
--  #9 LOW       Two reviewers deciding at once: last write silently won.
--               → a decided claim cannot be decided again (guard raises).
--  #3 HIGH      (route, but needs a DB object) ig_post_metrics averages ~627
--               snapshots per post, so an unbounded read of two posts passes
--               PostgREST's 1,000-row cap and the board silently used a random
--               subset. → v_ig_post_latest_metrics returns exactly one row per
--               post, walking the existing (post_id, snapshot_at DESC) index.

-- ---------------------------------------------------------------------------
-- 1. Guard: pin what a caller must never choose. Runs before the existing
--    tenant-stamp trigger (triggers fire in name order: _guard < _scope), so
--    the institution is stamped from the PINNED learner_id.
--    SECURITY DEFINER so the one lookup it makes (is the caller the credited
--    learner?) reads the caller's profile whatever profiles' own RLS says.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ig_learner_post_claim_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- A claim is born pending and unreviewed, filed by whoever is calling.
    -- Anything the caller sent for these is discarded, not trusted.
    NEW.status      := 'pending';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.review_note := NULL;
    -- A signed-in caller is always the filer. Only a service-role write (no
    -- auth.uid(), e.g. a future auto_collab job) may name the filer itself.
    NEW.claimed_by  := coalesce(auth.uid(), NEW.claimed_by);
    NEW.claimed_at  := now();
    NEW.created_at  := now();
    RETURN NEW;
  END IF;

  -- UPDATE: a claim is decided once, by someone other than its filer, and only
  -- the decision fields may move.
  IF OLD.status <> 'pending' THEN
    RAISE EXCEPTION 'ig_learner_post_claims: this claim was already %; a decision is final', OLD.status
      USING ERRCODE = '23514';
  END IF;
  IF NEW.status IS NULL OR NEW.status NOT IN ('confirmed', 'rejected') THEN
    RAISE EXCEPTION 'ig_learner_post_claims: a claim can only be confirmed or rejected'
      USING ERRCODE = '23514';
  END IF;

  NEW.id          := OLD.id;
  NEW.learner_id  := OLD.learner_id;
  NEW.institution_id := OLD.institution_id;
  NEW.ig_post_id  := OLD.ig_post_id;
  NEW.origin      := OLD.origin;
  NEW.claimed_by  := OLD.claimed_by;
  NEW.claimed_at  := OLD.claimed_at;
  NEW.created_at  := OLD.created_at;
  -- The decider is whoever is calling. A service-role call has no auth.uid(),
  -- so it must name the decider itself; the table CHECK still requires one.
  NEW.reviewed_by := coalesce(auth.uid(), NEW.reviewed_by);
  NEW.reviewed_at := now();

  IF NEW.reviewed_by IS NOT NULL AND NEW.reviewed_by = OLD.claimed_by THEN
    RAISE EXCEPTION 'ig_learner_post_claims: the person who filed a claim cannot also decide it'
      USING ERRCODE = '42501';
  END IF;
  -- Nor may the learner the claim credits decide it, even holding the review key.
  -- Matched on the stamped decider, so a service-role write naming them is refused too.
  IF EXISTS (SELECT 1 FROM public.profiles p
              WHERE p.id = NEW.reviewed_by AND p.learner_id = OLD.learner_id) THEN
    RAISE EXCEPTION 'ig_learner_post_claims: a learner cannot decide a claim about themselves'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger-only. EXECUTE is checked at CREATE TRIGGER time, not per firing.
REVOKE EXECUTE ON FUNCTION public.fn_ig_learner_post_claim_guard() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_ig_learner_post_claims_guard ON public.ig_learner_post_claims;
CREATE TRIGGER trg_ig_learner_post_claims_guard
  BEFORE INSERT OR UPDATE ON public.ig_learner_post_claims
  FOR EACH ROW EXECUTE FUNCTION public.fn_ig_learner_post_claim_guard();

-- ---------------------------------------------------------------------------
-- 2. INSERT: who may use which origin. auto_collab is absent on purpose — only
--    the service role (which bypasses RLS) may ever write it.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS ig_learner_post_claims_insert ON public.ig_learner_post_claims;
CREATE POLICY ig_learner_post_claims_insert ON public.ig_learner_post_claims
  FOR INSERT
  WITH CHECK (
    origin IN ('learner_link', 'staff_link')
    AND (
      public.is_super_admin()
      OR public.is_admin()
      OR (origin = 'learner_link'
          AND learner_id = (SELECT p.learner_id FROM public.profiles p WHERE p.id = auth.uid()))
      OR (origin = 'staff_link'
          AND public.user_has_permission('social.learner_credit.review')
          AND public.role_has_institution_access(institution_id))
    )
  );

-- ---------------------------------------------------------------------------
-- 3. SELECT: a reviewer must be able to see what they decide.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS ig_learner_post_claims_select ON public.ig_learner_post_claims;
CREATE POLICY ig_learner_post_claims_select ON public.ig_learner_post_claims
  FOR SELECT
  USING (
    public.is_super_admin()
    OR public.is_admin()
    OR learner_id = (SELECT p.learner_id FROM public.profiles p WHERE p.id = auth.uid())
    OR ((public.user_has_permission('social.learner_credit.view')
         OR public.user_has_permission('social.learner_credit.review'))
        AND public.role_has_institution_access(institution_id))
  );

-- ---------------------------------------------------------------------------
-- 4. DELETE: only a pending claim may be withdrawn. A decided claim is the
--    audit record; super admin keeps an escape hatch for genuine clean-up.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS ig_learner_post_claims_delete ON public.ig_learner_post_claims;
CREATE POLICY ig_learner_post_claims_delete ON public.ig_learner_post_claims
  FOR DELETE
  USING (
    public.is_super_admin()
    OR (status = 'pending' AND (
          public.is_admin()
          OR learner_id = (SELECT p.learner_id FROM public.profiles p WHERE p.id = auth.uid())
          OR (public.user_has_permission('social.learner_credit.review')
              AND public.role_has_institution_access(institution_id))))
  );

-- ---------------------------------------------------------------------------
-- 5. One row per post: the latest metric snapshot. A qual on post_id is pushed
--    below DISTINCT ON (it filters only the DISTINCT key), so
--    `WHERE post_id IN (...)` walks idx_ig_post_metrics_post_time.
--    Read by the learner-credit route through the service-role client only.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_ig_post_latest_metrics
WITH (security_invoker = on) AS
SELECT DISTINCT ON (m.post_id)
       m.post_id, m.snapshot_at, m.saves, m.shares, m.comments, m.likes, m.reach
  FROM public.ig_post_metrics m
 WHERE m.snapshot_at IS NOT NULL
 ORDER BY m.post_id, m.snapshot_at DESC, m.id DESC;

COMMENT ON VIEW public.v_ig_post_latest_metrics IS
  'Latest ig_post_metrics snapshot per post, exactly one row each. Exists because posts average ~627 snapshots (2026-10-07) and an unbounded read of a few posts passes PostgREST''s 1,000-row cap, silently returning a random subset. Service-role only.';

REVOKE ALL ON public.v_ig_post_latest_metrics FROM anon, authenticated, PUBLIC;
GRANT SELECT ON public.v_ig_post_latest_metrics TO service_role;
