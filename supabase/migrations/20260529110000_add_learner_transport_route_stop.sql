-- Day-Scholar transport capture on learners_profiles.
--
-- When a learner is a DAY SCHOLAR and needs the college bus, the form captures
-- the TMS route and the boarding-point stop on that route. Routes come from
-- tms_route, stops from tms_route_stop (filtered by route_id). Routes are
-- global (no institution scoping).
--
-- Also opens SELECT on tms_route / tms_route_stop to any authenticated user so
-- the admission/enquiry/profile forms can populate the route + stop dropdowns.
-- These were gated behind tms.routes.view (a TMS-module permission the
-- admission staff don't hold), which would render the dropdowns empty. Reads
-- on a non-sensitive reference catalog should be open to authenticated users;
-- insert/update/delete stay permission-gated. The public student-form reads
-- routes/stops through a service-role token API, not directly, so anon access
-- is intentionally NOT opened here.

-- ── 1. Columns ───────────────────────────────────────────────────────────────
ALTER TABLE learners_profiles
  ADD COLUMN IF NOT EXISTS bus_required boolean,
  ADD COLUMN IF NOT EXISTS transport_route_id uuid REFERENCES tms_route(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transport_stop_id uuid REFERENCES tms_route_stop(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_learners_profiles_transport_route_id
  ON learners_profiles(transport_route_id);
CREATE INDEX IF NOT EXISTS idx_learners_profiles_transport_stop_id
  ON learners_profiles(transport_stop_id);

-- ── 2. Open route/stop reads to authenticated users (reference catalog) ───────
-- RLS is permissive-OR: this sits alongside the existing permission-gated
-- public policy, so authenticated users get read access while anon stays
-- restricted to the existing (permission-based) policy.
DROP POLICY IF EXISTS tms_route_select_authenticated ON tms_route;
CREATE POLICY tms_route_select_authenticated
  ON tms_route FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS tms_route_stop_select_authenticated ON tms_route_stop;
CREATE POLICY tms_route_stop_select_authenticated
  ON tms_route_stop FOR SELECT TO authenticated USING (true);
