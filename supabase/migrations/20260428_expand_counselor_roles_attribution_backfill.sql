-- 20260428_expand_counselor_roles_attribution_backfill.sql
-- Expand STAFF_ROLES whitelist on the historical attribution backfill to
-- include the new counselor taxonomy added by PRs #528 and #538.
--
-- Companion to lib/services/telephony/call-attribution.ts STAFF_ROLES
-- expansion in this PR (fix/counselor-attribution-staff-roles-expansion).
--
-- Why this migration exists:
--   PR #523 introduced Signal 3 (profiles.phone_number last-10-digit match)
--   gated by a STAFF_ROLES whitelist. The whitelist was frozen before the
--   new counselor taxonomy landed (PR #528 additive seed, PR #538 14-user
--   reassignment 2026-04-27). All 4 active admission_counselors profiles
--   carry one of the new role values:
--     - 3x learner_counselor
--     - 1x staff_counselor
--   so the previous whitelist filtered them out of Signal 3 entirely.
--
-- New roles added (alphabetised):
--   - counselor
--   - health_counselor
--   - learner_counselor
--   - staff_counselor
--
-- Empirical impact (measured pre-migration via Supabase MCP probe):
--   - Pre  : 129 / 2,184 inbound rows attributed (5.91%)
--   - Probe: 189 historical unattributed rows would attribute under the
--            expanded whitelist, projecting 14.6% post-migration.
--
-- Idempotency contract:
--   - Wrapped in a single BEGIN/COMMIT for atomicity.
--   - UPDATE only touches admission_call_logs rows where counselor_id IS NULL.
--   - HAVING COUNT(*) = 1 guarantees we never attribute when two staff
--     profiles share the dialed phone (ambiguous → leave NULL for human).
--   - Safe to re-run: subsequent runs are no-ops once counselor_id is set.
--
-- This migration does NOT solve the queue-number bucket (~712 inbound rows
-- where to_number is an Exotel virtual queue, not the answering agent).
-- That requires DialWhomNumber preservation in the webhook payload, tracked
-- as a separate spike.

BEGIN;

-- Signal 3 backfill with expanded STAFF_ROLES whitelist.
-- For rows where the dialed phone (to_number) exactly matches a single
-- staff-role profile by last 10 digits. Skips ambiguous matches.
WITH staff_phones AS (
  SELECT
    p.id AS profile_id,
    RIGHT(regexp_replace(coalesce(p.phone_number, ''), '\D', '', 'g'), 10) AS last10
  FROM profiles p
  WHERE p.phone_number IS NOT NULL
    AND p.role IN (
      'admission', 'admission_counselor', 'admission_staff',
      'admin', 'super_admin', 'administrator', 'executive_admin_officer',
      'faculty', 'hod', 'principal',
      'accounts', 'accountant_assistant',
      'cao', 'ceo', 'coo', 'hr_admin', 'staff',
      -- New counselor taxonomy (PRs #528/#538 — 2026-04-27):
      'counselor', 'learner_counselor', 'staff_counselor', 'health_counselor'
    )
    AND length(regexp_replace(coalesce(p.phone_number, ''), '\D', '', 'g')) >= 10
),
unique_phone_owners AS (
  -- Only attribute when exactly one staff profile owns the phone — skip
  -- ambiguous matches to avoid attributing to the wrong person.
  SELECT last10, (array_agg(profile_id))[1] AS profile_id
    FROM staff_phones
   GROUP BY last10
  HAVING COUNT(*) = 1
),
calls_to_attribute AS (
  SELECT
    acl.id AS call_id,
    upo.profile_id
  FROM admission_call_logs acl
  JOIN unique_phone_owners upo
    ON upo.last10 = RIGHT(regexp_replace(coalesce(acl.to_number, ''), '\D', '', 'g'), 10)
  WHERE acl.direction = 'inbound'
    AND acl.counselor_id IS NULL
    AND acl.to_number IS NOT NULL
    AND length(regexp_replace(coalesce(acl.to_number, ''), '\D', '', 'g')) >= 10
)
UPDATE admission_call_logs acl
   SET counselor_id = cta.profile_id,
       updated_at   = now()
  FROM calls_to_attribute cta
 WHERE acl.id = cta.call_id;

COMMIT;
