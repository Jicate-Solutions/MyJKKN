-- 20270711090000_lock_walkin_source_while_claim_held.sql
-- Added: 2026-10-02 — a walk-in enquiry cannot be relabelled while an agency claim
-- on it is waiting for the release owner.
--
-- WHY THIS EXISTS
-- ---------------
-- An agency claim on a walk-in enquiry is HELD until the named owner (Isvarya,
-- Director ruling 2026-09-27) confirms the agency really sent the learner. The
-- hold is decided by one field: admission_leads.source = 'walk_in'. Every
-- admission.leads.edit holder (138 people) can edit that field, so relabelling
-- the enquiry — say to 'referral' — took the claim out of the hold and let it be
-- counted and paid without anyone confirming it. Deleting the enquiry removed the
-- claim with it (ON DELETE CASCADE). This closes both, for signed-in and anonymous
-- callers. postgres / service_role (imports, operators) are untouched.
--
-- WHAT IS LOCKED, EXACTLY
--   * source changing AWAY from 'walk_in'  — refused while the enquiry has at
--     least one claim with payout_cleared_at IS NULL;
--   * DELETE of such an enquiry            — refused for the same reason;
--   * learner_profile_id being unlinked or relinked (an existing link changing to
--     NULL or to another learner) on a walk-in enquiry — refused while a held claim
--     on it has NO learner_profile_id of its own. Every hold check finds the
--     learner through COALESCE(claim.learner_profile_id, lead.learner_profile_id),
--     so for those claims the enquiry's link is the only thing keeping the learner
--     in the hold; moving it let the learner be counted and paid. (W12 blind
--     review of d669f73caa.) Linking a learner where there was none is allowed: it
--     can only put a learner under the hold, and conversion does it with the
--     service role anyway.
-- Nothing else on the enquiry is affected, and once the owner has released every
-- claim on it (or there was never a claim) the label is editable again. Changing a
-- label TO 'walk_in' is never blocked — that only puts a claim under the hold.
-- trg_audit_admission_lead_source keeps logging every label change as before.
--
-- Standalone: does not depend on #4059. A DRAFT until the Director gives its number.

CREATE OR REPLACE FUNCTION public.fn_guard_walkin_source_while_claim_held()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_role text := auth.role();
BEGIN
  IF v_role IS NULL OR v_role NOT IN ('authenticated', 'anon') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF OLD.source::text = 'walk_in'
     AND (TG_OP = 'DELETE' OR NEW.source::text IS DISTINCT FROM 'walk_in')
     AND EXISTS (SELECT 1 FROM public.consultant_lead_attributions a
                  WHERE a.admission_id = OLD.id AND a.payout_cleared_at IS NULL) THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'This walk-in enquiry has an agency claim waiting for confirmation, so it cannot be deleted. The release owner decides it on the Review Worklist.'
        USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'This enquiry has an agency claim waiting for confirmation, so it must stay marked as a walk-in. The release owner decides it on the Review Worklist.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.source::text = 'walk_in'
     AND OLD.learner_profile_id IS NOT NULL
     AND NEW.learner_profile_id IS DISTINCT FROM OLD.learner_profile_id
     AND EXISTS (SELECT 1 FROM public.consultant_lead_attributions a
                  WHERE a.admission_id = OLD.id AND a.payout_cleared_at IS NULL
                    AND a.learner_profile_id IS NULL) THEN
    RAISE EXCEPTION 'This walk-in enquiry has an agency claim waiting for confirmation, so its linked learner cannot be changed. The release owner decides it on the Review Worklist.'
      USING ERRCODE = '42501';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_walkin_source_while_claim_held() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_walkin_source_while_claim_held ON public.admission_leads;
CREATE TRIGGER trg_guard_walkin_source_while_claim_held
  BEFORE UPDATE OF source, learner_profile_id OR DELETE ON public.admission_leads
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_walkin_source_while_claim_held();

-- fn_lead_has_held_walkin_claim: the delete button asks this BEFORE it clears an
-- enquiry's call/SMS/WhatsApp/email history, so a delete the trigger above would refuse
-- never wipes the history first. SECURITY DEFINER because the caller's own RLS can hide
-- consultant_lead_attributions (admins and admission.leads.delete holders may delete a
-- lead without holding admission.leads.view), and a hidden claim must not read as "none".
-- Fails closed: a caller who could not delete the lead anyway gets TRUE, and the app
-- treats an error or a NULL as TRUE too. Returns one boolean, reads nothing else.
CREATE OR REPLACE FUNCTION public.fn_lead_has_held_walkin_claim(p_lead_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (is_super_admin() OR is_admin() OR user_has_permission('admission.leads.delete')) THEN
    RETURN true;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.admission_leads l
      JOIN public.consultant_lead_attributions a ON a.admission_id = l.id
     WHERE l.id = p_lead_id AND l.source::text = 'walk_in' AND a.payout_cleared_at IS NULL);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_lead_has_held_walkin_claim(uuid) FROM anon, PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_lead_has_held_walkin_claim(uuid) TO authenticated;
