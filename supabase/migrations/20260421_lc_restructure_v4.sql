-- =============================================================================
-- Learners Council - Restructure Migration (V3 → V4 Corrected)
-- Date: 2026-04-21
-- Source: specs/learners-council-corrected-structure-spec.md (Director interview)
-- =============================================================================
-- SAFE: All affected tables are empty (0 rows on production as of 2026-04-21)
-- =============================================================================

BEGIN;

-- ============================================================
-- 1. NEW TABLE: lc_portfolio_committees
-- ============================================================
CREATE TABLE IF NOT EXISTS lc_portfolio_committees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  description text,
  focus_area text,
  term_id uuid REFERENCES lc_terms(id) ON DELETE CASCADE,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lc_committees_term ON lc_portfolio_committees(term_id);
CREATE INDEX IF NOT EXISTS idx_lc_committees_active ON lc_portfolio_committees(is_active);

-- ============================================================
-- 2. NEW TABLE: lc_committee_members (junction — overlapping membership)
-- ============================================================
CREATE TABLE IF NOT EXISTS lc_committee_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id uuid NOT NULL REFERENCES lc_portfolio_committees(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES lc_members(id) ON DELETE CASCADE,
  role varchar(50) DEFAULT 'member', -- 'chair', 'co_chair', 'member'
  assigned_at timestamp with time zone DEFAULT now(),
  ended_at timestamp with time zone,
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(committee_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_lc_committee_members_committee ON lc_committee_members(committee_id);
CREATE INDEX IF NOT EXISTS idx_lc_committee_members_member ON lc_committee_members(member_id);
CREATE INDEX IF NOT EXISTS idx_lc_committee_members_active ON lc_committee_members(is_active);

-- ============================================================
-- 3. ENABLE RLS on new tables
-- ============================================================
ALTER TABLE lc_portfolio_committees ENABLE ROW LEVEL SECURITY;
ALTER TABLE lc_committee_members ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. RLS POLICIES — mirror existing lc_positions pattern
-- ============================================================

-- lc_portfolio_committees: all authenticated users can view, super_admin manages
CREATE POLICY "committees_select_auth" ON lc_portfolio_committees
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "committees_insert_super" ON lc_portfolio_committees
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (role = 'super_admin' OR is_super_admin = true)
  ));

CREATE POLICY "committees_update_super" ON lc_portfolio_committees
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (role = 'super_admin' OR is_super_admin = true)
  ));

CREATE POLICY "committees_delete_super" ON lc_portfolio_committees
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (role = 'super_admin' OR is_super_admin = true)
  ));

-- lc_committee_members: authenticated users can view, super_admin manages
CREATE POLICY "committee_members_select_auth" ON lc_committee_members
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "committee_members_insert_super" ON lc_committee_members
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (role = 'super_admin' OR is_super_admin = true)
  ));

CREATE POLICY "committee_members_update_super" ON lc_committee_members
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (role = 'super_admin' OR is_super_admin = true)
  ));

CREATE POLICY "committee_members_delete_super" ON lc_committee_members
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND (role = 'super_admin' OR is_super_admin = true)
  ));

-- ============================================================
-- 5. TRIGGER: auto-update updated_at
-- ============================================================
CREATE TRIGGER update_lc_committees_updated_at
  BEFORE UPDATE ON lc_portfolio_committees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_lc_committee_members_updated_at
  BEFORE UPDATE ON lc_committee_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 6. SEED: 9 portfolio committees (initial data)
-- ============================================================
INSERT INTO lc_portfolio_committees (name, description, focus_area, sort_order) VALUES
  ('Academics & Research', 'Oversees curriculum feedback, research opportunities, and academic support for learners', 'academics', 1),
  ('Sports & Culturals', 'Coordinates inter-institutional sports events, cultural activities, and artistic expression', 'sports_culture', 2),
  ('Campus Welfare & Facilities', 'Manages campus infrastructure, food services, and general learner welfare', 'campus_welfare', 3),
  ('Hostel & Food Services', 'Oversees residential concerns, dining quality, and accommodation', 'hostel', 4),
  ('Training & Professional Development', 'Drives skill development, workshops, and certifications', 'training', 5),
  ('Placement & Career Opportunities', 'Coordinates industry connections, internships, and career services', 'placement', 6),
  ('Extension Activities & Industry Connect', 'Manages NSS, community service, and external partnerships', 'extension', 7),
  ('Campus Ambassador & External Relations', 'Leads PR, social media, and JKKN brand representation', 'branding', 8),
  ('Grievance Redressal & Learner Welfare', 'Facilitates complaint handling, conflict mediation, and learner support', 'grievance', 9);

