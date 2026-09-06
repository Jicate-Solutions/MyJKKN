-- Migration: audit trail for admission_leads source + referral fields
-- Added: 2026-08-06 — closes the blind spot where source/referral edits left no attributable author.
-- Records who/when/old→new for every change to source, source_detail, referral_type,
-- referred_by_id, referred_by_name on admission_leads. Additive and reversible.

CREATE TABLE IF NOT EXISTS public.admission_lead_source_audit (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id            uuid NOT NULL,
  learner_profile_id uuid,
  changed_field      text NOT NULL,   -- source | source_detail | referral_type | referred_by_id | referred_by_name
  old_value          text,
  new_value          text,
  changed_by         uuid,            -- auth.uid() of the editor (NULL for system/service-role writes)
  changed_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alsa_lead       ON public.admission_lead_source_audit(lead_id);
CREATE INDEX IF NOT EXISTS idx_alsa_changed_at ON public.admission_lead_source_audit(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_alsa_changed_by ON public.admission_lead_source_audit(changed_by);

ALTER TABLE public.admission_lead_source_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS alsa_select ON public.admission_lead_source_audit;
CREATE POLICY alsa_select ON public.admission_lead_source_audit
FOR SELECT USING (is_super_admin() OR is_admin() OR user_has_permission('admission.leads.view'));

REVOKE ALL   ON public.admission_lead_source_audit FROM anon, PUBLIC;
GRANT  SELECT ON public.admission_lead_source_audit TO authenticated;

-- Defensive: only inserts when a watched field actually changes; the INSERTs cannot fail on
-- valid rows, so the trigger never blocks a legitimate lead update.
CREATE OR REPLACE FUNCTION public.fn_audit_admission_lead_source()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.source IS DISTINCT FROM OLD.source THEN
    INSERT INTO public.admission_lead_source_audit(lead_id,learner_profile_id,changed_field,old_value,new_value,changed_by)
    VALUES (NEW.id,NEW.learner_profile_id,'source',OLD.source::text,NEW.source::text,auth.uid());
  END IF;
  IF NEW.source_detail IS DISTINCT FROM OLD.source_detail THEN
    INSERT INTO public.admission_lead_source_audit(lead_id,learner_profile_id,changed_field,old_value,new_value,changed_by)
    VALUES (NEW.id,NEW.learner_profile_id,'source_detail',OLD.source_detail,NEW.source_detail,auth.uid());
  END IF;
  IF NEW.referral_type IS DISTINCT FROM OLD.referral_type THEN
    INSERT INTO public.admission_lead_source_audit(lead_id,learner_profile_id,changed_field,old_value,new_value,changed_by)
    VALUES (NEW.id,NEW.learner_profile_id,'referral_type',OLD.referral_type,NEW.referral_type,auth.uid());
  END IF;
  IF NEW.referred_by_id IS DISTINCT FROM OLD.referred_by_id THEN
    INSERT INTO public.admission_lead_source_audit(lead_id,learner_profile_id,changed_field,old_value,new_value,changed_by)
    VALUES (NEW.id,NEW.learner_profile_id,'referred_by_id',OLD.referred_by_id::text,NEW.referred_by_id::text,auth.uid());
  END IF;
  IF NEW.referred_by_name IS DISTINCT FROM OLD.referred_by_name THEN
    INSERT INTO public.admission_lead_source_audit(lead_id,learner_profile_id,changed_field,old_value,new_value,changed_by)
    VALUES (NEW.id,NEW.learner_profile_id,'referred_by_name',OLD.referred_by_name,NEW.referred_by_name,auth.uid());
  END IF;
  RETURN NEW;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_audit_admission_lead_source() FROM anon, PUBLIC;

DROP TRIGGER IF EXISTS trg_audit_admission_lead_source ON public.admission_leads;
CREATE TRIGGER trg_audit_admission_lead_source
AFTER UPDATE OF source, source_detail, referral_type, referred_by_id, referred_by_name
ON public.admission_leads
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_admission_lead_source();
