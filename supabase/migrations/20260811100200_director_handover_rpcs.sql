-- ============================================================================
-- Director's Desk — the write path.
--
-- Date: 2026-08-04
-- Spec: specs/director-desk/SPEC.md
-- Depends on: 20260811100000, 20260811100100
--
-- WHY EVERY WRITE IS AN RPC AND NOT AN RLS POLICY
-- -----------------------------------------------
-- RLS restricts ROWS and cannot restrict COLUMNS. A permissive
-- "UPDATE ... USING (grantee_user_id = auth.uid())" policy would let a receiver
-- accept their handover AND rewrite every other column of it — including
-- permission_keys (grant themselves more), due_date (never expire), and
-- grantee_user_id (hand it to someone else, defeating decision 5).
-- Column-level GRANTs do not help: `authenticated` already holds table-wide
-- UPDATE from Supabase's default privileges, so narrowing by column narrows
-- nothing (feedback_grant_select_to_authenticated_is_a_noop_after_default_privileges).
--
-- Each function below writes exactly the columns it names and offers no path to
-- any other. Every one takes the ROW ID and derives the actor from auth.uid() —
-- never a caller-supplied user id, which would be an IDOR
-- (feedback_secdef_caller_supplied_user_id_is_an_idor).
--
-- Not-yours and does-not-exist raise the SAME error, or the function becomes an
-- existence probe for other people's handovers.
-- ============================================================================

-- ============================================================================
-- 1. WHO MAY HAND OVER
--
-- Deliberately narrow: the `director` role, or a super admin. The permission key
-- itself is walled (fn_handover_key_is_blocked blocks 'director.handover.%'), so
-- the ONLY way to obtain it is a deliberate trip to Role Management. That is the
-- one place this system does not shortcut, and it is the right one.
-- ============================================================================

-- This answers "may this person hand over AT ALL". It deliberately does NOT
-- answer "may they hand over to THAT person" — that is a tenant question, and it
-- is asked separately in fn_director_handover_create, which requires granter and
-- grantee to sit in the same institution. Keeping the two apart matters: a
-- `director` role held at one college must not be a licence over another, and an
-- earlier revision of this pair had no institution comparison anywhere, so a
-- director at college A could mint a live key for a user at college B and every
-- RLS policy gated on user_has_permission() then returned college A's rows to them.
CREATE OR REPLACE FUNCTION public.fn_can_hand_over()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.is_super_admin(), false)
      OR EXISTS (
           SELECT 1 FROM public.profiles p
           WHERE p.id = auth.uid()
             AND COALESCE(p.is_active, true) = true
             AND (
               p.role = 'director'
               OR EXISTS (
                 SELECT 1 FROM public.user_roles ur
                 JOIN public.custom_roles cr ON cr.id = ur.role_id
                 WHERE ur.user_id = p.id
                   AND (cr.role_key = 'director'
                        OR (cr.permissions->>'director.handover.create')::boolean = true)
               )
               -- LEGACY PATH. user_has_permission() has always had three sources,
               -- and profiles.role -> custom_roles.permissions is the third. A
               -- user whose director rights come from their profiles.role custom
               -- role (rather than a user_roles assignment) was refused here while
               -- every other permission check on the platform said yes — the
               -- "works for some people" shape this repo has hit before.
               OR EXISTS (
                 SELECT 1 FROM public.custom_roles cr
                 WHERE cr.role_key = p.role
                   AND (cr.permissions->>'director.handover.create')::boolean = true
               )
             )
         );
$$;

