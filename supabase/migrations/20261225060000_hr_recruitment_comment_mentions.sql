-- ─── Recruitment discussion — tag (mention) colleagues on a candidate ──────
-- 2026-09-24
--
-- The candidate discussion thread (hr_recruitment_candidate_comments) is where
-- screening notes, negotiation context and follow-ups are written. Until now a
-- remark that needed somebody specific to act — "the Principal has to confirm
-- the department before we fix the package" — reached that person only if they
-- happened to open the candidate. This module sends no notifications at all,
-- so "happened to open it" was the entire delivery mechanism.
--
-- ── Tagging here does NOT grant access ─────────────────────────────────────
-- This is the DIFFERENCE from the two existing tag tables
-- (event_review_comment_mentions, resource_reservation_comment_mentions),
-- where a tag admits an outsider to a deliberately hidden thread. A
-- recruitment candidate's discussion is already readable by everyone who can
-- read the candidate, so a tag here carries no authority — it only says "this
-- is addressed to you" and sends the alert. Tagging someone who cannot read
-- the candidate tells them about a page they will not be able to open, so the
-- API filters the list to people who can.
--
-- Because no access is granted, the read policy simply defers to the parent
-- comment: under RLS the EXISTS below only finds comments the caller may
-- already read, so this table can never widen what anyone sees.
--
-- ── Who may tag ────────────────────────────────────────────────────────────
-- Only the AUTHOR of the comment. Enforced here, not in the API route: the
-- route inserts through the caller's own session, so this policy is the
-- authority.
--
-- No BEGIN/COMMIT: applied through exec_sql (scripts/apply-migration-file.mjs).
-- Idempotent.

-- ── 1. Table ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hr_recruitment_comment_mentions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id         uuid NOT NULL
                       REFERENCES public.hr_recruitment_candidate_comments(id) ON DELETE CASCADE,
  -- Denormalised from the comment so the alert can name the candidate without
  -- a join. Never trusted from the client: the guard trigger overwrites it.
  candidate_id       uuid NOT NULL
                       REFERENCES public.hr_recruitment_candidates(id) ON DELETE CASCADE,
  mentioned_user_id  uuid NOT NULL
                       CONSTRAINT hr_recruitment_comment_mentions_mentioned_user_id_fkey
                       REFERENCES public.profiles(id) ON DELETE CASCADE,
  mentioned_by       uuid NOT NULL DEFAULT auth.uid()
                       CONSTRAINT hr_recruitment_comment_mentions_mentioned_by_fkey
                       REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- When the tagged person's alert was last delivered. NULL = tagged but not
  -- yet told; grantAndNotifyTags finishes it. Service role writes only.
  notified_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_recruitment_comment_mentions_once UNIQUE (comment_id, mentioned_user_id)
);

CREATE INDEX IF NOT EXISTS idx_hr_recruitment_comment_mentions_comment
  ON public.hr_recruitment_comment_mentions (comment_id);
CREATE INDEX IF NOT EXISTS idx_hr_recruitment_comment_mentions_user
  ON public.hr_recruitment_comment_mentions (mentioned_user_id);

COMMENT ON TABLE public.hr_recruitment_comment_mentions IS
  'People tagged on a recruitment candidate discussion comment. Unlike the event/reservation tag tables this grants NO access — the thread is already readable by anyone who can read the candidate. A row here only addresses the comment to that person and drives their notification.';
COMMENT ON COLUMN public.hr_recruitment_comment_mentions.notified_at IS
  'When the tagged person''s alert was last delivered. NULL = tagged but not yet told; the next tag request for that person finishes it. Set by the service role only.';

-- ── 2. Guard trigger — candidate_id always mirrors the parent comment ───────
CREATE OR REPLACE FUNCTION public.fn_hr_recruitment_mention_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate_id uuid;
BEGIN
  SELECT c.candidate_id INTO v_candidate_id
    FROM public.hr_recruitment_candidate_comments c
   WHERE c.id = NEW.comment_id;

  IF v_candidate_id IS NULL THEN
    RAISE EXCEPTION 'Comment % does not exist', NEW.comment_id
      USING ERRCODE = '23503';
  END IF;

  -- The client's value is never trusted; it is replaced, not validated.
  NEW.candidate_id := v_candidate_id;

  -- A person may not be tagged unless they could open the page the alert
  -- points at. profiles.role carries the learner-side roles; a candidate's
  -- discussion is staff-only.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = NEW.mentioned_user_id
       AND COALESCE(p.is_active, true)
       AND COALESCE(p.role, '') NOT IN ('student', 'course_participant', 'parent', '')
  ) THEN
    RAISE EXCEPTION 'Only active staff accounts can be tagged on a recruitment comment'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hr_recruitment_mention_guard
  ON public.hr_recruitment_comment_mentions;
CREATE TRIGGER trg_hr_recruitment_mention_guard
  BEFORE INSERT OR UPDATE ON public.hr_recruitment_comment_mentions
  FOR EACH ROW EXECUTE FUNCTION public.fn_hr_recruitment_mention_guard();

-- ── 3. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.hr_recruitment_comment_mentions ENABLE ROW LEVEL SECURITY;

-- READ: defers entirely to the parent comment. Under RLS this EXISTS only
-- finds comments the caller may already read, so the tag list can never be
-- wider than the thread it belongs to.
DROP POLICY IF EXISTS hr_recruitment_comment_mentions_read
  ON public.hr_recruitment_comment_mentions;
CREATE POLICY hr_recruitment_comment_mentions_read
  ON public.hr_recruitment_comment_mentions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hr_recruitment_candidate_comments c
       WHERE c.id = hr_recruitment_comment_mentions.comment_id
    )
  );

-- INSERT: the comment's author, and only while they can still read it.
DROP POLICY IF EXISTS hr_recruitment_comment_mentions_insert
  ON public.hr_recruitment_comment_mentions;
CREATE POLICY hr_recruitment_comment_mentions_insert
  ON public.hr_recruitment_comment_mentions
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hr_recruitment_candidate_comments c
       WHERE c.id = hr_recruitment_comment_mentions.comment_id
         AND c.commenter_id = auth.uid()
    )
  );

-- DELETE (untag): the author of the comment, or a super admin.
DROP POLICY IF EXISTS hr_recruitment_comment_mentions_delete
  ON public.hr_recruitment_comment_mentions;
CREATE POLICY hr_recruitment_comment_mentions_delete
  ON public.hr_recruitment_comment_mentions
  FOR DELETE TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.hr_recruitment_candidate_comments c
       WHERE c.id = hr_recruitment_comment_mentions.comment_id
         AND c.commenter_id = auth.uid()
    )
  );

-- No UPDATE policy for authenticated: notified_at is the service role's alone.

GRANT SELECT, INSERT, DELETE ON public.hr_recruitment_comment_mentions TO authenticated;