-- ============================================================
-- 7. SEED: 10 YUVA verticals (corrected structure)
-- ============================================================
-- Clean slate (empty table anyway)
DELETE FROM yuva_verticals;

INSERT INTO yuva_verticals (name, type, description, icon, sort_order, is_active) VALUES
  -- Stakeholders (2 — Membership is handled by Chapter Chair, no separate leadership)
  ('Thalir', 'stakeholder', 'School student outreach across all verticals', '🌱', 1, true),
  ('Rural Initiatives', 'stakeholder', 'Community/villages outreach across all verticals', '🏡', 2, true),

  -- Nation Building (5)
  ('MASOOM', 'vertical', 'Child Safety — keeping children safe across campus, schools, and villages', '👶', 10, true),
  ('Climate Action', 'vertical', 'Environmental sustainability — green campus, tree planting, pond rejuvenation', '🌍', 11, true),
  ('Road Safety', 'vertical', 'Reducing accidents — helmet campaigns, driving workshops, school awareness', '🚦', 12, true),
  ('Health & Wellness', 'vertical', 'Healthcare access — mental health, Fit India, rural health camps', '❤️', 13, true),
  ('Accessibility', 'vertical', 'Inclusive spaces — campus accessibility audits, sensitization', '♿', 14, true),

  -- Youth Leadership (5)
  ('Learning', 'vertical', 'Skill development — workshops, peer learning, certifications', '📚', 20, true),
  ('Entrepreneurship', 'vertical', 'Startup culture — BEW, startup mania, industry visits', '💡', 21, true),
  ('Innovation', 'vertical', 'Creative problem-solving — hackathons, IDS, Vibe Coding, AI programs', '🔬', 22, true),
  ('Sports', 'vertical', 'Physical activity and competition (Cricket is BANNED by Director)', '⚽', 23, true),
  ('Branding', 'vertical', 'PR, media, external relations — event documentation, social media', '📢', 24, true);

-- ============================================================
-- 8. SEED: lc_positions - corrected structure (27 positions: representative + 4 leadership roles)
-- ============================================================
DELETE FROM lc_positions;

-- 4 leadership positions (elected FROM the 27 — these are position types/roles, not separate slots)
INSERT INTO lc_positions (title, category, tier, description, max_holders, sort_order) VALUES
  ('President', 'executive', 'tier_1', 'Chair of LC meetings, liaise with MD, external representation. Elected from the 27 reps for 6-month rotating term.', 1, 1),
  ('Vice President', 'executive', 'tier_1', 'Assist President, track action items, coordinate committees. Elected from the 27 reps for 6-month rotating term.', 1, 2),
  ('Secretary', 'executive', 'tier_1', 'Record minutes, manage documentation, communications. Elected from the 27 reps for 6-month rotating term.', 1, 3),
  ('Treasurer', 'executive', 'tier_1', 'Manage LC finances and budgets. Elected from the 27 reps for 6-month rotating term.', 1, 4);

-- 27 representative slots (3 per institution × 9 institutions)
-- Uses the existing 8 institutions on MyJKKN prod + 1 placeholder; schools to be added later
-- We create generic "Representative 1/2/3" per institution
DO $$
DECLARE
  inst RECORD;
  inst_short text;
  inst_order int := 10;
BEGIN
  FOR inst IN
    SELECT id, name FROM institutions
    WHERE name LIKE 'JKKN%'
      AND name NOT LIKE '%Testing%'
    ORDER BY name
  LOOP
    -- Short label for the position title
    inst_short := regexp_replace(inst.name, '^JKKN (College of )?', '', 'i');
    inst_short := regexp_replace(inst_short, ' and.*$', '', 'i');

    INSERT INTO lc_positions (title, category, tier, institution_id, description, max_holders, sort_order)
    VALUES
      (format('Representative 1 - %s', inst_short), 'representative', 'tier_1', inst.id,
        format('One of 3 representatives from %s elected from Yuva EC chairs', inst.name), 1, inst_order),
      (format('Representative 2 - %s', inst_short), 'representative', 'tier_1', inst.id,
        format('One of 3 representatives from %s elected from Yuva EC chairs', inst.name), 1, inst_order + 1),
      (format('Representative 3 - %s', inst_short), 'representative', 'tier_1', inst.id,
        format('One of 3 representatives from %s elected from Yuva EC chairs', inst.name), 1, inst_order + 2);

    inst_order := inst_order + 10;
  END LOOP;
END $$;

-- ============================================================
-- 9. Reload PostgREST schema cache
-- ============================================================
SELECT pg_notify('pgrst', 'reload schema');

COMMIT;

-- =============================================================================
-- Migration complete
-- =============================================================================
