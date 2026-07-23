-- ──────────────────────────────────────────────────────────────
-- Migration K: Bubble re-captured leads to the top of the leads list
--
-- 1. bump_lead_last_activity() trigger fires AFTER INSERT on
--    admission_lead_source_captures, regardless of source — so walk-in,
--    gate-entry, web, expo and campaign captures all bump the parent
--    lead's last_activity_at field.
-- 2. Backfill: every existing lead gets last_activity_at set to the
--    GREATEST of (created_at, latest source_capture).
-- 3. Index on (institution_id, last_activity_at DESC) so the leads-list
--    default sort hits an index instead of doing a sort over all rows.
-- ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION bump_lead_last_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE admission_leads
     SET last_activity_at = GREATEST(
           COALESCE(last_activity_at, created_at),
           COALESCE(NEW.captured_at, now())
         ),
         updated_at = now()
   WHERE id = NEW.lead_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_lead_last_activity ON admission_lead_source_captures;
CREATE TRIGGER trg_bump_lead_last_activity
AFTER INSERT ON admission_lead_source_captures
FOR EACH ROW EXECUTE FUNCTION bump_lead_last_activity();

UPDATE admission_leads l
   SET last_activity_at = sub.activity
  FROM (
    SELECT
      al.id,
      GREATEST(
        al.created_at,
        COALESCE((
          SELECT MAX(captured_at)
            FROM admission_lead_source_captures
           WHERE lead_id = al.id
        ), al.created_at)
      ) AS activity
    FROM admission_leads al
  ) sub
 WHERE l.id = sub.id
   AND (l.last_activity_at IS DISTINCT FROM sub.activity);

CREATE INDEX IF NOT EXISTS idx_admission_leads_inst_last_activity
  ON admission_leads (institution_id, last_activity_at DESC);
