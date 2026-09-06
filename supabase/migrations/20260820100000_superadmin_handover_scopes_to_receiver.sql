-- ============================================================================
-- A super admin's handover could never work.
--
-- Date: 2026-08-11
-- Found by: the Director, on /my-desk, seeing "Try again" on a live handover.
--
-- WHAT THE RECEIVER SAW
--   "Your access still has not come through ... the level it was sent at may not
--    cover this page."
--   The level was fine. Measured on all three live handovers:
--     walled=False   level_ok=True   tenant_ok=FALSE   grants=False
--   The message named the one thing that was NOT the cause.
--
-- WHY
--   fn_director_handover_create exempts a super admin from the same-institution
--   check, so the INSERT succeeds — and then stamped the row with the GRANTER's
--   institution. fn_handover_grants_key requires
--   handover.institution_id = grantee.institution_id, which can never hold when
--   the two people sit at different colleges. Create and check disagreed, so the
--   row was born unusable. director@jkkn.ac.in has institution 183847c5…, the
--   receiver has b962527f… — every handover they made was dead on arrival.
--
-- THE DECISION (Director, 2026-08-11)
--   A super admin is deliberately cluster-wide, so a cross-college handover should
--   WORK, scoped to the receiver. An ordinary director still cannot cross
--   institutions — that branch is untouched and still raises 42501.
--
-- Body machine-extracted from production via pg_get_functiondef and edited
-- positionally; the only change is the v_inst assignment and its comment.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_director_handover_create(p_route text, p_title text, p_permission_keys text[], p_grantee_user_id uuid, p_due_date date, p_access_level text DEFAULT 'update'::text, p_note text DEFAULT NULL::text)
 RETURNS director_handovers
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- A super admin is cluster-wide, so the row is scoped to WHERE THE WORK IS —
    -- the receiver's institution — not the granter's.
    --
    -- The old line fell back to the receiver only when the granter's institution
    -- was NULL, under a comment reading "a super admin often has no institution of
    -- their own". Often, but not always. A super admin who DOES have one stamped
    -- THEIRS onto the row; fn_handover_grants_key then compares that against the
    -- receiver's and fails forever. Create said yes, every check said no, and the
    -- receiver saw "your access still has not come through" on a handover that
    -- could never work. Measured live 2026-08-11: 3 of 3 live handovers were dead
    -- this way, every one created by a super admin who DID have an institution.
    --
    -- Scoping to the receiver keeps the guard meaningful — the grant still dies if
    -- they later move institutions. It just stops guaranteeing failure.
    v_inst := v_grantee_inst;
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
$function$;


-- ---------------------------------------------------------------------------
-- RE-ASSERT THE ANON LOCK.
--
-- On production today this is a no-op, and that is the point. Measured
-- 2026-08-11 against pg_proc.proacl, the live grants are exactly
--   {postgres=X, authenticated=X, service_role=X}
-- with no anon and no PUBLIC entry, because CREATE OR REPLACE preserves the ACL
-- of a function that already exists at this signature.
--
-- It is written here because that preservation is the only thing holding the
-- lock, and it holds only while the signature never changes and the function is
-- never created fresh. On a new database, or the day this gains an argument, the
-- same CREATE lands with Postgres's default PUBLIC EXECUTE plus Supabase's
-- default anon grant, and the lock is gone with nothing to say so. A migration
-- that depends on the state it finds is not a migration.
--
-- Revoking PUBLIC alone is insufficient: Supabase issues anon its own direct
-- grant, and a direct grant survives a PUBLIC revoke. Both names are required.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.fn_director_handover_create(text, text, text[], uuid, date, text, text) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_director_handover_create(text, text, text[], uuid, date, text, text) TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- REPAIR the rows already written wrong — only those whose granter is a super
-- admin AND whose institution differs from the receiver's, i.e. exactly the rows
-- this bug produced. A cross-institution row from a NON-super-admin would be a
-- different and real problem, so it is deliberately left alone to stay visible.
-- ---------------------------------------------------------------------------
UPDATE public.director_handovers dh
SET institution_id = p.institution_id,
    updated_at     = now()
FROM public.profiles p, public.profiles gp
WHERE p.id  = dh.grantee_user_id
  AND gp.id = dh.granted_by
  AND gp.is_super_admin = true
  AND dh.status IN ('pending','accepted')
  AND dh.institution_id IS DISTINCT FROM p.institution_id;

-- Prove it: no live handover may carry a key that grants nothing.
DO $a$
DECLARE v_dead int;
BEGIN
  SELECT count(*) INTO v_dead
  FROM public.director_handovers dh
  CROSS JOIN LATERAL unnest(dh.permission_keys) AS k
  WHERE dh.status IN ('pending','accepted')
    AND NOT public.fn_handover_grants_key(dh.grantee_user_id, k);
  IF v_dead > 0 THEN
    RAISE EXCEPTION 'still % live handover key(s) granting nothing after repair', v_dead;
  END IF;
  RAISE NOTICE 'every live handover now grants what it promises';
END;
$a$;

NOTIFY pgrst, 'reload schema';
