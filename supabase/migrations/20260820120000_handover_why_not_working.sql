-- ============================================================================
-- Tell the receiver the REAL reason a handover is not working.
--
-- Date: 2026-08-11
-- Decision 9 (Director interview, 2026-08-11).
--
-- WHAT WENT WRONG BEFORE
-- ----------------------
-- /my-desk decides an item is reachable by checking whether the client's
-- permission map contains the row's keys. When it does not, the client has no
-- way to know WHY — so it guessed, in fixed copy:
--
--   "...the level it was sent at may not cover this page."
--
-- On 2026-08-11 the Director hit exactly this. Measured on all three live
-- handovers at the time: walled=False, level_ok=TRUE, tenant_ok=FALSE. The
-- message named the one condition that was fine, and sent him to check a
-- setting that was correct while the real cause — an institution mismatch —
-- went unnamed.
--
-- A guess in an error message is worse than silence: it spends the reader's
-- attention on the wrong thing.
--
-- WHAT THIS DOES
-- --------------
-- The server already knows which conjunct failed — fn_handover_grants_key
-- evaluates all of them. This exposes that answer, in the same order the real
-- predicate applies it, as a reason code plus a sentence a person can act on.
--
-- Readable ONLY by the two parties to the handover. The reason names an
-- institution mismatch and a permission key, so it is not something to hand to
-- an arbitrary caller — and a per-row diagnosis endpoint open to everyone would
-- be the same oracle shape this feature has already had to close once.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_handover_why_not_working(
  p_handover_id uuid
)
RETURNS TABLE (
  working     boolean,
  reason_code text,
  reason      text,
  can_fix     text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row     public.director_handovers;
  v_prof    public.profiles;
  v_dead    text[];
  v_walled  text[];
  v_live    int;
BEGIN
  SELECT * INTO v_row FROM public.director_handovers WHERE id = p_handover_id;

  -- Same error for not-yours and does-not-exist, or this becomes a probe for
  -- whether a given handover id exists.
  IF NOT FOUND
     OR NOT (v_row.grantee_user_id = auth.uid()
             OR v_row.granted_by = auth.uid()
             OR COALESCE(public.is_super_admin(), false)) THEN
    RAISE EXCEPTION 'No such handover' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_prof FROM public.profiles WHERE id = v_row.grantee_user_id;

  -- Order matters: report the FIRST condition that fails, in the same order the
  -- real predicate applies them, so the answer matches what the platform did.

  IF v_row.status NOT IN ('pending', 'accepted') THEN
    RETURN QUERY SELECT false, 'closed',
      format('This item is %s, so the page is no longer open through it.', v_row.status),
      'Ask for it again if the work is still yours.';
    RETURN;
  END IF;

  IF v_row.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'revoked',
      'This was taken back, so the page is closed to you.'::text,
      'Ask the person who handed it over if you still need it.'::text;
    RETURN;
  END IF;

  IF NOT COALESCE(v_prof.is_active, true) THEN
    RETURN QUERY SELECT false, 'inactive',
      'Your account is not active, so nothing can be opened through a handover.'::text,
      'Contact the administrator about your account.'::text;
    RETURN;
  END IF;

  -- The one that actually bit us. Named explicitly rather than folded into a
  -- generic "cannot open" — a cross-institution handover looks perfect on both
  -- desks and never works, so the receiver has no other way to learn this.
  IF v_row.institution_id IS DISTINCT FROM v_prof.institution_id THEN
    RETURN QUERY SELECT false, 'different_institution',
      'This was sent from a different college to the one your account belongs to, so it cannot open the page.'::text,
      'Tell the person who handed it over — they need to send it again from your college.'::text;
    RETURN;
  END IF;

  SELECT array_agg(k) INTO v_walled
  FROM unnest(v_row.permission_keys) AS k
  WHERE public.fn_handover_key_is_blocked(k);

  IF v_walled IS NOT NULL AND cardinality(v_walled) = cardinality(v_row.permission_keys) THEN
    RETURN QUERY SELECT false, 'walled',
      'This page is one that can never be handed over — it is permanently restricted.'::text,
      'It needs to be given through Role Management instead, not as a handover.'::text;
    RETURN;
  END IF;

  SELECT array_agg(k) INTO v_dead
  FROM unnest(v_row.permission_keys) AS k
  WHERE NOT public.fn_handover_key_allowed_at_level(k, v_row.access_level);

  IF v_dead IS NOT NULL AND cardinality(v_dead) = cardinality(v_row.permission_keys) THEN
    RETURN QUERY SELECT false, 'level_too_low',
      format('This was sent at "%s", which is not enough for what this page needs.', v_row.access_level),
      'Ask the person who handed it over to send it at a higher level.'::text;
    RETURN;
  END IF;

  -- Everything the predicate checks passes. If the browser still cannot open the
  -- page, the remaining cause is the client's own cached permission map, which
  -- refreshes on its own — and saying so is honest rather than inventing a cause.
  SELECT count(*) INTO v_live
  FROM unnest(v_row.permission_keys) AS k
  WHERE public.fn_handover_grants_key(v_row.grantee_user_id, k);

  IF v_live = 0 THEN
    RETURN QUERY SELECT false, 'unknown',
      'This is not opening the page, and the usual causes do not apply.'::text,
      'Tell the person who handed it over — this one needs looking at.'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'ok',
    'This is open to you.'::text,
    NULL::text;
END;
$$;

COMMENT ON FUNCTION public.fn_handover_why_not_working(uuid) IS
  'Decision 9: the receiver is told which condition actually failed, instead of the UI guessing. Readable only by the two parties (and super admins).';

REVOKE EXECUTE ON FUNCTION public.fn_handover_why_not_working(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_handover_why_not_working(uuid) TO authenticated;

DO $a$
BEGIN
  IF has_function_privilege('anon','public.fn_handover_why_not_working(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'anon can read handover diagnoses';
  END IF;
  IF NOT has_function_privilege('authenticated','public.fn_handover_why_not_working(uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot read its own diagnosis';
  END IF;
END;
$a$;

NOTIFY pgrst, 'reload schema';
