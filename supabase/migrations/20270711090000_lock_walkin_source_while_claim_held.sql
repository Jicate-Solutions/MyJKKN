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
--   * DELETE of such an enquiry            — refused for the same reason.
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

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_guard_walkin_source_while_claim_held() FROM anon, authenticated, PUBLIC;

DROP TRIGGER IF EXISTS trg_guard_walkin_source_while_claim_held ON public.admission_leads;
CREATE TRIGGER trg_guard_walkin_source_while_claim_held
  BEFORE UPDATE OF source OR DELETE ON public.admission_leads
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_walkin_source_while_claim_held();
