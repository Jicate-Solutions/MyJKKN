-- ============================================================================
-- Assignment is ownership; "seen" replaces "accepted" as the signal
-- Director decision, 2026-09-08.
-- ============================================================================
-- Until now an accreditation owner had to click Accept before anything reached
-- them. That gate produced 14 owners and 0 follow-ups over 25 days while
-- protecting nothing: ZERO RLS policies reference assignment_status, so a
-- 'pending' owner already had exactly the access a 'confirmed' one has.
--
-- The click conflated two questions. "Do you consent?" is not ours to ask — the
-- IQAC assigns. "Do you know?" is worth knowing, and a button nobody presses
-- does not answer it.
--
-- So: assignment IS ownership (that half is code, see owner-digest.ts), and this
-- migration adds the honest replacement for the acceptance signal — whether the
-- named person has actually opened their page. Nobody is asked to agree to
-- anything; the fact is recorded by their own visit.
--
-- assignment_status is DELIBERATELY LEFT ALONE. 'declined' still means a person
-- said the work is not theirs and must keep working; 'pending' now reads as
-- "has not opened it yet" rather than as a gate. No backfill: marking today's 14
-- as seen would assert a fact about people we have not observed, which is the
-- exact untruth this column exists to prevent.
-- ============================================================================

ALTER TABLE public.accreditation_metric_owners
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz;

COMMENT ON COLUMN public.accreditation_metric_owners.first_seen_at IS
  'When the named owner first opened their own assignment page. NULL means not '
  'yet opened — which is a fact about the message reaching them, never a '
  'permission: a NULL owner has full access and receives every follow-up. '
  'Written only by fn_accreditation_mark_owner_seen, only for the caller''s own '
  'rows, and only once (a second visit does not move it).';

-- Index the unseen rows only. The whole point is finding who has NOT opened it,
-- that set shrinks over time, and a partial index stays small forever.
CREATE INDEX IF NOT EXISTS accreditation_metric_owners_unseen_idx
  ON public.accreditation_metric_owners (owner_user_id)
  WHERE first_seen_at IS NULL;

-- ----------------------------------------------------------------------------
-- The only writer. Stamps the caller's OWN rows, once.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_accreditation_mark_owner_seen()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_marked integer;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not signed in' USING ERRCODE = '42501';
  END IF;

  -- `owner_user_id = v_caller` is the whole authorisation: a caller can only
  -- ever stamp their own rows, so there is no argument to forge. `IS NULL`
  -- makes it write-once — the first visit is the fact worth keeping, not the
  -- most recent one.
  UPDATE public.accreditation_metric_owners
     SET first_seen_at = now()
   WHERE owner_user_id = v_caller
     AND first_seen_at IS NULL;

  GET DIAGNOSTICS v_marked = ROW_COUNT;
  RETURN v_marked;
END;
$$;

-- Supabase's default ALTER DEFAULT PRIVILEGES grants EXECUTE on every new
-- function to anon, separately from PUBLIC. Without this explicit revoke the
-- function is callable by any unauthenticated client holding the public anon
-- key — which is embedded in every page bundle. (auth.uid() would be NULL and
-- it would raise, but the grant itself must not exist.)
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_mark_owner_seen() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_mark_owner_seen() TO authenticated;

COMMENT ON FUNCTION public.fn_accreditation_mark_owner_seen() IS
  'Stamps first_seen_at on the calling user''s own unseen owner rows and returns '
  'how many were stamped. Write-once per row. Replaces the Accept click as the '
  '"does this person know?" signal (Director, 2026-09-08).';
