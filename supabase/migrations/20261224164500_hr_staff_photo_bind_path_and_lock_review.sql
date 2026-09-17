-- ============================================================================
-- STAFF PHOTOGRAPH — BIND THE PATH TO THE SUBMITTER, AND LOCK THE DECISION
-- Created: 2026-09-17. Fixes BUG-006144 and BUG-006146 in 20261223091500,
-- which is APPLIED IN PRODUCTION — hence a new migration rather than an edit
-- to that file, which would change nothing in the live database.
--
-- ── BUG-006144 — THE ONE THAT MATTERS ───────────────────────────────────────
-- fn_submit_my_staff_photo derives WHO you are from auth.uid() and then trusts
-- you to say WHICH FILE is yours:
--
--     VALUES (v_staff_id, v_inst_id, p_storage_path, 'pending', v_uid)
--                                    ^^^^^^^^^^^^^^ verbatim, unchecked
--
-- The API route builds that path from the resolved staff id, so through the
-- screen it is always correct. But the function carries EXECUTE for
-- `authenticated` and PostgREST exposes it, so the route is not the only
-- caller. A signed-in person can call it directly naming somebody else's
-- object in the submissions bucket.
--
-- What that buys an attacker, end to end: the submission row is attributed to
-- THEM (staff_id comes from auth.uid(), which is right), but the picture the
-- reviewer opens is the other person's face. Approve it and the review route
-- copies that image into the attacker's own public folder and writes it to
-- THEIR staff.profile_picture. The URL check in the review function does not
-- catch this — it asserts the approved URL sits under the attacker's own id,
-- and after the copy it does.
--
-- HONEST ON SEVERITY: exploiting it needs the exact key, which is
-- `<staff uuid>/<epoch millis>.jpg`, so it is not guessable and this is not a
-- one-click hole. It is still an argument that should never have been an
-- argument. The fix costs three lines and removes the class.
--
-- NOTE this does NOT fix the deeper thing already documented on the review
-- screen: a central reviewer cannot tell whose face they are looking at, so
-- somebody photographing a picture of a colleague defeats the whole flow and
-- always could. That is a liveness problem, not a path problem.
--
-- ── BUG-006146 — two reviewers, one photograph ──────────────────────────────
-- fn_review_staff_photo_submission read the status and then wrote, with no
-- lock between:
--     SELECT ... INTO v_status ... WHERE s.id = p_submission_id;
--     IF v_status <> 'pending' THEN RAISE ...
-- Two concurrent reviewers both read 'pending', both pass, both write. With a
-- single central HR team working one queue (standing decision 2026-09-16) that
-- is not hypothetical. FOR UPDATE makes the second wait and then correctly
-- fail with "already approved" — and the route's existing rollback removes the
-- public file it had staged, which is why no other change is needed here.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. A durable home for a cleanup that did not happen.
--
-- BUG-006145's stated harm was "a photograph stayed in the bucket with nothing
-- recording it". Reporting it in a console line and a response field nothing
-- reads does not fix that — it moves the silence. This column is the record:
-- one key per row, swept or retried by a human who can actually find it.
-- ---------------------------------------------------------------------------
ALTER TABLE public.hr_staff_photo_submissions
  ADD COLUMN IF NOT EXISTS orphaned_object text;

COMMENT ON COLUMN public.hr_staff_photo_submissions.orphaned_object IS
  'A storage key this submission left behind because a delete failed. NOT NULL means a photograph of a person is still sitting in a bucket and somebody should remove it.';

