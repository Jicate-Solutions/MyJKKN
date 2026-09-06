BEGIN;

-- One-way mirror: lead_active_stage_policy.is_terminal (existing routing source)
-- becomes admission_statuses.is_terminal for scope='lead'.
-- Initial backfill:
UPDATE public.admission_statuses s
SET is_terminal = p.is_terminal
FROM public.lead_active_stage_policy p
WHERE s.scope = 'lead'
  AND s.code = p.funnel_stage;

-- Trigger to keep them in sync going forward.
CREATE OR REPLACE FUNCTION public._mirror_lead_stage_policy_is_terminal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  UPDATE public.admission_statuses
  SET is_terminal = NEW.is_terminal
  WHERE scope='lead' AND code = NEW.funnel_stage;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_mirror_lead_stage_policy_is_terminal
  AFTER INSERT OR UPDATE OF is_terminal ON public.lead_active_stage_policy
  FOR EACH ROW EXECUTE FUNCTION public._mirror_lead_stage_policy_is_terminal();

COMMIT;
