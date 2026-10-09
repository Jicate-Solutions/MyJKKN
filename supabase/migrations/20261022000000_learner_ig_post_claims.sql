-- Updated: 2026-10-03 - Credit a learner for an Instagram post about JKKN.
--
-- Director's rulings, 2026-10-01 22:45 (interview):
--   1. Build ALL THREE crediting paths, not one: the learner pastes their post
--      link and the department confirms it; automatic from Instagram's own
--      collaboration data; a staff member links a post to a learner. `origin`
--      below carries all three from day one so the third needs no second
--      migration, even though NOTHING writes 'auto_collab' yet.
--   2. Award on BOTH post count AND saves+shares+comments, side by side, with a
--      HUMAN picking winners. Nothing here computes a winner.
--   3. Under-18 learners are included. He was told India's data protection law
--      treats children's data differently and ruled include, on the basis that
--      existing MyJKKN consent covers it.
--
-- WHAT THIS DELIBERATELY DOES NOT STORE: an Instagram handle or username, for
-- anybody. A claim is learner <-> a post we ALREADY hold. Paths 1 and 3 need no
-- handle at all, so under ruling 3 the exposure stays at "which of our posts was
-- this learner's", not "here is a minor's social identity". The automatic path
-- would need a handle; that is a separate migration and a separate sign-off.
--
-- WHY THE POST MUST ALREADY BE OURS. ig_post_id is a real foreign key into
-- ig_posts, so an arbitrary external permalink cannot be filed here. A link we
-- do not hold has no engagement numbers attached, which would give a learner a
-- post count with no response figure and quietly corrupt ruling 2's comparison.
-- The API rejects an unmatched link with the reason instead.
--
-- OPERATING LIMIT, measured 2026-10-03 and NOT fixed by this migration: whether
-- Instagram returns a collaboration post on the DEPARTMENT's media edge is
-- unverified. We request no collaborator field (DEFAULT_MEDIA_FIELDS in
-- lib/instagram/api-client.ts) and ig_posts has no column for one. The metrics
-- poller stamps account_id from whichever account it is polling and filters
-- nothing by handle, so IF Meta returns such posts they are already stored. For
-- the numbers to exist the DEPARTMENT should post and invite the learner, not
-- the reverse. One live call settles it, once the Meta token is re-pasted.

CREATE TABLE IF NOT EXISTS public.ig_learner_post_claims (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  learner_id     UUID NOT NULL REFERENCES public.learners_profiles(id) ON DELETE CASCADE,
  ig_post_id     UUID NOT NULL REFERENCES public.ig_posts(id)          ON DELETE CASCADE,
  institution_id UUID NOT NULL REFERENCES public.institutions(id),
  origin         TEXT NOT NULL
                   CHECK (origin IN ('learner_link', 'staff_link', 'auto_collab')),
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'confirmed', 'rejected')),
  claimed_by     UUID REFERENCES public.profiles(id) DEFAULT auth.uid(),
  claimed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by    UUID REFERENCES public.profiles(id),
  reviewed_at    TIMESTAMPTZ,
  review_note    TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_ig_learner_post_claims UNIQUE (learner_id, ig_post_id),
  -- A decided claim must say who decided it. Without this a row could read
  -- 'confirmed' with nobody accountable, which is exactly what an award needs
  -- to be able to defend later.
  CONSTRAINT ck_ig_learner_post_claims_reviewed
    CHECK (status = 'pending' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);

COMMENT ON TABLE public.ig_learner_post_claims IS
  'A claim that one learner is behind one Instagram post we already hold. One row per (learner, post). It is a claim, not a measurement: every row starts pending and a person confirms it, because a learner appearing in or near a post is not evidence they made it. Stores NO Instagram handle for anybody — see the migration header for why that matters under the 2026-10-01 under-18 ruling.';
COMMENT ON COLUMN public.ig_learner_post_claims.origin IS
  'How the claim arrived: learner_link (the learner pasted the post link), staff_link (a staff member attributed it), auto_collab (read from Instagram collaboration data). All three exist from day one per the Director''s ruling; nothing writes auto_collab yet, and whether Instagram exposes collaborators at all is unverified.';
COMMENT ON COLUMN public.ig_learner_post_claims.institution_id IS
  'Stamped from the LEARNER by trg_ig_learner_post_claims_scope, never sent by the caller. Taken from the learner and not from the posting account on purpose: a central handle may carry a learner''s work, and who may review the claim follows the learner''s institution.';
COMMENT ON COLUMN public.ig_learner_post_claims.status IS
  'pending until a person decides. A rejected row is KEPT rather than deleted so a learner cannot re-file the same claim endlessly and a reviewer can see it was already judged.';

CREATE INDEX IF NOT EXISTS idx_ig_learner_post_claims_learner
  ON public.ig_learner_post_claims (learner_id);
CREATE INDEX IF NOT EXISTS idx_ig_learner_post_claims_post
  ON public.ig_learner_post_claims (ig_post_id);
