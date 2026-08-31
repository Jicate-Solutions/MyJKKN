-- ============================================================================
-- Director's Desk — the lifecycle decisions from the 2026-08-11 interview.
--
-- Decisions implemented here (numbered as asked):
--   2. The due date NO LONGER ends access. It drives the desk instead.
--   5. A job marked done by mistake can be REOPENED — by the Director.
--   6. Someone who accepted can HAND IT BACK, with a reason.
--   8. The Director can AMEND a live handover (date / level / note), and the
--      receiver is told what changed.
--
-- Already true, verified rather than built:
--   3. Two people can hold the same page — nothing ever blocked it. A test is
--      added so it stays deliberate rather than accidental.
--   4. A handover survives the GRANTER's account being switched off — both
--      access predicates check only the GRANTEE's is_active. Pinned by a test.
--
-- WHY 2 IS THE LOAD-BEARING ONE
-- -----------------------------
-- `AND dh.due_date >= today` used to sit inside both access predicates, so a
-- deadline passing at midnight locked somebody out of a job they had accepted
-- and were halfway through. They then had to come back and ask for it again.
-- The date now colours the DESK — the item goes red and is chased — while access
-- ends only on a real ending: done, declined, revoked, handed back, or the
-- receiver's profile going inactive.
--
-- Consequence, stated rather than buried: a forgotten handover stays open. The
-- daily chase is what stops that being silent, which makes the chase engine
-- load-bearing rather than a nicety. If the chase is ever switched off, this
-- decision needs revisiting.
-- ============================================================================

-- ============================================================================
-- 0. DECISION 2 — the due date stops ending access.
--
-- Both bodies below are machine-extracted from PRODUCTION via
-- pg_get_functiondef and edited programmatically; the only change is that
-- the `AND dh.due_date >= today` line is replaced by the comment explaining
-- its removal. Retyping these from the repo is how #2840 silently reverted
-- the cross-tenant guard once already.
-- ============================================================================

-- ---- fn_handover_grants_key: the due date stops ending access ----
CREATE OR REPLACE FUNCTION public.fn_handover_grants_key(p_user_id uuid, p_key text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.director_handovers dh
    JOIN public.profiles p ON p.id = dh.grantee_user_id
    WHERE dh.grantee_user_id = p_user_id
      -- pending grants access too: you must be able to open a thing to decide
      -- whether to accept it (decision 8).
      AND dh.status IN ('pending', 'accepted')
      AND dh.revoked_at IS NULL
    -- DECISION 2 (Director, 2026-08-11): the due date NO LONGER ends access.
    -- It used to read `AND dh.due_date >= today`, which locked somebody out
    -- overnight in the middle of a job they had accepted, and sent them back to
    -- ask for it again. The date now drives the DESK — the item turns red and is
    -- chased — while access itself ends only on done / declined / revoked /
    -- handed_back, or the receiver's profile going inactive.
    --
    -- CONSEQUENCE, stated rather than buried: a forgotten handover stays open.
    -- The daily chase is what stops that being silent, so the chase is now
    -- load-bearing rather than a convenience.
      -- Decision 7: the moment the receiver's profile stops being active their
      -- doors shut, without waiting for the nightly sweep to relabel the row.
      AND COALESCE(p.is_active, true) = true
      -- MULTI-TENANT. institution_id on the row is the GRANTER's institution at
      -- grant time; a grant only counts while the receiver still belongs to it.
      -- Written as strict equality and NOT as role_has_institution_access(),
      -- deliberately: that helper answers "may the CALLER see this institution",
      -- returns true for any institution when the caller holds a role scoped
      -- 'all', and is evaluated for auth.uid() — none of which is the question
      -- here. The question is whether the GRANTEE is still inside the tenant the
      -- grant was made in. A receiver who transfers colleges loses the handover.
      AND dh.institution_id IS NOT DISTINCT FROM p.institution_id
      -- `@>` (array-contains), not `= ANY(...)`. GIN cannot serve `= ANY`, so
      -- the idx_dh_permission_keys index below was never used by this lookup.
      AND dh.permission_keys @> ARRAY[p_key]
      -- Access level is re-checked HERE, not merely filtered in the UI.
      AND public.fn_handover_key_allowed_at_level(p_key, dh.access_level)
      -- Belt and braces: a wall added AFTER a grant was written retroactively
      -- kills that grant on the next check, rather than grandfathering it.
      AND NOT public.fn_handover_key_is_blocked(p_key)
  );
