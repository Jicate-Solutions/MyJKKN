-- Updated: 2026-07-15 - Learners Council: return an announcement draft to its author.
--
-- Any Council member may DRAFT an announcement; only office bearers may SUBMIT it (enforced
-- in 20260714160000_lc_executive_gates_and_cross_institution.sql). That left drafts an
-- office bearer did NOT want to send with nowhere to go -- they sat forever and the author
-- never heard back. This adds a "returned" state: an office bearer sends the draft back with
-- a reason, the author is notified, fixes it, and puts it back in the queue.
--
-- lc_announcements.status is a varchar with no DB-level enum constraint, so 'returned' is
-- already a legal value; this migration adds the reason/provenance columns and extends the
-- publish-guard trigger to also gate the return action to office bearers.

ALTER TABLE lc_announcements
  ADD COLUMN IF NOT EXISTS return_reason text,
  ADD COLUMN IF NOT EXISTS returned_by  uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS returned_at  timestamptz;

COMMENT ON COLUMN lc_announcements.return_reason IS
  'Why an office bearer sent this draft back to its author. Shown to the author so they can fix and resubmit.';

-- Extend the existing guard: publish is office-bearers-only (unchanged), AND now the
-- transition into 'returned' is office-bearers-only too, with returned_by/at stamped from
-- the real session rather than trusted from the client.
CREATE OR REPLACE FUNCTION public.fn_lc_announcement_guard_publish()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Service-role / superuser context (auth.uid() IS NULL) bypasses RLS; leave it alone.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Publishing: office bearers (or super admin) only. Stamp real reviewer/publish time.
  IF NEW.status::text = 'published'
     AND (TG_OP = 'INSERT' OR OLD.status::text IS DISTINCT FROM 'published')
  THEN
    IF NOT (is_super_admin() OR fn_is_lc_executive()) THEN
      RAISE EXCEPTION
        'Only Learners Council office bearers (President, Vice President, Secretary, Treasurer) can submit an announcement. You can save it as a draft for one of them to submit.'
        USING ERRCODE = '42501';
    END IF;
    NEW.reviewed_by  := auth.uid();
    NEW.reviewed_at  := COALESCE(NEW.reviewed_at, now());
    NEW.published_at := COALESCE(NEW.published_at, now());
  END IF;

  -- Returning a draft to its author: office bearers (or super admin) only. Stamp who/when.
  IF NEW.status::text = 'returned'
     AND (TG_OP = 'INSERT' OR OLD.status::text IS DISTINCT FROM 'returned')
  THEN
    IF NOT (is_super_admin() OR fn_is_lc_executive()) THEN
      RAISE EXCEPTION
        'Only Learners Council office bearers can send an announcement back to its author.'
        USING ERRCODE = '42501';
    END IF;
    NEW.returned_by := auth.uid();
    NEW.returned_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger already exists (BEFORE INSERT OR UPDATE) from the earlier migration; replacing the
-- function above is enough. Re-assert defensively in case this runs on a fresh database.
DROP TRIGGER IF EXISTS trg_lc_announcement_guard_publish ON lc_announcements;
CREATE TRIGGER trg_lc_announcement_guard_publish
BEFORE INSERT OR UPDATE ON lc_announcements
FOR EACH ROW EXECUTE FUNCTION public.fn_lc_announcement_guard_publish();