-- ---------------------------------------------------------------------------
-- 1. Submit — the path must be under the caller's own folder.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_submit_my_staff_photo(p_storage_path text)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_staff_id uuid;
  v_inst_id  uuid;
  v_id       uuid;
  v_prefix   text;
  v_matches  integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  IF p_storage_path IS NULL OR btrim(p_storage_path) = '' THEN
    RAISE EXCEPTION 'A photograph is required' USING ERRCODE = '22023';
  END IF;

  -- The join column is profile_id, not user_id: staff has no user_id column,
  -- and fn_my_hr_context resolves the same way. Deliberately does NOT consider
  -- employment_categories.included_in_hr — somebody who takes no part in HR
  -- still carries an identity card and still needs a photograph.
  -- Deterministic, and loud when it cannot be. The original LIMIT 1 with no
  -- ORDER BY meant a person holding active staff rows in two institutions got
  -- an arbitrary one — so their submission could land in the wrong tenant's
  -- review queue, and the path prefix would bind to whichever row happened to
  -- win. Refusing is right: nobody can guess which college they meant.
  SELECT count(*) INTO v_matches
    FROM public.staff s
   WHERE s.profile_id = v_uid
     AND COALESCE(s.is_active, true);

  IF v_matches > 1 THEN
    RAISE EXCEPTION 'This login is attached to more than one active staff record; HR must resolve that before a photograph can be submitted'
      USING ERRCODE = '22023';
  END IF;

  SELECT s.id, s.institution_id
    INTO v_staff_id, v_inst_id
    FROM public.staff s
   WHERE s.profile_id = v_uid
     AND COALESCE(s.is_active, true);

  -- FOUND, not a NULL check on the variables: SELECT ... INTO leaves every
  -- target NULL when no row matches.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active staff record for this login' USING ERRCODE = 'P0002';
  END IF;

  -- ── THE FIX (BUG-006144) ─────────────────────────────────────────────────
  -- Resolved from the session, never from the argument. left()/IS DISTINCT
  -- FROM rather than LIKE so no character in the key is read as a pattern.
  v_prefix := v_staff_id::text || '/';
  IF left(p_storage_path, length(v_prefix)) IS DISTINCT FROM v_prefix THEN
    RAISE EXCEPTION 'A photograph must be stored under your own folder'
      USING ERRCODE = '42501';
  END IF;
  -- Storage keys are literal strings rather than filesystem paths, so '..' is
  -- not traversal here. Refused anyway: it has no legitimate use in a key this
  -- application generates, and it costs nothing to say so.
  IF position('..' in p_storage_path) > 0 THEN
    RAISE EXCEPTION 'Invalid photograph path' USING ERRCODE = '22023';
  END IF;

  -- Re-submitting supersedes the pending one rather than queueing a second.
  UPDATE public.hr_staff_photo_submissions
     SET status      = 'rejected',
         review_note = 'Superseded by a newer photograph from the same person',
         reviewed_at = now()
   WHERE staff_id = v_staff_id
     AND status   = 'pending';

  INSERT INTO public.hr_staff_photo_submissions
    (staff_id, institution_id, storage_path, status, submitted_by)
  VALUES
    (v_staff_id, v_inst_id, p_storage_path, 'pending', v_uid)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ci:allow-secdef-authenticated every signed-in team member may submit THEIR OWN photograph — the function takes no person as an argument, resolves the staff row from auth.uid(), hard-codes status 'pending', and (since this migration) refuses any storage key not under that resolved staff id. The only thing a caller can do is queue their own picture for review.