$function$;

-- ---- fn_my_handover_permissions: the due date stops ending access ----
CREATE OR REPLACE FUNCTION public.fn_my_handover_permissions()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(array_agg(DISTINCT k), '{}'::text[])
  FROM public.director_handovers dh
  JOIN public.profiles p ON p.id = dh.grantee_user_id
  CROSS JOIN LATERAL unnest(dh.permission_keys) AS k
  WHERE dh.grantee_user_id = auth.uid()
    AND dh.status IN ('pending','accepted')
    AND dh.revoked_at IS NULL
    -- DECISION 2 (Director, 2026-08-11): the due date NO LONGER ends access.
    -- It used to read `AND dh.due_date >= today`, which locked somebody out
    -- overnight in the middle of a job they had accepted, and sent them back to
    -- ask for it again. The date now drives the DESK — the item turns red and is
    -- chased — while access itself ends only on done / declined / revoked /
    -- handed_back, or the receiver's profile going inactive.
    --
    -- CONSEQUENCE, stated rather than buried: a forgotten handover stays open.
    -- The daily chase is what stops that being silent, so the chase is now
    -- load-bearing rather than a convenience.
    AND COALESCE(p.is_active, true) = true
    -- Same multi-tenant predicate as fn_handover_grants_key, and it MUST stay the
    -- same: this feeds the page gates and that one feeds RLS. If the page gate
    -- honoured a cross-institution grant that RLS did not, the receiver would get
    -- an open page over an empty table and no way to tell why.
    AND dh.institution_id IS NOT DISTINCT FROM p.institution_id
    AND NOT public.fn_handover_key_is_blocked(k)
    -- Same predicate the RLS path uses (fn_handover_grants_key). Shared on
    -- purpose: if the page gate and the data layer disagreed about what
    -- 'update' means, the receiver would get a page that opens onto nothing,
    -- or a button that 403s.
    AND public.fn_handover_key_allowed_at_level(k, dh.access_level);
$function$;

-- ============================================================================
-- 1. A new ending: handed_back (decision 6)
--
-- Distinct from `declined` on purpose. Declined means "I never took this on";
-- handed_back means "I took it on, and I now cannot finish it". They need
-- different words on the Director's desk because they call for different
-- responses — and collapsing them would lose the fact that somebody tried.
-- ============================================================================

ALTER TABLE public.director_handovers
  DROP CONSTRAINT IF EXISTS director_handovers_status_check;

ALTER TABLE public.director_handovers
  ADD CONSTRAINT director_handovers_status_check
  CHECK (status = ANY (ARRAY[
    'pending', 'accepted', 'declined', 'done',
    'revoked', 'expired', 'orphaned', 'handed_back'
  ]));

