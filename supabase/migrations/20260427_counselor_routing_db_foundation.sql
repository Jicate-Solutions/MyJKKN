-- ============================================================================
-- Counselor Routing Engine — DB Foundation (Phase 2 of spec PR #537)
-- ============================================================================
--
-- Spec: specs/admission-counselor-rules-engine-spec.md
-- Phase: 2 of 7 (DB foundation)
-- Date: 2026-04-27
--
-- Net new infrastructure for the counselor rules-engine:
--   1. admission_lead_sources_master   — CRUDable source catalog (10 system seed)
--   2. admission_counselor_institutions — many-to-many counselor → institutions
--   3. admission_counselor_sources      — many-to-many counselor → sources
--   4. admission_counselor_schedules    — day-level on/off + effective dates
--   5. admission_lead_cascade_history   — audit trail of off-duty reassignments
--
-- Plus 2 column adds on admission_counselors:
--   • emergency_off_today  BOOLEAN  — counselor's "I'm off NOW" flag (auto-clears at IST midnight via cron)
--   • emergency_off_set_at TIMESTAMPTZ — when the flag was set (for cascade-threshold timing)
--
-- Plus deprecation comment on admission_counselors.max_leads (Decision #11).
--
-- All RLS follows the standard pattern from CLAUDE.md:
--   is_super_admin() OR is_admin() OR (user_has_permission('...') AND role_has_institution_access(...))
--
-- Permission keys consumed by RLS policies (must exist in PERMISSION_CATEGORIES):
--   • admission.counselors.team.view   — Principal/HOD read, super_admin/admission/admission_staff R/W
--   • admission.counselors.team.manage — write authority
-- ============================================================================

-- ============================================================================
-- 1. SOURCE MASTER TABLE (CRUDable, 10 system seed)
-- ============================================================================

CREATE TABLE IF NOT EXISTS admission_lead_sources_master (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key           TEXT NOT NULL UNIQUE,
  label         TEXT NOT NULL,
  description   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  is_system     BOOLEAN NOT NULL DEFAULT false,
  display_order INT NOT NULL DEFAULT 100,
  institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,  -- NULL = global
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES profiles(id),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by    UUID REFERENCES profiles(id)
);

COMMENT ON TABLE admission_lead_sources_master IS
  'Canonical lead-source catalog. CRUDable via /users/role-management or admin UI. is_system=true rows cannot be hard-deleted (only deactivated via is_active=false). Decision #4 + #16 of specs/admission-counselor-rules-engine-spec.md.';

CREATE INDEX IF NOT EXISTS idx_lead_sources_master_active
  ON admission_lead_sources_master (is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_lead_sources_master_institution
  ON admission_lead_sources_master (institution_id) WHERE institution_id IS NOT NULL;

-- Seed 10 canonical sources (Decision #16)
INSERT INTO admission_lead_sources_master (key, label, description, is_system, display_order)
VALUES
  ('facebook_ad',      'Facebook Ads',           'Paid lead from Facebook ad campaign',                10, true),
  ('google_ad',        'Google Ads',             'Paid lead from Google search/display ad',            20, true),
  ('instagram_dm',     'Instagram DM',           'Direct message inbound on Instagram',                30, true),
  ('whatsapp_inbound', 'WhatsApp Inbound',       'Lead originated from WhatsApp message to college',   40, true),
  ('walk_in',          'Walk-In',                'Visited campus or office in person',                 50, true),
  ('phone_inbound',    'Phone Inbound',          'Inbound call to admission helpline',                 60, true),
  ('expo_event',       'Education Expo / Event', 'Captured at expo, school visit, or fair',            70, true),
  ('school_visit',     'School Visit',           'College team visited the lead''s school',            80, true),
  ('referral',         'Referral',               'Referred by alumnus, parent, or staff',              90, true),
  ('website_form',     'Website Form',           'Submitted enquiry/application form on jkkn.ai',     100, true)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 2. JUNCTION: counselor → institutions (many-to-many — Decision #9)
-- ============================================================================

CREATE TABLE IF NOT EXISTS admission_counselor_institutions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counselor_id    UUID NOT NULL REFERENCES admission_counselors(id) ON DELETE CASCADE,
  institution_id  UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES profiles(id),
  UNIQUE (counselor_id, institution_id)
);

COMMENT ON TABLE admission_counselor_institutions IS
  'Many-to-many: counselors can serve multiple institutions. Empty mapping = receives no leads (sane fail-closed default). Decision #9.';

CREATE INDEX IF NOT EXISTS idx_counselor_institutions_counselor
  ON admission_counselor_institutions (counselor_id);
CREATE INDEX IF NOT EXISTS idx_counselor_institutions_institution
  ON admission_counselor_institutions (institution_id);

-- ============================================================================
-- 3. JUNCTION: counselor → sources (many-to-many — Decision #9)
-- ============================================================================

CREATE TABLE IF NOT EXISTS admission_counselor_sources (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counselor_id UUID NOT NULL REFERENCES admission_counselors(id) ON DELETE CASCADE,
  source_id    UUID NOT NULL REFERENCES admission_lead_sources_master(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES profiles(id),
  UNIQUE (counselor_id, source_id)
);

COMMENT ON TABLE admission_counselor_sources IS
  'Many-to-many: counselors handle one or more lead sources. Routing engine uses this for PASS 1 (institution + source match). Decision #9 + #10.';

CREATE INDEX IF NOT EXISTS idx_counselor_sources_counselor
  ON admission_counselor_sources (counselor_id);
CREATE INDEX IF NOT EXISTS idx_counselor_sources_source
  ON admission_counselor_sources (source_id);

-- ============================================================================
-- 4. SCHEDULE TABLE (day-level on/off, effective-dated — Decisions #6, #8, #19)
-- ============================================================================

CREATE TABLE IF NOT EXISTS admission_counselor_schedules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  counselor_id    UUID NOT NULL REFERENCES admission_counselors(id) ON DELETE CASCADE,
  day_of_week     SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sun, 6=Sat (PG EXTRACT(DOW) convention)
  is_working      BOOLEAN NOT NULL,
  effective_from  DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to    DATE,                                                    -- NULL = open-ended
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES profiles(id),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

COMMENT ON TABLE admission_counselor_schedules IS
  'Day-level recurring schedule per counselor with effective date ranges. is_working=true rows are working days; rows can be pre-loaded for future schedule changes (effective_from in future). Decision #6 + #8 + #19.';

CREATE INDEX IF NOT EXISTS idx_counselor_schedules_counselor_dow
  ON admission_counselor_schedules (counselor_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_counselor_schedules_effective
  ON admission_counselor_schedules (effective_from, effective_to);

-- ============================================================================
-- 5. CASCADE HISTORY (audit log — Decisions #5, #14)
-- ============================================================================

CREATE TABLE IF NOT EXISTS admission_lead_cascade_history (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id            UUID NOT NULL REFERENCES admission_leads(id) ON DELETE CASCADE,
  from_counselor_id  UUID REFERENCES admission_counselors(id),
  to_counselor_id    UUID REFERENCES admission_counselors(id),  -- NULL = lead went to queue
  reason             TEXT NOT NULL,                              -- 'off_duty_threshold','manual_reassign','queue_flush','queued_no_match'
  cascaded_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  triggered_by       UUID REFERENCES profiles(id),               -- NULL = system/cron
  metadata           JSONB DEFAULT '{}'::jsonb
);

COMMENT ON TABLE admission_lead_cascade_history IS
  'Audit trail of lead reassignments. Powers handover banner on lead detail (Phase 6) + Activity tab on /admission/counselors/team (Phase 5). Decision #14.';

CREATE INDEX IF NOT EXISTS idx_cascade_history_lead
  ON admission_lead_cascade_history (lead_id, cascaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_cascade_history_from_counselor
  ON admission_lead_cascade_history (from_counselor_id, cascaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_cascade_history_to_counselor
  ON admission_lead_cascade_history (to_counselor_id, cascaded_at DESC);

-- ============================================================================
-- 6. COLUMN ADDITIONS to admission_counselors (Decisions #5, #11)
-- ============================================================================

ALTER TABLE admission_counselors
  ADD COLUMN IF NOT EXISTS emergency_off_today  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS emergency_off_set_at TIMESTAMPTZ;

COMMENT ON COLUMN admission_counselors.emergency_off_today IS
  'Counselor self-serve "I''m off NOW" flag. Cron at 00:00 IST clears it back to false. Decision #5 + #17 of admission-counselor-rules-engine-spec.md.';

COMMENT ON COLUMN admission_counselors.emergency_off_set_at IS
  'Timestamp when emergency_off_today was set true. Used by cascade engine to enforce 60-min threshold (Decision #5).';

-- Deprecation comment on max_leads (Decision #11 — no longer used by routing engine)
COMMENT ON COLUMN admission_counselors.max_leads IS
  'DEPRECATED 2026-04-27 — no longer used as a routing gate. Kept for display in dashboards. See specs/admission-counselor-rules-engine-spec.md decision #11.';

-- ============================================================================
-- 7. RLS POLICIES (standard MyJKKN pattern)
-- ============================================================================

-- Sources master — global read (everyone with admission view), institution-scoped write
ALTER TABLE admission_lead_sources_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_sources_master_select" ON admission_lead_sources_master
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR user_has_permission('admission.counselors.team.view')
  OR user_has_permission('admission.leads.view')
);

CREATE POLICY "lead_sources_master_modify" ON admission_lead_sources_master
FOR ALL USING (
  is_super_admin() OR is_admin()
  OR user_has_permission('admission.counselors.team.manage')
);

-- Counselor → institutions junction — Principal/HOD see their inst's mappings
ALTER TABLE admission_counselor_institutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "counselor_institutions_select" ON admission_counselor_institutions
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('admission.counselors.team.view')
    AND role_has_institution_access(institution_id)
  )
);

CREATE POLICY "counselor_institutions_modify" ON admission_counselor_institutions
FOR ALL USING (
  is_super_admin() OR is_admin()
  OR user_has_permission('admission.counselors.team.manage')
);

-- Counselor → sources junction — institution-scoped via parent counselor
ALTER TABLE admission_counselor_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "counselor_sources_select" ON admission_counselor_sources
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('admission.counselors.team.view')
    AND EXISTS (
      SELECT 1 FROM admission_counselors c
      WHERE c.id = admission_counselor_sources.counselor_id
        AND role_has_institution_access(c.institution_id)
    )
  )
);

CREATE POLICY "counselor_sources_modify" ON admission_counselor_sources
FOR ALL USING (
  is_super_admin() OR is_admin()
  OR user_has_permission('admission.counselors.team.manage')
);

-- Schedules — institution-scoped read, manage perm for write
ALTER TABLE admission_counselor_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "counselor_schedules_select" ON admission_counselor_schedules
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('admission.counselors.team.view')
    AND EXISTS (
      SELECT 1 FROM admission_counselors c
      WHERE c.id = admission_counselor_schedules.counselor_id
        AND role_has_institution_access(c.institution_id)
    )
  )
);

CREATE POLICY "counselor_schedules_modify" ON admission_counselor_schedules
FOR ALL USING (
  is_super_admin() OR is_admin()
  OR user_has_permission('admission.counselors.team.manage')
);

-- Cascade history — institution-scoped read, system-only write (NULL trigger = system)
ALTER TABLE admission_lead_cascade_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cascade_history_select" ON admission_lead_cascade_history
FOR SELECT USING (
  is_super_admin() OR is_admin()
  OR (
    user_has_permission('admission.counselors.team.view')
    AND EXISTS (
      SELECT 1 FROM admission_counselors c
      WHERE (c.id = admission_lead_cascade_history.from_counselor_id
             OR c.id = admission_lead_cascade_history.to_counselor_id)
        AND role_has_institution_access(c.institution_id)
    )
  )
);

CREATE POLICY "cascade_history_insert" ON admission_lead_cascade_history
FOR INSERT WITH CHECK (
  is_super_admin() OR is_admin()
  OR user_has_permission('admission.counselors.team.manage')
);

-- ============================================================================
-- VERIFICATION (run post-migration to confirm structure)
-- ============================================================================
-- SELECT table_name, COUNT(*) AS col_count
-- FROM information_schema.columns
-- WHERE table_schema='public'
--   AND table_name IN (
--     'admission_lead_sources_master',
--     'admission_counselor_institutions',
--     'admission_counselor_sources',
--     'admission_counselor_schedules',
--     'admission_lead_cascade_history'
--   )
-- GROUP BY table_name ORDER BY table_name;
--
-- SELECT key, label, is_system, display_order
-- FROM admission_lead_sources_master
-- ORDER BY display_order;
-- Expected: 10 rows, all is_system=true
-- ============================================================================