-- ============================================================================
-- 2. CREATE A HANDOVER
--
-- The four walls are enforced HERE, at grant time, and again in
-- fn_handover_grants_key at check time. Belt and braces is deliberate: a wall
-- added after a grant exists must retroactively close it, not grandfather it.
--
-- Order of checks, and why it is this order:
--   authorised → required fields → due date → level is a real level →
--   grantee is a real active person → not yourself →
--   SAME INSTITUTION (multi-tenant, CLAUDE.md #8) →
--   NORMALISE the keys (btrim once, before anything reads them) →
--   walls → access level covers every key.
-- Normalising before the walls is load-bearing, not tidiness: a leading space
-- defeats every LIKE-prefix wall. Checking the level before the INSERT is what
-- turns "created a row that grants nothing" into a message naming the keys.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_director_handover_create(
  p_route           text,
  p_title           text,
  p_permission_keys text[],
  p_grantee_user_id uuid,
  p_due_date        date,
  p_access_level    text DEFAULT 'update',
  p_note            text DEFAULT NULL
)
RETURNS public.director_handovers
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row        public.director_handovers;
  v_blocked    text[];
  v_wrong_lvl  text[];
  v_clean      text[];
  v_inst       uuid;
  v_grantee_inst uuid;
  v_is_super   boolean;
BEGIN
  IF NOT public.fn_can_hand_over() THEN
    RAISE EXCEPTION 'Not authorised to hand over work'
      USING ERRCODE = '42501';
  END IF;

  v_is_super := COALESCE(public.is_super_admin(), false);

  IF p_grantee_user_id IS NULL OR p_due_date IS NULL
     OR p_route IS NULL OR btrim(COALESCE(p_title,'')) = '' THEN
    RAISE EXCEPTION 'route, title, grantee and due date are all required'
      USING ERRCODE = '22023';
  END IF;

  IF p_due_date < (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'Due date is in the past — the handover would be dead on arrival'
      USING ERRCODE = '22023';
  END IF;

  IF p_access_level NOT IN ('watch','update','full') THEN
    RAISE EXCEPTION 'access_level must be watch, update or full'
      USING ERRCODE = '22023';
  END IF;

  -- The receiver must be a real, active person. Handing work to a deactivated
  -- profile creates a row that can never be accepted and never chased.
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_grantee_user_id AND COALESCE(is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'That person does not have an active account'
      USING ERRCODE = '22023';
  END IF;

  IF p_grantee_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot hand work to yourself'
      USING ERRCODE = '22023';
  END IF;

  -- ---- MULTI-TENANT: same college, or nothing ------------------------------
  -- CLAUDE.md #8. Without this, a `director` at ANY institution could mint a live
  -- key for a user at ANY other institution, and every RLS policy on the platform
  -- that routes through user_has_permission() would then hand that user rows from
  -- a college they have no relationship with. Super admin is exempt (they already
  -- hold every institution) and is the ONLY exemption.
  SELECT institution_id INTO v_grantee_inst
  FROM public.profiles WHERE id = p_grantee_user_id;

  SELECT institution_id INTO v_inst
  FROM public.profiles WHERE id = auth.uid();

  IF NOT v_is_super THEN
    -- IS DISTINCT FROM, so two NULLs match and one NULL never silently passes.
    IF v_inst IS DISTINCT FROM v_grantee_inst THEN
      RAISE EXCEPTION 'You can only hand work to someone at your own institution'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    -- A super admin often has no institution of their own. Record the receiver's,
    -- so the row still names a real tenant and the check-time institution test in
    -- fn_handover_grants_key has something to compare against.
    v_inst := COALESCE(v_inst, v_grantee_inst);
  END IF;

  -- ---- NORMALISE FIRST, THEN CHECK -----------------------------------------
  -- btrim ONCE, up front, and use the trimmed values for the walls, the level
  -- test, the dedupe AND the stored array. Checking raw and storing raw let
  -- ' accreditation.naac.narrative.manage' slip past every LIKE-prefix wall
  -- (the leading space breaks 'prefix%'), get stored with its space, and then
  -- never match at check time — a key that is simultaneously unwalled and
  -- useless. Checking trimmed but storing raw would be worse: it would pass the
  -- walls on the trimmed form and store the untrimmed one.
  SELECT array_agg(DISTINCT btrim(k)) INTO v_clean
  FROM unnest(COALESCE(p_permission_keys, '{}'::text[])) AS k
  WHERE btrim(k) <> '';

  IF v_clean IS NULL OR cardinality(v_clean) = 0 THEN
    RAISE EXCEPTION 'This page has no permission key to hand over'
      USING ERRCODE = '22023';
  END IF;

  -- ---- THE WALLS -----------------------------------------------------------
  -- Reported as a NAMED list rather than a silent filter. Silently dropping the
  -- blocked keys would hand over a page that then half-works, which is the worst
  -- possible outcome: the Director believes he delegated it, the receiver opens
  -- it and finds dead buttons, and nobody knows why.
  SELECT array_agg(k) INTO v_blocked
  FROM unnest(v_clean) AS k
  WHERE public.fn_handover_key_is_blocked(k);

  IF v_blocked IS NOT NULL AND cardinality(v_blocked) > 0 THEN
    RAISE EXCEPTION
      'These cannot be handed over to anyone: %. They are permanently walled (access control, salary and team-member files, exam marks, or money movement).',
      array_to_string(v_blocked, ', ')
      USING ERRCODE = '42501';
  END IF;

  -- ---- THE ACCESS LEVEL ----------------------------------------------------
  -- Same named-list treatment, and for the same reason. This check was missing
  -- entirely, and its absence broke the flagship case: access_level defaults to
  -- 'update', 'update' excludes `.manage`, so handing over
  -- accreditation.naac.narrative.manage — the exact key this feature was built
  -- for — was accepted, stored, reported as created, and granted NOTHING. No
  -- error, no warning, a row that looks right and does nothing. The check-time
  -- test in fn_handover_grants_key was silently dropping it, and silence is the
  -- one thing this system cannot afford at grant time.
  SELECT array_agg(k) INTO v_wrong_lvl
  FROM unnest(v_clean) AS k
  WHERE NOT public.fn_handover_key_allowed_at_level(k, p_access_level);

  IF v_wrong_lvl IS NOT NULL AND cardinality(v_wrong_lvl) > 0 THEN
    RAISE EXCEPTION
      'These need a higher access level than "%": %. Hand this over at "full" — at "watch" the receiver may only view, and "update" deliberately excludes create, delete and manage.',
      p_access_level, array_to_string(v_wrong_lvl, ', ')
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.director_handovers (
    route, title, note, permission_keys, access_level,
    grantee_user_id, granted_by, institution_id, due_date
  ) VALUES (
    p_route, btrim(p_title), NULLIF(btrim(COALESCE(p_note,'')), ''), v_clean, p_access_level,
    p_grantee_user_id, auth.uid(), v_inst, p_due_date
  )
  RETURNING * INTO v_row;

  INSERT INTO public.director_handover_audit (handover_id, action, actor_user_id, detail)
  VALUES (v_row.id, 'created', auth.uid(),
          jsonb_build_object('route', p_route, 'keys', v_clean,
                             'access_level', p_access_level,
                             'grantee', p_grantee_user_id, 'due_date', p_due_date));

  RETURN v_row;
END;
$$;

-- ============================================================================
-- 3. THE RECEIVER ANSWERS (decision 8 — accepted, not imposed)
--
-- Writes exactly three columns. There is no path here to permission_keys,
-- due_date or grantee_user_id.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_director_handover_respond(
  p_handover_id uuid,
  p_decision    text,
  p_reason      text DEFAULT NULL
)
RETURNS public.director_handovers
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.director_handovers;
BEGIN
  IF p_decision NOT IN ('accepted','declined') THEN
    RAISE EXCEPTION 'Decision must be accepted or declined' USING ERRCODE = '22023';
  END IF;

  -- FOR UPDATE. The guard and the write must be one atomic step: with a plain
  -- SELECT, two taps on "Accept" (or an accept racing a revoke) both read status
  -- = 'pending', both pass the check, and both write — the second overwriting the
  -- first's decision and appending a second audit row for a transition that only
  -- happened once. The row lock makes the loser wait, re-read, and be refused by
  -- the status predicate on the UPDATE below.
  --
  -- Same error for not-yours and does-not-exist, so this cannot be used to
  -- probe whether another person's handover exists.
  SELECT * INTO v_row
  FROM public.director_handovers
  WHERE id = p_handover_id AND grantee_user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such handover' USING ERRCODE = '42501';
  END IF;

  IF v_row.status <> 'pending' THEN
    RAISE EXCEPTION 'This handover has already been answered' USING ERRCODE = '22023';
  END IF;

  -- The status predicate is repeated on the UPDATE itself, not left to the IF
  -- above: belt and braces against any future edit that drops the FOR UPDATE.
  UPDATE public.director_handovers
     SET status           = p_decision,
         responded_at     = now(),
         decline_reason   = CASE WHEN p_decision = 'declined'
                                 THEN NULLIF(btrim(COALESCE(p_reason,'')), '') END,
         last_activity_at = now()
   WHERE id = p_handover_id
     AND status = 'pending'
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This handover has already been answered' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.director_handover_audit (handover_id, action, actor_user_id, detail)
  VALUES (p_handover_id, p_decision, auth.uid(),
          jsonb_build_object('reason', p_reason));

  RETURN v_row;
END;
$$;

-- ============================================================================
-- 4. PROGRESS — what keeps an item out of the "gone quiet" bucket (decision 12)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_director_handover_progress(
  p_handover_id uuid,
  p_note        text
)
RETURNS public.director_handovers
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.director_handovers;
BEGIN
  IF btrim(COALESCE(p_note,'')) = '' THEN
    RAISE EXCEPTION 'An update needs something in it' USING ERRCODE = '22023';
  END IF;

  -- FOR UPDATE + a status predicate on the UPDATE — see fn_director_handover_respond.
  SELECT * INTO v_row FROM public.director_handovers
  WHERE id = p_handover_id
    AND (grantee_user_id = auth.uid() OR granted_by = auth.uid())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such handover' USING ERRCODE = '42501';
  END IF;

  IF v_row.status NOT IN ('pending','accepted') THEN
    RAISE EXCEPTION 'This handover is closed' USING ERRCODE = '22023';
  END IF;

  UPDATE public.director_handovers
     SET last_activity_at = now()
   WHERE id = p_handover_id
     AND status IN ('pending','accepted')
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This handover is closed' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.director_handover_audit (handover_id, action, actor_user_id, detail)
  VALUES (p_handover_id, 'progress', auth.uid(), jsonb_build_object('note', btrim(p_note)));

  RETURN v_row;
END;
$$;

-- ============================================================================
-- 5. DONE — decision 4: access ends here
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_director_handover_complete(
  p_handover_id uuid,
  p_note        text DEFAULT NULL
)
RETURNS public.director_handovers
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.director_handovers;
BEGIN
  -- FOR UPDATE + a status predicate on the UPDATE — see fn_director_handover_respond.
  SELECT * INTO v_row FROM public.director_handovers
  WHERE id = p_handover_id
    AND (grantee_user_id = auth.uid() OR granted_by = auth.uid())
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such handover' USING ERRCODE = '42501';
  END IF;

  IF v_row.status NOT IN ('pending','accepted') THEN
    RAISE EXCEPTION 'This handover is already closed' USING ERRCODE = '22023';
  END IF;

  UPDATE public.director_handovers
     SET status = 'done', completed_at = now(), last_activity_at = now()
   WHERE id = p_handover_id
     AND status IN ('pending','accepted')
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This handover is already closed' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.director_handover_audit (handover_id, action, actor_user_id, detail)
  VALUES (p_handover_id, 'done', auth.uid(), jsonb_build_object('note', p_note));

  RETURN v_row;
END;
$$;

-- ============================================================================
-- 6. TAKE IT BACK — granter only
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_director_handover_revoke(
  p_handover_id uuid,
  p_reason      text DEFAULT NULL
)
RETURNS public.director_handovers
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.director_handovers;
BEGIN
  -- FOR UPDATE + a status predicate on the UPDATE — see fn_director_handover_respond.
  -- This one matters most: revoke racing an accept is the realistic collision,
  -- and without the lock the accept could land AFTER the revoke and reopen access.
  SELECT * INTO v_row FROM public.director_handovers
  WHERE id = p_handover_id
    AND (granted_by = auth.uid() OR COALESCE(public.is_super_admin(), false))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such handover' USING ERRCODE = '42501';
  END IF;

  IF v_row.status NOT IN ('pending','accepted') THEN
    RAISE EXCEPTION 'This handover is already closed' USING ERRCODE = '22023';
  END IF;

  UPDATE public.director_handovers
     SET status = 'revoked', revoked_at = now(), last_activity_at = now()
   WHERE id = p_handover_id
     AND status IN ('pending','accepted')
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This handover is already closed' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.director_handover_audit (handover_id, action, actor_user_id, detail)
  VALUES (p_handover_id, 'revoked', auth.uid(), jsonb_build_object('reason', p_reason));

  RETURN v_row;
END;
$$;

-- ============================================================================
-- 7. THE CLIENT-SIDE CHOKEPOINT
--
-- hooks/use-permissions.ts merges custom_roles.permissions client-side and never
-- calls user_has_permission, so the database fix alone would unlock the DATA
-- while leaving every PAGE GATE closed — the receiver would land on an
-- access-denied panel guarding rows they can now read. That is exactly the
-- "fixed one layer, broke along" pattern in
-- feedback_widening_a_permission_is_four_layers.
--
-- This returns the caller's live handover keys so the hook can OR them into the
-- role-derived map. Same access-level and wall filtering as
-- fn_handover_grants_key — the UI is never trusted to narrow anything.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_my_handover_permissions()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT k), '{}'::text[])
  FROM public.director_handovers dh
  JOIN public.profiles p ON p.id = dh.grantee_user_id
  CROSS JOIN LATERAL unnest(dh.permission_keys) AS k
  WHERE dh.grantee_user_id = auth.uid()
    AND dh.status IN ('pending','accepted')
    AND dh.revoked_at IS NULL
    AND dh.due_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date
    AND COALESCE(p.is_active, true) = true
    -- Same multi-tenant predicate as fn_handover_grants_key, and it MUST stay the
    -- same: this feeds the page gates and that one feeds RLS. If the page gate
    -- honoured a cross-institution grant that RLS did not, the receiver would get
    -- an open page over an empty table and no way to tell why.
    AND (dh.institution_id IS NULL
         OR dh.institution_id IS NOT DISTINCT FROM p.institution_id)
    AND NOT public.fn_handover_key_is_blocked(k)
    -- Same predicate the RLS path uses (fn_handover_grants_key). Shared on
    -- purpose: if the page gate and the data layer disagreed about what
    -- 'update' means, the receiver would get a page that opens onto nothing,
    -- or a button that 403s.
    AND public.fn_handover_key_allowed_at_level(k, dh.access_level);
$$;

-- ============================================================================
-- 8. GRANTS — anon is revoked explicitly on every function.
-- The standard REVOKE FROM PUBLIC is insufficient: Supabase's
-- ALTER DEFAULT PRIVILEGES ... GRANT ALL ON FUNCTIONS TO anon gives anon a
-- direct grant separate from PUBLIC (CLAUDE.md, and PR #1225 / migration
-- 20260605191101). Without this the whole handover system would be callable by
-- anyone holding the public anon key, which ships in every JS bundle.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.fn_can_hand_over()                                       FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_director_handover_create(text,text,text[],uuid,date,text,text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_director_handover_respond(uuid,text,text)              FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_director_handover_progress(uuid,text)                  FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_director_handover_complete(uuid,text)                  FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_director_handover_revoke(uuid,text)                    FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_my_handover_permissions()                              FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_can_hand_over()                                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_director_handover_create(text,text,text[],uuid,date,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_director_handover_respond(uuid,text,text)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_director_handover_progress(uuid,text)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_director_handover_complete(uuid,text)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_director_handover_revoke(uuid,text)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_my_handover_permissions()                              TO authenticated;

NOTIFY pgrst, 'reload schema';