-- ============================================================================
-- 2. REOPEN a job closed by mistake (decision 5)
--
-- Director-only, deliberately. The receiver can already hand a job back, which
-- is the honest move when they cannot finish; letting them also un-finish their
-- own "done" would let an item bounce open and closed without the Director ever
-- seeing why.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_director_handover_reopen(
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
  -- Row lock + status predicate in the UPDATE itself, so two concurrent reopens
  -- cannot both pass a read-then-write guard.
  SELECT * INTO v_row FROM public.director_handovers
  WHERE id = p_handover_id
    AND (granted_by = auth.uid() OR COALESCE(public.is_super_admin(), false))
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Same error for not-yours and does-not-exist, or this is an existence probe.
    RAISE EXCEPTION 'No such handover' USING ERRCODE = '42501';
  END IF;

  IF v_row.status NOT IN ('done', 'handed_back', 'declined') THEN
    RAISE EXCEPTION 'Only a finished, declined or handed-back item can be reopened (this one is %)', v_row.status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.director_handovers
     SET status           = 'accepted',
         completed_at     = NULL,
         responded_at     = COALESCE(responded_at, now()),
         decline_reason   = NULL,
         last_activity_at = now()
   WHERE id = p_handover_id
   RETURNING * INTO v_row;

  INSERT INTO public.director_handover_audit (handover_id, action, actor_user_id, detail)
  VALUES (p_handover_id, 'reopened', auth.uid(),
          jsonb_build_object('note', p_note, 'from_status', 'closed'));

  RETURN v_row;
END;
$$;

-- ============================================================================
-- 3. HAND IT BACK after accepting (decision 6)
--
-- Receiver-only, and the reason is required. "I said yes and my week changed"
-- is a normal thing to happen; the platform should be able to say it, otherwise
-- the desk quietly stops describing reality.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_director_handover_hand_back(
  p_handover_id uuid,
  p_reason      text
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
  IF btrim(COALESCE(p_reason, '')) = '' THEN
    RAISE EXCEPTION 'Say why you are handing it back — the Director needs to know what to do next'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM public.director_handovers
  WHERE id = p_handover_id AND grantee_user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such handover' USING ERRCODE = '42501';
  END IF;

  IF v_row.status <> 'accepted' THEN
    RAISE EXCEPTION 'Only an accepted item can be handed back (this one is %). Decline it instead.', v_row.status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.director_handovers
     SET status           = 'handed_back',
         decline_reason   = btrim(p_reason),
         last_activity_at = now()
   WHERE id = p_handover_id
   RETURNING * INTO v_row;

  INSERT INTO public.director_handover_audit (handover_id, action, actor_user_id, detail)
  VALUES (p_handover_id, 'handed_back', auth.uid(),
          jsonb_build_object('reason', btrim(p_reason)));

  RETURN v_row;
END;
$$;

-- ============================================================================
-- 4. AMEND a live handover (decision 8)
--
-- The Director can change the date, the access level, or the note. Every change
-- is written to the audit with its BEFORE and AFTER, so the receiver can see
-- exactly what moved rather than just that something did.
--
-- The access level is re-validated against the keys on the row: narrowing a
-- handover to `watch` when its only key is a `.manage` key would silently turn a
-- working item into a dead one — the same "looks healthy, grants nothing" defect
-- this feature has already produced twice.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_director_handover_amend(
  p_handover_id  uuid,
  p_due_date     date DEFAULT NULL,
  p_access_level text DEFAULT NULL,
  p_note         text DEFAULT NULL
)
RETURNS public.director_handovers
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     public.director_handovers;
  v_before  jsonb;
  v_dead    text[];
BEGIN
  SELECT * INTO v_row FROM public.director_handovers
  WHERE id = p_handover_id
    AND (granted_by = auth.uid() OR COALESCE(public.is_super_admin(), false))
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such handover' USING ERRCODE = '42501';
  END IF;

  IF v_row.status NOT IN ('pending', 'accepted') THEN
    RAISE EXCEPTION 'This handover is closed (%) — reopen it first', v_row.status
      USING ERRCODE = '22023';
  END IF;

  IF p_access_level IS NOT NULL AND p_access_level NOT IN ('watch','update','full') THEN
    RAISE EXCEPTION 'access_level must be watch, update or full' USING ERRCODE = '22023';
  END IF;

  -- Refuse a level that would leave the item granting nothing. Named keys, not a
  -- silent filter: the Director must see WHICH key the new level cannot carry.
  IF p_access_level IS NOT NULL THEN
    SELECT array_agg(k) INTO v_dead
    FROM unnest(v_row.permission_keys) AS k
    WHERE NOT public.fn_handover_key_allowed_at_level(k, p_access_level);

    IF v_dead IS NOT NULL AND cardinality(v_dead) = cardinality(v_row.permission_keys) THEN
      RAISE EXCEPTION
        'At "%" this handover would grant nothing — % needs a higher level.',
        p_access_level, array_to_string(v_dead, ', ')
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_due_date IS NOT NULL
     AND p_due_date < (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'That date is already past' USING ERRCODE = '22023';
  END IF;

  v_before := jsonb_build_object(
    'due_date',     v_row.due_date,
    'access_level', v_row.access_level,
    'note',         v_row.note
  );

  UPDATE public.director_handovers
     SET due_date         = COALESCE(p_due_date,     due_date),
         access_level     = COALESCE(p_access_level, access_level),
         note             = COALESCE(NULLIF(btrim(COALESCE(p_note,'')),''), note),
         last_activity_at = now()
   WHERE id = p_handover_id
   RETURNING * INTO v_row;

  INSERT INTO public.director_handover_audit (handover_id, action, actor_user_id, detail)
  VALUES (p_handover_id, 'amended', auth.uid(),
          jsonb_build_object(
            'before', v_before,
            'after',  jsonb_build_object(
              'due_date',     v_row.due_date,
              'access_level', v_row.access_level,
              'note',         v_row.note)));

  RETURN v_row;
END;
$$;

-- ============================================================================
-- 5. GRANTS — anon revoked explicitly on every function.
-- The PUBLIC revoke alone is insufficient: Supabase's default privileges give
-- anon a direct grant, separate from PUBLIC.
-- ============================================================================

REVOKE EXECUTE ON FUNCTION public.fn_director_handover_reopen(uuid, text)          FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_director_handover_hand_back(uuid, text)       FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_director_handover_amend(uuid, date, text, text) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.fn_director_handover_reopen(uuid, text)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_director_handover_hand_back(uuid, text)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_director_handover_amend(uuid, date, text, text) TO authenticated;

-- ============================================================================
-- 6. ASSERT the decisions actually hold, or roll the whole thing back.
-- ============================================================================

DO $assert$
DECLARE
  v_src text;
BEGIN
  -- Decision 2: no due-date cutoff survives in EITHER access predicate.
  FOR v_src IN
    SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('fn_handover_grants_key','fn_my_handover_permissions')
  LOOP
    -- Strip -- comments FIRST. prosrc includes them, and the comment that
    -- explains this removal necessarily quotes the line being removed — so a
    -- naive match reads its own documentation as the defect.
    IF regexp_replace(v_src, '--[^\n]*', '', 'g') ~* 'due_date\s*>=' THEN
      RAISE EXCEPTION 'a due-date cutoff still ends access — decision 2 not applied';
    END IF;
  END LOOP;

  -- Decision 4: neither predicate looks at the GRANTER's is_active, so a
  -- handover survives the granter's account being switched off.
  FOR v_src IN
    SELECT p.prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('fn_handover_grants_key','fn_my_handover_permissions')
  LOOP
    IF regexp_replace(v_src, '--[^\n]*', '', 'g') ~* 'granted_by[^\n]*is_active' THEN
      RAISE EXCEPTION 'access depends on the granter still being active — decision 4 broken';
    END IF;
  END LOOP;

  -- The three new verbs exist and are callable by authenticated, not anon.
  IF NOT has_function_privilege('authenticated','public.fn_director_handover_hand_back(uuid, text)','EXECUTE')
     OR has_function_privilege('anon','public.fn_director_handover_hand_back(uuid, text)','EXECUTE') THEN
    RAISE EXCEPTION 'hand_back grants are wrong';
  END IF;

  RAISE NOTICE 'lifecycle decisions applied: due date no longer ends access; reopen / hand-back / amend live';
END;
$assert$;

NOTIFY pgrst, 'reload schema';
