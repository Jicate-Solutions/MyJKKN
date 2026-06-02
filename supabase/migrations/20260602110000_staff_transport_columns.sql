-- Mirror learners_profiles transport columns onto staff so staff bus passes sync here.
-- (FKs match learners_profiles_transport_route_id_fkey / _stop_id_fkey.)
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS bus_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS transport_route_id uuid REFERENCES public.tms_route(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transport_stop_id uuid REFERENCES public.tms_route_stop(id) ON DELETE SET NULL;
