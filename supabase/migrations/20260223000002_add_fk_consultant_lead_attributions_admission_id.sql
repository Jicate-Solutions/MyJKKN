-- Add FK from consultant_lead_attributions.admission_id to admission_leads.id
-- This enables PostgREST to resolve the embedded resource join:
--   lead:admission_leads(id, full_name, phone, email)
-- Without this FK, PostgREST throws "Could not find a relationship" and
-- the entire query fails, causing attribution card and referrals page to show no data.

ALTER TABLE consultant_lead_attributions
  ADD CONSTRAINT consultant_lead_attributions_admission_id_fkey
  FOREIGN KEY (admission_id)
  REFERENCES admission_leads(id)
  ON DELETE SET NULL;
