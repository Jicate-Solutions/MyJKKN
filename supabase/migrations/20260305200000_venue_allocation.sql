-- ============================================================
-- Venue Allocation System for Appathon 2.0
-- Links venues (from Resource Management) to event days,
-- assigns mentors/judges to venues, and allocates teams.
-- ============================================================

-- ss_event_venues: links resources (venues) to event days
CREATE TABLE IF NOT EXISTS ss_event_venues (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id       UUID NOT NULL REFERENCES ss_events(id) ON DELETE CASCADE,
  resource_id    UUID REFERENCES resources(id),
  day_type       TEXT NOT NULL CHECK (day_type IN ('build_day', 'demo_day')),
  venue_name     TEXT NOT NULL,
  institution_id UUID REFERENCES institutions(id),
  capacity       INT DEFAULT 50,
  location_info  TEXT,
  status         TEXT DEFAULT 'active',
  created_at     TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, venue_name, day_type)
);

-- ss_venue_staff: mentors/judges assigned to venues
CREATE TABLE IF NOT EXISTS ss_venue_staff (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id   UUID NOT NULL REFERENCES ss_event_venues(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id),
  role       TEXT DEFAULT 'mentor' CHECK (role IN ('mentor','lead_mentor','judge','panel_chair')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(venue_id, user_id)
);

-- Team venue assignments (different per day)
ALTER TABLE ss_teams ADD COLUMN IF NOT EXISTS build_venue_id UUID REFERENCES ss_event_venues(id);
ALTER TABLE ss_teams ADD COLUMN IF NOT EXISTS demo_venue_id UUID REFERENCES ss_event_venues(id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ss_event_venues_event ON ss_event_venues(event_id, day_type);
CREATE INDEX IF NOT EXISTS idx_ss_venue_staff_venue ON ss_venue_staff(venue_id);
CREATE INDEX IF NOT EXISTS idx_ss_teams_build_venue ON ss_teams(build_venue_id);
CREATE INDEX IF NOT EXISTS idx_ss_teams_demo_venue ON ss_teams(demo_venue_id);

-- RLS
ALTER TABLE ss_event_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE ss_venue_staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read event venues" ON ss_event_venues FOR SELECT USING (true);
CREATE POLICY "Admin manage event venues" ON ss_event_venues FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
);

CREATE POLICY "Public read venue staff" ON ss_venue_staff FOR SELECT USING (true);
CREATE POLICY "Admin manage venue staff" ON ss_venue_staff FOR ALL USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('super_admin', 'admin'))
);
