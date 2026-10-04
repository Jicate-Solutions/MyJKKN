-- CDC campus drives — public registration link + QR (2026-10-03)
--
-- A CDC team member can switch on a no-login registration page for a drive
-- (/dr/<public_token>) and share the link / QR over WhatsApp, email, etc.
-- Submissions land in cdc_drive_public_registrations.
--
-- Writes to the registrations table happen ONLY through the service-role
-- route /api/public/cdc/drives/[token]/register, which validates the token,
-- the drive status and the payload. There is deliberately NO insert policy.
--
-- Gender targeting (same release) needs no schema change: it is stored inside
-- the existing cdc_drives.institution_semesters jsonb.
--
-- Apply out of band (SQL editor). Safe to re-run.

ALTER TABLE public.cdc_drives
  ADD COLUMN IF NOT EXISTS public_registration_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_token text;

CREATE UNIQUE INDEX IF NOT EXISTS cdc_drives_public_token_key
  ON public.cdc_drives (public_token)
  WHERE public_token IS NOT NULL;

COMMENT ON COLUMN public.cdc_drives.public_registration_enabled IS
  'true = the no-login page /dr/<public_token> accepts registrations (while the drive is announced / willingness_open).';
COMMENT ON COLUMN public.cdc_drives.public_token IS
  'Unguessable token for the public registration link. Generated the first time public registration is enabled; kept when disabled so a re-enabled link/QR stays valid.';

CREATE TABLE IF NOT EXISTS public.cdc_drive_public_registrations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drive_id         uuid NOT NULL REFERENCES public.cdc_drives(id) ON DELETE CASCADE,
  full_name        text NOT NULL,
  email            text NOT NULL,
  mobile           text NOT NULL,
  gender           text NOT NULL,
  register_number  text,
  -- Set when the registrant picked one of the drive's institutions.
  institution_id   uuid,
  institution_name text NOT NULL,
  program_name     text NOT NULL,
  semester         text,
  cgpa             numeric(4,2),
  arrears          integer,
  -- Matched JKKN learner (register number within the drive's institutions), if any.
  learner_id       uuid,
  -- Whether that learner is inside the drive's audience (gender/program/semester). NULL = not matched.
  in_audience      boolean,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cdc_drive_public_registrations_drive_idx
  ON public.cdc_drive_public_registrations (drive_id, created_at DESC);

-- One registration per person per drive.
CREATE UNIQUE INDEX IF NOT EXISTS cdc_drive_public_registrations_drive_email_key
  ON public.cdc_drive_public_registrations (drive_id, lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS cdc_drive_public_registrations_drive_mobile_key
  ON public.cdc_drive_public_registrations (drive_id, mobile);

ALTER TABLE public.cdc_drive_public_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cdc_drive_public_registrations_staff_read ON public.cdc_drive_public_registrations;
CREATE POLICY cdc_drive_public_registrations_staff_read
  ON public.cdc_drive_public_registrations
  FOR SELECT
  USING (public.is_cdc_staff());

DROP POLICY IF EXISTS cdc_drive_public_registrations_staff_delete ON public.cdc_drive_public_registrations;
CREATE POLICY cdc_drive_public_registrations_staff_delete
  ON public.cdc_drive_public_registrations
  FOR DELETE
  USING (public.is_cdc_staff());

REVOKE ALL ON public.cdc_drive_public_registrations FROM anon;
GRANT SELECT, DELETE ON public.cdc_drive_public_registrations TO authenticated;
GRANT ALL ON public.cdc_drive_public_registrations TO service_role;

NOTIFY pgrst, 'reload schema';