REVOKE EXECUTE ON FUNCTION public.fn_submit_my_staff_photo(text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_submit_my_staff_photo(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Review — take the row lock before deciding.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_review_staff_photo_submission(
  p_submission_id uuid,
  p_approve       boolean,
  p_public_url    text DEFAULT NULL,
  p_note          text DEFAULT NULL
)
RETURNS TABLE (submission_id uuid, staff_id uuid, new_status text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_staff   uuid;
  v_inst    uuid;
  v_status  text;
  v_path    text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  -- ── THE FIX (BUG-006146) ─────────────────────────────────────────────────
  -- FOR UPDATE. A second reviewer deciding the same photograph now waits here
  -- and then reads the status this transaction wrote, instead of racing past a
  -- check that was true when they read it.
  -- Read WITHOUT the lock first, purely to authorise. Taking FOR UPDATE before
  -- the permission check would let any signed-in caller hold a lock on an
  -- arbitrary submission id until their 42501 fires.
  SELECT s.institution_id INTO v_inst
    FROM public.hr_staff_photo_submissions s
   WHERE s.id = p_submission_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such submission' USING ERRCODE = 'P0002';
  END IF;

  -- Re-checked here rather than relying on the caller having passed a route
  -- guard: this function is SECURITY DEFINER and would otherwise be a way
  -- around the table's own RLS.
  IF NOT (
        public.is_super_admin()
     OR public.is_admin()
     OR ( public.user_has_permission('hr.staff_photo.review')
          AND public.role_has_institution_access(v_inst) )
  ) THEN
    RAISE EXCEPTION 'Not allowed to review photographs for this institution'
      USING ERRCODE = '42501';
  END IF;

  -- Authorised — now take the row and re-read under the lock. Everything
  -- decided from here on is decided on locked state.
  SELECT s.staff_id, s.status, s.storage_path
    INTO v_staff, v_status, v_path
    FROM public.hr_staff_photo_submissions s
   WHERE s.id = p_submission_id
   FOR UPDATE;

  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'This photograph has already been %', v_status
      USING ERRCODE = '22023';
  END IF;

  -- ── BUG-006144, THE HALF THE SUBMIT-SIDE FIX DOES NOT COVER ──────────────
  -- Binding at submit protects rows created from now on. Rows already sitting
  -- 'pending' were created by the shipped, vulnerable function and can still
  -- carry somebody else's key. Approving one would do exactly what the fix
  -- claims to prevent, so the binding is re-asserted HERE, at the moment it
  -- actually matters, against the locked row.
  --
  -- REFUSES ONLY — it deliberately does NOT mark the row rejected here. An
  -- earlier draft did, and the rehearsal caught it: RAISE rolls the whole
  -- function back, so the UPDATE never survived and the row read 'pending'
  -- afterwards anyway. Marking the backlog is section 3's job, which runs as
  -- its own statement at apply time. This check is defence in depth for a row
  -- that somehow becomes poisoned afterwards, and leaving it pending-and-
  -- unapprovable is a correct end state: visible, harmless, never printable.
  IF left(v_path, length(v_staff::text) + 1) IS DISTINCT FROM v_staff::text || '/'
     OR position('..' in v_path) > 0 THEN
    RAISE EXCEPTION 'This submission points at a photograph that is not this person''s'
      USING ERRCODE = '42501';
  END IF;

  IF p_approve THEN
    -- Bind the stored value to the bucket the renderer already reads and to
    -- this person's own folder.
    -- MATCHED WHOLE, not searched. Two rounds of this check were wrong in the
    -- same way, so it is worth naming both:
    --
    --   v1 (shipped)  position(v_staff in url) — the uuid ANYWHERE, so
    --                 .../staff-images/<someone-else>/<v_staff>.jpg passed.
    --   v2            position('/storage/.../staff-images/<v_staff>/' in url)
    --                 — the right FOLDER, but still anywhere in the string and
    --                 with no host pinned, so
    --                 https://attacker.example/storage/v1/object/public/staff-images/<v_staff>/x.jpg
    --                 passed and staff.profile_picture would point at a
    --                 photograph somebody else controls and can change after
    --                 approval.
    --
    -- Both failures are the same mistake: asking whether the expected text is
    -- PRESENT rather than whether the value IS the expected shape. Anchored
    -- top and tail now — scheme, a Supabase host, the bucket, this person's
    -- folder, and exactly one filename segment with no query or fragment.
    --
    -- RESIDUAL, stated rather than hidden: the host pattern accepts any
    -- *.supabase.co, so a reviewer could still name an object in a DIFFERENT
    -- Supabase project. Closing that needs the project's own base URL, which
    -- SQL cannot read from the environment. It requires reviewer privilege,
    -- which today means super admin, who can write this column directly
    -- anyway — so it buys an attacker nothing they do not already have.
    IF p_public_url IS NULL
       OR p_public_url !~ ('^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/staff-images/'
                           || v_staff::text || '/[^/?#]+$') THEN
      RAISE EXCEPTION 'Approved photograph must be a staff-images URL for this person'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.staff
       SET profile_picture = p_public_url
     WHERE id = v_staff;

    UPDATE public.hr_staff_photo_submissions
       SET status = 'approved', reviewed_by = v_uid, reviewed_at = now(),
           approved_url = p_public_url, review_note = p_note
     WHERE id = p_submission_id;

    RETURN QUERY SELECT p_submission_id, v_staff, 'approved'::text;
  ELSE
    UPDATE public.hr_staff_photo_submissions
       SET status = 'rejected', reviewed_by = v_uid, reviewed_at = now(),
           review_note = p_note
     WHERE id = p_submission_id;

    RETURN QUERY SELECT p_submission_id, v_staff, 'rejected'::text;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_review_staff_photo_submission(uuid, boolean, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_review_staff_photo_submission(uuid, boolean, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. The rows already in the queue.
--
-- Everything above protects submissions made from now on. This is the backlog:
-- rows created by the shipped, vulnerable function that point at a key outside
-- their own person's folder. There should be none — the feature went live
-- today and the attack needs an unguessable key — but "should be none" is a
-- prediction, and the whole point of BUG-006144 is that the prediction was
-- wrong once already. Refused rather than deleted, so the evidence survives
-- and somebody can look at what happened.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_poisoned integer;
BEGIN
  UPDATE public.hr_staff_photo_submissions
     SET status      = 'rejected',
         reviewed_at = now(),
         review_note = 'Refused automatically (BUG-006144): the stored photograph is not under this person''s own folder.'
   WHERE status = 'pending'
     AND ( left(storage_path, length(staff_id::text) + 1) IS DISTINCT FROM staff_id::text || '/'
           OR position('..' in storage_path) > 0 );
  GET DIAGNOSTICS v_poisoned = ROW_COUNT;
  RAISE NOTICE 'BUG-006144 backlog: % pending submission(s) refused as not belonging to their own person', v_poisoned;
END $$;

COMMIT;
