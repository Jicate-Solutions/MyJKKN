-- Postal Code master: TN post offices (pincode → district + lat/long) powering
-- pincode-driven district auto-fill on the learner address section and
-- "View on Map" links. Additive only: learners_profiles gains a nullable
-- post_office_id FK; no existing column or row is modified.

CREATE TABLE IF NOT EXISTS public.postal_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pincode text NOT NULL CHECK (pincode ~ '^[0-9]{6}$'),
  office_name text NOT NULL,
  division text,
  district text NOT NULL,        -- canonical lib/data/locations.ts display name (e.g. 'Thoothukudi')
  district_id text NOT NULL,     -- locations.ts district id (e.g. 'thoothukudi') for direct cascade binding
  state text NOT NULL DEFAULT 'Tamil Nadu',
  latitude numeric(10,7),
  longitude numeric(10,7),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS postal_codes_pin_office_uq
  ON public.postal_codes (pincode, lower(office_name));

CREATE INDEX IF NOT EXISTS postal_codes_pincode_idx
  ON public.postal_codes (pincode);

DROP TRIGGER IF EXISTS postal_codes_touch_updated_at ON public.postal_codes;
CREATE TRIGGER postal_codes_touch_updated_at
  BEFORE UPDATE ON public.postal_codes
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- RLS: static lookup dataset — authenticated read only. No write policies on
-- purpose (deny by default; rows are seeded via service role). Public
-- student-form reads go through the token-validated service-role endpoint.
ALTER TABLE public.postal_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY postal_codes_select ON public.postal_codes
  FOR SELECT TO authenticated USING (true);

REVOKE ALL ON public.postal_codes FROM anon;

-- learners_profiles: additive nullable FK (which post office the learner picked)
ALTER TABLE public.learners_profiles
  ADD COLUMN IF NOT EXISTS post_office_id uuid REFERENCES public.postal_codes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS learners_profiles_post_office_id_idx
  ON public.learners_profiles (post_office_id)
  WHERE post_office_id IS NOT NULL;