CREATE INDEX IF NOT EXISTS idx_ig_learner_post_claims_institution
  ON public.ig_learner_post_claims (institution_id);
-- The reviewer's queue: pending rows for an institution, oldest first.
CREATE INDEX IF NOT EXISTS idx_ig_learner_post_claims_pending
  ON public.ig_learner_post_claims (institution_id, claimed_at)
  WHERE status = 'pending';

REVOKE ALL ON public.ig_learner_post_claims FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ig_learner_post_claims TO authenticated;
ALTER TABLE public.ig_learner_post_claims ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- Tenant stamp. Without this the RLS below is decorative: a caller could send
-- any institution_id they are allowed to see and file a claim under it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ig_learner_post_claim_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_learner_institution UUID;
BEGIN
  SELECT lp.institution_id INTO v_learner_institution
    FROM public.learners_profiles lp WHERE lp.id = NEW.learner_id;

  IF v_learner_institution IS NULL THEN
    RAISE EXCEPTION 'ig_learner_post_claims: learner % does not exist, or has no institution', NEW.learner_id
      USING ERRCODE = '23503';
  END IF;

  NEW.institution_id := v_learner_institution;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Trigger-only: EXECUTE is checked at CREATE TRIGGER time, not per firing.
REVOKE EXECUTE ON FUNCTION public.fn_ig_learner_post_claim_scope() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_ig_learner_post_claims_scope ON public.ig_learner_post_claims;
CREATE TRIGGER trg_ig_learner_post_claims_scope
  BEFORE INSERT OR UPDATE ON public.ig_learner_post_claims
  FOR EACH ROW EXECUTE FUNCTION public.fn_ig_learner_post_claim_scope();

-- ---------------------------------------------------------------------------
-- RLS. No role name is named anywhere; everything rides permission keys.
-- ---------------------------------------------------------------------------
-- A learner reads and files their OWN claims. The SELECT policy must admit the
-- learner's own rows or path 1 breaks outright: PostgREST's .insert().select()
-- is INSERT ... RETURNING, and PostgreSQL attaches SELECT policies as WITH CHECK
-- OPTIONS that RAISE 42501 and roll the insert back rather than filtering it.
DROP POLICY IF EXISTS ig_learner_post_claims_select ON public.ig_learner_post_claims;
CREATE POLICY ig_learner_post_claims_select ON public.ig_learner_post_claims
  FOR SELECT
  USING (
    public.is_super_admin()
    OR public.is_admin()
    OR learner_id = (SELECT p.learner_id FROM public.profiles p WHERE p.id = auth.uid())
    OR (public.user_has_permission('social.learner_credit.view')
        AND public.role_has_institution_access(institution_id))
  );

-- Filing: a learner for themselves, or a staff member holding the review key
-- (that is path 3, where somebody else attributes the post).
DROP POLICY IF EXISTS ig_learner_post_claims_insert ON public.ig_learner_post_claims;
CREATE POLICY ig_learner_post_claims_insert ON public.ig_learner_post_claims
  FOR INSERT
  WITH CHECK (
    public.is_super_admin()
    OR public.is_admin()
    OR learner_id = (SELECT p.learner_id FROM public.profiles p WHERE p.id = auth.uid())
    OR (public.user_has_permission('social.learner_credit.review')
        AND public.role_has_institution_access(institution_id))
  );

-- Deciding a claim is a staff act only. A learner must never be able to confirm
-- their own, which is why the learner clause is absent here and not merely
-- narrowed: RLS grants a whole ROW, so a policy that let a learner update their
-- own row would let them set status = 'confirmed' on it.
DROP POLICY IF EXISTS ig_learner_post_claims_update ON public.ig_learner_post_claims;
CREATE POLICY ig_learner_post_claims_update ON public.ig_learner_post_claims
  FOR UPDATE
  USING (
    public.is_super_admin()
    OR public.is_admin()
    OR (public.user_has_permission('social.learner_credit.review')
        AND public.role_has_institution_access(institution_id))
  )
  WITH CHECK (
    public.is_super_admin()
    OR public.is_admin()
    OR (public.user_has_permission('social.learner_credit.review')
        AND public.role_has_institution_access(institution_id))
  );

-- A learner may withdraw a claim they have filed while it is still pending.
-- Once decided it is the reviewer's record, not theirs.
DROP POLICY IF EXISTS ig_learner_post_claims_delete ON public.ig_learner_post_claims;
CREATE POLICY ig_learner_post_claims_delete ON public.ig_learner_post_claims
  FOR DELETE
  USING (
    public.is_super_admin()
    OR public.is_admin()
    OR (status = 'pending'
        AND learner_id = (SELECT p.learner_id FROM public.profiles p WHERE p.id = auth.uid()))
    OR (public.user_has_permission('social.learner_credit.review')
        AND public.role_has_institution_access(institution_id))
  );
