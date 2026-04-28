-- ============================================================================
-- 20260428_phase7_counselor_seeds_and_source_alignment.sql
-- Phase 7 of admission counselor rules-engine spec (PR #537)
-- ============================================================================
--
-- Activates Tier 1+2 routing in fn_auto_assign_counselor_v2 by populating:
--   A. admission_lead_sources_master — 12 enum-aligned keys (closes misalignment
--      identified in PR #549: only 2 of 12 lead_source enum values matched a master row)
--   B. admission_counselor_schedules — 4 counselors × 7 days = 28 rows (Mon–Sun on-duty)
--   C. admission_counselor_institutions — 4 rows (one per active counselor)
--   D. admission_counselor_sources — ~48 rows (4 counselors × all active sources)
--
-- Idempotent: ON CONFLICT DO NOTHING + NOT EXISTS guards throughout.
-- Reversible: all inserts are additive; TRUNCATE each junction table to revert.
-- Does NOT: modify functions, UI, or existing master rows (only INSERT … ON CONFLICT DO NOTHING).
-- ============================================================================

-- ============================================================================
-- PART A: Align admission_lead_sources_master.key to lead_source enum values
-- ============================================================================
--
-- The lead_source enum has 12 values:
--   website, walk_in, referral, social_media, newspaper, education_fair,
--   agent, publisher, google_ads, facebook_ads, other, inbound_call
--
-- Existing master keys (10 rows from Phase 2):
--   facebook_ad, google_ad, instagram_dm, whatsapp_inbound, walk_in,
--   phone_inbound, expo_event, school_visit, referral, website_form
--
-- Only walk_in and referral overlapped. This block inserts the 10 missing
-- enum-aligned keys. 'walk_in' and 'referral' will hit ON CONFLICT and be skipped.
-- Net new rows: 10 (12 inserted - 2 collisions).
--
-- Unique constraint: admission_lead_sources_master.key TEXT NOT NULL UNIQUE
-- (declared inline on CREATE TABLE in 20260427_counselor_routing_db_foundation.sql)
-- No ALTER TABLE needed — ON CONFLICT (key) DO NOTHING is valid as-is.
-- ============================================================================

INSERT INTO admission_lead_sources_master
  (key, label, description, is_active, is_system, display_order, institution_id, created_by)
VALUES
  ('website',        'Website Form',   'Lead from main website contact form',                 true, true,  1, NULL, NULL),
  ('walk_in',        'Walk-in',        'In-person visit to admission office',                 true, true,  2, NULL, NULL),
  ('referral',       'Referral',       'Referral from existing student/parent/staff',         true, true,  3, NULL, NULL),
  ('social_media',   'Social Media',   'Generic social media (non-paid) lead',                true, true,  4, NULL, NULL),
  ('newspaper',      'Newspaper Ad',   'Print newspaper advertising',                         true, true,  5, NULL, NULL),
  ('education_fair', 'Education Fair', 'Education fair / expo event',                         true, true,  6, NULL, NULL),
  ('agent',          'Agent',          'Lead via authorized education agent',                 true, true,  7, NULL, NULL),
  ('publisher',      'Publisher',      'Lead via publisher/lead-aggregator partner',          true, true,  8, NULL, NULL),
  ('google_ads',     'Google Ads',     'Paid Google Ads campaign',                            true, true,  9, NULL, NULL),
  ('facebook_ads',   'Facebook Ads',   'Paid Facebook Ads campaign',                         true, true, 10, NULL, NULL),
  ('other',          'Other',          'Source not in canonical list — admin classify later', true, true, 11, NULL, NULL),
  ('inbound_call',   'Inbound Call',   'Phone call to admission line',                        true, true, 12, NULL, NULL)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- PART B: Seed default 7-day on-duty schedule for all 4 active counselors
-- ============================================================================
--
-- Spec Decision #6 + #8 + #19:
--   - Admin authority only; counselor is read-only on their schedule.
--   - Granularity: day-level only (0=Sun through 6=Sat).
--   - Schedule rows have effective_from + effective_to (NULL = open-ended).
--
-- Default: all 4 active admission counselors are on-duty all 7 days.
-- Admin can narrow via the Roster tab in /admission/counselors/team (Phase 5).
--
-- Guard: NOT EXISTS prevents duplicate rows if this migration runs twice.
-- Expected result: 4 counselors × 7 days = 28 rows inserted.
-- ============================================================================

INSERT INTO admission_counselor_schedules
  (counselor_id, day_of_week, is_working, effective_from, effective_to, created_by)
SELECT
  c.id,
  dow,
  TRUE,
  CURRENT_DATE,
  NULL,
  NULL
FROM admission_counselors c
CROSS JOIN generate_series(0, 6) AS dow
WHERE c.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM admission_counselor_schedules s
    WHERE s.counselor_id = c.id
      AND s.day_of_week = dow
  );

-- ============================================================================
-- PART C: Seed admission_counselor_institutions — each counselor to their own institution
-- ============================================================================
--
-- Spec Decision #9: many-to-many junction. Initial seed maps each counselor to the
-- institution already on their admission_counselors.institution_id FK.
-- Admin can extend cross-institution access via Allocation tab (Phase 5).
--
-- Guard: institution_id IS NOT NULL (skip counselors with no institution FK yet).
-- Guard: UNIQUE (counselor_id, institution_id) constraint handles idempotency via
--        the NOT EXISTS subquery (explicit to avoid relying on constraint error).
-- Expected result: 4 rows (one per active counselor with a non-null institution_id).
-- ============================================================================

INSERT INTO admission_counselor_institutions
  (counselor_id, institution_id, created_by)
SELECT
  c.id,
  c.institution_id,
  NULL
FROM admission_counselors c
WHERE c.is_active = TRUE
  AND c.institution_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM admission_counselor_institutions ci
    WHERE ci.counselor_id = c.id
      AND ci.institution_id = c.institution_id
  );

