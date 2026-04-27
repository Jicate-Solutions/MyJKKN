-- 20260427_backfill_counselor_id_via_lead_assignment.sql
-- Backfill admission_call_logs.counselor_id for historical inbound rows.
--
-- Context: Agent B's PR #435 wired counselor_id resolution into the cron and
-- webhook write paths, but only attributed 33/2089 (1.6%) inbound rows because:
--   - Signal 1 (lead.assigned_counselor_id): dead — only 1/1,104 leads assigned
--   - Signal 2 (AGENT_MAP email): ~75% miss rate due to email drift between
--     Exotel co-worker emails and MyJKKN profile emails
--
-- Agent F's call-attribution helper now has Signal 3 (profiles.phone_number
-- last-10-digit match), which forward-traffic uses. This backfill applies the
-- same three signals to historical inbound rows where counselor_id IS NULL.
--
-- Safe to re-run: only updates rows where counselor_id IS NULL.
-- Conservative: only fills when exactly one staff profile owns the dialed phone.
-- Idempotent: subsequent runs are no-ops once counselor_id is set.

BEGIN;

-- ── Signal 1: lead.assigned_counselor_id ──
-- For rows with a matched lead whose lead has an assigned counselor.
-- Currently fills 0 rows (no leads assigned), but kept for future-proofing.
UPDATE admission_call_logs acl
   SET counselor_id = al.assigned_counselor_id,
       updated_at   = now()
  FROM admission_leads al
 WHERE acl.lead_id = al.id
   AND acl.direction = 'inbound'
   AND acl.counselor_id IS NULL
   AND al.assigned_counselor_id IS NOT NULL;

-- ── Signal 3: profiles.phone_number last-10-digit match ──
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
      'cao', 'ceo', 'coo', 'hr_admin', 'staff'
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
