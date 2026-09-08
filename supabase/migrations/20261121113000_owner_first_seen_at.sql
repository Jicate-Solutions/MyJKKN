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
  'rows, and only once (a second visit does not move it). Reset to NULL by '
  'trg_accreditation_metric_owners_first_seen whenever owner_user_id changes, '
  'because the previous holder''s visit says nothing about the new one.';

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
-- ci:allow-secdef-authenticated every signed-in user may mark THEIR OWN
-- assignment seen — that is the entire purpose of the function, and it is the
-- replacement for the Accept click each owner used to press for themselves.
-- Safe because the function takes NO ARGUMENTS and its only statement is scoped
-- `WHERE owner_user_id = auth.uid() AND first_seen_at IS NULL`: there is no
-- parameter to forge and no row outside the caller's own is reachable. The worst
-- a hostile authenticated caller achieves is stamping their own row, which is
-- exactly what calling it honestly does. The gate excludes auth.uid() from its
-- predicate list on purpose (it is dual-use — #3130 called it merely to RECORD
-- an actor), so a genuinely self-scoped function must say so here rather than be
-- matched by accident. Narrowing the grant instead would break the feature: the
-- owner IS the intended caller.
REVOKE EXECUTE ON FUNCTION public.fn_accreditation_mark_owner_seen() FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_accreditation_mark_owner_seen() TO authenticated;

COMMENT ON FUNCTION public.fn_accreditation_mark_owner_seen() IS
  'Stamps first_seen_at on the calling user''s own unseen owner rows and returns '
  'how many were stamped. Write-once per row. Replaces the Accept click as the '
  '"does this person know?" signal (Director, 2026-09-08).';

-- ----------------------------------------------------------------------------
-- first_seen_at belongs to the PERSON, not to the row
-- ----------------------------------------------------------------------------
-- The row outlives its owner: a reassignment UPDATEs owner_user_id in place, so
-- without this trigger a stamp left by the previous holder is silently inherited
-- by the next one. That is not cosmetic. Because assignment_status no longer
-- gates anything (Director, 2026-09-08), first_seen_at is now the ONLY signal
-- for "does this person know?" — and fn_accreditation_mark_owner_seen stamps
-- only `WHERE first_seen_at IS NULL`, so an inherited value can never be
-- corrected by the new owner's real visit. The row would claim, permanently,
-- that somebody opened something they have never seen.
--
-- A TRIGGER rather than a fix in each writer, because there is no single writer:
-- the owners page reassigns through two direct PostgREST upserts, PR #3384 adds
-- fn_accreditation_assign_metric_owner, and the accred_metric_owners_manage
-- policy is FOR ALL. Every one of those paths must clear it, including paths not
-- yet written; only a trigger holds for all of them.
CREATE OR REPLACE FUNCTION public.fn_accreditation_metric_owners_first_seen()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- A brand-new assignment has by definition not been opened. Refusing a
    -- supplied value keeps the column a record of observation, never a claim.
    NEW.first_seen_at := NULL;
  ELSIF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
    NEW.first_seen_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- BEFORE UPDATE without an `OF owner_user_id` column list on purpose: the guard
-- above decides, and a column list would miss nothing today but would silently
-- stop covering a writer that sets the column through a different statement
-- shape. The table holds one row per (institution, body, metric, programme) —
-- 14 rows in production today — so firing on every update costs nothing.
DROP TRIGGER IF EXISTS trg_accreditation_metric_owners_first_seen
  ON public.accreditation_metric_owners;
CREATE TRIGGER trg_accreditation_metric_owners_first_seen
  BEFORE INSERT OR UPDATE ON public.accreditation_metric_owners
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_accreditation_metric_owners_first_seen();

COMMENT ON FUNCTION public.fn_accreditation_metric_owners_first_seen() IS
  'Keeps first_seen_at truthful across ownership changes: NULL on INSERT, and '
  'cleared whenever owner_user_id moves, so the next owner''s own visit is what '
  'stamps it. Not SECURITY DEFINER — it runs as the writer and decides nothing '
  'about authority.';