-- ============================================================================
-- PART D: Seed admission_counselor_sources — each counselor handles ALL active sources
-- ============================================================================
--
-- Spec Decision #9 + #10:
--   Broad initial mapping: every active counselor handles every active source.
--   Tier-1 routing (institution AND source match) now fires for all 4 counselors
--   across all 12+ sources.
--   Admin can narrow via Allocation tab in /admission/counselors/team (Phase 5).
--
-- Guard: NOT EXISTS prevents duplicate (counselor_id, source_id) pairs.
-- Expected result: 4 counselors × (count of is_active master rows) ≈ 88 rows
--   (10 original + 10 new non-conflicting = 20 active sources at execution time,
--    but exact count depends on how many of the 12 new rows inserted above vs collided).
-- ============================================================================

INSERT INTO admission_counselor_sources
  (counselor_id, source_id, created_by)
SELECT
  c.id,
  m.id,
  NULL
FROM admission_counselors c
CROSS JOIN admission_lead_sources_master m
WHERE c.is_active = TRUE
  AND m.is_active = TRUE
  AND NOT EXISTS (
    SELECT 1
    FROM admission_counselor_sources cs
    WHERE cs.counselor_id = c.id
      AND cs.source_id = m.id
  );

-- ============================================================================
-- Verification queries (run post-apply to confirm expected counts)
-- ============================================================================
--
-- SELECT COUNT(*) FROM admission_lead_sources_master;
--   Expect: 20 (10 original + 10 new; walk_in + referral already existed = 2 conflicts)
--
-- SELECT COUNT(*) FROM admission_counselor_schedules;
--   Expect: 28 (4 counselors × 7 days)
--
-- SELECT COUNT(*) FROM admission_counselor_institutions;
--   Expect: 4 (one per active counselor, assuming all 4 have institution_id set)
--
-- SELECT COUNT(*) FROM admission_counselor_sources;
--   Expect: 4 × 20 = 80 rows
-- ============================================================================
