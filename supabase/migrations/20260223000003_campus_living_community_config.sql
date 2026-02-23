-- =============================================================================
-- Campus Living: Phase 4 — Community Bridge Config
-- Single table controlling which Learners Council content surfaces in campus-living
-- Activity Hub + Calendar are aggregation-only (no new tables needed)
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: TABLE
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hostel_community_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    institution_id UUID NOT NULL REFERENCES institutions(id),
    show_lc_events BOOLEAN DEFAULT true,
    show_lc_announcements BOOLEAN DEFAULT true,
    show_lc_polls BOOLEAN DEFAULT true,
    event_scope_filter TEXT[] DEFAULT '{campus,institution_wide}',
    max_events_shown INT DEFAULT 10,
    max_announcements_shown INT DEFAULT 5,
    max_polls_shown INT DEFAULT 3,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(institution_id)
);


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE hostel_community_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hostel_community_config_institution_isolation ON hostel_community_config;
CREATE POLICY hostel_community_config_institution_isolation ON hostel_community_config
    FOR ALL
    USING (institution_id IN (SELECT institution_id FROM profiles WHERE id = auth.uid()))
    WITH CHECK (institution_id IN (SELECT institution_id FROM profiles WHERE id = auth.uid()));


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: INDEXES
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_hostel_community_config_institution
    ON hostel_community_config(institution_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: TRIGGER (auto-update updated_at)
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_hostel_community_config_updated_at ON hostel_community_config;
CREATE TRIGGER trg_hostel_community_config_updated_at
    BEFORE UPDATE ON hostel_community_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
