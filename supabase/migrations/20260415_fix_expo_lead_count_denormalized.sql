-- ============================================================
-- Fix: expo_events.total_leads_collected drifted to 0 despite real leads
-- Date:    2026-04-15
-- Bug:     BUG-003253 — leads are not updated in the screens even though
--          leads are there inside the expo event, it shows zero
--
-- Context:
--   The expo events list (/admission/marketing/expos) reads the
--   `expo_events.total_leads_collected` column to render the "Leads"
--   column. Production has expo rows with real linked leads (344, 175,
--   166, 134, ...) but `total_leads_collected` is 0 on every row because
--   nothing was incrementing the counter when leads were captured into
--   `admission_leads` with an `expo_event_id`. Every expo was showing 0.
--
-- Fix:
--   1. Add a trigger on admission_leads that maintains
--      expo_events.total_leads_collected on INSERT/UPDATE/DELETE.
--   2. Backfill the column from the current JOIN count so existing rows
--      show the right number immediately after migration.
--
-- Trade-offs:
--   • Small write amplification on admission_leads (one extra UPDATE per
--     lead insert targeting its expo_event_id). Acceptable because the
--     UPDATE is keyed by PK and only affects one row.
--   • No new RLS policy needed — the trigger runs as SECURITY DEFINER
--     equivalent via the normal trigger path; it only UPDATEs a counter
--     column on a parent the user already has visibility to.
-- ============================================================

-- 1. Trigger function
CREATE OR REPLACE FUNCTION public.maintain_expo_event_lead_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- On INSERT: bump the counter for the linked expo
  IF TG_OP = 'INSERT' THEN
    IF NEW.expo_event_id IS NOT NULL THEN
      UPDATE public.expo_events
      SET total_leads_collected = COALESCE(total_leads_collected, 0) + 1,
          updated_at = now()
      WHERE id = NEW.expo_event_id;
    END IF;
    RETURN NEW;
  END IF;

  -- On DELETE: decrement the counter for the previously-linked expo
  IF TG_OP = 'DELETE' THEN
    IF OLD.expo_event_id IS NOT NULL THEN
      UPDATE public.expo_events
      SET total_leads_collected = GREATEST(COALESCE(total_leads_collected, 0) - 1, 0),
          updated_at = now()
      WHERE id = OLD.expo_event_id;
    END IF;
    RETURN OLD;
  END IF;

  -- On UPDATE of expo_event_id (lead reassigned or linked/unlinked):
  -- decrement the old, increment the new. No-op if the FK hasn't changed.
  IF TG_OP = 'UPDATE' THEN
    IF OLD.expo_event_id IS DISTINCT FROM NEW.expo_event_id THEN
      IF OLD.expo_event_id IS NOT NULL THEN
        UPDATE public.expo_events
        SET total_leads_collected = GREATEST(COALESCE(total_leads_collected, 0) - 1, 0),
            updated_at = now()
        WHERE id = OLD.expo_event_id;
      END IF;
      IF NEW.expo_event_id IS NOT NULL THEN
        UPDATE public.expo_events
        SET total_leads_collected = COALESCE(total_leads_collected, 0) + 1,
            updated_at = now()
        WHERE id = NEW.expo_event_id;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.maintain_expo_event_lead_count IS
  'Maintains expo_events.total_leads_collected denormalized counter as admission_leads rows are inserted/deleted/reassigned. Added for BUG-003253 on 2026-04-15.';

-- 2. Trigger (idempotent)
DROP TRIGGER IF EXISTS trg_maintain_expo_event_lead_count ON public.admission_leads;

CREATE TRIGGER trg_maintain_expo_event_lead_count
AFTER INSERT OR UPDATE OF expo_event_id OR DELETE ON public.admission_leads
FOR EACH ROW
EXECUTE FUNCTION public.maintain_expo_event_lead_count();

-- 3. Backfill existing rows from the live JOIN count.
-- This fixes the 2,346+ leads already captured across hundreds of expos
-- where the counter is currently 0 despite real data.
UPDATE public.expo_events e
SET total_leads_collected = sub.lead_count,
    updated_at = now()
FROM (
  SELECT expo_event_id, COUNT(*)::integer AS lead_count
  FROM public.admission_leads
  WHERE expo_event_id IS NOT NULL
  GROUP BY expo_event_id
) sub
WHERE e.id = sub.expo_event_id
  AND (e.total_leads_collected IS NULL OR e.total_leads_collected <> sub.lead_count);

-- 4. Also set any expo with no leads to 0 (not NULL) so UI never reads NULL
UPDATE public.expo_events
SET total_leads_collected = 0,
    updated_at = now()
WHERE total_leads_collected IS NULL;
