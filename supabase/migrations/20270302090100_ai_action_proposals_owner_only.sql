-- ============================================================================
-- AI Assistant actions — the two OWNER-ONLY functions (lane B, repair round 1)
-- Created: 2026-09-23
--
-- Runs right after 20270302090000_ai_action_proposals.sql, which creates the
-- table these read. They were split into their own file so the secdef
-- authz-guard scanner keeps checking the previous file, whose two functions
-- (ai_rpc_propose_action, fn_ai_claim_action_proposal) DO need a permission
-- check. The marker below now covers only these two.
--
-- ci:allow-secdef-authenticated fn_ai_my_action_proposals and
-- fn_ai_cancel_action_proposal are OWNER-ONLY by construction: every row they
-- read or change is filtered on requested_by = auth.uid(), and another person's
-- id reads as NOT_FOUND. A person must be able to see and cancel their own card
-- even after losing the permission that created it, so a permission predicate
-- here would be wrong. Cancel never sends anything.
--
-- FILE ONLY — applied by the orchestrator at merge time, never from a lane.
-- SECURITY DEFINER, search_path = public, pinned to auth.uid(), revoked from
-- anon and PUBLIC.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. fn_ai_my_action_proposals — the caller's own proposals for the cards
-- ----------------------------------------------------------------------------
-- p_job_id is an addition to the lane spec's single argument: the chat bubble
-- knows its answer's job id, not the conversation id, so the card looks
-- proposals up by either. Both NULL returns nothing (never "everything").
-- effective_status turns a pending row past its expiry into 'expired' and a
-- claimed-but-unfinished row into 'sending', without writing anything.
CREATE OR REPLACE FUNCTION public.fn_ai_my_action_proposals(
  p_conversation_id uuid,
  p_job_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  conversation_id uuid,
  job_id uuid,
  kind text,
  title text,
  body text,
  recipients jsonb,
  recipient_count integer,
  task jsonb,
  email_footer text,
  status text,
  effective_status text,
  expires_at timestamptz,
  confirmed_at timestamptz,
  executed_at timestamptz,
  result jsonb,
  error text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.conversation_id, a.job_id, a.kind, a.title, a.body, a.recipients,
         a.recipient_count, a.task, a.email_footer, a.status,
         CASE
           WHEN a.status = 'pending' AND a.confirmed_at IS NOT NULL THEN 'sending'
           WHEN a.status = 'pending' AND a.expires_at <= now() THEN 'expired'
           ELSE a.status
         END,
         a.expires_at, a.confirmed_at, a.executed_at, a.result, a.error, a.created_at
    FROM public.ai_action_proposals a
   WHERE a.requested_by = auth.uid()
     AND auth.uid() IS NOT NULL
     AND ((p_conversation_id IS NOT NULL AND a.conversation_id = p_conversation_id)
          OR (p_job_id IS NOT NULL AND a.job_id = p_job_id))
   ORDER BY a.created_at;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_my_action_proposals(uuid, uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_my_action_proposals(uuid, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2. fn_ai_cancel_action_proposal — owner cancels a card that is not confirmed
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_ai_cancel_action_proposal(p_proposal_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  r     public.ai_action_proposals%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'UNAUTHORIZED', 'message', 'Sign in required.');
  END IF;

  SELECT * INTO r
    FROM public.ai_action_proposals
   WHERE id = p_proposal_id AND requested_by = v_uid
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_FOUND', 'message', 'This action was not found.');
  END IF;
  IF r.status <> 'pending' OR r.confirmed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'NOT_PENDING',
      'status', CASE WHEN r.status = 'pending' THEN 'sending' ELSE r.status END,
      'message', 'This action can no longer be cancelled.');
  END IF;

  UPDATE public.ai_action_proposals
     SET status = 'cancelled', updated_at = now()
   WHERE id = r.id;

  RETURN jsonb_build_object('success', true, 'status', 'cancelled');
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fn_ai_cancel_action_proposal(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_ai_cancel_action_proposal(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. Apply-time assertions
-- ----------------------------------------------------------------------------
DO $assert$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.fn_ai_my_action_proposals(uuid, uuid)',
    'public.fn_ai_cancel_action_proposal(uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '% is executable by anon', v_fn;
    END IF;
    IF position('auth.uid()' IN pg_get_functiondef(v_fn::regprocedure)) = 0 THEN
      RAISE EXCEPTION '% is no longer pinned to auth.uid()', v_fn;
    END IF;
  END LOOP;
END
$assert$;
