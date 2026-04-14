-- Add Networker contact reference to solutions
-- Allows linking solutions to contacts in the Networker CRM system
-- client_name and client_organization are cached locally to avoid API calls on every page load

ALTER TABLE sh_solutions
  ADD COLUMN IF NOT EXISTS networker_contact_id UUID,
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS client_organization TEXT;

-- Index for looking up solutions by Networker contact
CREATE INDEX IF NOT EXISTS idx_sh_solutions_networker_contact
  ON sh_solutions (networker_contact_id)
  WHERE networker_contact_id IS NOT NULL;
